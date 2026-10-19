// Checks private notes at an online table (web/table-net.js): kept on the phone, and in the player's account when
// signed in, with two phones on one account through an in-memory stand-in for the cloud. Run: npm test
const assert = require('assert');
const { fakeCloud } = require('./fake-cloud.js');
global.window = global;
global.document = { hidden: false, addEventListener() {}, removeEventListener() {} };
require('../shared/session-notes.js');
require('../web/table-net.js');
let passed = 0;
const test = async (name, fn) => { try { await fn(); passed++; } catch (e) { console.error(`✗ ${name}\n  ${e.stack}`); process.exitCode = 1; } };

// A phone: its own localStorage, and the page's net for one table and name.
function phone(code = 'abc123', me = 'Thorin') {
  const ls = new Map();
  const storage = { getItem: (k) => ls.has(k) ? ls.get(k) : null, setItem: (k, v) => ls.set(k, String(v)), removeItem: (k) => ls.delete(k) };
  const net = TableNet.make(() => ({ code, me }));
  // Every call runs with this phone's storage.
  const on = (f) => async (...a) => { global.localStorage = storage; return f(...a); };
  return { get: on(() => net.notesGet()), set: on((t) => net.notesSet(t)), where: () => net.notesWhere, ls };
}
const flush = () => new Promise(r => setTimeout(r, 2700));     // notesSet sends to the account 2.5 s later

(async () => {
  const fc = fakeCloud(); global.Cloud = fc.Cloud;
  const ID = 'dd-player-notes', P = 'Notes/abc123/thorin.md';
  fc.Cloud.signOut();
  const a = phone(), b = phone();

  await test('signed out: notes stay on the phone', async () => {
    await a.set('## Session 1\nMet the hag.');
    assert.strictEqual(await a.get(), '## Session 1\nMet the hag.');
    assert.strictEqual(await b.get(), '', 'another phone has none');
    assert.match(a.where(), /on this phone\.$/);
  });

  await test('signing in puts them in the account, and another phone gets them', async () => {
    await fc.Cloud.signIn('thorin@example.test');
    assert.strictEqual(await a.get(), '## Session 1\nMet the hag.');
    assert.deepStrictEqual(Object.keys(fc.contents(ID)), [P]);
    assert.strictEqual(await b.get(), '## Session 1\nMet the hag.');
    assert.match(b.where(), /in your account \(thorin@example\.test\)/);
  });

  await test('edits travel; edits on both phones are merged, nothing lost', async () => {
    await b.set('## Session 1\nMet the hag. She wants the bell.');
    await flush();
    assert.strictEqual(await a.get(), '## Session 1\nMet the hag. She wants the bell.');
    // Phone B changes the notes before it has seen A's change. (One at a time: the test swaps one global
    // localStorage between phones, and a save waiting on a timer would use the wrong one.)
    await a.set('## Session 2\nThe bell is in the tower.\n\n## Session 1\nMet the hag. She wants the bell.');
    await flush();
    await b.set('## Session 1\nMet the hag. She wants the bell back.');
    await flush();
    const merged = await b.get();
    assert.strictEqual(merged, '## Session 2\nThe bell is in the tower.\n\n## Session 1\nMet the hag. She wants the bell back.\n\n## Session 1 (other phone)\nMet the hag. She wants the bell.',
      'the other phone\'s new session on top, then this phone\'s version of session 1 and the other one\'s');
    assert.strictEqual(await a.get(), merged, 'both phones end up the same');
  });

  await test('each table and name has its own notes', async () => {
    const c = phone('abc123', 'Elara');
    assert.strictEqual(await c.get(), '');
    await c.set('## Session 1\nElara\'s own.');
    await flush();
    assert.deepStrictEqual(Object.keys(fc.contents(ID)).sort(), ['Notes/abc123/elara.md', P]);
  });

  console.log(process.exitCode ? `${passed} table notes checks passed, some failed.` : `All ${passed} table notes checks passed.`);
})();
