// Loot: DMG-style treasure generator plus your own weighted roll tables.
window.Loot = (() => {
  const { h, r, pick, toast, esc } = U;
  const L = LOOT;
  let lastResult = null, selectedTable = null, els = {};

  const tables = () => {
    const s = Store.get();
    if (!s.lootTables) s.lootTables = JSON.parse(JSON.stringify(L.defaultTables));
    return s.lootTables;
  };

  // ---------- Treasure generation ----------
  const weighted = (obj) => { const tot = Object.values(obj).reduce((a, b) => a + b, 0); let x = Math.random() * tot; for (const [k, w] of Object.entries(obj)) { if ((x -= w) < 0) return k; } return Object.keys(obj)[0]; };
  const tierFor = (cr) => L.tiers.find(t => cr <= t.max);
  const GP = { cp: 0.01, sp: 0.1, ep: 0.5, gp: 1, pp: 10 };

  function addCoins(into, spec) { for (const [k, ex] of Object.entries(spec)) into[k] = (into[k] || 0) + Math.max(0, r(ex)); }

  function generate({ kind, tierIdx, count }) {
    const t = L.tiers[tierIdx];
    const out = { kind, tier: t.label, coins: {}, gems: [], art: [], items: [] };
    if (kind === 'individual') {
      for (let i = 0; i < count; i++) { const d = 1 + U.rand(100); addCoins(out.coins, t.individual.find(([max]) => d <= max)[1]); }
    } else {
      addCoins(out.coins, t.hoard);
      if (Math.random() < 0.5) { const v = pick(t.gems); for (let i = r(t.gemRolls); i > 0; i--) out.gems.push({ name: pick(L.gems[v]), value: v }); }
      else { const v = pick(t.art); for (let i = Math.ceil(r(t.gemRolls) / 2); i > 0; i--) out.art.push({ name: pick(L.art[v]), value: v }); }
      const n = Math.max(0, r(t.itemRolls));
      // Your homebrew items join the SRD pool for their rarity (unless turned off).
      const hb = Store.get().lootHomebrew === false ? [] : Homebrew.list().items;
      for (let i = 0; i < n; i++) {
        const rar = weighted(t.items);
        const pool = [...L.magic[rar], ...hb.filter(x => x.rarity.toLowerCase() === rar).map(x => x.name + ' ★')];
        out.items.push({ name: pick(pool), rarity: rar });
      }
    }
    out.total = Object.entries(out.coins).reduce((a, [k, v]) => a + v * GP[k], 0) + out.gems.reduce((a, g) => a + g.value, 0) + out.art.reduce((a, g) => a + g.value, 0);
    return out;
  }

  const group = (arr, key = (x) => x.name + '|' + x.value) => {
    const m = new Map(); arr.forEach(x => { const k = key(x); m.set(k, { ...x, n: (m.get(k)?.n || 0) + 1 }); }); return [...m.values()];
  };

  function toMarkdown(res) {
    const lines = [`## Treasure — ${res.kind === 'hoard' ? 'Hoard' : 'Individual'} (${res.tier})`, ''];
    const coins = Object.entries(res.coins).filter(([, v]) => v > 0);
    if (coins.length) lines.push('**Coins:** ' + coins.map(([k, v]) => `${v.toLocaleString()} ${k}`).join(', '));
    if (res.gems.length) lines.push('', '**Gems:**', ...group(res.gems).map(g => `- ${g.n}× ${g.name} (${g.value} gp each)`));
    if (res.art.length) lines.push('', '**Art Objects:**', ...group(res.art).map(g => `- ${g.n > 1 ? g.n + '× ' : ''}${U.cap(g.name)} (${g.value} gp)`));
    if (res.items.length) lines.push('', '**Magic Items:**', ...res.items.map(i => `- ${i.name} *(${i.rarity})*`));
    lines.push('', `**Total value (excluding magic items):** ${Math.round(res.total).toLocaleString()} gp`);
    return lines.join('\n');
  }

  // ---------- Custom tables ----------
  function rollTable(t, depth = 0) {
    const entries = t.entries.filter(e => e[1] && e[0] > 0);
    if (!entries.length) return '(empty table)';
    const tot = entries.reduce((a, e) => a + Number(e[0]), 0);
    let x = Math.random() * tot, chosen = entries[0];
    for (const e of entries) { if ((x -= Number(e[0])) < 0) { chosen = e; break; } }
    let text = U.rollInline(chosen[1]);
    if (depth < 5) text = text.replace(/\[\[([^\]]+)\]\]/g, (_, name) => {
      const sub = tables().find(x => x.name.toLowerCase() === name.trim().toLowerCase());
      return sub ? rollTable(sub, depth + 1) : `[[${name}]]`;
    });
    return text;
  }

  function ranges(t) {
    // d100-style ranges from weights, for printing in classic table format
    const entries = t.entries.filter(e => e[1]);
    const tot = entries.reduce((a, e) => a + Number(e[0] || 0), 0) || 1;
    let acc = 0;
    return entries.map(e => { const lo = Math.round(acc / tot * 100) + 1; acc += Number(e[0] || 0); const hi = Math.round(acc / tot * 100); return lo > hi ? '—' : lo === hi ? pad(lo) : `${pad(lo)}–${pad(hi)}`; });
  }
  const pad = (n) => n === 100 ? '00' : String(n).padStart(2, '0');

  // ---------- UI ----------
  function mount(root) {
    const tabs = h('div.tabs'), panes = h('div.tab-panes');
    const addTab = (label, pane) => {
      const b = h('button.tab', { onclick: () => { U.$$('.tab', tabs).forEach(t => t.classList.remove('on')); U.$$('.tab-pane', panes).forEach(p => p.classList.remove('on')); b.classList.add('on'); pane.classList.add('on'); } }, label);
      tabs.append(b); panes.append(pane); return b;
    };
    addTab('💰 Treasure Generator', treasurePane()).click();
    addTab('📋 Custom Loot Tables', tablesPane());
    root.append(h('div.page', h('header.page-head', h('h1', 'Loot'), tabs), panes));
    Store.onLoad(() => { selectedTable = null; drawTables(); });
  }

  // Treasure onto the players' sheets (Sheets.give): each item to whoever you pick, coins to one or shared out.
  function giveDialog(res) {
    const party = Store.get().party.filter(p => p.name);
    if (!party.length) return toast('Add the party in ⚙ Settings first');
    const who = (sel) => h('select', h('option', { value: '' }, 'Nobody'), party.map((p, i) => h('option', { value: i, selected: sel === i }, p.name)));
    const things = [
      ...res.items.map(i => ({ name: i.name.replace(/ ★$/, ''), qty: 1, label: `${i.name} (${i.rarity})` })),
      ...group(res.gems).map(g => ({ name: `${g.name} (${g.value} gp gem)`, qty: g.n, label: `${g.n}× ${g.name} (${g.value} gp each)` })),
      ...group(res.art).map(g => ({ name: `${U.cap(g.name)} (${g.value} gp)`, qty: g.n, label: `${g.n > 1 ? g.n + '× ' : ''}${U.cap(g.name)} (${g.value} gp)` })),
    ].map((t, i) => ({ ...t, sel: who(i % party.length) }));
    const coins = Object.entries(res.coins).filter(([, v]) => v > 0);
    const coinTo = h('select', h('option', { value: 'split' }, 'Shared evenly by the party'), party.map((p, i) => h('option', { value: i }, `All to ${p.name}`)), h('option', { value: '' }, 'Nobody'));
    const m = U.modal('🎁 Give the treasure', [
      things.length ? h('div.loot-give', things.map(t => h('div.row', h('span.grow', t.label), t.sel))) : null,
      coins.length ? h('div.row', h('span.grow', h('b', 'Coins: '), coins.map(([k, v]) => `${v.toLocaleString()} ${k}`).join(', ')), coinTo) : null,
      h('p.hint', 'It goes into their Gear and Money, and their phones show what they got. Coins that don\'t split evenly go to the first characters.'),
      h('div.row.end', h('button', { onclick: () => m.close() }, 'Cancel'), h('button.primary', { onclick: () => {
        const per = party.map(() => ({ items: [], coins: {} }));
        things.forEach(t => { if (t.sel.value !== '') per[Number(t.sel.value)].items.push({ name: t.name, qty: t.qty }); });
        coins.forEach(([k, v]) => {
          if (coinTo.value === 'split') party.forEach((_, i) => { per[i].coins[k] = Math.floor(v / party.length) + (i < v % party.length ? 1 : 0); });
          else if (coinTo.value !== '') per[Number(coinTo.value)].coins[k] = v;
        });
        let n = 0;
        party.forEach((p, i) => { if (per[i].items.length || Object.values(per[i].coins).some(Boolean)) { Sheets.give(p, per[i].items, per[i].coins); n++; } });
        m.close();
        toast(n ? `Treasure given to ${n} character${n === 1 ? '' : 's'}` : 'Nothing given');
      } }, '🎁 Give')),
    ]);
  }

  function treasurePane() {
    const kind = h('select', h('option', { value: 'individual' }, 'Individual treasure (per creature)'), h('option', { value: 'hoard' }, 'Treasure hoard'));
    const tier = h('select', L.tiers.map((t, i) => h('option', { value: i }, t.label)));
    const count = h('input', { type: 'number', min: 1, max: 50, value: 4 });
    const countField = h('label.field', h('span', 'Number of creatures'), count);
    kind.addEventListener('change', () => (countField.style.display = kind.value === 'hoard' ? 'none' : ''));
    const out = h('div.loot-out');
    const gen = () => { lastResult = generate({ kind: kind.value, tierIdx: Number(tier.value), count: Number(count.value) || 1 }); draw(); };
    const draw = () => {
      const res = lastResult;
      out.innerHTML = '';
      const coins = Object.entries(res.coins).filter(([, v]) => v > 0);
      out.append(h('div.card.loot-card',
        h('h3', `${res.kind === 'hoard' ? 'Treasure Hoard' : 'Individual Treasure'} · ${res.tier}`),
        h('div.coins', coins.length ? coins.map(([k, v]) => h('div.coin.c-' + k, h('b', v.toLocaleString()), ' ', k)) : h('span.dim', 'No coins')),
        res.gems.length ? [h('h4', '💎 Gems'), h('ul', group(res.gems).map(g => h('li', `${g.n}× ${g.name}`, h('span.dim', ` (${g.value} gp each)`))))] : null,
        res.art.length ? [h('h4', '🏺 Art Objects'), h('ul', group(res.art).map(g => h('li', `${g.n > 1 ? g.n + '× ' : ''}${U.cap(g.name)}`, h('span.dim', ` (${g.value} gp)`))))] : null,
        res.items.length ? [h('h4', '✨ Magic Items'), h('ul', res.items.map(i => h('li', i.name, ' ', h('span.rarity.r-' + i.rarity.replace(' ', '-'), i.rarity))))] : null,
        h('div.loot-total', `Total value: ${Math.round(res.total).toLocaleString()} gp`, h('span.dim', ' (plus magic items)')),
        h('div.row',
          h('button.primary', { onclick: gen }, '🎲 Reroll'),
          h('button', { onclick: () => giveDialog(res), title: 'Put it on players\' character sheets; their phones show what they got' }, '🎁 Give to…'),
          h('button', { onclick: () => U.copy(toMarkdown(res)) }, '📋 Copy'),
          h('button', { onclick: async () => { await Notes.create('Loot ' + new Date().toLocaleDateString(), `---\ntype: loot\ntags: [loot]\n---\n# Loot\n\n${toMarkdown(res)}\n`, null, 'Loot'); toast('Saved to Notes'); } }, '💾 Save to Notes'))));
    };
    setTimeout(gen, 0);
    return h('div.tab-pane.gen-layout',
      h('div.card.gen-form', h('h3', 'Options'),
        h('label.field', h('span', 'Type'), kind), h('label.field', h('span', 'Challenge rating'), tier), countField,
        h('label.chk', h('input', { type: 'checkbox', checked: Store.get().lootHomebrew !== false, onchange: (e) => { Store.get().lootHomebrew = e.target.checked; Store.save(); } }), ' Include my homebrew items (★)'),
        h('button.primary.big', { onclick: gen }, '🎲 Roll Treasure'),
        h('p.hint', 'Individual treasure is what a group of creatures carries. Hoards are the big piles at the end of a dungeon. Magic items are drawn from the SRD by rarity.')),
      out);
  }

  function tablesPane() {
    els.tlist = h('div.tl-list');
    els.tedit = h('div.tl-edit');
    setTimeout(drawTables, 0);
    return h('div.tab-pane.tl-layout',
      h('div.card.tl-side', h('div.side-head', h('h3', 'Your tables'), h('button.primary.small', { onclick: () => {
        const t = { id: U.uid(), name: 'New Table', entries: [[1, ''], [1, ''], [1, '']] }; tables().push(t); selectedTable = t.id; Store.save(); drawTables();
      } }, '+ New')), els.tlist,
        h('p.hint', 'Entries can contain dice like “2d6 gp” (rolled automatically) or [[Table Name]] to roll on another table.')),
      els.tedit);
  }

  function drawTables() {
    if (!els.tlist) return;
    const ts = tables();
    if (!selectedTable && ts[0]) selectedTable = ts[0].id;
    els.tlist.innerHTML = '';
    ts.forEach(t => els.tlist.append(h('div.tl-item' + (t.id === selectedTable ? '.active' : ''), { onclick: () => { selectedTable = t.id; drawTables(); } }, t.name, h('span.dim', ` ${t.entries.filter(e => e[1]).length}`))));
    const t = ts.find(x => x.id === selectedTable);
    els.tedit.innerHTML = '';
    if (!t) return;
    const results = h('div.tl-results');
    const times = h('input', { type: 'number', min: 1, max: 50, value: 1, style: 'width:64px' });
    const rng = ranges(t);
    const rows = h('tbody', t.entries.map((e, i) => h('tr',
      h('td.dim.mono', rng[t.entries.filter(x => x[1]).indexOf(e)] || ''),
      h('td', h('input.w-num', { type: 'number', min: 0, value: e[0], title: 'Weight (how likely)', onchange: (ev) => { e[0] = Math.max(0, Number(ev.target.value) || 0); Store.save(); drawTables(); } })),
      h('td.grow', h('input', { value: e[1], placeholder: 'Result text…', onchange: (ev) => { e[1] = ev.target.value; Store.save(); drawTables(); } })),
      h('td', h('button.icon', { title: 'Remove', onclick: () => { t.entries.splice(i, 1); Store.save(); drawTables(); } }, '✕')))));
    els.tedit.append(h('div.card',
      h('div.row', h('input.tl-name', { value: t.name, onchange: (e) => { t.name = e.target.value || 'Table'; Store.save(); drawTables(); } }),
        h('span.grow'),
        h('label.field.inline', h('span', 'Roll'), times, h('span', 'times')),
        h('button.primary', { onclick: () => {
          const n = Math.max(1, Math.min(50, Number(times.value) || 1));
          results.innerHTML = '';
          for (let i = 0; i < n; i++) results.append(h('div.tl-result', { html: '🎲 ' + MD.simple(rollTable(t)).replace(/^<p>|<\/p>\s*$/g, '') }));
        } }, '🎲 Roll')),
      results,
      h('table.tl-table', h('thead', h('tr', h('th', 'd100'), h('th', 'Weight'), h('th', 'Result'), h('th', ''))), rows),
      h('div.row',
        h('button', { onclick: () => { t.entries.push([1, '']); Store.save(); drawTables(); } }, '+ Add entry'),
        h('button', { onclick: () => bulkImport(t) }, '📥 Paste list'),
        h('button', { onclick: () => U.copy(`| d100 | ${t.name} |\n|:--:|---|\n` + t.entries.filter(e => e[1]).map((e, i) => `| ${rng[i]} | ${e[1]} |`).join('\n')) }, '📋 Copy as table'),
        h('span.grow'),
        h('button.danger', { onclick: async () => { if (await U.confirm('Delete table', `Delete “${t.name}”?`)) { Store.get().lootTables = tables().filter(x => x.id !== t.id); selectedTable = null; Store.save(); drawTables(); } } }, '🗑 Delete'))));
  }

  function bulkImport(t) {
    const ta = h('textarea', { rows: 12, placeholder: 'One entry per line.\nOptionally start with a weight:  3 | 2d6 gold pieces' });
    const m = U.modal('Paste entries', [ta, h('div.row.end', h('button', { onclick: () => m.close() }, 'Cancel'), h('button.primary', { onclick: () => {
      const add = ta.value.split('\n').map(l => l.trim()).filter(Boolean).map(l => { const mm = /^(\d+)\s*[|:]\s*(.+)$/.exec(l); return mm ? [Number(mm[1]), mm[2]] : [1, l.replace(/^[-*\d.)\s]+/, '')]; });
      t.entries = [...t.entries.filter(e => e[1]), ...add]; Store.save(); drawTables(); m.close();
    } }, 'Add entries'))]);
  }

  return { mount, rollTable, generate, toMarkdown };
})();
