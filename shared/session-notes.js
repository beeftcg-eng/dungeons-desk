// Private session notes, used by the phone page's 📝 Notes tab (kept by the DM's computer, or on the phone at an
// online table) and the standalone sheet app (kept with each character). The notes are one text: each "## Title" line
// starts a session, newest first, and anything above the first heading becomes "Earlier notes".
// The pane is only redrawn when the notes load or a session is added or removed, never while the player types.
// opts: { load() → Promise<text>, save(text) → Promise, where: text saying where they're kept, fileName() → 'X notes.md' }
window.SessionNotes = (() => {
  const MAX = 200000;
  const esc = (s) => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const dayLabel = () => new Date().toLocaleDateString([], { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' });
  function parse(text) {
    const out = [];
    String(text || '').replace(/\r/g, '').split('\n').forEach(line => {
      const m = /^## (.*)$/.exec(line);
      if (m) out.push({ title: m[1].trim(), body: [] });
      else { if (!out.length) out.push({ title: 'Earlier notes', body: [] }); out[out.length - 1].body.push(line); }
    });
    return out.map(x => ({ title: x.title, body: x.body.join('\n').trim() })).filter(x => x.title !== 'Earlier notes' || x.body);
  }
  const serialize = (notes) => notes.map(x => `## ${x.title.trim() || 'Session'}\n${x.body}`).join('\n\n');

  function mount(el, opts) {
    let notes = [], state = 'loading', timer = null, gen = 0;
    el.classList.add('sn');
    const status = (t) => { const s = el.querySelector('.sn-saved'); if (s) s.textContent = t; };
    function save() {
      const text = serialize(notes);
      if (text.length > MAX) return status('Too long to save: delete an old session');
      status('Saving…');
      clearTimeout(timer);
      timer = setTimeout(() => { timer = null; Promise.resolve(opts.save(text)).then(() => status('Saved'), () => status('Not saved — reconnecting')); }, 700);
    }
    function load() {
      const my = ++gen;
      state = 'loading'; draw();
      Promise.resolve().then(opts.load).then(t => { if (my !== gen) return; notes = parse(t); state = 'ready'; draw(); }, () => { if (my === gen) { state = 'failed'; draw(); } });
    }
    function draw() {
      // Never let anyone type over notes that haven't arrived: saving would replace them.
      if (state !== 'ready') {
        el.innerHTML = state === 'failed' ? '<div class="sn-empty"><div class="sn-big">📝</div>Couldn\'t load your notes.<br><br><button class="cs-btn" data-n="retry">Try again</button></div>' : '<div class="sn-empty">Loading your notes…</div>';
        return;
      }
      const today = dayLabel(), hasToday = notes.length && notes[0].title.includes(today);
      el.innerHTML = `<div class="cs-card"><div class="sn-head"><b>📝 Session notes</b><span class="sn-saved"></span></div>
          <p class="cs-hint">Only you see these. ${esc(opts.where || '')}</p>
          <div class="sn-btns">${hasToday ? '' : '<button class="cs-btn primary" data-n="new">＋ Start today\'s notes</button>'}${notes.length ? '<button class="cs-btn" data-n="file">⬇ Save as a file</button>' : ''}</div></div>` +
        (notes.length ? notes.map((x, i) => `<details class="cs-card sn-sess" data-i="${i}"${i ? '' : ' open'}><summary><span class="sn-t">${esc(x.title)}</span><small>${esc(x.body.split('\n')[0])}</small></summary>
          <textarea class="sn-text" placeholder="Names, clues, loot, things to remember…">${esc(x.body)}</textarea>
          <div class="sn-btns"><button class="sn-link" data-n="rename">✏ Rename</button><button class="sn-link" data-n="del">🗑 Delete</button></div></details>`).join('')
          : '<div class="sn-empty"><div class="sn-big">🪶</div>No notes yet. Start today\'s and jot down names, clues and loot as you play.</div>');
    }
    function newSession() {
      const n = Math.max(0, ...notes.map(x => Number((/^Session (\d+)/.exec(x.title) || [])[1]) || 0)) + 1;
      notes.unshift({ title: `Session ${n} · ${dayLabel()}`, body: '' });
      draw(); save();
      el.querySelector('.sn-text').focus();
    }
    function download() {
      const a = Object.assign(document.createElement('a'), { href: URL.createObjectURL(new Blob([serialize(notes) + '\n'], { type: 'text/markdown' })), download: opts.fileName ? opts.fileName() : 'Notes.md' });
      document.body.append(a); a.click(); a.remove();
      setTimeout(() => URL.revokeObjectURL(a.href), 30000);
    }
    const onInput = (e) => {
      const box = e.target.closest('.sn-sess');
      if (!box || !e.target.classList.contains('sn-text')) return;
      const x = notes[box.dataset.i];
      x.body = e.target.value;
      box.querySelector('summary small').textContent = x.body.split('\n')[0];
      save();
    };
    const onClick = (e) => {
      const a = e.target.dataset.n, box = e.target.closest('.sn-sess');
      if (a === 'retry') load();
      else if (a === 'new') newSession();
      else if (a === 'file') download();
      else if (a === 'rename') {
        const x = notes[box.dataset.i], t = prompt('Name these notes', x.title);
        if (t && t.trim()) { x.title = t.replace(/\s+/g, ' ').trim().slice(0, 120); box.querySelector('.sn-t').textContent = x.title; save(); }
      } else if (a === 'del') {
        const i = Number(box.dataset.i);
        if (!confirm(`Delete "${notes[i].title}"? This can't be undone.`)) return;
        notes.splice(i, 1); draw(); save();
      }
    };
    el.addEventListener('input', onInput);
    el.addEventListener('click', onClick);
    load();
    return {
      // Load again (another player joined on this phone, say). A save still waiting is dropped, so flush() first.
      reload() { if (timer) { clearTimeout(timer); timer = null; } load(); },
      // Send a waiting save now (leaving the character).
      flush() { if (timer) { clearTimeout(timer); timer = null; opts.save(serialize(notes)); } },
      destroy() { this.flush(); gen++; el.removeEventListener('input', onInput); el.removeEventListener('click', onClick); el.innerHTML = ''; },
    };
  }
  return { mount, parse, serialize };
})();
