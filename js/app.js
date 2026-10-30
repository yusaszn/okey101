/* Oda sistemi (PeerJS): kalıcı lobi, oyun seçimi, sohbet, sesli sohbet, tema, yeniden bağlanma.
   Oyunu kurucunun tarayıcısı yönetir; oyunlar window.GameModes içinde ayrı modüllerdir. */
(function () {
  'use strict';
  const MODES = window.GameModes;
  const Voice = window.Voice;

  const PREFIX = 'ys-okey101-';
  const PEER_OPTS = { debug: 1 };
  const MODE_ORDER = ['okey', 'yedili', 'blackjack'];
  const MODE_ICONS = { okey: '<span class="gi gi-okey">101</span>', yedili: '<span class="gi gi-card">7♥</span>', blackjack: '<span class="gi gi-bj">21</span>' };
  const BOT_NAMES = ['Bot Ali', 'Bot Ayşe', 'Bot Mehmet', 'Bot Zeynep', 'Bot Can', 'Bot Elif'];
  const HOST_SAVE = 'okey101-host', ALIVE_KEY = 'okey101-alive', SESSION = 'okey101-session', NAME_KEY = 'okey101-name';
  const TABLES = [
    ['okyanus', 'Okyanus'], ['gece', 'Gece Mavisi'], ['mor', 'Mor'], ['gunbatimi', 'Gün Batımı'],
    ['bordo', 'Bordo'], ['yesil', 'Klasik Yeşil'],
  ];
  const RACKS = [
    ['ahsap', 'Ahşap'], ['beyaz', 'Beyaz'], ['siyah', 'Siyah'], ['kirmizi', 'Kırmızı'], ['mavi', 'Mavi'], ['pembe', 'Pembe'],
  ];

  const $ = (s) => document.querySelector(s);
  const esc = (s) => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const mkStore = (getS) => ({
    get(k) { try { return getS().getItem(k); } catch { return null; } },
    set(k, v) { try { getS().setItem(k, v); } catch { /* yok say */ } },
    del(k) { try { getS().removeItem(k); } catch { /* yok say */ } },
  });
  const store = mkStore(() => localStorage), sstore = mkStore(() => sessionStorage);
  const readJSON = (st, k) => { try { return JSON.parse(st.get(k) || 'null'); } catch { return null; } };

  const S = {
    role: null, name: '', code: '', seat: null, joined: false,
    peer: null, conn: null,
    // kurucu
    seats: [null, null, null, null], mode: 'okey', game: null, order: null, gameSeq: 0,
    botTimer: null, dropTimers: {}, retry: 0,
    // herkes
    lobby: null, view: null, chat: [], wasMyTurn: false,
    reconnecting: false, retryTimer: null,
  };

  const api = {
    send: sendAction, toast, esc,
    isHost: () => S.role === 'host',
    view: () => S.view,
    rerender: () => renderMode(),
  };

  // ================= Ortak =================
  function show(id) {
    document.querySelectorAll('.screen').forEach(el => el.classList.toggle('active', el.id === id));
    if (id !== 'game') $('#modal').classList.add('hidden');
    renderRoom();
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

  function voiceNotify(on, muted) {
    if (S.role === 'host') {
      if (S.seats[0]) Object.assign(S.seats[0], { voice: on, muted });
      hostSync();
    } else send(S.conn, { t: 'voice', on, muted });
  }

  // Sesli sohbet varsayılan olarak açık; kullanıcı kapatırsa hatırlanır
  function autoVoice() {
    if (store.get('okey101-voice') === '0' || Voice.on) return;
    Voice.join().catch(e => toast('Mikrofon açılamadı: ' + (e.message || e.name) + ' — Sesli sohbet panelinden tekrar deneyebilirsin.'));
  }

  // ================= Tema =================
  function applyTheme() {
    document.body.dataset.table = store.get('okey101-table') || 'okyanus';
    document.body.dataset.rack = store.get('okey101-rack') || 'ahsap';
  }

  function themeHTML() {
    const t = document.body.dataset.table, r = document.body.dataset.rack;
    return `<h3>🎨 Görünüm</h3>
      <div class="theme-row"><small>Masa</small><div class="swatches">${TABLES.map(([k, n]) => `<button class="sw sw-table-${k} ${k === t ? 'sel' : ''}" data-act="setTable" data-k="${k}" title="${n}"></button>`).join('')}</div></div>
      <div class="theme-row"><small>Istaka</small><div class="swatches">${RACKS.map(([k, n]) => `<button class="sw sw-rack-${k} ${k === r ? 'sel' : ''}" data-act="setRack" data-k="${k}" title="${n}"></button>`).join('')}</div></div>`;
  }

  // ================= Kurucu (host) =================
  function genCode() {
    const A = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
    let s = '';
    for (let i = 0; i < 5; i++) s += A[Math.floor(Math.random() * A.length)];
    return s;
  }

  function hostCreate(restore) {
    S.role = 'host';
    S.seat = 0;
    if (!restore) S.code = genCode();
    $('#menuMsg').textContent = restore ? 'Oda geri yükleniyor…' : 'Oda kuruluyor…';
    const peer = new Peer(PREFIX + S.code, PEER_OPTS);
    S.peer = peer;
    Voice.attach(peer, voiceNotify);
    peer.on('open', () => {
      S.retry = 0;
      S.joined = true;
      if (!restore) S.seats = [{ name: S.name, kind: 'host', connected: true }, null, null, null];
      else Object.assign(S.seats[0], { kind: 'host', connected: true, voice: false, muted: false });
      sstore.set(SESSION, JSON.stringify({ code: S.code, role: 'host', name: S.name }));
      history.replaceState(null, '', '?oda=' + S.code);
      $('#menuMsg').textContent = '';
      $('#overlay').classList.add('hidden');
      if (restore) pushChat({ name: null, text: 'Oda geri yüklendi. Diğer oyuncular otomatik yeniden bağlanıyor…' });
      // Bu sekme odayı yönetiyor: aynı tarayıcıdaki diğer sekmeler kurucu gibi davranmasın
      clearInterval(S.aliveTimer);
      const alive = () => store.set(ALIVE_KEY, JSON.stringify({ code: S.code, t: Date.now() }));
      alive();
      S.aliveTimer = setInterval(alive, 2000);
      hostSync();
      scheduleBots();
      autoVoice();
    });
    peer.on('connection', hostAccept);
    peer.on('disconnected', () => {
      setTimeout(() => { if (!peer.destroyed && peer.disconnected) peer.reconnect(); }, 1000);
    });
    peer.on('error', (err) => {
      if (err.type === 'unavailable-id') {
        peer.destroy();
        if (!restore) return hostCreate(false);
        // Eski bağlantı sunucuda henüz düşmedi: aynı kodu tekrar dene
        if (S.retry++ < 45) {
          $('#menuMsg').textContent = `Oda geri yükleniyor… (${S.retry})`;
          setTimeout(() => hostCreate(true), 2000);
        } else $('#menuMsg').textContent = 'Oda geri yüklenemedi. Yeni oda kurabilirsin.';
        return;
      }
      if (err.type === 'peer-unavailable') return;
      if (err.type === 'network' || err.type === 'server-error' || err.type === 'socket-error') toast('Sunucu bağlantısı sorunlu, tekrar deneniyor…');
      else toast('Bağlantı hatası: ' + err.type);
      if (!S.joined) $('#menuMsg').textContent = 'Oda kurulamadı: ' + err.type;
    });
  }

  function hostRestore(saved) {
    S.name = saved.name;
    S.code = saved.code;
    S.mode = MODES[saved.mode] ? saved.mode : 'okey';
    S.seats = saved.seats.map(s => s && { name: s.name, kind: s.kind, connected: s.kind !== 'remote', conn: null });
    S.order = saved.order || null;
    S.gameSeq = saved.gameSeq || 1;
    S.chat = saved.chat || [];
    if (saved.game && S.order) {
      S.game = Object.assign(Object.create(MODES[S.mode].Engine.prototype), saved.game);
    }
    S.seats.forEach((s, i) => { if (s && s.kind === 'remote') scheduleLobbyDrop(i); });
    show('menu');
    hostCreate(true);
  }

  function hostSave() {
    if (S.role !== 'host' || !S.code || !S.joined) return;
    try {
      store.set(HOST_SAVE, JSON.stringify({
        code: S.code, name: S.name, mode: S.mode, at: Date.now(), gameSeq: S.gameSeq,
        seats: S.seats.map(s => s && { name: s.name, kind: s.kind }),
        order: S.order, game: S.game, chat: S.chat.slice(-40),
      }));
    } catch (e) { console.warn('kaydedilemedi', e); }
  }

  function hostAccept(conn) {
    conn.on('data', (msg) => hostOnMsg(conn, msg));
    conn.on('close', () => hostOnClose(conn));
    conn.on('error', () => hostOnClose(conn));
  }

  const seatOfConn = (conn) => S.seats.findIndex(s => s && s.conn === conn);
  const inGame = (i) => !!(S.game && S.order && S.order.includes(i));

  function hostOnMsg(conn, msg) {
    if (!msg || typeof msg !== 'object') return;
    if (msg.t === 'join') return hostJoin(conn, cleanText(msg.name, 16) || 'Oyuncu');
    const seat = seatOfConn(conn);
    if (seat < 0) return;
    const s = S.seats[seat];
    if (msg.t === 'act') hostAction(seat, msg.action);
    else if (msg.t === 'chat') {
      const text = cleanText(msg.text, 200);
      if (text) pushChat({ name: s.name, text });
    } else if (msg.t === 'voice') {
      s.voice = !!msg.on;
      s.muted = !!msg.muted;
      hostSync();
    }
  }

  function hostJoin(conn, name) {
    // Aynı isimli oyuncu geri dönüyorsa koltuğunu geri ver
    let seat = S.seats.findIndex(s => s && s.kind === 'remote' && s.name === name);
    if (seat >= 0) {
      const s = S.seats[seat];
      if (s.conn && s.conn !== conn) { const old = s.conn; s.conn = null; try { old.close(); } catch { /* yok say */ } }
      Object.assign(s, { conn, peerId: conn.peer, connected: true, voice: false, muted: false });
      clearTimeout(S.dropTimers[seat]);
      pushChat({ name: null, text: `${name} geri döndü.` });
    } else {
      let n = name, k = 2;
      while (S.seats.some(x => x && x.name === n)) n = `${name} ${k++}`;
      name = n;
      seat = S.seats.findIndex(x => !x);
      if (seat < 0) return send(conn, { t: 'reject', msg: 'Oda dolu (4 kişi).' });
      S.seats[seat] = { name, kind: 'remote', conn, peerId: conn.peer, connected: true };
      pushChat({ name: null, text: `${name} odaya katıldı.` + (S.game ? ' Oyun bitince katılabilir.' : '') });
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
    Object.assign(s, { connected: false, conn: null, voice: false, muted: false });
    if (inGame(seat)) pushChat({ name: null, text: `${s.name} koptu, yerine bot oynuyor. Aynı isimle geri girebilir.` });
    else {
      pushChat({ name: null, text: `${s.name} koptu.` });
      scheduleLobbyDrop(seat);
    }
    hostSync();
    scheduleBots();
  }

  // Lobide kopan oyuncunun koltuğu bir süre beklenir, dönmezse boşaltılır
  function scheduleLobbyDrop(i) {
    clearTimeout(S.dropTimers[i]);
    S.dropTimers[i] = setTimeout(() => {
      const s = S.seats[i];
      if (s && s.kind === 'remote' && !s.connected && !inGame(i)) {
        S.seats[i] = null;
        pushChat({ name: null, text: `${s.name} odadan ayrıldı.` });
        hostSync();
      }
    }, 60000);
  }

  function seatMeta() {
    return S.seats.map(s => s && {
      name: s.name, kind: s.kind, connected: !!s.connected,
      peerId: s.kind === 'host' ? (S.peer && S.peer.id) : s.peerId,
      voice: !!s.voice, muted: !!s.muted,
    });
  }

  function hostSync() {
    if (!S.joined) return;
    const room = seatMeta();
    const lobby = { code: S.code, mode: S.mode, seats: room, playing: !!S.game, playingMode: S.game ? S.mode : null };
    S.seats.forEach((s, i) => {
      if (!s || s.kind === 'bot') return;
      const e = inGame(i) ? S.order.indexOf(i) : -1;
      let msg;
      if (e >= 0) {
        const view = S.game.viewFor(e);
        view.mode = S.mode;
        view.gameId = S.gameSeq;
        view.seats = S.order.map(r => room[r]);
        view.actors = S.game.actorSeats();
        msg = { t: 'state', view, lobby };
      } else msg = { t: 'lobby', lobby };
      if (s.kind === 'host') onMsg(msg);
      else if (s.connected) send(s.conn, msg);
    });
    hostSave();
  }

  function hostAction(seat, action) {
    if (!action || typeof action !== 'object') return;
    const g = S.game;
    if (action.type === 'nextRound') {
      if (seat === 0 && g && g.status === 'roundEnd') { g.startRound(); hostSync(); scheduleBots(); }
      return;
    }
    if (action.type === 'toLobby') { if (seat === 0) hostToLobby(); return; }
    if (!g || !inGame(seat)) return;
    try {
      g.apply(S.order.indexOf(seat), action);
    } catch (e) {
      if (!(e instanceof MODES[S.mode].GameError)) console.error(e);
      if (seat === 0) toast(e.message);
      else send(S.seats[seat].conn, { t: 'error', msg: e.message });
      return;
    }
    hostSync();
    scheduleBots();
  }

  function botSeats() {
    const set = new Set();
    if (!S.order) return set;
    S.order.forEach((r, e) => {
      const s = S.seats[r];
      if (s && (s.kind === 'bot' || (s.kind === 'remote' && !s.connected))) set.add(e);
    });
    return set;
  }

  function scheduleBots() {
    clearTimeout(S.botTimer);
    const g = S.game;
    if (!g || g.status !== 'playing') return;
    const bots = botSeats();
    const actor = g.actorSeats().find(e => bots.has(e));
    if (actor !== undefined) {
      const real = S.seats[S.order[actor]].kind === 'bot';
      S.botTimer = setTimeout(() => {
        if (g === S.game && g.status === 'playing' && g.actorSeats().includes(actor) && botSeats().has(actor)) {
          try { g.botTurn(actor); } catch (e) { console.error(e); }
        }
        hostSync();
        scheduleBots();
      }, real ? 1100 : 3000);
      return;
    }
    if (g.botReact) {
      const r = g.botReact(bots);
      if (r) {
        S.botTimer = setTimeout(() => {
          if (g !== S.game) return;
          try { g.apply(r.seat, r.action); } catch { /* fırsat geçti */ }
          hostSync();
          scheduleBots();
        }, 2500);
      }
    }
  }

  function hostAddBot(i) {
    if (S.seats[i] || S.game) return;
    const used = new Set(S.seats.filter(Boolean).map(s => s.name));
    const name = BOT_NAMES.find(n => !used.has(n)) || 'Bot ' + (i + 1);
    S.seats[i] = { name, kind: 'bot', connected: true };
    hostSync();
  }

  function hostKick(i) {
    const s = S.seats[i];
    if (!s || s.kind === 'host' || inGame(i)) return;
    if (s.kind === 'remote' && s.conn) {
      const c = s.conn;
      s.conn = null;
      send(c, { t: 'reject', msg: 'Kurucu seni odadan çıkardı.' });
      setTimeout(() => { try { c.close(); } catch { /* yok say */ } }, 300);
    }
    S.seats[i] = null;
    hostSync();
  }

  function hostSetMode(k) {
    if (S.game || !MODES[k]) return;
    S.mode = k;
    hostSync();
  }

  function hostStart() {
    if (S.game) return;
    const m = MODES[S.mode];
    const filled = S.seats.map((s, i) => (s ? i : -1)).filter(i => i >= 0);
    if (filled.length < m.min || filled.length > m.max) {
      return toast(`${m.title} için ${m.min === m.max ? m.min : `${m.min}-${m.max}`} oyuncu gerekli. Boş yerlere bot ekleyebilirsin.`);
    }
    S.order = filled;
    S.gameSeq++;
    S.game = new m.Engine(filled.map(i => S.seats[i].name));
    S.game.startRound();
    pushChat({ name: null, text: `${m.title} başladı. Bol şans!` });
    hostSync();
    scheduleBots();
  }

  function hostToLobby() {
    clearTimeout(S.botTimer);
    S.game = null;
    S.order = null;
    S.seats.forEach((s, i) => { if (s && s.kind === 'remote' && !s.connected) scheduleLobbyDrop(i); });
    pushChat({ name: null, text: 'Lobiye dönüldü. Kurucu yeni oyun seçebilir.' });
    hostSync();
  }

  function pushChat(m) {
    S.chat.push(m);
    if (S.chat.length > 100) S.chat.shift();
    renderChat();
    if (S.role === 'host') {
      for (const s of S.seats) if (s && s.kind === 'remote' && s.connected) send(s.conn, { t: 'chat', m });
    }
  }

  // ================= Katılan oyuncu (client) =================
  let joinTimer;
  function clientJoin(code) {
    S.role = 'client';
    S.code = code;
    S.joined = false;
    if (Voice.on) Voice.leave(true);
    if (S.peer) { try { S.peer.destroy(); } catch { /* yok say */ } }
    if (!S.reconnecting) $('#menuMsg').textContent = 'Bağlanılıyor…';
    const peer = new Peer(PEER_OPTS);
    S.peer = peer;
    Voice.attach(peer, voiceNotify);
    clearTimeout(joinTimer);
    joinTimer = setTimeout(() => { if (!S.joined) failJoin('Bağlanamadı. Oda kodunu kontrol edip tekrar dene.'); }, 15000);
    peer.on('open', () => {
      const conn = peer.connect(PREFIX + code, { reliable: true });
      S.conn = conn;
      conn.on('open', () => send(conn, { t: 'join', name: S.name }));
      conn.on('data', onMsg);
      conn.on('close', () => { if (S.conn === conn) onLost(); });
    });
    peer.on('error', (err) => {
      if (S.joined) { if (err.type !== 'peer-unavailable') toast('Bağlantı hatası: ' + err.type); return; }
      failJoin(err.type === 'peer-unavailable' ? 'Oda bulunamadı. Kod yanlış olabilir ya da kurucu odayı kapatmış.' : 'Bağlantı hatası: ' + err.type);
    });
  }

  function failJoin(msg) {
    clearTimeout(joinTimer);
    if (S.reconnecting) return scheduleReconnect();
    $('#menuMsg').textContent = msg;
    show('menu');
  }

  function onLost() {
    if (!S.joined || S.role !== 'client') return;
    S.joined = false;
    S.reconnecting = true;
    S.retry = 0;
    showOverlay('Bağlantı koptu', 'Yeniden bağlanılıyor…', '<button class="btn ghost" data-act="leave">Ana Menü</button>');
    scheduleReconnect();
  }

  function scheduleReconnect() {
    clearTimeout(S.retryTimer);
    if (S.retry++ >= 60) {
      S.reconnecting = false;
      showOverlay('Bağlanılamadı', 'Kurucu odayı kapatmış olabilir.', '<button class="btn primary" data-act="reconnect">Tekrar Dene</button><button class="btn ghost" data-act="leave">Ana Menü</button>');
      return;
    }
    const m = $('#overlayMsg');
    if (m) m.textContent = `Yeniden bağlanılıyor… (${S.retry})`;
    S.retryTimer = setTimeout(() => clientJoin(S.code), S.retry === 1 ? 500 : 3000);
  }

  function showOverlay(title, msg, buttons) {
    $('#overlayCard').innerHTML = `<h2>${title}</h2><p id="overlayMsg">${msg}</p><div class="row">${buttons}</div>`;
    $('#overlay').classList.remove('hidden');
  }

  // Kurucudan gelen (kurucu için yerel) mesajlar
  function onMsg(msg) {
    if (!msg || typeof msg !== 'object') return;
    switch (msg.t) {
      case 'welcome':
        clearTimeout(joinTimer);
        S.joined = true;
        S.reconnecting = false;
        S.seat = msg.seat;
        S.name = msg.name;
        sstore.set(SESSION, JSON.stringify({ code: S.code, role: 'client', name: S.name }));
        history.replaceState(null, '', '?oda=' + S.code);
        $('#menuMsg').textContent = '';
        $('#overlay').classList.add('hidden');
        autoVoice();
        break;
      case 'reject':
        toast(msg.msg);
        $('#menuMsg').textContent = msg.msg;
        S.joined = false;
        S.reconnecting = false;
        sstore.del(SESSION);
        try { S.peer.destroy(); } catch { /* yok say */ }
        $('#overlay').classList.add('hidden');
        show('menu');
        break;
      case 'lobby':
        S.lobby = msg.lobby;
        S.view = null;
        S.wasMyTurn = false;
        document.title = 'Oyun Odası';
        Voice.setRoom(msg.lobby.seats);
        renderLobby();
        break;
      case 'state':
        S.lobby = msg.lobby;
        Voice.setRoom(msg.lobby.seats);
        onView(msg.view);
        break;
      case 'error': toast(msg.msg); break;
      case 'chat': pushChat(msg.m); break;
      case 'chatAll':
        S.chat = Array.isArray(msg.list) ? msg.list : [];
        renderChat();
        break;
    }
  }

  // ================= Lobi =================
  function renderLobby() {
    const L = S.lobby;
    if (!L) return;
    show('lobby');
    const host = S.role === 'host';
    const m = MODES[L.mode];
    const filled = L.seats.filter(Boolean).length;
    const games = MODE_ORDER.map(k => {
      const g = MODES[k];
      const can = host && !L.playing;
      return `<button class="game-pick ${k === L.mode ? 'sel' : ''}" ${can ? `data-act="setMode" data-k="${k}"` : 'disabled'}>
        ${MODE_ICONS[k]}<b>${g.title}</b><small>${g.desc}</small></button>`;
    }).join('');
    const seats = L.seats.map((s, i) => {
      if (!s) return `<li class="seat empty"><span>${i + 1}. Boş koltuk</span>${host && !L.playing ? `<button class="btn sm" data-act="addBot" data-i="${i}">+ Bot Ekle</button>` : ''}</li>`;
      const tag = s.kind === 'host' ? '<span class="badge gold">Kurucu</span>' : s.kind === 'bot' ? '<span class="badge">Bot</span>' : '';
      const me = i === S.seat ? ' <span class="badge me">Sen</span>' : '';
      const off = s.kind === 'remote' && !s.connected ? ' <span class="badge warn">Koptu</span>' : '';
      const mic = s.voice ? ` <span class="badge">${s.muted ? '🔇' : '🎤'}</span>` : '';
      const kick = host && s.kind !== 'host' && !L.playing ? `<button class="btn sm ghost" data-act="kick" data-i="${i}">Çıkar</button>` : '';
      return `<li class="seat"><span>${i + 1}. ${esc(s.name)} ${tag}${me}${off}${mic}</span>${kick}</li>`;
    }).join('');
    const okCount = filled >= m.min && filled <= m.max;
    const need = m.min === m.max ? `${m.min} oyuncu` : `${m.min}-${m.max} oyuncu`;
    let bottom;
    if (L.playing) bottom = `<p class="waiting">Şu an <b>${MODES[L.playingMode].title}</b> oynanıyor. Kurucu lobiye dönünce sen de katılabilirsin.</p>`;
    else if (host) bottom = `<button class="btn primary big" data-act="start" ${okCount ? '' : 'disabled'}>${okCount ? `${m.title} Başlat` : `${m.title} için ${need} gerekli (${filled} var)`}</button>`;
    else bottom = `<p class="waiting">Kurucunun <b>${m.title}</b> oyununu başlatması bekleniyor… (${filled} kişi)</p>`;

    $('#lobbyCard').innerHTML = `
      <div class="lobby-head">
        <div><small class="muted">Oda Kodu</small><div class="room-code">${esc(L.code)}</div></div>
        <button class="btn sm" data-act="copyLink">Davet Linkini Kopyala</button>
      </div>
      <h3>Oyun Seç</h3>
      <div class="game-picks">${games}</div>
      ${host ? '' : '<p class="muted tiny">Oyunu kurucu seçer.</p>'}
      <h3>Oyuncular</h3>
      <ul class="seats">${seats}</ul>
      ${bottom}
      <button class="btn ghost sm" data-act="leave">${host ? 'Odayı Kapat' : 'Odadan Çık'}</button>`;
  }

  // ================= Oyun ekranı =================
  function onView(view) {
    const prev = S.view;
    S.view = view;
    const myTurn = view.status === 'playing' && (view.actors || []).includes(view.you);
    if (myTurn && !S.wasMyTurn && prev) beep();
    S.wasMyTurn = myTurn;
    document.title = (myTurn ? '🔔 Sıra sende! — ' : '') + MODES[view.mode].title;
    show('game');
    renderMode();
  }

  function renderMode() {
    const v = S.view;
    if (!v) return;
    const m = MODES[v.mode];
    const isOkey = v.mode === 'okey';
    $('#okeyBoard').hidden = !isOkey;
    $('#modeBoard').hidden = isOkey;
    if (!isOkey) $('#modal').classList.add('hidden');
    $('#game').dataset.mode = v.mode;
    m.render(v, api);
    $('#scores').innerHTML = m.scoresHTML(v, api);
    $('#log').innerHTML = v.log.map(l => `<div>${esc(l)}</div>`).join('');
    $('#log').scrollTop = 1e9;
    renderRoom();
  }

  // Yan panel: oda, sesli sohbet, puan, olaylar, sohbet, görünüm
  function renderRoom() {
    const inRoom = S.joined && !!S.lobby;
    $('#side').hidden = !inRoom;
    document.body.classList.toggle('in-room', inRoom);
    if (!inRoom) return;
    const L = S.lobby, host = S.role === 'host';
    const players = L.seats.filter(Boolean).map(s => {
      const icon = s.kind === 'bot' ? '🤖' : s.voice ? (s.muted ? '🔇' : '🎤') : '👤';
      return `<span class="rp ${s.connected ? '' : 'off'}">${icon} ${esc(s.name)}</span>`;
    }).join('');
    const playing = L.playing ? `<div class="row room-game"><span class="muted tiny">Oyun: <b>${MODES[L.playingMode].title}</b></span>
      ${host ? '<button class="btn sm" data-act="toLobby">⟵ Lobiye Dön</button>' : ''}</div>` : '';
    $('#roomPanel').innerHTML = `
      <div class="room-head"><div><small>Oda</small> <b class="code-sm">${esc(S.code)}</b></div>
        <button class="btn sm" data-act="copyLink">Davet</button></div>
      <div class="room-players">${players}</div>${playing}`;

    const inVoice = L.seats.filter(s => s && s.voice);
    const list = inVoice.length
      ? inVoice.map(s => `<span class="vchip ${s.muted ? 'muted' : ''}">${s.muted ? '🔇' : '🎤'} ${esc(s.name)}</span>`).join('')
      : '<span class="muted tiny">Seste kimse yok.</span>';
    const btns = Voice.on
      ? `<button class="btn sm" data-act="voiceMute">${Voice.muted ? '🎤 Mikrofonu Aç' : '🔇 Sessize Al'}</button><button class="btn sm ghost" data-act="voiceLeave">Sesten Çık</button>`
      : '<button class="btn sm primary" data-act="voiceJoin">🎤 Sese Katıl</button>';
    $('#voicePanel').innerHTML = `<h3>Sesli Sohbet ${Voice.on ? '<span class="live">● Açık</span>' : ''}</h3><div class="vlist">${list}</div><div class="row">${btns}</div>`;
    $('#themePanel').innerHTML = themeHTML();
    const gameOn = !!S.view && $('#game').classList.contains('active');
    $('#scoresPanel').hidden = !gameOn;
    $('#logPanel').hidden = !gameOn;
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

  // ================= Tıklamalar =================
  function readName() {
    const n = cleanText($('#name').value, 16);
    if (!n) { toast('Önce adını yaz.'); $('#name').focus(); return false; }
    S.name = n;
    store.set(NAME_KEY, n);
    return true;
  }

  function leaveRoom() {
    if (S.role === 'host' && !confirm('Odayı kapatırsan herkes çıkar. Emin misin?')) return;
    if (S.role === 'host') store.del(HOST_SAVE);
    sstore.del(SESSION);
    location.href = location.pathname;
  }

  document.addEventListener('click', (e) => {
    const m = e.target.closest('[data-mact]');
    if (m && !m.disabled && S.view && MODES[S.view.mode].onAct) {
      MODES[S.view.mode].onAct(m.dataset.mact, m, api);
      return;
    }
    const b = e.target.closest('[data-act]');
    if (!b || b.disabled) return;
    const act = b.dataset.act, i = +b.dataset.i;
    switch (act) {
      case 'create': if (readName()) { store.del(HOST_SAVE); hostCreate(false); } break;
      case 'join': {
        if (!readName()) break;
        const c = cleanText($('#code').value, 6).toUpperCase();
        if (!c) { toast('Oda kodunu yaz.'); break; }
        clientJoin(c);
        break;
      }
      case 'copyLink':
        navigator.clipboard.writeText(shareLink()).then(() => toast('Davet linki kopyalandı!'), () => toast(shareLink()));
        break;
      case 'addBot': hostAddBot(i); break;
      case 'kick': hostKick(i); break;
      case 'setMode': hostSetMode(b.dataset.k); break;
      case 'start': hostStart(); break;
      case 'toLobby': sendAction({ type: 'toLobby' }); break;
      case 'nextRound': sendAction({ type: 'nextRound' }); break;
      case 'leave': leaveRoom(); break;
      case 'reconnect':
        S.reconnecting = true;
        S.retry = 0;
        showOverlay('Bağlanılıyor…', 'Yeniden bağlanılıyor…', '<button class="btn ghost" data-act="leave">Ana Menü</button>');
        scheduleReconnect();
        break;
      case 'voiceJoin':
        store.set('okey101-voice', '1');
        Voice.join().catch(err => toast('Mikrofon açılamadı: ' + (err.message || err.name)));
        break;
      case 'voiceLeave': store.set('okey101-voice', '0'); Voice.leave(); break;
      case 'voiceMute': Voice.toggleMute(); break;
      case 'setTable': store.set('okey101-table', b.dataset.k); applyTheme(); renderRoom(); break;
      case 'setRack': store.set('okey101-rack', b.dataset.k); applyTheme(); renderRoom(); break;
    }
  });

  $('#chatForm').addEventListener('submit', (e) => {
    e.preventDefault();
    sendChat($('#chatInput').value);
    $('#chatInput').value = '';
  });

  $('#code').addEventListener('keydown', (e) => { if (e.key === 'Enter') document.querySelector('[data-act="join"]').click(); });

  Voice.onChange = renderRoom;

  // ================= Başlangıç =================
  applyTheme();
  $('#name').value = store.get(NAME_KEY) || '';
  if (location.hash === '#debug') window.__app = S;
  if (typeof Peer === 'undefined') {
    $('#menuMsg').textContent = 'PeerJS yüklenemedi. İnternet bağlantını kontrol et.';
  } else {
    const oda = (new URLSearchParams(location.search).get('oda') || '').toUpperCase();
    const sess = readJSON(sstore, SESSION);
    const saved = readJSON(store, HOST_SAVE);
    const alive = readJSON(store, ALIVE_KEY);
    const thisTabHosts = sess && sess.role === 'host' && sess.code === oda;
    const hostedElsewhere = alive && alive.code === oda && Date.now() - alive.t < 6000 && !thisTabHosts;
    if (oda && saved && saved.code === oda && Date.now() - saved.at < 12 * 3600e3 && !hostedElsewhere) {
      hostRestore(saved);                       // kurucu sayfayı yeniledi / geri döndü
    } else if (oda && sess && sess.code === oda && sess.role === 'client' && sess.name) {
      S.name = sess.name;                       // oyuncu sayfayı yeniledi
      clientJoin(oda);
    } else if (oda) {
      $('#code').value = oda;
      $('#menuMsg').textContent = 'Davet linkiyle geldin: adını yazıp "Katıl"a bas.';
    }
  }
})();
