/* Pis Yedili — 2-4 kişi, 52'lik iskambil destesi
   7: sıradaki 3 kart çeker (7'ler üst üste biner) · 8: sıradaki atlanır
   10: yön değişir · Vale: her kartın üstüne gider, rengi seçer
   Tek kart kalınca "Son kart!" denmezse yakalanan 2 kart çeker. */
(function (root) {
  'use strict';
  const C = typeof module !== 'undefined' && module.exports ? require('./cards.js') : root.Cards;

  class GameError extends Error {}
  const fail = (m) => { throw new GameError(m); };
  const POINTS = (r) => (r === 11 ? 25 : r === 1 ? 11 : r >= 12 ? 10 : r);
  const HAND_SIZE = 7;

  class Engine {
    constructor(names) {
      this.n = names.length;
      this.players = names.map(name => ({ name, total: 0, hand: [] }));
      this.round = 0;
      this.starter = Math.floor(Math.random() * this.n);
      this.status = 'idle';
      this.log = [];
      this.history = [];
      this.result = null;
    }

    note(m) {
      this.log.push(m);
      if (this.log.length > 60) this.log.shift();
    }

    startRound() {
      this.round++;
      if (this.round > 1) this.starter = (this.starter + 1) % this.n;
      this.deck = C.deck(1);
      for (const p of this.players) p.hand = this.deck.splice(0, HAND_SIZE);
      const i = this.deck.findIndex(id => ![7, 8, 10, 11].includes(C.card(id).r));
      const top = this.deck.splice(i, 1)[0];
      this.discard = [top];
      this.suit = C.card(top).s;
      this.dir = 1;
      this.turn = this.starter;
      this.pending = 0;      // 7'lerden biriken çekme cezası
      this.drew = false;     // bu tur kart çekti mi
      this.drawn = null;
      this.unoTarget = null; // "Son kart" demeyen oyuncu
      this.status = 'playing';
      this.result = null;
      this.note(`— ${this.round}. el başladı. ${this.players[this.turn].name} başlıyor.`);
    }

    top() { return C.card(this.discard[this.discard.length - 1]); }

    next(k = 1) { return (((this.turn + this.dir * k) % this.n) + this.n) % this.n; }

    canPlay(id) {
      const c = C.card(id), t = this.top();
      if (this.pending > 0) return c.r === 7;
      if (this.drew && id !== this.drawn) return false;
      return c.r === 11 || c.s === this.suit || c.r === t.r;
    }

    actorSeats() { return this.status === 'playing' ? [this.turn] : []; }

    _reshuffle() {
      const top = this.discard.pop();
      this.deck = C.shuffle(this.discard);
      this.discard = [top];
      if (this.deck.length) this.note('Atılan kartlar karıştırılıp deste yapıldı.');
    }

    _drawCards(seat, k) {
      const p = this.players[seat];
      let got = 0;
      for (; got < k; got++) {
        if (!this.deck.length) this._reshuffle();
        if (!this.deck.length) break;
        p.hand.push(this.deck.pop());
      }
      if (this.unoTarget === seat && p.hand.length > 1) this.unoTarget = null;
      return got;
    }

    _advance(k) {
      this.turn = this.next(k);
      this.drew = false;
      this.drawn = null;
    }

    apply(seat, a) {
      if (this.status !== 'playing') fail('El devam etmiyor.');
      if (!a || typeof a !== 'object') fail('Geçersiz hamle.');
      const p = this.players[seat];
      if (a.type === 'declare') {
        if (this.unoTarget !== seat) fail('Şu an "Son kart" demene gerek yok.');
        this.unoTarget = null;
        this.note(`${p.name}: "Son kart!"`);
        return;
      }
      if (a.type === 'catch') {
        const t = this.unoTarget;
        if (t === null || t === seat || this.players[t].hand.length !== 1) fail('Yakalanacak kimse yok.');
        this.unoTarget = null;
        this._drawCards(t, 2);
        this.note(`${p.name}, ${this.players[t].name} oyuncusunu yakaladı! "Son kart" demediği için 2 kart çekti.`);
        return;
      }
      if (seat !== this.turn) fail('Sıra sende değil.');
      if (this.unoTarget !== null && this.unoTarget !== seat) this.unoTarget = null; // yakalama fırsatı geçti
      switch (a.type) {
        case 'play': return this._play(seat, p, a.card, a.suit);
        case 'draw': return this._draw(seat, p);
        case 'pass':
          if (!this.drew) fail('Önce kart çekmelisin.');
          this.note(`${p.name} pas geçti.`);
          return this._advance(1);
        default: fail('Bilinmeyen hamle.');
      }
    }

    _play(seat, p, id, suit) {
      if (!Number.isInteger(id) || !p.hand.includes(id)) fail('Bu kart elinde yok.');
      if (!this.canPlay(id)) {
        fail(this.pending ? `7 atmazsan ${this.pending} kart çekmelisin.`
          : this.drew ? 'Sadece çektiğin kartı oynayabilirsin ya da pas geç.'
            : 'Bu kart oynanamaz: aynı renk ya da aynı sayı olmalı (Vale her zaman olur).');
      }
      const c = C.card(id);
      if (c.r === 11 && !(Number.isInteger(suit) && suit >= 0 && suit < 4)) fail('Vale için bir renk seç.');
      p.hand.splice(p.hand.indexOf(id), 1);
      this.discard.push(id);
      this.suit = c.r === 11 ? suit : c.s;
      let msg = `${p.name} ${C.cardName(id)} attı`;
      let skip = 1;
      if (c.r === 7) { this.pending += 3; msg += `, sıradaki ${this.pending} kart çekecek`; }
      else if (c.r === 8) { skip = 2; msg += `, ${this.players[this.next()].name} atlandı`; }
      else if (c.r === 10) { this.dir *= -1; msg += ', yön değişti'; }
      else if (c.r === 11) msg += ` ve ${C.SUIT_NAMES[suit]} ${C.SUITS[suit]} seçti`;
      this.note(msg + '.');
      if (!p.hand.length) return this._end(seat, c.r === 11);
      if (p.hand.length === 1) this.unoTarget = seat;
      this._advance(skip);
    }

    _draw(seat, p) {
      if (this.pending > 0) {
        const k = this.pending;
        this.pending = 0;
        const got = this._drawCards(seat, k);
        this.note(`${p.name} ${got} kart çekti.`);
        return this._advance(1);
      }
      if (this.drew) fail('Bu tur zaten kart çektin. Oyna ya da pas geç.');
      if (!this._drawCards(seat, 1)) {
        this.note(`${p.name} çekecek kart kalmadı, pas.`);
        return this._advance(1);
      }
      this.drew = true;
      this.drawn = p.hand[p.hand.length - 1];
      if (!this.canPlay(this.drawn)) {
        this.note(`${p.name} kart çekti, pas geçti.`);
        this._advance(1);
      }
    }

    // Kalan kartların puanı ceza olarak yazılır. Vale ile bitirilirse 2 katı.
    _end(winner, withJack) {
      const mult = withJack ? 2 : 1;
      const scores = this.players.map((p, i) => (i === winner ? 0 : p.hand.reduce((s, id) => s + POINTS(C.card(id).r), 0) * mult));
      this.players.forEach((p, i) => { p.total += scores[i]; });
      const reason = `${this.players[winner].name} elini bitirdi!` + (withJack ? ' Vale ile bitti, cezalar 2 katı.' : '');
      this.result = { winner, reason, scores, hands: this.players.map(p => p.hand.slice()) };
      this.history.push(scores);
      this.status = 'roundEnd';
      this.note(reason);
    }

    viewFor(seat) {
      const mine = this.status === 'playing' && seat === this.turn;
      const me = this.players[seat];
      return {
        mode: 'yedili', status: this.status, round: this.round, you: seat, turn: this.turn, dir: this.dir,
        pending: this.pending, suit: this.suit, top: this.discard[this.discard.length - 1],
        deckCount: this.deck.length, hand: me.hand.slice(),
        drew: mine && this.drew, drawn: mine ? this.drawn : null,
        playable: mine ? me.hand.filter(id => this.canPlay(id)) : [],
        unoTarget: this.unoTarget,
        players: this.players.map(p => ({ name: p.name, total: p.total, count: p.hand.length })),
        log: this.log.slice(-30), history: this.history.map(h => h.slice()), result: this.result,
      };
    }

    // ---- bot ----
    botTurn(seat) {
      if (this.status !== 'playing' || this.turn !== seat) return;
      const p = this.players[seat];
      const tryDo = (a) => {
        try { this.apply(seat, a); return true; } catch (e) { if (e instanceof GameError) return false; throw e; }
      };
      let playable = p.hand.filter(id => this.canPlay(id));
      if (!playable.length) {
        tryDo({ type: 'draw' });
        if (this.turn !== seat || this.status !== 'playing') return;
        playable = p.hand.filter(id => this.canPlay(id));
        if (!playable.length) { tryDo({ type: 'pass' }); return; }
      }
      const counts = [0, 0, 0, 0];
      for (const id of p.hand) { const c = C.card(id); if (c.r !== 11) counts[c.s]++; }
      const nextCount = this.players[this.next()].hand.length;
      const score = (id) => {
        const c = C.card(id);
        let s = counts[c.s] * 2 + POINTS(c.r) * 0.2;
        if (c.r === 11) s -= 100;                                // valeyi sona sakla
        if ((c.r === 7 || c.r === 8) && nextCount <= 3) s += 10; // rakip bitirmek üzereyse cezalandır
        return s;
      };
      playable.sort((a, b) => score(b) - score(a));
      const id = playable[0];
      const best = counts.indexOf(Math.max(...counts));
      tryDo({ type: 'play', card: id, suit: best });
      if (this.unoTarget === seat && Math.random() < 0.85) tryDo({ type: 'declare' });
    }

    // Botlar "Son kart" demeyen insanı yakalar
    botReact(botSeats) {
      const t = this.unoTarget;
      if (this.status !== 'playing' || t === null || botSeats.has(t)) return null;
      const seat = [...botSeats].find(i => i !== t);
      return seat === undefined ? null : { seat, action: { type: 'catch' } };
    }
  }

  // ================= Arayüz =================
  let pickJack = null; // renk seçimi bekleyen vale

  function render(v, api) {
    const el = document.getElementById('modeBoard');
    const esc = api.esc;
    const n = v.players.length;
    const myTurn = v.status === 'playing' && v.turn === v.you;
    const others = [];
    for (let k = 1; k < n; k++) others.push((v.you + k) % n);

    const opp = others.map(i => {
      const p = v.players[i];
      const backs = Array.from({ length: Math.min(p.count, 12) }, () => '<div class="card sm back"></div>').join('');
      const canCatch = v.unoTarget === i && v.status === 'playing';
      return `<div class="ybox ${v.status === 'playing' && v.turn === i ? 'turn' : ''}">
        <div class="pname">${esc(p.name)}</div>
        <div class="pmeta">${p.count} kart · <b>${p.total}</b> puan</div>
        <div class="mini-fan">${backs}</div>
        ${p.count === 1 ? '<span class="badge warn">Tek kart</span>' : ''}
        ${canCatch ? '<button class="btn sm danger" data-mact="catch">Yakala! (Son kart demedi)</button>' : ''}
      </div>`;
    }).join('');

    const canDraw = myTurn && !v.drew;
    const suitRed = v.suit === 1 || v.suit === 2;
    const center = `
      <div class="ycenter">
        <div class="ydeck ${canDraw ? 'active' : ''}" ${canDraw ? 'data-mact="draw" title="Kart çek"' : ''}>
          <div class="card back"></div><small>${v.pending && myTurn ? `${v.pending} kart çek` : 'Deste'} (${v.deckCount})</small>
        </div>
        <div class="ydiscard">${Cards.cardHTML(v.top, { cls: 'big' })}</div>
        <div class="yinfo">
          <div>Renk: <span class="suit-ind ${suitRed ? 'red' : ''}">${Cards.SUITS[v.suit]}</span></div>
          <div>Yön: <span class="dir">${v.dir === 1 ? '↻' : '↺'}</span></div>
          ${v.pending ? `<div class="pending">+${v.pending}</div>` : ''}
          <div><b>${v.round}. El</b></div>
        </div>
      </div>`;

    let status;
    const btns = [];
    if (v.status === 'roundEnd') status = 'El bitti.';
    else if (myTurn) {
      if (v.pending) status = `<b>Sıra sende!</b> 7 at ya da desteye tıklayıp ${v.pending} kart çek.`;
      else if (v.drew) status = '<b>Sıra sende!</b> Çektiğin kartı oynayabilir ya da pas geçebilirsin.';
      else status = '<b>Sıra sende!</b> Aynı renk ya da aynı sayı at. Yoksa desteden çek.';
      if (v.drew) btns.push('<button class="btn sm" data-mact="pass">Pas</button>');
    } else status = `Sıra: <b>${esc(v.players[v.turn].name)}</b>`;
    if (v.unoTarget === v.you && v.status === 'playing') btns.push('<button class="btn sm primary pulse" data-mact="declare">Son Kart!</button>');

    const hand = v.hand.slice().sort((a, b) => {
      const x = Cards.card(a), y = Cards.card(b);
      return x.s - y.s || x.r - y.r;
    });
    const playable = new Set(v.playable);
    const handHTML = hand.map(id => Cards.cardHTML(id, {
      cls: (playable.has(id) ? 'playable' : myTurn ? 'dim' : '') + (id === v.drawn ? ' new' : ''),
      attrs: playable.has(id) ? 'data-mact="play"' : '',
    })).join('');

    const picker = pickJack !== null ? `
      <div class="suit-picker"><div class="card-panel">
        <h3>Vale ile renk seç</h3>
        <div class="row">${[0, 1, 2, 3].map(s => `<button class="btn suit-btn ${s === 1 || s === 2 ? 'red' : ''}" data-mact="suit" data-s="${s}">${Cards.SUITS[s]}<small>${Cards.SUIT_NAMES[s]}</small></button>`).join('')}</div>
        <button class="btn ghost sm" data-mact="cancelSuit">Vazgeç</button>
      </div></div>` : '';

    el.innerHTML = `
      <div class="ytable">
        <div class="yopps">${opp}</div>
        ${center}
        <div class="me-bar"><div class="me-info"><b>${esc(v.players[v.you].name)}</b> · ${v.players[v.you].total} puan</div>
          <div class="status">${status}</div><div class="actions">${btns.join('')}</div></div>
        <div class="yhand">${handHTML}</div>
        ${resultHTML(v, api)}
        ${picker}
      </div>`;
  }

  function resultHTML(v, api) {
    if (v.status !== 'roundEnd' || !v.result) return '';
    const r = v.result, esc = api.esc;
    const rows = v.players.map((p, i) => `
      <tr class="${i === r.winner ? 'win' : ''}"><td>${esc(p.name)}${i === r.winner ? ' 🏆' : ''}</td>
      <td class="num">+${r.scores[i]}</td><td class="num"><b>${p.total}</b></td></tr>
      <tr class="hand-row"><td colspan="3">${r.hands[i].map(id => Cards.cardHTML(id, { sm: true })).join('')}</td></tr>`).join('');
    return `<div class="result-panel"><div class="card-panel">
      <h2>${v.round}. El Bitti</h2><p class="reason">${esc(r.reason)}</p>
      <table class="result-table"><thead><tr><th>Oyuncu</th><th>Bu el</th><th>Toplam</th></tr></thead><tbody>${rows}</tbody></table>
      <p class="muted tiny">Kalan kartlar ceza: As 11, Vale 25, Kız/Papaz 10, diğerleri kendi sayısı. En düşük puan önde.</p>
      <div class="row">${api.isHost() ? '<button class="btn primary" data-act="nextRound">Sonraki El</button><button class="btn ghost" data-act="toLobby">Lobiye Dön</button>' : '<span class="muted">Kurucunun yeni eli başlatması bekleniyor…</span>'}</div>
    </div></div>`;
  }

  function onAct(act, el, api) {
    const v = api.view();
    if (act === 'play') {
      const id = +el.dataset.card;
      if (Cards.card(id).r === 11) { pickJack = id; api.rerender(); return; }
      api.send({ type: 'play', card: id });
    } else if (act === 'suit') {
      const id = pickJack;
      pickJack = null;
      api.rerender();
      if (id !== null) api.send({ type: 'play', card: id, suit: +el.dataset.s });
    } else if (act === 'cancelSuit') { pickJack = null; api.rerender(); }
    else if (act === 'draw') api.send({ type: 'draw' });
    else if (act === 'pass') api.send({ type: 'pass' });
    else if (act === 'declare') api.send({ type: 'declare' });
    else if (act === 'catch') api.send({ type: 'catch' });
    if (v && v.status !== 'playing') pickJack = null;
  }

  function scoresHTML(v, api) {
    const esc = api.esc;
    const head = v.players.map(p => `<th>${esc(p.name)}</th>`).join('');
    const rows = v.history.map((h, r) => `<tr><td>${r + 1}</td>${h.map(x => `<td>${x}</td>`).join('')}</tr>`).join('');
    const tot = `<tr class="tot"><td>Σ</td>${v.players.map(p => `<td>${p.total}</td>`).join('')}</tr>`;
    const lead = v.players.slice().sort((a, b) => a.total - b.total)[0];
    return `<h3>Puan Tablosu</h3><div class="leader">Önde: <b>${esc(lead.name)}</b> (${lead.total})</div>
      <table class="score-table"><thead><tr><th>El</th>${head}</tr></thead><tbody>${rows}${tot}</tbody></table>
      <p class="muted tiny">7: +3 kart · 8: atla · 10: yön · Vale: renk seç. Bitiren 0, diğerleri kalan kart puanı. En düşük puan önde.</p>`;
  }

  const mode = { key: 'yedili', title: 'Pis Yedili', desc: '2-4 kişi · iskambil', min: 2, max: 4, Engine, GameError, render, onAct, scoresHTML };
  if (typeof module !== 'undefined' && module.exports) module.exports = mode;
  else { root.GameModes = root.GameModes || {}; root.GameModes.yedili = mode; }
})(this);
