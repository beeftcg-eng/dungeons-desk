# Dungeons Desk

An Electron desktop app for D&D 5e Dungeon Masters. Its tools are notes/wiki, an NPC and monster generator, initiative plus an encounter builder, battle maps with fog of war, a token maker, handouts, loot, a timeline and calendar, a rules reference, a dice roller and settings. Players' phones connect over the LAN for the turn order, handouts, a shared wiki, the map, and their own character page.

## Run

```bash
npm start            # electron . --no-sandbox
```

There is no build step, bundler or TypeScript. Edit the files and restart the app. Reloading the window (Ctrl+R) picks up renderer changes. Changes to `main.js` or `server.js` need a full restart.

## Layout

- `main.js`: main process. Holds the config (`~/.config/Dungeons Desk/config.json`: current vault, port, and the `campaigns` list of known vault folders), campaign create/open/rename, file access for the vault, all IPC handlers, and printing/PDF (renders HTML in a hidden window).
- `server.js`: `PlayerServer` on port 7777, falling back to the next free port. It serves `player/` and `shared/`, serves `<vault>/.dmtools/media/` at `/media/`, and pushes live state over **Server-Sent Events** at `/events?player=Name`. Every `/events` and `/api/*` request needs the six-digit **join code** (`?code=`, stored as `config.joinCode`, rotated by `server:newCode`); `authorized()` refuses everything else and throttles guessing. The QR code and the TV display URL carry the code. Phones are **read-only** apart from these exceptions:
  - `/api/notes?player=Name` (GET/POST): each player's private notes page, stored in `<vault>/.dmtools/players/`.
  - `POST /api/sheet` and `/api/share`: the player's own character sheet, and a roll or "show the DM" card. Both are forwarded via `player:action` to `Sheets.playerAction()` (`renderer/js/sheets.js`), which runs `CharSheet.clean()` / `cleanShare()` on them, saves the sheet onto the matching party member (never its name, player or token), and does the rolling itself. Results are published as `pub.feed`, and `viewFor()` gives each phone only its own entries. Rolls the DM makes from a sheet are `byDm` and never published.
  - `POST /api/offer`: a character file (`.ddchar.json`) from a player who isn't in the party yet. It's forwarded as a `player:action` of type `offer`, and `Sheets` shows it in the 📣 feed with ➕ Add to party / Decline. Nothing changes until the DM accepts. Offers are `local` feed entries, never published to phones. Limited to one per 5 seconds per player.
  - `POST /api/move`, `/api/ping` and `/api/token`: player map actions. The server only validates their shape and forwards them (via the `player:action` IPC) to `Maps.playerAction()`. That function is the security check: a player can only move a token whose `owner` matches their name, only when the map is shown and `playerMove` is on. Pings are rate-limited, and tokens are image-only with a 3 MB cap.

  Keep the list that short. `viewFor()` decides which handouts, wiki pages and character card each phone gets. `/wiki-img/` serves only images referenced by shared wiki pages (`pub.wikiImages`).
- `preload.js`: exposes `window.dm.*` (vault, notes, state, media, file, print, server). It is the only bridge between the renderer and Node.
- `renderer/`: the DM UI. Plain `<script>` tags loaded in a fixed order (see `index.html`), each defining one global module (`U`, `Store`, `MD`, `Statblock`, `Notes`, `Generators`, `Tokens`, `Handouts`, `Loot`, `Initiative`, `Settings`, `App`). **There are no ES modules**, because they don't load reliably from `file://`. Each view module exports `mount(root)` and can also export `onShow()`.
- `main.js` also handles:
  - **Per-note version history** in `.dmtools/history/<encoded path>/<ts>.md`. A snapshot is taken at most every 10 minutes on save, plus one before delete; 60 are kept.
  - **Daily backups** to `~/Documents/Dungeons Desk Backups/<campaign>/<date>/`, excluding history; 14 are kept.
  - **Note images** saved to `<vault>/Attachments/`.
  - **The `vault://local/<path>` protocol**, which shows vault images in the DM window only.
