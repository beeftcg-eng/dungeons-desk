// Settings: campaign vault location and the party roster.
window.Settings = (() => {
  const { h, toast } = U;
  let root;

  let updateShow = null;
  function mount(r) { root = r; dm.update.onStatus((st) => updateShow && updateShow(st)); Store.onLoad(draw); draw(); }

  async function draw() {
    const vault = await dm.vault.get();
    const party = Store.get().party;
    root.innerHTML = '';
    const row = (p, i) => h('tr',
      ['name', 'player', 'cls', 'level', 'initBonus', 'ac', 'hp'].map(k => h('td', h('input', { value: p[k] ?? '', type: ['level', 'initBonus', 'ac', 'hp'].includes(k) ? 'number' : 'text',
        placeholder: { name: 'Character', player: 'Player', cls: 'Class', level: 'Lvl', initBonus: '+0', ac: 'AC', hp: 'Max HP' }[k],
        onchange: (e) => {
          p[k] = e.target.value;
          // Typing a number here switches that number off "Auto" on the character sheet.
          const auto = { ac: 'ac', hp: 'hp', initBonus: 'init' }[k];
          if (auto && p.sheet && p.sheet.auto) p.sheet.auto[auto] = false;
          Store.save(); publishToPlayers();
        } }))),
      h('td', h('button.sheet-btn', { title: 'Character sheet', onclick: () => Sheets.open(p) }, '📜')),
      h('td', h('button.tok-pick', { title: 'Token (players can also set their own from their phone)', onclick: () => pickToken(p) },
        p.token ? h('img', { src: App.mediaUrl(p.token) }) : '🪙')),
      h('td', h('button.icon', { title: 'Remove', onclick: () => { party.splice(i, 1); Store.save(); publishToPlayers(); draw(); } }, '✕')));
    const pickToken = (p) => {
      const sheet = Store.get().tokenSheet;
      const m = U.modal(`Token for ${p.name || 'this character'}`, [
        h('p.dim', 'Players can upload their own token from the 👤 Me tab on their phone. Or pick one from your token sheet:'),
        sheet.length ? h('div.template-grid', sheet.map(t => h('button.template-card', { onclick: () => { p.token = t.file; Store.save(); publishToPlayers(); m.close(); draw(); } }, h('img', { src: App.mediaUrl(t.file), style: 'width:56px;height:56px' }), t.name || 'Token'))) : h('p', 'Your token sheet is empty — make one in 🪙 Tokens.'),
        p.token ? h('div.row.end', h('button.danger', { onclick: () => { p.token = null; Store.save(); publishToPlayers(); m.close(); draw(); } }, 'Remove token')) : null]);
    };

    const backupBox = h('div.backup-box', h('h4', '💾 Backups'), h('p.dim', 'Loading…'));
    dm.backup.info().then(b => {
      backupBox.innerHTML = '';
      // The phone app keeps campaigns in the browser's storage: an exported file is the backup.
      if (b.web) return backupBox.append(h('h4', '💾 Backups'),
        h('p', 'This campaign is saved on this device. To keep a copy, or to move it to the desktop app, export it as a campaign file. Every note also keeps its own version history: use 🕘 in the note toolbar.'),
        h('div.row', h('button', { onclick: () => Campaigns.exportFile() }, '⇧ Export campaign file'), h('button', { onclick: Campaigns.importFile }, '⇩ Import a campaign file')),
        h('p.hint', 'On the desktop app, 🗺 → “Import a campaign file…” opens it as a new campaign folder.'));
      backupBox.append(h('h4', '💾 Backups'),
        h('p', 'A full copy of this campaign is saved automatically once a day (the last 14 are kept) in ', h('code', b.dir), '. Every note also keeps its own version history — use 🕘 in the note toolbar.'),
        h('p.dim', b.last ? `Last backup: ${new Date(b.last).toLocaleString()} · ${b.count} backup${b.count === 1 ? '' : 's'} kept` : 'No backups yet.'),
        h('div.row',
          h('button', { onclick: async (e) => { e.target.disabled = true; try { await dm.backup.now(); toast('Backup saved'); } catch (err) { toast('Backup failed: ' + err.message, 'err'); } draw(); } }, '💾 Back up now'),
          h('button', { onclick: () => dm.backup.reveal() }, '📂 Open backups')),
        h('p.hint', 'To restore, open a backup folder with 🗺 → “Open a campaign folder…”, or copy notes back from it.'));
    });

    root.append(h('div.page',
      h('header.page-head', h('h1', 'Settings')),
      h('div.settings-grid',
        h('div.card',
          h('h3', '🛡 Party'),
          h('p.dim', 'Players pick their character name on their phone. These are also used by “Add the party” in the initiative tracker and when sending handouts to individual players.'),
          h('table.party-table', h('thead', h('tr', ['Character', 'Player', 'Class', 'Level', 'Init', 'AC', 'Max HP', 'Sheet', 'Token', ''].map(t => h('th', t)))), h('tbody', party.map(row))),
          h('div.row',
            h('button', { onclick: () => { party.push({ name: '', player: '', cls: '', level: 1, initBonus: 0, ac: '', hp: '' }); Store.save(); draw(); } }, '+ Add character'),
            h('button', { title: 'A .ddchar.json file a player exported from the Dungeons Desk character sheet', onclick: () => Sheets.importNew().then(ok => ok && draw()) }, '⇩ Add from a character file'))),
        h('div.card',
          h('h3', '🗺 Campaign'),
          dm.isWeb ? h('p', 'Campaign: ', h('b', vault), '. On the phone app, notes, handouts, tokens and everything else are saved on this device. Export a campaign file to move it to or from the desktop app.')
            : [h('p', 'Notes are plain Markdown files in this folder, so you can back them up, sync them, or even open the same folder in Obsidian. Handouts, tokens, loot tables and initiative are saved in its hidden ', h('code', '.dmtools'), ' subfolder.'),
              h('code.path', vault)],
          h('div.row',
            h('button.primary', { onclick: Campaigns.newCampaign }, '✨ New campaign'),
            h('button', { onclick: Campaigns.open }, '🔁 Switch campaign'),
            dm.isWeb ? null : h('button', { onclick: () => dm.vault.reveal() }, '📂 Open folder'),
            h('button', { title: 'Save this campaign as one file, to move it between the desktop and phone apps', onclick: () => Campaigns.exportFile() }, '⇧ Export')),
          h('div.row',
            h('button', { onclick: async () => { const n = await dm.vault.addSeed('guide'); await Notes.refresh(); toast(n ? `Added ${n} guide notes, see the Guide folder` : 'The guide is already in this campaign'); if (n) Notes.open('Guide/0 Start Here.md'); } }, '📘 Add the how-to guide'),
            h('button', { onclick: async () => { const n = await dm.vault.addSeed('examples'); await Notes.refresh(); toast(n ? `Added ${n} example notes` : 'The examples are already here'); } }, '🧪 Add example notes'),
            h('span.dim.small', 'Never overwrites your notes.')),
          h('div.row', h('button', { title: 'Find images no note, handout, map or token uses any more', onclick: () => Campaigns.cleanImages() }, '🧹 Clean up images')),
          backupBox),
        CloudSync.card(),
        installCard(),
        appearanceCard(),
        updatesCard(),
        h('div.card',
          h('h3', '✍ Note formatting cheatsheet'),
          h('table.cheat', h('tbody',
            [['[[Note Name]]', 'Link to another note (creates it if missing)'], ['[[Note Name|shown text]]', 'Link with custom text'], ['#tag', 'Tag a note (click a tag to search)'],
              ['> [!read-aloud]', 'Boxed text to read to players'], ['> [!secret] Title', 'DM-only secret box'], ['> [!quote]  > [!tip]  > [!warning]', 'Other callouts'],
              ['```statblock … ```', 'A monster stat block (use 🐉 to build one)'], ['- [ ] task', 'Checklist (click to tick in preview)'], ['---\\ntype: npc\\n---', 'Properties at the top of a note']]
              .map(([a, b]) => h('tr', h('td', h('code', a.replace(/\\n/g, '\n'))), h('td', b))))),
          h('h3', '⚡ Macros'),
          h('p', 'In any note, type ', h('code', '/'), ' at the start of a line (or press ', h('b', '＋ Insert'), ') to drop in a D&D format, a block, or freshly rolled content. In a blank note a format fills the whole note; otherwise it is added as a section. Select text first to use it as the name.'),
          h('table.cheat', h('tbody', Macros.list().filter(m => m.hotkey).map(m => h('tr', h('td', h('code', m.hotkey)), h('td', `${m.icon} ${m.label}`, h('span.dim', `   or /${m.id}`)))))),
          h('h3', '📖 Credits'),
          h('p.dim.small', SRDREF.attribution),
          h('p.dim', 'Shortcuts: Ctrl+D dice roller · Ctrl+Z undo in initiative · Ctrl+N new note · Ctrl+O jump to note · Ctrl+E toggle reading view · Ctrl+S save · Space = next turn in initiative.')))));
  }

  // Phone app only: installing it (web/install.js). A placeholder until the card is ready.
  function installCard() {
    if (!dm.isWeb || !window.Install) return null;
    const slot = h('div', { style: 'display:none' });
    Install.card({ app: 'dm', short: 'DM Desk', what: 'your campaigns' }).then(el => { if (el) slot.replaceWith(el); });
    return slot;
  }

  function appearanceCard() {
    const card = h('div.card');
    const drawCard = () => {
      card.innerHTML = '';
      const cur = Themes.current();
      card.append(h('h3', '🎨 Appearance'),
        h('div.theme-grid', Object.entries(Themes.list).map(([k, t]) => h('button.theme-card' + (k === cur ? '.on' : ''), { onclick: () => { Themes.set(k); drawCard(); } },
          h('div.sw', [t.bg, t.panel2, t.accent, t.text].map(c => h('i', { style: `background:${c}` }))), h('span', t.name)))),
        h('div.row',
          h('label.field.inline', h('span', 'Accent color'), h('input', { type: 'color', value: Themes.accent() || Themes.list[cur].accent, oninput: (e) => Themes.setAccent(e.target.value) })),
          Themes.accent() ? h('button.small', { onclick: () => { Themes.set(cur); drawCard(); } }, 'Reset accent') : null,
          h('label.field.inline', h('span', 'Text size'), h('select', { onchange: (e) => Themes.setZoom(e.target.value) }, [0.9, 1, 1.1, 1.2, 1.3].map(z => h('option', { value: z, selected: Themes.zoom() === z }, Math.round(z * 100) + '%'))))));
    };
    drawCard();
    return card;
  }

  function updatesCard() {
    const card = h('div.card', h('h3', '⬆ Updates'), h('p.dim', 'Loading…'));
    const status = h('div.update-status');
    let info = null;
    const show = (st) => {
      status.innerHTML = '';
      if (!st) return;
      const pct = st.progress != null ? Math.round(st.progress) : null;
      const msg = { checking: 'Checking for updates…', none: `You're up to date (v${info.version}).`, available: `Version ${st.version} is available.`,
        downloading: `Downloading v${st.version}… ${pct ?? 0}%`, ready: `Version ${st.version} is downloaded and ready.`, error: `Couldn't check for updates: ${st.message || 'unknown error'}` }[st.state] || '';
      status.append(h('p', msg),
        st.state === 'downloading' ? h('div.hp-bar', h('i', { style: `width:${pct ?? 0}%;background:var(--accent)` })) : null,
        st.notes ? h('details', h('summary', 'What\'s new'), h('div.md', { html: st.notes })) : null,
        st.state === 'available' ? h('button.primary', { onclick: () => dm.update.download() }, '⬇ Download update') : null,
        st.state === 'ready' ? h('button.primary', { onclick: () => dm.update.install() }, '🔄 Restart and update') : null);
    };
    dm.update.info().then(i => {
      info = i;
      card.innerHTML = '';
      card.append(h('h3', '⬆ Updates'), h('p', `Dungeons Desk v${i.version}`, h('span.dim', ` · ${i.platform}`)),
        i.canUpdate ? [h('p.dim', 'Updates are downloaded from GitHub. Only the changed parts are downloaded, not the whole app.'), h('button', { onclick: () => dm.update.check() }, '🔍 Check for updates'), status]
          : i.web ? h('p.dim', 'The phone app updates itself: close it and open it again to get the newest version.')
          : h('p.dim', i.packaged ? 'Automatic updates aren\'t available for this install type. Download the latest version from the GitHub releases page.' : 'You\'re running from the source folder, so updates come from the project files rather than GitHub.'),
        h('div.row', h('button.small', { onclick: () => dm.openExternal(i.releasesUrl) }, '🌐 Releases page')));
      show(i.status);
    });
    updateShow = show;
    return card;
  }

  // Redraw after a player edits their sheet, unless the DM is typing in Settings right now.
  const refresh = () => { if (root && !root.contains(document.activeElement)) draw(); };

  return { mount, refresh };
})();
