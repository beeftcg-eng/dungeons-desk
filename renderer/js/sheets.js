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
    else if (a.type === 'offer') offer(a);
  }

  // A player sent a character file from their phone (POST /api/offer). Nothing changes until the DM accepts it.
  // It stays out of what phones get (local), since it carries the whole sheet.
  function offer(a) {
    let model;
    try { model = CharSheet.applyAuto(CharSheet.clean(a.model)); } catch { return; }
    const name = String(a.player).slice(0, 40), p = member(name);
    const entry = { id: U.uid(), t: Date.now(), kind: 'card', local: true, player: name, title: `${name} sent a character sheet`,
      sub: [a.name && a.name !== name ? `“${a.name}”` : '', model.cls ? `Level ${model.level} ${model.cls}` : '', p ? 'replaces their current sheet' : 'not in the party yet'].filter(Boolean).join(' · '),
      body: '', offer: model };
    feed.unshift(entry);
    feed = feed.slice(0, 80);
    pop(entry);
    if (!els.panel.classList.contains('hidden')) drawPanel(); else { unread++; drawBadge(); }
  }
  function acceptOffer(e) {
    let p = member(e.player);
    if (!p) { p = { name: e.player, player: '', token: null }; party().push(p); }
    apply(p, e.offer);
    if (open && open.p === p) open.api.set(modelOf(p), liveOf(p));
    e.done = 'Added'; delete e.offer;
    redrawEntry(e);
    toast(`${p.name}'s sheet is in the party`);
  }

  // Roll (or pass on) one share and add it to the feed.
  function handle(player, share, byDm) {
    const s = CharSheet.cleanShare(share);
    const e = s && CharSheet.resolve(s);
    if (!e) return;
    const p = member(player);
    const entry = { ...e, player: p ? p.name : String(player).slice(0, 40), byDm: !!byDm };
    // Some shares also update the turn order.
    if (e.tag === 'init' && e.kind === 'roll' && Initiative.playerInit(entry.player, e.total)) entry.note = 'Filled in the turn order';
    if (e.tag === 'death' && e.kind === 'roll' && Initiative.playerDeathSave(entry.player, e.total)) entry.note = 'Marked in the tracker';
    if ((e.tag === 'conc' || e.tag === 'conc-end') && Initiative.playerConcentration(entry.player, e.tag === 'conc')) entry.note = e.tag === 'conc' ? 'Marked Concentrating in the tracker' : 'Concentrating removed in the tracker';
    feed.unshift(entry);
    feed = feed.slice(0, 80);
    pop(entry);
    if (!els.panel.classList.contains('hidden')) drawPanel(); else { unread++; drawBadge(); }
    if (!byDm) publishToPlayers();
  }

  // Homebrew spells and items whose notes are shared with players (share: players, or a list of names) show up in
  // their character sheet searches. DM-only parts of the note (secret callouts, %% comments %%) are left out.
  let hbSig = '', hbCache = { spells: [], items: [] };
  const playerText = (t) => String(t || '').replace(/%%[\s\S]*?%%/g, '').replace(/^> ?\[!secret\][^\n]*\n(>.*\n?)*/gim, '').trim();
  function playerHomebrew() {
    if (!window.Homebrew || !window.Notes) return hbCache;
    // Settings → Party → "Players get all my homebrew": every spell and item goes to everyone, except notes whose
    // share: names particular players, which keep that list.
    const all = !!(Store.get().playerView || {}).allHomebrew;
    const sig = all + '|' + Notes.list().map(n => n.path + n.mtime).join('|');
    if (sig === hbSig) return hbCache;
    const hb = Homebrew.list(), cache = Notes.notesCache(), to = (path) => Notes.shareOf(cache.get(path)) || (all ? 'all' : null);
    hbCache = {
      spells: hb.spells.filter(x => to(x.path)).map(x => ({ name: x.name, level: x.level, school: x.school, time: x.time, range: x.range, comp: x.comp, dur: x.dur,
        conc: x.conc || undefined, ritual: x.ritual || undefined, classes: x.classes, desc: playerText(x.desc), homebrew: true, to: to(x.path) })),
      items: hb.items.filter(x => to(x.path)).map(x => ({ name: x.name, rarity: x.rarity, type: x.type, desc: playerText(x.desc), homebrew: true, to: to(x.path) })),
      feats: hb.feats.filter(x => to(x.path)).map(x => ({ name: x.name, type: x.type, prereq: x.prereq || undefined, desc: playerText(x.desc), homebrew: true, to: to(x.path) })),
      backgrounds: hb.backgrounds.filter(x => to(x.path)).map(x => ({ name: x.name, abilities: x.abilities, feat: x.feat, skills: x.skills, tools: x.tools, equipment: x.equipment, desc: playerText(x.desc), homebrew: true, to: to(x.path) })),
      subclasses: hb.subclasses.filter(x => to(x.path)).map(x => ({ name: x.name, cls: x.cls, summary: x.summary, features: x.features.map(f => ({ name: f.name, level: f.level, desc: playerText(f.desc) })), homebrew: true, to: to(x.path) })),
    };
    hbSig = sig;
    return hbCache;
  }
  // The DM's own sheet view knows all the campaign's homebrew, shared or not.
  function allHomebrew() {
    if (!window.Homebrew) return { spells: [], items: [] };
    const hb = Homebrew.list(), mark = (list) => list.map(x => ({ ...x, homebrew: true }));
    return { spells: mark(hb.spells), items: mark(hb.items), feats: mark(hb.feats), backgrounds: mark(hb.backgrounds), subclasses: mark(hb.subclasses) };
  }

  // What phones get: recent results, each phone filters to its own (server.js viewFor).
  const playerFeed = () => feed.filter(f => !f.byDm && !f.local).slice(0, 40);

  const who = (e) => e.byDm ? `${e.player} · rolled by you` : e.player;
  // Reported damage or healing gets an Apply button; applying it goes through the initiative tracker.
  function entryBody(e) {
    const box = h('div', { html: CharSheet.feedHtml(e, who(e)) });
    if (e.kind === 'hp' && !e.applied) box.append(h('button.small.primary', { onclick: (ev) => {
      ev.stopPropagation();
      if (!Initiative.playerHp(e.player, e.amount, e.heal)) return toast(`${e.player} isn't in the turn order with HP set`, 'err');
      e.applied = true; publishToPlayers(); redrawEntry(e);
    } }, e.heal ? `Apply: +${e.amount} HP` : `Apply: −${e.amount} HP`));
    if (e.offer) box.append(h('div.row',
      h('button.small.primary', { onclick: (ev) => { ev.stopPropagation(); acceptOffer(e); } }, member(e.player) ? '✓ Use this sheet' : '➕ Add to party'),
      h('button.small', { onclick: (ev) => { ev.stopPropagation(); e.done = 'Declined'; delete e.offer; redrawEntry(e); } }, 'Decline')));
    if (e.done) box.append(h('div.dim.small', e.done));
    return box;
  }
  function redrawEntry(e) {
    U.$$('.feed-card').filter(c => c.feedEntry === e).forEach(c => { c.firstChild.replaceWith(entryBody(e)); });
    if (!els.panel.classList.contains('hidden')) drawPanel();
  }
  function pop(e) {
    const card = h('div.feed-card' + (e.kind === 'card' ? '.is-card' : ''), { onclick: () => { clearTimeout(card.t); card.classList.add('pinned'); } }, entryBody(e));
    card.feedEntry = e;
    card.append(h('button.feed-x', { title: 'Dismiss', onclick: (ev) => { ev.stopPropagation(); card.remove(); } }, '✕'));
    els.stack.prepend(card);
    [...els.stack.children].slice(5).forEach(x => x.remove());
    // Damage reports and character offers wait until they're dealt with or dismissed.
    if (e.kind !== 'hp' && !e.offer) card.t = setTimeout(() => { card.classList.add('out'); setTimeout(() => card.remove(), 400); }, e.kind === 'card' ? 30000 : 15000);
  }

  function drawBadge() { els.badge.textContent = unread; els.badge.hidden = !unread; }
  function drawPanel() {
    els.list.innerHTML = '';
    if (!feed.length) els.list.append(h('p.dim', 'Nothing yet. When players roll or share something from their character sheet on their phone, it shows up here.'));
    feed.forEach(e => els.list.append(h('div.feed-row', entryBody(e), h('span.dim.small', new Date(e.t).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })))));
  }
  function togglePanel() {
    els.panel.classList.toggle('hidden');
    if (!els.panel.classList.contains('hidden')) { unread = 0; drawBadge(); drawPanel(); }
  }

  // Open a party member's sheet in the DM app.
  function openSheet(p) {
    if (!p.name) return toast('Give the character a name first', 'err');
    CharSheet.setHomebrew(allHomebrew());
    const box = h('div.sheet-host');
    const print = async (mode) => dm.print.html(await CharSheet.printable(modelOf(p)), mode, `${p.name} character sheet.pdf`).then(r => { if (r && mode === 'pdf') toast('Saved ' + r); });
    const m = U.modal(`📜 ${p.name}`, [h('div.row', h('p.dim.small.grow', `Changes are saved and show up on ${p.player || p.name}'s phone. Rolls you make here stay on your screen.`),
      h('button.small', { onclick: () => print('print') }, '🖨 Print'), dm.isWeb ? null : h('button.small', { onclick: () => print('pdf') }, '📄 Save as PDF'),
      h('button.small', { title: 'Replace this sheet with a character file (.ddchar.json) or a character sheet PDF (D&D Beyond, the official fillable sheet, or printed from Dungeons Desk)', onclick: () => importInto(p) }, '⇩ Import'),
      h('button.small', { title: 'Save this sheet as a character file the player can open in the phone character sheet', onclick: () => exportSheet(p) }, '⇧ Export'),
      h('button.small', { title: 'Copy a link that opens this character in the phone character sheet app (handy for pre-made characters)', onclick: () => copyLink(p) }, '🔗 Link')), box],
      { onClose: () => { if (open) open.api.destroy(); open = null; } });
    box.closest('.modal').classList.add('sheet-modal');
    const api = CharSheet.mount(box, {
      model: modelOf(p), live: liveOf(p), mode: 'dm', toast: (t) => toast(t),
      onChange: (model) => apply(p, model),
      onShare: (sh) => { handle(p.name, sh, true); return Promise.resolve(true); },
    });
    open = { p, api, modal: m };
  }

  // ---------- Character files (CharSheet.toFile / fromFile) and PDFs (shared/pdf-char.js) ----------
  async function readCharFile() {
    const f = await U.pickFile(CharSheet.FILE_TYPES);
    if (!f) return null;
    try { return await CharSheet.readFile(f); } catch (e) { toast(e.message, 'err'); return null; }
  }
  // A fillable PDF only holds what its boxes said, so say what to look over.
  const pdfNote = (c) => c.from === 'form' ? ' from the PDF. Check its gear, spells and features: a PDF doesn\'t hold everything' : '';
  function exportSheet(p) {
    U.download(new Blob([JSON.stringify(CharSheet.toFile(modelOf(p)))], { type: 'application/json' }), CharSheet.fileName(p.name));
  }
  async function copyLink(p) {
    try { U.copy(await CharSheet.toLink(modelOf(p))); } catch { toast('Couldn\'t make a link. Use ⇧ Export instead.', 'err'); }
  }
  async function importInto(p) {
    const c = await readCharFile();
    if (!c) return;
    if (!await U.confirm('Replace sheet', `Replace ${p.name}'s sheet with ${c.name ? `“${c.name}”` : 'the one in this file'}? The name, player and token stay as they are.`)) return;
    apply(p, c.model);
    if (open && open.p === p) open.api.set(modelOf(p), liveOf(p));
    toast('Sheet imported' + pdfNote(c));
  }
  // Settings → "Add from a file or PDF": a new party member from a player's character file or sheet PDF.
  async function importNew() {
    const c = await readCharFile();
    if (!c) return false;
    let name = c.name || 'New character', i = 2;
    while (member(name)) name = `${c.name || 'New character'} ${i++}`;
    const p = { name, player: '', token: null };
    party().push(p);
    apply(p, c.model);
    toast(`Added ${name} to the party${pdfNote(c)}`);
    return true;
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

  return { mount, open: openSheet, importNew, playerAction, playerFeed, playerHomebrew, refreshOpen, syncFromCombat, numbers };
})();
