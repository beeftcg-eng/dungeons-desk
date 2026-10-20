---
type: lore
tags: [help, guide]
---
# 3 Maps and Tokens

## Setting up a map
**🧭 Map → + New map**, then pick any image (a battle map, a dungeon or a region map), a map video, or a `.dd2vtt` file. Set **Square (px)** to match the map's grid. One square is 5 ft.

The whole map starts **hidden by fog**. To uncover it:
- Use **👁 Reveal** (paint) or **👁▭** (drag a box). 🌫 hides areas again.
- Or let player tokens clear the fog as they explore. Set the radius under **Players**.

## Animated maps (Dungeon Alchemist and others)
Maps can move: water flowing, torches flickering. In Dungeon Alchemist, export the map as a **video** (MP4 or WebM) and also as a **Universal VTT** file (`.dd2vtt`), at the same size. Then use **+ New map** and pick **both files together**. The video plays behind the grid, fog and tokens, and the `.dd2vtt` sets the grid exactly.
- Got the video only? It works on its own; set the grid by hand or later with **📐 Grid from .dd2vtt**.
- Already have the still map? Open it and press **🎞️ Add animation** to add the video. The still picture stays as a backup.
- Untick **🎞️ Animated** to show the still picture instead. Players can also tap **⏸** on their phone to save battery.
- Phones on the same Wi-Fi and the 🖥 TV window see it move. Online tables, other synced devices and campaign files get the still picture, because videos are too big to send.

## Walls, doors and line of sight
A `.dd2vtt` file also holds the map's **walls and doors**. They come in with it (or later, with **📐 Grid & walls from .dd2vtt**), and then:
- Player tokens clear the fog only **where they can see**: not through walls or closed doors, and furniture like pillars casts shadows. **Fog clears around player tokens** sets how far they see.
- Players **can't move their tokens through walls or closed doors**. Their phone says so and puts the token back. You can still move anything.
- **Click a door** (✋ tool) to open or close it: orange is closed, green is open. Opening one shows players what's behind it.
- **🧱 Walls & doors** in the side panel: turn walls off, **Show walls** to check they line up (only you see them), and **👁 Reveal what tokens see** after moving tokens around yourself.

Press **📺 Show to players** to put the map on their phones and on the 🖥 TV window.

## Tokens
- **🛡 Party** adds every character with the token their player chose. Players control their own tokens.
- **⏳ Initiative** adds everyone in the tracker. Monsters come in at the right size.
- **🪙 Sheet** adds tokens you made in the Token Maker.
- **Right-click a token** to hide it, rename it, remove it, or choose **which player controls it**.
- Whoever's turn it is gets a gold glow.

## Tools
| Tool | What it does |
|---|---|
| 📏 Measure | Drag to measure. Players see your ruler live. |
| ✏ Draw | Freehand, with colors and widths |
| 💥 AoE | Sphere, cone, line or cube, labeled in feet |
| 🧽 Eraser | Click a drawing or AoE to remove it (right-click works too) |
| 📍 Ping | Click to flash a spot on everyone's screen |

Untick **Players see drawings & AoE** if you want to plan privately.

## The Token Maker 🪙
Turn any picture into a round or square token with a border and a name banner. **Save PNG** gives a transparent background for virtual tabletops, **Save all as PNGs** exports the whole sheet, and **Print** prints them at real size.
