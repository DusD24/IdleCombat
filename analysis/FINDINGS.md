# Idle Siege pacing observations (2026-11-07 session)

Source: ~22 min of Fire tablet screen recording (`footage/`, 7 gameplay clips), covering the end of Siege 1-6 and all of Siege 1-7.
Observation only. Nothing here copies code, art or names.

## Measured

| What | Idle Siege (observed) | Breach Squad now (`tools/pace.js`) |
|---|---|---|
| Our wave cadence (new group reaching the field) | ~26 s (gaps 25, 27, 27, 29, 23 s in clip 180812) | 19–27 s |
| Full level (Siege 1-7) | **16 min 52 s** (Victory screen) | 5 levels × 3–5 sections, 1–2.5 min each → ~5–10 min per level |
| Time per section / defense line | ~5–6 min wall-clock (3 lines in 1-7) | 63–154 s |
| Structure HP | 4,296 tower and 6,591 gate on the final line | single wall, 2,400 (L1) to 68,400 (L5) |
| How structures fall | Untouched for long stretches while troops fight defenders in front. Then lost in big bursts once troops reach them, e.g. 6,362 → 4,487 → 2,988 → 357 within ~20 s | Steady erosion from first contact (25–40 s) to breach |
| Kills over the level | 296 enemies | – |

## Structural differences worth noting (design, not numbers)

- **Several separate targets per line**: towers, gates and barracks, each with its own HP bar. Destroying a barracks removes an enemy spawn source. Breach Squad has one wall per section plus optional bunkers.
- **Small formation**: the lineup is a 2×2 grid plus commander slots, versus our 3×4.
- **Long-term progression drives pacing**: unit buildings level up a lot (one showed level 56 by the end of the session), there's a passive gold income (+300 to +720/min), and contracts ask you to destroy X or upgrade Y. Section length stays long because upgrades are where the progress comes from.
- **Breaks in play**: treasure-chest tap events and a battle-pass style reward flow interrupt play. These are monetization hooks; leave them out for a kids' game.

## Not measured (would need another session)

- Training time per unit type. Barracks are off-camera during sieges.
- Enemy wave cadence and size, which can't be read reliably at this zoom.
- How fast lineup edits feed back. The player only changed formations a few times, mostly inside menus.

## Tuning applied (from these findings)

- `WALL_MULT` 3 → **22**. Wall HP was the only lever that moved section length; enemy strength barely mattered because of the enemy army cap.
- New `SIEGE_CASH` (cash per wall damage = `SIEGE_CASH / WALL_MULT`). A whole wall pays the same cash as before. Without this, tougher walls paid out more cash, which bought upgrades that cancelled the extra HP.
- First section (Sandbag Line) HP 800 → 450 so the opening is quicker. Level 5 and endless-mode HP cut ~20–25% so late sections don't drag past ~6.5 min.

Result from `node tools/campaign.js` (greedy autoplayer, 3 seeds within ±0.5 min):

| | Before | After |
|---|---|---|
| Per section | 1.1–2.2 min | 3.1–6.6 min |
| Per level | 4–9 min | 12–28 min (Idle Siege 1-7: 17 min) |
| Campaign (5 levels) | 30 min | 90 min |
