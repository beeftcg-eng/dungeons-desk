// Note templates. Each follows the usual D&D write-up layout for that kind of content.
window.Templates = (() => {
  const today = () => new Date().toISOString().slice(0, 10);
  const T = {
    blank: { label: 'Blank note', icon: '📄', folder: '', body: (n) => `# ${n}\n\n` },

    npc: { label: 'NPC', icon: '🧑', folder: 'NPCs', body: (n) => `---
type: npc
tags: [npc]
species:
occupation:
location:
faction:
alignment:
status: alive
---
# ${n}

> [!quote]
> "A line this character would say on first meeting."

**Species & Occupation:**
**High Concept:** *(one sentence: who are they, what do they want)*
**Role in the Story:** *(ally, quest giver, rival, villain…)*

## Appearance
-

## Roleplaying
| | |
|---|---|
| **Personality** |  |
| **Ideal** |  |
| **Bond** |  |
| **Flaw** |  |
| **Mannerism** |  |
| **Voice** |  |

## Motivation & Goals


## Relationships
- [[ ]] —

> [!secret] DM Only
> What the players don't know yet.

## Plot Hooks
-

## Notes
`},

    character: { label: 'Player Character', icon: '🛡', folder: 'Party', body: (n) => `---
type: character
tags: [pc]
player:
species:
class:
level: 1
background:
alignment:
---
# ${n}

| AC | HP | Speed | Passive Perception | Initiative |
|:--:|:--:|:--:|:--:|:--:|
|  |  | 30 ft. |  |  |

**Player:**
**Species / Class / Level:**
**Background:**

## Ability Scores
| STR | DEX | CON | INT | WIS | CHA |
|:--:|:--:|:--:|:--:|:--:|:--:|
| 10 (+0) | 10 (+0) | 10 (+0) | 10 (+0) | 10 (+0) | 10 (+0) |

## Personality
- **Traits:**
- **Ideal:**
- **Bond:**
- **Flaw:**

## Backstory


## Hooks & Threads for the DM
-

## Important Items
-

## Session Notes
`},

    monster: { label: 'Monster / Enemy', icon: '🐉', folder: 'Bestiary', body: (n) => `---
type: monster
tags: [monster]
cr: 1
environment:
---
# ${n}

*A short, evocative description of the creature and where it's found.*

\`\`\`statblock
name: ${n}
size: Medium
type: Monstrosity
alignment: Unaligned
ac: 13
ac_note: natural armor
hp: 26
hit_dice: 4d8 + 8
speed: 30 ft.
str: 14
dex: 12
con: 14
int: 4
wis: 12
cha: 6
skills: Perception +3
senses: Darkvision 60 ft.
languages: —
cr: '1'
traits:
  - name: Keen Smell
    desc: The creature has Advantage on Wisdom (Perception) checks that rely on smell.
actions:
  - name: Bite
    desc: "*Melee Attack Roll:* +4, reach 5 ft. *Hit:* 9 (2d6 + 2) Piercing damage."
\`\`\`

## Tactics
-

## Lore
`},

    spell: { label: 'Homebrew spell', icon: '✨', folder: 'Homebrew/Spells', body: (n) => Homebrew.spellNote({ name: n, level: 1, school: 'Evocation', desc: 'Describe what the spell does.' }) },

    item: { label: 'Homebrew item', icon: '💎', folder: 'Homebrew/Items', body: (n) => Homebrew.itemNote({ name: n, rarity: 'Uncommon', type: 'Wondrous Item', desc: 'Describe the item and what it does.' }) },

    encounter: { label: 'Encounter', icon: '⚔', folder: 'Encounters', body: (n) => `---
type: encounter
tags: [encounter]
location:
party_level:
difficulty: Moderate
xp_budget:
---
# ${n}

**Location:** [[ ]]
**Difficulty:** Moderate *(Low / Moderate / High)*  ·  **Party:** 4 × level
**XP Budget:**

## Read-Aloud
> [!read-aloud]
> Describe what the characters see, hear, and smell as they arrive. Keep it to a few sentences and end on something they can act on.

## Creatures
| Creature | Count | CR | XP | Notes |
|---|:--:|:--:|:--:|---|
| [[ ]] | 1 |  |  |  |

## Terrain & Features
- **Lighting:**
- **Cover / Obstacles:**
- **Hazards:**

## Tactics
-

## Development
- **If the party wins:**
- **If the party retreats:**
- **If they parley:**

## Treasure
-
`},

    location: { label: 'Location', icon: '🏰', folder: 'Locations', body: (n) => `---
type: location
tags: [location]
region:
population:
government:
---
# ${n}

> [!read-aloud]
> First impressions as the party arrives.

**Region:** [[ ]]  ·  **Population:**   ·  **Ruled by:**

## Overview


## Notable Places
1. **The ___ Inn** —
2.

## Notable NPCs
- [[ ]] —

## Rumors (d6)
| d6 | Rumor | True? |
|:--:|---|:--:|
| 1 |  |  |
| 2 |  |  |
| 3 |  |  |
| 4 |  |  |
| 5 |  |  |
| 6 |  |  |

> [!secret] DM Only
>
`},

    history: { label: 'History / Lore', icon: '📚', folder: 'Lore', body: (n) => `---
type: lore
tags: [lore, history]
era:
world_date:
---
# ${n}

> [!quote] In-world source
> "A quote from an in-world text or scholar."

**Era:**
**Date:**
**Key Figures:** [[ ]]

## Summary


## Timeline
| Date | Event |
|---|---|
|  |  |

## Consequences Today


## What Common Folk Believe
-

> [!secret] The Truth
>
`},

    faction: { label: 'Faction', icon: '🏴', folder: 'Factions', body: (n) => `---
type: faction
tags: [faction]
alignment:
headquarters:
---
# ${n}

**Motto:** *""*
**Leader:** [[ ]]  ·  **Headquarters:** [[ ]]
**Symbol:**

## Goals
-

## Methods


## Relationships
- [[ ]] — ally
- [[ ]] — enemy

## Ranks
1.
`},

    session: { label: 'Session Log', icon: '🗓', folder: 'Sessions', body: (n) => `---
type: session
tags: [session]
date: ${today()}
world_date: ${Store.get().calendar ? (({ y, m, d }) => `${y}-${m}-${d}`)(Store.get().calendar.now) : ''}
---
# ${n}

**Date:** ${today()}
**Players Present:**

## Recap


## Strong Start
> [!read-aloud]
>

## Scenes
- [ ]
- [ ]

## Secrets & Clues
- [ ]

## Loot Given
-

## What Happened


## Next Time
-
`},
  };
  return T;
})();
