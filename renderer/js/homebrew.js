// Homebrew: your own monsters, spells and magic items, stored as notes inside the campaign
// (Homebrew/Monsters, Homebrew/Spells, Homebrew/Items). They show up in the Rules reference,
// the encounter builder, initiative and the loot generator alongside the SRD.
window.Homebrew = (() => {
  const { h, toast } = U;
  const SCHOOLS = ['Abjuration', 'Conjuration', 'Divination', 'Enchantment', 'Evocation', 'Illusion', 'Necromancy', 'Transmutation'];
  const RARITIES = ['Common', 'Uncommon', 'Rare', 'Very Rare', 'Legendary', 'Artifact'];
  const ITEM_TYPES = ['Wondrous Item', 'Weapon', 'Armor', 'Potion', 'Ring', 'Rod', 'Scroll', 'Staff', 'Wand', 'Shield', 'Ammunition'];
  const yaml = (v) => /^[\w .,'()/+-]*$/.test(String(v)) && !/^\s|\s$/.test(String(v)) && String(v) !== '' ? String(v) : JSON.stringify(String(v));
  const truthy = (v) => v === true || /^(yes|true|y|1)$/i.test(String(v || ''));
  const levelText = (l, school) => Number(l) === 0 ? `${school} Cantrip` : `Level ${l} ${school}`;

  // ----- Writing notes -----
  function spellNote(sp) {
    return `---
type: spell
tags: [spell, homebrew]
level: ${Number(sp.level) || 0}
school: ${yaml(sp.school || 'Evocation')}
casting_time: ${yaml(sp.time || 'Action')}
range: ${yaml(sp.range || 'Self')}
components: ${yaml(sp.comp || 'V, S')}
duration: ${yaml(sp.dur || 'Instantaneous')}
concentration: ${!!sp.conc}
ritual: ${!!sp.ritual}
classes: [${(sp.classes || []).map(yaml).join(', ')}]
source: ${yaml(sp.source || 'Homebrew')}
---
# ${sp.name}

*${levelText(sp.level || 0, sp.school || 'Evocation')}${sp.ritual ? ' (Ritual)' : ''}${(sp.classes || []).length ? ` · ${sp.classes.join(', ')}` : ''}*

${(sp.desc || '').trim()}
${sp.higher ? `\n***Using a Higher-Level Spell Slot.*** ${sp.higher.trim()}\n` : ''}`;
  }
  function itemNote(it) {
    const att = it.attune ? (typeof it.attune === 'string' && it.attune !== 'true' ? it.attune : 'requires attunement') : '';
    return `---
type: item
tags: [item, homebrew]
rarity: ${yaml(it.rarity || 'Uncommon')}
item_type: ${yaml(it.type || 'Wondrous Item')}
attunement: ${att ? yaml(att) : 'false'}
source: ${yaml(it.source || 'Homebrew')}
---
# ${it.name}

*${it.type || 'Wondrous Item'}, ${(it.rarity || 'Uncommon').toLowerCase()}${att ? ` (${att})` : ''}*

${(it.desc || '').trim()}
`;
  }
  function monsterNote(sb, source = 'Homebrew', blurb = '') {
    return `---
type: monster
tags: [monster, homebrew]
cr: '${sb.cr ?? '0'}'
source: ${yaml(source)}
environment:
---
# ${sb.name}

${blurb ? blurb.trim() + '\n\n' : '*Describe this creature and where it lurks.*\n\n'}${Statblock.fence(sb)}
## Tactics
-
`;
  }
  const folder = { monster: 'Homebrew/Monsters', spell: 'Homebrew/Spells', item: 'Homebrew/Items' };
  async function save(kind, obj, { open = true, source, blurb } = {}) {
    const content = kind === 'spell' ? spellNote(obj) : kind === 'item' ? itemNote(obj) : monsterNote(obj, source || obj.source || 'Homebrew', blurb);
    if (window.Library) Library.soon(3000);   // into the homebrew library, for every campaign
    if (open) return Notes.create(obj.name, content, null, folder[kind]);
    const path = await Notes.uniquePath(folder[kind], obj.name);
    await dm.notes.write(path, content);
    return path;
  }

  // ----- Reading them back for the Rules reference / loot -----
  function list() {
    const cache = Notes.notesCache();
    const spells = [], items = [];
    for (const n of Notes.list()) {
      const content = cache.get(n.path) || '';
      const { meta, body } = MD.splitFrontmatter(content);
      if (!meta) continue;
      const desc = body.replace(/^#\s.*\n+/, '').replace(/^\*[^*\n]+\*\s*\n+/, '').trim();
      if (meta.type === 'spell') spells.push({ name: n.name, path: n.path, level: Number(meta.level) || 0, school: meta.school || 'Evocation', time: meta.casting_time || '', range: meta.range || '',
        comp: meta.components || '', dur: meta.duration || '', conc: truthy(meta.concentration), ritual: truthy(meta.ritual),
        classes: Array.isArray(meta.classes) ? meta.classes.map(String) : String(meta.classes || '').split(/,\s*/).filter(Boolean), source: meta.source || 'Homebrew', desc, higher: '' });
      if (meta.type === 'item') items.push({ name: n.name, path: n.path, rarity: String(meta.rarity || 'Uncommon'), type: meta.item_type || 'Wondrous Item',
        attune: meta.attunement && meta.attunement !== 'false' ? meta.attunement : false, source: meta.source || 'Homebrew', desc });
    }
    const monsters = Notes.withStatblocks().map(b => {
      const { meta } = MD.splitFrontmatter(cache.get(b.note.path) || '');
      return { ...b.sb, name: b.sb.name || b.note.name, _note: b.note.name, _path: b.note.path, _source: (meta && meta.source) || 'My bestiary' };
    });
    return { monsters, spells, items };
  }

  // ----- "New homebrew" dialogs -----
  function newDialog() {
    const m = U.modal('New homebrew', h('div.template-grid',
      h('button.template-card', { onclick: () => { m.close(); Statblock.openBuilder({ name: 'New Monster' }, (sb) => save('monster', sb)); } }, h('span', '🐉'), 'Monster'),
      h('button.template-card', { onclick: () => { m.close(); spellForm(); } }, h('span', '✨'), 'Spell'),
      h('button.template-card', { onclick: () => { m.close(); itemForm(); } }, h('span', '💎'), 'Magic item')));
  }
  function spellForm(sp = {}, onSave = (x) => save('spell', x)) {
    const f = {
      name: h('input', { value: sp.name || '' }), level: h('select', [...Array(10).keys()].map(l => h('option', { value: l, selected: Number(sp.level || 0) === l }, l === 0 ? 'Cantrip' : `Level ${l}`))),
      school: h('select', SCHOOLS.map(x => h('option', { selected: x === sp.school }, x))), time: h('input', { value: sp.time || 'Action' }), range: h('input', { value: sp.range || '60 feet' }),
      comp: h('input', { value: sp.comp || 'V, S' }), dur: h('input', { value: sp.dur || 'Instantaneous' }), conc: h('input', { type: 'checkbox', checked: !!sp.conc }), ritual: h('input', { type: 'checkbox', checked: !!sp.ritual }),
      classes: h('input', { value: (sp.classes || []).join(', '), placeholder: 'Wizard, Sorcerer' }), desc: h('textarea', { rows: 8, value: sp.desc || '' }), higher: h('textarea', { rows: 2, value: sp.higher || '' }),
    };
    const m = U.modal(sp.name ? `Spell: ${sp.name}` : 'New spell', [
      h('div.grid3', h('label.field.span2', h('span', 'Name'), f.name), h('label.field', h('span', 'Level'), f.level)),
      h('div.grid3', h('label.field', h('span', 'School'), f.school), h('label.field', h('span', 'Casting time'), f.time), h('label.field', h('span', 'Range'), f.range)),
      h('div.grid3', h('label.field', h('span', 'Components'), f.comp), h('label.field', h('span', 'Duration'), f.dur), h('label.field', h('span', 'Classes'), f.classes)),
      h('div.row', h('label.chk', f.conc, ' Concentration'), h('label.chk', f.ritual, ' Ritual')),
      h('label.field', h('span', 'Description (markdown; dice like 8d6 become clickable)'), f.desc),
      h('label.field', h('span', 'Using a higher-level spell slot (optional)'), f.higher),
      h('div.row.end', h('button', { onclick: () => m.close() }, 'Cancel'), h('button.primary', { onclick: () => {
        if (!f.name.value.trim()) return f.name.focus();
        onSave({ name: f.name.value.trim(), level: Number(f.level.value), school: f.school.value, time: f.time.value, range: f.range.value, comp: f.comp.value, dur: f.dur.value,
          conc: f.conc.checked, ritual: f.ritual.checked, classes: f.classes.value.split(',').map(x => x.trim()).filter(Boolean), desc: f.desc.value, higher: f.higher.value, source: sp.source });
        m.close();
      } }, '💾 Save spell')),
    ], { wide: true });
  }
  function itemForm(it = {}, onSave = (x) => save('item', x)) {
    const f = {
      name: h('input', { value: it.name || '' }), type: h('select', ITEM_TYPES.map(x => h('option', { selected: x === it.type }, x))),
      rarity: h('select', RARITIES.map(x => h('option', { selected: x.toLowerCase() === String(it.rarity || 'uncommon').toLowerCase() }, x))),
      attune: h('input', { type: 'checkbox', checked: !!it.attune }), desc: h('textarea', { rows: 9, value: it.desc || '' }),
    };
    const m = U.modal(it.name ? `Item: ${it.name}` : 'New magic item', [
      h('label.field', h('span', 'Name'), f.name),
      h('div.grid3', h('label.field', h('span', 'Type'), f.type), h('label.field', h('span', 'Rarity'), f.rarity), h('label.chk', f.attune, ' Requires attunement')),
      h('label.field', h('span', 'Description (markdown)'), f.desc),
      h('div.row.end', h('button', { onclick: () => m.close() }, 'Cancel'), h('button.primary', { onclick: () => {
        if (!f.name.value.trim()) return f.name.focus();
        onSave({ name: f.name.value.trim(), type: f.type.value, rarity: f.rarity.value, attune: f.attune.checked, desc: f.desc.value, source: it.source });
        m.close();
      } }, '💾 Save item')),
    ], { wide: true });
  }

  return { save, list, newDialog, spellForm, itemForm, spellNote, itemNote, monsterNote, levelText, SCHOOLS, RARITIES };
})();
