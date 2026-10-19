// The players' page (player/index.html) at an online table: built into the phone app as play/, it talks to the
// DM's table in the cloud (shared/cloud.js → Pawmodoro's dmdesk_table_* functions, no account needed) instead of the
// desktop app's server on the Wi-Fi. Same methods as the page's `lan`. The table's code is in the link (?t=…).
// The DM app publishes a view per player; this page asks for it every 1.5 seconds and only gets it when it changed.
// Private notes are kept on the phone. A player who is signed in (a Pawmodoro account: the same one the sheet app
// uses, so signing in there signs in here) also has them in their account, in a hidden campaign of files
// (NOTES_ID, like the DM app's homebrew library), one file per table and name. No DM can read them.
window.TableNet = {
  make(get) {
    const POLL = 1500;
    const NOTES_ID = 'dd-player-notes', NOTES_NAME = '★ Player notes (online tables)';
    const who = () => get().code + '.' + (get().me || '').toLowerCase();
    const notesKey = () => 'dm.table.notes.' + who();
    const syncKey = () => 'dm.table.notesync.' + who();      // {user, rev, hash}: the version last in the account
    const path = () => `Notes/${get().code}/${(get().me || '').toLowerCase().replace(/[^a-z0-9 _-]/g, '') || 'player'}.md`;
    const local = () => { try { return localStorage.getItem(notesKey()) || ''; } catch { return ''; } };
    const hash = (t) => { let x = 5381; for (let i = 0; i < t.length; i++) x = (x * 33 + t.charCodeAt(i)) | 0; return String(x >>> 0) + ':' + t.length; };
    const synced = () => { try { const v = JSON.parse(localStorage.getItem(syncKey()) || 'null'); return v && Cloud.user() && v.user === Cloud.user().id ? v : { rev: 0, hash: null }; } catch { return { rev: 0, hash: null }; } };
    const setSynced = (rev, text) => { try { localStorage.setItem(syncKey(), JSON.stringify({ user: Cloud.user().id, rev, hash: hash(text) })); } catch { /* full */ } };
    // Changed on two phones: every session from both. Sessions only the other phone has go on top (notes are newest
    // first), and one with the same title but other words follows this phone's as a copy.
    function merge(mine, theirs) {
      const P = window.SessionNotes, a = P.parse(mine), b = P.parse(theirs), other = new Map(b.map(x => [x.title, x.body]));
      return P.serialize([...b.filter(x => !a.some(y => y.title === x.title)),
        ...a.flatMap(x => other.has(x.title) && other.get(x.title) !== x.body ? [x, { title: `${x.title} (other phone)`, body: other.get(x.title) }] : [x])]);
    }
    let created = false;
    async function pullRow() {
      if (!created) { await Cloud.rpc('dmdesk_save_campaign', { p_id: NOTES_ID, p_name: NOTES_NAME }); created = true; }
      const r = await Cloud.rpc('dmdesk_pull_files', { p_campaign: NOTES_ID, p_since: 0 });
      if (!r.exists) { created = false; return null; }
      return r.rows.find(x => x.path === path() && !x.deleted) || null;
    }
    async function push(text, baseRev) {
      let res = await Cloud.rpc('dmdesk_put_file', { p_campaign: NOTES_ID, p_path: path(), p_content: text, p_base_rev: baseRev });
      if (!res.ok) {                                            // changed on another phone since: merge and try again
        const row = await pullRow(), merged = row ? merge(text, row.content) : text;
        res = await Cloud.rpc('dmdesk_put_file', { p_campaign: NOTES_ID, p_path: path(), p_content: merged, p_base_rev: row ? row.rev : res.rev });
        if (res.ok && merged !== text) { localStorage.setItem(notesKey(), merged); text = merged; }
      }
      if (res.ok) setSynced(res.rev, text);
      return text;
    }
    // This phone's notes and the account's, whichever changed (both: merged).
    async function fromAccount() {
      const mine = local(), st = synced(), row = await pullRow();
      const here = hash(mine) !== st.hash && mine.trim(), there = row && row.rev !== st.rev;
      let text = mine;
      if (row && there && !here) text = row.content;
      else if (row && there && here && row.content !== mine) text = merge(mine, row.content);
      if (text !== mine) localStorage.setItem(notesKey(), text);
      if (!row || text !== row.content) text = await push(text, row ? row.rev : 0);
      else setSynced(row.rev, text);
      return text;
    }
    let pushTimer = null;
    return {
      param: 't', key: 'dm.table', clean: (c) => String(c || '').toLowerCase().replace(/[^a-z0-9]/g, '').slice(0, 20),
      unreachable: 'Can\'t reach the game. Check your internet connection.',
      codePrompt: 'Open the link the DM sent you, or type the code at the end of it (after t=).', codePlaceholder: 'Code', codeMax: 20, numeric: false,
      async check(c) {
        try { return (await Cloud.anonRpc('dmdesk_table_join', { p_code: c, p_player: '' })).ok ? 'ok' : 'bad'; }
        catch (e) { return e.code === 'offline' ? 'offline' : 'bad'; }
      },
      connect(cb) {
        const { code, me } = get();
        let rev = null, stopped = false, timer = null, busy = false, joined = !me;
        const tick = async () => {
          clearTimeout(timer);
          if (stopped || busy) return;
          busy = true;
          try {
            if (!document.hidden) {
              // Joining with a name tells the DM app to make this player's view.
              if (!joined) { const j = await Cloud.anonRpc('dmdesk_table_join', { p_code: code, p_player: me }); if (!j.ok) { busy = false; return cb.badCode(); } joined = true; }
              const r = await Cloud.anonRpc('dmdesk_table_view', { p_code: code, p_player: me || '', p_rev: rev });
              if (!r.ok) { busy = false; return cb.badCode(); }
              cb.state(true);
              if (r.view) { rev = r.rev; cb.data(r.view); }
            }
          } catch { cb.state(false); }
          busy = false;
          if (!stopped) timer = setTimeout(tick, POLL);
        };
        const wake = () => { if (!document.hidden) tick(); };
        document.addEventListener('visibilitychange', wake);
        tick();
        return { close: () => { stopped = true; clearTimeout(timer); document.removeEventListener('visibilitychange', wake); } };
      },
      act: (type, body) => Cloud.anonRpc('dmdesk_table_act', { p_code: get().code, p_player: get().me || '', p_type: type, p_data: body })
        .then(r => ({ ok: !!r.ok, status: r.ok ? 204 : r.slow ? 429 : 410 }), () => ({ ok: false, status: 0 })),
      // There's no DM computer to keep them, so private notes stay on this phone, and in the player's account if signed in.
      get notesWhere() { const u = Cloud.user(); return u ? `They're saved on this phone and in your account (${u.email}).` : 'They\'re saved on this phone.'; },
      notesGet: async () => { if (!Cloud.user()) return local(); try { return await fromAccount(); } catch { return local(); } },
      notesSet: async (text) => {
        localStorage.setItem(notesKey(), text);
        clearTimeout(pushTimer);
        if (Cloud.user()) pushTimer = setTimeout(() => push(text, synced().rev).catch(() => {}), 2500);
      },
      // Under the notes: signing in to keep them in an account. onChange() loads the notes again.
      NOTES_ID,
      notesAccount(el, onChange) {
        const esc = (x) => String(x ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
        const draw = () => {
          const u = Cloud.user();
          el.innerHTML = u ? `<div class="card"><b>☁ In your account</b><p class="nhint">Signed in as ${esc(u.email)}. Your notes for this game are on any phone you sign in on.</p><div class="nbtns"><button class="btn" data-acct="out">Sign out</button></div></div>`
            : `<div class="card"><b>☁ Keep your notes in your account</b><p class="nhint">Notes here only live on this phone. Sign in and they follow you to any phone, and stay safe if this one is lost. It's a Pawmodoro account, the same as the character sheet app's; make one here if you don't have one.</p>
              <div class="acct"><input type="email" placeholder="Email" autocomplete="username"><input type="password" placeholder="Password" autocomplete="current-password"></div>
              <div class="nbtns"><button class="btn primary" data-acct="in">Sign in</button><button class="btn" data-acct="up">Create account</button></div><p class="nhint acct-msg"></p></div>`;
        };
        el.addEventListener('click', async (e) => {
          const a = e.target.dataset.acct; if (!a) return;
          if (a === 'out') { if (confirm('Sign out? Your notes stay on this phone. This also signs out the character sheet app on this phone.')) { Cloud.signOut(); draw(); onChange(); } return; }
          const [email, pass] = [...el.querySelectorAll('input')].map(i => i.value.trim()), msg = el.querySelector('.acct-msg');
          if (!email || !pass) { msg.textContent = 'Enter your email and a password.'; return; }
          msg.textContent = a === 'up' ? 'Creating your account…' : 'Signing in…';
          try { await (a === 'up' ? Cloud.signUp(email, pass) : Cloud.signIn(email, pass)); } catch (err) { msg.textContent = err.message; return; }
          draw(); onChange();
        });
        draw();
      },
    };
  },
};
