// Checks the homebrew library's decisions (renderer/js/library.js): what moves between a campaign and the library
// (plan) and between the library and the account (cloudPlan). Run: npm test
const assert = require('assert');
global.window = global;
require('../renderer/js/library.js');
const L = window.Library;
let passed = 0;
const test = (name, fn) => { try { fn(); passed++; } catch (e) { console.error(`✗ ${name}\n  ${e.stack}`); process.exitCode = 1; } };

const note = (name, text, extra = '') => `---\ntype: spell\n${extra}level: 1\n---\n# ${name}\n\n${text}\n`;
const files = (o) => new Map(Object.entries(o).map(([p, v]) => [p, typeof v === 'string' ? { content: v, mtime: 1 } : v]));
const h = (c) => L.hash(L.splitShare(c).body);
const P = 'Homebrew/Spells/Bolt.md';
const kinds = (r) => r.actions.map(a => `${a.do} ${a.path.replace(/^Homebrew\/\w+\//, '')}`);

test('share lines stay with each campaign', () => {
  const c = note('Bolt', 'Zap.', 'share: [Thorin, Elara]\n');
  assert.strictEqual(L.splitShare(c).share, 'share: [Thorin, Elara]');
  assert.strictEqual(L.splitShare(c).body, note('Bolt', 'Zap.'));
  const list = note('Bolt', 'Zap.', 'share:\n  - Thorin\n  - Elara\n');
  assert.strictEqual(L.splitShare(list).body, note('Bolt', 'Zap.'));
  assert.strictEqual(L.withShare(note('Bolt', 'Zap.'), 'share: players'), note('Bolt', 'Zap.').replace('---\n', '---\nshare: players\n'));
  assert.ok(L.optedOut(note('Bolt', 'Zap.', 'library: false\n')) && !L.optedOut(note('Bolt', 'Zap.')));
});

test('new homebrew goes into the library, and library entries come into the campaign', () => {
  const r = L.plan(files({ [P]: note('Bolt', 'Zap.', 'share: players\n') }), files({ 'Homebrew/Items/Ring.md': note('Ring', 'Shiny.') }), {});
  assert.deepStrictEqual(kinds(r), ['lib Bolt.md', 'note Ring.md']);
  assert.strictEqual(r.actions[0].content, note('Bolt', 'Zap.'), 'no share line in the library');
  assert.deepStrictEqual(Object.keys(r.base).sort(), ['Homebrew/Items/Ring.md', P]);
});

test('edits travel both ways, and the campaign keeps its sharing', () => {
  const old = note('Bolt', 'Zap.'), mine = note('Bolt', 'Zap.', 'share: players\n');
  const fromLib = L.plan(files({ [P]: mine }), files({ [P]: note('Bolt', 'Big zap.') }), { [P]: h(old) });
  assert.deepStrictEqual(kinds(fromLib), ['note Bolt.md']);
  assert.strictEqual(fromLib.actions[0].content, note('Bolt', 'Big zap.').replace('---\n', '---\nshare: players\n'));
  const fromHere = L.plan(files({ [P]: note('Bolt', 'Huge zap.', 'share: players\n') }), files({ [P]: old }), { [P]: h(old) });
  assert.deepStrictEqual([kinds(fromHere), fromHere.actions[0].content], [['lib Bolt.md'], note('Bolt', 'Huge zap.')]);
  const shareOnly = L.plan(files({ [P]: mine }), files({ [P]: old }), { [P]: h(old) });
  assert.deepStrictEqual(kinds(shareOnly), [], 'changing who it is shared with changes nothing in the library');
});

test('deletions travel both ways, unless the other side changed since', () => {
  const old = note('Bolt', 'Zap.');
  assert.deepStrictEqual(kinds(L.plan(files({}), files({ [P]: old }), { [P]: h(old) })), ['unlib Bolt.md']);
  assert.deepStrictEqual(kinds(L.plan(files({ [P]: old }), files({}), { [P]: h(old) })), ['unnote Bolt.md']);
  assert.deepStrictEqual(kinds(L.plan(files({}), files({ [P]: note('Bolt', 'Changed.') }), { [P]: h(old) })), ['note Bolt.md']);
  assert.deepStrictEqual(kinds(L.plan(files({ [P]: note('Bolt', 'Changed.') }), files({}), { [P]: h(old) })), ['lib Bolt.md']);
});

test('two different versions meeting for the first time stay apart; both changed: the newer wins', () => {
  const r = L.plan(files({ [P]: note('Bolt', 'Mine.') }), files({ [P]: note('Bolt', 'Theirs.') }), {});
  assert.deepStrictEqual([kinds(r), r.kept, r.base[P]], [[], [P], 'local']);
  assert.deepStrictEqual(kinds(L.plan(files({ [P]: note('Bolt', 'Mine.') }), files({ [P]: note('Bolt', 'Other.') }), { [P]: 'local' })), [], 'and stay apart after');
  const old = h(note('Bolt', 'Zap.'));
  assert.deepStrictEqual(kinds(L.plan(files({ [P]: { content: note('Bolt', 'Mine.'), mtime: 9 } }), files({ [P]: { content: note('Bolt', 'Theirs.'), mtime: 5 } }), { [P]: old })), ['lib Bolt.md']);
  assert.deepStrictEqual(kinds(L.plan(files({ [P]: { content: note('Bolt', 'Mine.'), mtime: 5 } }), files({ [P]: { content: note('Bolt', 'Theirs.'), mtime: 9 } }), { [P]: old })), ['note Bolt.md']);
});

