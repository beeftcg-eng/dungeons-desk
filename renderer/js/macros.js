// Editor macros: type "/" at the start of a line (or press Alt+1…8, or use the ＋ Insert button) to drop
// a D&D format, block, or freshly rolled content into the note you're writing.
window.Macros = (() => {
  // Template inserted into an existing note: no frontmatter, and headings pushed down one level
  // so "# Name" becomes a "## Name" section inside the current note.
  function section(type, name) {
    const { body } = MD.splitFrontmatter(Templates[type].body(name));
    return '\n' + body.replace(/^(#{1,5}) /gm, '#$1 ').trim() + '\n';
  }

  // Ask for a name unless text is selected; a blank note gets the full template (with properties) instead.
  const format = (type) => async (ctx) => {
    if (ctx.isEmpty) return { replaceAll: Templates[type].body(ctx.noteTitle) };
    const name = ctx.selection || await U.prompt(`${Templates[type].label} name`, '', 'Name');
    if (!name) return null;
    return { text: section(type, name), replaceSelection: true };
  };
  const block = (text) => async () => ({ text });

  const askCr = async () => {
    const cr = await U.prompt('Challenge rating (0–30, or 1/8, 1/4, 1/2)', '2');
    if (cr == null) return null;
    return SRD.CRS.includes(cr.trim()) ? cr.trim() : (U.toast('Unknown CR, using 1', 'err'), '1');
  };
  const tierIdx = (cr) => LOOT.tiers.findIndex(t => SRD.crNum(cr) <= t.max);

  const FORMATS = [
    ['npc', 'NPC', '🧑'], ['character', 'Player character', '🛡'], ['monster', 'Monster / enemy', '🐉'], ['encounter', 'Encounter', '⚔'],
    ['location', 'Location', '🏰'], ['history', 'History / lore', '📚'], ['faction', 'Faction', '🏴'], ['session', 'Session log', '🗓'], ['spell', 'Homebrew spell', '✨'], ['item', 'Homebrew item', '💎'],
  ];

  function list() {
    const items = FORMATS.map(([type, label, icon], i) => ({ id: type, group: 'Formats', label, icon, hotkey: i < 8 ? `Alt+${i + 1}` : null, run: format(type) }));
    items.push(
      { id: 'read-aloud', group: 'Blocks', label: 'Read-aloud box', icon: '📖', run: block('\n> [!read-aloud]\n> \n') },
      { id: 'secret', group: 'Blocks', label: 'DM secret', icon: '🔒', run: block('\n> [!secret] DM Only\n> \n') },
      { id: 'quote', group: 'Blocks', label: 'In-world quote', icon: '❝', run: block('\n> [!quote] Source\n> ""\n') },
      { id: 'statblock', group: 'Blocks', label: 'Stat block (builder)', icon: '🐉', run: () => new Promise(res => Statblock.openBuilder({}, sb => res({ text: '\n' + Statblock.fence(sb) + '\n' }))) },
      { id: 'table', group: 'Blocks', label: 'Table', icon: '▦', run: block('\n| Column | Column |\n|---|---|\n|  |  |\n') },
      { id: 'rumors', group: 'Blocks', label: 'Rumor table (d6)', icon: '🗣', run: block('\n| d6 | Rumor | True? |\n|:--:|---|:--:|\n' + [1, 2, 3, 4, 5, 6].map(n => `| ${n} |  |  |`).join('\n') + '\n') },
      { id: 'checklist', group: 'Blocks', label: 'Checklist', icon: '☐', run: block('\n- [ ] \n- [ ] \n') },
      { id: 'date', group: 'Blocks', label: "Today's date", icon: '📅', run: async () => ({ text: new Date().toISOString().slice(0, 10) }) },
      { id: 'world-date', group: 'Blocks', label: 'Today in the world', icon: '🗓', run: async () => ({ text: Timeline.today() }) },
      { id: 'relation', group: 'Blocks', label: 'Relationship line', icon: '🕸', run: block('- [[ ]] — ally') },
      { id: 'image', group: 'Blocks', label: 'Image…', icon: '🖼', run: async () => { U.$('input[type=file][accept="image/*"][multiple]').click(); return null; } },
      { id: 'random-npc', group: 'Roll it now', label: 'Random NPC', icon: '🎲', run: async () => {
        const p = Generators.genNPC();
        return { text: '\n' + Generators.npcSection(p) + '\n' };
      } },
      { id: 'npc-name', group: 'Roll it now', label: 'Random name', icon: '🔤', run: async () => ({ text: Generators.genNPC().name }) },
      { id: 'random-monster', group: 'Roll it now', label: 'Random monster…', icon: '👹', run: async () => {
        const cr = await askCr(); if (!cr) return null;
        const types = Object.keys(SRD.TYPES), roles = Object.keys(SRD.ROLES);
        const sb = Generators.genMonster({ cr, type: U.pick(types), size: U.pick(['Small', 'Medium', 'Medium', 'Large']), role: U.pick(roles) });
        return { text: '\n' + Statblock.fence(sb) + '\n' };
      } },
      { id: 'treasure', group: 'Roll it now', label: 'Individual treasure…', icon: '💰', run: async () => {
        const cr = await askCr(); if (!cr) return null;
        return { text: '\n' + Loot.toMarkdown(Loot.generate({ kind: 'individual', tierIdx: tierIdx(cr), count: 1 })).replace(/^## /, '### ') + '\n' };
      } },
      { id: 'hoard', group: 'Roll it now', label: 'Treasure hoard…', icon: '👑', run: async () => {
        const cr = await askCr(); if (!cr) return null;
        return { text: '\n' + Loot.toMarkdown(Loot.generate({ kind: 'hoard', tierIdx: tierIdx(cr), count: 1 })).replace(/^## /, '### ') + '\n' };
      } },
    );
    // One entry per custom loot table, e.g. "Roll: Trinkets".
    (Store.get().lootTables || LOOT.defaultTables).forEach(t => items.push({
      id: 'roll-' + t.name.toLowerCase().replace(/\W+/g, '-'), group: 'Roll it now', label: `Roll: ${t.name}`, icon: '🎲',
      run: async () => ({ text: Loot.rollTable(t) }),
    }));
    return items;
  }

  const filter = (q) => {
    q = q.toLowerCase();
    return list().filter(m => !q || m.id.includes(q) || m.label.toLowerCase().includes(q));
  };

  return { list, filter, hotkey: (n) => list().find(m => m.hotkey === `Alt+${n}`) };
})();
