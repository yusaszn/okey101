/* Okey 101 — online oda (PeerJS) + arayüz */
(function () {
  'use strict';
  const R = window.OkeyRules;
  const { Game, GameError } = window.OkeyEngine;

  const PREFIX = 'ys-okey101-';
  const PEER_OPTS = { debug: 1 };
  const COLS = 16, RACK_SIZE = 32;
  const BOT_NAMES = ['Bot Ali', 'Bot Ayşe', 'Bot Mehmet', 'Bot Zeynep', 'Bot Can', 'Bot Elif'];

  const $ = (s) => document.querySelector(s);
  const esc = (s) => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const store = {
    get(k) { try { return localStorage.getItem(k); } catch { return null; } },
    set(k, v) { try { localStorage.setItem(k, v); } catch { /* yok say */ } },
  };

  const S = {
    role: null, name: '', code: '', seat: null,
    peer: null, conn: null, joined: false,
    seats: [null, null, null, null], game: null, botTimer: null,
    lobby: null, view: null,
    rack: new Array(RACK_SIZE).fill(null), selected: new Set(), rackRound: 0,
    chat: [], modalHidden: false, wasMyTurn: false,
  };

  // ================= Ortak =================
  function show(id) {
    document.querySelectorAll('.screen').forEach(el => el.classList.toggle('active', el.id === id));
  }

  let toastTimer;
  function toast(msg) {
    const t = $('#toast');
    t.textContent = msg;
    t.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => t.classList.remove('show'), 3500);
  }

  function send(conn, msg) {
    try { if (conn && conn.open) conn.send(msg); } catch (e) { console.warn(e); }
  }

  function cleanText(s, max) {
    return String(s || '').replace(/\s+/g, ' ').trim().slice(0, max);
  }

  function shareLink() {
    return location.origin + location.pathname + '?oda=' + S.code;
  }

  function sendAction(action) {
    if (S.role === 'host') hostAction(0, action);
    else send(S.conn, { t: 'act', action });
  }

  function sendChat(text) {
    text = cleanText(text, 200);
    if (!text) return;
    if (S.role === 'host') pushChat({ name: S.seats[0].name, text });
    else send(S.conn, { t: 'chat', text });
  }

  // ================= Oda kurucusu (host) =================
  function genCode() {
    const A = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
    let s = '';
    for (let i = 0; i < 5; i++) s += A[Math.floor(Math.random() * A.length)];
    return s;
  }

  function hostCreate() {
    S.role = 'host';
    S.code = genCode();
    S.seat = 0;
    $('#menuMsg').textContent = 'Oda kuruluyor…';
    const peer = new Peer(PREFIX + S.code, PEER_OPTS);
    S.peer = peer;
    peer.on('open', () => {
      S.seats = [{ name: S.name, kind: 'host', connected: true }, null, null, null];
      history.replaceState(null, '', '?oda=' + S.code);
      $('#menuMsg').textContent = '';
      show('lobby');
      hostSync();
    });
    peer.on('connection', hostAccept);
    peer.on('disconnected', () => { if (!peer.destroyed) peer.reconnect(); });
    peer.on('error', (err) => {
      if (err.type === 'unavailable-id' && !S.seats[0]) { peer.destroy(); hostCreate(); return; }
      if (err.type === 'network' || err.type === 'server-error' || err.type === 'socket-error') toast('Sunucu bağlantısı sorunlu, tekrar deneniyor…');
      else if (err.type !== 'peer-unavailable') toast('Bağlantı hatası: ' + err.type);
      if (!S.seats[0]) $('#menuMsg').textContent = 'Oda kurulamadı: ' + err.type;
    });
  }

  function hostAccept(conn) {
    conn.on('data', (msg) => hostOnMsg(conn, msg));
    conn.on('close', () => hostOnClose(conn));
    conn.on('error', () => hostOnClose(conn));
  }

  function seatOfConn(conn) {
    return S.seats.findIndex(s => s && s.conn === conn);
  }

  function hostOnMsg(conn, msg) {
    if (!msg || typeof msg !== 'object') return;
    if (msg.t === 'join') return hostJoin(conn, cleanText(msg.name, 16) || 'Oyuncu');
    const seat = seatOfConn(conn);
    if (seat < 0) return;
    if (msg.t === 'act') hostAction(seat, msg.action);
    else if (msg.t === 'chat') {
      const text = cleanText(msg.text, 200);
      if (text) pushChat({ name: S.seats[seat].name, text });
    }
  }

  function hostJoin(conn, name) {
    let seat;
    if (S.game) {
      // Oyun başladıysa sadece aynı isimle kopan oyuncu geri dönebilir
      seat = S.seats.findIndex(s => s && s.kind === 'remote' && s.name === name);
      if (seat < 0) return send(conn, { t: 'reject', msg: 'Oyun başlamış. Sadece kopan oyuncular aynı isimle geri girebilir.' });
      const old = S.seats[seat].conn;
      if (old && old !== conn) { S.seats[seat].conn = null; try { old.close(); } catch { /* yok say */ } }
      Object.assign(S.seats[seat], { conn, connected: true });
      pushChat({ name: null, text: `${name} geri döndü.` });
    } else {
      let n = name, k = 2;
      while (S.seats.some(s => s && s.name === n)) n = `${name} ${k++}`;
      name = n;
      seat = S.seats.findIndex(s => !s);
      if (seat < 0) return send(conn, { t: 'reject', msg: 'Oda dolu.' });
      S.seats[seat] = { name, kind: 'remote', conn, connected: true };
      pushChat({ name: null, text: `${name} odaya katıldı.` });
    }
    send(conn, { t: 'welcome', seat, name, code: S.code });
    send(conn, { t: 'chatAll', list: S.chat.slice(-50) });
    hostSync();
    scheduleBots();
  }

  function hostOnClose(conn) {
    const seat = seatOfConn(conn);
    if (seat < 0) return;
    const s = S.seats[seat];
    if (!S.game) {
      S.seats[seat] = null;
      pushChat({ name: null, text: `${s.name} odadan ayrıldı.` });
    } else {
      s.connected = false;
      s.conn = null;
      pushChat({ name: null, text: `${s.name} koptu, yerine bot oynuyor. Aynı isimle geri girebilir.` });
    }
    hostSync();
    scheduleBots();
  }

  function seatMeta() {
    return S.seats.map(s => s && { name: s.name, kind: s.kind, connected: s.connected });
  }

  function hostSync() {
    if (!S.game) {
      S.lobby = { code: S.code, seats: seatMeta() };
      renderLobby();
      for (const s of S.seats) if (s && s.kind === 'remote' && s.connected) send(s.conn, { t: 'lobby', lobby: S.lobby });
      return;
    }
    const meta = seatMeta();
    S.seats.forEach((s, i) => {
      if (!s) return;
      const view = S.game.viewFor(i);
      view.seats = meta;
      if (s.kind === 'host') onView(view);
      else if (s.kind === 'remote' && s.connected) send(s.conn, { t: 'state', view });
    });
  }

  function hostAction(seat, action) {
    const g = S.game;
    if (!g) return;
    if (action && action.type === 'nextRound') {
      if (seat === 0 && g.status === 'roundEnd') { g.startRound(); hostSync(); scheduleBots(); }
      return;
    }
    try {
      g.apply(seat, action);
    } catch (e) {
      if (!(e instanceof GameError)) console.error(e);
      if (seat === 0) toast(e.message);
      else send(S.seats[seat].conn, { t: 'error', msg: e.message });
      return;
    }
    hostSync();
    scheduleBots();
  }

  function isBotSeat(i) {
    const s = S.seats[i];
    return s && (s.kind === 'bot' || (s.kind === 'remote' && !s.connected));
  }

  function scheduleBots() {
    clearTimeout(S.botTimer);
    const g = S.game;
    if (!g || g.status !== 'playing' || !isBotSeat(g.turn)) return;
    const delay = S.seats[g.turn].kind === 'bot' ? 1100 : 3000;
    S.botTimer = setTimeout(() => {
      if (g.status === 'playing' && isBotSeat(g.turn)) {
        try { g.botTurn(g.turn); } catch (e) { console.error(e); }
      }
      hostSync();
      scheduleBots();
    }, delay);
  }

  function hostAddBot(i) {
    if (S.game || S.seats[i]) return;
    const used = new Set(S.seats.filter(Boolean).map(s => s.name));
    const name = BOT_NAMES.find(n => !used.has(n)) || 'Bot ' + (i + 1);
    S.seats[i] = { name, kind: 'bot', connected: true };
    hostSync();
  }

  function hostKick(i) {
    const s = S.seats[i];
    if (S.game || !s || s.kind === 'host') return;
    if (s.kind === 'remote') { send(s.conn, { t: 'reject', msg: 'Kurucu seni odadan çıkardı.' }); setTimeout(() => { try { s.conn.close(); } catch { /* yok say */ } }, 300); }
    S.seats[i] = null;
    hostSync();
  }

  function hostStart() {
    if (S.game) return;
    if (!S.seats.every(Boolean)) return toast('4 oyuncu gerekli. Boş yerlere bot ekleyebilirsin.');
    S.game = new Game(S.seats.map(s => s.name));
    S.game.startRound();
    pushChat({ name: null, text: 'Oyun başladı. Bol şans!' });
    hostSync();
    scheduleBots();
  }

  function pushChat(m) {
    S.chat.push(m);
    if (S.chat.length > 100) S.chat.shift();
    renderChat();
    if (S.role === 'host') for (const s of S.seats) if (s && s.kind === 'remote' && s.connected) send(s.conn, { t: 'chat', m });
  }

  // ================= Katılan oyuncu (client) =================
  let joinTimer;
  function clientJoin(code) {
    S.role = 'client';
    S.code = code;
    S.joined = false;
    if (S.peer) { try { S.peer.destroy(); } catch { /* yok say */ } }
    $('#menuMsg').textContent = 'Bağlanılıyor…';
    const peer = new Peer(PEER_OPTS);
    S.peer = peer;
    clearTimeout(joinTimer);
    joinTimer = setTimeout(() => {
      if (!S.joined) { $('#menuMsg').textContent = 'Bağlanamadı. Oda kodunu kontrol edip tekrar dene.'; hideOverlay(); }
    }, 15000);
    peer.on('open', () => {
      const conn = peer.connect(PREFIX + code, { reliable: true });
      S.conn = conn;
      conn.on('open', () => send(conn, { t: 'join', name: S.name }));
      conn.on('data', clientOnMsg);
      conn.on('close', () => { if (S.conn === conn && S.joined) onLost(); });
    });
    peer.on('error', (err) => {
      if (err.type === 'peer-unavailable') {
        $('#menuMsg').textContent = 'Oda bulunamadı. Kod yanlış olabilir ya da kurucu çıkmış.';
        if (S.joined) onLost(); else show('menu');
      } else if (!S.joined) $('#menuMsg').textContent = 'Bağlantı hatası: ' + err.type;
      else toast('Bağlantı hatası: ' + err.type);
    });
  }

  function clientOnMsg(msg) {
    if (!msg || typeof msg !== 'object') return;
    switch (msg.t) {
      case 'welcome':
        S.joined = true;
        S.seat = msg.seat;
        S.name = msg.name;
        clearTimeout(joinTimer);
        history.replaceState(null, '', '?oda=' + S.code);
        $('#menuMsg').textContent = '';
        hideOverlay();
        break;
      case 'reject':
        toast(msg.msg);
        $('#menuMsg').textContent = msg.msg;
        S.joined = false;
        try { S.peer.destroy(); } catch { /* yok say */ }
        show('menu');
        hideOverlay();
        break;
      case 'lobby':
        S.lobby = msg.lobby;
        renderLobby();
        break;
      case 'state':
        onView(msg.view);
        break;
      case 'error':
        toast(msg.msg);
        break;
      case 'chat':
        pushChat(msg.m);
        break;
      case 'chatAll':
        S.chat = Array.isArray(msg.list) ? msg.list : [];
        renderChat();
        break;
    }
  }

  function onLost() {
    S.joined = false;
    $('#overlayCard').innerHTML = `<h2>Bağlantı koptu</h2>
      <p>Kurucuyla bağlantı kesildi. Kurucu sayfayı kapattıysa oda kapanmıştır.</p>
      <div class="row"><button class="btn primary" data-act="reconnect">Yeniden Bağlan</button>
      <button class="btn" data-act="leave">Ana Menü</button></div>`;
    $('#overlay').classList.remove('hidden');
  }

  function hideOverlay() { $('#overlay').classList.add('hidden'); }

  // ================= Lobi =================
  function renderLobby() {
    const L = S.lobby;
    if (!L) return;
    show('lobby');
    const host = S.role === 'host';
    const full = L.seats.every(Boolean);
    const seats = L.seats.map((s, i) => {
      if (!s) {
        return `<li class="seat empty"><span>${i + 1}. Boş koltuk</span>${host ? `<button class="btn sm" data-act="addBot" data-i="${i}">+ Bot Ekle</button>` : ''}</li>`;
      }
      const tag = s.kind === 'host' ? '<span class="badge gold">Kurucu</span>' : s.kind === 'bot' ? '<span class="badge">Bot</span>' : '';
      const me = i === S.seat ? ' <span class="badge me">Sen</span>' : '';
      const kick = host && s.kind !== 'host' ? `<button class="btn sm ghost" data-act="kick" data-i="${i}">Çıkar</button>` : '';
      return `<li class="seat"><span>${i + 1}. ${esc(s.name)} ${tag}${me}</span>${kick}</li>`;
    }).join('');
    $('#lobbyCard').innerHTML = `
      <h2>Oda Kodu</h2>
      <div class="room-code">${esc(L.code)}</div>
      <div class="share"><input readonly value="${esc(shareLink())}"><button class="btn sm" data-act="copyLink">Linki Kopyala</button></div>
      <p class="muted">Linki arkadaşlarına gönder ya da oda kodunu söyle. Boş koltuklara bot ekleyebilirsin.</p>
      <ul class="seats">${seats}</ul>
      ${host
        ? `<button class="btn primary big" data-act="start" ${full ? '' : 'disabled'}>${full ? 'Oyunu Başlat' : `Oyuncu bekleniyor (${L.seats.filter(Boolean).length}/4)`}</button>`
        : `<p class="waiting">Kurucunun oyunu başlatması bekleniyor… (${L.seats.filter(Boolean).length}/4)</p>`}
      <button class="btn ghost sm" data-act="leave">Odadan Çık</button>`;
  }

  // ================= Istaka (rack) =================
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
    for (const id of rest) {
      while (pos < RACK_SIZE && rack[pos] !== null) pos++;
      if (pos >= RACK_SIZE) {
        // sığmadı: boş kalan her yere dağıt
        const empty = rack.map((x, i) => (x === null ? i : -1)).filter(i => i >= 0);
        const left = rest.slice(rest.indexOf(id));
        if (left.length > empty.length) return null;
        left.forEach((x, k) => { rack[empty[k]] = x; });
        return rack;
      }
      rack[pos++] = id;
    }
    return rack;
  }

  function applyLayout(groups, rest) {
    rest = rest.slice().sort((a, b) => sortKey(a) - sortKey(b));
    const r = layout(groups, rest) || layout([], groups.flat().concat(rest));
    if (r) S.rack = r;
    S.selected.clear();
  }

  function arrangeByColor(hand) {
    const by = [[], [], [], [], []];
    for (const id of hand) { const t = R.tileInfo(id); by[t.fake ? 4 : t.c].push(id); }
    by.forEach(a => a.sort((x, y) => sortKey(x) - sortKey(y)));
    const chunks = by.filter(a => a.length);
    S.rack = layout(chunks, []) || layout([], hand.slice().sort((a, b) => sortKey(a) - sortKey(b)));
  }

  function arrangeSeries() {
    const v = S.view;
    const best = R.findBestGroups(v.hand, v.okey);
    const used = new Set(best.groups.flat());
    applyLayout(best.groups, v.hand.filter(id => !used.has(id)));
    renderGame();
  }

  function arrangePairs() {
    const v = S.view;
    const pairs = R.findPairs(v.hand, v.okey);
    const used = new Set(pairs.flat());
    applyLayout(pairs, v.hand.filter(id => !used.has(id)));
    renderGame();
  }

  function syncRack(v) {
    if (v.round !== S.rackRound) {
      S.rackRound = v.round;
      S.selected.clear();
      arrangeByColor(v.hand);
      return;
    }
    const inHand = new Set(v.hand);
    S.rack = S.rack.map(id => (id !== null && inHand.has(id) ? id : null));
    for (const id of [...S.selected]) if (!inHand.has(id)) S.selected.delete(id);
    const onRack = new Set(S.rack.filter(id => id !== null));
    for (const id of v.hand) {
      if (onRack.has(id)) continue;
      let last = -1;
      S.rack.forEach((x, i) => { if (x !== null) last = i; });
      const pos = last + 2 < RACK_SIZE ? last + 2 : S.rack.indexOf(null);
      S.rack[pos] = id;
      onRack.add(id);
    }
  }

  function moveToSlot(id, target) {
    const rack = S.rack;
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
        const id = col < COLS ? S.rack[row * COLS + col] : null;
        if (id !== null) cur.push(id);
        else { if (cur.length) segs.push(cur); cur = []; }
      }
    }
    return segs;
  }

  function rackPlan() {
    const ok = S.view.okey;
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

  // ================= Oyun ekranı =================
  function onView(view) {
    const firstState = !S.view;
    const prevRound = S.view && S.view.round;
    const prevStatus = S.view && S.view.status;
    S.view = view;
    S.seat = view.you;
    syncRack(view);
    if (view.round !== prevRound || (view.status === 'roundEnd' && prevStatus !== 'roundEnd')) S.modalHidden = false;
    const myTurn = view.status === 'playing' && view.turn === view.you;
    if (myTurn && !S.wasMyTurn && !firstState) beep();
    S.wasMyTurn = myTurn;
    document.title = (myTurn ? '🔔 Sıra sende! — ' : '') + 'Okey 101 Online';
    show('game');
    renderGame();
  }

  function tileHTML(id, opts = {}) {
    const v = S.view;
    const t = R.tileInfo(id);
    const cls = ['tile'];
    if (opts.sm) cls.push('sm');
    if (opts.cls) cls.push(opts.cls);
    if (t.fake) {
      cls.push('fake');
      return `<div class="${cls.join(' ')}" data-id="${id}" title="Sahte okey"><span class="num">★</span></div>`;
    }
    cls.push('c' + t.c);
    if (v && R.isWild(id, v.okey)) cls.push('wild');
    return `<div class="${cls.join(' ')}" data-id="${id}"><span class="num">${t.n}</span><span class="dot"></span></div>`;
  }

  function myTurnPhase(phase) {
    const v = S.view;
    return v.status === 'playing' && v.turn === v.you && (!phase || v.phase === phase);
  }

  function playerBox(i) {
    const v = S.view;
    const p = v.players[i];
    const meta = v.seats && v.seats[i];
    const prevOfMe = (v.you + 3) % 4 === i;
    const top = p.discards[p.discards.length - 1];
    const canTake = prevOfMe && myTurnPhase('draw') && top !== undefined;
    const flags = [];
    if (meta && meta.kind === 'bot') flags.push('<span class="badge">Bot</span>');
    if (meta && meta.kind === 'remote' && !meta.connected) flags.push('<span class="badge warn">Koptu</span>');
    if (i === v.dealer) flags.push('<span class="badge">Dağıtan</span>');
    if (p.opened) flags.push(`<span class="badge ok">${p.openType === 'pairs' ? 'Çift açtı' : 'Açtı'}</span>`);
    const discard = `<div class="pdiscard ${canTake ? 'takeable' : ''}" ${canTake ? 'data-act="takeDiscard" title="Bu taşı al"' : ''}>
        ${top !== undefined ? tileHTML(top) : '<div class="tile empty"></div>'}
        <small>${prevOfMe ? (canTake ? 'Al' : 'Soldan') : 'Attığı'} (${p.discards.length})</small>
      </div>`;
    return `<div class="pbox ${v.status === 'playing' && v.turn === i ? 'turn' : ''}">
        <div class="pname">${esc(p.name)}</div>
        <div class="pmeta">${p.count} taş · <b>${p.total}</b> puan</div>
        <div class="flags">${flags.join('')}</div>
      </div>${discard}`;
  }

  function renderGame() {
    const v = S.view;
    if (!v) return;
    const me = v.players[v.you];
    const pos = { right: (v.you + 1) % 4, top: (v.you + 2) % 4, left: (v.you + 3) % 4 };
    $('#pTop').innerHTML = playerBox(pos.top);
    $('#pLeft').innerHTML = playerBox(pos.left);
    $('#pRight').innerHTML = playerBox(pos.right);

    // Orta: deste, gösterge, okey
    const canDraw = myTurnPhase('draw') && v.pileCount > 0;
    $('#centerBar').innerHTML = `
      <div class="pile ${canDraw ? 'active' : ''}" ${canDraw ? 'data-act="drawPile" title="Desteden çek"' : ''}>
        <div class="tile back"></div><div class="tile back stack"></div>
        <span>Deste: <b>${v.pileCount}</b></span>
      </div>
      <div class="ind"><small>Gösterge</small>${tileHTML(v.indicator)}</div>
      <div class="ind"><small>Okey</small>${tileHTML(R.okeyTileId(v.okey), { cls: 'okeyshow' })}</div>
      <div class="round-info"><b>${v.round}. El</b><br><small>Sıra: ${esc(v.players[v.turn].name)}</small></div>`;

    // Masadaki perler
    const canAdd = myTurnPhase('play') && me.opened;
    const byOwner = [0, 1, 2, 3].map(o => v.table.filter(g => g.owner === o)).map((gs, o) => ({ o, gs })).filter(x => x.gs.length);
    $('#tableGroups').innerHTML = byOwner.length ? byOwner.map(({ o, gs }) => `
      <div class="tg-owner"><div class="tg-name">${esc(v.players[o].name)}</div>
        <div class="tg-list">${gs.map(g => `<div class="tgroup ${canAdd && g.kind !== 'pair' ? 'droppable' : ''}" data-group="${g.id}" ${canAdd ? 'data-act="groupClick"' : ''}>${g.tiles.map(id => tileHTML(id, { sm: true })).join('')}</div>`).join('')}</div>
      </div>`).join('') : '<div class="empty-table">Henüz kimse elini açmadı. Açmak için perlerin toplamı en az 101 olmalı ya da en az 5 çift.</div>';

    // Benim bilgim + durum + butonlar
    const myFlags = [];
    if (v.you === v.dealer) myFlags.push('<span class="badge">Dağıtan</span>');
    if (me.opened) myFlags.push(`<span class="badge ok">${me.openType === 'pairs' ? 'Çift açtın' : 'Açtın'}</span>`);
    if (me.penalty) myFlags.push(`<span class="badge warn">Ceza +${me.penalty}</span>`);
    $('#meInfo').innerHTML = `<b>${esc(me.name)}</b> · ${me.total} puan ${myFlags.join('')}`;

    const plan = rackPlan();
    let status, actions = [];
    actions.push('<button class="btn sm" data-act="sortSeries" title="Perleri otomatik diz">Seri Diz</button>');
    actions.push('<button class="btn sm" data-act="sortPairs" title="Çiftleri otomatik diz">Çift Diz</button>');
    if (v.status === 'roundEnd') {
      status = 'El bitti.';
      actions.push('<button class="btn sm primary" data-act="showResult">Sonuçlar</button>');
    } else if (myTurnPhase('draw')) {
      status = '<b>Sıra sende!</b> Desteden ya da soldaki oyuncunun attığından taş çek.';
    } else if (myTurnPhase('play')) {
      const mustInHand = v.mustUse !== null && v.hand.includes(v.mustUse);
      status = '<b>Sıra sende!</b> ' + (mustInHand ? 'Yerden aldığın taşı bu tur kullanmalısın. ' : '') + 'Taşı ıstakadan sağdaki kutuya sürükle ya da seçip "At".';
      if (!me.opened) {
        actions.push(`<button class="btn sm primary" data-act="open" title="Istakada boşlukla ayrılmış perlerle aç">El Aç (${plan.sum} / ${plan.pairs.length} çift)</button>`);
      } else {
        actions.push('<button class="btn sm primary" data-act="lay" title="Istakadaki geçerli perleri yere indir">Yere İndir</button>');
      }
      if (mustInHand) actions.push('<button class="btn sm danger" data-act="giveBack" title="Taşı geri ver, 101 ceza yazılır">Geri Ver (+101)</button>');
      actions.push(`<button class="btn sm" data-act="discardSel" ${S.selected.size === 1 ? '' : 'disabled'}>At</button>`);
    } else {
      status = `Sıra: <b>${esc(v.players[v.turn].name)}</b>`;
    }
    if (!me.opened && v.status === 'playing') {
      status += `<div class="hint">Istakadaki perler: <b class="${plan.sum >= 101 ? 'good' : ''}">${plan.sum}</b>/101 · Çift: <b class="${plan.pairs.length >= 5 ? 'good' : ''}">${plan.pairs.length}</b>/5</div>`;
    }
    $('#status').innerHTML = status;
    $('#actions').innerHTML = actions.join('');

    // Istaka
    const rows = [0, 1].map(row => {
      let h = '';
      for (let c = 0; c < COLS; c++) {
        const i = row * COLS + c, id = S.rack[i];
        let tile = '';
        if (id !== null) {
          const cls = [S.selected.has(id) ? 'selected' : '', id === v.lastDrawn ? 'new' : '', id === v.mustUse ? 'must' : ''].join(' ');
          tile = tileHTML(id, { cls });
        }
        h += `<div class="slot" data-slot="${i}">${tile}</div>`;
      }
      return `<div class="rack-row">${h}</div>`;
    }).join('');
    $('#rack').innerHTML = rows;

    const myTop = me.discards[me.discards.length - 1];
    $('#myDiscard').innerHTML = `${myTop !== undefined ? tileHTML(myTop) : '<div class="tile empty"></div>'}<small>${myTurnPhase('play') ? 'Buraya at' : 'Attığın'}</small>`;
    $('#myDiscard').classList.toggle('active', myTurnPhase('play'));

    renderScores();
    $('#log').innerHTML = v.log.map(l => `<div>${esc(l)}</div>`).join('');
    $('#log').scrollTop = 1e9;
    renderModal();
  }

  function renderScores() {
    const v = S.view;
    const order = v.players.map((p, i) => ({ p, i })).sort((a, b) => a.p.total - b.p.total);
    const head = v.players.map(p => `<th>${esc(p.name)}</th>`).join('');
    const rows = v.history.map((h, r) => `<tr><td>${r + 1}</td>${h.map(x => `<td>${x}</td>`).join('')}</tr>`).join('');
    const tot = `<tr class="tot"><td>Σ</td>${v.players.map(p => `<td>${p.total}</td>`).join('')}</tr>`;
    $('#scores').innerHTML = `
      <div class="leader">Önde: <b>${esc(order[0].p.name)}</b> (${order[0].p.total})</div>
      <table class="score-table"><thead><tr><th>El</th>${head}</tr></thead><tbody>${rows}${tot}</tbody></table>
      <p class="muted tiny">En düşük puan kazanır. Bitiren −101 (okeyle −202). Açmayan +202, açan elindeki taş toplamı. Okeyle veya çiftten bitince cezalar 2 kat.</p>`;
  }

  function renderModal() {
    const v = S.view;
    const m = $('#modal');
    if (v.status !== 'roundEnd' || !v.result || S.modalHidden) { m.classList.add('hidden'); return; }
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
        ${S.role === 'host' ? '<button class="btn primary" data-act="nextRound">Sonraki El</button>' : '<span class="muted">Kurucunun yeni eli başlatması bekleniyor…</span>'}
        <button class="btn ghost" data-act="closeModal">Masaya Bak</button>
      </div>`;
    m.classList.remove('hidden');
  }

  function renderChat() {
    const el = $('#chatMsgs');
    el.innerHTML = S.chat.map(m => (m.name ? `<div><b>${esc(m.name)}:</b> ${esc(m.text)}</div>` : `<div class="sys">${esc(m.text)}</div>`)).join('');
    el.scrollTop = 1e9;
  }

  let audioCtx;
  function beep() {
    try {
      audioCtx = audioCtx || new (window.AudioContext || window.webkitAudioContext)();
      const o = audioCtx.createOscillator(), g = audioCtx.createGain();
      o.frequency.value = 880;
      g.gain.setValueAtTime(0.08, audioCtx.currentTime);
      g.gain.exponentialRampToValueAtTime(0.0001, audioCtx.currentTime + 0.25);
      o.connect(g).connect(audioCtx.destination);
      o.start();
      o.stop(audioCtx.currentTime + 0.25);
    } catch { /* ses yok */ }
  }

  // ================= Oyun hamleleri (arayüzden) =================
  function doOpen() {
    const plan = rackPlan();
    if (plan.sum >= R.OPEN_SERIES_MIN) return sendAction({ type: 'open', mode: 'series', groups: plan.series });
    if (plan.pairs.length >= R.OPEN_PAIRS_MIN) return sendAction({ type: 'open', mode: 'pairs', groups: plan.pairs });
    toast(`Açmak için ıstakada boşlukla ayrılmış perlerin toplamı 101 olmalı (şu an ${plan.sum}) ya da 5 çift (şu an ${plan.pairs.length}). İpucu: "Seri Diz" / "Çift Diz".`);
  }

  function doLay() {
    const v = S.view, me = v.players[v.you];
    const plan = rackPlan();
    const groups = me.openType === 'pairs' ? plan.pairs : plan.series;
    if (!groups.length) return toast(me.openType === 'pairs' ? 'Istakada indirilecek çift yok.' : 'Istakada indirilecek geçerli per yok (en az 3 taş, boşlukla ayrılmış).');
    sendAction({ type: 'lay', groups });
  }

  function doDiscard(id) {
    if (!myTurnPhase('play')) return toast(myTurnPhase('draw') ? 'Önce taş çekmelisin.' : 'Sıra sende değil.');
    sendAction({ type: 'discard', tile: id });
  }

  function doAddToGroup(groupId, ids) {
    if (!myTurnPhase('play')) return toast('Sıra sende değil.');
    if (!S.view.players[S.view.you].opened) return toast('İşlemek için önce elini açmalısın.');
    if (!ids.length) return toast('Önce ıstakadan işlenecek taşı seç (ya da taşı pere sürükle).');
    S.selected.clear();
    sendAction({ type: 'add', groupId, tiles: ids });
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
    if (!t || e.button > 0) return;
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
      if (S.selected.has(d.id)) S.selected.delete(d.id); else S.selected.add(d.id);
      renderGame();
      return;
    }
    d.ghost.remove();
    const tg = dropTarget(e.clientX, e.clientY);
    if (tg && tg.dataset.slot !== undefined) moveToSlot(d.id, +tg.dataset.slot);
    else if (tg && tg.dataset.drop === 'discard') { renderGame(); return doDiscard(d.id); }
    else if (tg && tg.dataset.group !== undefined) {
      const ids = S.selected.has(d.id) && S.selected.size > 1 ? [...S.selected] : [d.id];
      renderGame();
      return doAddToGroup(+tg.dataset.group, ids);
    }
    renderGame();
  });

  document.addEventListener('pointercancel', () => {
    if (drag && drag.ghost) drag.ghost.remove();
    drag = null;
    clearOver();
    renderGame();
  });

  // ================= Tıklamalar =================
  function readName() {
    const n = cleanText($('#name').value, 16);
    if (!n) { toast('Önce adını yaz.'); $('#name').focus(); return false; }
    S.name = n;
    store.set('okey101-name', n);
    return true;
  }

  document.addEventListener('click', (e) => {
    const b = e.target.closest('[data-act]');
    if (!b || b.disabled) return;
    const act = b.dataset.act, i = +b.dataset.i;
    switch (act) {
      case 'create': if (readName()) hostCreate(); break;
      case 'join': {
        if (!readName()) break;
        const c = cleanText($('#code').value, 6).toUpperCase();
        if (!c) { toast('Oda kodunu yaz.'); break; }
        clientJoin(c);
        break;
      }
      case 'copyLink':
        navigator.clipboard.writeText(shareLink()).then(() => toast('Link kopyalandı!'), () => toast(shareLink()));
        break;
      case 'addBot': hostAddBot(i); break;
      case 'kick': hostKick(i); break;
      case 'start': hostStart(); break;
      case 'leave': location.href = location.pathname; break;
      case 'reconnect': $('#overlayCard').innerHTML = '<h2>Bağlanılıyor…</h2>'; clientJoin(S.code); break;
      case 'drawPile': sendAction({ type: 'draw', from: 'pile' }); break;
      case 'takeDiscard': sendAction({ type: 'draw', from: 'discard' }); break;
      case 'groupClick': doAddToGroup(+b.dataset.group, [...S.selected]); break;
      case 'sortSeries': arrangeSeries(); break;
      case 'sortPairs': arrangePairs(); break;
      case 'open': doOpen(); break;
      case 'lay': doLay(); break;
      case 'giveBack': sendAction({ type: 'giveBack' }); break;
      case 'discardSel': if (S.selected.size === 1) doDiscard([...S.selected][0]); break;
      case 'nextRound': sendAction({ type: 'nextRound' }); break;
      case 'closeModal': S.modalHidden = true; renderModal(); break;
      case 'showResult': S.modalHidden = false; renderModal(); break;
    }
  });

  $('#chatForm').addEventListener('submit', (e) => {
    e.preventDefault();
    sendChat($('#chatInput').value);
    $('#chatInput').value = '';
  });

  $('#code').addEventListener('keydown', (e) => { if (e.key === 'Enter') document.querySelector('[data-act="join"]').click(); });

  window.addEventListener('beforeunload', (e) => {
    if (S.role === 'host' && S.seats.some(s => s && s.kind === 'remote')) { e.preventDefault(); e.returnValue = ''; }
  });

  // ================= Başlangıç =================
  $('#name').value = store.get('okey101-name') || '';
  const oda = new URLSearchParams(location.search).get('oda');
  if (oda) {
    $('#code').value = oda.toUpperCase();
    $('#menuMsg').textContent = 'Davet linkiyle geldin: adını yazıp "Katıl"a bas.';
  }
  if (location.hash === '#debug') window.__okey = S;
  if (typeof Peer === 'undefined') $('#menuMsg').textContent = 'PeerJS yüklenemedi. İnternet bağlantını kontrol et.';
})();
