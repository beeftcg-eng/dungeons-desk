// Checks reading characters from PDFs (shared/pdf-char.js) against small PDFs built here: an official-style fillable
// sheet, a D&D Beyond-style one packed into a compressed object stream, and a sheet printed from Dungeons Desk
// (its share link). Run: npm test
const assert = require('assert');
const zlib = require('zlib');
global.window = global;
require('../shared/charsheet-data.js');
require('../shared/charsheet.js');
require('../shared/pdf-char.js');
const CS = window.CharSheet, P = window.PdfChar;
let passed = 0;
const tests = [];
const test = (name, fn) => tests.push([name, fn]);

// ---------- Building PDFs ----------
const lit = (s) => '(' + String(s).replace(/[\\()]/g, c => '\\' + c).replace(/\n/g, '\\n') + ')';
const utf16 = (s) => '<FEFF' + [...s].map(c => c.charCodeAt(0).toString(16).padStart(4, '0')).join('') + '>';
// objs: { number: 'body' }. With packed, objects 10+ go into one Flate-compressed object stream, like many exporters.
function pdf(objs, { packed = false, trailer = '' } = {}) {
  let out = '%PDF-1.7\n%\xe2\xe3\xcf\xd3\n';
  const plain = Object.entries(objs).filter(([n]) => !packed || Number(n) < 10), inStream = packed ? Object.entries(objs).filter(([n]) => Number(n) >= 10) : [];
  plain.forEach(([n, body]) => { out += `${n} 0 obj\n${body}\nendobj\n`; });
  if (inStream.length) {
    let head = '', data = '';
    inStream.forEach(([n, body]) => { head += `${n} ${data.length} `; data += body + '\n'; });
    const raw = head + '\n' + data, z = zlib.deflateSync(Buffer.from(raw, 'latin1')).toString('latin1');
    out += `9 0 obj\n<< /Type /ObjStm /N ${inStream.length} /First ${head.length + 1} /Filter /FlateDecode /Length ${z.length} >>\nstream\n${z}\nendstream\nendobj\n`;
  }
  out += `trailer\n<< /Root 1 0 R ${trailer}>>\n%%EOF\n`;
  return new Uint8Array(Buffer.from(out, 'latin1'));
}
// A form: each field a widget object listed in /AcroForm /Fields.
function form(fields, opts) {
  const objs = { 1: '<< /Type /Catalog /AcroForm 2 0 R >>' }, refs = [];
  let n = 10;
  Object.entries(fields).forEach(([k, v]) => {
    const val = typeof v === 'object' ? v.raw : lit(v);
    objs[n] = `<< /FT /Tx /T ${lit(k)} /V ${val} /Rect [0 0 10 10] /Subtype /Widget /MK << /BG [1 1 1] >> >>`; refs.push(`${n} 0 R`); n++;
  });
  objs[2] = `<< /Fields [${refs.join(' ')}] >>`;
  return pdf(objs, opts);
}

