---
type: lore
tags: [help, guide]
---
# 2 Running Combat

## Build the encounter
**⏳ Initiative → ⚔ Encounter builder.** Search your bestiary and 300+ SRD monsters, and add them with counts. The meter shows **Low / Moderate / High** difficulty for your party, using the 2024 XP budgets (it reads levels from Settings). From there you can:
- **Send to initiative**
- **Save as encounter note**, which you can reopen in the builder later from the note's ⚔ button

Try it on [[Ambush at the Old Bridge]] if you have the example notes.

## Run the fight
- **🛡 Add the party**, **🏰 Lair** (lair actions go on initiative 20 and lose ties), then **⚔ Start combat**.
- **Space** or **→** moves to the next turn, and **Ctrl+Z** undoes. Every change is written to the 📜 combat log.
- In the HP box, type `7` for damage, `+7` to heal, or `=7` to set HP.
- **Conditions** can last a set number of rounds (fill in the box next to the condition list), and they run out on their own. Hover over a condition to read its rules.
- **Concentration**: damage to a creature that's Concentrating shows the save DC.
- **Death saves** appear automatically when a player character drops to 0 HP.
- 👁 hides a creature from players' phones, and ☠ marks it defeated.

### From players' phones
Players with a character sheet (see [[4 Players' Phones]]) can do some of this for you:
- **Initiative**: when they roll initiative on their sheet, it fills in their place in the turn order.
- **Death saves**: a death save rolled on the phone marks the success or failure. A 1 counts as two failures, and a 20 brings them back with 1 HP.
- **Damage and healing**: during a fight they tap their HP and report "I took 7 damage". It shows in your 📣 player feed with an **Apply** button, so HP only changes when you say so.
- **Concentration**: casting a concentration spell marks them Concentrating, and ending it removes the condition.
- When it's a monster's turn, its **stat block** appears on the right. 📜 pins any creature's stat block there.

## Dice 🎲
Press **Ctrl+D** or the 🎲 button in the corner. **Every dice expression and bonus in a note or stat block can be clicked**: click to roll, **Shift+click** for advantage, **Ctrl+click** for disadvantage. Try it here: 1d20+5, 8d6, 2d6 + 3.

```statblock
name: Training Dummy
size: Medium
type: Construct
alignment: Unaligned
ac: 12
hp: 22
hit_dice: 4d8 + 4
speed: 0 ft.
str: 10
dex: 6
con: 12
int: 1
wis: 5
cha: 1
cr: 1/8
actions:
  - name: Wobble
    desc: "*Melee Attack Roll:* +2, reach 5 ft. *Hit:* 3 (1d4 + 1) Bludgeoning damage."
```

## The Session screen 🎬
**🎬 Session** puts everything you need while playing on one screen. It's the first tab in the phone app.
- **The fight:** the turn order with **Next turn ▶**. Tap anyone to deal damage (`7`), heal (`+7`) or set HP (`=7`). The current creature's stat block is underneath, with clickable dice.
- **Quick dice:** d20, advantage, disadvantage and the usual dice.
- **The party:** AC, HP and passive Perception. Tap someone to open their sheet.
  - **☆** gives a character Heroic Inspiration (it turns into ⭐).
  - **🛏 Short rest** / **🌙 Long rest** rests the whole party: every sheet gets back what that rest restores, and players' phones say so (after a Short Rest, with a button to spend Hit Point Dice).
  - **✨ XP & levels** gives XP, shared out or to each, prefilled with what the defeated enemies in the tracker were worth. A character with enough XP for a new level gets a "Level up!" notice that opens the level-up guide on their phone. For milestone levelling, **⬆ Milestone: they level up** sends that notice straight away.
- **📌 Pinned notes:** pin tonight's session plan, an NPC or a location with **📌** in the note toolbar, then open it right here.
- **📜 Last time… (for players):** write a few lines about what happened last session and press **📣 Show to players**. It pops up on each player's phone when they open the game page, stays at the top of their 📝 Notes tab, and they can copy it into their own notes. Change it and send the new version, or **Stop showing** it.

