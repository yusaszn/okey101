/* Blackjack (21) — 1-4 oyuncu krupiyeye karşı, 4 desteli ayakkabı
   Blackjack 3:2 öder · krupiye 17'de durur · ilk iki kartta ikiye katlama */
(function (root) {
  'use strict';
  const C = typeof module !== 'undefined' && module.exports ? require('./cards.js') : root.Cards;

  class GameError extends Error {}
  const fail = (m) => { throw new GameError(m); };
  const START_CHIPS = 1000, MIN_BET = 10;

  function handValue(hand) {
    let total = 0, aces = 0;
    for (const id of hand) {
      const r = C.card(id).r;
      if (r === 1) { aces++; total += 11; } else total += r >= 10 ? 10 : r;
    }
    while (total > 21 && aces) { total -= 10; aces--; }
    return { total, soft: aces > 0 };
  }
  const isBJ = (hand) => hand.length === 2 && handValue(hand).total === 21;

  class Engine {
    constructor(names) {
      this.n = names.length;
      this.players = names.map(name => ({ name, chips: START_CHIPS, bet: 0, hand: [], done: false, result: null, net: 0 }));
      this.round = 0;
      this.status = 'idle';
      this.log = [];
      this.history = [];
      this.shoe = [];
      this.dealer = [];
    }

    note(m) {
      this.log.push(m);
      if (this.log.length > 60) this.log.shift();
    }

    startRound() {
      this.round++;
      if (this.shoe.length < 60) { this.shoe = C.deck(4); this.note('Kartlar karıştırıldı.'); }
      for (const p of this.players) {
        if (p.chips < MIN_BET) { p.chips = START_CHIPS; this.note(`${p.name} iflas etti, yeniden ${START_CHIPS} çip aldı.`); }
        Object.assign(p, { bet: 0, hand: [], done: false, result: null, net: 0 });
      }
      this.dealer = [];
      this.phase = 'betting';
      this.turn = null;
      this.status = 'playing';
      this.note(`— ${this.round}. el: bahisler bekleniyor.`);
    }

    actorSeats() {
      if (this.status !== 'playing') return [];
      if (this.phase === 'betting') return this.players.map((p, i) => (p.bet ? -1 : i)).filter(i => i >= 0);
      return this.phase === 'playing' ? [this.turn] : [];
    }

    _card() {
      if (!this.shoe.length) this.shoe = C.deck(4);
      return this.shoe.pop();
    }

    apply(seat, a) {
      if (this.status !== 'playing') fail('El devam etmiyor.');
      if (!a || typeof a !== 'object') fail('Geçersiz hamle.');
      const p = this.players[seat];
      if (a.type === 'bet') {
        if (this.phase !== 'betting') fail('Bahis zamanı geçti.');
        if (p.bet) fail('Bahsini zaten koydun.');
        const amt = Math.floor(Number(a.amount));
        if (!(amt >= MIN_BET)) fail(`En az ${MIN_BET} çip koymalısın.`);
        if (amt > p.chips) fail('Yeterli çipin yok.');
        p.bet = amt;
        p.chips -= amt;
        this.note(`${p.name} ${amt} çip koydu.`);
        if (this.players.every(x => x.bet)) this._deal();
        return;
      }
      if (this.phase !== 'playing') fail('Şu an kart oynanmıyor.');
      if (seat !== this.turn) fail('Sıra sende değil.');
      switch (a.type) {
        case 'hit': {
          p.hand.push(this._card());
          const v = handValue(p.hand).total;
          if (v > 21) { p.done = true; p.result = 'Battı'; this.note(`${p.name} ${v} ile battı.`); this._nextTurn(); }
          else if (v === 21) { p.done = true; this._nextTurn(); }
          return;
        }
        case 'stand':
          p.done = true;
          this.note(`${p.name} ${handValue(p.hand).total} ile durdu.`);
          return this._nextTurn();
        case 'double': {
          if (p.hand.length !== 2) fail('Sadece ilk iki kartta ikiye katlayabilirsin.');
          if (p.chips < p.bet) fail('İkiye katlamak için yeterli çipin yok.');
          p.chips -= p.bet;
          p.bet *= 2;
          p.hand.push(this._card());
          p.done = true;
          const v = handValue(p.hand).total;
          if (v > 21) p.result = 'Battı';
          this.note(`${p.name} ikiye katladı: ${v}.`);
          return this._nextTurn();
        }
        default: fail('Bilinmeyen hamle.');
      }
    }

    _deal() {
      for (let k = 0; k < 2; k++) {
        for (const p of this.players) p.hand.push(this._card());
        this.dealer.push(this._card());
      }
      this.phase = 'playing';
      for (const p of this.players) if (isBJ(p.hand)) { p.done = true; this.note(`${p.name}: Blackjack!`); }
      if (isBJ(this.dealer)) {
        this.note('Krupiyede Blackjack!');
        return this._dealerPlay();
      }
      this.turn = -1;
      this._nextTurn();
    }

    _nextTurn() {
      for (let i = this.turn + 1; i < this.n; i++) {
        if (!this.players[i].done) { this.turn = i; return; }
      }
      this._dealerPlay();
    }

    _dealerPlay() {
      this.phase = 'dealer';
      this.turn = null;
      const anyAlive = this.players.some(p => handValue(p.hand).total <= 21 && !isBJ(p.hand));
      if (anyAlive) while (handValue(this.dealer).total < 17) this.dealer.push(this._card());
      this._settle();
    }

    _settle() {
      const dv = handValue(this.dealer).total, dbj = isBJ(this.dealer);
      const nets = [];
      for (const p of this.players) {
        const pv = handValue(p.hand).total, pbj = isBJ(p.hand);
        let net;
        if (pv > 21) { net = -p.bet; p.result = 'Battı'; }
        else if (pbj && !dbj) { net = Math.floor(p.bet * 1.5); p.result = 'Blackjack!'; }
        else if (dbj && !pbj) { net = -p.bet; p.result = 'Kaybetti'; }
        else if (dv > 21 || pv > dv) { net = p.bet; p.result = 'Kazandı'; }
        else if (pv === dv) { net = 0; p.result = 'Berabere'; }
        else { net = -p.bet; p.result = 'Kaybetti'; }
        p.chips += p.bet + net;
        p.net = net;
        nets.push(net);
      }
      this.history.push(nets);
      this.status = 'roundEnd';
      this.phase = 'done';
      this.note(`Krupiye: ${dv > 21 ? `${dv}, battı` : dv}.`);
    }

    viewFor(seat) {
      const reveal = this.phase === 'dealer' || this.phase === 'done';
      return {
        mode: 'blackjack', status: this.status, round: this.round, phase: this.phase, turn: this.turn, you: seat,
        dealer: reveal ? this.dealer.slice() : this.dealer.map((id, i) => (i === 1 ? null : id)),
        dealerTotal: reveal ? handValue(this.dealer).total : this.dealer.length ? handValue([this.dealer[0]]).total : 0,
        players: this.players.map(p => {
          const hv = handValue(p.hand);
          return { name: p.name, chips: p.chips, bet: p.bet, hand: p.hand.slice(), total: hv.total, soft: hv.soft, done: p.done, result: p.result, net: p.net };
        }),
        log: this.log.slice(-30), history: this.history.map(h => h.slice()), shoe: this.shoe.length,
      };
    }

    // ---- bot: basit temel strateji ----
    botTurn(seat) {
      const p = this.players[seat];
      const tryDo = (a) => {
        try { this.apply(seat, a); return true; } catch (e) { if (e instanceof GameError) return false; throw e; }
      };
      if (this.phase === 'betting' && !p.bet) {
        const want = [25, 50, 50, 100][Math.floor(Math.random() * 4)];
        tryDo({ type: 'bet', amount: Math.max(MIN_BET, Math.min(p.chips, want)) });
        return;
      }
      if (this.phase !== 'playing' || this.turn !== seat) return;
      const up = C.card(this.dealer[0]).r;
      const upv = up === 1 ? 11 : Math.min(up, 10);
      const { total, soft } = handValue(p.hand);
      if (p.hand.length === 2 && !soft && (total === 11 || (total === 10 && upv <= 9)) && p.chips >= p.bet) return void tryDo({ type: 'double' });
      let hit;
      if (soft) hit = total <= 17;
      else if (total <= 11) hit = true;
      else if (total <= 16) hit = upv >= 7;
      else hit = false;
      tryDo({ type: hit ? 'hit' : 'stand' });
    }
  }

  // ================= Arayüz =================
  let betAmt = 0;

  function render(v, api) {
    const el = document.getElementById('modeBoard');
    const esc = api.esc;
    const me = v.players[v.you];
    if (v.phase !== 'betting' || me.bet) betAmt = 0;
    if (betAmt > me.chips) betAmt = me.chips;

    const dealer = `
      <div class="bj-dealer">
        <div class="bj-label">Krupiye ${v.dealer.length ? `· <b>${v.dealerTotal}</b>${v.phase === 'playing' ? '+?' : ''}` : ''}</div>
        <div class="bj-cards">${v.dealer.length ? v.dealer.map(id => Cards.cardHTML(id)).join('') : '<div class="card empty"></div><div class="card empty"></div>'}</div>
        <div class="muted-light tiny">Krupiye 17'de durur · Blackjack 3:2 öder · Kalan kart: ${v.shoe}</div>
      </div>`;

    const seats = v.players.map((p, i) => {
      const cls = ['bj-seat'];
      if (v.status === 'playing' && v.phase === 'playing' && v.turn === i) cls.push('turn');
      if (i === v.you) cls.push('me');
      const res = p.result ? `<span class="bj-res ${p.net > 0 ? 'win' : p.net < 0 ? 'lose' : ''}">${p.result}${v.status === 'roundEnd' ? ` ${p.net > 0 ? '+' : ''}${p.net}` : ''}</span>` : '';
      const waiting = v.phase === 'betting' ? (p.bet ? `<span class="badge ok">Bahis: ${p.bet}</span>` : '<span class="badge">Bahis bekleniyor</span>') : `<span class="chip-stack">${p.bet}</span>`;
      return `<div class="${cls.join(' ')}">
        <div class="pname">${esc(p.name)}${i === v.you ? ' <span class="badge me">Sen</span>' : ''}</div>
        <div class="pmeta">💰 ${p.chips} çip</div>
        <div class="bj-cards">${p.hand.map(id => Cards.cardHTML(id, { sm: true })).join('')}</div>
        <div class="bj-total">${p.hand.length ? `<b>${p.total}</b>${p.soft && p.total < 21 ? ' (yumuşak)' : ''}` : '&nbsp;'}</div>
        <div>${waiting} ${res}</div>
      </div>`;
    }).join('');

    let controls = '', status = '';
    if (v.status === 'roundEnd') {
      status = me.net > 0 ? `<b class="good">Kazandın! +${me.net}</b>` : me.net < 0 ? `Kaybettin: ${me.net}` : 'Berabere.';
      controls = api.isHost()
        ? '<button class="btn primary" data-act="nextRound">Sonraki El</button><button class="btn ghost sm" data-act="toLobby">Lobiye Dön</button>'
        : '<span class="muted-light">Kurucunun yeni eli başlatması bekleniyor…</span>';
    } else if (v.phase === 'betting') {
      if (!me.bet) {
        status = '<b>Bahsini koy.</b> Çiplere tıklayıp miktarı belirle.';
        controls = `
          <div class="chips">${[10, 25, 50, 100, 250].map(c => `<button class="chip c${c}" data-mact="addChip" data-c="${c}" ${me.chips < c ? 'disabled' : ''}>${c}</button>`).join('')}
            <button class="btn sm" data-mact="allIn">Hepsi</button></div>
          <div class="bet-line">Bahis: <b>${betAmt}</b>
            <button class="btn sm ghost" data-mact="clearBet">Temizle</button>
            <button class="btn primary" data-mact="bet" ${betAmt >= MIN_BET ? '' : 'disabled'}>Bahis Koy</button></div>`;
      } else status = 'Diğer oyuncuların bahsi bekleniyor…';
    } else if (v.phase === 'playing') {
      if (v.turn === v.you) {
        status = `<b>Sıra sende!</b> Elin: ${me.total}`;
        controls = `<button class="btn primary" data-mact="hit">Kart Çek</button>
          <button class="btn" data-mact="stand">Dur</button>
          <button class="btn" data-mact="double" ${me.hand.length === 2 && me.chips >= me.bet ? '' : 'disabled'}>İkiye Katla</button>`;
      } else status = `Sıra: <b>${esc(v.players[v.turn].name)}</b>`;
    }

    el.innerHTML = `
      <div class="bj-table">
        ${dealer}
        <div class="bj-status">${status}</div>
        <div class="bj-controls">${controls}</div>
        <div class="bj-seats">${seats}</div>
      </div>`;
  }

  function onAct(act, el, api) {
    const v = api.view();
    if (!v) return;
    const me = v.players[v.you];
    if (act === 'addChip') { betAmt = Math.min(me.chips, betAmt + +el.dataset.c); api.rerender(); }
    else if (act === 'allIn') { betAmt = me.chips; api.rerender(); }
    else if (act === 'clearBet') { betAmt = 0; api.rerender(); }
    else if (act === 'bet') api.send({ type: 'bet', amount: betAmt });
    else if (act === 'hit' || act === 'stand' || act === 'double') api.send({ type: act });
  }

  function scoresHTML(v, api) {
    const esc = api.esc;
    const order = v.players.slice().sort((a, b) => b.chips - a.chips);
    return `<h3>Çip Sıralaması</h3>
      <table class="score-table"><tbody>${order.map((p, k) => `<tr><td>${k + 1}.</td><td style="text-align:left">${esc(p.name)}</td><td><b>${p.chips}</b></td></tr>`).join('')}</tbody></table>
      <p class="muted tiny">Herkes ${START_CHIPS} çiple başlar. Çipi biten yeniden ${START_CHIPS} alır. En çok çipi olan önde.</p>`;
  }

  const mode = { key: 'blackjack', title: 'Blackjack', desc: '1-4 kişi · krupiyeye karşı', min: 1, max: 4, Engine, GameError, handValue, render, onAct, scoresHTML };
  if (typeof module !== 'undefined' && module.exports) module.exports = mode;
  else { root.GameModes = root.GameModes || {}; root.GameModes.blackjack = mode; }
})(this);