// ---------- Tests ----------
test('official fillable sheet: class, species, scores, proficiencies, gear and attacks', async () => {
  const c = await P.read(form({
    CharacterName: 'Brakka Stonefist', ClassLevel: 'Fighter 3', 'Race ': 'Dwarf', Background: 'Soldier', Alignment: 'lawful good', XP: '2,700',
    STR: '16', STRmod: '+3', DEX: '12', CON: '15', INT: '8', WIS: '13', CHA: '10', ProfBonus: '+2',
    AC: '18', HPMax: '31', HPCurrent: '20', Initiative: '+1', Speed: '30 ft.',
    'ST Strength': '+5', 'ST Constitution': '+4', 'ST Dexterity': '+1', Athletics: '+5', 'Perception ': '+3', 'Stealth ': '+1', Animal: '+3',
    Equipment: 'Chain Mail\nShield\nLongsword\n10 Torches\nRations (5)\nLucky rabbit foot',
    'Wpn Name': 'Longsword', 'Wpn1 AtkBonus': '+5', 'Wpn1 Damage': '1d8+3 slashing',
    'Wpn Name 2': 'Claw of Doom', 'Wpn2 AtkBonus ': '+7', 'Wpn2 Damage ': '1d10 + 3 slashing',
    GP: '15', PersonalityTraits: { raw: utf16('I face problems head-on — always.') }, 'Features and Traits': 'Second Wind. Regain HP.',
  }), 'brakka.pdf');
  const m = c.model, s = m.sheet, D = CS.derive(m);
  assert.strictEqual(c.name, 'Brakka Stonefist');
  assert.strictEqual(c.from, 'form');
  assert.deepStrictEqual([m.cls, m.level, s.species, s.background, s.alignment, s.xp], ['Fighter', 3, 'Dwarf', 'Soldier', 'Lawful Good', 2700]);
  assert.deepStrictEqual(s.abilities, { str: 16, dex: 12, con: 15, int: 8, wis: 13, cha: 10 });
  assert.deepStrictEqual(s.saves, { str: true, dex: false, con: true, int: false, wis: false, cha: false });
  assert.deepStrictEqual(s.skills, { 'Animal Handling': 1, Athletics: 1, Perception: 1 }, 'bonus − modifier = proficiency; the official sheet\'s "Animal" box');
  const item = (n) => s.items.find(i => i.name === n);
  assert.ok(item('Chain Mail').equipped && item('Shield').equipped && item('Longsword').equipped);
  assert.strictEqual(item('Torch').qty, 10);
  assert.strictEqual(item('Rations').qty, 5);
  assert.ok(item('Lucky rabbit foot'), 'unknown gear is kept as typed');
  assert.strictEqual(s.items.filter(i => i.name === 'Longsword').length, 1, 'a known weapon isn\'t added twice');
  assert.deepStrictEqual(s.attacks.map(a => [a.name, a.hit, a.dmg, a.dmgType]), [['Claw of Doom', 7, '1d10+3', 'Slashing']]);
  assert.strictEqual(s.coins.gp, 15);
  assert.strictEqual(s.bio.personality, 'I face problems head-on — always.');
  assert.ok(s.feats.some(f => f.name === 'From the PDF' && /Second Wind/.test(f.desc)));
  // The sheet's own numbers match the PDF, so they stay automatic.
  assert.ok(s.auto.ac && s.auto.hp && s.auto.init && s.auto.speed);
  assert.deepStrictEqual([D.ac, D.maxHp, D.hp], [18, 31, 20]);
});

test('D&D Beyond-style PDF: compressed object stream, nested names, multiclass, spells, typed AC/HP', async () => {
  const objs = {
    1: '<< /Type /Catalog /AcroForm 2 0 R >>', 2: '<< /Fields [10 0 R 12 0 R 13 0 R 14 0 R 15 0 R 16 0 R 17 0 R 18 0 R 19 0 R 20 0 R 21 0 R] >>',
    // The name is on a parent field and the value on it, with an unnamed widget under it.
    10: `<< /T ${lit('CharacterName')} /V ${lit('Ilsa')} /Kids [11 0 R] >>`, 11: '<< /Parent 10 0 R /Subtype /Widget /Rect [0 0 1 1] >>',
    12: `<< /T ${lit('CLASS  LEVEL')} /V ${lit('Wizard 2 / Cleric 1')} >>`, 13: `<< /T ${lit('RACE')} /V ${lit('Elf')} >>`,
    14: `<< /T ${lit('INT')} /V ${lit('16')} >>`, 15: `<< /T ${lit('WIS')} /V ${lit('14')} >>`,
    16: `<< /T ${lit('spellName0')} /V ${lit('Fire Bolt')} >>`, 17: `<< /T ${lit('spellName1')} /V ${lit('Magic Missile [R]')} >>`,
    18: `<< /T ${lit('AcrobaticsProf')} /V ${lit('P')} >>`, 19: `<< /T ${lit('AC')} /V ${lit('15')} >>`, 20: `<< /T ${lit('MaxHP')} /V ${lit('19')} >>`,
    21: `<< /T ${lit('DEX')} /V ${lit('+3')} >>`,
  };
  const c = await P.read(pdf(objs, { packed: true }), 'x.pdf');
  const m = c.model, s = m.sheet;
  assert.strictEqual(c.name, 'Ilsa');
  assert.deepStrictEqual([m.cls, m.level, s.species], ['Wizard', 3, 'Elf']);
  assert.deepStrictEqual(s.multi.map(x => [x.cls, x.level]), [['Cleric', 1]]);
  assert.deepStrictEqual(s.spells.map(x => [x.name, x.level, x.prepared]), [['Fire Bolt', 0, false], ['Magic Missile', 1, true]]);
  assert.strictEqual(s.skills.Acrobatics, 1);
  assert.strictEqual(s.abilities.dex, 10, '"+3" is a modifier, not a score');
  assert.ok(!s.auto.ac && m.ac === 15 && !s.auto.hp && m.hp === 19, 'numbers the sheet would work out differently are kept as typed');
});

