// Shared helpers used by every module.

// Let append()/prepend() take nested arrays and skip null/false, the same way h() does.
for (const method of ['append', 'prepend']) {
  const native = Element.prototype[method];
  Element.prototype[method] = function (...kids) {
    native.apply(this, kids.flat(Infinity).filter(k => k != null && k !== false));
  };
}

window.U = (() => {
  const $ = (sel, root = document) => root.querySelector(sel);
  const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];

  const esc = (s) => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const uid = () => Math.random().toString(36).slice(2, 10) + Date.now().toString(36).slice(-4);
  const rand = (n) => Math.floor(Math.random() * n);
  const pick = (arr) => arr[rand(arr.length)];
  const pickN = (arr, n) => { const a = [...arr], out = []; while (out.length < n && a.length) out.push(a.splice(rand(a.length), 1)[0]); return out; };
  const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
  const cap = (s) => s ? s[0].toUpperCase() + s.slice(1) : s;
  const debounce = (fn, ms) => { let t; return (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms); }; };
  const mod = (score) => Math.floor((Number(score) - 10) / 2);
  const sign = (n) => (n >= 0 ? '+' : '') + n;

  // Dice: supports "2d6+3", "1d20 - 1", "3d6*10", "d100", plain numbers.
  function roll(expr) {
    const src = String(expr).replace(/\s+/g, '').toLowerCase();
    let mult = 1, body = src;
    const m = /^(.*)[*x](\d+)$/.exec(src);
    if (m) { body = m[1]; mult = Number(m[2]); }
    const terms = body.match(/[+-]?[^+-]+/g) || [];
    let total = 0; const parts = [];
    for (const t of terms) {
      const neg = t.startsWith('-');
      const term = t.replace(/^[+-]/, '');
      const d = /^(\d*)d(\d+)$/.exec(term);
      if (d) {
        const n = Number(d[1] || 1), sides = Number(d[2]);
        const rolls = Array.from({ length: n }, () => 1 + rand(sides));
        const sum = rolls.reduce((a, b) => a + b, 0);
        total += neg ? -sum : sum; parts.push(`${neg ? '-' : ''}[${rolls.join(',')}]`);
      } else if (/^\d+$/.test(term)) {
        total += neg ? -Number(term) : Number(term); parts.push((neg ? '-' : '+') + term);
      } else return { total: NaN, detail: 'bad dice: ' + expr };
    }
    return { total: total * mult, detail: parts.join(' ') + (mult !== 1 ? ` ×${mult}` : '') };
  }
  const r = (expr) => roll(expr).total;

  // Replace every dice expression inside text with a rolled number, e.g. "2d6 gp" -> "7 gp".
  const rollInline = (text) => String(text).replace(/\b(\d*d\d+(?:\s*[+-]\s*\d+)?(?:\s*[*x]\s*\d+)?)\b/gi, (_, ex) => String(r(ex)));

  // Tiny DOM builder: h('div.cls#id', {attrs}, children...)
  function h(tag, attrs, ...kids) {
    const [, name, rest] = /^([a-z0-9]+)?(.*)$/i.exec(tag);
    const el = document.createElement(name || 'div');
    (rest.match(/[.#][^.#]+/g) || []).forEach(p => p[0] === '.' ? el.classList.add(p.slice(1)) : (el.id = p.slice(1)));
    if (attrs != null && attrs !== false && (typeof attrs !== 'object' || attrs instanceof Node || Array.isArray(attrs))) { kids.unshift(attrs); attrs = null; }
    for (const [k, v] of Object.entries(attrs || {})) {
      if (v == null || v === false) continue;
      if (k.startsWith('on')) el.addEventListener(k.slice(2), v);
      else if (k === 'html') el.innerHTML = v;
      else if (k === 'value') el.value = v;
      else if (k === 'checked') el.checked = !!v;
      else el.setAttribute(k, v === true ? '' : v);
    }
    const add = (k) => { if (k == null || k === false) return; if (Array.isArray(k)) k.forEach(add); else el.append(k instanceof Node ? k : document.createTextNode(String(k))); };
    kids.forEach(add);
    return el;
  }

  let toastTimer;
  function toast(msg, kind = '') {
    const t = $('#toast');
    t.textContent = msg; t.className = 'show ' + kind;
    clearTimeout(toastTimer); toastTimer = setTimeout(() => (t.className = ''), 2600);
  }

  // Modal dialog. Returns { close, body }.
  function modal(title, content, { wide = false, onClose } = {}) {
    const root = $('#modal-root');
    const close = () => { wrap.remove(); onClose && onClose(); };
    const body = h('div.modal-body', content);
    const wrap = h('div.modal-wrap', { onmousedown: (e) => { if (e.target === wrap) close(); } },
      h('div.modal' + (wide ? '.wide' : ''), h('header', h('h2', title), h('button.icon', { onclick: close, title: 'Close' }, '✕')), body));
    root.append(wrap);
    const first = body.querySelector('input,textarea,select');
    first && setTimeout(() => first.focus(), 30);
    return { close, body };
  }

  function prompt(title, value = '', placeholder = '') {
    return new Promise((resolve) => {
      let done = false;
      const input = h('input', { value, placeholder });
      const finish = (v) => { if (done) return; done = true; m.close(); resolve(v); };
      input.addEventListener('keydown', e => { if (e.key === 'Enter') finish(input.value.trim()); });
      const m = modal(title, [input, h('div.row.end', h('button', { onclick: () => finish(null) }, 'Cancel'), h('button.primary', { onclick: () => finish(input.value.trim()) }, 'OK'))],
        { onClose: () => { if (!done) { done = true; resolve(null); } } });
    });
  }

  function confirm(title, text) {
    return new Promise((resolve) => {
      let done = false;
      const finish = (v) => { if (done) return; done = true; m.close(); resolve(v); };
      const m = modal(title, [h('p', text), h('div.row.end', h('button', { onclick: () => finish(false) }, 'Cancel'), h('button.danger', { onclick: () => finish(true) }, 'Confirm'))],
        { onClose: () => { if (!done) { done = true; resolve(false); } } });
    });
  }

  const readFileAsDataUrl = (file) => new Promise((res, rej) => { const fr = new FileReader(); fr.onload = () => res(fr.result); fr.onerror = rej; fr.readAsDataURL(file); });
  const copy = (text) => navigator.clipboard.writeText(text).then(() => toast('Copied to clipboard'));
  // Pick a file (resolves null if nothing was chosen) and save one, in Electron and in the phone app alike.
  const pickFile = (accept) => new Promise((res) => {
    const inp = h('input', { type: 'file', accept, style: 'display:none' });
    inp.addEventListener('change', () => { res(inp.files[0] || null); inp.remove(); });
    document.body.append(inp); inp.click();
  });
  function download(blob, name) {
    const a = h('a', { href: URL.createObjectURL(blob), download: name, style: 'display:none' });
    document.body.append(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 30000);
  }

  // Phone layout: list/detail views show one side at a time. The layout gets .m-detail while an item is open, and
  // this button (only visible at phone width) goes back to the list.
  const mBack = (layout, onBack) => h('button.m-back', { title: 'Back to the list', onclick: () => { layout.classList.remove('m-detail'); onBack && onBack(); } }, '‹ Back');

  return { mBack, $, $$, esc, uid, rand, pick, pickN, clamp, cap, debounce, mod, sign, roll, r, rollInline, h, toast, modal, prompt, confirm, readFileAsDataUrl, copy, pickFile, download };
})();

// ---------- Persistent app state (stored in <vault>/.dmtools/state.json) ----------
window.Store = (() => {
  const defaults = () => ({
    party: [],
    initiative: { round: 1, turn: 0, active: false, combatants: [] },
    handouts: [],
    lootTables: null,
    tokenSheet: [],
    playerView: { enemyHp: 'status', showEnemyNames: true },
    encounter: { items: [], size: null, level: null },
    maps: [],
    calendar: null,
    recap: { draft: '', sent: null },      // "Last time…" for players (Session view): what's being written, and what phones show
    notices: [],                           // From the DM to players' phones: rests, Inspiration, XP, treasure (Sheets.notify)
  });
  let state = defaults();
  const listeners = new Set();
  const saveNow = () => window.dm.state.save(state);
  const save = U.debounce(saveNow, 400);
  return {
    async load() { state = { ...defaults(), ...(await window.dm.state.load()) }; listeners.forEach(f => f(state)); return state; },
    // Cloud sync: swap in a state that arrived from another device, then redraw and save it.
    replace(s) { state = { ...defaults(), ...s }; listeners.forEach(f => f(state)); return saveNow(); },
    get: () => state,
    save,
    saveNow,
    onLoad: (f) => listeners.add(f),
  };
})();

// Push the player-safe view of the game to phones.
window.publishToPlayers = U.debounce(() => {
  const s = Store.get();
  const pv = s.playerView || {};
  const ini = s.initiative;
  const visible = ini.combatants.filter(c => !c.hidden);
  const cur = ini.combatants[ini.turn];
  const hpStatus = (c) => {
    if (c.hp == null || c.maxHp == null || c.maxHp <= 0) return null;
    if (c.hp <= 0) return 'Down';
    if (c.hp <= c.maxHp / 2) return 'Bloodied';
    if (c.hp < c.maxHp) return 'Hurt';
    return 'Healthy';
  };
  const condNames = (c) => (c.conditions || []).map(x => typeof x === 'string' ? x : (x.rounds ? `${x.name} (${x.rounds})` : x.name));
  const initiative = ini.active ? {
    round: ini.round,
    current: cur && !cur.hidden ? cur.id : null,
    list: visible.map(c => ({
      id: c.id,
      name: c.kind === 'pc' || c.kind === 'lair' || pv.showEnemyNames !== false ? c.name : (c.kind === 'ally' ? 'Ally' : 'Enemy'),
      kind: c.kind,
      player: c.player || null,
      status: c.kind === 'pc' ? (c.hp != null ? `${c.hp}/${c.maxHp}` : null)
        : c.kind === 'lair' || pv.enemyHp === 'none' ? null : hpStatus(c),
      conditions: condNames(c),
      defeated: !!c.defeated,
      deathSaves: c.kind === 'pc' && c.hp === 0 ? (c.deathSaves || { s: 0, f: 0 }) : null,
    })),
  } : null;
  const handouts = s.handouts.filter(h => h.revealed).map(h => ({
    id: h.id, title: h.title, style: h.style, font: h.font, bodyHtml: MD.simple(h.body), imageUrl: h.image ? '/media/' + encodeURIComponent(h.image) : null, seal: h.seal,
    signature: h.signature, to: h.toAll ? 'all' : (h.to || []), revealedAt: h.revealedAt,
  }));
  // Each player's own character card (their phone only gets theirs).
  const partyCards = s.party.filter(p => p.name).map(p => {
    const c = ini.active && ini.combatants.find(x => x.kind === 'pc' && x.name.toLowerCase() === p.name.toLowerCase());
    const tokenFile = p.token || (s.playerTokens || {})[p.name.toLowerCase()];
    return { name: p.name, token: tokenFile ? '/media/' + encodeURIComponent(tokenFile) : null, cls: p.cls || '', level: p.level || '', ac: c && c.ac != null ? c.ac : p.ac, maxHp: c && c.maxHp != null ? c.maxHp : p.hp,
      hp: c && c.hp != null ? c.hp : (p.hp || null), conditions: c ? condNames(c) : [], deathSaves: c && c.hp === 0 ? (c.deathSaves || { s: 0, f: 0 }) : null, inCombat: !!c,
      // The full character sheet (shared/charsheet.js); the player edits it on their phone.
      model: { name: p.name, cls: p.cls || '', level: p.level, ac: p.ac, hp: p.hp, initBonus: p.initBonus, sheet: p.sheet || null } };
  });
  const pub = {
    initiative, handouts, party: s.party.map(p => p.name).filter(Boolean), partyCards,
    map: window.Maps ? Maps.playerView() : null,
    calendar: window.Timeline ? Timeline.playerDate() : null,
    feed: window.Sheets ? Sheets.playerFeed() : [],
    homebrew: window.Sheets ? Sheets.playerHomebrew() : { spells: [], items: [] },
    recap: window.Session ? Session.playerRecap() : null,
    notices: window.Sheets ? Sheets.playerNotices() : [],
    ...(window.Notes ? Notes.playerWiki() : {}),
  };
  window.dm.server.publish(pub);
  // An online table (renderer/js/online.js) gets the same, for phones joining over the internet.
  if (window.Online) Online.publish(pub);
  if (window.Sheets) Sheets.refreshOpen();
}, 150);
