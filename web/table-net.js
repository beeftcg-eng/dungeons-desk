// The players' page (player/index.html) at an online table: built into the phone app as play/, it talks to the
// DM's table in the cloud (shared/cloud.js → Pawmodoro's dmdesk_table_* functions, no account needed) instead of the
// desktop app's server on the Wi-Fi. Same methods as the page's `lan`. The table's code is in the link (?t=…).
// The DM app publishes a view per player; this page asks for it every 1.5 seconds and only gets it when it changed.
window.TableNet = {
  make(get) {
    const POLL = 1500;
    const notesKey = () => 'dm.table.notes.' + get().code + '.' + (get().me || '').toLowerCase();
    return {
      param: 't', key: 'dm.table', clean: (c) => String(c || '').toLowerCase().replace(/[^a-z0-9]/g, '').slice(0, 20),
      unreachable: 'Can\'t reach the game. Check your internet connection.', notesWhere: 'They\'re saved on this phone.',
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
      // There's no DM computer to keep them, so private notes stay on this phone.
      notesGet: async () => { try { return localStorage.getItem(notesKey()) || ''; } catch { return ''; } },
      notesSet: async (text) => { localStorage.setItem(notesKey(), text); },
    };
  },
};
