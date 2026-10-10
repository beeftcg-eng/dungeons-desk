// Color themes. Each theme sets the CSS variables in styles.css; light themes also set data-mode="light".
// The choice is a per-computer preference, so it lives in localStorage.
window.Themes = (() => {
  const T = {
    midnight: { name: 'Midnight', bg: '#17141f', bg2: '#1f1b29', panel: '#262134', panel2: '#2e283f', line: '#3b3450', text: '#e8e2f0', dim: '#9d94b3', accent: '#e0a458', accent2: '#c8873a', ink: '#1d1408' },
    dungeon: { name: 'Dungeon Stone', bg: '#151617', bg2: '#1c1d1f', panel: '#232528', panel2: '#2b2e32', line: '#3a3e44', text: '#e6e6e6', dim: '#9a9fa6', accent: '#d4a64a', accent2: '#b0862f', ink: '#1a1407' },
    forest: { name: 'Elven Forest', bg: '#111a14', bg2: '#16211a', panel: '#1c2a21', panel2: '#233428', line: '#2f4535', text: '#e2efe4', dim: '#93ab98', accent: '#8fd18a', accent2: '#68ad63', ink: '#0d1a0c' },
    crimson: { name: 'Crimson Keep', bg: '#1a1012', bg2: '#221417', panel: '#2b181c', panel2: '#351e23', line: '#4a2a31', text: '#f1e3e5', dim: '#b08f95', accent: '#ec6a5f', accent2: '#c44a40', ink: '#1f0907' },
    arcane: { name: 'Arcane Blue', bg: '#0f1424', bg2: '#141a2e', panel: '#1a2139', panel2: '#212a46', line: '#2f3a5e', text: '#e3e8f7', dim: '#929cc0', accent: '#8fb0ff', accent2: '#6a8ce6', ink: '#0b1430' },
    feywild: { name: 'Feywild', bg: '#181026', bg2: '#201533', panel: '#2a1c40', panel2: '#33234d', line: '#47325f', text: '#f2e8fb', dim: '#ad98c4', accent: '#f08fd0', accent2: '#cf6cb0', ink: '#2a0a20' },
    contrast: { name: 'High Contrast', bg: '#000000', bg2: '#0b0b0b', panel: '#121212', panel2: '#1c1c1c', line: '#6a6a6a', text: '#ffffff', dim: '#d0d0d0', accent: '#ffd400', accent2: '#e6bf00', ink: '#000000' },
    parchment: { name: 'Parchment (light)', light: true, bg: '#f2e8d2', bg2: '#e9dcc0', panel: '#fbf6ea', panel2: '#efe3c9', line: '#cdb98f', text: '#2b2116', dim: '#76664f', accent: '#8b2e16', accent2: '#6e2311', ink: '#ffffff' },
    frost: { name: 'Frost (light)', light: true, bg: '#eef3f8', bg2: '#e1e9f2', panel: '#ffffff', panel2: '#e8eef6', line: '#c3d0df', text: '#1d2633', dim: '#5b6a7c', accent: '#2f6db5', accent2: '#245894', ink: '#ffffff' },
  };
  const read = (k, d) => { try { return localStorage.getItem(k) ?? d; } catch { return d; } };
  const write = (k, v) => { try { v == null ? localStorage.removeItem(k) : localStorage.setItem(k, v); } catch { /* preference only */ } };

  function apply() {
    const t = T[read('theme', 'midnight')] || T.midnight;
    const accent = read('theme.accent', null);
    const r = document.documentElement.style;
    for (const k of ['bg', 'bg2', 'panel', 'panel2', 'line', 'text', 'dim']) r.setProperty('--' + k, t[k]);
    r.setProperty('--accent', accent || t.accent);
    r.setProperty('--accent2', accent ? `color-mix(in srgb, ${accent} 80%, black)` : t.accent2);
    r.setProperty('--accent-ink', accent ? (lum(accent) > 0.5 ? '#111' : '#fff') : t.ink);
    document.documentElement.dataset.mode = t.light ? 'light' : 'dark';
    document.documentElement.style.zoom = String(Number(read('theme.zoom', '1')) || 1);
  }
  function lum(hex) { const n = parseInt(hex.slice(1), 16); return (0.299 * (n >> 16) + 0.587 * ((n >> 8) & 255) + 0.114 * (n & 255)) / 255; }

  function set(key) { write('theme', key); write('theme.accent', null); apply(); }
  const setAccent = (c) => { write('theme.accent', c); apply(); };
  const setZoom = (z) => { write('theme.zoom', String(z)); apply(); };
  apply(); // as early as possible, before the UI draws
  return { list: T, current: () => read('theme', 'midnight'), accent: () => read('theme.accent', null), zoom: () => Number(read('theme.zoom', '1')) || 1, set, setAccent, setZoom };
})();