test('an emptied side is filled again, not emptied everywhere', () => {
  const lib = {}, base = {};
  for (let i = 0; i < 10; i++) { const p = `Homebrew/Spells/S${i}.md`, c = note('S' + i, 'x'); lib[p] = c; base[p] = h(c); }
  const r = L.plan(files({}), files(lib), base);
  assert.ok(r.actions.length === 10 && r.actions.every(a => a.do === 'note'), 'a campaign whose homebrew vanished gets it back');
  const r2 = L.plan(files(lib), files({}), base);
  assert.ok(r2.actions.length === 10 && r2.actions.every(a => a.do === 'lib'), 'a wiped library is refilled');
  const one = L.plan(files({}), files({ 'Homebrew/Spells/S1.md': lib['Homebrew/Spells/S1.md'] }), base);
  assert.deepStrictEqual(kinds(one), ['unlib S1.md'], 'one deletion still goes through');
});

test('library ↔ account', () => {
  const a = note('A', '1'), b = note('B', '2');
  const fresh = L.cloudPlan(new Map(), {}, [{ path: 'Homebrew/A.md', rev: 1, content: a }]);
  assert.deepStrictEqual([fresh.write.map(w => w.path), fresh.files['Homebrew/A.md'].rev], [['Homebrew/A.md'], 1]);
  const files0 = { 'Homebrew/A.md': { rev: 1, hash: L.hash(a) }, 'Homebrew/B.md': { rev: 1, hash: L.hash(b) } };
  const del = L.cloudPlan(new Map([['Homebrew/A.md', a], ['Homebrew/B.md', b]]), files0, [{ path: 'Homebrew/A.md', rev: 2, deleted: true }]);
  assert.deepStrictEqual(del.remove, ['Homebrew/A.md'], 'deleted on another device, unchanged here');
  const both = L.cloudPlan(new Map([['Homebrew/B.md', note('B', 'mine')]]), files0, [{ path: 'Homebrew/B.md', rev: 2, content: note('B', 'theirs') }]);
  assert.deepStrictEqual([both.write, both.files['Homebrew/B.md'].rev], [[], 2], 'changed on both: this device goes up next, over rev 2');
  assert.notStrictEqual(both.files['Homebrew/B.md'].hash, L.hash(note('B', 'mine')));
  const same = L.cloudPlan(new Map([['Homebrew/B.md', b]]), files0, [{ path: 'Homebrew/B.md', rev: 1, content: b }]);
  assert.deepStrictEqual(same.write, [], 'our own save coming back');
});

// The library ↔ account sync itself (cloudSync), with two devices and an in-memory stand-in for the cloud functions.
const { fakeCloud } = require('./fake-cloud.js');
function device() {
  const files = new Map(), store = { meta: {} };
  return { files, lib: { list: async () => [...files].map(([path, content]) => ({ path, content, mtime: 1 })), write: async (p, c) => { files.set(p, c); }, delete: async (p) => { files.delete(p); },
    meta: async () => JSON.parse(JSON.stringify(store.meta)), saveMeta: async (m) => { store.meta = JSON.parse(JSON.stringify(m)); } } };
}
const accountChecks = (async () => {
  const fc = fakeCloud(); global.Cloud = fc.Cloud;
  const A = device(), B = device(), on = async (d) => { global.dm = { library: d.lib }; return L.cloudSync(); };
  const S = 'Homebrew/Spells/Bolt.md', I = 'Homebrew/Items/Ring.md';
  A.files.set(S, note('Bolt', 'Zap.')); A.files.set(I, note('Ring', 'Shiny.'));
  await on(A);
  assert.deepStrictEqual(Object.keys(fc.contents(L.CLOUD_ID)).sort(), [I, S], 'the first device fills the account');
  assert.strictEqual(await on(B), true); assert.deepStrictEqual([...B.files.keys()].sort(), [I, S], 'and the second gets it all');
  A.files.set(S, note('Bolt', 'Big zap.')); A.files.delete(I);
  await on(A); await on(B);
  assert.deepStrictEqual([B.files.get(S), B.files.has(I)], [note('Bolt', 'Big zap.'), false], 'an edit and a deletion reach the other device');
  A.files.set(S, note('Bolt', 'From A.')); B.files.set(S, note('Bolt', 'From B.'));
  await on(A); await on(B); await on(A);
  assert.deepStrictEqual([A.files.get(S), B.files.get(S), fc.contents(L.CLOUD_ID)[S]], [note('Bolt', 'From B.'), note('Bolt', 'From B.'), note('Bolt', 'From B.')], 'changed on both: the last to sync wins, and both end up the same');
  assert.strictEqual(await on(A), false, 'nothing more to do');
  fc.camps.get('user-1|' + L.CLOUD_ID).deleted = true;
  await on(B);
  assert.deepStrictEqual(Object.keys(fc.contents(L.CLOUD_ID)), [S], 'a deleted cloud library is made again and refilled');
  await fc.Cloud.signIn('other@example.test');
  await on(A);
  assert.deepStrictEqual([[...A.files.keys()], Object.keys(fc.contents(L.CLOUD_ID))], [[S], [S]], 'another account starts over, without deleting anything here');
  passed++;
})().catch((e) => { console.error(`✗ library ↔ account, two devices\n  ${e.stack}`); process.exitCode = 1; });

accountChecks.then(() => console.log(process.exitCode ? `${passed} library checks passed, some failed.` : `All ${passed} library checks passed.`));
