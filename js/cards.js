/* İskambil kartları — Pis Yedili ve Blackjack için ortak */
(function (root) {
  'use strict';

  const SUITS = ['♠', '♥', '♦', '♣'];
  const SUIT_NAMES = ['Maça', 'Kupa', 'Karo', 'Sinek'];
  const RANK_LABELS = ['', 'A', '2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K'];
  const RANK_NAMES = ['', 'As', '2', '3', '4', '5', '6', '7', '8', '9', '10', 'Vale', 'Kız', 'Papaz'];

  // id % 52 -> renk = /13, sayı = %13+1 (1 = As, 11 = Vale, 12 = Kız, 13 = Papaz)
  function card(id) {
    const d = id % 52;
    return { id, s: Math.floor(d / 13), r: (d % 13) + 1 };
  }

  function shuffle(a) {
    for (let i = a.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
  }

  function deck(count = 1) {
    return shuffle(Array.from({ length: 52 * count }, (_, i) => i));
  }

  function cardName(id) {
    const c = card(id);
    return `${SUIT_NAMES[c.s]} ${RANK_NAMES[c.r]}`;
  }

  // id null ise kapalı kart
  function cardHTML(id, opts = {}) {
    const cls = ['card'];
    if (opts.sm) cls.push('sm');
    if (opts.cls) cls.push(opts.cls);
    const attrs = opts.attrs || '';
    if (id === null || id === undefined) return `<div class="${cls.concat('back').join(' ')}" ${attrs}></div>`;
    const c = card(id);
    if (c.s === 1 || c.s === 2) cls.push('red');
    return `<div class="${cls.join(' ')}" data-card="${id}" ${attrs}>
      <span class="cr">${RANK_LABELS[c.r]}<br>${SUITS[c.s]}</span><span class="cc">${SUITS[c.s]}</span></div>`;
  }

  const api = { SUITS, SUIT_NAMES, RANK_LABELS, RANK_NAMES, card, shuffle, deck, cardName, cardHTML };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.Cards = api;
})(this);
