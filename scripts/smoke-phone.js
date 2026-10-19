// The players' phone page, end to end: runs the desktop app (scripts/smoke.js) in a throwaway home folder with a LAN
// game, has the DM send a recap, a Long Rest, Heroic Inspiration, XP for a new level and treasure, and checks that a
// phone shows each one and that levelling up with the step-by-step guide reaches the DM's party.
// Any failed step or console error fails it (CHECK=1). For CI: xvfb-run -a node scripts/smoke-phone.js
// Screenshots and log.txt go to $SHOTS (default: a new temporary folder, printed at the end).
const { spawnSync } = require('child_process');
const fs = require('fs'), os = require('os'), path = require('path');
const ROOT = path.resolve(__dirname, '..');
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'dd-phone-'));
const SHOTS = process.env.SHOTS || path.join(tmp, 'shots');
fs.mkdirSync(path.join(tmp, 'home'), { recursive: true });
fs.mkdirSync(SHOTS, { recursive: true });

// On the phone page: wait for an element (or throw), and click it.
const wait = `const wait = async (sel, ms = 8000) => { const t = Date.now(); for (;;) { const el = document.querySelector(sel); if (el) return el; if (Date.now() - t > ms) throw new Error('never appeared: ' + sel); await new Promise(r => setTimeout(r, 150)); } };
  const click = async (sel) => { (await wait(sel)).click(); await new Promise(r => setTimeout(r, 300)); };
  const text = (sel) => (document.querySelector(sel) || {}).textContent || '';`;
const step = (body) => `(async () => { ${wait} ${body} })()`;

// The DM: a Barbarian 2 with a sheet, a recap, a homebrew subclass for everyone.
const PRE = `(async () => {
  const s = Store.get();
  s.party = [{ name: 'Thorin', cls: 'Barbarian', level: 2, ac: 14, hp: 25, sheet: { abilities: { str: 16, dex: 14, con: 15, int: 8, wis: 12, cha: 10 }, xp: 600 } }];
  s.playerView.allHomebrew = true;
  s.recap = { draft: 'We met the bog hag.', sent: { text: 'We met the bog hag.', at: Date.now() } };
  await dm.notes.write('Homebrew/Subclasses/Path of the Bog.md', Homebrew.subclassNote({ name: 'Path of the Bog', cls: 'Barbarian', summary: 'Become One with the Mire',
    features: [{ level: 3, name: 'Mud Rage', desc: 'You ignore difficult terrain.' }] }));
  Store.save(); await Notes.refresh(); publishToPlayers(); return 1;
})()`;
// Phone steps can't reach the DM window, so the DM's actions start from its setup, a few seconds later.
const DM_LATER = `setTimeout(() => {
  const p = Store.get().party[0];
  Sheets.restAll('long'); Sheets.inspire(p); Sheets.awardXp([p], 300); Sheets.give(p, [{ name: 'Potion of Healing', qty: 2 }], { gp: 25 });
}, 4000); 1`;

const STEPS = [
  // The recap pops up first.
  step(`await wait('.viewer .recap'); if (!/bog hag/.test(text('.viewer'))) throw new Error('no recap'); await click('.viewer .got'); return 'recap';`),
  // Then, after the DM's rest, Inspiration, XP and treasure: one pop-up with all four, and a Level up button.
  step(`await wait('.viewer [data-act="levelup"]', 15000); const t = text('.viewer');
    for (const w of ['Long Rest', 'Heroic Inspiration', 'Level 3', 'Treasure']) if (!t.includes(w)) throw new Error('missing notice: ' + w);
    await click('.viewer [data-act="levelup"]'); return 'notices';`),
  // The level-up guide: start, HP, subclass (the DM's homebrew one), features, done.
  step(`await wait('.cg'); await click('[data-g="next"]'); await click('[data-g="next"]');
    await click('[data-g="sub"][data-v="Path of the Bog"]');
    for (let i = 0; i < 8 && document.querySelector('[data-g="next"]:not([disabled])'); i++) await click('[data-g="next"]');
    await click('[data-g="finish"]'); return 'levelled';`),
  step(`await new Promise(r => setTimeout(r, 1500));
    if (!/Level 3 Barbarian \\(Path of the Bog\\)/.test(text('#char'))) throw new Error('the sheet is not level 3: ' + text('#char').slice(0, 120));
    [...document.querySelectorAll('#char [data-tab]')].find(b => b.textContent.trim() === 'Gear').click(); await new Promise(r => setTimeout(r, 400));
    if (!/Potion of Healing/.test(text('#char'))) throw new Error('no potion in the gear');
    return 'sheet ok';`),
];
const EXTRA = `(() => { const p = Store.get().party[0];
  if (Number(p.level) !== 3 || p.sheet.subclass !== 'Path of the Bog') throw new Error('the DM app did not get the level up: level ' + p.level);
  if (!p.sheet.inspiration || p.sheet.xp !== 900 || p.sheet.coins.gp !== 25) throw new Error('inspiration/xp/coins wrong: ' + JSON.stringify([p.sheet.inspiration, p.sheet.xp, p.sheet.coins.gp]));
  return 'party ok'; })()`;

const r = spawnSync(path.join(ROOT, 'node_modules/electron/dist/electron'), ['--no-sandbox', '--disable-gpu', path.join(ROOT, 'scripts/smoke.js')], {
  stdio: 'inherit', timeout: 240000,
  env: { ...process.env, HOME: path.join(tmp, 'home'), SHOTS, CHECK: '1', VIEWS: 'session', PRE_session: `${PRE}.then(() => { ${DM_LATER} })`,
    PHONE: '1', PHONE_TABS: '', PHONE_PRE: "localStorage.setItem('dm.tour.done', '1'); localStorage.setItem('dd.whatsnew.player', '99'); setTimeout(() => location.reload(), 50); 1",
    PHONE_STEPS: STEPS.join('|||'), EXTRA },
});
console.log(`Screenshots: ${SHOTS}`);
process.exit(r.status === null ? 1 : r.status);
