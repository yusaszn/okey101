/* Renk Fırtınası — 2-4 kişi, bize özgü renkli kart oyunu
   Aynı renk ya da aynı sayı/simge atılır. Elini ilk bitiren, diğerlerinin kartları kadar puan alır.
   ❄ Dondur: sıradaki atlanır · 💣 Bomba: diğer herkes 1 kart çeker
   🌪 Kasırga: herkes elini sıradakine verir · 🌈 Gökkuşağı: renk seç
   ⚡ Şimşek: renk seç ve bir daha oyna · Tek kart kalınca "Son kart!" de, yoksa yakalanırsın (+2). */
(function (root) {
  'use strict';

  class GameError extends Error {}
  const fail = (m) => { throw new GameError(m); };
  const HAND_SIZE = 7;
  const COLOR_HEX = ['#ff4d8d', '#ff922b', '#40c057', '#845ef7'];
  const COLOR_NAMES = ['Pembe', 'Turuncu', 'Yeşil', 'Mor'];
  const ICON = { dondur: '❄', bomba: '💣', kasirga: '🌪', gokkusagi: '🌈', simsek: '⚡' };
  const NAMES = { dondur: 'Dondur', bomba: 'Bomba', kasirga: 'Kasırga', gokkusagi: 'Gökkuşağı', simsek: 'Şimşek' };

  // Deste: id = bu tablodaki sıra (herkeste aynı)
  const CARDS = [];
  for (let c = 0; c < 4; c++) {
    for (let n = 1; n <= 9; n++) for (let k = 0; k < 2; k++) CARDS.push({ c, t: 'n', n });
    for (const [t, cnt] of [['dondur', 2], ['bomba', 2], ['kasirga', 1]]) for (let k = 0; k < cnt; k++) CARDS.push({ c, t });
  }
  for (let k = 0; k < 4; k++) CARDS.push({ c: -1, t: 'gokkusagi' });
  for (let k = 0; k < 2; k++) CARDS.push({ c: -1, t: 'simsek' });

  const card = (id) => CARDS[id];
  const isWild = (id) => CARDS[id].c < 0;
  const points = (id) => { const k = CARDS[id]; return k.t === 'n' ? k.n : k.c < 0 ? 25 : 15; };
  const cardName = (id) => {
    const k = CARDS[id];
    if (k.c < 0) return NAMES[k.t];
    return `${COLOR_NAMES[k.c]} ${k.t === 'n' ? k.n : NAMES[k.t]}`;
  };

  function shuffle(a) {
    for (let i = a.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
  }

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
      this.deck = shuffle(CARDS.map((_, i) => i));
      for (const p of this.players) p.hand = this.deck.splice(0, HAND_SIZE);
      const i = this.deck.findIndex(id => CARDS[id].t === 'n');
      const top = this.deck.splice(i, 1)[0];
      this.discard = [top];
      this.color = CARDS[top].c;
      this.turn = this.starter;
      this.drew = false;
      this.drawn = null;
      this.unoTarget = null;
      this.status = 'playing';
      this.result = null;
      this.note(`— ${this.round}. el başladı. ${this.players[this.turn].name} başlıyor.`);
    }

    topId() { return this.discard[this.discard.length - 1]; }
    next(k = 1) { return (this.turn + k) % this.n; }
    actorSeats() { return this.status === 'playing' ? [this.turn] : []; }

    canPlay(id) {
      if (this.drew && id !== this.drawn) return false;
      const k = CARDS[id], t = CARDS[this.topId()];
      if (k.c < 0 || k.c === this.color) return true;
      if (k.t === 'n') return t.t === 'n' && t.n === k.n;
      return k.t === t.t;
    }

    _reshuffle() {
      const top = this.discard.pop();
      this.deck = shuffle(this.discard);
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
        this.note(`${p.name}, ${this.players[t].name} oyuncusunu yakaladı! 2 kart çekti.`);
        return;
      }
      if (seat !== this.turn) fail('Sıra sende değil.');
      if (this.unoTarget !== null && this.unoTarget !== seat) this.unoTarget = null;
      switch (a.type) {
        case 'play': return this._play(seat, p, a.card, a.color);
        case 'draw': return this._draw(seat, p);
        case 'pass':
          if (!this.drew) fail('Önce kart çekmelisin.');
          this.note(`${p.name} pas geçti.`);
          return this._advance(1);
        default: fail('Bilinmeyen hamle.');
      }
    }

    _play(seat, p, id, color) {
      if (!Number.isInteger(id) || !p.hand.includes(id)) fail('Bu kart elinde yok.');
      if (!this.canPlay(id)) fail(this.drew ? 'Sadece çektiğin kartı oynayabilirsin ya da pas geç.' : 'Bu kart oynanamaz: aynı renk ya da aynı sayı/simge olmalı.');
      const k = CARDS[id];
      if (k.c < 0 && !(Number.isInteger(color) && color >= 0 && color < 4)) fail('Bir renk seç.');
      p.hand.splice(p.hand.indexOf(id), 1);
      this.discard.push(id);
      this.color = k.c < 0 ? color : k.c;
      let msg = `${p.name} ${cardName(id)} attı`;
      if (k.c < 0) msg += `, renk: ${COLOR_NAMES[color]}`;
      if (!p.hand.length) { this.note(msg + '.'); return this._end(seat); }
      let skip = 1;
      if (k.t === 'dondur') { skip = 2; msg += `. ${this.players[this.next()].name} donduruldu ❄`; }
      else if (k.t === 'bomba') {
        this.players.forEach((_, i) => { if (i !== seat) this._drawCards(i, 1); });
        msg += '. BOMBA! Herkes 1 kart çekti 💣';
      } else if (k.t === 'kasirga') {
        // herkes elini sıradakine verir
        const hands = this.players.map(x => x.hand);
        this.players.forEach((x, i) => { x.hand = hands[(i - 1 + this.n) % this.n]; });
        this.unoTarget = null;
        msg += '. KASIRGA! Eller el değiştirdi 🌪';
      } else if (k.t === 'simsek') { skip = 0; msg += '. Bir daha oynuyor ⚡'; }
      this.note(msg + '.');
      if (k.t !== 'kasirga' && p.hand.length === 1) this.unoTarget = seat;
      this._advance(skip);
    }

    _draw(seat, p) {
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

    // Bitiren, diğerlerinin elindeki kartların puanını kazanır
    _end(winner) {
      const gain = this.players.reduce((s, p, i) => s + (i === winner ? 0 : p.hand.reduce((a, id) => a + points(id), 0)), 0);
      const scores = this.players.map((_, i) => (i === winner ? gain : 0));
      this.players[winner].total += gain;
      const reason = `${this.players[winner].name} elini bitirdi ve ${gain} puan kazandı!`;
      this.result = { winner, reason, scores, hands: this.players.map(p => p.hand.slice()) };
      this.history.push(scores);
      this.status = 'roundEnd';
      this.note(reason);
    }

    viewFor(seat) {
      const mine = this.status === 'playing' && seat === this.turn;
      const me = this.players[seat];
      return {
        mode: 'firtina', status: this.status, round: this.round, you: seat, turn: this.turn,
        color: this.color, top: this.topId(), deckCount: this.deck.length, hand: me.hand.slice(),
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
      for (const id of p.hand) if (!isWild(id)) counts[CARDS[id].c]++;
      const nextCount = this.players[this.next()].hand.length;
      const prevCount = this.players[(seat - 1 + this.n) % this.n].hand.length;
      const score = (id) => {
        const k = CARDS[id];
        if (k.t === 'simsek') return p.hand.length > 2 ? 30 : -50;
        if (k.c < 0) return -100;                                    // gökkuşağını sona sakla
        let s = counts[k.c] * 2 + (k.t === 'n' ? k.n * 0.3 : 3);
        if ((k.t === 'dondur' || k.t === 'bomba') && nextCount <= 3) s += 12;
        if (k.t === 'kasirga') s += prevCount < p.hand.length - 1 ? 20 : -60;
        return s;
      };
      playable.sort((a, b) => score(b) - score(a));
      const best = counts.indexOf(Math.max(...counts));
      tryDo({ type: 'play', card: playable[0], color: best });
      if (this.unoTarget === seat && Math.random() < 0.85) tryDo({ type: 'declare' });
      // Şimşek: sıra yine bende
      if (this.status === 'playing' && this.turn === seat) this.botTurn(seat);
    }

    botReact(botSeats) {
      const t = this.unoTarget;
      if (this.status !== 'playing' || t === null || botSeats.has(t)) return null;
      const seat = [...botSeats].find(i => i !== t);
      return seat === undefined ? null : { seat, action: { type: 'catch' } };
    }
  }

  // ================= Arayüz =================
  let pickWild = null;

  function cardHTML(id, opts = {}) {
    const cls = ['fcard'];
    if (opts.sm) cls.push('sm');
    if (opts.big) cls.push('big');
    if (opts.cls) cls.push(opts.cls);
    const attrs = opts.attrs || '';
    if (id === null || id === undefined) return `<div class="${cls.concat('back').join(' ')}" ${attrs}><span class="fc-logo">⚡</span></div>`;
    const k = CARDS[id];
    const label = k.t === 'n' ? k.n : ICON[k.t];
    if (k.c < 0) cls.push('wild');
    const style = k.c >= 0 ? `style="--fc:${COLOR_HEX[k.c]}"` : '';
    return `<div class="${cls.join(' ')}" ${style} data-card="${id}" ${attrs}>
      <span class="fc-c tl">${label}</span><span class="fc-mid"><i><b>${label}</b></i></span><span class="fc-c br">${label}</span></div>`;
  }

  function render(v, api) {
    const el = document.getElementById('modeBoard');
    const esc = api.esc;
    const n = v.players.length;
    const myTurn = v.status === 'playing' && v.turn === v.you;
    const others = [];
    for (let k = 1; k < n; k++) others.push((v.you + k) % n);

    const opp = others.map(i => {
      const p = v.players[i];
      const backs = Array.from({ length: Math.min(p.count, 12) }, () => '<div class="fcard mini back"></div>').join('');
      const canCatch = v.unoTarget === i && v.status === 'playing';
      return `<div class="ybox ${v.status === 'playing' && v.turn === i ? 'turn' : ''}">
        <div class="pname">${esc(p.name)}</div>
        <div class="pmeta">${p.count} kart · <b>${p.total}</b> puan</div>
        <div class="mini-fan">${backs}</div>
        ${p.count === 1 ? '<span class="badge warn">Tek kart!</span>' : ''}
        ${canCatch ? '<button class="btn sm danger" data-mact="catch">Yakala! (Son kart demedi)</button>' : ''}
      </div>`;
    }).join('');

    const canDraw = myTurn && !v.drew;
    const center = `
      <div class="ycenter fcenter" style="--cur:${COLOR_HEX[v.color]}">
        <div class="ydeck ${canDraw ? 'active' : ''}" ${canDraw ? 'data-mact="draw" title="Kart çek"' : ''}>
          ${cardHTML(null, { big: true })}<small>Deste (${v.deckCount})</small>
        </div>
        <div class="ydiscard">${cardHTML(v.top, { big: true })}</div>
        <div class="yinfo">
          <div>Renk: <span class="color-dot" style="background:${COLOR_HEX[v.color]}"></span> <b>${COLOR_NAMES[v.color]}</b></div>
          <div>Yön: <span class="dir">↻</span></div>
          <div><b>${v.round}. El</b></div>
        </div>
      </div>`;

    let status;
    const btns = [];
    if (v.status === 'roundEnd') status = 'El bitti.';
    else if (myTurn) {
      status = v.drew ? '<b>Sıra sende!</b> Çektiğin kartı oynayabilir ya da pas geçebilirsin.'
        : '<b>Sıra sende!</b> Aynı renk ya da aynı sayı/simge at. Yoksa desteden çek.';
      if (v.drew) btns.push('<button class="btn sm" data-mact="pass">Pas</button>');
    } else status = `Sıra: <b>${esc(v.players[v.turn].name)}</b>`;
    if (v.unoTarget === v.you && v.status === 'playing') btns.push('<button class="btn sm primary pulse" data-mact="declare">Son Kart!</button>');

    const hand = v.hand.slice().sort((a, b) => {
      const x = CARDS[a], y = CARDS[b];
      const cx = x.c < 0 ? 9 : x.c, cy = y.c < 0 ? 9 : y.c;
      return cx - cy || (x.t === 'n' ? x.n : 20) - (y.t === 'n' ? y.n : 20);
    });
    const playable = new Set(v.playable);
    const handHTML = hand.map(id => cardHTML(id, {
      cls: (playable.has(id) ? 'playable' : myTurn ? 'dim' : '') + (id === v.drawn ? ' new' : ''),
      attrs: playable.has(id) ? 'data-mact="play"' : '',
    })).join('');

    const picker = pickWild !== null ? `
      <div class="suit-picker"><div class="card-panel">
        <h3>Renk seç</h3>
        <div class="row">${COLOR_HEX.map((hex, c) => `<button class="btn color-btn" style="background:${hex}" data-mact="color" data-c="${c}">${COLOR_NAMES[c]}</button>`).join('')}</div>
        <button class="btn ghost sm" data-mact="cancelColor">Vazgeç</button>
      </div></div>` : '';

    el.innerHTML = `
      <div class="ytable firtina">
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
      <td class="num">${r.scores[i] ? '+' + r.scores[i] : '0'}</td><td class="num"><b>${p.total}</b></td></tr>
      <tr class="hand-row"><td colspan="3">${r.hands[i].map(id => cardHTML(id, { sm: true })).join('')}</td></tr>`).join('');
    return `<div class="result-panel"><div class="card-panel">
      <h2>${v.round}. El Bitti</h2><p class="reason">${esc(r.reason)}</p>
      <table class="result-table"><thead><tr><th>Oyuncu</th><th>Bu el</th><th>Toplam</th></tr></thead><tbody>${rows}</tbody></table>
      <p class="muted tiny">Bitiren, diğerlerinin elindeki kartlar kadar puan alır: sayılar kendi değeri, özel kartlar 15, Gökkuşağı/Şimşek 25. En yüksek puan önde.</p>
      <div class="row">${api.isHost() ? '<button class="btn primary" data-act="nextRound">Sonraki El</button><button class="btn ghost" data-act="toLobby">Lobiye Dön</button>' : '<span class="muted">Kurucunun yeni eli başlatması bekleniyor…</span>'}</div>
    </div></div>`;
  }

  function onAct(act, el, api) {
    if (act === 'play') {
      const id = +el.dataset.card;
      if (isWild(id)) { pickWild = id; api.rerender(); return; }
      api.send({ type: 'play', card: id });
    } else if (act === 'color') {
      const id = pickWild;
      pickWild = null;
      api.rerender();
      if (id !== null) api.send({ type: 'play', card: id, color: +el.dataset.c });
    } else if (act === 'cancelColor') { pickWild = null; api.rerender(); }
    else if (act === 'draw') api.send({ type: 'draw' });
    else if (act === 'pass') api.send({ type: 'pass' });
    else if (act === 'declare') api.send({ type: 'declare' });
    else if (act === 'catch') api.send({ type: 'catch' });
  }

  function scoresHTML(v, api) {
    const esc = api.esc;
    const head = v.players.map(p => `<th>${esc(p.name)}</th>`).join('');
    const rows = v.history.map((h, r) => `<tr><td>${r + 1}</td>${h.map(x => `<td>${x}</td>`).join('')}</tr>`).join('');
    const tot = `<tr class="tot"><td>Σ</td>${v.players.map(p => `<td>${p.total}</td>`).join('')}</tr>`;
    const lead = v.players.slice().sort((a, b) => b.total - a.total)[0];
    return `<h3>Puan Tablosu</h3><div class="leader">Önde: <b>${esc(lead.name)}</b> (${lead.total})</div>
      <table class="score-table"><thead><tr><th>El</th>${head}</tr></thead><tbody>${rows}${tot}</tbody></table>
      <p class="muted tiny">❄ Dondur: sıradaki atlanır · 💣 Bomba: herkes 1 çeker · 🌪 Kasırga: eller el değiştirir · 🌈 renk seç · ⚡ renk seç + bir daha oyna. En yüksek puan önde.</p>`;
  }

  const mode = { key: 'firtina', title: 'Renk Fırtınası', desc: '2-4 kişi · renkli kartlar', min: 2, max: 4, Engine, GameError, CARDS, render, onAct, scoresHTML };
  if (typeof module !== 'undefined' && module.exports) module.exports = mode;
  else { root.GameModes = root.GameModes || {}; root.GameModes.firtina = mode; }
})(this);