test('a sheet printed from Dungeons Desk comes back exactly, from its link', async () => {
  const model = CS.prepare({ cls: 'Rogue', level: 4, sheet: { species: 'Halfling', background: 'Criminal', abilities: { str: 8, dex: 17, con: 14, int: 12, wis: 13, cha: 10 }, skills: { Stealth: 2 }, items: [{ name: 'Dagger', qty: 2 }] } });
  const link = await CS.toLink({ ...model, name: 'Pip (the) Quick\\' });
  assert.ok(CS.printHtml({ ...model, name: 'Pip' }, { link }).includes(link.replace(/&/g, '&amp;')), 'printHtml prints the link');
  const bytes = pdf({ 1: '<< /Type /Catalog >>', 3: `<< /Type /Annot /Subtype /Link /A << /S /URI /URI ${lit(link)} >> >>` });
  const c = await P.read(bytes, 'pip.pdf');
  assert.strictEqual(c.from, 'dungeons-desk');
  assert.strictEqual(c.name, 'Pip (the) Quick\\');
  assert.deepStrictEqual(CS.clean(c.model), CS.clean(model));
});

test('PDFs that can\'t be read say why', async () => {
  await assert.rejects(P.read(new Uint8Array(Buffer.from('hello')), 'x.pdf'), /isn't a PDF/);
  await assert.rejects(P.read(pdf({ 1: '<< /Type /Catalog >>' }), 'x.pdf'), /picture of a sheet/);
  await assert.rejects(P.read(form({ CharacterName: 'X' }, { trailer: '/Encrypt 5 0 R ' }), 'x.pdf'), /locked/);
  await assert.rejects(P.read(form({ Notes: 'just some text' }), 'x.pdf'), /No character found/);
});

test('CharSheet.readFile takes a character file or a PDF', async () => {
  const model = CS.prepare({ cls: 'Bard', level: 1 });
  const json = new Blob([JSON.stringify(CS.toFile({ ...model, name: 'Lute' }))]);
  assert.strictEqual((await CS.readFile(json)).name, 'Lute');
  const p = new Blob([form({ CharacterName: 'Formy', ClassLevel: 'Bard 1' })]);
  p.name = 'formy.pdf';
  assert.strictEqual((await CS.readFile(p)).model.cls, 'Bard');
});

(async () => {
  for (const [name, fn] of tests) {
    try { await fn(); passed++; } catch (e) { console.error(`✗ ${name}\n  ${e.stack}`); process.exitCode = 1; }
  }
  console.log(process.exitCode ? `${passed}/${tests.length} PDF checks passed.` : `All ${passed} PDF checks passed.`);
})();
