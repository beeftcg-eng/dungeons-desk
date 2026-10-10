// Markdown rendering with Obsidian-style extras:
// [[wikilinks]], ![[image embeds]], #tags, > [!callouts], YAML frontmatter, ```statblock blocks,
// clickable dice (2d6+3, attack bonuses) and condition tooltips.
// render(src, { forPlayers }) produces a player-safe version for the wiki on phones.
window.MD = (() => {
  const { esc } = U;
  let ctx = { resolve: () => true, players: null };

  const isImage = (p) => /\.(png|jpe?g|gif|webp|svg|avif|bmp)$/i.test(p);
  // Turn a vault-relative image path into a URL for the DM window or for phones.
  function imageUrl(rel) {
    rel = rel.replace(/^\/+/, '');
    if (ctx.players) { ctx.players.images.add(rel); return '/wiki-img/' + rel.split('/').map(encodeURIComponent).join('/'); }
    return 'vault://local/' + rel.split('/').map(encodeURIComponent).join('/');
  }
  // ![[name.png]] may give just a file name; find it anywhere in the vault like Obsidian does.
  let attachments = [];
  const findAttachment = (name) => {
    const n = name.toLowerCase();
    return attachments.find(a => a.toLowerCase() === n) || attachments.find(a => a.toLowerCase().endsWith('/' + n)) || name;
  };

  const md = new marked.Marked({ gfm: true, breaks: true });
  md.use({
    extensions: [
      {
        name: 'embed', level: 'inline',
        start: (src) => src.indexOf('![['),
        tokenizer(src) {
          const m = /^!\[\[([^\]|\n]+?)(?:\|([^\]\n]+))?\]\]/.exec(src);
          if (m) return { type: 'embed', raw: m[0], target: m[1].trim(), opt: (m[2] || '').trim() };
        },
        renderer(t) {
          if (!isImage(t.target)) return `<span class="dim">[embedded: ${esc(t.target)}]</span>`;
          const w = /^\d+$/.test(t.opt) ? ` style="width:${t.opt}px"` : '';
          return `<img class="note-img" src="${esc(imageUrl(findAttachment(t.target)))}" alt="${esc(t.opt && !w ? t.opt : t.target)}"${w}>`;
        },
      },
      {
        name: 'wikilink', level: 'inline',
        start: (src) => src.indexOf('[['),
        tokenizer(src) {
          const m = /^\[\[([^\]|\n]+?)(?:\|([^\]\n]+))?\]\]/.exec(src);
          if (m) return { type: 'wikilink', raw: m[0], target: m[1].trim(), label: (m[2] || m[1]).trim() };
        },
        renderer(t) {
          if (ctx.players) {
            const id = ctx.players.linkable(t.target);
            return id ? `<a class="wikilink" data-wiki="${esc(id)}">${esc(t.label)}</a>` : `<span>${esc(t.label)}</span>`;
          }
          return `<a class="wikilink${ctx.resolve(t.target) ? '' : ' missing'}" data-target="${esc(t.target)}">${esc(t.label)}</a>`;
        },
      },
      {
        name: 'tag', level: 'inline',
        start(src) { const m = /(^|\s)#[A-Za-z][\w/-]*/.exec(src); return m ? m.index + m[1].length : undefined; },
        tokenizer(src) {
          const m = /^#([A-Za-z][\w/-]*)/.exec(src);
          if (m) return { type: 'tag', raw: m[0], tag: m[1] };
        },
        renderer: (t) => `<a class="tag" data-tag="${esc(t.tag)}">#${esc(t.tag)}</a>`,
      },
    ],
    renderer: {
      code(code, lang) {
        if (typeof code === 'object') { lang = code.lang; code = code.text; }
        if ((lang || '').trim() === 'statblock') {
          try { return Statblock.render(Statblock.parse(code)); }
          catch (e) { return `<div class="statblock-error">Stat block error: ${esc(e.message)}</div>`; }
        }
        return `<pre><code>${esc(code)}</code></pre>`;
      },
      image(href, title, text) {
        if (typeof href === 'object') { title = href.title; text = href.text; href = href.href; }
        const src = /^(https?:|data:|vault:)/.test(href) ? href : imageUrl(decodeURI(href));
        return `<img class="note-img" src="${esc(src)}" alt="${esc(text || '')}"${title ? ` title="${esc(title)}"` : ''}>`;
      },
    },
  });

  function splitFrontmatter(src) {
    const m = /^---\s*\n([\s\S]*?)\n---\s*(\n|$)/.exec(src || '');
    if (!m) return { meta: null, body: src || '' };
    let meta = null;
    try { meta = jsyaml.load(m[1]); } catch { meta = { _error: 'Invalid frontmatter' }; }
    return { meta: meta && typeof meta === 'object' ? meta : null, body: src.slice(m[0].length) };
  }

  const CALLOUT_ICONS = { 'read-aloud': '📖', note: '📝', secret: '🔒', quote: '❝', warning: '⚠', tip: '💡', info: 'ℹ', danger: '☠', treasure: '💰' };

  function decorateCallouts(root) {
    root.querySelectorAll('blockquote').forEach(bq => {
      const p = bq.firstElementChild;
      if (!p || p.tagName !== 'P') return;
      const m = /^\[!([\w-]+)\]([+-]?)[ \t]*([^\n<]*)/.exec(p.innerHTML);
      if (!m) return;
      const type = m[1].toLowerCase();
      if (ctx.players && (type === 'secret' || type === 'dm')) { bq.remove(); return; }
      const title = m[3].trim() || (type === 'read-aloud' ? 'Read Aloud' : type[0].toUpperCase() + type.slice(1));
      p.innerHTML = p.innerHTML.slice(m[0].length).replace(/^\s*<br>\s*/, '');
      if (!p.innerHTML.trim()) p.remove();
      bq.classList.add('callout', 'callout-' + type);
      const head = document.createElement('div');
      head.className = 'callout-title';
      head.innerHTML = `<span>${CALLOUT_ICONS[type] || '▸'}</span> ${esc(title)}`;
      bq.prepend(head);
    });
  }

  // Make dice expressions clickable and explain conditions on hover.
  const DICE_RE = /\b(\d*d(?:4|6|8|10|12|20|100)(?:\s*[+−-]\s*\d+)?)\b/g;
  let condRe = null, condDesc = {};
  function conditionData() {
    if (condRe || !window.SRDREF) return;
    SRDREF.conditions.forEach(c => (condDesc[c.name.toLowerCase()] = c.desc.replace(/\*\*/g, '')));
    condRe = new RegExp(`\\b(${SRDREF.conditions.map(c => c.name).join('|')})\\b(?= condition)`, 'g');
  }
  const conditionText = (name) => { conditionData(); return condDesc[String(name).toLowerCase()] || ''; };

  function decorateText(root) {
    conditionData();
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, {
      acceptNode: (n) => n.parentElement.closest('code,pre,a,.roll,.cond-tip,textarea') ? NodeFilter.FILTER_REJECT : NodeFilter.FILTER_ACCEPT,
    });
    const nodes = [];
    while (walker.nextNode()) nodes.push(walker.currentNode);
    for (const node of nodes) {
      const text = node.nodeValue;
      DICE_RE.lastIndex = 0; if (condRe) condRe.lastIndex = 0;
      if (!DICE_RE.test(text) && !(condRe && condRe.test(text))) continue;
      let html = esc(text).replace(DICE_RE, (m) => `<span class="roll" data-roll="${m.replace(/\s|−/g, (c) => c === '−' ? '-' : '')}">${m}</span>`);
      if (condRe) html = html.replace(condRe, (m) => `<span class="cond-tip" title="${esc(condDesc[m.toLowerCase()])}">${m}</span>`);
      const span = document.createElement('span');
      span.innerHTML = html;
      node.replaceWith(...span.childNodes);
    }
    // Attack bonuses in stat blocks: "Attack Roll: +5" rolls a d20.
    root.querySelectorAll('.statblock em').forEach(em => {
      if (!/Attack(?: Roll)?:$/.test(em.textContent.trim())) return; // 2024 "Attack Roll: +5" and 2014 "Weapon Attack: +5 to hit"
      const next = em.nextSibling;
      if (!next || next.nodeType !== 3) return;
      const m = /^(\s*)([+−-]\d+)/.exec(next.nodeValue);
      if (!m) return;
      const bonus = m[2].replace('−', '-');
      const span = document.createElement('span');
      span.className = 'roll'; span.dataset.roll = `1d20${bonus}`; span.dataset.d20 = '1'; span.textContent = m[2];
      next.nodeValue = next.nodeValue.slice(m[0].length);
      em.after(m[1], span);
    });
  }

  const HIDDEN_PROPS = new Set(['share', 'secret', 'dm', 'dm_notes']);
  function metaBox(meta) {
    if (!meta) return '';
    let rows = Object.entries(meta).filter(([k, v]) => v !== null && v !== '' && !(Array.isArray(v) && !v.length));
    if (ctx.players) rows = rows.filter(([k]) => ['type', 'tags', 'species', 'occupation', 'location', 'region', 'population', 'world_date', 'era'].includes(k));
    if (!rows.length) return '';
    const fmt = (k, v) => k === 'tags'
      ? (Array.isArray(v) ? v : String(v).split(/[,\s]+/)).filter(Boolean).map(t => `<a class="tag" data-tag="${esc(t)}">#${esc(t)}</a>`).join(' ')
      : esc(Array.isArray(v) ? v.join(', ') : typeof v === 'object' ? JSON.stringify(v) : v);
    return `<div class="props">${rows.map(([k, v]) => `<div class="prop${HIDDEN_PROPS.has(k) ? ' prop-dm' : ''}"><span>${esc(k.replace(/_/g, ' '))}</span><b>${fmt(k, v)}</b></div>`).join('')}</div>`;
  }

  // opts.resolve(target) -> exists?  opts.forPlayers: { linkable(target) -> wiki id | null }
  function render(src, opts = {}) {
    if (opts.resolve) ctx.resolve = opts.resolve;
    ctx.players = opts.forPlayers ? { ...opts.forPlayers, images: new Set() } : null;
    let { meta, body } = splitFrontmatter(src);
    // %% Obsidian comments %% are never shown to players.
    if (ctx.players) body = body.replace(/%%[\s\S]*?%%/g, '');
    const div = document.createElement('div');
    div.innerHTML = metaBox(meta) + md.parse(body);
    decorateCallouts(div);
    if (!ctx.players) decorateText(div);
    div.querySelectorAll('a[href]').forEach(a => a.setAttribute('target', '_blank'));
    const images = ctx.players ? [...ctx.players.images] : [];
    ctx.players = null;
    if (opts.forPlayers) div.dataset.images = JSON.stringify(images);
    return div;
  }

  const simple = (src) => md.parse(src || '');
  const setAttachments = (list) => { attachments = list || []; };

  return { render, splitFrontmatter, simple, decorateText, setAttachments, conditionText };
})();
