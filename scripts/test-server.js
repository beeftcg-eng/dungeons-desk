// Checks PlayerServer (server.js): join codes, what each phone may see, player action validation and file access.  Run: npm test
// Starts a real server on a free port with throwaway folders. No Electron needed.
const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const http = require('http');
const { PlayerServer } = require('../server.js');

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'dmtools-server-test-'));
const dirs = Object.fromEntries(['static', 'shared', 'media', 'vault'].map(d => [d, path.join(tmp, d)]));
Object.values(dirs).forEach(d => fs.mkdirSync(d));
fs.writeFileSync(path.join(dirs.static, 'index.html'), '<h1>phone</h1>');
fs.writeFileSync(path.join(dirs.vault, 'map.png'), 'PNG');
fs.writeFileSync(path.join(dirs.vault, 'secret.png'), 'SECRET');
fs.writeFileSync(path.join(tmp, 'outside.txt'), 'OUTSIDE');

const CODE = '123456';
let port;
let passed = 0;
const tests = [];
const test = (name, fn) => tests.push([name, fn]);

// One request. code: true adds the join code. Resolves { status, body }.
function req(method, p, { code = true, body, player } = {}) {
  const q = new URLSearchParams();
  if (code) q.set('code', CODE);
  if (player) q.set('player', player);
  const full = p + (q.toString() ? (p.includes('?') ? '&' : '?') + q : '');
  return new Promise((resolve, reject) => {
    const r = http.request({ host: '127.0.0.1', port, method, path: full, agent: false }, (res) => {
      let data = '';
      res.on('data', (c) => { data += c; });
      res.on('end', () => resolve({ status: res.statusCode, body: data }));
    });
    r.on('error', (e) => (e.code === 'ECONNRESET' ? resolve({ status: 'reset', body: '' }) : reject(e)));
    if (body !== undefined) r.write(typeof body === 'string' ? body : JSON.stringify(body));
    r.end();
  });
}

// Opens /events and resolves with the first state message, then closes the stream.
function firstEvent(query) {
  return new Promise((resolve, reject) => {
    const r = http.get({ host: '127.0.0.1', port, agent: false, path: `/events?code=${CODE}&${query}` }, (res) => {
      let data = '';
      res.on('data', (c) => {
        data += c;
        const m = /^data: (.*)\n\n/m.exec(data);
        if (m) { r.destroy(); resolve(JSON.parse(m[1])); }
      });
    });
    r.on('error', (e) => (e.code === 'ECONNRESET' ? null : reject(e)));
  });
}

const server = new PlayerServer({ staticDir: dirs.static, sharedDir: dirs.shared, mediaDir: dirs.media, vaultDir: () => dirs.vault });
const actions = [];
server.onAction = (a) => actions.push(a);
server.code = CODE;

test('join code: needed for /api and /events, not for the page', async () => {
  assert.strictEqual((await req('GET', '/api/join')).status, 204);
  assert.strictEqual((await req('GET', '/api/join', { code: false })).status, 401);
  assert.strictEqual((await req('GET', '/events', { code: false })).status, 401);
  assert.strictEqual((await req('GET', '/', { code: false })).status, 200);
});

test('join code: eight wrong guesses lock that address out for a minute, even with the right code', async () => {
  const fresh = new PlayerServer({ staticDir: dirs.static, sharedDir: dirs.shared, mediaDir: dirs.media, vaultDir: () => dirs.vault });
  fresh.code = CODE;
  const fake = () => ({ socket: { remoteAddress: '10.0.0.9' } });
  const url = (code) => new URL(`http://x/api/join?code=${code}`);
  for (let i = 0; i < 8; i++) assert.strictEqual(fresh.authorized(fake(), url('000000')), false);
  assert.strictEqual(fresh.authorized(fake(), url(CODE)), false, 'locked out');
  assert.strictEqual(fresh.authorized({ socket: { remoteAddress: '10.0.0.10' } }, url(CODE)), true, 'other addresses unaffected');
  fresh.fails.get('10.0.0.9').t -= 61_000;
  assert.strictEqual(fresh.authorized(fake(), url(CODE)), true, 'lock expires');
});

test('viewFor: phones see only handouts, wiki pages, cards and feed meant for them', async () => {
  server.publish({
    handouts: [{ id: 'a', to: 'all' }, { id: 't', to: ['Thorin'] }, { id: 'e', to: ['Elara'] }],
    wiki: [{ title: 'Town', to: 'all' }, { title: 'Elara secret', to: ['elara'] }],
    partyCards: [{ name: 'Thorin', hp: 31 }, { name: 'Elara', hp: 27 }],
    feed: [{ player: 'Thorin', text: 'rolled 17' }, { player: 'Elara', text: 'rolled 3' }],
  });
  const thorin = await firstEvent('player=thorin');
  assert.deepStrictEqual(thorin.handouts.map(h => h.id), ['a', 't']);
  assert.deepStrictEqual(thorin.wiki.map(w => w.title), ['Town']);
  assert.strictEqual(thorin.card.name, 'Thorin');
  assert.deepStrictEqual(thorin.feed.map(f => f.text), ['rolled 17']);
  const tv = await firstEvent('display=1');
  assert.deepStrictEqual(tv.handouts.map(h => h.id), ['a'], 'the TV display only gets "all" handouts');
  assert.deepStrictEqual(tv.feed, []);
  assert.strictEqual(tv.card, null);
});

