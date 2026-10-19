// Homebrew: your own monsters, spells, magic items, feats, backgrounds and subclasses, stored as notes inside the campaign
// (Homebrew/Monsters, Spells, Items, Feats, Backgrounds, Subclasses). They show up in the Rules reference, the encounter
// builder, initiative and the loot generator alongside the SRD, and feats, backgrounds and subclasses in character sheets.
window.Homebrew = (() => {
  const { h, toast } = U;
  const SCHOOLS = ['Abjuration', 'Conjuration', 'Divination', 'Enchantment', 'Evocation', 'Illusion', 'Necromancy', 'Transmutation'];
  const RARITIES = ['Common', 'Uncommon', 'Rare', 'Very Rare', 'Legendary', 'Artifact'];
  const ITEM_TYPES = ['Wondrous Item', 'Weapon', 'Armor', 'Potion', 'Ring', 'Rod', 'Scroll', 'Staff', 'Wand', 'Shield', 'Ammunition'];
  const yaml = (v) => /^[\w .,'()/+-]*$/.test(String(v)) && !/^\s|\s$/.test(String(v)) && String(v) !== '' ? String(v) : JSON.stringify(String(v));
  const truthy = (v) => v === true || /^(yes|true|y|1)$/i.test(String(v || ''));
  const FEAT_TYPES = { origin: 'Origin', general: 'General', 'fighting-style': 'Fighting Style', 'epic-boon': 'Epic Boon' };
  const CLASSES = ['Barbarian', 'Bard', 'Cleric', 'Druid', 'Fighter', 'Monk', 'Paladin', 'Ranger', 'Rogue', 'Sorcerer', 'Warlock', 'Wizard'];
  const AB_NAME = { str: 'Strength', dex: 'Dexterity', con: 'Constitution', int: 'Intelligence', wis: 'Wisdom', cha: 'Charisma' };
  const list_ = (v) => Array.isArray(v) ? v.map(String) : String(v || '').split(/,\s*/).filter(Boolean);
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
  function featNote(f) {
    const type = FEAT_TYPES[f.type] ? f.type : 'general';
    return `---
type: feat
tags: [feat, homebrew]
feat_type: ${type}
prerequisite: ${f.prereq ? yaml(f.prereq) : ''}
source: ${yaml(f.source || 'Homebrew')}
---
# ${f.name}

*${FEAT_TYPES[type]} Feat${f.prereq ? ` (Prerequisite: ${f.prereq})` : ''}*

${(f.desc || '').trim()}
`;
  }
  // equipment is the book's text ("Choose A or B: (A) …, 8 GP; or (B) 50 GP"); list() turns it into the sheet's choices.
  function backgroundNote(b) {
    const abil = (b.abilities || []).filter(a => AB_NAME[a]);
    return `---
type: background
tags: [background, homebrew]
abilities: [${abil.join(', ')}]
feat: ${b.feat ? yaml(b.feat) : ''}
skills: [${(b.skills || []).map(yaml).join(', ')}]
tools: [${(b.tools || []).map(yaml).join(', ')}]
equipment: ${b.equipment ? yaml(b.equipment) : ''}
source: ${yaml(b.source || 'Homebrew')}
---
# ${b.name}

${abil.length ? `**Ability Scores:** ${abil.map(a => AB_NAME[a]).join(', ')}  \n` : ''}${b.feat ? `**Feat:** ${b.feat}  \n` : ''}${(b.skills || []).length ? `**Skill Proficiencies:** ${b.skills.join(', ')}  \n` : ''}${(b.tools || []).length ? `**Tool Proficiency:** ${b.tools.join(', ')}  \n` : ''}${b.equipment ? `**Equipment:** ${b.equipment}` : ''}

${(b.desc || '').trim()}
`;
  }
  // Each feature is a "## Level 3: Name" section, which list() reads back.
  function subclassNote(sc) {
    return `---
type: subclass
tags: [subclass, homebrew]
class: ${yaml(sc.cls || 'Fighter')}
summary: ${sc.summary ? yaml(sc.summary) : ''}
source: ${yaml(sc.source || 'Homebrew')}
---
# ${sc.name}

*${sc.cls || 'Fighter'} Subclass${sc.summary ? `: ${sc.summary}` : ''}*

${(sc.desc || '').trim()}

${(sc.features || []).map(f => `## Level ${f.level}: ${f.name}\n\n${String(f.desc || '').trim()}\n`).join('\n')}`;
  }
  // "## Level 3: Name" sections → [{level, name, desc}]. A section without a level counts as level 3.
  function subclassFeatures(text) {
    return ('\n' + String(text || '')).split(/\n##\s+/).slice(1).map(p => {
      const x = p.match(/^(?:Level\s+(\d+)\s*[:.\-–—]\s*)?(.+)\n?([\s\S]*)$/i);
      return x ? { level: Number(x[1]) || 3, name: x[2].trim(), desc: x[3].trim() } : null;
    }).filter(Boolean);
  }
  // "(A) Dagger, 2 Pouches, 8 GP; or (B) 50 GP" → [{desc, choices: [{label, items: [{name, ref, count}], gp}]}], the shape CHARDATA uses.
  function equipChoices(text) {
    const t = String(text || '').trim();
    if (!t) return [];
    const parts = t.replace(/^choose\s+[a-c](\s+or\s+[a-c])?:\s*/i, '').split(/\(([A-C])\)\s*/);
    const opts = parts.length > 2 ? [] : [['A', t]];
    for (let i = 1; i < parts.length; i += 2) opts.push([parts[i], parts[i + 1] || '']);
    const choices = opts.map(([label, txt]) => {
      let gp = 0;
      const items = [];
      txt.replace(/[;,.]?\s*or\s*$/i, '').split(/,\s*|\s+and\s+/).forEach(x => {
        x = x.trim().replace(/[.;]+$/, '').replace(/^(and|or)\s+/i, '');
        if (!x) return;
        const g = x.match(/^(\d+)\s*GP$/i);
        if (g) { gp += Number(g[1]); return; }
        const c = x.match(/^(\d+)\s+(.+)$/), name = c ? c[2] : x;
        // "2 Pouches" is the SRD's "Pouch".
        const ref = name.replace(/\s*\(.*\)$/, ''), one = c && Number(c[1]) > 1 ? ref.replace(/(ch|sh|ss|x)es$/i, '$1').replace(/([^s])s$/i, '$1') : ref;
        items.push({ name, ref: one, count: c ? Number(c[1]) : 1 });
      });
      return { label, items, gp };
    });
    return [{ desc: t, choices }];
  }
  const folder = { monster: 'Homebrew/Monsters', spell: 'Homebrew/Spells', item: 'Homebrew/Items', feat: 'Homebrew/Feats', background: 'Homebrew/Backgrounds', subclass: 'Homebrew/Subclasses' };
  const NOTE = { spell: spellNote, item: itemNote, feat: featNote, background: backgroundNote, subclass: subclassNote };
  async function save(kind, obj, { open = true, source, blurb } = {}) {
    const content = NOTE[kind] ? NOTE[kind]({ ...obj, source: source || obj.source }) : monsterNote(obj, source || obj.source || 'Homebrew', blurb);
    if (window.Library) Library.soon(3000);   // into the homebrew library, for every campaign
    if (open) return Notes.create(obj.name, content, null, folder[kind]);
    const path = await Notes.uniquePath(folder[kind], obj.name);
    await dm.notes.write(path, content);
    return path;
  }

  // ----- Reading them back for the Rules reference / loot -----
  function list() {
    const cache = Notes.notesCache();
    const spells = [], items = [], feats = [], backgrounds = [], subclasses = [];
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
      // Feats, backgrounds and subclasses come out in the shape of CHARDATA's, so character sheets can use them as they are.
      if (meta.type === 'feat') feats.push({ name: n.name, path: n.path, type: FEAT_TYPES[meta.feat_type] ? meta.feat_type : 'general', prereq: meta.prerequisite ? String(meta.prerequisite) : '', source: meta.source || 'Homebrew', desc });
      if (meta.type === 'background') {
        const bodyText = body.replace(/^#\s.*\n+/, '').replace(/^\*\*(Ability Scores|Feat|Skill Proficiencies|Tool Proficienc\w*|Equipment):\*\*.*\n?/gim, '').trim();
        backgrounds.push({ name: n.name, path: n.path, abilities: list_(meta.abilities).map(a => a.toLowerCase().slice(0, 3)).filter(a => AB_NAME[a]), feat: meta.feat ? String(meta.feat) : '',
          skills: list_(meta.skills), tools: list_(meta.tools), equipment: equipChoices(meta.equipment), equipText: meta.equipment ? String(meta.equipment) : '', source: meta.source || 'Homebrew', desc: bodyText });
      }
      if (meta.type === 'subclass') {
        const intro = body.split(/^##\s/m)[0];
        subclasses.push({ name: n.name, path: n.path, cls: String(meta.class || ''), summary: meta.summary ? String(meta.summary) : '', features: subclassFeatures(body),
          source: meta.source || 'Homebrew', desc: intro.replace(/^#\s.*\n+/, '').replace(/^\*[^*\n]+\*\s*\n+/, '').trim() });
      }
    }
    const monsters = Notes.withStatblocks().map(b => {
      const { meta } = MD.splitFrontmatter(cache.get(b.note.path) || '');
      return { ...b.sb, name: b.sb.name || b.note.name, _note: b.note.name, _path: b.note.path, _source: (meta && meta.source) || 'My bestiary' };
    });
    return { monsters, spells, items, feats, backgrounds, subclasses };
  }

  // ----- "New homebrew" dialogs -----
  function newDialog() {
    const m = U.modal('New homebrew', h('div.template-grid',
      h('button.template-card', { onclick: () => { m.close(); Statblock.openBuilder({ name: 'New Monster' }, (sb) => save('monster', sb)); } }, h('span', '🐉'), 'Monster'),
      h('button.template-card', { onclick: () => { m.close(); spellForm(); } }, h('span', '✨'), 'Spell'),
      h('button.template-card', { onclick: () => { m.close(); itemForm(); } }, h('span', '💎'), 'Magic item'),
      h('button.template-card', { onclick: () => { m.close(); featForm(); } }, h('span', '🎖'), 'Feat'),
      h('button.template-card', { onclick: () => { m.close(); backgroundForm(); } }, h('span', '📜'), 'Background'),
      h('button.template-card', { onclick: () => { m.close(); subclassForm(); } }, h('span', '🧬'), 'Subclass')));
  }
  const saveRow = (close, label, go) => h('div.row.end', h('button', { onclick: close }, 'Cancel'), h('button.primary', { onclick: go }, label));
  function featForm(ft = {}, onSave = (x) => save('feat', x)) {
    const f = { name: h('input', { value: ft.name || '' }), type: h('select', Object.entries(FEAT_TYPES).map(([k, v]) => h('option', { value: k, selected: k === (ft.type || 'general') }, v))),
      prereq: h('input', { value: ft.prereq || '', placeholder: 'Level 4+' }), desc: h('textarea', { rows: 9, value: ft.desc || '' }) };
    const m = U.modal(ft.name ? `Feat: ${ft.name}` : 'New feat', [
      h('div.grid3', h('label.field.span2', h('span', 'Name'), f.name), h('label.field', h('span', 'Kind'), f.type)),
      h('label.field', h('span', 'Prerequisite (optional)'), f.prereq),
      h('label.field', h('span', 'What it does (markdown)'), f.desc),
      saveRow(() => m.close(), '💾 Save feat', () => {
        if (!f.name.value.trim()) return f.name.focus();
        onSave({ name: f.name.value.trim(), type: f.type.value, prereq: f.prereq.value.trim(), desc: f.desc.value, source: ft.source });
        m.close();
      }),
    ], { wide: true });
  }
  function backgroundForm(bg = {}, onSave = (x) => save('background', x)) {
    const chk = (a) => h('input', { type: 'checkbox', checked: (bg.abilities || []).includes(a), 'data-a': a });
    const abil = Object.keys(AB_NAME).map(chk);
    const f = { name: h('input', { value: bg.name || '' }), feat: h('input', { value: bg.feat || '', placeholder: 'Alert' }), skills: h('input', { value: (bg.skills || []).join(', '), placeholder: 'Insight, Religion' }),
      tools: h('input', { value: (bg.tools || []).join(', '), placeholder: 'Calligrapher\'s Supplies' }), equipment: h('textarea', { rows: 2, value: bg.equipText || bg.equipment || '', placeholder: '(A) Dagger, Robe, 8 GP; or (B) 50 GP' }), desc: h('textarea', { rows: 5, value: bg.desc || '' }) };
    const split = (v) => v.split(',').map(x => x.trim()).filter(Boolean);
    const m = U.modal(bg.name ? `Background: ${bg.name}` : 'New background', [
      h('label.field', h('span', 'Name'), f.name),
      h('div.field', h('span', 'Ability scores it raises (pick three)'), h('div.row', abil.map(c => h('label.chk', c, ' ' + AB_NAME[c.dataset.a])))),
      h('div.grid3', h('label.field', h('span', 'Feat'), f.feat), h('label.field', h('span', 'Skills'), f.skills), h('label.field', h('span', 'Tools'), f.tools)),
      h('label.field', h('span', 'Equipment'), f.equipment),
      h('label.field', h('span', 'Description (markdown)'), f.desc),
      saveRow(() => m.close(), '💾 Save background', () => {
        if (!f.name.value.trim()) return f.name.focus();
        onSave({ name: f.name.value.trim(), abilities: abil.filter(c => c.checked).map(c => c.dataset.a), feat: f.feat.value.trim(), skills: split(f.skills.value), tools: split(f.tools.value),
          equipment: f.equipment.value.trim(), desc: f.desc.value, source: bg.source });
        m.close();
      }),
    ], { wide: true });
  }
  function subclassForm(sc = {}, onSave = (x) => save('subclass', x)) {
    const feats = (sc.features || []).map(x => `## Level ${x.level}: ${x.name}\n${x.desc}`).join('\n\n');
    const f = { name: h('input', { value: sc.name || '' }), cls: h('select', CLASSES.map(c => h('option', { selected: c === sc.cls }, c))), summary: h('input', { value: sc.summary || '', placeholder: 'One line: what this subclass is about' }),
      desc: h('textarea', { rows: 3, value: sc.desc || '' }), features: h('textarea', { rows: 12, value: feats, placeholder: '## Level 3: Feature name\nWhat it does.\n\n## Level 6: Another feature\nWhat it does.' }) };
    const m = U.modal(sc.name ? `Subclass: ${sc.name}` : 'New subclass', [
      h('div.grid3', h('label.field.span2', h('span', 'Name'), f.name), h('label.field', h('span', 'Class'), f.cls)),
      h('label.field', h('span', 'Summary'), f.summary), h('label.field', h('span', 'Description (optional)'), f.desc),
      h('label.field', h('span', 'Features: one “## Level N: Name” line each, then what it does'), f.features),
      saveRow(() => m.close(), '💾 Save subclass', () => {
        if (!f.name.value.trim()) return f.name.focus();
        onSave({ name: f.name.value.trim(), cls: f.cls.value, summary: f.summary.value.trim(), desc: f.desc.value, features: subclassFeatures(f.features.value), source: sc.source });
        m.close();
      }),
    ], { wide: true });
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

  return { save, list, newDialog, spellForm, itemForm, featForm, backgroundForm, subclassForm, spellNote, itemNote, monsterNote, featNote, backgroundNote, subclassNote, equipChoices, subclassFeatures, levelText, SCHOOLS, RARITIES, FEAT_TYPES, CLASSES };
})();