- `renderer/js/dice.js`: the floating roller (Ctrl+D). Any element with `.roll[data-roll]` is clickable: Shift = advantage, Ctrl/Alt = disadvantage. `MD.decorateText(el)` turns dice text and stat-block attack bonuses into `.roll` spans and adds condition tooltips.
- `renderer/js/rules.js` + `renderer/js/data/srd-ref.js`: the SRD reference (monsters, spells, items, conditions, rules). `srd-ref.js` is **generated** by `scripts/convert_srd.py` from 5e-bits/5e-database JSON (CC-BY-4.0, attribution in `SRDREF.attribution`). Don't edit it by hand.
- `renderer/js/initiative.js`: the tracker and the encounter builder (2024 XP budgets). All state changes go through `act(logText, fn)`, which records undo history and the combat log. Conditions are `{name, rounds}`; old string conditions are converted on read by `conds()`. Combatants added from stat blocks keep `c.sb`, which the "Now:" panel uses.
- `renderer/js/maps.js` + `shared/map-render.js`: battle maps. Fog is an ordered op list (reveal/hide rect/brush/all), drawn by the same code on the DM screen (55% fog) and on phones (opaque). Hidden tokens are never published.
  - Each map can also hold `drawings`, AoE `templates` (circle/cone/line/cube, sized in 5 ft steps by `templateShape`), live `rulers` (grid distance where every square is 5 ft, diagonals included) and `pings`.
  - Tokens have an `owner` (a party member's name). When an owned token moves, a fog-reveal swath `vision` squares wide is added.
  - Player tokens come from `party[].token`, which the player uploads from the phone's Me tab or the DM picks in Settings.
  - Pings carry the sender's time, so phones stamp their own `seen` time to cope with clock differences.
- **Character sheets**: `shared/charsheet.js` (`CharSheet.mount()`) is one component used by the phone's Me tab and the DM's sheet modal (Settings → 📜). A party member's model is `{name, cls, level, ac, hp, initBonus, sheet}`. The top-level fields are the same ones the Settings table uses, and `sheet.auto.{ac,hp,init,speed}` decides whether they're calculated (`applyAuto()`) or typed. Rules data is `shared/charsheet-data.js` (`CHARDATA`), **generated** by `scripts/convert_charsheet.py` from 5e-database's `src/2024/en/5e-SRD-*.json` (saved as `2024-<Name>.json`). Don't edit it by hand. Initiative's "Add the party" uses `Sheets.numbers(p)`, and `Sheets.syncFromCombat()` copies tracker HP back into `sheet.curHp`.
  - Multiclass: `model.level` is the **total** level and `sheet.multi` holds the extra classes (`classParts()`). The first class gets the remainder.
  - Shares can carry a `tag` (`init`, `death`, `conc`, `conc-end`), which `Sheets` routes to `Initiative.playerInit/playerDeathSave/playerConcentration`. `kind: 'hp'` reports wait in the feed for the DM to Apply (`Initiative.playerHp`).
  - Homebrew notes shared with `share:` reach phones as `pub.homebrew` (`Sheets.playerHomebrew()`, with secrets and `%%` comments stripped; filtered per player in `viewFor()`) and are merged into the lists with `CharSheet.setHomebrew()`.
  - `CharSheet.printHtml(model)` builds the printable sheet for `dm.print.html`.
- `renderer/js/session.js`: the **Session** view, one screen with the fight (turns, tap a row for damage or healing, the current creature's stat block), quick dice, the party, and notes pinned with 📌 in the note toolbar (`Store.get().session.pins`). It uses `Initiative.start/step/applyHp`, and `Initiative`'s `changed()` calls `Session.refresh()`.
- `renderer/js/timeline.js`: the in-world calendar (`Store.calendar`) and timeline. A note appears there if its frontmatter has `world_date:`, written as `1024`, `1024-3-15` or `15 Thawmonth 1024`.
- **Player wiki**: notes with `share: players` (or `share: [Name, …]`) in their frontmatter are rendered by `MD.render(src, { forPlayers })`, which strips `[!secret]` callouts and `%% comments %%`, unlinks unshared notes and rewrites image URLs. `Notes.playerWiki()` caches the result.
- **Relationships**: write `- [[Target]] — label` lines under a `## Relationships` heading. They are parsed by `Notes.relationsIn()`, colored by `relColor()`, and drawn in Graph → Relationship web.
- `renderer/js/homebrew.js`: campaign homebrew stored as notes. Monsters are any note with a stat block; spells and items are notes with `type: spell` / `type: item` frontmatter, in `Homebrew/…`. `Homebrew.list()` feeds Rules (★ entries, "My campaign" filter), the creature pickers and the loot generator.
- `renderer/js/importer.js`: three ways in:
  - **Paste-text parsers** for monster stat blocks (2014 and 2024 layouts), spells (including D&D Beyond's label/value layout) and items.
  - **Open5e search**, through the main process's `web:open5e` IPC, which is restricted to `api.open5e.com/v1/...`.
  - **JSON file import** (Open5e or 5e-database shape).

  D&D Beyond links are deliberately not fetched: there's no public API and its terms forbid scraping. Users paste the text instead. Parser fixtures can be unit-tested in Node by stubbing `U`.
- `renderer/js/campaigns.js`: the campaign picker (rail button + Settings). Switching saves pending work, tells main to change vault, then **reloads the window** so every module re-mounts on the new vault. New campaigns go to `~/Documents/Dungeons Desk Campaigns/<Name>/`, with an overview note, standard folders and `.dmtools/campaign.json` (display name). Example notes are only seeded on the very first run or when asked for, never into a folder the user opens.
- `renderer/js/macros.js`: editor macros. Typing `/` at the start of a line, pressing Alt+1…8, or clicking ＋ Insert runs them. Each macro is `{id, group, label, icon, hotkey?, run(ctx)}` and returns `{text}` (inserted), `{replaceAll}` (blank note gets the full template), or `null`. Format macros reuse `Templates`; when inserted into a non-empty note the frontmatter is dropped and headings are demoted one level. Add new macros here.
- `renderer/js/data/`: static data. `srd.js` has CR/XP/PB tables, creature-type flavor and conditions. `names.js` has NPC name and trait tables. `loot-data.js` has treasure tables and SRD magic items.
- `shared/`: code and CSS used by **both** the DM app and the phone page (`handout.js` → `renderHandout()`, `handout.css`, `statblock.css`, `charsheet.js` + `charsheet.css` + `charsheet-data.js`).
- `player/index.html`: the phone page, self-contained with inline CSS and JS.
- `seed/examples/`: sample campaign notes. `seed/guide/Guide/`: how-to notes, one per feature area (`0 Start Here` is opened first). Both are copied without overwriting: into a brand-new vault on first run, into a new campaign when its checkboxes are ticked, or on demand from Settings (`vault:addSeed`). **When you add or change a feature, update the matching guide note.**
- `build/`: icon sources (`icon.svg` → PNGs and `icon.ico` via `magick`). Also `buildResources` for electron-builder.
- `renderer/js/themes.js`: color themes. These are CSS variables set on `:root`, plus `data-mode="light"` for light themes, whose overrides live at the end of `styles.css`. When adding UI, use the variables (`--bg`, `--panel`, `--text`, `--accent`, `--accent-ink`, …) instead of hard-coded dark colors.
- `player/index.html` also contains the first-time **tour** (`TOUR` steps, `dm.tour.done` in localStorage). Update it when phone features change.

## Phone app (web/)

`scripts/build-web.js` builds a PWA into `dist-web/` (gitignored). `.github/workflows/deploy-pages.yml` deploys it to GitHub Pages (`https://beeftcg-eng.github.io/dungeons-desk/`) on every push to `main`, after `npm test`. Pages has to be set to "GitHub Actions" in the repo settings. There's no bundler: files are copied as they are, and only `dm/index.html` is rewritten (paths, CSP, manifest, and `web/dm-bridge.js` loaded first).
- `dist-web/dm/` is `renderer/` running in a browser. **`web/dm-bridge.js` is the browser's `window.dm`**: the same surface as `preload.js`, kept in IndexedDB (stores `campaigns`, `notes`, `blobs`, `history`, `state`, keyed by campaign id). It sets `dm.isWeb`, which renderer code checks to hide what a phone can't do (folders, LAN server, TV window, PDF button, updates). Images are blobs with object URLs made up front, because `App.mediaUrl()` and `MD`'s image URLs are synchronous (`dm.mediaUrl`, `dm.vaultUrl`). **When you add an IPC handler to `main.js`/`preload.js`, add the same method to `dm-bridge.js`**, even if it only answers harmlessly. The page's CSP blocks `fetch()` of `data:` and `blob:` URLs, so decode them by hand (`toBlob`).
- `dist-web/sheet/` is the standalone character sheet (`web/sheet.html` + `web/sheet.js`): `CharSheet.mount()` with `mode: 'solo'` (rolls are made on the phone with `resolve()`; cards and HP reports go nowhere). Characters live in localStorage `dd.sheet.chars` (`{id, name, model, created, updated, exported, rolls}`). It has a 🎲 Rolls log (`opts.onRoll`), a backup reminder once a character has changed and a week has passed since its last file or link, and share links. **Share links** (`CharSheet.toLink/fromLink`) put the deflated character file in `#c=…`, so nothing is uploaded. The sheet app opens them on load and on `hashchange`, and the DM's sheet window has 🔗 Link for pre-made characters. The sheet follows the phone's light/dark setting.
- **Portraits:** `sheet.portrait` is a ≤120 kB JPEG data URL (`portraitFrom()` crops to 320 px). `clean()` rejects anything else. Set it in ✏ Edit by tapping the picture spot in the header.
- The DM phone app reminds you to export a campaign that changed more than a week after its last export (`dm.campaigns.backupInfo()`, `Campaigns.remindBackup()`; "Later" waits 3 days).
- `web/index.html` is the start page, and `web/sw.js` the service worker. The build fills in its cache name (a hash of every file) and file list, so a new deploy reloads installed apps once (`web/sw-register.js`).
- **Phone layout** is the `@media (max-width: 760px)` block at the end of `styles.css`. The rail becomes a bottom tab bar showing the views with `data-m="1…4"` (Session, Notes, Initiative, Map, in that order) plus **More ⋯** (`App`'s `moreSheet()`, every view and Campaigns). Swiping right from the left edge clicks the open view's `.m-back`. two-column layouts stack, and list/detail views (Notes, Rules, Handouts) put `.m-detail` on their layout while an item is open, with `U.mBack(layout)` as the phone-only back button. The desktop window (min width 1000) never reaches it. New views with a sidebar need a line there.
- **Files that move between apps:** `.ddcampaign.json` (`{format: 'dungeons-desk-campaign', notes, folders, state, media, attachments}`, images as data URLs) from `campaigns:exportFile` / `campaigns:importFile` in `main.js` and the same in `dm-bridge.js`; `.ddchar.json` (`CharSheet.toFile()` / `fromFile()`) from the sheet app, the DM's sheet window (⇩ Import / ⇧ Export, Settings → Add from a character file) and the phone's Me tab.
- Smoke test: `npm run build:web`, then `SHOTS=… node_modules/electron/dist/electron --no-sandbox scripts/smoke-web.js`. It runs in a 390×844 window with fresh in-memory storage and takes `PAGE=dm|sheet|''`, `VIEWS`, `PRE`, `STEPS` and `EXTRA`, like `smoke.js`.

## Cloud sync

Optional, and signed in with a Pawmodoro account. The backend is the shared **Pawmodoro Supabase project**: the `dmdesk_*` tables and functions, the `dmdesk_seq` sequence and the private `dmdesk` bucket, all in `~/Desktop/pawmodoro/supabase/schema.sql`, with SQL tests in its `tests/sql/schema_tests.sql` (`PGHOST=… tests/sql/run.sh`). Pawmodoro's deploy workflow can't apply the schema (the repo has no `SUPABASE_DB_URL` secret). Apply a change with `supabase db query --linked --project-ref cinxclbsgamdprftcbek -f <file>` (the CLI is logged in here), and only the changed part, in a transaction. Ask before changing it: Pawmodoro, Brewhouse and Pairings users share that database.
- `shared/cloud.js` (`Cloud`): REST client with no SDK (auth, `rpc()`, `storage`). Its URL and anon key are the fifth copy of Pawmodoro's; keep them identical. The session is in localStorage `dd.cloud.session`. Both CSPs (`renderer/index.html`, `scripts/build-web.js`) allow the project's URL in `connect-src`.
- `web/sheet.js`: character sync. Every save conflict-checks against `rev`. A stale save gets the newer row back, and the phone's version becomes a "(this phone)" copy. Pulls are cursor-based on `seq` (`dd.sheet.since`).
- `renderer/js/cloud-sync.js` (`CloudSync`): campaign sync through `window.dm`, so the same engine runs on desktop and phone. The link (`dm.cloud.load/save`: `.dmtools/cloud.json` on desktop, the campaign record on the phone) keeps each file's synced `rev` and `hash`. Notes changed on both sides keep this device's version plus an "(other device …)" copy. `state.json` is merged per top-level key against `link.base` and applied with `Store.replace()`. Images (`dm.media.list/read/write`, `dm.attach.read/write`) are only ever added. "Get it on this device" creates a local campaign, reloads, then adopts it (the cloud wins, and local-only notes are dropped). New bridge methods need both `main.js`/`preload.js` and `web/dm-bridge.js`.

## Data

- **Notes** are plain `.md` files in the vault (default `~/Documents/Dungeons Desk Vault`). The vault should stay Obsidian-compatible.
- **Everything else** lives in `<vault>/.dmtools/state.json` through `Store`: party, initiative, handouts, loot tables, token sheet and player-view options. Call `Store.save()` (debounced) after mutating `Store.get()`. Call `publishToPlayers()` after any change phones should see.
- **Tokens** export as transparent PNGs. Outside the token shape is always transparent, and inside it is too wherever the image is, unless "Fill behind the image" is ticked. Initials tokens always fill. "Save all as PNGs" copies the sheet's files out of `media/` via the `tokens:exportFiles` IPC.
- **Images** (handout images, tokens) are written to `.dmtools/media/` via `dm.media.save(dataUrl)`. The renderer shows them with `App.mediaUrl(file)`. Phones get them from `/media/file`.

## Conventions and gotchas

- Build DOM with `U.h('tag.class#id', {attrs, onclick}, ...children)`. `util.js` patches `Element.prototype.append/prepend` so they accept nested arrays and skip `null`/`false`, the same as `h()`. Rely on that, and don't "fix" it.
- Use `U.modal`, `U.prompt`, `U.confirm` and `U.toast` instead of native dialogs.
- Note markdown extensions are in `markdown.js`: `[[wikilinks]]`, `#tags`, `> [!read-aloud]` / `> [!secret]` callouts, YAML frontmatter shown as properties, and ` ```statblock ` YAML blocks rendered by `Statblock.render()`.
- Stat block YAML keys: `name size type alignment ac ac_note hp hit_dice speed initiative str..cha saves[] skills senses passive languages cr traits actions bonus_actions reactions legendary_desc legendary_actions`. Entries are `{name, desc}`, and `desc` supports inline markdown. Use 2024 wording (`*Melee Attack Roll:* +5, reach 5 ft. *Hit:* 7 (1d8 + 3) Slashing damage.`).
- The renderer has a CSP in `index.html`. Fonts load from Google Fonts. If you load anything new from outside, update the CSP.
- Keep phone-facing data minimal and filtered in `publishToPlayers()` (`util.js`): hidden combatants, enemy HP and DM secrets must never reach phones.

## Testing

`npm test` runs `scripts/test-charsheet.js` (the character sheet rules checked against hand-worked characters; add a case there when you change `derive()`) and `scripts/test-server.js` (`PlayerServer` on a real port with throwaway folders: join codes and guess throttling, `viewFor()` filtering, player action validation and rate limits, notes, and path traversal; add a case there when you change `server.js`). The release workflow runs `npm test` before building. For everything else there are no unit tests; use the smoke harness, which screenshots every view and logs console errors. **Always use a throwaway HOME** so it never touches the real vault or config:

```bash
S=$(mktemp -d); mkdir -p $S/home $S/shots
HOME=$S/home SHOTS=$S/shots timeout 90 node_modules/electron/dist/electron --no-sandbox scripts/smoke.js
cat $S/shots/log.txt      # console warnings/errors (the CSP "Security Warning" lines from phone windows are expected)
```

The smoke harness takes these options (setup code runs through `executeJavaScript`, because the app's CSP blocks `eval`):
- `VIEWS=notes,initiative` limits which views it captures.
- `PRE_<view>="js"` runs JS in the renderer before capturing that view.
- `PHONE=1` also captures the phone page (it passes the join code; `PHONE_NOCODE=1` leaves it off to see the code screen). Combine it with `PHONE_TABS=turns,handouts,wiki,map,char`, `PHONE_PLAYER=Thorin`, `PHONE_WIKI=<page title>` and `PHONE_EVAL="js"` (run on the phone page, which can `fetch` the server).
- `PHONE_STEPS="js|||js|||…"` runs each step on the phone page and captures `phone-step1.png`, `phone-step2.png`, ….
- `EXTRA="js"` logs the result of an expression.

Look at the PNGs to check the layout. Run `node --check` on edited JS files.

If the real app is already running on port 7777, the smoke run uses the next free port. `PHONE=1` asks the app which port it got.

## Packaging, releases and updates

- **electron-builder** config is the `build` field in `package.json`. It produces the Linux AppImage and the Windows NSIS installer, and publishes to GitHub `beeftcg-eng/dungeons-desk`.
- **Releases** are built by `.github/workflows/release.yml`. On a `v*` tag it creates a draft (release notes come from the annotated tag's message), builds on Ubuntu and Windows runners, then publishes the release.
- To ship a version, run `npm run release -- patch "notes"` (`scripts/release.js`). It commits any changes, bumps the version, tags and pushes. Only release when the user asks.
- **electron-updater** (in `main.js`, `setupUpdater`) checks GitHub on startup and every 6 hours. It's only active in packaged Windows and AppImage builds; source runs show "running from source" in Settings → Updates. Downloads are differential (blockmaps).
- Local packaging check: `npx electron-builder --linux --publish never`, then run `dist/*.AppImage` with a throwaway `HOME`.
- Packaged Linux builds add `--no-sandbox` themselves. Windows uses `app.getPath('documents')` (which may be redirected to OneDrive), so never hard-code `~/Documents`.

## Environment

- Fedora Atomic (`/home` → `/var/home`). The user's own launcher is `~/.local/share/applications/dungeons-desk.desktop`. It runs the **source folder** with `node_modules/electron/dist/electron` from `/var/home/beef/Desktop/DmTools`, so it always runs the latest code (and it can't self-update). Don't move the folder without updating the launcher. To restart it after changes, run `kill` on the old process, then `setsid -f gtk-launch dungeons-desk`. Icons are installed in `~/.local/share/icons/hicolor/*/apps/dungeons-desk.png`.
- Electron 44. Its `npm install` postinstall can be skipped on this machine (npm's `allowScripts` list must name the exact electron version); if `node_modules/electron/dist/` is missing, run `node_modules/.bin/electron --version` once and it downloads the binary. The README has the manual unzip fix.
- Runtime dependencies are `marked@12` (UMD build loaded in the renderer), `js-yaml@4` and `qrcode` (main process only).
