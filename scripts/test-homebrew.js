// Checks homebrew feats, backgrounds and subclasses (renderer/js/homebrew.js): each note is written, read back by
// Homebrew.list(), and used by a character sheet (CharSheet.setHomebrew). Run: npm test
const assert = require('assert');
global.window = global;
global.jsyaml = require('js-yaml');
global.U = { h: () => ({}), toast() {} };
global.MD = { splitFrontmatter(src) { const m = /^---\s*\n([\s\S]*?)\n---\s*(\n|$)/.exec(src); return m ? { meta: jsyaml.load(m[1]), body: src.slice(m[0].length) } : { meta: null, body: src }; } };
const notes = new Map();
global.Notes = { list: () => [...notes.keys()].map(p => ({ path: p, name: p.replace(/^.*\/|\.md$/g, '') })), notesCache: () => notes, withStatblocks: () => [] };
require('../shared/charsheet-data.js');
require('../shared/charsheet.js');
require('../renderer/js/homebrew.js');
const H = window.Homebrew, CS = window.CharSheet;
let passed = 0;
const test = (name, fn) => { try { fn(); passed++; } catch (e) { console.error(`✗ ${name}\n  ${e.stack}`); process.exitCode = 1; } };

notes.set('Homebrew/Feats/Marsh Walker.md', H.featNote({ name: 'Marsh Walker', type: 'general', prereq: 'Level 4+', desc: '**Bog Stride.** Mud costs you no extra movement.' }));
notes.set('Homebrew/Backgrounds/Reed Cutter.md', H.backgroundNote({ name: 'Reed Cutter', abilities: ['str', 'dex', 'wis'], feat: 'Marsh Walker', skills: ['Athletics', 'Survival'],
  tools: ["Woodcarver's Tools"], equipment: 'Choose A or B: (A) Sickle, 2 Pouches, Rope, 12 GP; or (B) 50 GP', desc: 'You cut reeds in the marsh.' }));
notes.set('Homebrew/Subclasses/Path of the Bog.md', H.subclassNote({ name: 'Path of the Bog', cls: 'Barbarian', summary: 'Become One with the Mire', desc: 'Barbarians of the marsh.',
  features: [{ level: 3, name: 'Mud Rage', desc: 'You ignore difficult terrain.' }, { level: 6, name: 'Sinking Grip', desc: 'Your hits grapple.' }] }));

test('notes read back in the shape character sheets use', () => {
  const hb = H.list();
  assert.deepStrictEqual(hb.feats.map(f => [f.name, f.type, f.prereq, f.desc]), [['Marsh Walker', 'general', 'Level 4+', '**Bog Stride.** Mud costs you no extra movement.']]);
  const bg = hb.backgrounds[0];
  assert.deepStrictEqual([bg.abilities, bg.feat, bg.skills, bg.tools, bg.desc], [['str', 'dex', 'wis'], 'Marsh Walker', ['Athletics', 'Survival'], ["Woodcarver's Tools"], 'You cut reeds in the marsh.']);
  assert.deepStrictEqual(bg.equipment[0].choices, [
    { label: 'A', items: [{ name: 'Sickle', ref: 'Sickle', count: 1 }, { name: 'Pouches', ref: 'Pouch', count: 2 }, { name: 'Rope', ref: 'Rope', count: 1 }], gp: 12 },
    { label: 'B', items: [], gp: 50 }]);
  const sc = hb.subclasses[0];
  assert.deepStrictEqual([sc.cls, sc.summary, sc.desc, sc.features.map(f => `${f.level} ${f.name}: ${f.desc}`)],
    ['Barbarian', 'Become One with the Mire', 'Barbarians of the marsh.', ['3 Mud Rage: You ignore difficult terrain.', '6 Sinking Grip: Your hits grapple.']]);
});

test('a sheet with homebrew: the background\'s feat, the subclass\'s features, and levelling into it', () => {
  CS.setHomebrew(H.list());
  const m = CS.prepare({ cls: 'Barbarian', level: 3, sheet: { background: 'reed cutter', subclass: 'Path of the Bog', abilities: { str: 15, dex: 14, con: 14, int: 8, wis: 12, cha: 10 } } });
  const names = CS.derive(m).features.map(f => f.name);
  assert.ok(names.includes('Marsh Walker') && names.includes('Mud Rage') && !names.includes('Sinking Grip'), names.join(', '));
  assert.strictEqual(CS.data().feats.find(f => f.name === 'Marsh Walker').desc, '**Bog Stride.** Mud costs you no extra movement.');
  const young = CS.prepare({ cls: 'Barbarian', level: 2, sheet: {} });
  const r = CS.levelUp(young, CS.levelPlan(young, 0), { subclass: 'path of the bog' });
  assert.deepStrictEqual([young.sheet.subclass, r.features.includes('Mud Rage')], ['Path of the Bog', true]);
  assert.ok(CS.data().classes.find(c => c.name === 'Barbarian').subclasses.some(x => x.name === 'Path of the Berserker'), 'the SRD subclass is still there');
  CS.setHomebrew({});
  assert.ok(!CS.data().feats.some(f => f.name === 'Marsh Walker'), 'and goes when the homebrew does');
});

console.log(process.exitCode ? `${passed} homebrew checks passed, some failed.` : `All ${passed} homebrew checks passed.`);
