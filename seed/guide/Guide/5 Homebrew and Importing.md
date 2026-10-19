---
type: lore
tags: [help, guide]
---
# 5 Homebrew and Importing

## Your own content
**📖 Rules → + Homebrew** creates a monster, spell, magic item, feat, background or subclass. It's saved as a note in this campaign's **Homebrew** folder and marked ★ everywhere:
- the Rules reference (filter with **★ My campaign**; feats, backgrounds and subclasses are under **Feats & more**)
- the encounter builder and initiative
- the **💰 Loot** generator, which mixes your items into treasure. **🎁 Give to…** on rolled treasure puts each item (and the coins, shared out or to one character) straight onto players' sheets, and their phones show what they got.
- character sheets: a homebrew background, feat or subclass is in the sheet's lists, with its rules built in. A subclass's features are `## Level 3: Name` sections in its note, and appear on the sheet at those levels.

On any SRD entry, **✏ Copy to homebrew** makes an editable copy for your world.

**Giving homebrew to players.** Share a homebrew spell, item, feat, background or subclass note with **👥 Share** (all players, or chosen ones), just like a wiki page. It then shows up, marked ★, on those players' character sheets: in spell and gear searches, the background and subclass lists, the ✨ character guide and the ⬆ level-up guide. Unshared homebrew stays hidden, so it can't spoil a surprise. Secret boxes and `%% comments %%` in the note are left out.

**Or give players all of it.** Tick **⚙ Settings → Party → ★ Players get all my homebrew**, and every homebrew spell, item, feat, background and subclass in this campaign reaches every player's sheet without sharing each one. That includes ones you imported from a book PDF. Notes you've shared with particular players still go only to them. Homebrew monsters always stay with you.

## One homebrew library for all your campaigns 📚
Your homebrew isn't stuck in one campaign. Every homebrew note (anything in the **Homebrew** folder) also goes into your **homebrew library**, and the library is copied into every campaign you open.
- **Make or import it once.** A monster you build in one campaign, or a magic item you import from a book, shows up in your other campaigns the next time you open them.
- **Edit or delete it anywhere.** The change reaches the other campaigns. A deleted note goes from all of them; each campaign's note history still has a copy, and so does your computer's trash.
- **On every device.** Signed in under **☁ Cloud sync**, the library is kept in your account too, so the phone app and your other computers get it. That works even for campaigns you don't sync.
- **Sharing stays per campaign.** Who you share a note with (👥 Share, `share:`) stays with each campaign, since each has its own players.
- **Keep one to a single campaign** (a secret villain, say) by adding `library: false` to its properties.
- On a computer, the library is the folder **Documents/Dungeons Desk Library**. It's on the **⚙ Settings → 📚 Homebrew library** card, along with **↻ Sync now**. If a campaign already had its own, different version of a note with the same name, the card shows it so you can pick one.

## Importing
In **📖 Rules → 📥 Import**:
- **📋 Paste text**: on D&D Beyond (or in a PDF), select a stat block, spell, item, feat, background or subclass, copy it and paste it here. The app works out what it is and shows a preview before saving. *D&D Beyond links can't be fetched directly, because D&D Beyond doesn't allow other apps to read its pages.*
- **🌐 Open5e**: search thousands of free, open-licensed monsters, spells and items, from the SRD and from books like *Tome of Beasts*, *Creature Codex* and *Deep Magic*.
- **📁 JSON file**: bulk-import from Open5e or 5e-database files.
- **📕 Book PDF**: pick a PDF of a book you own, such as a *Monster Manual*, *Dungeon Master's Guide* or *Player's Handbook*. The app reads it on this device (nothing is uploaded) and lists every monster, spell, magic item, feat, background and subclass it finds (feats, backgrounds and subclasses in the 2024 books' layout), with the page each one is on. Tick the ones you want and click **📥 Save**. They become homebrew notes in this campaign only, marked with the book's name as their source.
  - **Scanned books** have rough text, so the app fixes what it can: letters read inside numbers, mangled headings, letter-spaced words, and names matched against the SRD and the words on the same page.
  - Entries that still look wrong get a **⚠** that says what to check (a misread name, a missing ability score, an unreadable speed or CR). Click one to see its preview, open **The text as it came out of the PDF**, or fix it with **Edit first**. **Hide ones with ⚠** shows only the clean ones.
  - **Fixing names quickly:** press **⚠ Next name to fix**. The app opens the next misread name and suggests the closest SRD names (**Did you mean**); click one, or type the right name straight into the list and press **Enter** to go on to the next. **✓ It's right** keeps a name as it is.
  - Entries already in your campaign start unticked.
