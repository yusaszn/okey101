/* Okey 101 — taşlar ve per kuralları (tarayıcıda ve Node'da çalışır) */
(function (root) {
  'use strict';

  const COLOR_NAMES = ['Kırmızı', 'Sarı', 'Mavi', 'Siyah'];
  const TILE_COUNT = 106;          // 4 renk x 13 sayı x 2 + 2 sahte okey
  const OPEN_SERIES_MIN = 101;
  const OPEN_PAIRS_MIN = 5;

  // id 0..103 -> renk = id/26, sayı = id%13+1 ; 104,105 -> sahte okey
  function tileInfo(id) {
    if (id >= 104) return { id, fake: true, c: -1, n: 0 };
    return { id, fake: false, c: Math.floor(id / 26), n: (id % 13) + 1 };
  }

  function okeyFromIndicator(indId) {
    const t = tileInfo(indId);
    return { c: t.c, n: t.n === 13 ? 1 : t.n + 1 };
  }

  function okeyTileId(ok) { return ok.c * 26 + ok.n - 1; }

  // Gerçek okey taşı (joker gibi her yere gider)
  function isWild(id, ok) {
    const t = tileInfo(id);
    return !t.fake && t.c === ok.c && t.n === ok.n;
  }

  // Sahte okey, okeyin yerini tutar
  function eff(id, ok) {
    const t = tileInfo(id);
    return t.fake ? { c: ok.c, n: ok.n } : { c: t.c, n: t.n };
  }

  function tileName(id, ok) {
    const t = tileInfo(id);
    if (t.fake) return 'Sahte Okey';
    return `${COLOR_NAMES[t.c]} ${t.n}` + (ok && isWild(id, ok) ? ' (Okey)' : '');
  }

  function split(ids, ok) {
    const wild = [], norm = [];
    for (const id of ids) (isWild(id, ok) ? wild : norm).push(id);
    return { wild, norm };
  }

  // Aynı sayı, farklı renk: 3-4 taş
  function analyzeSet(ids, ok) {
    if (ids.length < 3 || ids.length > 4) return null;
    const { wild, norm } = split(ids, ok);
    if (!norm.length) return null;
    const n = eff(norm[0], ok).n;
    const colors = new Set();
    for (const id of norm) {
      const e = eff(id, ok);
      if (e.n !== n || colors.has(e.c)) return null;
      colors.add(e.c);
    }
    norm.sort((a, b) => eff(a, ok).c - eff(b, ok).c);
    return { type: 'set', value: n * ids.length, order: norm.concat(wild) };
  }

  // Aynı renk, ardışık sayı: en az 3 taş. 12-13-1 olur, 13-1-2 olmaz (14 = sondaki 1).
  function analyzeRun(ids, ok) {
    const len = ids.length;
    if (len < 3 || len > 14) return null;
    const { wild, norm } = split(ids, ok);
    if (!norm.length) return null;
    const c = eff(norm[0], ok).c;
    for (const id of norm) if (eff(id, ok).c !== c) return null;
    // En yüksek değerli yerleşimi dene
    for (let s = 15 - len; s >= 1; s--) {
      const e = s + len - 1;
      const slots = new Array(len).fill(null);
      let fits = true;
      for (const id of norm) {
        const n = eff(id, ok).n;
        const cands = n === 1 ? [1, 14] : [n];
        let placed = false;
        for (const v of cands) {
          if (v >= s && v <= e && slots[v - s] === null) { slots[v - s] = id; placed = true; break; }
        }
        if (!placed) { fits = false; break; }
      }
      if (!fits) continue;
      let w = 0, value = 0;
      const order = slots.map(x => (x === null ? wild[w++] : x));
      for (let v = s; v <= e; v++) value += v === 14 ? 1 : v;
      return { type: 'run', value, order };
    }
    return null;
  }

  function analyzeGroup(ids, ok) {
    const a = analyzeSet(ids, ok), b = analyzeRun(ids, ok);
    if (a && b) return a.value >= b.value ? a : b;
    return a || b;
  }

  function isPair(ids, ok) {
    if (ids.length !== 2) return false;
    if (isWild(ids[0], ok) || isWild(ids[1], ok)) return true;
    const x = eff(ids[0], ok), y = eff(ids[1], ok);
    return x.c === y.c && x.n === y.n;
  }

  // Eldeki taşların ceza değeri (okey kendi sayısı kadar)
  function handValue(hand, ok) {
    return hand.reduce((s, id) => s + eff(id, ok).n, 0);
  }

  function keyMap(hand, ok) {
    const wilds = [], byKey = new Map();
    for (const id of hand) {
      if (isWild(id, ok)) { wilds.push(id); continue; }
      const e = eff(id, ok), k = e.c * 16 + e.n;
      if (!byKey.has(k)) byKey.set(k, []);
      byKey.get(k).push(id);
    }
    return { wilds, byKey };
  }

  // Elden en yüksek toplamlı ayrık perleri bul (otomatik dizme ve botlar için)
  function findBestGroups(hand, ok, nodeLimit = 40000) {
    const { wilds, byKey } = keyMap(hand, ok);
    const W = wilds.length;
    const cands = [];
    const add = (keys, w, value) => {
      const need = new Map();
      for (const k of keys) need.set(k, (need.get(k) || 0) + 1);
      const base = keys.reduce((s, k) => s + (k % 16), 0);
      cands.push({ keys, w, value, need, base });
    };
    // Setler
    for (let n = 1; n <= 13; n++) {
      const cols = [0, 1, 2, 3].filter(c => byKey.has(c * 16 + n));
      for (let mask = 1; mask < 1 << cols.length; mask++) {
        const sub = cols.filter((_, i) => mask & (1 << i));
        for (let w = 0; w <= W; w++) {
          const size = sub.length + w;
          if (size >= 3 && size <= 4) add(sub.map(c => c * 16 + n), w, n * size);
        }
      }
    }
    // Seriler
    for (let c = 0; c < 4; c++) {
      for (let s = 1; s <= 13; s++) {
        const keys = [];
        let miss = 0, value = 0;
        for (let v = s; v <= 14; v++) {
          const n = v === 14 ? 1 : v, k = c * 16 + n;
          const have = (byKey.get(k) || []).length - keys.filter(x => x === k).length;
          if (have > 0) keys.push(k); else if (++miss > W) break;
          value += n;
          if (v - s + 1 >= 3 && keys.length) add(keys.slice(), miss, value);
        }
      }
    }
    cands.sort((a, b) => b.value - a.value);

    const cnt = new Map();
    let remSum = 0;
    for (const [k, arr] of byKey) { cnt.set(k, arr.length); remSum += (k % 16) * arr.length; }
    let best = { value: 0, pick: [] }, nodes = 0;
    const pick = [];
    const dfs = (i, wl, val, rem) => {
      if (++nodes > nodeLimit) return;
      if (val > best.value) best = { value: val, pick: pick.slice() };
      if (val + rem + wl * 13 <= best.value) return;
      for (let j = i; j < cands.length; j++) {
        const cd = cands[j];
        if (cd.w > wl) continue;
        let okk = true;
        for (const [k, q] of cd.need) if ((cnt.get(k) || 0) < q) { okk = false; break; }
        if (!okk) continue;
        for (const [k, q] of cd.need) cnt.set(k, cnt.get(k) - q);
        pick.push(j);
        dfs(j, wl - cd.w, val + cd.value, rem - cd.base);
        pick.pop();
        for (const [k, q] of cd.need) cnt.set(k, cnt.get(k) + q);
        if (nodes > nodeLimit) return;
      }
    };
    dfs(0, W, 0, remSum);

    const stacks = new Map();
    for (const [k, arr] of byKey) stacks.set(k, arr.slice());
    const wl = wilds.slice();
    const groups = [];
    let value = 0;
    for (const j of best.pick) {
      const cd = cands[j];
      const ids = cd.keys.map(k => stacks.get(k).pop());
      for (let i = 0; i < cd.w; i++) ids.push(wl.pop());
      const r = analyzeGroup(ids, ok);
      if (r) { groups.push(r.order); value += r.value; }
    }
    return { groups, value };
  }

  // Elden çiftleri bul (okeyler tek kalan en büyük taşlarla eşleşir)
  function findPairs(hand, ok) {
    const { wilds, byKey } = keyMap(hand, ok);
    const pairs = [], singles = [];
    for (const arr of byKey.values()) {
      if (arr.length >= 2) pairs.push([arr[0], arr[1]]);
      else singles.push(arr[0]);
    }
    singles.sort((a, b) => eff(b, ok).n - eff(a, ok).n);
    for (const w of wilds) if (singles.length) pairs.push([singles.shift(), w]);
    return pairs;
  }

  const api = {
    COLOR_NAMES, TILE_COUNT, OPEN_SERIES_MIN, OPEN_PAIRS_MIN,
    tileInfo, okeyFromIndicator, okeyTileId, isWild, eff, tileName,
    analyzeSet, analyzeRun, analyzeGroup, isPair, handValue, findBestGroups, findPairs,
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.OkeyRules = api;
})(this);
