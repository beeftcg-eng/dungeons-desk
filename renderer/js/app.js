// App shell: navigation and startup.
window.App = (() => {
  const { $, $$ } = U;
  const modules = { notes: Notes, generators: Generators, tokens: Tokens, handouts: Handouts, loot: Loot, initiative: Initiative, maps: Maps, timeline: Timeline, rules: Rules, settings: Settings };
  let port = 7777;

  function show(view) {
    $$('#rail button[data-view]').forEach(b => b.classList.toggle('active', b.dataset.view === view));
    $$('.view').forEach(v => v.classList.toggle('active', v.id === 'view-' + view));
    localStorage.setItem('app.view', view);
    const m = modules[view];
    m && m.onShow && m.onShow();
  }

  const mediaUrl = (file) => `http://127.0.0.1:${port}/media/${encodeURIComponent(file)}`;

  async function init() {
    const info = await dm.server.info();
    port = info.port;
    App.players = info.players;
    dm.server.onPlayers(list => { App.players = list; });
    await Store.load();
    for (const [name, m] of Object.entries(modules)) m.mount($('#view-' + name));
    Dice.mount();
    Sheets.mount();
    $$('#rail button[data-view]').forEach(b => b.addEventListener('click', () => show(b.dataset.view)));
    $('#campaign-btn').addEventListener('click', Campaigns.open);
    Campaigns.refreshRail();
    show(localStorage.getItem('app.view') || 'notes');
    publishToPlayers();
    // Let the DM know when a new version is ready on GitHub.
    dm.update.onStatus((st) => { if (st.state === 'available') U.toast(`Update v${st.version} available: Settings → Updates`); if (st.state === 'ready') U.toast('Update downloaded: restart from Settings → Updates'); });
  }

  window.addEventListener('DOMContentLoaded', init);
  return { show, mediaUrl, players: [] };
})();
