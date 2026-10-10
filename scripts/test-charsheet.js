// Checks the character sheet rules (shared/charsheet.js) against hand-worked characters.  Run: npm test
// No DOM needed: derive(), clean(), cleanShare() and resolve() are plain functions.
const assert = require('assert');
global.window = global;
require('../shared/charsheet-data.js');
require('../shared/charsheet.js');
const CS = window.CharSheet;
let passed = 0;
const test = (name, fn) => { try { fn(); passed++; } catch (e) { console.error(`✗ ${name}\n  ${e.message}`); process.exitCode = 1; } };
const pc = (top, sheet) => CS.prepare({ ...top, sheet: { abilities: { str: 10, dex: 10, con: 10, int: 10, wis: 10, cha: 10 }, ...sheet } });
const d = (m, live) => CS.derive(m, live);

const thorin = pc({ cls: 'Fighter', level: 3 }, { species: 'Dwarf', background: 'Soldier', subclass: 'Champion',
  abilities: { str: 16, dex: 12, con: 15, int: 8, wis: 13, cha: 10 }, skills: { Athletics: 1, Perception: 1 },
  items: [{ name: 'Chain Mail', equipped: true }, { name: 'Shield', equipped: true }, { name: 'Longsword', equipped: true }, { name: 'Javelin', qty: 4, equipped: true }] });
test('Fighter 3 dwarf: AC, HP, saves, skills', () => {
  const x = d(thorin);
  assert.strictEqual(x.pb, 2);
  assert.strictEqual(x.ac, 18, 'chain mail 16 + shield 2');
  assert.strictEqual(x.maxHp, 31, '10+2 + 2×(6+2) + 3 dwarven toughness');
  assert.strictEqual(x.init, 1);
  assert.strictEqual(x.speed, 30);
  assert.deepStrictEqual([x.saves.str, x.saves.con, x.saves.dex], [5, 4, 1]);
  assert.strictEqual(x.skills.find(k => k.name === 'Athletics').bonus, 5);
  assert.strictEqual(x.passive, 13);
  assert.ok(x.features.some(f => f.name === 'Improved Critical'), 'Champion feature at level 3');
  assert.ok(x.resources.some(r => r.key === 'second_wind_uses'));
});
test('Fighter attacks: longsword uses Str, versatile, mastery', () => {
  const a = d(thorin).attacks.find(a => a.name === 'Longsword');
  assert.strictEqual(a.hit, 5); assert.strictEqual(a.dmg, '1d8+3'); assert.strictEqual(a.versatile, '1d10+3'); assert.strictEqual(a.mastery, 'Sap');
});

const elara = pc({ cls: 'Wizard', level: 5 }, { species: 'Elf', background: 'Sage', abilities: { str: 8, dex: 14, con: 13, int: 17, wis: 12, cha: 10 },
  spells: [{ name: 'Fireball', prepared: true }, { name: 'Fire Bolt' }], items: [{ name: 'Quarterstaff', equipped: true }] });
test('Wizard 5: spellcasting, slots, HP', () => {
  const x = d(elara);
  assert.strictEqual(x.pb, 3);
  assert.deepStrictEqual({ dc: x.casting.dc, atk: x.casting.atk }, { dc: 14, atk: 6 });
  assert.deepStrictEqual(x.slots.map(s => s.max), [4, 3, 2]);
  assert.strictEqual(x.maxHp, 27, '6+1 + 4×(4+1)');
  assert.strictEqual(x.ac, 12);
  assert.strictEqual(x.attacks.find(a => a.name === 'Quarterstaff').dmg, '1d6-1');
});

test('Rogue: finesse weapon uses Dex, expertise doubles proficiency', () => {
  const x = d(pc({ cls: 'Rogue', level: 1 }, { abilities: { str: 10, dex: 16, con: 12, int: 10, wis: 10, cha: 10 }, skills: { Stealth: 2 },
    items: [{ name: 'Rapier', equipped: true }, { name: 'Leather Armor', equipped: true }] }));
  assert.strictEqual(x.attacks.find(a => a.name === 'Rapier').hit, 5);
  assert.strictEqual(x.skills.find(k => k.name === 'Stealth').bonus, 7);
  assert.strictEqual(x.ac, 14);
  assert.ok(x.extras.some(e => e.label === 'Sneak Attack' && e.value === '1d6'));
});
test('Unarmored Defense: Barbarian and Monk', () => {
  assert.strictEqual(d(pc({ cls: 'Barbarian', level: 1 }, { abilities: { str: 15, dex: 14, con: 16, int: 8, wis: 10, cha: 10 } })).ac, 15);
  const monk = d(pc({ cls: 'Monk', level: 5 }, { abilities: { str: 10, dex: 16, con: 12, int: 10, wis: 15, cha: 10 } }));
  assert.strictEqual(monk.ac, 15);
  assert.strictEqual(monk.speed, 40, '30 + 10 unarmored movement');
  assert.strictEqual(monk.attacks.find(a => a.key === 'unarmed').dmg, '1d8+3');
});
test('Medium armor caps Dex at +2', () => {
  assert.strictEqual(d(pc({ cls: 'Cleric', level: 1 }, { abilities: { str: 10, dex: 18, con: 10, int: 10, wis: 10, cha: 10 }, items: [{ name: 'Breastplate', equipped: true }] })).ac, 16);
});
test('Manual numbers override Auto', () => {
  const m = pc({ cls: 'Fighter', level: 3, ac: 20, hp: 40 }, { auto: { ac: false, hp: false, init: true, speed: true } });
  const x = d(m);
  assert.strictEqual(x.ac, 20); assert.strictEqual(x.maxHp, 40);
});
test('New sheets keep the AC and HP the DM already typed', () => {
  const m = CS.prepare({ cls: 'Fighter', level: 2, ac: 17, hp: 22 });
  assert.strictEqual(m.sheet.auto.ac, false); assert.strictEqual(d(m).ac, 17); assert.strictEqual(d(m).maxHp, 22);
});
test('Combat HP from the tracker wins', () => {
  assert.strictEqual(d(thorin, { inCombat: true, hp: 9, maxHp: 31 }).hp, 9);
});

