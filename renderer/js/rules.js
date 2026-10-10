// Rules reference: search SRD monsters, spells, conditions, magic items and rules sections.
window.Rules = (() => {
  const { h, esc, toast } = U;
  const R = window.SRDREF;
  const CATS = { all: 'All', monsters: 'Monsters', spells: 'Spells', conditions: 'Conditions', items: 'Magic items', rules: 'Rules' };
  const ICON = { monsters: '🐉', spells: '✨', conditions: '🌀', items: '💎', rules: '📏' };
  let cat = 'all', source = 'all', els = {}, selected = null;
  const LEVEL = (l) => l === 0 ? 'Cantrip' : `Level ${l}`;

  // Homebrew from this campaign's notes comes first, then the SRD.
  const homebrew = () => {
    const hb = Homebrew.list();
    return [
      ...hb.monsters.map(x => ({ cat: 'monsters', hb: true, name: x.name, sub: `CR ${x.cr ?? '?'} ${x.size || ''} ${x.type || ''} · ${x._source}`, x })),
      ...hb.spells.map(x => ({ cat: 'spells', hb: true, name: x.name, sub: `${LEVEL(x.level)} ${x.school} · ${x.source}`, x })),
      ...hb.items.map(x => ({ cat: 'items', hb: true, name: x.name, sub: `${x.rarity} ${x.type} · ${x.source}`, x })),
    ];
  };
  const all = () => [
    ...R.monsters.map(x => ({ cat: 'monsters', name: x.name, sub: `CR ${x.cr} ${x.size} ${x.type}`, x })),
    ...R.spells.map(x => ({ cat: 'spells', name: x.name, sub: `${LEVEL(x.level)} ${x.school}${x.conc ? ' · C' : ''}${x.ritual ? ' · R' : ''}`, x })),
    ...R.conditions.map(x => ({ cat: 'conditions', name: x.name, sub: 'Condition', x })),
    ...R.items.map(x => ({ cat: 'items', name: x.name, sub: `${x.rarity} ${x.type}`, x })),
    ...R.rules.map(x => ({ cat: 'rules', name: x.name, sub: 'Rules (SRD 5.1)', x })),
  ];
  let index = null;

  function mount(root) {
    els.q = h('input.search', { placeholder: 'Search monsters, spells, conditions, items, rules…', oninput: draw });
    els.cats = h('div.tabs', Object.entries(CATS).map(([k, v]) => h('button.tab' + (k === cat ? '.on' : ''), { 'data-c': k, onclick: () => { cat = k; U.$$('.tab', els.cats).forEach(b => b.classList.toggle('on', b.dataset.c === k)); drawFilters(); draw(); } }, v)));
    els.filters = h('div.row.ref-filters');
    els.list = h('div.ref-list');
    els.sources = h('div.seg-group.ref-sources', [['all', 'Everything'], ['hb', '★ My campaign'], ['srd', 'SRD']].map(([k, l]) =>
      h('button.seg' + (k === source ? '.on' : ''), { 'data-s': k, onclick: () => { source = k; U.$$('.seg', els.sources).forEach(b => b.classList.toggle('on', b.dataset.s === k)); draw(); } }, l)));
    els.detail = h('div.ref-detail');
    root.append(h('div.page.page-flush', h('div.ref-layout',
      h('aside.ref-side', h('div.ref-head',
        h('div.row', h('h2', '📖 Rules'), h('span.grow'), h('button.small.primary', { onclick: Homebrew.newDialog, title: 'Create your own monster, spell or item' }, '+ Homebrew'), h('button.small', { onclick: () => Importer.open(), title: 'Paste from D&D Beyond / PDFs, search Open5e, or import a file' }, '📥 Import')),
        els.q, els.sources, els.cats, els.filters), els.list,
        h('p.ref-attr', R.attribution)),
      els.detail)));
    drawFilters(); draw();
    showEmpty();
  }

  function drawFilters() {
    els.filters.innerHTML = '';
    els.f = {};
    if (cat === 'spells') {
      els.f.level = h('select', { onchange: draw }, h('option', { value: '' }, 'Any level'), [...Array(10).keys()].map(l => h('option', { value: l }, LEVEL(l))));
      const classes = [...new Set(R.spells.flatMap(s => s.classes))].sort();
      els.f.cls = h('select', { onchange: draw }, h('option', { value: '' }, 'Any class'), classes.map(c => h('option', c)));
      els.filters.append(els.f.level, els.f.cls);
    }
    if (cat === 'monsters') {
      els.f.cr = h('select', { onchange: draw }, h('option', { value: '' }, 'Any CR'), SRD.CRS.map(c => h('option', { value: c }, 'CR ' + c)));
      els.f.type = h('select', { onchange: draw }, h('option', { value: '' }, 'Any type'), Object.keys(SRD.TYPES).map(t => h('option', t)));
      els.filters.append(els.f.cr, els.f.type);
    }
    if (cat === 'items') {
      els.f.rarity = h('select', { onchange: draw }, h('option', { value: '' }, 'Any rarity'), ['Common', 'Uncommon', 'Rare', 'Very Rare', 'Legendary', 'Artifact'].map(r => h('option', r)));
      els.filters.append(els.f.rarity);
    }
  }

  function draw() {
    index = index || all();
    const q = els.q.value.trim().toLowerCase();
    let hits = [...(source !== 'srd' ? homebrew() : []), ...(source !== 'hb' ? index : [])].filter(e => cat === 'all' || e.cat === cat);
    if (q) hits = hits.filter(e => e.name.toLowerCase().includes(q)).sort((a, b) => (b.name.toLowerCase().startsWith(q) - a.name.toLowerCase().startsWith(q)) || a.name.localeCompare(b.name));
    const f = els.f || {};
    if (f.level && f.level.value !== '') hits = hits.filter(e => e.x.level === Number(f.level.value));
    if (f.cls && f.cls.value) hits = hits.filter(e => e.x.classes.includes(f.cls.value));
    if (f.cr && f.cr.value) hits = hits.filter(e => String(e.x.cr) === f.cr.value);
    if (f.type && f.type.value) hits = hits.filter(e => String(e.x.type || '').toLowerCase().startsWith(f.type.value.toLowerCase()));
    if (f.rarity && f.rarity.value) hits = hits.filter(e => e.x.rarity.toLowerCase().includes(f.rarity.value.toLowerCase()));
    els.list.innerHTML = '';
    els.list.append(h('div.tree-label', `${hits.length} result${hits.length === 1 ? '' : 's'}`));
    hits.slice(0, 300).forEach(e => els.list.append(h('div.ref-item' + (selected && selected.name === e.name && selected.cat === e.cat && !!selected.hb === !!e.hb ? '.active' : ''), { onclick: () => { selected = e; showDetail(e); draw(); } },
      h('span.ref-icon', ICON[e.cat]), h('div', h('div', e.name, e.hb ? h('span.hb-star', ' ★') : null), h('div.dim.small', e.sub)))));
    if (!hits.length && source === 'hb') els.list.append(h('p.dim', 'No homebrew yet. Use “+ Homebrew” or “📥 Import”.'));
    if (hits.length > 300) els.list.append(h('p.dim.small', 'Showing the first 300 — refine the search.'));
  }

  function showEmpty() {
    els.detail.innerHTML = '';
    els.detail.append(h('div.empty-state', h('div.big', '📖'), h('h2', 'Rules at your fingertips'),
      h('p', `${R.monsters.length} monsters, ${R.spells.length} spells, ${R.items.length} magic items, every condition, and the core rules from the free 5e System Reference Document.`)));
  }

  const mdBlock = (text) => { const d = h('div.md'); d.innerHTML = MD.simple(text); MD.decorateText(d); return d; };

  function showDetail(e) {
    const x = e.x;
    els.detail.innerHTML = '';
    const hbBar = e.hb ? h('div.hb-banner', '★ Homebrew in this campaign', h('span.dim', ` · ${x._source || x.source || 'Homebrew'}`), h('span.grow'),
      h('button.small', { onclick: () => Notes.open(x._path || x.path) }, '📜 Open / edit note')) : null;
    const copyBtn = (label, fn) => e.hb ? null : h('button', { onclick: fn, title: 'Make an editable copy that lives in this campaign' }, label);
    if (e.cat === 'monsters') {
      const sbBox = h('div', { html: Statblock.render(x) });
      MD.decorateText(sbBox);
      els.detail.append(hbBar,
        h('div.row',
          h('button.primary', { onclick: () => Initiative.addFromStatblock(x) }, '⏳ Add to initiative'),
          h('button', { onclick: () => { Initiative.addToEncounter(x); toast(`${x.name} added to the encounter builder`); } }, '⚔ Add to encounter'),
          copyBtn('✏ Copy to homebrew', () => { const sb = { ...x }; Object.keys(sb).filter(k => k.startsWith('_')).forEach(k => delete sb[k]); Homebrew.save('monster', sb, { source: 'SRD (modified)' }); }),
          h('button', { onclick: () => Tokens.quick(x.name) }, '🪙 Make token')),
        sbBox);
    } else if (e.cat === 'spells') {
      els.detail.append(hbBar, h('div.spell-card',
        h('h1', x.name),
        h('div.spell-sub', `${x.level === 0 ? `${x.school} Cantrip` : `Level ${x.level} ${x.school}`}${x.ritual ? ' (Ritual)' : ''}`, h('span.dim', ` · ${x.classes.join(', ')}`)),
        h('div.spell-props',
          [['Casting Time', x.time], ['Range', x.range], ['Components', x.comp], ['Duration', (x.conc ? 'Concentration, ' : '') + x.dur]].map(([k, v]) => h('div', h('b', k + ': '), v))),
        mdBlock(x.desc), x.higher ? mdBlock(`***Using a Higher-Level Spell Slot.*** ${x.higher}`) : null,
        h('div.row', copyBtn('✏ Copy to homebrew', () => Homebrew.spellForm({ ...x, source: 'SRD (modified)' })), h('button', { onclick: () => U.copy(`**${x.name}** (${LEVEL(x.level)} ${x.school})\n*${x.time} · ${x.range} · ${x.comp} · ${x.dur}*\n\n${x.desc}${x.higher ? `\n\n***Using a Higher-Level Spell Slot.*** ${x.higher}` : ''}`) }, '📋 Copy'))));
    } else if (e.cat === 'items') {
      els.detail.append(hbBar, h('div.spell-card', h('h1', x.name), h('div.spell-sub', `${x.type}, ${x.rarity}${x.attune ? ` (${typeof x.attune === 'string' ? x.attune : 'requires attunement'})` : ''}`), mdBlock(x.desc),
        h('div.row', copyBtn('✏ Copy to homebrew', () => Homebrew.itemForm({ ...x, source: 'SRD (modified)' })), h('button', { onclick: () => U.copy(`**${x.name}** (${x.type}, ${x.rarity})\n\n${x.desc}`) }, '📋 Copy'))));
    } else {
      els.detail.append(h('div.spell-card', e.cat === 'conditions' ? h('h1', x.name) : null, mdBlock(x.desc)));
    }
    els.detail.scrollTop = 0;
  }

  // SRD monsters plus every monster in your campaign (bestiary + homebrew), used by the creature pickers.
  const monsters = () => R.monsters;
  const allSpells = () => [...Homebrew.list().spells, ...R.spells];
  const allItems = () => [...Homebrew.list().items, ...R.items];
  return { mount, monsters, allSpells, allItems, onShow: () => els.list && draw() };
})();
