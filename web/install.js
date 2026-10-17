// Installing the phone apps and keeping their data, for the start page, dm/ and sheet/.
// Chrome on Android offers its own install prompt (beforeinstallprompt), and getInstalledRelatedApps() says when
// this app is already installed (Android keeps it in the app list even after its home-screen icon is removed, and
// then only offers a shortcut). iPhones install only through Share → Add to Home Screen, and Safari can clear a
// website's storage after about a week without a visit unless it's on the Home Screen, so it's worth saying.
window.Install = (() => {
  let deferred = null, installedNow = false;
  const listeners = new Set();
  const notify = () => listeners.forEach(f => { try { f(); } catch { /* a listener's problem */ } });
  window.addEventListener('beforeinstallprompt', (e) => { e.preventDefault(); deferred = e; notify(); });
  window.addEventListener('appinstalled', () => { deferred = null; installedNow = true; notify(); });

  const standalone = () => matchMedia('(display-mode: standalone)').matches || navigator.standalone === true;
  const ios = () => /iPhone|iPad|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  async function installed() {
    if (installedNow) return true;
    if (!navigator.getInstalledRelatedApps) return false;
    try { return (await navigator.getInstalledRelatedApps()).length > 0; } catch { return false; }
  }
  async function prompt() {
    if (!deferred) return false;
    const e = deferred;
    deferred = null;
    e.prompt();
    const r = await e.userChoice.catch(() => null);
    notify();
    return !!r && r.outcome === 'accepted';
  }
  // Asks the browser not to clear this site's storage when space runs low. Installed apps usually get it.
  async function persist() {
    try { return !!navigator.storage && !!navigator.storage.persist && ((await navigator.storage.persisted()) || await navigator.storage.persist()); }
    catch { return false; }
  }

  // 'app' (running installed), 'prompt' (an Install button works), 'installed' (open it from the app list),
  // 'ios' (Share → Add to Home Screen) or 'menu' (the browser's own menu).
  async function state() {
    if (standalone()) return 'app';
    if (deferred) return 'prompt';
    if (await installed()) return 'installed';
    return ios() ? 'ios' : 'menu';
  }

  // A card for the page, or null when there's nothing to say. `app` names the hide key, `short` is the name
  // on the home screen, `what` is what's at stake ("your characters"). Plain DOM, styled by each page's .card.
  async function card({ app, short, what, cls = 'card' }) {
    const key = 'dd.install.hide.' + app;
    let st = await state();
    if (st === 'app') return null;
    try { if (Number(localStorage.getItem(key) || 0) > Date.now()) return null; } catch { /* storage blocked */ }
    const el = document.createElement('div');
    el.className = cls + ' install-card';
    const draw = async () => {
      st = await state();
      if (st === 'app') { el.hidden = true; return el.remove(); }
      const text = {
        prompt: `Install ${short} to open it from your home screen, full screen and offline. The phone also keeps ${what} more safely.`,
        installed: `${short} is already installed on this phone. Open it from your app list (Android keeps installed apps there even after the home-screen icon is removed).`,
        ios: `Tap Share ⎙, then “Add to Home Screen”. Until you do, Safari may clear ${what} after about a week without opening this page.`,
        menu: `Use your browser's menu ⋮ → “Install app” or “Add to Home screen”. If it says it's already installed, open ${short} from your app list.`,
      }[st];
      el.innerHTML = '';
      const h3 = document.createElement('h3');
      h3.textContent = st === 'installed' ? '📲 Already installed' : '📲 Install the app';
      const p = document.createElement('p');
      p.className = 'hint';
      p.textContent = text;
      const row = document.createElement('div');
      row.className = 'row';
      if (st === 'prompt') {
        const b = document.createElement('button');
        b.className = 'btn primary';
        b.textContent = 'Install';
        b.onclick = () => prompt().then(draw);
        row.append(b);
      }
      const later = document.createElement('button');
      later.className = 'btn';
      later.textContent = 'Not now';
      later.onclick = () => { try { localStorage.setItem(key, Date.now() + 30 * 86400000); } catch { /* storage blocked */ } el.hidden = true; el.remove(); };
      row.append(later);
      el.append(h3, p, row);
    };
    await draw();
    listeners.add(() => { if (el.isConnected) draw(); });
    return el;
  }

  persist();
  return { standalone, ios, installed, prompt, persist, state, card, onChange: (f) => listeners.add(f) };
})();
