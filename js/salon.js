/* Salon lobisi — tombul karakterler dolaşır, birbirini tutar/iter/fırlatır, eşyaları devirir.
   Fizik kurucuda (Sim) çalışır; herkes anlık görüntüyü (snapshot) alıp çizer. */
(function (root) {
  'use strict';

  const W = 1200, H = 760, WALL = 130;
  const COLORS = ['#ff6b9a', '#4dabf7', '#ffd43b', '#69db7c', '#b197fc', '#ff922b', '#3bc9db', '#f783ac'];
  const HATS = ['yok', 'tac', 'kep', 'parti', 'kulaklik', 'cicek'];
  const HAT_NAMES = { yok: 'Yok', tac: 'Taç', kep: 'Kep', parti: 'Parti', kulaklik: 'Kulaklık', cicek: 'Çiçek' };
  const EMOTES = ['👋', '😂', '❤️', '😜', '😡', '🎉'];
  const BEAN = 1.3; // karakter çizim ölçeği
  const SPAWNS = [[420, 300], [780, 300], [380, 560], [820, 560]];

  // Sabit mobilyalar: çarpışma için zemindeki ayak izi
  const SOLIDS = [
    { k: 'shelf', x: 50, y: 110, w: 170, h: 60 },
    { k: 'tv', x: 490, y: 115, w: 220, h: 50 },
    { k: 'counter', x: 960, y: 105, w: 200, h: 70 },
    { k: 'table', x: 515, y: 415, w: 170, h: 70 },
    { k: 'sofa', x: 420, y: 625, w: 360, h: 90 },
    { k: 'armchair', x: 965, y: 395, w: 105, h: 95 },
  ];
  // Hareket eden eşyalar
  const ITEMS = [
    { k: 'plant', x: 270, y: 215, r: 17, m: 2.2, tip: true },
    { k: 'plant', x: 1120, y: 690, r: 17, m: 2.2, tip: true },
    { k: 'lamp', x: 880, y: 215, r: 13, m: 1.4, tip: true },
    { k: 'vase', x: 120, y: 690, r: 12, m: 0.9, tip: true },
    { k: 'ball', x: 600, y: 330, r: 14, m: 0.45, bounce: 0.85 },
    { k: 'puf', x: 320, y: 520, r: 24, m: 3.2, color: '#ff8fab' },
    { k: 'puf', x: 880, y: 600, r: 24, m: 3.2, color: '#74c0fc' },
    { k: 'duck', x: 1000, y: 300, r: 10, m: 0.35, bounce: 0.6 },
    { k: 'box', x: 160, y: 430, r: 20, m: 2.5 },
  ];

  const isPlayer = (b) => b.seat !== undefined;

  // ================= Fizik (kurucuda) =================
  class Sim {
    constructor() {
      this.players = new Map();
      this.items = ITEMS.map(it => ({ ...it, hx: it.x, hy: it.y, vx: 0, vy: 0, rot: 0, vr: 0, fallen: false, fd: 1 }));
      this.events = [];
    }

    ensure(seat, bot) {
      let p = this.players.get(seat);
      if (!p) {
        const [x, y] = SPAWNS[seat] || [600, 300];
        p = { seat, x, y, vx: 0, vy: 0, r: 24, m: 3, face: Math.PI / 2, stun: 0, cd: 0, grab: null, by: null,
          struggle: 0, emote: -1, emoteT: 0, in: { dx: 0, dy: 0 }, bot: false };
        this.players.set(seat, p);
        this.events.push(['pop', x, y]);
      }
      p.bot = !!bot;
      return p;
    }

    remove(seat) {
      const p = this.players.get(seat);
      if (!p) return;
      this._release(p);
      if (p.by !== null) { const g = this.players.get(p.by); if (g) this._release(g); }
      this.players.delete(seat);
    }

    input(seat, dx, dy) {
      const p = this.players.get(seat);
      if (!p || p.bot) return;
      dx = Number(dx) || 0;
      dy = Number(dy) || 0;
      const l = Math.hypot(dx, dy);
      if (l > 1) { dx /= l; dy /= l; }
      p.in = { dx, dy };
    }

    action(seat, a, arg) {
      const p = this.players.get(seat);
      if (a === 'tidy') return this._tidy();
      if (!p) return;
      if (a === 'grab') this._grab(p);
      else if (a === 'shove') this._shove(p);
      else if (a === 'emote') {
        const e = Math.floor(Number(arg));
        if (e >= 0 && e < EMOTES.length) { p.emote = e; p.emoteT = 2.5; }
      }
    }

    _all() { return [...this.players.values(), ...this.items]; }

    _target(ref) {
      if (!ref) return null;
      return ref.t === 'p' ? this.players.get(ref.id) || null : this.items[ref.id] || null;
    }

    _release(p) {
      if (!p.grab) return;
      if (p.grab.t === 'p') { const T = this.players.get(p.grab.id); if (T) { T.by = null; T.struggle = 0; } }
      p.grab = null;
    }

    _grab(p) {
      if (p.grab) { this._release(p); return; }
      if (p.stun > 0) return;
      let best = null, bd = 1e9;
      const fx = Math.cos(p.face), fy = Math.sin(p.face);
      for (const o of this._all()) {
        if (o === p) continue;
        const dx = o.x - p.x, dy = o.y - p.y, d = Math.hypot(dx, dy);
        const gap = d - p.r - o.r;
        if (gap > 26) continue;
        const score = gap - ((dx * fx + dy * fy) / (d || 1)) * 12; // öndekini tercih et
        if (score < bd) { bd = score; best = o; }
      }
      if (!best) return;
      if (isPlayer(best)) {
        if (best.by !== null) { const g = this.players.get(best.by); if (g) this._release(g); }
        p.grab = { t: 'p', id: best.seat };
        best.by = p.seat;
        best.struggle = 0;
      } else p.grab = { t: 'i', id: this.items.indexOf(best) };
      this.events.push(['grab', best.x, best.y - 30]);
    }

    _shove(p) {
      if (p.cd > 0 || p.stun > 0) return;
      p.cd = 0.75;
      const fx = Math.cos(p.face), fy = Math.sin(p.face);
      // Tutarken itmek = fırlatmak
      if (p.grab) {
        const T = this._target(p.grab);
        this._release(p);
        if (T) {
          const pow = isPlayer(T) ? 640 : 700 / Math.sqrt(T.m);
          T.vx += fx * pow;
          T.vy += fy * pow;
          if (isPlayer(T)) T.stun = 1.1;
          else if (T.tip && !T.fallen) this._fall(T, fx);
          this.events.push(['throw', T.x, T.y - 30]);
        }
        return;
      }
      p.vx += fx * 330;
      p.vy += fy * 330;
      let hit = false;
      for (const o of this._all()) {
        if (o === p) continue;
        const dx = o.x - p.x, dy = o.y - p.y, d = Math.hypot(dx, dy) || 1;
        if (d > p.r + o.r + 38 || (dx * fx + dy * fy) / d < 0.3) continue;
        const nx = dx / d, ny = dy / d;
        const pow = isPlayer(o) ? 560 : 520 / Math.sqrt(o.m);
        o.vx += nx * pow;
        o.vy += ny * pow;
        if (isPlayer(o)) { o.stun = 0.9; this._release(o); }
        else if (o.tip && !o.fallen && pow > 250) this._fall(o, nx);
        hit = true;
      }
      this.events.push([hit ? 'pat' : 'whoosh', p.x + fx * 30, p.y + fy * 30 - 30]);
    }

    _fall(o, dirX) {
      o.fallen = true;
      o.fd = dirX >= 0 ? 1 : -1;
      this.events.push(['crash', o.x, o.y - 20]);
    }

    _tidy() {
      for (const o of this.items) Object.assign(o, { x: o.hx, y: o.hy, vx: 0, vy: 0, rot: 0, vr: 0, fallen: false });
      for (const p of this.players.values()) if (p.grab && p.grab.t === 'i') this._release(p);
      this.events.push(['tidy', 600, 400]);
    }

    _bot(p, dt) {
      const a = p.ai || (p.ai = { tx: p.x, ty: p.y, t: 0 });
      a.t -= dt;
      if (a.t <= 0) {
        a.t = 1.5 + Math.random() * 3;
        const others = this._all().filter(o => o !== p);
        if (Math.random() < 0.5 && others.length) {
          const o = others[Math.floor(Math.random() * others.length)];
          a.tx = o.x; a.ty = o.y;
        } else {
          a.tx = 60 + Math.random() * (W - 120);
          a.ty = WALL + 40 + Math.random() * (H - WALL - 80);
        }
        if (Math.random() < 0.2) { p.emote = Math.floor(Math.random() * EMOTES.length); p.emoteT = 2.5; }
      }
      const dx = a.tx - p.x, dy = a.ty - p.y, d = Math.hypot(dx, dy);
      p.in = d < 24 ? { dx: 0, dy: 0 } : { dx: dx / d, dy: dy / d };
      if (p.grab && Math.random() < dt * 0.5) this._shove(p); // tuttuğunu fırlat
      for (const o of this._all()) {
        if (o === p || Math.hypot(o.x - p.x, o.y - p.y) > p.r + o.r + 20) continue;
        if (Math.random() < dt * 0.7) {
          p.face = Math.atan2(o.y - p.y, o.x - p.x);
          if (Math.random() < 0.35 && !p.grab) this._grab(p); else this._shove(p);
        }
        break;
      }
    }

    step(dt) {
      const P = [...this.players.values()];
      for (const p of P) {
        p.cd = Math.max(0, p.cd - dt);
        p.stun = Math.max(0, p.stun - dt);
        if (p.emoteT > 0) p.emoteT -= dt; else p.emote = -1;
        if (p.bot) this._bot(p, dt);
        let { dx, dy } = p.in;
        if (p.stun > 0) dx = dy = 0;
        let speed = p.grab ? 185 : 245;
        if (p.by !== null) {
          speed *= 0.35;
          // Tutulan oyuncu debelenerek kurtulur
          if (dx || dy) {
            p.struggle += dt;
            if (p.struggle > 1.2) {
              const g = this.players.get(p.by);
              if (g) this._release(g);
              this.events.push(['free', p.x, p.y - 30]);
            }
          }
        }
        const k = Math.min(1, (p.stun > 0 ? 1.5 : 10) * dt);
        p.vx += (dx * speed - p.vx) * k;
        p.vy += (dy * speed - p.vy) * k;
        if (dx || dy) p.face = Math.atan2(dy, dx);
      }

      // Tutma bağı: aradaki mesafe korunur, ağır olan daha az kıpırdar
      for (const p of P) {
        if (!p.grab) continue;
        const T = this._target(p.grab);
        if (!T) { p.grab = null; continue; }
        let nx = T.x - p.x, ny = T.y - p.y;
        const d = Math.hypot(nx, ny) || 1;
        nx /= d; ny /= d;
        if (d > 150) { this._release(p); continue; }
        const D = p.r + T.r + 2;
        if (d > D) {
          const ex = d - D, tot = p.m + T.m;
          T.x -= nx * ex * (p.m / tot); T.y -= ny * ex * (p.m / tot);
          p.x += nx * ex * (T.m / tot); p.y += ny * ex * (T.m / tot);
          const rv = (T.vx - p.vx) * nx + (T.vy - p.vy) * ny;
          if (rv > 0) {
            T.vx -= nx * rv * (p.m / tot); T.vy -= ny * rv * (p.m / tot);
            p.vx += nx * rv * (T.m / tot); p.vy += ny * rv * (T.m / tot);
          }
        }
      }

      const all = this._all();
      for (const b of all) { b.x += b.vx * dt; b.y += b.vy * dt; }
      for (const o of this.items) {
        const damp = Math.max(0, 1 - (o.k === 'ball' ? 0.9 : 3.2) * dt);
        o.vx *= damp; o.vy *= damp;
        if (o.k === 'ball' || o.k === 'duck') o.rot += (o.vx / o.r) * dt;
        else if (o.fallen && Math.abs(o.rot) < Math.PI / 2) o.rot = o.fd * Math.min(Math.PI / 2, Math.abs(o.rot) + dt * 9);
      }

      // Cisim-cisim çarpışması
      for (let i = 0; i < all.length; i++) {
        for (let j = i + 1; j < all.length; j++) {
          const a = all[i], b = all[j];
          let nx = b.x - a.x, ny = b.y - a.y;
          const d = Math.hypot(nx, ny), min = a.r + b.r;
          if (d >= min || d === 0) continue;
          nx /= d; ny /= d;
          const ov = min - d, tot = a.m + b.m;
          a.x -= nx * ov * (b.m / tot); a.y -= ny * ov * (b.m / tot);
          b.x += nx * ov * (a.m / tot); b.y += ny * ov * (a.m / tot);
          const rv = (b.vx - a.vx) * nx + (b.vy - a.vy) * ny;
          if (rv >= 0) continue;
          const e = Math.max(a.bounce || 0.3, b.bounce || 0.3);
          const jm = -(1 + e) * rv / (1 / a.m + 1 / b.m);
          a.vx -= nx * jm / a.m; a.vy -= ny * jm / a.m;
          b.vx += nx * jm / b.m; b.vy += ny * jm / b.m;
          if (-rv > 230) {
            for (const x of [a, b]) if (x.tip && !x.fallen) this._fall(x, x === a ? -nx : nx);
            if (isPlayer(a) && isPlayer(b) && -rv > 380) this.events.push(['bump', (a.x + b.x) / 2, (a.y + b.y) / 2 - 30]);
          }
        }
      }

      // Duvarlar ve mobilyalar
      for (const b of all) {
        for (const s of SOLIDS) this._rect(b, s);
        const minX = 20 + b.r, maxX = W - 20 - b.r, minY = WALL + 4, maxY = H - 14;
        if (b.x < minX) { b.x = minX; this._wallHit(b, 'x'); }
        if (b.x > maxX) { b.x = maxX; this._wallHit(b, 'x'); }
        if (b.y < minY) { b.y = minY; this._wallHit(b, 'y'); }
        if (b.y > maxY) { b.y = maxY; this._wallHit(b, 'y'); }
      }
    }

    _wallHit(b, axis) {
      const v = axis === 'x' ? b.vx : b.vy;
      if (b.tip && !b.fallen && Math.abs(v) > 260) this._fall(b, b.vx);
      if (axis === 'x') b.vx = -b.vx * (b.bounce || 0.3); else b.vy = -b.vy * (b.bounce || 0.3);
    }

    _rect(b, s) {
      const cx = Math.max(s.x, Math.min(b.x, s.x + s.w));
      const cy = Math.max(s.y, Math.min(b.y, s.y + s.h));
      let dx = b.x - cx, dy = b.y - cy;
      const d2 = dx * dx + dy * dy;
      if (d2 >= b.r * b.r) return;
      let nx, ny, pen;
      if (d2 > 0) {
        const d = Math.sqrt(d2);
        nx = dx / d; ny = dy / d; pen = b.r - d;
      } else {
        // merkez kutunun içinde: en kısa yoldan dışarı it
        const opts = [[b.x - s.x, -1, 0], [s.x + s.w - b.x, 1, 0], [b.y - s.y, 0, -1], [s.y + s.h - b.y, 0, 1]];
        opts.sort((p, q) => p[0] - q[0]);
        [pen, nx, ny] = [opts[0][0] + b.r, opts[0][1], opts[0][2]];
      }
      b.x += nx * pen; b.y += ny * pen;
      const vn = b.vx * nx + b.vy * ny;
      if (vn < 0) {
        if (b.tip && !b.fallen && -vn > 260) this._fall(b, nx || b.vx);
        const e = 1 + (b.bounce || 0.3);
        b.vx -= nx * vn * e; b.vy -= ny * vn * e;
      }
    }

    snapshot() {
      const r = Math.round;
      return {
        p: [...this.players.values()].map(p => [
          p.seat, r(p.x), r(p.y), r(p.vx), r(p.vy), r(p.face * 100),
          (p.stun > 0 ? 1 : 0) | (Math.hypot(p.vx, p.vy) > 30 ? 2 : 0) | (p.grab ? 4 : 0) | (p.by !== null ? 8 : 0),
          p.grab ? (p.grab.t === 'p' ? p.grab.id : 100 + p.grab.id) : -1, p.emote,
        ]),
        i: this.items.map(o => [r(o.x), r(o.y), r(o.vx), r(o.vy), r(o.rot * 100), o.fallen ? 1 : 0]),
        e: this.events.splice(0),
      };
    }
  }

  // ================= Çizim (herkeste) =================
  const V = {
    canvas: null, ctx: null, active: false, snap: null, snapAt: 0,
    disp: new Map(), items: [], room: [], me: null, tv: 'OYUN ODASI', fx: [], t: 0,
    onInput: () => {}, onAction: () => {}, keys: new Set(), lastIn: '0,0', joy: null,
  };

  function mount(canvas, ui) {
    V.canvas = canvas;
    V.ctx = canvas.getContext('2d');
    V.ui = ui;
    bindInput();
    requestAnimationFrame(loop);
  }

  function setActive(on) {
    V.active = on;
    if (!on) { V.keys.clear(); pushInput(0, 0); }
  }

  function setRoom(seats, me) { V.room = seats || []; V.me = me; }
  function setTV(text) { V.tv = text; }

  function setSnapshot(s) {
    V.snap = s;
    V.snapAt = performance.now();
    for (const ev of s.e || []) addFx(ev);
  }

  function lookOf(seat) {
    const s = V.room[seat];
    const l = (s && s.look) || {};
    return {
      color: COLORS[Number.isInteger(l.c) && l.c >= 0 && l.c < COLORS.length ? l.c : seat % COLORS.length],
      hat: HATS[Number.isInteger(l.h) && l.h >= 0 && l.h < HATS.length ? l.h : 0],
      name: s ? s.name : '',
      bot: s && s.kind === 'bot',
    };
  }

  // ---- efektler ve sesler ----
  const FX_TEXT = { crash: 'ŞANGIRR!', pat: 'PAT!', throw: 'VIIIN!', bump: 'BOİNG!', free: 'Kurtuldu!', tidy: 'Toparlandı ✨', grab: 'Hop!' };
  function addFx([k, x, y]) {
    if (FX_TEXT[k]) V.fx.push({ k, x, y, t: 0, text: FX_TEXT[k] });
    if (k === 'crash') for (let i = 0; i < 10; i++) V.fx.push({ k: 'bit', x, y: y + 20, vx: (Math.random() - 0.5) * 240, vy: -Math.random() * 220, t: 0 });
    if (V.active) sound(k);
  }

  let actx;
  function sound(k) {
    try {
      actx = actx || new (window.AudioContext || window.webkitAudioContext)();
      const now = actx.currentTime, g = actx.createGain();
      g.connect(actx.destination);
      if (k === 'crash') {
        const len = actx.sampleRate * 0.35, buf = actx.createBuffer(1, len, actx.sampleRate), d = buf.getChannelData(0);
        for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, 2);
        const src = actx.createBufferSource(), f = actx.createBiquadFilter();
        f.type = 'highpass'; f.frequency.value = 1200;
        src.buffer = buf; src.connect(f).connect(g);
        g.gain.value = 0.25; src.start(now);
        return;
      }
      const o = actx.createOscillator();
      o.connect(g);
      const map = { pat: [320, 90, 0.15], bump: [500, 180, 0.25], throw: [700, 200, 0.3], grab: [600, 900, 0.08], free: [400, 800, 0.15], pop: [300, 700, 0.1], tidy: [500, 1000, 0.2], whoosh: [200, 120, 0.12] };
      const [a, b, dur] = map[k] || [400, 300, 0.1];
      o.type = k === 'bump' ? 'sine' : 'triangle';
      o.frequency.setValueAtTime(a, now);
      o.frequency.exponentialRampToValueAtTime(b, now + dur);
      g.gain.setValueAtTime(0.12, now);
      g.gain.exponentialRampToValueAtTime(0.001, now + dur);
      o.start(now);
      o.stop(now + dur);
    } catch { /* ses yok */ }
  }

  // ---- yardımcı çizimler ----
  function rr(c, x, y, w, h, r) {
    c.beginPath();
    c.moveTo(x + r, y);
    c.arcTo(x + w, y, x + w, y + h, r);
    c.arcTo(x + w, y + h, x, y + h, r);
    c.arcTo(x, y + h, x, y, r);
    c.arcTo(x, y, x + w, y, r);
    c.closePath();
  }
  function ell(c, x, y, rx, ry, fill) {
    c.beginPath();
    c.ellipse(x, y, rx, ry, 0, 0, Math.PI * 2);
    c.fillStyle = fill;
    c.fill();
  }
  function shade(hex, amt) {
    const n = parseInt(hex.slice(1), 16);
    const f = (v) => Math.max(0, Math.min(255, v + amt));
    return `rgb(${f(n >> 16)},${f((n >> 8) & 255)},${f(n & 255)})`;
  }

  function drawRoom(c) {
    // Zemin: parke
    c.fillStyle = '#f3c78f';
    c.fillRect(0, WALL, W, H - WALL);
    c.strokeStyle = 'rgba(150,95,40,.18)';
    c.lineWidth = 2;
    for (let y = WALL, row = 0; y < H; y += 36, row++) {
      c.beginPath(); c.moveTo(0, y); c.lineTo(W, y); c.stroke();
      for (let x = (row % 2) * 90; x < W; x += 180) { c.beginPath(); c.moveTo(x, y); c.lineTo(x, y + 36); c.stroke(); }
    }
    // Duvar
    const g = c.createLinearGradient(0, 0, 0, WALL);
    g.addColorStop(0, '#ffd1e3');
    g.addColorStop(1, '#ffb3cf');
    c.fillStyle = g;
    c.fillRect(0, 0, W, WALL);
    c.fillStyle = 'rgba(255,255,255,.22)';
    for (let x = 0; x < W; x += 40) c.fillRect(x, 0, 16, WALL);
    c.fillStyle = '#fff';
    c.fillRect(0, WALL - 10, W, 10);
    // Pencere
    rr(c, 262, 18, 176, 92, 8); c.fillStyle = '#fff'; c.fill();
    const sky = c.createLinearGradient(0, 24, 0, 104);
    sky.addColorStop(0, '#74c0fc'); sky.addColorStop(1, '#d0ebff');
    c.fillStyle = sky; c.fillRect(270, 26, 160, 76);
    ell(c, 400, 46, 13, 13, '#ffe066');
    ell(c, 310, 60, 22, 9, '#fff'); ell(c, 328, 54, 16, 9, '#fff');
    c.fillStyle = '#fff'; c.fillRect(347, 26, 6, 76); c.fillRect(270, 61, 160, 5);
    c.fillStyle = '#f06595';
    c.beginPath(); c.moveTo(255, 12); c.quadraticCurveTo(275, 70, 262, 118); c.lineTo(250, 118); c.lineTo(250, 12); c.fill();
    c.beginPath(); c.moveTo(445, 12); c.quadraticCurveTo(425, 70, 438, 118); c.lineTo(450, 118); c.lineTo(450, 12); c.fill();
    // Tablo
    rr(c, 760, 28, 100, 70, 6); c.fillStyle = '#e8590c'; c.fill();
    c.fillStyle = '#fff4e6'; c.fillRect(768, 36, 84, 54);
    ell(c, 795, 63, 14, 14, '#4dabf7'); ell(c, 822, 70, 18, 12, '#69db7c'); ell(c, 830, 52, 8, 8, '#ffd43b');
    // Saat (gerçek saat)
    const cx = 905, cy = 62;
    ell(c, cx, cy, 26, 26, '#fff'); c.lineWidth = 4; c.strokeStyle = '#845ef7'; c.stroke();
    const now = new Date(), hA = ((now.getHours() % 12) + now.getMinutes() / 60) * Math.PI / 6, mA = now.getMinutes() * Math.PI / 30;
    c.strokeStyle = '#343a40'; c.lineCap = 'round';
    c.beginPath(); c.moveTo(cx, cy); c.lineTo(cx + Math.sin(hA) * 12, cy - Math.cos(hA) * 12); c.stroke();
    c.lineWidth = 2.5;
    c.beginPath(); c.moveTo(cx, cy); c.lineTo(cx + Math.sin(mA) * 18, cy - Math.cos(mA) * 18); c.stroke();
    // Halı
    ell(c, 600, 455, 300, 150, '#9775fa');
    ell(c, 600, 455, 270, 130, '#b197fc');
    ell(c, 600, 455, 230, 105, '#d0bfff');
    c.setLineDash([10, 10]); c.lineWidth = 3; c.strokeStyle = 'rgba(255,255,255,.6)';
    c.beginPath(); c.ellipse(600, 455, 250, 118, 0, 0, Math.PI * 2); c.stroke(); c.setLineDash([]);
  }

  function drawSolid(c, s) {
    const { x, y, w, h } = s;
    if (s.k === 'shelf') {
      rr(c, x, y - 95, w, h + 95, 6); c.fillStyle = '#a0662f'; c.fill();
      c.fillStyle = '#7a4a1c';
      for (let k = 0; k < 3; k++) {
        const sy = y - 85 + k * 45;
        c.fillRect(x + 8, sy + 36, w - 16, 5);
        const books = ['#ff6b6b', '#4dabf7', '#ffd43b', '#69db7c', '#da77f2', '#ff922b'];
        for (let b = 0; b < 7; b++) {
          c.fillStyle = books[(b + k * 2) % books.length];
          const bh = 22 + ((b * 7 + k * 3) % 12);
          c.fillRect(x + 12 + b * 21, sy + 36 - bh, 16, bh);
        }
        c.fillStyle = '#7a4a1c';
      }
    } else if (s.k === 'tv') {
      rr(c, x, y - 10, w, h + 10, 8); c.fillStyle = '#5c3d2e'; c.fill();
      c.fillStyle = '#7f5539'; c.fillRect(x + 10, y + 4, w - 20, h - 14);
      rr(c, x + 15, y - 105, w - 30, 92, 8); c.fillStyle = '#212529'; c.fill();
      const tg = c.createLinearGradient(x + 22, 0, x + w - 22, 0);
      const hue = (V.t * 40) % 360;
      tg.addColorStop(0, `hsl(${hue},80%,55%)`); tg.addColorStop(1, `hsl(${(hue + 120) % 360},80%,55%)`);
      c.fillStyle = tg; c.fillRect(x + 22, y - 98, w - 44, 78);
      c.fillStyle = '#fff'; c.font = 'bold 18px system-ui, sans-serif'; c.textAlign = 'center'; c.textBaseline = 'middle';
      c.fillText(V.tv, x + w / 2, y - 59);
    } else if (s.k === 'counter') {
      c.fillStyle = '#e9ecef'; c.fillRect(x, y - 95, w, 50);
      c.fillStyle = '#ced4da'; for (let k = 0; k < 3; k++) c.fillRect(x + 8 + k * 64, y - 88, 56, 36);
      rr(c, x, y - 20, w, h + 20, 6); c.fillStyle = '#74c0fc'; c.fill();
      c.fillStyle = '#f8f9fa'; c.fillRect(x - 4, y - 24, w + 8, 12);
      ell(c, x + 50, y - 34, 14, 11, '#fa5252'); c.fillStyle = '#fa5252'; c.fillRect(x + 62, y - 40, 10, 4);
      ell(c, x + 140, y - 30, 18, 6, '#fff');
      ell(c, x + 135, y - 36, 6, 6, '#ff922b'); ell(c, x + 147, y - 35, 6, 6, '#94d82d');
    } else if (s.k === 'table') {
      c.fillStyle = '#8d5524';
      c.fillRect(x + 10, y + 10, 8, h - 4); c.fillRect(x + w - 18, y + 10, 8, h - 4);
      rr(c, x, y - 12, w, h - 10, 12); c.fillStyle = '#c68642'; c.fill();
      rr(c, x + 6, y - 8, w - 12, h - 20, 10); c.fillStyle = '#e0a96d'; c.fill();
      ell(c, x + 55, y + 18, 24, 12, '#fff');
      ell(c, x + 48, y + 13, 8, 8, '#ff6b6b'); ell(c, x + 61, y + 13, 7, 7, '#ffd43b'); ell(c, x + 55, y + 8, 6, 6, '#69db7c');
      c.save(); c.translate(x + 120, y + 15); c.rotate(-0.3);
      c.fillStyle = '#fff'; c.fillRect(-10, -14, 20, 28); c.fillStyle = '#e03131'; c.font = 'bold 12px sans-serif'; c.fillText('A', 0, 0);
      c.restore();
    } else if (s.k === 'sofa' || s.k === 'armchair') {
      const col = s.k === 'sofa' ? '#20c997' : '#ff8787';
      rr(c, x, y - 40, w, h + 40, 22); c.fillStyle = shade(col, -40); c.fill();
      rr(c, x + 8, y - 34, w - 16, 44, 16); c.fillStyle = shade(col, -10); c.fill();
      const seats = s.k === 'sofa' ? 3 : 1, sw = (w - 40) / seats;
      for (let k = 0; k < seats; k++) { rr(c, x + 20 + k * sw + 3, y + 8, sw - 6, h - 20, 14); c.fillStyle = col; c.fill(); }
      rr(c, x - 4, y - 10, 26, h + 6, 12); c.fillStyle = shade(col, -25); c.fill();
      rr(c, x + w - 22, y - 10, 26, h + 6, 12); c.fill();
      if (s.k === 'sofa') { rr(c, x + 40, y - 18, 50, 34, 10); c.fillStyle = '#ffd43b'; c.fill(); }
    }
  }

  function drawItem(c, o, it) {
    c.save();
    c.translate(o.x, o.y);
    ell(c, 0, 2, it.r + 4, (it.r + 4) * 0.35, 'rgba(0,0,0,.15)');
    if (it.k === 'ball' || it.k === 'duck') {
      if (it.k === 'ball') {
        c.translate(0, -it.r);
        c.rotate(o.rot);
        const cols = ['#ff6b6b', '#fff', '#4dabf7', '#fff', '#ffd43b', '#fff'];
        for (let k = 0; k < 6; k++) {
          c.beginPath(); c.moveTo(0, 0); c.arc(0, 0, it.r, k * Math.PI / 3, (k + 1) * Math.PI / 3); c.fillStyle = cols[k]; c.fill();
        }
      } else {
        c.scale(o.vx < 0 ? -1 : 1, 1);
        ell(c, 0, -9, 12, 9, '#ffd43b'); ell(c, 7, -19, 7, 7, '#ffd43b');
        ell(c, 13, -18, 4, 2.5, '#ff922b'); ell(c, 9, -21, 1.5, 1.5, '#000');
      }
    } else if (it.k === 'puf') {
      ell(c, 0, -14, it.r, it.r * 0.75, shade(it.color, -30));
      ell(c, 0, -18, it.r - 2, it.r * 0.6, it.color);
      ell(c, 0, -20, 3, 2, shade(it.color, -50));
    } else if (it.k === 'box') {
      rr(c, -20, -32, 40, 32, 5); c.fillStyle = '#ffa94d'; c.fill();
      c.fillStyle = '#e8590c'; c.fillRect(-20, -32, 40, 6);
      ell(c, -8, -34, 6, 6, '#4dabf7'); ell(c, 7, -36, 5, 5, '#69db7c');
    } else {
      // Devrilebilenler: dibinden döndür
      c.rotate(o.rot);
      if (it.k === 'plant') {
        c.fillStyle = '#e8590c';
        c.beginPath(); c.moveTo(-13, -26); c.lineTo(13, -26); c.lineTo(9, 0); c.lineTo(-9, 0); c.fill();
        c.fillStyle = '#2b8a3e';
        for (const [lx, ly, a] of [[-10, -42, -0.5], [10, -44, 0.5], [0, -52, 0], [-4, -36, -1], [6, -38, 1]]) {
          c.save(); c.translate(lx, ly); c.rotate(a); ell(c, 0, 0, 7, 15, '#40c057'); c.restore();
        }
        if (o.fallen) ell(c, 0, -30, 14, 6, '#795548');
      } else if (it.k === 'lamp') {
        c.fillStyle = '#495057'; c.fillRect(-2, -60, 4, 60); ell(c, 0, 0, 10, 4, '#495057');
        c.fillStyle = '#ffe066';
        c.beginPath(); c.moveTo(-14, -60); c.lineTo(14, -60); c.lineTo(9, -80); c.lineTo(-9, -80); c.fill();
        if (!o.fallen) ell(c, 0, -58, 18, 6, 'rgba(255,224,102,.35)');
      } else if (it.k === 'vase') {
        c.fillStyle = '#4c6ef5';
        c.beginPath(); c.moveTo(-6, -30); c.quadraticCurveTo(-14, -14, -7, 0); c.lineTo(7, 0); c.quadraticCurveTo(14, -14, 6, -30); c.fill();
        ell(c, -4, -36, 4, 4, '#f06595'); ell(c, 4, -38, 4, 4, '#ffd43b'); ell(c, 0, -42, 4, 4, '#ff6b6b');
      }
    }
    c.restore();
  }

  function drawHat(c, hat, color) {
    if (hat === 'tac') {
      c.fillStyle = '#fcc419';
      c.beginPath(); c.moveTo(-12, -50); c.lineTo(-12, -60); c.lineTo(-6, -54); c.lineTo(0, -63); c.lineTo(6, -54); c.lineTo(12, -60); c.lineTo(12, -50); c.closePath(); c.fill();
      ell(c, 0, -56, 2.5, 2.5, '#e03131');
    } else if (hat === 'kep') {
      c.fillStyle = shade(color, -60);
      c.beginPath(); c.arc(0, -48, 15, Math.PI, 0); c.fill();
      ell(c, 9, -48, 13, 4, shade(color, -80));
    } else if (hat === 'parti') {
      c.fillStyle = '#845ef7';
      c.beginPath(); c.moveTo(-10, -50); c.lineTo(10, -50); c.lineTo(0, -74); c.closePath(); c.fill();
      c.strokeStyle = '#ffd43b'; c.lineWidth = 3;
      c.beginPath(); c.moveTo(-6, -58); c.lineTo(5, -60); c.stroke();
      ell(c, 0, -75, 4, 4, '#ff6b6b');
    } else if (hat === 'kulaklik') {
      c.strokeStyle = '#343a40'; c.lineWidth = 4;
      c.beginPath(); c.arc(0, -36, 19, Math.PI * 1.05, Math.PI * 1.95); c.stroke();
      rr(c, -23, -38, 8, 14, 4); c.fillStyle = '#e03131'; c.fill();
      rr(c, 15, -38, 8, 14, 4); c.fill();
    } else if (hat === 'cicek') {
      for (let k = 0; k < 5; k++) { const a = k * Math.PI * 0.4; ell(c, 10 + Math.cos(a) * 5, -48 + Math.sin(a) * 5, 4, 4, '#f783ac'); }
      ell(c, 10, -48, 3, 3, '#ffd43b');
    }
  }

  function drawBean(c, x, y, look, face, flags, grabAt, emote, t) {
    const moving = flags & 2, stun = flags & 1, grabbing = flags & 4, held = flags & 8;
    const fx = Math.cos(face), fy = Math.sin(face);
    const bob = moving ? Math.abs(Math.sin(t * 14)) * -4 : Math.sin(t * 3) * 1;
    const sq = moving ? 1 + Math.sin(t * 28) * 0.04 : 1 + Math.sin(t * 3) * 0.015;
    c.save();
    c.translate(x, y);
    ell(c, 0, 2, 20, 7, 'rgba(0,0,0,.2)');
    // ayaklar
    const step = moving ? Math.sin(t * 14) * 5 : 0;
    ell(c, -8 + fx * step, -1 + fy * step * 0.5, 7, 5, shade(look.color, -60));
    ell(c, 8 - fx * step, -1 - fy * step * 0.5, 7, 5, shade(look.color, -60));
    if (stun) c.rotate(Math.sin(t * 20) * 0.15);
    c.translate(0, bob);
    c.scale(1 / sq, sq);
    // gövde
    const g = c.createLinearGradient(0, -48, 0, 0);
    g.addColorStop(0, shade(look.color, 40));
    g.addColorStop(1, shade(look.color, -15));
    rr(c, -18, -48, 36, 46, 18);
    c.fillStyle = g;
    c.fill();
    ell(c, -6, -38, 5, 8, 'rgba(255,255,255,.35)');
    // kollar
    const armOut = grabbing ? 16 : 0;
    ell(c, -19 + (grabbing ? fx * armOut : 0), -22 + (grabbing ? fy * 6 : Math.sin(t * 6) * 1.5), 6, 5, shade(look.color, -25));
    ell(c, 19 + (grabbing ? fx * armOut : 0), -22 + (grabbing ? fy * 6 : -Math.sin(t * 6) * 1.5), 6, 5, shade(look.color, -25));
    // yüz (arkası dönükse gözler görünmez)
    if (fy > -0.75) {
      const ex = fx * 5, ey = Math.max(0, fy) * 2;
      if (stun) {
        c.strokeStyle = '#222'; c.lineWidth = 2.5;
        for (const sx of [-7, 7]) {
          c.beginPath(); c.moveTo(sx + ex - 4, -34 - 4); c.lineTo(sx + ex + 4, -34 + 4); c.moveTo(sx + ex + 4, -34 - 4); c.lineTo(sx + ex - 4, -34 + 4); c.stroke();
        }
      } else {
        const blink = (Math.floor(t * 10) % 37) === 0;
        for (const sx of [-7, 7]) {
          if (blink) { c.fillStyle = '#222'; c.fillRect(sx + ex - 5, -34 + ey, 10, 2); continue; }
          ell(c, sx + ex, -34 + ey, 6, 7, '#fff');
          ell(c, sx + ex + fx * 2, -33 + ey + fy * 1.5, 3.2, 3.6, '#222');
          ell(c, sx + ex + fx * 2 + 1, -35 + ey + fy * 1.5, 1.1, 1.1, '#fff');
        }
      }
      ell(c, -12 + ex, -25 + ey, 4, 2.5, 'rgba(255,100,130,.45)');
      ell(c, 12 + ex, -25 + ey, 4, 2.5, 'rgba(255,100,130,.45)');
      c.strokeStyle = '#222'; c.lineWidth = 2;
      c.beginPath();
      if (held || stun) c.arc(ex, -20 + ey, 3.5, 0, Math.PI * 2);   // şaşkın ağız
      else c.arc(ex, -24 + ey, 4, 0.2 * Math.PI, 0.8 * Math.PI);
      c.stroke();
    }
    drawHat(c, look.hat, look.color);
    c.restore();
    // sersemleme yıldızları
    if (stun) {
      for (let k = 0; k < 3; k++) {
        const a = t * 6 + k * 2.1;
        c.fillStyle = '#ffd43b';
        c.font = '14px sans-serif';
        c.fillText('★', x + Math.cos(a) * 18, y - 62 + Math.sin(a) * 5);
      }
    }
    // isim
    const label = (look.bot ? '🤖 ' : '') + look.name;
    c.font = 'bold 13px system-ui, sans-serif';
    c.textAlign = 'center';
    c.textBaseline = 'middle';
    const tw = c.measureText(label).width + 12;
    rr(c, x - tw / 2, y - 92, tw, 18, 9);
    c.fillStyle = 'rgba(0,0,0,.45)';
    c.fill();
    c.fillStyle = '#fff';
    c.fillText(label, x, y - 83);
    if (emote >= 0) {
      ell(c, x + 22, y - 112, 17, 15, '#fff');
      c.beginPath(); c.moveTo(x + 12, y - 100); c.lineTo(x + 8, y - 92); c.lineTo(x + 20, y - 99); c.fill();
      c.font = '18px sans-serif';
      c.fillText(EMOTES[emote], x + 22, y - 111);
    }
  }

  let lastFrame = performance.now();
  function loop(now) {
    requestAnimationFrame(loop);
    const dt = Math.min(0.05, (now - lastFrame) / 1000);
    lastFrame = now;
    if (!V.active || !V.canvas) return;
    V.t += dt;
    pollKeys();
    const cv = V.canvas, dpr = window.devicePixelRatio || 1;
    const cw = cv.clientWidth, ch = cv.clientHeight;
    if (cv.width !== Math.round(cw * dpr) || cv.height !== Math.round(ch * dpr)) { cv.width = Math.round(cw * dpr); cv.height = Math.round(ch * dpr); }
    const c = V.ctx;
    // Dar/dikey ekranda oda yüksekliğe sığdırılır, kamera kendi karakterini takip eder
    let sc = Math.min(cv.width / W, cv.height / H), ox = (cv.width - W * sc) / 2;
    if (cv.width / cv.height < 1.2) {
      sc = cv.height / H;
      const me = V.disp.get(V.me);
      const want = cv.width / 2 - (me ? me.x : W / 2) * sc;
      V.camX = V.camX === undefined ? want : V.camX + (want - V.camX) * Math.min(1, dt * 5);
      ox = Math.max(cv.width - W * sc, Math.min(0, V.camX));
    }
    c.setTransform(1, 0, 0, 1, 0, 0);
    c.fillStyle = '#3b2a4d';
    c.fillRect(0, 0, cv.width, cv.height);
    c.setTransform(sc, 0, 0, sc, ox, (cv.height - H * sc) / 2);
    drawRoom(c);

    const s = V.snap;
    const age = s ? Math.min(0.15, (now - V.snapAt) / 1000) : 0;
    const k = 1 - Math.pow(0.0005, dt); // kare hızından bağımsız yumuşatma
    const list = SOLIDS.map(so => ({ y: so.y + so.h, draw: () => drawSolid(c, so) }));
    if (s) {
      s.i.forEach((o, idx) => {
        const it = ITEMS[idx];
        const tx = o[0] + o[2] * age, ty = o[1] + o[3] * age;
        const d = V.items[idx] || (V.items[idx] = { x: tx, y: ty });
        d.x += (tx - d.x) * k; d.y += (ty - d.y) * k;
        const st = { x: d.x, y: d.y, rot: o[4] / 100, fallen: o[5] === 1, vx: o[2] };
        list.push({ y: d.y, draw: () => drawItem(c, st, it) });
      });
      const seen = new Set();
      for (const p of s.p) {
        const [seat, x, y, vx, vy, face, flags, grab, emote] = p;
        seen.add(seat);
        const tx = x + vx * age, ty = y + vy * age;
        let d = V.disp.get(seat);
        if (!d || Math.hypot(d.x - tx, d.y - ty) > 200) { d = { x: tx, y: ty }; V.disp.set(seat, d); }
        d.x += (tx - d.x) * k; d.y += (ty - d.y) * k;
        const look = lookOf(seat);
        list.push({ y: d.y, draw: () => { c.save(); c.translate(d.x, d.y); c.scale(BEAN, BEAN); drawBean(c, 0, 0, look, face / 100, flags, grab, emote, V.t + seat); c.restore(); } });
        if (seat === V.me) {
          list.push({ y: 9999, draw: () => { c.fillStyle = '#fff'; c.font = '18px sans-serif'; c.textAlign = 'center'; c.fillText('▼', d.x, d.y - 104 * BEAN - (emote >= 0 ? 30 : 0) + Math.sin(V.t * 5) * 3); } });
        }
      }
      for (const key of [...V.disp.keys()]) if (!seen.has(key)) V.disp.delete(key);
    }
    list.sort((a, b) => a.y - b.y);
    for (const e of list) e.draw();

    // efektler
    V.fx = V.fx.filter(f => (f.t += dt) < (f.k === 'bit' ? 0.8 : 1.1));
    for (const f of V.fx) {
      if (f.k === 'bit') {
        f.x += f.vx * dt; f.y += f.vy * dt; f.vy += 600 * dt;
        c.fillStyle = '#868e96'; c.fillRect(f.x, f.y, 5, 5);
        continue;
      }
      const a = 1 - f.t / 1.1, sz = 18 + Math.min(1, f.t * 8) * 10;
      c.save();
      c.globalAlpha = a;
      c.translate(f.x, f.y - f.t * 40);
      c.rotate(-0.12);
      c.font = `900 ${sz}px system-ui, sans-serif`;
      c.textAlign = 'center';
      c.lineWidth = 5; c.strokeStyle = '#fff';
      c.strokeText(f.text, 0, 0);
      c.fillStyle = f.k === 'crash' ? '#e03131' : f.k === 'tidy' ? '#2b8a3e' : '#7048e8';
      c.fillText(f.text, 0, 0);
      c.restore();
    }
    if (!s) {
      c.fillStyle = 'rgba(0,0,0,.4)'; c.font = 'bold 22px system-ui'; c.textAlign = 'center';
      c.fillText('Salon yükleniyor…', W / 2, H / 2);
    }
  }

  // ================= Kontroller =================
  const typing = () => { const a = document.activeElement; return a && (a.tagName === 'INPUT' || a.tagName === 'TEXTAREA'); };
  const KEYMAP = { ArrowUp: 'u', KeyW: 'u', ArrowDown: 'd', KeyS: 'd', ArrowLeft: 'l', KeyA: 'l', ArrowRight: 'r', KeyD: 'r' };

  function pushInput(dx, dy) {
    const key = `${dx.toFixed(2)},${dy.toFixed(2)}`;
    if (key === V.lastIn) return;
    V.lastIn = key;
    V.onInput(+dx.toFixed(2), +dy.toFixed(2));
  }

  function pollKeys() {
    let dx = 0, dy = 0;
    if (V.joy) { dx = V.joy.dx; dy = V.joy.dy; }
    else {
      if (V.keys.has('l')) dx -= 1;
      if (V.keys.has('r')) dx += 1;
      if (V.keys.has('u')) dy -= 1;
      if (V.keys.has('d')) dy += 1;
      const l = Math.hypot(dx, dy);
      if (l) { dx /= l; dy /= l; }
    }
    pushInput(dx, dy);
  }

  function bindInput() {
    window.addEventListener('keydown', (e) => {
      if (!V.active || typing()) return;
      const k = KEYMAP[e.code];
      if (k) { V.keys.add(k); e.preventDefault(); return; }
      if (e.repeat) return;
      if (e.code === 'Space') { e.preventDefault(); V.onAction('grab'); }
      else if (e.code === 'ShiftLeft' || e.code === 'ShiftRight' || e.code === 'KeyF') { e.preventDefault(); V.onAction('shove'); }
      else if (/^Digit[1-6]$/.test(e.code)) V.onAction('emote', +e.code.slice(5) - 1);
    });
    window.addEventListener('keyup', (e) => { const k = KEYMAP[e.code]; if (k) V.keys.delete(k); });
    window.addEventListener('blur', () => V.keys.clear());

    // Dokunmatik joystick
    const zone = V.ui.querySelector('.joy');
    const knob = zone && zone.querySelector('.joy-knob');
    if (zone) {
      const upd = (e) => {
        const r = zone.getBoundingClientRect();
        let dx = (e.clientX - (r.left + r.width / 2)) / (r.width / 2);
        let dy = (e.clientY - (r.top + r.height / 2)) / (r.height / 2);
        const l = Math.hypot(dx, dy);
        if (l > 1) { dx /= l; dy /= l; }
        V.joy = { dx, dy };
        knob.style.transform = `translate(${dx * 32}px, ${dy * 32}px)`;
      };
      zone.addEventListener('pointerdown', (e) => { zone.setPointerCapture(e.pointerId); upd(e); });
      zone.addEventListener('pointermove', (e) => { if (V.joy) upd(e); });
      const end = () => { V.joy = null; knob.style.transform = ''; };
      zone.addEventListener('pointerup', end);
      zone.addEventListener('pointercancel', end);
    }
    V.ui.addEventListener('click', (e) => {
      const b = e.target.closest('[data-salon]');
      if (!b) return;
      const [a, arg] = b.dataset.salon.split(':');
      V.onAction(a, arg !== undefined ? +arg : undefined);
    });
  }

  const api = {
    W, H, COLORS, HATS, HAT_NAMES, EMOTES, Sim,
    mount, setActive, setRoom, setSnapshot, setTV,
    set onInput(f) { V.onInput = f; }, set onAction(f) { V.onAction = f; },
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.Salon = api;
})(this);
