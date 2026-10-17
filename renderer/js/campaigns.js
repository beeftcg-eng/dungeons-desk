// Campaigns: start a new campaign or switch between existing ones. Each campaign is its own vault folder.
window.Campaigns = (() => {
  const { h, toast } = U;

  // Save anything pending, point the app at another vault, then reload so every tool starts fresh.
  async function switchTo(fn, openNote) {
    await Notes.flush();
    if (window.CloudSync) await CloudSync.syncNow().catch(() => {});
    await Store.saveNow();
    try { await fn(); } catch (e) { toast(String(e.message).replace(/^.*Error: /, ''), 'err'); return false; }
    if (openNote) localStorage.setItem('notes.last', openNote); else localStorage.removeItem('notes.last');
    localStorage.setItem('app.view', 'notes');
    location.reload();
    return true;
  }

  function newCampaign() {
    const name = h('input', { placeholder: 'e.g. Curse of the Thornwood' });
    const examples = h('input', { type: 'checkbox' });
    const guide = h('input', { type: 'checkbox', checked: true });
    const create = () => {
      const n = name.value.trim();
      if (!n) return name.focus();
      switchTo(() => dm.campaigns.create(n, examples.checked, guide.checked), `${n.replace(/[\\/:*?"<>|]/g, '').trim()}.md`);
    };
    name.addEventListener('keydown', (e) => e.key === 'Enter' && create());
    const m = U.modal('New campaign', [
      h('label.field', h('span', 'Campaign name'), name),
      h('label.chk', guide, ' Include the how-to guide (a Guide folder explaining every feature)'),
      h('label.chk', examples, ' Include the example notes (goblins, Oakhaven, homebrew…)'),
      h('p.hint', dm.isWeb ? 'Creates a fresh campaign on this device with an overview note and folders for NPCs, locations, lore and more. Your current campaign is saved and stays in the campaign list.'
        : 'Creates a fresh folder in Documents/Dungeons Desk Campaigns with an overview note and folders for NPCs, locations, lore and more. Your current campaign is saved and stays in the campaign list.'),
      h('div.row.end', h('button', { onclick: () => m.close() }, 'Cancel'), h('button.primary', { onclick: create }, '✨ Create campaign')),
    ]);
  }

  async function open() {
    const info = await dm.campaigns.list();
    const when = (t) => t ? new Date(t).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' }) : '';
    const list = h('div.camp-list', info.campaigns.map(c => h('div.camp-card' + (c.current ? '.current' : '') + (c.exists ? '' : '.missing'),
      h('div.camp-main', { onclick: () => { if (!c.current && c.exists) switchTo(() => dm.campaigns.open(c.path)); } },
        h('div.camp-name', c.name, c.current ? h('span.chip.live', 'Open now') : null, !c.exists ? h('span.chip', 'Folder missing') : null),
        dm.isWeb ? null : h('div.dim.small', c.path), h('div.dim.small', 'Last opened ' + when(c.lastOpened))),
      h('div.camp-actions',
        c.exists && !c.current ? h('button.primary.small', { onclick: () => switchTo(() => dm.campaigns.open(c.path)) }, 'Open') : null,
        c.exists ? h('button.icon', { title: 'Rename', onclick: async () => { const n = await U.prompt('Rename campaign', c.name); if (n) { await dm.campaigns.rename(c.path, n); m.close(); open(); refreshRail(); } } }, '✏') : null,
        c.exists && !dm.isWeb ? h('button.icon', { title: 'Show folder', onclick: () => dm.campaigns.reveal(c.path) }, '📂') : null,
        c.exists ? h('button.icon', { title: 'Export as a campaign file (to move it to another device)', onclick: () => exportFile(c.path) }, '⇧') : null,
        !c.current && !dm.isWeb ? h('button.icon', { title: 'Remove from this list (files are kept)', onclick: async () => { await dm.campaigns.forget(c.path); m.close(); open(); } }, '✕') : null,
        // The phone app has no folder that outlives the list, so removing a campaign deletes it.
        !c.current && dm.isWeb ? h('button.icon', { title: 'Delete this campaign from this device', onclick: async () => {
          if (!await U.confirm('Delete campaign', `Delete “${c.name}” from this device? Export it first (⇧) if you want to keep a copy.`)) return;
          await dm.campaigns.forget(c.path); m.close(); open();
        } }, '🗑') : null))));
    const m = U.modal('Campaigns', [
      h('div.row', h('button.primary.big', { onclick: () => { m.close(); newCampaign(); } }, '✨ New campaign'),
        dm.isWeb ? null : h('button.big', { onclick: () => switchTo(() => dm.campaigns.browse().then(r => { if (!r) throw new Error('No folder chosen'); })) }, '📂 Open a campaign folder…'),
        h('button.big', { title: 'A .ddcampaign.json file exported from Dungeons Desk on another computer or phone', onclick: importFile }, '⇩ Import a campaign file…')),
      h('h4', 'Your campaigns'),
      list,
    ], { wide: false });
  }

  // Campaign files (.ddcampaign.json) carry the notes, images and app state between the desktop and phone apps.
  async function exportFile(id) {
    await Notes.flush();
    await Store.saveNow();
    try { const r = await dm.campaigns.exportFile(id); if (r && typeof r === 'string') toast('Saved ' + r); else if (r) toast('Campaign file downloaded'); }
    catch (e) { toast('Export failed: ' + String(e.message).replace(/^.*Error: /, ''), 'err'); }
  }
  const importFile = () => switchTo(() => dm.campaigns.importFile().then(r => { if (!r) throw new Error('No file chosen'); }));

  // Phone app only: browsers can clear a site's storage, so remind the DM to export a campaign that changed
  // since its last export, once that's a week old. "Later" waits three days.
  async function remindBackup() {
    if (!dm.campaigns.backupInfo) return;
    const DAY = 86400000, b = await dm.campaigns.backupInfo(), key = 'dd.backupSnooze';
    if (!b.changed || (b.exported && b.changed <= b.exported)) return;
    if (Date.now() - (b.exported || b.created || b.changed) < 7 * DAY) return;
    if (Number(localStorage.getItem(key) || 0) > Date.now()) return;
    const m = U.modal('💾 Keep a copy of your campaign', [
      h('p', b.exported ? `This campaign was last exported ${Math.round((Date.now() - b.exported) / DAY)} days ago, and it has changed since.` : 'This campaign has never been exported.'),
      h('p.dim', 'Phones sometimes clear app data, for example after weeks without opening it or when storage runs low. A campaign file keeps everything safe and opens in the desktop app too.'),
      h('div.row.end', h('button', { onclick: () => { localStorage.setItem(key, Date.now() + 3 * DAY); m.close(); } }, 'Later'),
        h('button.primary', { onclick: () => { m.close(); exportFile(); } }, '⇧ Export now')),
    ]);
  }

  // Images nothing uses any more: media files the app state doesn't name (handouts, maps, tokens) and note images
  // no note mentions. They go to the system trash on desktop; synced devices delete them too.
  async function cleanImages() {
    await Notes.flush();
    await Store.saveNow();
    const text = JSON.stringify(Store.get()) + '\n' + (await dm.notes.readAll()).map(n => n.content).join('\n');
    const used = (name) => text.includes(name) || text.includes(encodeURI(name)) || text.includes(encodeURIComponent(name));
    const media = (await dm.media.list()).filter(n => !used(n));
    const attach = (await dm.attach.list()).filter(p => !used(p.split('/').pop()));
    if (!media.length && !attach.length) return toast('Every image is in use');
    let bytes = 0;
    for (const n of media) bytes += ((await dm.media.read(n).catch(() => '')).length * 3) / 4;
    for (const p of attach) bytes += ((await dm.attach.read(p).catch(() => '')).length * 3) / 4;
    const n = media.length + attach.length, mb = (bytes / 1048576).toFixed(1);
    const ok = await U.confirm('🧹 Clean up images', `${n} image${n === 1 ? ' isn\'t' : 's aren\'t'} used by any note, handout, map or token (${mb} MB)` +
      (attach.length ? `, including ${attach.slice(0, 5).map(p => p.split('/').pop()).join(', ')}${attach.length > 5 ? '…' : ''}` : '') +
      (dm.isWeb ? '. Delete them from this device?' : '. Move them to the trash?') + (CloudSync.isLinked() ? ' Your other synced devices delete them too.' : ''));
    if (!ok) return;
    for (const x of media) await dm.media.delete(x);
    for (const x of attach) await dm.attach.delete(x);
    toast(`Removed ${n} image${n === 1 ? '' : 's'}`);
    CloudSync.syncNow().catch(() => {});
  }

  async function refreshRail() {
    const info = await dm.campaigns.list();
    const el = U.$('#campaign-name');
    if (el) { el.textContent = info.currentName; el.parentElement.title = `Campaign: ${info.currentName}\nClick to switch or start a new one`; }
  }

  return { open, newCampaign, refreshRail, exportFile, importFile, remindBackup, switchTo, cleanImages };
})();
