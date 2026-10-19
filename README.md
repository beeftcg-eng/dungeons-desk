# Dungeons Desk

**A desktop toolkit for Dungeon Masters running D&D 5e.** It has:
- a campaign wiki, NPC and monster generators, and a token maker
- player handouts, loot tables, initiative and encounter building
- battle maps with fog of war, a timeline, an SRD rules reference and homebrew

Players join from their phones over Wi-Fi, with no app to install.

## Download

Get the latest version from the **[Releases page](https://github.com/beeftcg-eng/dungeons-desk/releases/latest)**:

| System | File |
|---|---|
| Windows 10/11 (64-bit) | `Dungeons-Desk-Setup-<version>.exe` |
| Linux (64-bit) | `Dungeons-Desk-<version>-linux-x86_64.AppImage` |

### Installing on Windows
1. Download `Dungeons-Desk-Setup-<version>.exe` and double-click it.
2. Windows may show **"Windows protected your PC"**. This happens because the app isn't code-signed (signing certificates cost money). Click **More info → Run anyway**.
3. Choose where to install (the default is fine), then click **Install**. Shortcuts appear on your desktop and in the Start menu.
4. The first time you open it, Windows Firewall asks about network access. **Allow it on Private networks**, otherwise players' phones can't connect.

### Installing on Linux
1. Download the `.AppImage` file.
2. Make it executable: right-click it → **Properties → Permissions → Allow executing file as program**, or run `chmod +x Dungeons-Desk-*.AppImage` in a terminal.
3. Double-click it to run.
   - On **Ubuntu 22.04 or newer**, AppImages need FUSE 2: `sudo apt install libfuse2` (on 24.04 the package is `libfuse2t64`).
   - To add it to your app menu, use [Gear Lever](https://flathub.org/apps/it.mijorus.gearlever) or [AppImageLauncher](https://github.com/TheAssassin/AppImageLauncher). Otherwise, keep the file somewhere permanent, such as `~/Applications`.
4. If your firewall is on (e.g. `ufw`), allow the player port: `sudo ufw allow 7777/tcp`.

### Updates
When a new version is published, the app tells you. Open **⚙ Settings → Updates**, click **Download update**, then **Restart and update**. Only the changed parts are downloaded. Your campaigns are never touched by updates: they live in `Documents/`, not in the app folder.

### First steps
The first campaign includes a **Guide** folder (start with *0 Start Here*) that explains every feature. To add the guide to an existing campaign, use **⚙ Settings → 📘 Add the how-to guide**.

## What's inside

| Tool | What it does |
|---|---|
| 📜 **Notes** | A wiki like Obsidian or World Anvil: Markdown files, `[[wikilinks]]`, backlinks, `#tags`, a graph view, and a quick switcher (Ctrl+O). It has templates for NPCs, monsters, encounters, locations, history/lore, factions, sessions and player characters. **Macros:** type `/` at the start of a line, or press Alt+1…8, to insert a format (NPC, character, monster, encounter, location, lore, faction, session), a block, or freshly rolled content (random NPC, monster, treasure, loot-table rolls). It renders read-aloud boxes, DM secrets and 5e (2024-style) stat blocks, and has a form-based stat block builder. |
| 🎲 **Generate** | NPCs (name, appearance, personality, ideal, bond, flaw, secret, hook, and an optional stat block) and monsters at any CR, type, size and combat role. Reroll any single line. Save straight into your notes. |
| 🪙 **Tokens** | Crop any image into a round or square token with a gold, silver, bronze or colored border, a name banner and a number badge. Save transparent PNGs for virtual tabletops one at a time, or save the whole token sheet as PNGs in one go. You can also print the sheet at real size (1" Medium, 2" Large…). |
| ✉ **Handouts** | Letters, journal pages, torn notes, wanted posters, decrees and arcane scrolls. Reveal one to the whole party or to specific players, and it pops up on their phones. |
| 💰 **Loot** | Treasure by CR tier (individual or hoard), with coins, gems, art and SRD magic items. You can also build weighted loot tables with dice (`2d6 gp`) and nested tables (`[[Trinkets]]`). |
| ⏳ **Initiative** | Tracks turn order, HP, AC and conditions, with hidden monsters and auto-numbered groups. You can add creatures straight from stat blocks in your notes. Space moves to the next turn. |

| 🧭 **Map** | Battle maps with fog of war: paint or box-select areas to reveal or hide them, snap tokens to the grid, and ping spots. Players see it on their phones and on the TV window. |
| 📅 **Timeline** | An in-world calendar you can advance by day, week or month, plus a timeline of every note that has a `world_date`. |
| 📖 **Rules** | Search 341 SRD monsters, 339 spells, 262 magic items, all the conditions and the core rules. Add monsters straight to initiative, the encounter builder or your bestiary. |
| 🎲 **Dice** | A floating roller (Ctrl+D) with advantage/disadvantage and roll history. Dice, attack bonuses, checks and saves in notes and stat blocks can be clicked to roll. |

**Map tools:** 📏 measure (players see it live), ✏ draw, 💥 AoE templates (sphere, cone, line, cube, sized in feet), 📍 ping, and an eraser. Right-click a token to choose which player controls it. Player tokens can clear the fog around themselves as they move (set the radius per map).

**Homebrew & import:** in 📖 Rules, use **+ Homebrew** to create monsters, spells, magic items, feats, backgrounds and subclasses that live in this campaign (marked ★; they also show up in the encounter builder, initiative and the loot generator). Use **📥 Import** to:
- **paste** a stat block, spell, item, feat, background or subclass copied from D&D Beyond, a PDF or a website
- search the free **Open5e** library (SRD, Tome of Beasts, Creature Codex, Deep Magic…)
- load a **JSON** file
- read a **book PDF** you own (a Monster Manual, say): the app lists the monsters, spells, items, feats, backgrounds and subclasses in it, cleans up scanned text, helps you fix misread names, and saves the ones you pick into your campaign. Nothing is uploaded.

Homebrew goes into a **homebrew library** shared by all your campaigns (and kept in your account when you're signed in), so you make or import it once. The library is backed up daily with your campaigns.

D&D Beyond links can't be fetched directly, because D&D Beyond has no public API and doesn't allow scraping. Copy and paste the text instead.

More in the notes: paste or drag images into a note (they're stored in `Attachments/`), 🕘 version history for every note, 👥 share a note with players, and relationship lines (`- [[Mira]] — ally`) under `## Relationships`, which show up in Graph → Relationship web.

Initiative also has death saves, concentration checks, conditions that run out after a set number of rounds, lair actions, undo (Ctrl+Z), a combat log, a stat-block panel for whoever's turn it is, and an **Encounter builder** tab that uses the 2024 XP budgets.

Backups: a full copy of each campaign is saved once a day in `~/Documents/Dungeons Desk Backups/` (the last 14 are kept).

## Players' phones

The **Initiative** page shows a QR code and an address like `http://192.168.0.4:7777`. Players on the same Wi-Fi scan the code and pick their character. The QR code includes a six-digit **join code**, and anyone typing the address is asked for it once, so other people on the same Wi-Fi can't get in. They get five tabs: the live turn order (their phone buzzes when it's their turn), handouts, a **Wiki** of the notes you've shared, the **Map**, and **Me**, which holds their **character sheet**, a **token maker** (they pick a photo and frame it; it becomes their token on your map), and a private notes page that's saved on your computer. On the Map tab players can **drag their own token**, **measure** and **ping**.

**Character sheets:** players pick a class, level, species and background, and the sheet fills in proficiency, saves, skills, HP, AC, attacks, spell slots, resources and features from the 2024 SRD. Every number can also be typed by hand. They can add gear from a searchable list (or take their starting equipment), track spells, slots, resources and rests, and tap any save, skill, attack or spell to roll it. Your app does the roll, and the result shows in your 📣 player feed and on their phone. **📤 Show the DM** sends you a spell, feature or item. You can open any character's sheet from **⚙ Settings → Party → 📜**, and print it or save it as a PDF. Sheets also handle multiclassing, **⬆ Level up** (on one screen, or step by step with explanations), and concentration. Homebrew you share with players (spells, items, feats, backgrounds, subclasses) appears on their sheets. During combat, a player's initiative roll fills in the turn order, death saves are marked in the tracker, and damage they report waits in your feed for you to **Apply**. **Open player display window** gives a big-screen view for a TV.

Phones can only view things, apart from each player's own character sheet and notes page, sending you rolls, moving the tokens you've assigned to them, pinging, and uploading their own token. They can't change anything in your game. DM secret boxes, hidden monsters and hidden map tokens are never sent to phones.

## Phone app

**https://beeftcg-eng.github.io/dungeons-desk/** — open it in your phone's browser and **Add to Home Screen** (Safari: Share → Add to Home Screen; Chrome/Android: menu → Add to Home screen / Install app) for a home-screen icon that opens full screen. No app store is needed. It's a PWA (Progressive Web App) rather than an `.apk`, so the same link works on iPhone and Android. It has two parts, and each installs as its own icon:

- **I'm a player** (`sheet/`): just a character sheet, with no DM or game needed. It's the same 2024-rules sheet as the Me tab: build a character, roll from it, level up, print it. Characters are saved on the phone. Characters can have a portrait and keep a roll log. **💾 File → 📤 Share file** or **🔗 Share link** sends one to the DM. A link carries the whole character, and nothing is uploaded. The DM adds a file with **⚙ Settings → Party → ⇩ Add from a file or PDF** (a `.ddchar.json`, a PDF printed from Dungeons Desk, or a fillable sheet PDF such as D&D Beyond's). At the table, a player can also tap **👤 Me → 📜 Send my character file to the DM**, which shows up in the DM's 📣 feed as **➕ Add to party**.
- **I'm the DM** (`dm/`): the desktop app's tools in a phone layout. The bottom bar has 🎬 Session (the fight, quick dice, the party, pinned notes and the "Last time…" recap for players on one screen), Notes, Initiative and Map, and ⋯ More has the rest. Campaigns are kept on the phone. **⇧ Export** saves a campaign as one `.ddcampaign.json` file, and **⇩ Import a campaign file…** opens it, on either app, to move a campaign between the desktop and the phone. The phone app can't host the players' LAN game or the TV window; those need the desktop app. It can open an online table, though.

Both work offline once opened, and update themselves. Each shows how to install it (an **Install** button on Chrome for Android, Share → Add to Home Screen on iPhone). If Chrome says the app is already installed and offers a shortcut, it's in the phone's app list.

**Online tables.** When the group isn't on the same Wi-Fi, the DM opens one from **⏳ Initiative → 📱 Players' phones → 🌐 Online table** (desktop or phone app, signed in to cloud sync) and sends the players a link to `play/?t=…`. That's the same players' page as at the table, with each phone getting exactly what it would get on the LAN. Players need no account.

**Cloud sync (optional).** Sign in with a Pawmodoro account (the same one Beef's Brewhouse uses) to sync:
- **Characters**, between phones, from the sheet app's list.
- **Campaigns**, between the desktop app, the phone app and other computers, from **⚙ Settings → Cloud sync**: notes, app state and images.

Nothing is lost when two devices edit the same thing. A note keeps both versions, and the app state merges part by part. Images deleted with **⚙ Settings → 🧹 Clean up images** are deleted on the other devices too. The server side (the `dmdesk_*` tables and functions, a private `dmdesk` storage bucket for synced images and a public `dmdesk-table` one for online tables) lives in the Pawmodoro project's `supabase/schema.sql`.

## Files

- Notes are plain `.md` files in the vault, so you can back them up, sync them, or open the vault in Obsidian.
- Handouts, loot tables, the token sheet and initiative are saved in `<vault>/.dmtools/`.

## For developers

```bash
git clone https://github.com/beeftcg-eng/dungeons-desk.git
cd dungeons-desk
npm install
npm start
```

- `npm test` checks the character sheet rules (AC, HP, multiclass spell slots…) against worked examples in `scripts/test-charsheet.js`.
- `npm run dist:linux` / `npm run dist:win` builds installers locally into `dist/`.
- `npm run web` builds the phone app into `dist-web/` and serves it at http://localhost:8077/ (`npm run build:web` only builds). `.github/workflows/deploy-pages.yml` publishes it to GitHub Pages on every push to `main`.
- **Publishing an update:** `npm run release -- patch "What changed"`. Use `minor` or `major` for bigger changes. This bumps the version, tags it and pushes. GitHub Actions (`.github/workflows/release.yml`) then builds the Windows installer and the Linux AppImage and publishes them as a release. Installed copies pick the update up from there.

## Credits
Includes material from the System Reference Document 5.2 and 5.1 by Wizards of the Coast LLC, licensed under [CC-BY-4.0](https://creativecommons.org/licenses/by/4.0/legalcode). SRD data via [5e-bits/5e-database](https://github.com/5e-bits/5e-database) (MIT). Open5e search via [open5e.com](https://open5e.com). Dungeons Desk is unofficial fan software and isn't affiliated with Wizards of the Coast or D&D Beyond.

## Troubleshooting (building from source)

If `npm install` leaves Electron without its binary (`node_modules/electron/dist` holds only a `locales` folder), extract the downloaded zip by hand:

```bash
Z=$(find ~/.cache/electron -name 'electron-v33*linux-x64.zip' | head -1)
rm -rf node_modules/electron/dist && mkdir node_modules/electron/dist
python3 -m zipfile -e "$Z" node_modules/electron/dist && chmod +x node_modules/electron/dist/electron
printf electron > node_modules/electron/path.txt
```
