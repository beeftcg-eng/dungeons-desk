// Checks reading book PDFs (renderer/js/book-import.js): lines rebuilt from word positions, OCR clean-up, and finding
// monsters, spells and items, read by Importer's parsers. The text is made up here, with the kinds of mistakes
// scanned books have. Run: npm test
const assert = require('assert');
global.window = global;
global.U = { h: () => ({}), toast() {}, esc: (s) => s, cap: (s) => s ? s[0].toUpperCase() + s.slice(1) : s };
require('../renderer/js/data/srd.js');
require('../renderer/js/importer.js');
require('../renderer/js/book-import.js');
const B = window.BookImport, I = window.Importer;
let passed = 0;
const test = (name, fn) => { try { fn(); passed++; } catch (e) { console.error(`✗ ${name}\n  ${e.stack}`); process.exitCode = 1; } };

// A page from lines of text: [x, y, text], each line one item (or words split by "|" at their own x).
const item = (s, x, y, h = 10) => ({ str: s, transform: [h, 0, 0, h, x, y], width: s.length * h * 0.5 });
function page(lines, width = 600) {
  const items = [];
  lines.forEach(([x, y, t]) => { let cx = x; t.split('|').forEach(w => { items.push(item(w, cx, y)); cx += w.length * 5 + 6; }); });
  return items.sort(() => Math.random() - 0.5);                                       // stream order means nothing
}
const lines = (...pages) => pages.flatMap((p, i) => B.pageLines(page(p), 600, i + 1));

test('lines: by column, top to bottom, words in order', () => {
  const ls = B.pageLines(page([[50, 700, 'Left|top'], [320, 710, 'Right|top'], [50, 680, 'Left|second'], [320, 690, 'Right|second']]), 600, 1);
  assert.deepStrictEqual(ls.map(l => l.t), ['Left top', 'Left second', 'Right top', 'Right second']);
});

test('OCR numbers, letter spacing and stat block words', () => {
  assert.strictEqual(B.fixNumbers('HP ls0 (20d10 + a0)'), 'HP 150 (20d10 + 40)');
  assert.strictEqual(B.fixNumbers('AC t3 lnitiative +a (la)'), 'AC 13 Initiative +4 (14)');
  assert.strictEqual(B.fixNumbers("Hit:9 ('ldl0 + 4) and D C I 3, roll a dlOO"), 'Hit: 9 (1d10 + 4) and DC 13, roll a d100');
  assert.strictEqual(B.fixNumbers('CRll (XP 7,200; PB +4)'), 'CR 11 (XP 7,200; PB +4)');
  assert.strictEqual(B.unspace('Gr ip pi ng Cl aw. Co nstituti o n S avi ng T h row: DC 12'), 'Gripping Claw. Constitution Saving Throw: DC 12');
  assert.strictEqual(B.unspace('The target takes half damage and is pushed up to 10 feet away.'), 'The target takes half damage and is pushed up to 10 feet away.');
  assert.strictEqual(B.fixWords('it has the Crappled condition. Foilure: Multiattock, spill forth unharmed'), 'it has the Grappled condition. Failure: Multiattack, spill forth unharmed');
  assert.deepStrictEqual(['AcrroNs', 'TnRrrs', 'BoNus AcrroNs', 'LecErrDARY AcrroNs', 'Nimble'].map(B.heading), ['Actions', 'Traits', 'Bonus Actions', 'Legendary Actions', null]);
});

