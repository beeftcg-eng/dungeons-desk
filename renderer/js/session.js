// Session: one screen for running the table, made for the phone app but on the desktop rail too.
// The fight (turns, HP, the current creature's stat block), quick dice, the party at a glance, and notes pinned
// with 📌 in the note toolbar (Store.get().session.pins). Initiative calls refresh() after every change.
window.Session = (() => {
  const { h } = U;
  let root = null, els = {};
  const ini = () => Store.get().initiative;
  const pins = () => { const s = Store.get(); s.session = s.session || { pins: [] }; s.session.pins = s.session.pins || []; return s.session.pins; };

  function mount(r) {
    root = r;
    els.page = h('div.page.session');
    root.append(els.page);
    Store.onLoad(draw);
    draw();
  }
  const active = () => root && root.classList.contains('active');
  const refresh = () => { if (active()) draw(); };

  function draw() {
    if (!els.page) return;
    const date = window.Timeline && Timeline.playerDate();
    els.page.innerHTML = '';
    els.page.append(
      h('header.page-head', h('h1', 'Session'), date ? h('span.dim', '📅 ', date) : null),
      h('div.session-grid', fightCard(), diceCard(), partyCard(), pinsCard()));
  }

  // ---------- The fight ----------
  function fightCard() {
    const s = ini(), card = h('div.card.session-fight');
    if (!s.active) {
      card.append(h('h3', '⏳ Combat'), h('p.dim', s.combatants.length ? `${s.combatants.length} in the turn order, waiting to start.` : 'No fight running.'),
        h('div.row', s.combatants.length ? h('button.primary', { onclick: () => Initiative.start() }, '⚔ Start combat') : null,
          h('button', { onclick: () => App.show('initiative') }, '⏳ Open initiative')));
      return card;
    }
    const cur = s.combatants[s.turn];
    card.append(
      h('div.row', h('h3', `⏳ Round ${s.round}`), h('span.grow'),
        h('button', { onclick: () => Initiative.step(-1) }, '◀'), h('button.primary', { onclick: () => Initiative.step(1) }, 'Next turn ▶')),
      h('div.session-turns', s.combatants.map((c, i) => h('button.session-turn.k-' + c.kind + (i === s.turn ? '.current' : '') + (c.defeated ? '.defeated' : ''),
        { title: 'Tap for damage or healing', onclick: () => hpPrompt(c) },
        h('span.st-init', c.init ?? '—'),
        h('span.st-name', c.kind === 'lair' ? '🏰 Lair' : c.name, c.hidden ? ' 🙈' : '', (c.conditions || []).length ? h('small', ' · ' + (c.conditions || []).map(x => typeof x === 'string' ? x : Initiative.condLabel(x)).join(', ')) : null),
        c.ac != null ? h('span.st-ac', '🛡', c.ac) : null,
        c.hp != null ? h('span.st-hp' + (c.hp <= 0 ? '.down' : c.maxHp && c.hp <= c.maxHp / 2 ? '.bloodied' : ''), `${c.hp}/${c.maxHp}`) : null))));
    if (cur && cur.sb) { const sb = h('div', { html: Statblock.render(cur.sb) }); MD.decorateText(sb); card.append(h('h4', 'Now: ', cur.name), sb); }
    return card;
  }
  async function hpPrompt(c) {
    if (c.kind === 'lair') return;
    const v = await U.prompt(`${c.name}: ${c.hp ?? '?'}/${c.maxHp ?? '?'} HP`, '', '7 = damage, +7 = heal, =7 = set');
    if (v) Initiative.applyHp(c, v);
  }

  // ---------- Dice ----------
  function diceCard() {
    const b = (label, expr, mode) => h('button', { onclick: () => Dice.roll(expr, { label: label.replace(/^[^\w]+/, ''), mode }) }, label);
    return h('div.card', h('h3', '🎲 Quick dice'),
      h('div.session-dice', b('d20', '1d20'), b('Adv', '1d20', 'adv'), b('Dis', '1d20', 'dis'), b('d4', '1d4'), b('d6', '1d6'), b('d8', '1d8'), b('d10', '1d10'), b('d12', '1d12'), b('d100', '1d100'), b('2d6', '2d6')),
      h('p.hint', 'More in the 🎲 roller, bottom right.'));
  }

  // ---------- Party ----------
  function partyCard() {
    const party = Store.get().party.filter(p => p.name);
    const card = h('div.card', h('h3', '🛡 Party'));
    if (!party.length) return card.append(h('p.dim', 'Add the party in ⚙ Settings.')), card;
    card.append(h('div.session-party', party.map(p => {
      const n = Sheets.numbers(p);
      let pp = null;
      if (p.sheet) { try { pp = CharSheet.derive(CharSheet.prepare({ ...p, sheet: p.sheet })).passive; } catch { /* sheet still being set up */ } }
      return h('button.session-pc', { title: 'Open the character sheet', onclick: () => Sheets.open(p) },
        h('b', p.name), h('span.dim.small', [p.cls, p.level ? `Lv ${p.level}` : ''].filter(Boolean).join(' ')),
        h('span.chips', n.ac ? h('i', `AC ${n.ac}`) : null, n.maxHp ? h('i', `HP ${n.hp ?? n.maxHp}/${n.maxHp}`) : null, pp != null ? h('i', `PP ${pp}`) : null));
    })));
    return card;
  }

  // ---------- Pinned notes ----------
  function pinsCard() {
    const list = pins().filter(p => Notes.notesCache().has(p));
    const card = h('div.card.session-pins', h('h3', '📌 Pinned notes'));
    if (!list.length) return card.append(h('p.dim', 'Pin notes you need tonight (the session plan, an NPC, a location) with 📌 in the note toolbar.')), card;
    list.forEach(path => {
      const name = path.split('/').pop().replace(/\.md$/i, '');
      const body = h('div.md');
      const d = h('details', { ontoggle: () => { if (d.open && !body.childNodes.length) body.append(MD.render(Notes.notesCache().get(path) || '', { resolve: (t) => !!Notes.resolve(t) })); } },
        h('summary', h('span', name), h('span.grow'), h('button.icon', { title: 'Open the note', onclick: (e) => { e.preventDefault(); Notes.open(path); } }, '↗'),
          h('button.icon', { title: 'Unpin', onclick: (e) => { e.preventDefault(); togglePin(path); } }, '✕')), body);
      card.append(d);
    });
    return card;
  }
  function togglePin(path) {
    const list = pins(), i = list.indexOf(path);
    if (i >= 0) list.splice(i, 1); else list.push(path);
    Store.save();
    refresh();
    return i < 0;
  }
  const isPinned = (path) => pins().includes(path);

  return { mount, onShow: draw, refresh, togglePin, isPinned };
})();
