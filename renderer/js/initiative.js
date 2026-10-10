// Initiative tracker + encounter builder. Turn order is pushed live to players' phones.
window.Initiative = (() => {
  const { h, toast, sign, esc } = U;
  let els = {}, tab = 'tracker', pinned = null, undoStack = [];
  const ini = () => Store.get().initiative;

  // 2024 DMG: XP budget per character by level [Low, Moderate, High].
  const BUDGET = { 1: [50, 75, 100], 2: [100, 150, 200], 3: [150, 225, 400], 4: [250, 375, 500], 5: [500, 750, 1100], 6: [600, 1000, 1400],
    7: [750, 1300, 1700], 8: [1000, 1700, 2100], 9: [1300, 2000, 2600], 10: [1600, 2300, 3100], 11: [1900, 2900, 4100], 12: [2200, 3700, 4700],
    13: [2600, 4200, 5400], 14: [2900, 4900, 6200], 15: [3300, 5400, 7800], 16: [3800, 6100, 9800], 17: [4500, 7200, 11700], 18: [5000, 8700, 14200],
    19: [5500, 10700, 17200], 20: [6400, 13200, 22000] };

  // Conditions used to be plain strings; they are now { name, rounds } (rounds = null means until removed).
  const conds = (c) => (c.conditions = (c.conditions || []).map(x => typeof x === 'string' ? { name: x, rounds: null } : x));
  const condLabel = (x) => x.rounds ? `${x.name} (${x.rounds})` : x.name;

  // ---------- Undo + combat log ----------
  function log(text) {
    const s = ini();
    s.log = [{ t: Date.now(), round: s.active ? s.round : null, text }, ...(s.log || [])].slice(0, 150);
  }
  // Every change goes through here so it can be undone.
  function act(text, fn) {
    undoStack.push(JSON.stringify(ini()));
    if (undoStack.length > 60) undoStack.shift();
    fn();
    if (text) log(text);
    changed();
  }
  function undo() {
    const prev = undoStack.pop();
    if (!prev) return toast('Nothing to undo');
    Store.get().initiative = JSON.parse(prev);
    changed(); toast('Undone');
  }
  const changed = () => { if (window.Sheets) Sheets.syncFromCombat(); Store.save(); publishToPlayers(); draw(); if (window.Maps) Maps.rerender(); };

  function sortList() {
    const s = ini(), cur = s.combatants[s.turn];
    // Lair actions lose initiative ties.
    s.combatants.sort((a, b) => (b.init ?? -99) - (a.init ?? -99) || ((a.kind === 'lair') - (b.kind === 'lair')) || (b.bonus || 0) - (a.bonus || 0) || (a.kind === 'pc' ? -1 : 1));
    if (cur) s.turn = Math.max(0, s.combatants.indexOf(cur));
  }
  const rollInit = (c) => { if (c.kind !== 'lair') c.init = 1 + U.rand(20) + (Number(c.bonus) || 0); };

  function add(c, { roll = true, count = 1 } = {}) {
    act(`Added ${count > 1 ? count + '× ' : ''}${c.name}`, () => {
      const s = ini();
      const existing = s.combatants.filter(x => x.baseName === c.name).length;
      for (let i = 0; i < count; i++) {
        const hp = typeof c.hp === 'string' && /d/.test(c.hp) ? Math.max(1, U.r(c.hp)) : (c.hp === '' || c.hp == null ? null : Number(c.hp));
        const n = { id: U.uid(), baseName: c.name, name: count > 1 || existing ? `${c.name} ${existing + i + 1}` : c.name,
          kind: c.kind || 'enemy', bonus: Number(c.bonus) || 0, init: c.init ?? null, hp, maxHp: hp, ac: c.ac ?? null,
          conditions: [], hidden: !!c.hidden, defeated: false, player: c.player || null, sb: c.sb || null };
        if (roll && n.init == null) rollInit(n);
        s.combatants.push(n);
      }
      if (s.active) sortList();
    });
  }

  function addFromStatblock(sb, count = 1) {
    add({ name: sb.name || 'Creature', kind: 'enemy', bonus: Statblock.initMod(sb), hp: Number(sb.hp) || null, ac: parseInt(sb.ac) || null, sb }, { count });
    toast(`${sb.name} added to initiative`);
  }

  function addParty() {
    const party = Store.get().party.filter(p => p.name);
    if (!party.length) { toast('Add your party in Settings first', 'err'); App.show('settings'); return; }
    act('Added the party', () => {
      const have = new Set(ini().combatants.filter(c => c.kind === 'pc').map(c => c.name.toLowerCase()));
      party.filter(p => !have.has(p.name.toLowerCase())).forEach(p => { const n = Sheets.numbers(p); ini().combatants.push({
        id: U.uid(), baseName: p.name, name: p.name, kind: 'pc', bonus: n.initBonus, init: null,
        hp: n.hp, maxHp: n.maxHp, ac: n.ac, conditions: [], hidden: false, defeated: false }); });
    });
  }

  function addLair() {
    if (ini().combatants.some(c => c.kind === 'lair')) return toast('There is already a lair action entry');
    act('Added lair actions', () => { ini().combatants.push({ id: U.uid(), baseName: 'Lair Actions', name: 'Lair Actions', kind: 'lair', bonus: 0, init: 20, hp: null, maxHp: null, ac: null, conditions: [], hidden: false, defeated: false }); sortList(); });
  }

  function start() {
    act('⚔ Combat started', () => {
      const s = ini();
      s.combatants.forEach(c => { if (c.init == null && c.kind !== 'pc') rollInit(c); });
      const missing = s.combatants.filter(c => c.init == null);
      if (missing.length) toast(`Enter initiative for: ${missing.map(c => c.name).join(', ')}`, 'err');
      s.active = true; s.round = 1; sortList(); s.turn = 0;
      skipDefeated(1);
    });
  }
  function end() { act('■ Combat ended', () => { const s = ini(); s.active = false; s.round = 1; s.turn = 0; }); }

  function skipDefeated(dir) {
    const s = ini(), n = s.combatants.length;
    for (let i = 0; i < n && s.combatants[s.turn] && s.combatants[s.turn].defeated; i++) move(dir);
  }
  function move(dir) {
    const s = ini(), n = s.combatants.length;
    s.turn += dir;
    if (s.turn >= n) { s.turn = 0; s.round++; log(`— Round ${s.round} —`); }
    if (s.turn < 0) { if (s.round > 1) { s.turn = n - 1; s.round--; } else s.turn = 0; }
  }
  function step(dir) {
    const s = ini();
    if (!s.combatants.length) return;
    act(null, () => {
      // Timed conditions tick down at the end of the affected creature's turn.
      const ending = s.combatants[s.turn];
      if (dir > 0 && ending) {
        conds(ending).forEach(x => { if (x.rounds) x.rounds--; });
        conds(ending).filter(x => x.rounds === 0).forEach(x => { toast(`${ending.name} is no longer ${x.name}`); log(`${ending.name} is no longer ${x.name}`); });
        ending.conditions = conds(ending).filter(x => x.rounds !== 0);
      }
      move(dir); skipDefeated(dir);
      const now = s.combatants[s.turn];
      if (now && now.kind === 'pc' && now.hp === 0 && !now.dead && !(now.deathSaves && now.deathSaves.s >= 3)) toast(`${now.name} is dying — roll a death saving throw!`, 'err');
    });
  }

  function applyHp(c, input) {
    const v = String(input).trim(); if (!v) return;
    const n = Number(v.replace(/^[+=-]/, ''));
    if (isNaN(n)) return;
    const before = c.hp;
    act('', () => {
      let text;
      if (c.hp == null) { c.hp = c.maxHp = n; text = `${c.name} HP set to ${n}`; }
      else if (v.startsWith('+')) { c.hp = Math.min(c.maxHp ?? Infinity, c.hp + n); text = `${c.name} healed ${n} (${before} → ${c.hp})`; }
      else if (v.startsWith('=')) { c.hp = n; text = `${c.name} HP set to ${n}`; }
      else {
        c.hp = Math.max(0, c.hp - n); text = `${c.name} took ${n} damage (${before} → ${c.hp})`;
        // Concentration check (DC 10 or half the damage, max 30).
        if (conds(c).some(x => x.name === 'Concentrating') && n > 0) {
          c.concDC = Math.min(30, Math.max(10, Math.floor(n / 2)));
          toast(`${c.name}: Constitution save DC ${c.concDC} to keep concentrating`, 'err');
          text += ` — concentration save DC ${c.concDC}`;
        }
        // Damage while at 0 HP is a failed death save.
        if (c.kind === 'pc' && before === 0) { c.deathSaves = c.deathSaves || { s: 0, f: 0 }; c.deathSaves.f = Math.min(3, c.deathSaves.f + 1); text += ' — death save failure'; }
      }
      if (c.hp > 0) { c.deathSaves = null; c.dead = false; }
      if (c.hp <= 0 && c.kind !== 'pc') c.defeated = true;
      if (c.hp > 0 && c.defeated) c.defeated = false;
      if (c.kind === 'pc' && c.hp === 0 && before > 0) { c.deathSaves = { s: 0, f: 0 }; text += ' — unconscious and dying'; }
      log(text);
    });
  }

  function deathSave(c, kind) {
    act('', () => {
      const d = c.deathSaves = c.deathSaves || { s: 0, f: 0 };
      d[kind] = d[kind] >= 3 ? 0 : d[kind] + 1;
      if (d.f >= 3) { c.dead = true; c.defeated = true; log(`☠ ${c.name} has died`); }
      else if (d.s >= 3) log(`${c.name} is stable`);
      else log(`${c.name} death save ${kind === 's' ? 'success' : 'failure'} (${d.s}✓ ${d.f}✗)`);
    });
  }

  // ---------- Encounter builder ----------
  const enc = () => (Store.get().encounter = Store.get().encounter || { items: [], size: null, level: null });
  function partyInfo() {
    const e = enc(), party = Store.get().party.filter(p => p.name);
    const levels = party.map(p => Number(p.level)).filter(Boolean);
    return { size: e.size || party.length || 4, level: e.level || (levels.length ? Math.round(levels.reduce((a, b) => a + b, 0) / levels.length) : 1) };
  }
  function addToEncounter(sb, count = 1) {
    const e = enc();
    const ex = e.items.find(i => i.name === sb.name);
    if (ex) ex.count += count; else e.items.push({ name: sb.name, cr: String(sb.cr ?? '0'), count, sb, note: sb._note || null });
    Store.save(); if (tab === 'builder') drawBuilder();
  }

  // ---------- UI ----------
  function mount(root) {
    els.round = h('div.round');
    els.tabs = h('div.tabs',
      h('button.tab.on', { 'data-t': 'tracker', onclick: () => setTab('tracker') }, '⏳ Tracker'),
      h('button.tab', { 'data-t': 'builder', onclick: () => setTab('builder') }, '⚔ Encounter builder'));
    els.tracker = h('div.init-layout', h('div', els.controls = h('div.init-controls'), els.list = h('div.init-list'), els.log = h('details.card.combat-log')), els.side = h('div.init-side'));
    els.builder = h('div.enc-layout.hidden');
    root.append(h('div.page', h('header.page-head', h('h1', 'Initiative'), els.tabs, els.round), els.tracker, els.builder));
    document.addEventListener('keydown', (e) => {
      if (!U.$('#view-initiative').classList.contains('active') || e.target.matches('input,textarea,select') || tab !== 'tracker') return;
      if (e.key === ' ' || e.key === 'n' || e.key === 'ArrowRight') { e.preventDefault(); if (ini().active) step(1); }
      if (e.key === 'p' || e.key === 'ArrowLeft') { e.preventDefault(); if (ini().active) step(-1); }
      if (e.ctrlKey && e.key.toLowerCase() === 'z') { e.preventDefault(); undo(); }
    });
    Store.onLoad(() => { undoStack = []; draw(); });
    dm.server.onPlayers(refreshPhone);
    draw(); drawSide();
  }

  function setTab(t) {
    tab = t;
    U.$$('.tab', els.tabs).forEach(b => b.classList.toggle('on', b.dataset.t === t));
    els.tracker.classList.toggle('hidden', t !== 'tracker');
    els.builder.classList.toggle('hidden', t !== 'builder');
    if (t === 'builder') drawBuilder(); else { draw(); drawSide(); }
  }

  function draw() {
    if (!els.list) return;
    const s = ini();
    els.round.innerHTML = '';
    els.round.append(s.active ? h('span', 'Round ', h('b', s.round)) : h('span.dim', 'Combat not started'));
    els.controls.innerHTML = '';
    els.controls.append(h('div.row',
      s.active
        ? [h('button.big', { onclick: () => step(-1), title: 'Previous turn (P / ←)' }, '◀ Prev'), h('button.primary.big', { onclick: () => step(1), title: 'Next turn (Space / →)' }, 'Next turn ▶'), h('button.danger', { onclick: end }, '■ End combat')]
        : h('button.primary.big', { onclick: start, disabled: !s.combatants.length }, '⚔ Start combat'),
      h('button', { onclick: undo, title: 'Undo (Ctrl+Z)', disabled: !undoStack.length }, '↶ Undo'),
      h('span.grow'),
      h('button', { onclick: () => act('Rerolled enemy initiative', () => { s.combatants.forEach(c => c.kind !== 'pc' && rollInit(c)); sortList(); }) }, '🎲 Reroll enemies'),
      h('button', { onclick: () => act(null, sortList) }, '⇅ Sort'),
      h('button', { onclick: async () => { if (await U.confirm('Clear', 'Remove all non-player combatants?')) act('Cleared enemies', () => { s.combatants = s.combatants.filter(c => c.kind === 'pc'); s.turn = 0; }); } }, '🧹 Clear enemies')));

    els.list.innerHTML = '';
    if (!s.combatants.length) els.list.append(h('div.empty-state.small', h('p', 'Add your party and some monsters on the right (or build an encounter), then start combat.')));
    s.combatants.forEach((c, i) => els.list.append(row(c, i, s)));
    drawLog();
    drawActive();
  }

  function row(c, i, s) {
    const isCur = s.active && i === s.turn;
    if (c.kind === 'lair') {
      return h('div.combatant.k-lair' + (isCur ? '.current' : ''),
        h('input.init-num', { type: 'number', value: c.init ?? 20, onchange: (e) => act(null, () => { c.init = Number(e.target.value) || 20; sortList(); }) }),
        h('div.c-main', h('div.c-name-row', h('span.c-name.static', '🏰 Lair Actions'), h('span.kind-badge', 'Lair'), h('span.dim.small', 'loses ties'))),
        h('div'), h('div.c-actions',
          h('button.icon', { title: c.hidden ? 'Hidden from players' : 'Visible to players', onclick: () => act(null, () => { c.hidden = !c.hidden; }) }, c.hidden ? '🙈' : '👁'),
          h('button.icon', { title: 'Remove', onclick: () => remove(i) }, '✕')));
    }
    const hpIn = h('input.hp-in', { placeholder: 'dmg / +heal', title: 'Type 7 for damage, +7 to heal, =7 to set. Enter to apply.', onkeydown: (e) => { if (e.key === 'Enter') applyHp(c, e.target.value); } });
    const pct = c.maxHp ? Math.max(0, c.hp / c.maxHp) : null;
    const rounds = h('input.cond-rounds', { type: 'number', min: 1, placeholder: '∞', title: 'Rounds (blank = until removed)' });
    const dying = c.kind === 'pc' && c.hp === 0;
    const ds = c.deathSaves || { s: 0, f: 0 };
    return h('div.combatant.k-' + c.kind + (isCur ? '.current' : '') + (c.defeated ? '.defeated' : '') + (c.hidden ? '.hidden-c' : ''),
      h('input.init-num', { type: 'number', value: c.init ?? '', placeholder: '—', title: 'Initiative', onchange: (e) => act(null, () => { c.init = e.target.value === '' ? null : Number(e.target.value); if (!s.active) sortList(); }) }),
      h('div.c-main',
        h('div.c-name-row',
          h('input.c-name', { value: c.name, onchange: (e) => act(null, () => { c.name = e.target.value; }) }),
          c.sb ? h('button.icon', { title: 'Show stat block', onclick: () => { pinned = c.id; drawActive(); } }, '📜') : null,
          h('span.kind-badge', { title: 'Click to change', onclick: () => act(null, () => { c.kind = { pc: 'enemy', enemy: 'ally', ally: 'pc' }[c.kind]; }) }, { pc: 'PC', enemy: 'Enemy', ally: 'Ally' }[c.kind]),
          c.ac != null ? h('span.ac', { title: 'Armor Class' }, '🛡 ', c.ac) : null,
          h('span.dim.small', `init ${sign(c.bonus || 0)}`)),
        c.concDC ? h('div.conc-alert', { title: 'Click to dismiss', onclick: () => act(null, () => { c.concDC = null; }) }, `⚠ Concentration: Constitution save DC ${c.concDC}`) : null,
        dying ? h('div.death-saves', c.dead ? h('b.dead', '☠ Dead') : ds.s >= 3 ? h('b.stable', '✚ Stable') : 'Death saves:',
          h('span.ds-group', { title: 'Successes (click to add)', onclick: () => deathSave(c, 's') }, [0, 1, 2].map(k => h('i.pip.ok' + (k < ds.s ? '.on' : '')))),
          h('span.ds-group', { title: 'Failures (click to add)', onclick: () => deathSave(c, 'f') }, [0, 1, 2].map(k => h('i.pip.bad' + (k < ds.f ? '.on' : ''))))) : null,
        h('div.c-conds',
          conds(c).map(x => h('span.cond', { title: (MD.conditionText(x.name) || '') + '\n\nClick to remove', onclick: () => act(`${c.name} is no longer ${x.name}`, () => { c.conditions = conds(c).filter(y => y !== x); }) }, condLabel(x), ' ✕')),
          h('select.cond-add', { onchange: (e) => { const name = e.target.value; if (!name || conds(c).some(x => x.name === name)) return; const r = Number(rounds.value) || null; act(`${c.name} is ${name}${r ? ` for ${r} round${r > 1 ? 's' : ''}` : ''}`, () => conds(c).push({ name, rounds: r })); } },
            h('option', { value: '' }, '+ condition'), SRD.CONDITIONS.map(x => h('option', x))), rounds)),
      h('div.c-hp',
        c.hp != null ? h('div.hp-text', h('b', c.hp), ` / ${c.maxHp}`) : h('div.dim', 'no HP'),
        pct != null ? h('div.hp-bar', h('i', { style: `width:${pct * 100}%;background:${pct > 0.5 ? '#4caf50' : pct > 0.25 ? '#e0a030' : '#d9443a'}` })) : null,
        hpIn),
      h('div.c-actions',
        h('button.icon', { title: c.hidden ? 'Hidden from players — click to show' : 'Visible to players — click to hide', onclick: () => act(null, () => { c.hidden = !c.hidden; }) }, c.hidden ? '🙈' : '👁'),
        h('button.icon', { title: c.defeated ? 'Mark as active' : 'Mark as defeated', onclick: () => act(c.defeated ? `${c.name} is back` : `${c.name} defeated`, () => { c.defeated = !c.defeated; }) }, c.defeated ? '♥' : '☠'),
        h('button.icon', { title: 'Remove', onclick: () => remove(i) }, '✕')));
  }
  function remove(i) {
    const s = ini(), c = s.combatants[i];
    act(`Removed ${c.name}`, () => { s.combatants.splice(i, 1); if (s.turn >= s.combatants.length) s.turn = 0; else if (i < s.turn) s.turn--; });
  }

  function drawLog() {
    const entries = ini().log || [];
    els.log.innerHTML = '';
    els.log.append(h('summary', `📜 Combat log (${entries.length})`),
      entries.length ? h('div.log-list', entries.map(e => h('div.log-row', e.round ? h('span.dim', `R${e.round} `) : null, e.text)))
        : h('p.dim', 'Damage, healing, conditions and turns will be recorded here.'),
      entries.length ? h('button.small', { onclick: () => act(null, () => { ini().log = []; }) }, 'Clear log') : null);
  }

  // Stat block of the creature whose turn it is (or one you pinned with 📜), with clickable dice.
  function drawActive() {
    if (!els.active) return;
    const s = ini();
    let c = pinned && s.combatants.find(x => x.id === pinned);
    if (!c && s.active) c = s.combatants[s.turn];
    els.active.innerHTML = '';
    if (!c || !c.sb) { els.active.classList.add('hidden'); return; }
    els.active.classList.remove('hidden');
    const box = h('div', { html: Statblock.render(c.sb) });
    MD.decorateText(box);
    els.active.append(h('div.row', h('h3', pinned ? '📜 ' + c.name : '⏳ Now: ' + c.name), h('span.grow'), pinned ? h('button.icon', { title: 'Follow the current turn', onclick: () => { pinned = null; drawActive(); } }, '✕') : null), box);
  }

  function drawSide() {
    if (!els.side) return;
    els.side.innerHTML = '';
    const name = h('input', { placeholder: 'Goblin' });
    const count = h('input', { type: 'number', min: 1, max: 20, value: 1 });
    const bonus = h('input', { type: 'number', value: 0 });
    const hp = h('input', { placeholder: '7 or 2d6' });
    const ac = h('input', { type: 'number', placeholder: '15' });
    const kind = h('select', h('option', { value: 'enemy' }, 'Enemy'), h('option', { value: 'ally' }, 'Ally / NPC'), h('option', { value: 'pc' }, 'Player character'));
    const hidden = h('input', { type: 'checkbox' });
    const doAdd = () => {
      if (!name.value.trim()) return name.focus();
      add({ name: name.value.trim(), kind: kind.value, bonus: bonus.value, hp: hp.value.trim(), ac: ac.value === '' ? null : Number(ac.value), hidden: hidden.checked }, { count: Number(count.value) || 1, roll: kind.value !== 'pc' });
      name.value = ''; name.focus();
    };
    name.addEventListener('keydown', (e) => e.key === 'Enter' && doAdd());
    const picker = creaturePicker((sb, n) => addFromStatblock(sb, n));

    els.side.append(
      els.active = h('div.card.active-sb.hidden'),
      h('div.card', h('h3', 'Add combatants'),
        h('div.row', h('button.primary', { onclick: addParty, style: 'flex:1' }, '🛡 Add the party'), h('button', { onclick: addLair, title: 'Lair actions happen on initiative 20' }, '🏰 Lair')),
        h('h4', 'From your bestiary or the SRD'), picker,
        h('h4', 'Quick add'),
        h('div.grid2', h('label.field', h('span', 'Name'), name), h('label.field', h('span', 'How many'), count)),
        h('div.grid3', h('label.field', h('span', 'Init bonus'), bonus), h('label.field', h('span', 'HP'), hp), h('label.field', h('span', 'AC'), ac)),
        h('div.row', kind, h('label.chk', hidden, ' Hidden')),
        h('button', { onclick: doAdd, style: 'width:100%' }, '+ Add')),
      els.phone = h('div.card.phone-panel', h('h3', '📱 Players\' phones'), h('p.dim', 'Loading…')));
    drawActive();
    refreshPhone();
  }

  // Search box over your bestiary notes and the SRD monsters.
  function creaturePicker(onPick, { compact = false } = {}) {
    const q = h('input', { placeholder: 'Search creatures… (e.g. goblin, cr 2)' });
    const n = h('input', { type: 'number', min: 1, max: 20, value: 1, style: 'width:60px', title: 'How many' });
    const list = h('div.picker-list');
    const sources = () => [
      ...Notes.withStatblocks().map(b => ({ sb: { ...b.sb, name: b.sb.name || b.note.name, _note: b.note.name }, src: 'Bestiary' })),
      ...Rules.monsters().map(sb => ({ sb, src: 'SRD' })),
    ];
    const draw = () => {
      const text = q.value.trim().toLowerCase();
      const crm = /cr\s*([\d/]+)/.exec(text);
      const words = text.replace(/cr\s*[\d/]+/, '').trim();
      let hits = sources().filter(x => (!words || x.sb.name.toLowerCase().includes(words)) && (!crm || String(x.sb.cr) === crm[1]));
      list.innerHTML = '';
      if (!text && !compact) { list.append(h('p.dim.small', 'Type to search your bestiary and 300+ SRD monsters.')); }
      (text ? hits : hits.filter(x => x.src === 'Bestiary')).slice(0, 40).forEach(x => list.append(h('div.picker-item', { onclick: () => onPick(x.sb, Number(n.value) || 1), title: 'Click to add' },
        h('span', x.sb.name), h('span.dim.small', ` CR ${x.sb.cr ?? '?'}`), h('span.src.' + x.src.toLowerCase(), x.src))));
    };
    q.addEventListener('input', draw);
    setTimeout(draw, 0);
    return h('div.picker', h('div.row', q, n), list);
  }

  function drawBuilder() {
    const e = enc(), P = partyInfo();
    const budget = (BUDGET[U.clamp(P.level, 1, 20)] || BUDGET[1]).map(x => x * P.size);
    const total = e.items.reduce((a, i) => a + SRD.xp(i.cr) * i.count, 0);
    const diff = total === 0 ? '—' : total <= budget[0] ? 'Low' : total <= budget[1] ? 'Moderate' : total <= budget[2] ? 'High' : 'Beyond High';
    const max = Math.max(budget[2] * 1.25, total);
    const pct = (v) => `${Math.min(100, (v / max) * 100)}%`;
    els.builder.innerHTML = '';
    const size = h('input', { type: 'number', min: 1, max: 12, value: P.size, onchange: (ev) => { e.size = Number(ev.target.value) || null; Store.save(); drawBuilder(); } });
    const level = h('input', { type: 'number', min: 1, max: 20, value: P.level, onchange: (ev) => { e.level = U.clamp(Number(ev.target.value) || 1, 1, 20); Store.save(); drawBuilder(); } });
    els.builder.append(
      h('div.card.enc-pick', h('h3', 'Add creatures'), creaturePicker((sb, n) => addToEncounter(sb, n), { compact: true })),
      h('div.enc-main',
        h('div.card',
          h('div.row', h('h3', 'Party'), h('label.field.inline', h('span', 'Characters'), size), h('label.field.inline', h('span', 'Level'), level),
            h('span.dim.small', 'Defaults come from the party in Settings.')),
          h('div.diff-meter',
            h('div.diff-bar', h('i.zone.low', { style: `width:${pct(budget[0])}` }), h('i.zone.mod', { style: `left:${pct(budget[0])};width:calc(${pct(budget[1])} - ${pct(budget[0])})` }),
              h('i.zone.high', { style: `left:${pct(budget[1])};width:calc(${pct(budget[2])} - ${pct(budget[1])})` }), h('b.marker', { style: `left:${pct(total)}` })),
            h('div.diff-labels', h('span', `Low ≤ ${budget[0].toLocaleString()}`), h('span', `Moderate ≤ ${budget[1].toLocaleString()}`), h('span', `High ≤ ${budget[2].toLocaleString()} XP`))),
          h('div.diff-result.d-' + diff.toLowerCase().replace(/\W+/g, '-'), h('b', diff), ` · ${total.toLocaleString()} XP total`)),
        h('div.card',
          h('h3', 'Creatures'),
          e.items.length ? h('table.enc-table', h('thead', h('tr', ['Creature', 'CR', 'XP each', 'Count', 'XP', ''].map(t => h('th', t)))),
            h('tbody', e.items.map((it, i) => h('tr',
              h('td', it.name, h('span.src.' + (it.note ? 'bestiary' : 'srd'), it.note ? 'Bestiary' : 'SRD')), h('td', it.cr), h('td', SRD.xp(it.cr).toLocaleString()),
              h('td', h('div.stepper', h('button.small', { onclick: () => { it.count = Math.max(1, it.count - 1); Store.save(); drawBuilder(); } }, '−'), h('b', it.count), h('button.small', { onclick: () => { it.count++; Store.save(); drawBuilder(); } }, '+'))),
              h('td', (SRD.xp(it.cr) * it.count).toLocaleString()),
              h('td', h('button.icon', { onclick: () => { e.items.splice(i, 1); Store.save(); drawBuilder(); } }, '✕'))))))
            : h('p.dim', 'Search for creatures on the left and click to add them.'),
          h('div.row',
            h('button.primary', { disabled: !e.items.length, onclick: () => { e.items.forEach(it => addFromStatblock(it.sb, it.count)); setTab('tracker'); } }, '⏳ Send to initiative'),
            h('button', { disabled: !e.items.length, onclick: () => saveEncounterNote(e, P, budget, total, diff) }, '💾 Save as encounter note'),
            h('button.danger', { disabled: !e.items.length, onclick: () => { e.items = []; Store.save(); drawBuilder(); } }, 'Clear')))));
  }

  async function saveEncounterNote(e, P, budget, total, diff) {
    const name = await U.prompt('Encounter name', '', 'e.g. Ambush at the Mill');
    if (!name) return;
    const srd = e.items.filter(i => !i.note);
    const body = `---
type: encounter
tags: [encounter]
location:
party_level: ${P.level}
difficulty: ${diff}
xp_budget: ${budget[1]}
---
# ${name}

**Location:** [[ ]]
**Difficulty:** ${diff}  ·  **Party:** ${P.size} × level ${P.level}
**XP:** ${total.toLocaleString()} (Low ${budget[0].toLocaleString()} / Moderate ${budget[1].toLocaleString()} / High ${budget[2].toLocaleString()})

## Read-Aloud
> [!read-aloud]
>

## Creatures
| Creature | Count | CR | XP | Notes |
|---|:--:|:--:|:--:|---|
${e.items.map(i => `| ${i.note ? `[[${i.note}]]` : i.name} | ${i.count} | ${i.cr} | ${(SRD.xp(i.cr) * i.count).toLocaleString()} |  |`).join('\n')}

## Terrain & Features
-

## Tactics
-

## Development
-

## Treasure
-
${srd.length ? '\n## Stat Blocks\n\n' + srd.map(i => Statblock.fence(i.sb)).join('\n\n') + '\n' : ''}`;
    await Notes.create(name, body, null, 'Encounters');
    toast('Saved to Encounters');
  }

  // Read the Creatures table of an encounter note: | [[Goblin]] | 4 | …
  function loadEncounterNote(content) {
    const e = enc();
    e.items = [];
    const all = [...Notes.withStatblocks().map(b => ({ ...b.sb, name: b.sb.name || b.note.name, _note: b.note.name })), ...Rules.monsters()];
    const inline = [...content.matchAll(/```statblock\s*\n([\s\S]*?)```/g)].map(m => { try { return Statblock.parse(m[1]); } catch { return null; } }).filter(Boolean);
    let missing = [];
    for (const m of content.matchAll(/^\|\s*(?:\[\[([^\]|]+)(?:\|[^\]]+)?\]\]|([^|[\]]+?))\s*\|\s*(\d+)\s*\|/gm)) {
      const nm = (m[1] || m[2] || '').trim();
      if (!nm || /^creature$/i.test(nm)) continue;
      const sb = inline.find(x => x.name && x.name.toLowerCase() === nm.toLowerCase()) || all.find(x => x._note && x._note.toLowerCase() === nm.toLowerCase()) || all.find(x => x.name.toLowerCase() === nm.toLowerCase());
      if (sb) addToEncounter(sb, Number(m[3]) || 1); else missing.push(nm);
    }
    Store.save();
    App.show('initiative'); setTab('builder');
    toast(missing.length ? `Couldn't find a stat block for: ${missing.join(', ')}` : 'Encounter loaded', missing.length ? 'err' : '');
  }

  function refreshPhone() {
    const box = els.phone;
    if (!box) return;
    dm.server.info().then(info => {
      const pv = Store.get().playerView;
      App.players = info.players;
      box.innerHTML = '';
      box.append(h('h3', '📱 Players\' phones'),
        info.urls.length ? [
          h('p', 'Players on the same Wi-Fi scan this or open:'),
          info.qr ? h('img.qr', { src: info.qr }) : null,
          h('div.url-list', info.urls.map(u => h('code', { onclick: () => U.copy(u), title: 'Click to copy' }, u)))]
          : h('p', 'No network connection found. Connect this computer to Wi-Fi/LAN to share with phones.'),
        h('h4', `Connected (${info.players.filter(p => p.online).length})`),
        info.players.length ? h('div.player-list', info.players.map(p => h('div', h('span.dot' + (p.online ? '.on' : '')), ' ', p.name))) : h('p.dim', 'Nobody yet.'),
        h('h4', 'What players see'),
        h('label.chk', h('input', { type: 'checkbox', checked: pv.showEnemyNames !== false, onchange: (e) => { pv.showEnemyNames = e.target.checked; Store.save(); publishToPlayers(); } }), ' Show enemy names'),
        h('label.field', h('span', 'Enemy health'), h('select', { onchange: (e) => { pv.enemyHp = e.target.value; Store.save(); publishToPlayers(); } },
          h('option', { value: 'status', selected: pv.enemyHp !== 'none' }, 'Healthy / Bloodied / Down'), h('option', { value: 'none', selected: pv.enemyHp === 'none' }, 'Hidden'))),
        h('button', { onclick: () => dm.server.openDisplay(), style: 'width:100%' }, '🖥 Open player display window (for a TV)'));
    });
  }

  return { mount, addFromStatblock, add, addToEncounter, loadEncounterNote, onShow: () => { if (tab === 'tracker') drawSide(); else drawBuilder(); }, condLabel, conds };
})();
