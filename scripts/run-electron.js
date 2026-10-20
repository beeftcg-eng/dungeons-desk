// Runs an Electron smoke script (scripts/smoke.js, smoke-web.js) and makes sure it ends. Electron sometimes hangs while
// shutting down on CI after the test has finished, so the scripts write $SHOTS/result.txt (their exit code) first:
// once it's there, the run gets a few seconds to exit by itself, then it's killed and that code is used.
//   node scripts/run-electron.js scripts/smoke-web.js [electron flags…]    (RUN_TIMEOUT=seconds, default 240)
const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');
const [script, ...flags] = process.argv.slice(2);
if (!script || !process.env.SHOTS) { console.error('Usage: SHOTS=dir node scripts/run-electron.js <script> [flags]'); process.exit(2); }
const result = path.join(process.env.SHOTS, 'result.txt');
fs.mkdirSync(process.env.SHOTS, { recursive: true });
fs.rmSync(result, { force: true });
const child = spawn(path.join(__dirname, '..', 'node_modules/electron/dist/electron'), ['--no-sandbox', ...flags, script], { stdio: 'inherit', detached: true });
const kill = () => { try { process.kill(-child.pid, 'SIGKILL'); } catch { /* already gone */ } };
const code = () => { try { return Number(fs.readFileSync(result, 'utf8')) || 0; } catch { return null; } };
let doneAt = 0;
const started = Date.now(), limit = (Number(process.env.RUN_TIMEOUT) || 240) * 1000;
const timer = setInterval(() => {
  if (!doneAt && code() !== null) doneAt = Date.now();
  if (doneAt && Date.now() - doneAt > 8000) { console.log('run-electron: the test finished but Electron did not exit; stopping it.'); kill(); clearInterval(timer); process.exit(code()); }
  if (Date.now() - started > limit) { console.log('run-electron: timed out.'); kill(); clearInterval(timer); process.exit(1); }
}, 500);
child.on('exit', (status) => { clearInterval(timer); kill(); const c = code(); process.exit(c !== null ? c : status === null ? 1 : status); });
