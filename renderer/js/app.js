// App shell: navigation and startup.
window.App = (() => {
  const { $, $$ } = U;
  const modules = { notes: Notes, generators: Generators, tokens: Tokens, handouts: Handouts, loot: Loot, initiative: Initiative, maps: Maps, timeline: Timeline, rules: Rules, session: Session, settings: Settings };
  let port = 7777;

  function show(view) {
    $$('#rail button[data-view]').forEach(b => b.classList.toggle('active', b.dataset.view === view));
    // Phone tab bar: views without data-m live under More, which lights up for them.
    const more = $('#rail .more-btn');
    if (more) more.classList.toggle('active', !$(`#rail button[data-view="${view}"][data-m]`));
    $$('.view').forEach(v => v.classList.toggle('active', v.id === 'view-' + view));
    localStorage.setItem('app.view', view);
    const m = modules[view];
    m && m.onShow && m.onShow();
  }

  // The phone app keeps images in IndexedDB (web/dm-bridge.js); the desktop app serves them from the player server.
  const mediaUrl = (file) => dm.mediaUrl ? dm.mediaUrl(file) : `http://127.0.0.1:${port}/media/${encodeURIComponent(file)}`;

  async function init() {
    if (dm.isWeb) document.body.classList.add('web');
    const info = await dm.server.info();
    port = info.port;
    App.players = info.players;
    dm.server.onPlayers(list => { App.players = list; });
    await Store.load();
    for (const [name, m] of Object.entries(modules)) m.mount($('#view-' + name));
    Dice.mount();
    Sheets.mount();
    $$('#rail button[data-view]').forEach(b => b.addEventListener('click', () => show(b.dataset.view)));
    // Ctrl+1…9 jump to the rail's views in order; Ctrl+, opens Settings.
    const keyFor = (view, i) => view === 'settings' ? 'Ctrl+,' : i < 9 ? `Ctrl+${i + 1}` : null;
    const views = $$('#rail button[data-view]').map((b, i) => { const k = keyFor(b.dataset.view, i); if (k) b.title += ` (${k})`; return b.dataset.view; });
    document.addEventListener('keydown', (e) => {
      if (!e.ctrlKey || e.altKey || e.shiftKey || e.metaKey) return;
      const view = e.key === ',' ? 'settings' : /^[1-9]$/.test(e.key) ? views[e.key - 1] : null;
      if (view) { e.preventDefault(); show(view); }
    });
    $('#campaign-btn').addEventListener('click', Campaigns.open);
    $('#rail .more-btn').addEventListener('click', moreSheet);
    swipeBack();
    Campaigns.refreshRail();
    show(localStorage.getItem('app.view') || 'notes');
    publishToPlayers();
    setTimeout(Campaigns.remindBackup, 4000);
    CloudSync.init();
    // Let the DM know when a new version is ready on GitHub.
    dm.update.onStatus((st) => { if (st.state === 'available') U.toast(`Update v${st.version} available: Settings → Updates`); if (st.state === 'ready') U.toast('Update downloaded: restart from Settings → Updates'); });
  }

  // Phone layout: swiping right from the left edge goes back to the list in Notes, Rules and Handouts.
  function swipeBack() {
    let start = null;
    document.addEventListener('touchstart', (e) => { const t = e.touches[0]; start = e.touches.length === 1 && t.clientX < 40 ? { x: t.clientX, y: t.clientY } : null; }, { passive: true });
    document.addEventListener('touchend', (e) => {
      if (!start) return;
      const t = e.changedTouches[0], dx = t.clientX - start.x, dy = Math.abs(t.clientY - start.y);
      start = null;
      if (dx < 70 || dy > 60) return;
      const back = $('.view.active .m-detail .m-back');
      if (back && back.offsetParent) back.click();
    }, { passive: true });
  }

  // Phone layout: every tool, plus the campaign picker, in a sheet from the tab bar's More button.
  function moreSheet() {
    const m = U.modal('All tools', U.h('div.more-grid',
      $$('#rail button[data-view]').map(b => U.h('button.more-item' + (b.classList.contains('active') ? '.on' : ''), { onclick: () => { m.close(); show(b.dataset.view); } },
        U.h('span', b.querySelector('span').textContent), b.textContent.replace(b.querySelector('span').textContent, '').trim())),
      U.h('button.more-item', { onclick: () => { m.close(); Campaigns.open(); } }, U.h('span', '🗺'), 'Campaigns')));
  }

  window.addEventListener('DOMContentLoaded', init);
  return { show, mediaUrl, players: [] };
})();
