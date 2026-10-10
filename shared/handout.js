// Renders a handout card. Shared by the DM app and the players' phone page.
(function () {
  const esc = (s) => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  window.HANDOUT_STYLES = {
    parchment: 'Aged parchment', letter: 'Folded letter', journal: 'Journal page', torn: 'Torn scrap', wanted: 'Wanted poster',
    decree: 'Royal decree', blood: 'Bloodstained note', arcane: 'Arcane scroll', plain: 'Plain card',
  };
  window.HANDOUT_FONTS = {
    hand: 'Handwritten', scrawl: 'Hasty scrawl', book: 'Old book', type: 'Typewriter', gothic: 'Blackletter', formal: 'Formal', serif: 'Plain serif',
  };
  // h: { title, style, font, bodyHtml, imageUrl, seal, signature }
  window.renderHandout = function (h) {
    return `<div class="handout ho-${esc(h.style || 'parchment')} hf-${esc(h.font || 'hand')}">
      ${h.title ? `<div class="ho-title">${esc(h.title)}</div>` : ''}
      ${h.imageUrl ? `<img class="ho-img" src="${esc(h.imageUrl)}" alt="">` : ''}
      <div class="ho-body">${h.bodyHtml || ''}</div>
      ${h.signature ? `<div class="ho-sig">${esc(h.signature)}</div>` : ''}
      ${h.seal ? `<div class="ho-seal"><span>${esc(h.seal).slice(0, 2)}</span></div>` : ''}
    </div>`;
  };
})();
