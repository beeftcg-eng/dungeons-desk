// Smoke test for the phone app: builds nothing, just serves dist-web/ (run `npm run build:web` first) and opens it in a
// phone-sized window with fresh in-memory storage. Screenshots go to $SHOTS, console warnings/errors to $SHOTS/log.txt.
//   PAGE=dm|sheet|''   which page (default dm)      VIEWS=notes,initiative   DM views to capture (default: all)
//   W=390 H=844        window size                 STEPS="js|||js"           run each on the page, capture step1.png…
//   PRE="js"           run once after load          EXTRA="js"               log the result of an expression
//   THEME=light|dark   the phone's color scheme (prefers-color-scheme)
//   CHECK=1            exit with 1 (and print the log) on a console error, a missing file or a failed step: for CI
const { app, BrowserWindow, session, nativeTheme } = require('electron');
const fs = require('fs');
const path = require('path');
const http = require('http');
const OUT = process.env.SHOTS;
const ROOT = path.resolve(__dirname, '..', 'dist-web');
const log = (...a) => fs.appendFileSync(OUT + '/log.txt', a.join(' ') + '\n');
let failed = 0;
const fail = (...a) => { failed++; log(...a); };
const sleep = (ms) => new Promise(r => setTimeout(r, ms));
fs.writeFileSync(OUT + '/log.txt', '');

const types = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.png': 'image/png', '.svg': 'image/svg+xml' };
const server = http.createServer((req, res) => {
  let p = decodeURIComponent(new URL(req.url, 'http://x').pathname);
  if (p.endsWith('/')) p += 'index.html';
  const full = path.join(ROOT, p);
  if (!full.startsWith(ROOT) || !fs.existsSync(full)) { fail('404', p); res.writeHead(404); return res.end(); }
  res.writeHead(200, { 'Content-Type': types[path.extname(full)] || 'application/octet-stream' });
  fs.createReadStream(full).pipe(res);
});

if (process.env.THEME) nativeTheme.themeSource = process.env.THEME;
app.whenReady().then(() => server.listen(0, async () => {
  const port = server.address().port;
  const ses = session.fromPartition('smoke-' + Date.now()); // not persisted: every run starts empty
  const w = new BrowserWindow({ width: Number(process.env.W) || 390, height: Number(process.env.H) || 844, show: false, useContentSize: true, webPreferences: { session: ses, offscreen: true } });
  w.webContents.setFrameRate(30);
  w.webContents.on('console-message', (e) => { if (e.level === 'warning' || e.level === 'error') (e.level === 'error' ? fail : log)('CONSOLE', e.level, e.message, e.sourceId + ':' + e.lineNumber); });
  w.webContents.on('render-process-gone', (e, d) => fail('CRASH', d.reason));
  const js = (c) => w.webContents.executeJavaScript(c);
  const shot = async (name) => fs.writeFileSync(`${OUT}/${name}.png`, (await w.capturePage()).toPNG());
  try {
    const page = process.env.PAGE ?? 'dm';
    await w.loadURL(`http://127.0.0.1:${port}/${page ? page + '/' : ''}`);
    await sleep(2500);
    if (process.env.PRE) { try { log('PRE', JSON.stringify(await js(process.env.PRE))); } catch (e) { fail('PRE', e.message); } await sleep(1000); }
    if (page === 'dm') {
      for (const v of (process.env.VIEWS || 'session,notes,generators,initiative,maps,tokens,handouts,loot,timeline,rules,settings').split(',')) {
        await js(`App.show('${v}')`);
        await sleep(900);
        await shot(v);
      }
    } else await shot(page || 'index');
    let n = 0;
    for (const step of (process.env.STEPS || '').split('|||').filter(Boolean)) {
      try { log('STEP' + (++n), JSON.stringify(await js(step))); } catch (e) { fail('STEP' + n, e.message); }
      await sleep(900);
      await shot('step' + n);
    }
    if (process.env.EXTRA) log('EXTRA', JSON.stringify(await js(process.env.EXTRA)));
  } catch (e) { fail('HARNESS', e && (e.stack || e.message)); }
  server.close();
  if (process.env.CHECK) { process.stdout.write(fs.readFileSync(OUT + '/log.txt', 'utf8')); app.exit(failed ? 1 : 0); } else app.quit();
}));
