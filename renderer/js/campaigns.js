// Campaigns: start a new campaign or switch between existing ones. Each campaign is its own vault folder.
window.Campaigns = (() => {
  const { h, toast } = U;

  // Save anything pending, point the app at another vault, then reload so every tool starts fresh.
  async function switchTo(fn, openNote) {
    await Notes.flush();
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

  async function refreshRail() {
    const info = await dm.campaigns.list();
    const el = U.$('#campaign-name');
    if (el) { el.textContent = info.currentName; el.parentElement.title = `Campaign: ${info.currentName}\nClick to switch or start a new one`; }
  }

  return { open, newCampaign, refreshRail, exportFile, importFile };
})();
