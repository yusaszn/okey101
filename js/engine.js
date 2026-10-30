/* Okey 101 — oyun motoru (yalnızca oda kurucusunda çalışır, tek doğru kaynak) */
(function (root) {
  'use strict';
  const R = typeof module !== 'undefined' && module.exports ? require('./rules.js') : root.OkeyRules;

  class GameError extends Error {}
  const fail = (m) => { throw new GameError(m); };

  function shuffle(a) {
    for (let i = a.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
  }

  class Game {
    constructor(names) {
      this.players = names.map(name => ({ name, total: 0, hand: [], opened: false, openType: null, discards: [], penalty: 0 }));
      this.round = 0;
      this.dealer = Math.floor(Math.random() * 4);
      this.status = 'idle';
      this.log = [];
      this.history = [];
      this.result = null;
      this.table = [];
      this.pile = [];
    }

    note(msg) {
      this.log.push(msg);
      if (this.log.length > 60) this.log.shift();
    }

    startRound() {
      if (this.round > 0) this.dealer = (this.dealer + 1) % 4;
      this.round++;
      const ids = shuffle(Array.from({ length: R.TILE_COUNT }, (_, i) => i));
      this.indicator = ids.splice(ids.findIndex(id => id < 104), 1)[0];
      this.okey = R.okeyFromIndicator(this.indicator);
      for (const p of this.players) Object.assign(p, { hand: [], opened: false, openType: null, discards: [], penalty: 0 });
      for (let k = 0; k < 4; k++) this.players[(this.dealer + k) % 4].hand = ids.splice(0, k === 0 ? 22 : 21);
      this.pile = ids;
      this.table = [];
      this.groupSeq = 0;
      this.turn = this.dealer;
      this.phase = 'play';          // dağıtan 22 taşla başlar, direkt taş atar
      this.mustUse = null;          // yerden alınan, bu tur kullanılması gereken taş
      this.lastDrawn = null;
      this.status = 'playing';
      this.result = null;
      this.note(`— ${this.round}. el başladı. ${this.players[this.dealer].name} başlıyor. Okey: ${R.tileName(R.okeyTileId(this.okey))}`);
    }

    apply(seat, a) {
      if (this.status !== 'playing') fail('El devam etmiyor.');
      if (seat !== this.turn) fail('Sıra sende değil.');
      if (!a || typeof a !== 'object') fail('Geçersiz hamle.');
      const p = this.players[seat];
      if (a.type === 'draw') return this._draw(seat, p, a.from);
      if (this.phase !== 'play') fail('Önce taş çekmelisin.');
      switch (a.type) {
        case 'open': return this._open(seat, p, a.groups, a.mode);
        case 'lay': return this._lay(seat, p, a.groups);
        case 'add': return this._add(seat, p, a.groupId, a.tiles);
        case 'giveBack': return this._giveBack(seat, p);
        case 'discard': return this._discard(seat, p, a.tile);
        default: fail('Bilinmeyen hamle.');
      }
    }

    // ---- yardımcılar ----
    _checkOwned(p, ids) {
      if (!Array.isArray(ids) || !ids.length) fail('Taş seçmedin.');
      const seen = new Set();
      for (const id of ids) {
        if (!Number.isInteger(id) || seen.has(id) || !p.hand.includes(id)) fail('Bu taş elinde yok.');
        seen.add(id);
      }
    }

    _checkGroups(p, groups) {
      if (!Array.isArray(groups) || !groups.length) fail('İndirilecek per yok.');
      for (const g of groups) if (!Array.isArray(g)) fail('Geçersiz per.');
      const all = groups.flat();
      this._checkOwned(p, all);
      if (all.length >= p.hand.length) fail('Atmak için elinde en az 1 taş kalmalı.');
    }

    _validateGroups(groups, mode) {
      if (mode === 'pairs') {
        return groups.map(g => {
          if (!R.isPair(g, this.okey)) fail('Geçersiz çift: ' + g.map(id => R.tileName(id)).join(', '));
          return { kind: 'pair', tiles: g.slice(), value: 0 };
        });
      }
      return groups.map(g => {
        const r = R.analyzeGroup(g, this.okey);
        if (!r) fail('Geçersiz per: ' + g.map(id => R.tileName(id)).join(', '));
        return { kind: r.type, tiles: r.order, value: r.value };
      });
    }

    _remove(p, ids) {
      const s = new Set(ids);
      p.hand = p.hand.filter(id => !s.has(id));
    }

    _place(seat, list) {
      for (const g of list) this.table.push({ id: ++this.groupSeq, owner: seat, kind: g.kind, tiles: g.tiles });
    }

    // ---- hamleler ----
    _draw(seat, p, from) {
      if (this.phase !== 'draw') fail('Bu tur zaten taş aldın.');
      let id;
      if (from === 'discard') {
        const prev = this.players[(seat + 3) % 4];
        if (!prev.discards.length) fail('Yerde alınacak taş yok.');
        id = prev.discards.pop();
        this.mustUse = id;
        this.note(`${p.name} yerden ${R.tileName(id, this.okey)} aldı.`);
      } else {
        if (!this.pile.length) fail('Deste bitti.');
        id = this.pile.pop();
      }
      p.hand.push(id);
      this.lastDrawn = id;
      this.phase = 'play';
    }

    _open(seat, p, groups, mode) {
      if (p.opened) fail('Elini zaten açtın.');
      mode = mode === 'pairs' ? 'pairs' : 'series';
      this._checkGroups(p, groups);
      const list = this._validateGroups(groups, mode);
      if (mode === 'pairs') {
        if (list.length < R.OPEN_PAIRS_MIN) fail(`Çiftten açmak için en az ${R.OPEN_PAIRS_MIN} çift gerekli (${list.length} var).`);
      } else {
        const sum = list.reduce((s, g) => s + g.value, 0);
        if (sum < R.OPEN_SERIES_MIN) fail(`Perlerin toplamı ${sum}. Açmak için en az ${R.OPEN_SERIES_MIN} gerekli.`);
      }
      this._remove(p, groups.flat());
      this._place(seat, list);
      p.opened = true;
      p.openType = mode;
      const sum = list.reduce((s, g) => s + g.value, 0);
      this.note(mode === 'pairs' ? `${p.name} ${list.length} çiftle elini açtı!` : `${p.name} ${sum} ile elini açtı!`);
    }

    _lay(seat, p, groups) {
      if (!p.opened) fail('Önce elini açmalısın.');
      this._checkGroups(p, groups);
      const list = this._validateGroups(groups, p.openType);
      this._remove(p, groups.flat());
      this._place(seat, list);
      this.note(`${p.name} yere ${list.length} per indirdi.`);
    }

    _add(seat, p, groupId, tiles) {
      if (!p.opened) fail('İşlemek için önce elini açmalısın.');
      const g = this.table.find(x => x.id === groupId);
      if (!g) fail('Per bulunamadı.');
      this._checkOwned(p, tiles);
      if (g.kind === 'pair') fail('Çiftlere taş işlenemez.');
      if (tiles.length >= p.hand.length) fail('Atmak için elinde en az 1 taş kalmalı.');
      const owner = this.players[g.owner].name;
      const r = R.analyzeGroup(g.tiles.concat(tiles), this.okey);
      if (r) {
        g.tiles = r.order;
        g.kind = r.type;
        this._remove(p, tiles);
        this.note(`${p.name}, ${owner} perine ${tiles.map(id => R.tileName(id, this.okey)).join(', ')} işledi.`);
        return;
      }
      // Okey alma: yerdeki okeyin yerine gerçek taşı koy
      if (tiles.length === 1) {
        for (const w of g.tiles.filter(id => R.isWild(id, this.okey))) {
          const r2 = R.analyzeGroup(g.tiles.map(id => (id === w ? tiles[0] : id)), this.okey);
          if (r2) {
            g.tiles = r2.order;
            g.kind = r2.type;
            this._remove(p, tiles);
            p.hand.push(w);
            this.note(`${p.name}, ${owner} perindeki okeyi aldı!`);
            return;
          }
        }
      }
      fail('Bu taş bu pere işlenemez.');
    }

    _giveBack(seat, p) {
      if (this.mustUse === null || !p.hand.includes(this.mustUse)) fail('Geri verilecek taş yok.');
      this._remove(p, [this.mustUse]);
      this.players[(seat + 3) % 4].discards.push(this.mustUse);
      p.penalty += 101;
      this.mustUse = null;
      this.lastDrawn = null;
      this.phase = 'draw';
      this.note(`${p.name} yerden aldığı taşı kullanamadı, geri verdi (+101 ceza).`);
    }

    _discard(seat, p, id) {
      this._checkOwned(p, [id]);
      if (this.mustUse !== null && p.hand.includes(this.mustUse)) {
        fail('Yerden aldığın taşı bu tur kullanmalısın (açarak ya da işleyerek). Kullanamıyorsan "Geri Ver" (101 ceza).');
      }
      this._remove(p, [id]);
      p.discards.push(id);
      this.lastDrawn = null;
      this.mustUse = null;
      this.note(`${p.name} ${R.tileName(id, this.okey)} attı.`);
      if (!p.hand.length) return this._endRound(seat, R.isWild(id, this.okey));
      if (!this.pile.length) return this._endRound(null, false);
      this.turn = (seat + 1) % 4;
      this.phase = 'draw';
    }

    // Puanlama: bitiren -101 (okey atarak -202). Açmayan 202, açan elindeki taşların toplamı.
    // Okey atarak ya da çiftten bitirilirse diğerlerinin cezası 2 katı (ikisi birden 4 katı).
    _endRound(winner, okeyFinish) {
      const scores = [0, 0, 0, 0];
      let mult = 1, reason;
      if (winner !== null) {
        const w = this.players[winner];
        const pairs = w.openType === 'pairs';
        if (okeyFinish) mult *= 2;
        if (pairs) mult *= 2;
        scores[winner] = okeyFinish ? -202 : -101;
        reason = `${w.name} bitirdi!` + (okeyFinish ? ' Okey atarak bitti.' : '') + (pairs ? ' Çiftten bitti.' : '') +
          (mult > 1 ? ` Cezalar ${mult} katı.` : '');
      } else {
        reason = 'Deste bitti, kimse bitiremedi.';
      }
      this.players.forEach((p, i) => {
        if (i !== winner) scores[i] = (p.opened ? R.handValue(p.hand, this.okey) : 202) * mult;
        scores[i] += p.penalty;
        p.total += scores[i];
      });
      this.result = {
        winner, reason, scores, mult,
        opened: this.players.map(p => p.opened),
        hands: this.players.map(p => p.hand.slice()),
        penalties: this.players.map(p => p.penalty),
      };
      this.history.push(scores);
      this.status = 'roundEnd';
      this.note(reason);
    }

    viewFor(seat) {
      const me = this.players[seat];
      const mine = seat === this.turn;
      return {
        status: this.status, round: this.round, dealer: this.dealer, turn: this.turn, phase: this.phase,
        you: seat, okey: this.okey, indicator: this.indicator, pileCount: this.pile.length,
        hand: me.hand.slice(),
        mustUse: mine ? this.mustUse : null,
        lastDrawn: mine ? this.lastDrawn : null,
        players: this.players.map(p => ({
          name: p.name, total: p.total, count: p.hand.length, opened: p.opened,
          openType: p.openType, discards: p.discards.slice(), penalty: p.penalty,
        })),
        table: this.table.map(g => ({ id: g.id, owner: g.owner, kind: g.kind, tiles: g.tiles.slice() })),
        log: this.log.slice(-30),
        history: this.history.map(h => h.slice()),
        result: this.result,
      };
    }

    // ---- bot ----
    botTurn(seat) {
      if (this.status !== 'playing' || this.turn !== seat) return;
      const p = this.players[seat], ok = this.okey;
      const tryDo = (a) => {
        try { this.apply(seat, a); return true; }
        catch (e) { if (e instanceof GameError) return false; throw e; }
      };
      const leaveOne = (groups) => {
        groups = groups.slice();
        while (groups.length && groups.flat().length >= p.hand.length) groups.pop();
        return groups;
      };

      if (this.phase === 'play' && this.mustUse !== null && p.hand.includes(this.mustUse) && !p.opened) tryDo({ type: 'giveBack' });
      if (this.phase === 'draw') tryDo({ type: 'draw', from: 'pile' });
      if (this.phase !== 'play' || this.status !== 'playing') return;

      if (!p.opened) {
        const groups = leaveOne(R.findBestGroups(p.hand, ok).groups);
        const sum = groups.reduce((s, g) => s + R.analyzeGroup(g, ok).value, 0);
        if (sum >= R.OPEN_SERIES_MIN) tryDo({ type: 'open', mode: 'series', groups });
        else {
          const pairs = leaveOne(R.findPairs(p.hand, ok));
          if (pairs.length >= R.OPEN_PAIRS_MIN + 1) tryDo({ type: 'open', mode: 'pairs', groups: pairs });
        }
      }
      if (p.opened) {
        const groups = leaveOne(p.openType === 'pairs' ? R.findPairs(p.hand, ok) : R.findBestGroups(p.hand, ok).groups);
        if (groups.length) tryDo({ type: 'lay', groups });
        let progress = true;
        while (progress && p.hand.length > 1) {
          progress = false;
          for (const id of p.hand.slice()) {
            if (p.hand.length <= 1) break;
            if (R.isWild(id, ok)) continue;
            for (const g of this.table) {
              if (g.kind !== 'pair' && tryDo({ type: 'add', groupId: g.id, tiles: [id] })) { progress = true; break; }
            }
          }
        }
      }
      if (this.mustUse !== null && p.hand.includes(this.mustUse)) {
        tryDo({ type: 'giveBack' });
        tryDo({ type: 'draw', from: 'pile' });
      }

      // Atılacak taş: perlerde olmayan, komşusu en az, sayısı en büyük
      const keep = new Set(R.findBestGroups(p.hand, ok).groups.flat());
      const joker = (id) => R.isWild(id, ok) || R.tileInfo(id).fake;
      let pool = p.hand.filter(id => !keep.has(id) && !joker(id));
      if (!pool.length) pool = p.hand.filter(id => !joker(id));
      if (!pool.length) pool = p.hand.slice();
      const score = (id) => {
        const e = R.eff(id, ok);
        let nb = 0;
        for (const o of p.hand) {
          if (o === id) continue;
          if (R.isWild(o, ok)) continue;
          const f = R.eff(o, ok);
          if ((f.n === e.n && f.c !== e.c) || (f.c === e.c && Math.abs(f.n - e.n) <= 2 && f.n !== e.n)) nb++;
        }
        return nb * 100 - e.n;
      };
      pool.sort((a, b) => score(a) - score(b));
      tryDo({ type: 'discard', tile: pool[0] });
    }
  }

  const api = { Game, GameError };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.OkeyEngine = api;
})(this);
