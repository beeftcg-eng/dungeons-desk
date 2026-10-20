// "What's new": a short card shown once after an update, in the DM app (desktop and phone), the players' game page
// and the sheet app. Add an entry at the top of LOG for each release with something people would want to know,
// in plain words, split into what the DM sees (dm) and what players see (player).
// WhatsNew.take(who) gives the entries this device hasn't seen ([] if none) and remembers them as seen; a device
// that has never seen any gets only the newest. WhatsNew.html(entries, who) is the card's content.
window.WhatsNew = (() => {
  const LOG = [
    {
      v: '1.5.3',
      dm: [
        '🧱 <b>Walls, doors and line of sight</b>: a Dungeon Alchemist <code>.dd2vtt</code> file now brings its walls and doors. Fog clears only where player tokens can see, players can\'t walk through walls, and you click a door to open it. For maps you already have: 📐 Grid & walls from .dd2vtt.',
        '💾 Daily backups leave out animated map videos, so they stay small, and 🧹 Clean up images also removes map videos no map uses.',
      ],
      player: [
        '🧱 On maps with walls, you see only what your character can see, and walls and closed doors stop your token.',
      ],
    },
    {
      v: '1.5.2',
      dm: [
        '🎞️ <b>Animated maps</b>: add a Dungeon Alchemist video (MP4 or WebM) as a map, and pick its <code>.dd2vtt</code> file with it to set the grid exactly. Players on the same Wi-Fi see it move.',
      ],
      player: [
        '🎞️ Maps can be <b>animated</b> now. Tap ⏸ on the map to keep it still and save battery.',
      ],
    },
    {
      v: '1.5.1',
      dm: [
        '✔ <b>Spell checking</b> in English and Spanish at once: misspelled words are underlined, and right-click gives suggestions or adds a name to the dictionary. Choose the languages in ⚙ Settings → ✔ Spelling.',
      ],
    },
    {
      v: '1.5.0',
      dm: [
        '🎬 <b>Session screen</b>: 🛏 Short and 🌙 Long rests for the whole party, ☆ to give someone Heroic Inspiration, and ✨ XP & levels (prefilled with what the fight was worth, or a milestone level). Players\' phones show what happened.',
        '📜 <b>Last time…</b>: write a recap on the Session screen and it pops up on every player\'s phone.',
        '💰 <b>Loot → 🎁 Give to…</b> puts treasure straight onto players\' sheets.',
        '🎖 <b>Homebrew feats, backgrounds and subclasses</b>: make them, paste them or read them from a book PDF, and they\'re on players\' sheets.',
        '📕 <b>Book PDF</b>: ⚠ Next name to fix, with suggested names, to clean up a scanned book quickly.',
        '💾 Your homebrew library is now backed up daily too.',
      ],
      player: [
        '⬆ <b>Level up step by step</b>: on your sheet\'s Features tab, ⬆ Level up → ✨ Walk me through it.',
        '🔔 Your DM can now call rests, give you Heroic Inspiration, XP and treasure: your phone tells you, and your sheet updates itself.',
        '📜 <b>Last time…</b>: the DM\'s recap of the last session pops up, and you can copy it into your 📝 Notes.',
        '☁ Playing online? Sign in under 📝 Notes to keep your notes in your account.',
      ],
    },
  ];
  const KEY = (who) => 'dd.whatsnew.' + who;
  const newer = (a, b) => { const x = a.split('.').map(Number), y = b.split('.').map(Number); for (let i = 0; i < 3; i++) if ((x[i] || 0) !== (y[i] || 0)) return (x[i] || 0) > (y[i] || 0); return false; };
  function take(who) {
    let seen = null;
    try { seen = localStorage.getItem(KEY(who)); } catch { return []; }
    const list = LOG.filter(e => (e[who] || []).length && (!seen || newer(e.v, seen)));
    try { localStorage.setItem(KEY(who), LOG[0].v); } catch { /* private mode: shown again next time */ }
    return seen ? list : list.slice(0, 1);
  }
  // Without saying they're seen: a brand-new player's first-time tour covers it, so the card is skipped.
  const skip = (who) => { try { localStorage.setItem(KEY(who), LOG[0].v); } catch { /* fine */ } };
  const html = (entries, who) => entries.map(e => `<h3 class="wn-v">What's new in ${e.v}</h3><ul class="wn-list">${e[who].map(x => `<li>${x}</li>`).join('')}</ul>`).join('');
  return { LOG, take, skip, html };
})();
