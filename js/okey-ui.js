/* Okey 101 — arayüz (ıstaka, masa, sürükle-bırak) */
(function (root) {
  'use strict';
  const R = root.OkeyRules;
  const { Game, GameError } = root.OkeyEngine;

  const COLS = 16, RACK_SIZE = 32;
  const $ = (s) => document.querySelector(s);

  const U = {
    rack: new Array(RACK_SIZE).fill(null), selected: new Set(), rackKey: null,
    modalHidden: false, lastRound: null, lastStatus: null,
  };
  let V = null, API = null;

  // ================= Istaka =================
  function sortKey(id) {
    const t = R.tileInfo(id);
    return t.fake ? 999 : t.c * 20 + t.n;
  }

  // Grupları aralarında boşlukla yerleştir, kalanları sona diz
  function layout(groups, rest) {
    const rack = new Array(RACK_SIZE).fill(null);
    let row = 0, col = 0;
    for (const g of groups) {
      if (col + g.length > COLS) { row++; col = 0; }
      if (row > 1 || g.length > COLS) return null;
      g.forEach((id, k) => { rack[row * COLS + col + k] = id; });
      col += g.length + 1;
    }
    let pos = row * COLS + col;
    for (let i = 0; i < rest.length; i++) {
      while (pos < RACK_SIZE && rack[pos] !== null) pos++;
      if (pos >= RACK_SIZE) {
        const empty = rack.map((x, k) => (x === null ? k : -1)).filter(k => k >= 0);
        const left = rest.slice(i);
        if (left.length > empty.length) return null;
        left.forEach((x, k) => { rack[empty[k]] = x; });
        return rack;
      }
      rack[pos++] = rest[i];
    }
    return rack;
  }

  function applyLayout(groups, rest) {
    rest = rest.slice().sort((a, b) => sortKey(a) - sortKey(b));
    const r = layout(groups, rest) || layout([], groups.flat().concat(rest));
    if (r) U.rack = r;
    U.selected.clear();
  }

  function arrangeByColor(hand) {
    const by = [[], [], [], [], []];
    for (const id of hand) { const t = R.tileInfo(id); by[t.fake ? 4 : t.c].push(id); }
    by.forEach(a => a.sort((x, y) => sortKey(x) - sortKey(y)));
    U.rack = layout(by.filter(a => a.length), []) || layout([], hand.slice().sort((a, b) => sortKey(a) - sortKey(b)));
  }

  function arrangeSeries() {
    const best = R.findBestGroups(V.hand, V.okey);
    const used = new Set(best.groups.flat());
    applyLayout(best.groups, V.hand.filter(id => !used.has(id)));
    redraw();
  }

  function arrangePairs() {
    const pairs = R.findPairs(V.hand, V.okey);
    const used = new Set(pairs.flat());
    applyLayout(pairs, V.hand.filter(id => !used.has(id)));
    redraw();
  }

  function syncRack(v) {
    const key = `${v.gameId}:${v.round}`;
    if (key !== U.rackKey) {
      U.rackKey = key;
      U.selected.clear();
      arrangeByColor(v.hand);
      return;
    }
    const inHand = new Set(v.hand);
    U.rack = U.rack.map(id => (id !== null && inHand.has(id) ? id : null));
    for (const id of [...U.selected]) if (!inHand.has(id)) U.selected.delete(id);
    const onRack = new Set(U.rack.filter(id => id !== null));
    for (const id of v.hand) {
      if (onRack.has(id)) continue;
      let last = -1;
      U.rack.forEach((x, i) => { if (x !== null) last = i; });
      const pos = last + 2 < RACK_SIZE ? last + 2 : U.rack.indexOf(null);
      U.rack[pos] = id;
      onRack.add(id);
    }
  }

  function moveToSlot(id, target) {
    const rack = U.rack;
    const from = rack.indexOf(id);
    if (from < 0 || from === target) return;
    rack[from] = null;
    if (rack[target] === null) { rack[target] = id; return; }
    const start = Math.floor(target / COLS) * COLS, end = start + COLS;
    let e = -1;
    for (let i = target + 1; i < end; i++) if (rack[i] === null) { e = i; break; }
    if (e >= 0) {
      for (let i = e; i > target; i--) rack[i] = rack[i - 1];
      rack[target] = id;
      return;
    }
    for (let i = target - 1; i >= start; i--) if (rack[i] === null) { e = i; break; }
    if (e >= 0) {
      for (let i = e; i < target; i++) rack[i] = rack[i + 1];
      rack[target] = id;
      return;
    }
    rack[from] = rack[target];
    rack[target] = id;
  }

  // Istakadaki bitişik taş grupları
  function rackSegments() {
    const segs = [];
    for (let row = 0; row < 2; row++) {
      let cur = [];
      for (let col = 0; col <= COLS; col++) {
        const id = col < COLS ? U.rack[row * COLS + col] : null;
        if (id !== null) cur.push(id);
        else { if (cur.length) segs.push(cur); cur = []; }
      }
    }
    return segs;
  }

  function rackPlan() {
    const ok = V.okey;
    const series = [], pairs = [];
    let sum = 0;
    for (const seg of rackSegments()) {
      if (seg.length >= 3) {
        const r = R.analyzeGroup(seg, ok);
        if (r) { series.push(seg); sum += r.value; continue; }
      }
      if (seg.length % 2 === 0) {
        const ps = [];
        for (let i = 0; i < seg.length; i += 2) ps.push([seg[i], seg[i + 1]]);
        if (ps.every(p => R.isPair(p, ok))) pairs.push(...ps);
      }
    }
    return { series, sum, pairs };
  }

  // ================= Çizim =================
  function tileHTML(id, opts = {}) {
    const t = R.tileInfo(id);
    const cls = ['tile'];
    if (opts.sm) cls.push('sm');
    if (opts.cls) cls.push(opts.cls);
    if (t.fake) {
      cls.push('fake');
      return `<div class="${cls.join(' ')}" data-id="${id}" title="Sahte okey"><span class="num">★</span></div>`;
    }
    cls.push('c' + t.c);
    if (V && R.isWild(id, V.okey)) cls.push('wild');
    return `<div class="${cls.join(' ')}" data-id="${id}"><span class="num">${t.n}</span><span class="dot"></span></div>`;
  }

  function myTurnPhase(phase) {
    return V.status === 'playing' && V.turn === V.you && (!phase || V.phase === phase);
  }

  function playerBox(i) {
    const esc = API.esc;
    const p = V.players[i];
    const meta = V.seats && V.seats[i];
    const prevOfMe = (V.you + 3) % 4 === i;
    const top = p.discards[p.discards.length - 1];
    const canTake = prevOfMe && myTurnPhase('draw') && top !== undefined;
    const flags = [];
    if (meta && meta.kind === 'bot') flags.push('<span class="badge">Bot</span>');
    if (meta && meta.kind === 'remote' && !meta.connected) flags.push('<span class="badge warn">Koptu</span>');
    if (meta && meta.voice) flags.push(`<span class="badge">${meta.muted ? '🔇' : '🎤'}</span>`);
    if (i === V.dealer) flags.push('<span class="badge">Dağıtan</span>');
    if (p.opened) flags.push(`<span class="badge ok">${p.openType === 'pairs' ? 'Çift açtı' : 'Açtı'}</span>`);
    const discard = `<div class="pdiscard ${canTake ? 'takeable' : ''}" ${canTake ? 'data-mact="takeDiscard" title="Bu taşı al"' : ''}>
        ${top !== undefined ? tileHTML(top) : '<div class="tile empty"></div>'}
        <small>${prevOfMe ? (canTake ? 'Al' : 'Soldan') : 'Attığı'} (${p.discards.length})</small>
      </div>`;
    return `<div class="pbox ${V.status === 'playing' && V.turn === i ? 'turn' : ''}">
        <div class="pname">${esc(p.name)}</div>
        <div class="pmeta">${p.count} taş · <b>${p.total}</b> puan</div>
        <div class="flags">${flags.join('')}</div>
      </div>${discard}`;
  }

  function render(v, api) {
    V = v;
    API = api;
    syncRack(v);
    if (v.round !== U.lastRound || (v.status === 'roundEnd' && U.lastStatus !== 'roundEnd')) U.modalHidden = false;
    U.lastRound = v.round;
    U.lastStatus = v.status;
    redraw();
  }

  function redraw() {
    const v = V, esc = API.esc;
    if (!v) return;
    const me = v.players[v.you];
    $('#pTop').innerHTML = playerBox((v.you + 2) % 4);
    $('#pLeft').innerHTML = playerBox((v.you + 3) % 4);
    $('#pRight').innerHTML = playerBox((v.you + 1) % 4);

    const canDraw = myTurnPhase('draw') && v.pileCount > 0;
    $('#centerBar').innerHTML = `
      <div class="pile ${canDraw ? 'active' : ''}" ${canDraw ? 'data-mact="drawPile" title="Desteden çek"' : ''}>
        <div class="tile back"></div><div class="tile back stack"></div>
        <span>Deste: <b>${v.pileCount}</b></span>
      </div>
      <div class="ind"><small>Gösterge</small>${tileHTML(v.indicator)}</div>
      <div class="ind"><small>Okey</small>${tileHTML(R.okeyTileId(v.okey))}</div>
      <div class="round-info"><b>${v.round}. El</b><br><small>Sıra: ${esc(v.players[v.turn].name)}</small></div>`;

    const canAdd = myTurnPhase('play') && me.opened;
    const byOwner = [0, 1, 2, 3].map(o => ({ o, gs: v.table.filter(g => g.owner === o) })).filter(x => x.gs.length);
    $('#tableGroups').innerHTML = byOwner.length ? byOwner.map(({ o, gs }) => `
      <div class="tg-owner"><div class="tg-name">${esc(v.players[o].name)}</div>
        <div class="tg-list">${gs.map(g => `<div class="tgroup ${canAdd && g.kind !== 'pair' ? 'droppable' : ''}" data-group="${g.id}" ${canAdd ? 'data-mact="groupClick"' : ''}>${g.tiles.map(id => tileHTML(id, { sm: true })).join('')}</div>`).join('')}</div>
      </div>`).join('') : '<div class="empty-table">Henüz kimse elini açmadı. Açmak için perlerin toplamı en az 101 olmalı ya da en az 5 çift.</div>';

    const myFlags = [];
    if (v.you === v.dealer) myFlags.push('<span class="badge">Dağıtan</span>');
    if (me.opened) myFlags.push(`<span class="badge ok">${me.openType === 'pairs' ? 'Çift açtın' : 'Açtın'}</span>`);
    if (me.penalty) myFlags.push(`<span class="badge warn">Ceza +${me.penalty}</span>`);
    $('#meInfo').innerHTML = `<b>${esc(me.name)}</b> · ${me.total} puan ${myFlags.join('')}`;

    const plan = rackPlan();
    let status;
    const actions = [
      '<button class="btn sm" data-mact="sortSeries" title="Perleri otomatik diz">Seri Diz</button>',
      '<button class="btn sm" data-mact="sortPairs" title="Çiftleri otomatik diz">Çift Diz</button>',
    ];
    if (v.status === 'roundEnd') {
      status = 'El bitti.';
      actions.push('<button class="btn sm primary" data-mact="showResult">Sonuçlar</button>');
    } else if (myTurnPhase('draw')) {
      status = '<b>Sıra sende!</b> Desteden ya da soldaki oyuncunun attığından taş çek.';
    } else if (myTurnPhase('play')) {
      const mustInHand = v.mustUse !== null && v.hand.includes(v.mustUse);
      status = '<b>Sıra sende!</b> ' + (mustInHand ? 'Yerden aldığın taşı bu tur kullanmalısın. ' : '') + 'Taşı sağdaki kutuya sürükle ya da seçip "At".';
      if (!me.opened) actions.push(`<button class="btn sm primary" data-mact="open" title="Istakada boşlukla ayrılmış perlerle aç">El Aç (${plan.sum} / ${plan.pairs.length} çift)</button>`);
      else actions.push('<button class="btn sm primary" data-mact="lay" title="Istakadaki geçerli perleri yere indir">Yere İndir</button>');
      if (mustInHand) actions.push('<button class="btn sm danger" data-mact="giveBack" title="Taşı geri ver, 101 ceza yazılır">Geri Ver (+101)</button>');
      actions.push(`<button class="btn sm" data-mact="discardSel" ${U.selected.size === 1 ? '' : 'disabled'}>At</button>`);
    } else {
      status = `Sıra: <b>${esc(v.players[v.turn].name)}</b>`;
    }
    if (!me.opened && v.status === 'playing') {
      status += `<div class="hint">Istakadaki perler: <b class="${plan.sum >= 101 ? 'good' : ''}">${plan.sum}</b>/101 · Çift: <b class="${plan.pairs.length >= 5 ? 'good' : ''}">${plan.pairs.length}</b>/5</div>`;
    }
    $('#status').innerHTML = status;
    $('#actions').innerHTML = actions.join('');

    $('#rack').innerHTML = [0, 1].map(row => {
      let h = '';
      for (let c = 0; c < COLS; c++) {
        const i = row * COLS + c, id = U.rack[i];
        let tile = '';
        if (id !== null) {
          const cls = [U.selected.has(id) ? 'selected' : '', id === v.lastDrawn ? 'new' : '', id === v.mustUse ? 'must' : ''].join(' ');
          tile = tileHTML(id, { cls });
        }
        h += `<div class="slot" data-slot="${i}">${tile}</div>`;
      }
      return `<div class="rack-row">${h}</div>`;
    }).join('');

    const myTop = me.discards[me.discards.length - 1];
    $('#myDiscard').innerHTML = `${myTop !== undefined ? tileHTML(myTop) : '<div class="tile empty"></div>'}<small>${myTurnPhase('play') ? 'Buraya at' : 'Attığın'}</small>`;
    $('#myDiscard').classList.toggle('active', myTurnPhase('play'));
    renderModal();
  }

  function renderModal() {
    const v = V, esc = API.esc;
    const m = $('#modal');
    if (v.status !== 'roundEnd' || !v.result || U.modalHidden) { m.classList.add('hidden'); return; }
    const r = v.result;
    const rows = v.players.map((p, i) => `
      <tr class="${i === r.winner ? 'win' : ''}">
        <td>${esc(p.name)}${i === r.winner ? ' 🏆' : ''}</td>
        <td>${i === r.winner ? 'Bitirdi' : r.opened[i] ? 'Açtı' : 'Açmadı'}${r.penalties[i] ? ` (+${r.penalties[i]} ceza)` : ''}</td>
        <td class="num ${r.scores[i] < 0 ? 'good' : ''}">${r.scores[i] > 0 ? '+' : ''}${r.scores[i]}</td>
        <td class="num"><b>${p.total}</b></td>
      </tr>
      <tr class="hand-row"><td colspan="4">${r.hands[i].map(id => tileHTML(id, { sm: true })).join('')}</td></tr>`).join('');
    $('#modalCard').innerHTML = `
      <h2>${v.round}. El Bitti</h2>
      <p class="reason">${esc(r.reason)}</p>
      <table class="result-table"><thead><tr><th>Oyuncu</th><th>Durum</th><th>Bu el</th><th>Toplam</th></tr></thead><tbody>${rows}</tbody></table>
      <div class="row">
        ${API.isHost() ? '<button class="btn primary" data-act="nextRound">Sonraki El</button><button class="btn" data-act="toLobby">Lobiye Dön</button>' : '<span class="muted">Kurucunun yeni eli başlatması bekleniyor…</span>'}
        <button class="btn ghost" data-mact="closeModal">Masaya Bak</button>
      </div>`;
    m.classList.remove('hidden');
  }

  function scoresHTML(v, api) {
    const esc = api.esc;
    const lead = v.players.slice().sort((a, b) => a.total - b.total)[0];
    const head = v.players.map(p => `<th>${esc(p.name)}</th>`).join('');
    const rows = v.history.map((h, r) => `<tr><td>${r + 1}</td>${h.map(x => `<td>${x}</td>`).join('')}</tr>`).join('');
    const tot = `<tr class="tot"><td>Σ</td>${v.players.map(p => `<td>${p.total}</td>`).join('')}</tr>`;
    return `<h3>Puan Tablosu</h3><div class="leader">Önde: <b>${esc(lead.name)}</b> (${lead.total})</div>
      <table class="score-table"><thead><tr><th>El</th>${head}</tr></thead><tbody>${rows}${tot}</tbody></table>
      <p class="muted tiny">En düşük puan kazanır. Bitiren −101 (okeyle −202). Açmayan +202, açan elindeki taş toplamı. Okeyle veya çiftten bitince cezalar 2 kat.</p>`;
  }

  // ================= Hamleler =================
  function doOpen() {
    const plan = rackPlan();
    if (plan.sum >= R.OPEN_SERIES_MIN) return API.send({ type: 'open', mode: 'series', groups: plan.series });
    if (plan.pairs.length >= R.OPEN_PAIRS_MIN) return API.send({ type: 'open', mode: 'pairs', groups: plan.pairs });
    API.toast(`Açmak için ıstakada boşlukla ayrılmış perlerin toplamı 101 olmalı (şu an ${plan.sum}) ya da 5 çift (şu an ${plan.pairs.length}). İpucu: "Seri Diz" / "Çift Diz".`);
  }

  function doLay() {
    const me = V.players[V.you];
    const plan = rackPlan();
    const groups = me.openType === 'pairs' ? plan.pairs : plan.series;
    if (!groups.length) return API.toast(me.openType === 'pairs' ? 'Istakada indirilecek çift yok.' : 'Istakada indirilecek geçerli per yok (en az 3 taş, boşlukla ayrılmış).');
    API.send({ type: 'lay', groups });
  }

  function doDiscard(id) {
    if (!myTurnPhase('play')) return API.toast(myTurnPhase('draw') ? 'Önce taş çekmelisin.' : 'Sıra sende değil.');
    API.send({ type: 'discard', tile: id });
  }

  function doAddToGroup(groupId, ids) {
    if (!myTurnPhase('play')) return API.toast('Sıra sende değil.');
    if (!V.players[V.you].opened) return API.toast('İşlemek için önce elini açmalısın.');
    if (!ids.length) return API.toast('Önce ıstakadan işlenecek taşı seç (ya da taşı pere sürükle).');
    U.selected.clear();
    API.send({ type: 'add', groupId, tiles: ids });
  }

  function onAct(act, el, api) {
    API = api;
    switch (act) {
      case 'drawPile': api.send({ type: 'draw', from: 'pile' }); break;
      case 'takeDiscard': api.send({ type: 'draw', from: 'discard' }); break;
      case 'groupClick': doAddToGroup(+el.dataset.group, [...U.selected]); break;
      case 'sortSeries': arrangeSeries(); break;
      case 'sortPairs': arrangePairs(); break;
      case 'open': doOpen(); break;
      case 'lay': doLay(); break;
      case 'giveBack': api.send({ type: 'giveBack' }); break;
      case 'discardSel': if (U.selected.size === 1) doDiscard([...U.selected][0]); break;
      case 'closeModal': U.modalHidden = true; renderModal(); break;
      case 'showResult': U.modalHidden = false; renderModal(); break;
    }
  }

  // ================= Sürükle-bırak =================
  let drag = null;

  function clearOver() {
    document.querySelectorAll('.over').forEach(el => el.classList.remove('over'));
  }

  function dropTarget(x, y) {
    const el = document.elementFromPoint(x, y);
    if (!el) return null;
    return el.closest('[data-slot]') || el.closest('[data-drop="discard"]') || el.closest('[data-group]');
  }

  document.addEventListener('pointerdown', (e) => {
    const t = e.target.closest('#rack .tile[data-id]');
    if (!t || e.button > 0 || !V) return;
    e.preventDefault();
    drag = { id: +t.dataset.id, x: e.clientX, y: e.clientY, moved: false, ghost: null };
  });

  document.addEventListener('pointermove', (e) => {
    if (!drag) return;
    if (!drag.moved && Math.hypot(e.clientX - drag.x, e.clientY - drag.y) > 6) {
      drag.moved = true;
      const src = document.querySelector(`#rack .tile[data-id="${drag.id}"]`);
      drag.ghost = (src || document.createElement('div')).cloneNode(true);
      drag.ghost.classList.add('ghost');
      document.body.appendChild(drag.ghost);
      if (src) src.classList.add('dragging');
    }
    if (drag.moved) {
      drag.ghost.style.left = e.clientX + 'px';
      drag.ghost.style.top = e.clientY + 'px';
      clearOver();
      const tg = dropTarget(e.clientX, e.clientY);
      if (tg) tg.classList.add('over');
    }
  });

  document.addEventListener('pointerup', (e) => {
    if (!drag) return;
    const d = drag;
    drag = null;
    clearOver();
    if (!d.moved) {
      if (U.selected.has(d.id)) U.selected.delete(d.id); else U.selected.add(d.id);
      redraw();
      return;
    }
    d.ghost.remove();
    const tg = dropTarget(e.clientX, e.clientY);
    if (tg && tg.dataset.slot !== undefined) moveToSlot(d.id, +tg.dataset.slot);
    else if (tg && tg.dataset.drop === 'discard') { redraw(); return doDiscard(d.id); }
    else if (tg && tg.dataset.group !== undefined) {
      const ids = U.selected.has(d.id) && U.selected.size > 1 ? [...U.selected] : [d.id];
      redraw();
      return doAddToGroup(+tg.dataset.group, ids);
    }
    redraw();
  });

  document.addEventListener('pointercancel', () => {
    if (drag && drag.ghost) drag.ghost.remove();
    drag = null;
    clearOver();
    redraw();
  });

  root.GameModes = root.GameModes || {};
  root.GameModes.okey = {
    key: 'okey', title: 'Okey 101', desc: '4 kişi · 106 taş', min: 4, max: 4,
    Engine: Game, GameError, render, onAct, scoresHTML, ui: U,
  };
})(this);