test('clean() keeps a sheet safe and complete', () => {
  const m = CS.clean({ level: 99, ac: 'x', sheet: { abilities: { str: 999 }, items: [{ name: 'A'.repeat(500), qty: -4 }, 'junk'], skills: { Hacking: 2, Stealth: 7 } } });
  assert.strictEqual(m.level, 20); assert.strictEqual(m.ac, null);
  assert.strictEqual(m.sheet.abilities.str, 30); assert.strictEqual(m.sheet.abilities.dex, 10);
  assert.strictEqual(m.sheet.items.length, 1); assert.strictEqual(m.sheet.items[0].name.length, 80); assert.strictEqual(m.sheet.items[0].qty, 0);
  assert.deepStrictEqual(m.sheet.skills, { Stealth: 2 });
});
test('cleanShare() refuses bad dice', () => {
  assert.strictEqual(CS.cleanShare({ kind: 'roll', expr: '1000d6' }), null);
  assert.strictEqual(CS.cleanShare({ kind: 'roll', expr: 'alert(1)' }), null);
  assert.strictEqual(CS.cleanShare({ kind: 'nope', expr: '1d20' }), null);
  assert.ok(CS.cleanShare({ kind: 'roll', expr: '1d20+5', mode: 'adv' }));
});
test('resolve(): totals, advantage, crit damage doubles dice', () => {
  for (let i = 0; i < 200; i++) {
    const r = CS.resolve({ kind: 'roll', expr: '1d20+5', mode: 'adv' });
    assert.ok(r.total >= 6 && r.total <= 25);
    const a = CS.resolve({ kind: 'attack', expr: '1d20+5', dmg: '1d8+3' });
    if (a.crit) assert.strictEqual(a.dmg.expr, '2d8+3');
    assert.ok(a.dmg.total >= 4);
  }
  assert.strictEqual(CS.resolve({ kind: 'roll', expr: '1d20', manual: 17 }).total, 17);
});

test('Multiclass Fighter 3 / Wizard 2: proficiency, HP, saves, slots, hit dice', () => {
  const x = d(pc({ cls: 'Fighter', level: 5 }, { abilities: { str: 16, dex: 12, con: 14, int: 14, wis: 10, cha: 8 }, multi: [{ cls: 'Wizard', level: 2 }] }));
  assert.strictEqual(x.pb, 3, 'total level 5');
  assert.strictEqual(x.P.lvl, 3);
  assert.strictEqual(x.maxHp, 40, '10+2 + 2×(6+2) + 2×(4+2)');
  assert.ok(x.saveProf.str && x.saveProf.con && !x.saveProf.int, 'saves only from the first class');
  assert.deepStrictEqual(x.slots.map(s => s.max), [3], 'one casting class uses its own table');
  assert.deepStrictEqual(x.hdPool.map(p => `${p.count}d${p.die}`), ['3d10', '2d6']);
  assert.ok(x.features.some(f => f.src === 'Wizard' && f.name === 'Arcane Recovery'));
  assert.ok(x.spellClasses.includes('Wizard'));
});
test('Multiclass Paladin 3 / Sorcerer 3: shared slot table (caster level 5)', () => {
  const x = d(pc({ cls: 'Paladin', level: 6 }, { multi: [{ cls: 'Sorcerer', level: 3 }] }));
  assert.deepStrictEqual(x.slots.map(s => s.max), [4, 3, 2]);
});
test('Multiclass Sorcerer 1 / Warlock 2: Pact Magic stays separate', () => {
  const x = d(pc({ cls: 'Sorcerer', level: 3 }, { multi: [{ cls: 'Warlock', level: 2 }] }));
  assert.deepStrictEqual(x.slots.map(s => s.max), [2]);
  assert.deepStrictEqual(x.pact && [x.pact.level, x.pact.max], [1, 2]);
});
test('Multiclass proficiencies: Wizard into Fighter gets martial weapons, not heavy armor', () => {
  const x = d(pc({ cls: 'Wizard', level: 2 }, { abilities: { str: 14, dex: 10, con: 10, int: 16, wis: 10, cha: 10 }, multi: [{ cls: 'Fighter', level: 1 }], items: [{ name: 'Longsword', equipped: true }] }));
  assert.strictEqual(x.attacks.find(a => a.name === 'Longsword').hit, 4, 'Str +2, proficiency +2');
});
test('HP reports and tags survive cleanShare()', () => {
  assert.deepStrictEqual((({ kind, amount, heal }) => ({ kind, amount, heal }))(CS.cleanShare({ kind: 'hp', amount: 7 })), { kind: 'hp', amount: 7, heal: false });
  assert.strictEqual(CS.cleanShare({ kind: 'hp', amount: 0 }), null);
  assert.strictEqual(CS.cleanShare({ kind: 'roll', expr: '1d20+2', tag: 'init' }).tag, 'init');
  assert.strictEqual(CS.cleanShare({ kind: 'roll', expr: '1d20', tag: 'hack' }).tag, undefined);
});

if (require.main === module) console.log(process.exitCode ? 'Some checks failed.' : `All ${passed} checks passed.`);
module.exports = { test, pc, d, CS, assert };