test('move: needs a player and numeric x/y, then goes to the DM app', async () => {
  actions.length = 0;
  assert.strictEqual((await req('POST', '/api/move', { body: { x: 1, y: 2 } })).status, 400, 'no player');
  assert.strictEqual((await req('POST', '/api/move', { player: 'Thorin', body: { x: 'left', y: 2 } })).status, 400);
  assert.strictEqual((await req('POST', '/api/move', { player: 'Thorin', body: '{not json' })).status, 400);
  assert.strictEqual((await req('POST', '/api/move', { player: 'Thorin', body: { map: 'm1', token: 't1', x: 3, y: 4 } })).status, 204);
  assert.deepStrictEqual(actions, [{ type: 'move', player: 'Thorin', map: 'm1', token: 't1', x: 3, y: 4 }]);
});

test('ping and share are rate-limited per player', async () => {
  assert.strictEqual((await req('POST', '/api/ping', { player: 'Pinger', body: { x: 1, y: 1 } })).status, 204);
  assert.strictEqual((await req('POST', '/api/ping', { player: 'pinger', body: { x: 1, y: 1 } })).status, 429);
  assert.strictEqual((await req('POST', '/api/ping', { player: 'Other', body: { x: 1, y: 1 } })).status, 204);
  assert.strictEqual((await req('POST', '/api/share', { player: 'Sharer', body: { share: { kind: 'roll' } } })).status, 204);
  assert.strictEqual((await req('POST', '/api/share', { player: 'Sharer', body: { share: { kind: 'roll' } } })).status, 429);
});

test('offer: a character file goes to the DM app as an offer, once per 5 seconds per player', async () => {
  actions.length = 0;
  assert.strictEqual((await req('POST', '/api/offer', { player: 'Newbie', body: { name: 'Zed' } })).status, 400, 'no model');
  assert.strictEqual((await req('POST', '/api/offer', { player: 'Newbie', body: { name: 'Zed', model: { cls: 'Wizard' } } })).status, 204);
  assert.strictEqual((await req('POST', '/api/offer', { player: 'newbie', body: { name: 'Zed', model: { cls: 'Wizard' } } })).status, 429);
  assert.deepStrictEqual(actions, [{ type: 'offer', player: 'Newbie', name: 'Zed', model: { cls: 'Wizard' } }]);
});

test('bodies over the size limit are refused', async () => {
  const res = await req('POST', '/api/move', { player: 'Thorin', body: JSON.stringify({ x: 1, y: 1, pad: 'x'.repeat(5000) }) });
  assert.ok(res.status === 413 || res.status === 'reset', `got ${res.status}`);
});

test('token: only png/jpeg/webp data URLs, saved into media/ under a safe name', async () => {
  assert.strictEqual((await req('POST', '/api/token', { player: 'Thorin', body: { dataUrl: 'data:text/html;base64,PGgxPg==' } })).status, 400);
  actions.length = 0;
  const res = await req('POST', '/api/token', { player: '../../Thorin Oak', body: { dataUrl: 'data:image/png;base64,iVBORw0KGgo=' } });
  assert.strictEqual(res.status, 204);
  const file = actions[0].file;
  assert.match(file, /^pctoken-[a-z0-9-]+\.png$/, "no slashes or dots from the player name");
  assert.ok(fs.existsSync(path.join(dirs.media, file)));
});

test('notes: each player has their own page, and odd names stay inside the players folder', async () => {
  assert.strictEqual((await req('POST', '/api/notes', { player: 'Thorin', body: 'my notes' })).status, 204);
  assert.strictEqual((await req('GET', '/api/notes', { player: 'THORIN' })).body, 'my notes', 'names are case-insensitive');
  assert.strictEqual((await req('GET', '/api/notes', { player: 'Elara' })).body, '');
  assert.strictEqual((await req('POST', '/api/notes', { player: '../../escape', body: 'x' })).status, 204);
  const files = fs.readdirSync(path.join(dirs.vault, '.dmtools', 'players'));
  assert.ok(files.every(f => !f.includes('/')) && files.includes(encodeURIComponent('../../escape') + '.txt'));
  assert.ok(!fs.existsSync(path.join(tmp, 'escape.txt')));
});

test('files: no path traversal out of static/, media/ or the vault', async () => {
  assert.strictEqual((await req('GET', '/..%2foutside.txt', { code: false })).status, 404);
  assert.strictEqual((await req('GET', '/media/..%2f..%2foutside.txt', { code: false })).status, 404);
  assert.strictEqual((await req('GET', '/shared/..%2f..%2foutside.txt', { code: false })).status, 404);
});

test('wiki images: only ones referenced by shared pages', async () => {
  server.publish({ wikiImages: ['map.png', '../outside.txt'] });
  assert.strictEqual((await req('GET', '/wiki-img/map.png', { code: false })).body, 'PNG');
  assert.strictEqual((await req('GET', '/wiki-img/secret.png', { code: false })).status, 404);
  assert.strictEqual((await req('GET', '/wiki-img/..%2foutside.txt', { code: false })).status, 404, 'listed but outside the vault');
});

test('a new join code disconnects phones and rejects the old one', async () => {
  server.setCode('654321');
  assert.strictEqual((await req('GET', '/api/join')).status, 401);
  server.setCode(CODE);
});

(async () => {
  port = await server.listen(47000 + Math.floor(Math.random() * 1000));
  for (const [name, fn] of tests) {
    try { await fn(); passed++; } catch (e) { console.error(`✗ ${name}\n  ${e.message}`); process.exitCode = 1; }
  }
  server.http.closeAllConnections();
  server.http.close();
  fs.rmSync(tmp, { recursive: true, force: true });
  console.log(process.exitCode ? `${passed}/${tests.length} server checks passed.` : `All ${passed} server checks passed.`);
})();
