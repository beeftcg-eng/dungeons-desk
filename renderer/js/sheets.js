// Character sheets on the DM side (the sheet itself is shared/charsheet.js).
// - Applies sheets that players edit on their phones (POST /api/sheet), after cleaning them.
// - Rolls what players send (POST /api/share) and shows it in the player feed; each phone gets back only its own results.
// - Opens any party member's sheet from Settings. Rolls the DM makes there stay in the DM's feed.
window.Sheets = (() => {
  const { h, toast } = U;
  let feed = [], unread = 0, els = {}, open = null;
  const party = () => Store.get().party;
  const member = (name) => party().find(p => (p.name || '').toLowerCase() === String(name || '').toLowerCase()) || null;
  const modelOf = (p) => ({ name: p.name, cls: p.cls, level: p.level, ac: p.ac, hp: p.hp, initBonus: p.initBonus, sheet: p.sheet || null });
  const condNames = (c) => (c.conditions || []).map(x => typeof x === 'string' ? x : (x.rounds ? `${x.name} (${x.rounds})` : x.name));
  function liveOf(p) {
    const ini = Store.get().initiative;
    const c = ini.active && ini.combatants.find(x => x.kind === 'pc' && x.name.toLowerCase() === (p.name || '').toLowerCase());
    return c ? { inCombat: true, hp: c.hp, maxHp: c.maxHp, ac: c.ac, conditions: condNames(c), deathSaves: c.hp === 0 ? (c.deathSaves || { s: 0, f: 0 }) : null }
      : { inCombat: false, conditions: [], deathSaves: null };
  }

  // Write a (cleaned) sheet model back onto the party member. Name, player and token never come from a sheet.
  function apply(p, model) {
    const m = CharSheet.applyAuto(CharSheet.clean(model));
    p.cls = m.cls; p.level = m.level; p.ac = m.ac ?? ''; p.hp = m.hp ?? ''; p.initBonus = m.initBonus; p.sheet = m.sheet;
    Store.save(); publishToPlayers();
    if (window.Settings && Settings.refresh) Settings.refresh();
  }

  function playerAction(a) {
    if (a.type === 'sheet') {
      const p = member(a.player);
      if (!p) return;
      apply(p, a.model);
      if (open && open.p === p) open.api.set(modelOf(p), liveOf(p));
    } else if (a.type === 'share') handle(a.player, a.share, false);
  }

  // Roll (or pass on) one share and add it to the feed.
  function handle(player, share, byDm) {
    const s = CharSheet.cleanShare(share);
    const e = s && CharSheet.resolve(s);
    if (!e) return;
    const p = member(player);
    const entry = { ...e, player: p ? p.name : String(player).slice(0, 40), byDm: !!byDm };
    feed.unshift(entry);
    feed = feed.slice(0, 80);
    pop(entry);
    if (!els.panel.classList.contains('hidden')) drawPanel(); else { unread++; drawBadge(); }
    if (!byDm) publishToPlayers();
  }

  // What phones get: recent results, each phone filters to its own (server.js viewFor).
  const playerFeed = () => feed.filter(f => !f.byDm).slice(0, 40);

  const who = (e) => e.byDm ? `${e.player} · rolled by you` : e.player;
  function pop(e) {
    const card = h('div.feed-card' + (e.kind === 'card' ? '.is-card' : ''), { html: CharSheet.feedHtml(e, who(e)), onclick: () => { clearTimeout(card.t); card.classList.add('pinned'); } });
    card.append(h('button.feed-x', { title: 'Dismiss', onclick: (ev) => { ev.stopPropagation(); card.remove(); } }, '✕'));
    els.stack.prepend(card);
    [...els.stack.children].slice(5).forEach(x => x.remove());
    card.t = setTimeout(() => { card.classList.add('out'); setTimeout(() => card.remove(), 400); }, e.kind === 'card' ? 30000 : 15000);
  }

  function drawBadge() { els.badge.textContent = unread; els.badge.hidden = !unread; }
  function drawPanel() {
    els.list.innerHTML = '';
    if (!feed.length) els.list.append(h('p.dim', 'Nothing yet. When players roll or share something from their character sheet on their phone, it shows up here.'));
    feed.forEach(e => els.list.append(h('div.feed-row', h('div', { html: CharSheet.feedHtml(e, who(e)) }), h('span.dim.small', new Date(e.t).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })))));
  }
  function togglePanel() {
    els.panel.classList.toggle('hidden');
    if (!els.panel.classList.contains('hidden')) { unread = 0; drawBadge(); drawPanel(); }
  }

  // Open a party member's sheet in the DM app.
  function openSheet(p) {
    if (!p.name) return toast('Give the character a name first', 'err');
    const box = h('div.sheet-host');
    const m = U.modal(`📜 ${p.name}`, [h('p.dim.small', `Changes are saved and show up on ${p.player || p.name}'s phone. Rolls you make here stay on your screen.`), box],
      { onClose: () => { if (open) open.api.destroy(); open = null; } });
    box.closest('.modal').classList.add('sheet-modal');
    const api = CharSheet.mount(box, {
      model: modelOf(p), live: liveOf(p), mode: 'dm', toast: (t) => toast(t),
      onChange: (model) => apply(p, model),
      onShare: (sh) => { handle(p.name, sh, true); return Promise.resolve(true); },
    });
    open = { p, api, modal: m };
  }

  // Keep an open sheet in step with initiative (HP, conditions) and Settings.
  function refreshOpen() {
    if (!open) return;
    if (!party().includes(open.p)) { open.modal.close(); return; }
    open.api.set(modelOf(open.p), liveOf(open.p));
  }

  // HP changed in the tracker carries over to the sheet, so it's still right after the fight.
  function syncFromCombat() {
    for (const c of Store.get().initiative.combatants) {
      if (c.kind !== 'pc' || c.hp == null) continue;
      const p = member(c.name);
      if (!p || !p.sheet) continue;
      const max = numbers(p).maxHp;
      p.sheet.curHp = max != null && c.hp >= max ? null : c.hp;
    }
  }
  // AC, max HP and initiative for the tracker: worked out from the sheet when it has one (its Auto numbers).
  function numbers(p) {
    const m = p.sheet ? CharSheet.applyAuto(CharSheet.clean(modelOf(p))) : { ac: Number(p.ac) || null, hp: Number(p.hp) || null, initBonus: Number(p.initBonus) || 0 };
    const cur = p.sheet && p.sheet.curHp != null ? p.sheet.curHp : m.hp;
    return { ac: m.ac || null, maxHp: m.hp || null, hp: cur ?? null, initBonus: m.initBonus || 0 };
  }

  function mount() {
    els.stack = h('div.feed-stack');
    els.badge = h('span.feed-badge', { hidden: true });
    els.fab = h('button.feed-fab', { title: 'Player feed: rolls and cards players send from their phones', onclick: togglePanel }, '📣', els.badge);
    els.list = h('div.feed-list');
    els.panel = h('div.feed-panel.hidden',
      h('div.row', h('h3', '📣 Player feed'), h('span.grow'), h('button.icon', { title: 'Clear', onclick: () => { feed = []; drawPanel(); publishToPlayers(); } }, '🧹'), h('button.icon', { onclick: togglePanel }, '✕')),
      els.list);
    document.body.append(els.stack, els.panel, els.fab);
    dm.onPlayerAction(playerAction);
  }

  return { mount, open: openSheet, playerFeed, refreshOpen, syncFromCombat, numbers };
})();
