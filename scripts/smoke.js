// Smoke test: launches the app, screenshots each view into $SHOTS, logs console errors to $SHOTS/log.txt.
// Run with a throwaway HOME so it doesn't touch the real vault — see CLAUDE.md.
const { app, BrowserWindow } = require('electron');
const fs = require('fs');
const APP = require('path').resolve(__dirname, '..');
const OUT = process.env.SHOTS;
const log = (...a) => fs.appendFileSync(OUT + '/log.txt', a.join(' ') + '\n');
fs.writeFileSync(OUT + '/log.txt', '');
const sleep = (ms) => new Promise(r => setTimeout(r, ms));
let started = false;
app.on('browser-window-created', (_, w) => {
  w.webContents.on('console-message', (e, level, msg, line, src) => { if (level >= 2) log('CONSOLE', level, msg, src + ':' + line); });
  w.webContents.on('preload-error', (e, p, err) => log('PRELOAD', err));
  if (started) return; started = true;
  w.webContents.once('did-finish-load', async () => {
    try {
      await sleep(2500);
      const js = (c) => w.webContents.executeJavaScript(c);
      for (const v of (process.env.VIEWS || 'notes,generators,tokens,handouts,loot,initiative,settings').split(',')) {
        await js(`App.show('${v}')`);
        // Errors thrown by setup code also show up as CONSOLE lines in log.txt.
        if (process.env['PRE_' + v]) { try { await js(process.env['PRE_' + v]); } catch (e) { log('PRE_' + v, e.message); } }
        await sleep(1200);
        const img = await w.webContents.capturePage();
        fs.writeFileSync(`${OUT}/${v}.png`, img.toPNG());
      }
      if (process.env.PHONE) {
        // PHONE_TABS=turns,wiki,map,me  captures each tab of the phone page as player PHONE_PLAYER (default Thorin).
        const port = await js('dm.server.info().then(i => i.port)');
        const pw = new BrowserWindow({ width: 400, height: 820, show: true });
        await pw.loadURL(`http://127.0.0.1:${port}/?player=${encodeURIComponent(process.env.PHONE_PLAYER || 'Thorin')}`);
        await sleep(2500);
        if (process.env.PHONE_PRE) { log('PHONE_PRE', JSON.stringify(await pw.webContents.executeJavaScript(process.env.PHONE_PRE))); await sleep(1500); }
        for (const t of (process.env.PHONE_TABS || 'turns,handouts').split(',')) {
          await pw.webContents.executeJavaScript(`document.querySelector('nav button[data-tab="${t}"]').click(); ${t === 'handouts' ? "document.querySelector('.ho-card') && document.querySelector('.ho-card').click();" : ''}${t === 'wiki' && process.env.PHONE_WIKI ? `setTimeout(() => [...document.querySelectorAll('.witem')].find(w => w.textContent.includes(${JSON.stringify(process.env.PHONE_WIKI)}))?.click(), 200);` : ''}`);
          await sleep(1000);
          fs.writeFileSync(`${OUT}/phone-${t}.png`, (await pw.capturePage()).toPNG());
          await pw.webContents.executeJavaScript(`document.querySelector('.viewer .close')?.click()`);
        }
        // PHONE_STEPS="js|||js|||…" runs each step on the phone page and captures phone-step1.png, phone-step2.png, …
        let n = 0;
        for (const step of (process.env.PHONE_STEPS || '').split('|||').filter(Boolean)) {
          try { log('PHONE_STEP' + (++n), JSON.stringify(await pw.webContents.executeJavaScript(step))); } catch (e) { log('PHONE_STEP' + n, e.message); }
          await sleep(900);
          fs.writeFileSync(`${OUT}/phone-step${n}.png`, (await pw.capturePage()).toPNG());
        }
        if (process.env.PHONE_EVAL) log('PHONE_EVAL', JSON.stringify(await pw.webContents.executeJavaScript(process.env.PHONE_EVAL)));
        pw.destroy();
      }
      if (process.env.EXTRA) { log('EXTRA', JSON.stringify(await js(process.env.EXTRA))); }
    } catch (e) { log('HARNESS', e && (e.stack || e.message) || String(e)); }
    app.quit();
  });
});
require(APP + '/main.js');