test('a 2024 stat block from a rough scan', () => {
  const all = lines([
    [50, 760, 'Murkfin lurkers hide in the reeds of the murkfin marsh.'],
    [50, 748, 'A murkfin waits for prey to wade close.'],
    [50, 720, 'Munxfin Lurker'],
    [50, 706, 'Medium Monstrosity, Unaligned'],
    [50, 694, 'AC t4 lnitiative +a (la)'],
    [50, 682, 'HP 3s (6d8 + 6)'],
    [50, 670, 'Speed 20 ft., Swim 40 ft.'],
    [50, 655, 'Srn|14|+2|+2|Drx|15|+2|+2'], [200, 655, 'CoH|l3|+l|+l'],
    [50, 641, 'lnr|3|-4|-4|Wrs|ll|+0|+0'], [200, 641, "Cxa'5|-3|-3"],
    [50, 627, 'Senses Darkvision 60 ft.; Passive Perception 10'],
    [50, 615, 'Languages None'],
    [50, 603, 'CR 2 (XP 450; PB +2)'],
    [50, 588, 'TnRrrs'],
    [50, 576, 'Amphibious.The lurker can breathe air and water.'],
    [50, 561, 'AcrroNs'],
    [50, 549, 'Multiattock. The lurker makes two Bite attacks.'],
    [50, 537, 'Bite. Melee Attack Roll: +4, reach 5 ft. Uit: 6 (ld8 +'],
    [50, 525, '2) Piercing damage, and the target has the Crap-'],
    [50, 513, 'pled condition (escape DC l2).'],
  ]);
  const [e] = B.findEntries(all, { monster: ['Goblin'] });
  assert.strictEqual(e.kind, 'monster');
  assert.strictEqual(e.name, 'Murkfin Lurker', 'name fixed from the words on the page');
  const sb = I.parseMonster(e.text);
  assert.deepStrictEqual([sb.size, sb.type, sb.ac, sb.initiative, sb.hp, sb.hit_dice, sb.cr], ['Medium', 'Monstrosity', 14, '+4', 35, '6d8 + 6', '2']);
  assert.deepStrictEqual(['str', 'dex', 'con', 'int', 'wis', 'cha'].map(a => sb[a]), [14, 15, 13, 3, 11, 5], 'every ability, by row and first letter');
  assert.deepStrictEqual(sb.traits.map(t => t.name), ['Amphibious']);
  assert.deepStrictEqual(sb.actions.map(a => a.name), ['Multiattack', 'Bite']);
  assert.match(sb.actions[1].desc, /Grappled condition \(escape DC 12\)\.$/, 'wrapped lines joined, hyphen and OCR fixed');
  assert.deepStrictEqual(B.checkMonster(sb, e.text), []);
});

test('items: two-line names in capitals, wrapped type lines, and where each one ends', () => {
  const all = lines([
    [50, 760, 'CLOAK OF THE'],
    [50, 748, 'MURKY MARSH'],
    [50, 736, 'Wondrousitem, veryrare (requires attunement)'],
    [50, 724, 'While you wear this cloak, you can breathe'],
    [50, 712, 'underwater.'],
    [50, 700, 'Swamp Step. You ignore difficult terrain made'],
    [50, 688, 'of mud.'],
    [50, 670, 'LANTERN, +1, +2, OR +3'],
    [50, 658, 'Wondrous item, uncommon (+1), rare (+2), or'],
    [50, 646, 'very rare (+3)'],
    [50, 634, 'This lantern sheds bright light.'],
  ]);
  const es = B.findEntries(all, { item: [] });
  assert.deepStrictEqual(es.map(e => e.name), ['Cloak of the Murky Marsh', 'Lantern, +1, +2, or +3']);
  const a = I.parseItem(es[0].text), b = I.parseItem(es[1].text);
  assert.deepStrictEqual([a.type, a.rarity, a.attune], ['Wondrous Item', 'Very Rare', true]);
  assert.strictEqual(a.desc, 'While you wear this cloak, you can breathe underwater.\n\nSwamp Step. You ignore difficult terrain made of mud.');
  assert.deepStrictEqual([b.rarity, b.desc], ['Uncommon', 'This lantern sheds bright light.']);
});

test('spells', () => {
  const all = lines([
    [50, 760, 'Bog Grasp'],
    [50, 748, 'Level 2 Conjuration (Druid, Ranger)'],
    [50, 736, 'Casting Time: Action'],
    [50, 724, 'Range: 60 feet'],
    [50, 712, 'Components: V, S'],
    [50, 700, 'Duration: Concentration, up to 1 minute'],
    [50, 688, 'Mud rises in a 10-foot square. Each creature there'],
    [50, 676, 'makes a Strength saving throw.'],
  ]);
  const [e] = B.findEntries(all, {});
  const sp = I.parseSpell(e.text);
  assert.deepStrictEqual([e.kind, sp.name, sp.level, sp.school, sp.classes, sp.conc], ['spell', 'Bog Grasp', 2, 'Conjuration', ['Druid', 'Ranger'], true]);
  assert.strictEqual(sp.desc, 'Mud rises in a 10-foot square. Each creature there makes a Strength saving throw.');
});

test('names are matched to the SRD when they are close', () => {
  assert.deepStrictEqual(B.fixName('Blacx Pudding', ['Black Pudding', 'Bandit'], new Map()), { name: 'Black Pudding', ok: true });
  assert.strictEqual(B.fixName('Zzqx', ['Black Pudding'], new Map()).ok, false);
});

console.log(process.exitCode ? `${passed} book import checks passed, some failed.` : `All ${passed} book import checks passed.`);
