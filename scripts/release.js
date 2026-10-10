// Publish a new version:  npm run release -- [patch|minor|major] "What changed"
// Bumps the version, commits, creates an annotated tag with your notes, and pushes.
// GitHub Actions then builds Windows + Linux and publishes the release; installed apps offer the update.
const { execSync } = require('child_process');
const run = (cmd) => execSync(cmd, { stdio: 'inherit' });
const out = (cmd) => execSync(cmd, { encoding: 'utf8' }).trim();

const [bump = 'patch', ...noteWords] = process.argv.slice(2);
if (!['patch', 'minor', 'major'].includes(bump)) { console.error('Usage: npm run release -- [patch|minor|major] "What changed"'); process.exit(1); }
const notes = noteWords.join(' ').trim() || 'Bug fixes and improvements.';

if (out('git status --porcelain')) {
  run('git add -A');
  run(`git commit -m ${JSON.stringify('Changes for next release')}`);
}
const version = out(`npm version ${bump} --no-git-tag-version`).replace(/^v/, '');
run('git add package.json package-lock.json');
run(`git commit -m "Release v${version}"`);
run(`git tag -a v${version} -m ${JSON.stringify(notes)}`);
run('git push');
run(`git push origin v${version}`);
console.log(`\nv${version} pushed. GitHub is building it now: https://github.com/beeftcg-eng/dungeons-desk/actions`);
