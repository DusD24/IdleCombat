# Status of the Codex playthrough findings

Tracks [IDLECOMBAT-PLAYTHROUGH.md](IDLECOMBAT-PLAYTHROUGH.md). Simulation fixes are covered by `node tools/test_world.js`; UI fixes were checked in an isolated headless Chrome.

## Done

| ID | Fix |
|---|---|
| BUG-01 | Army Limit button no longer hijacked by the squad-upgrade handler. $300 spent, cap 40 → 50, next price shown, survives reload. |
| BUG-02 | Army limit is a hard cap: a launch sends the squads that fit; the rest go with the next wave. |
| BUG-03 | Upgrade sheet refreshes cash, enabled buttons and unlocks live, keeping scroll and focus. |
| BUG-04 | Only the wave that lands the final gate hit "broke through the gate"; others say "still out there when the gate fell". |
| BUG-05 | Gate damage tracked separately; the ETA uses gate hits only, and says why when there are none. |
| BUG-06 | Pause survives reload; a welcome-back message says squads regroup at the start line. |
| BUG-07 | Sheets take focus on open, trap Tab, and return focus to the opener. |
| BUG-08 | Send Now is disabled while paused. |
| BUG-09 | Tank and technical tips: RPGs kill vehicles; Breachers blow up the depot. |
| BUG-10 | A save during the breach celebration records the next line, so the gate can't come back. |
| CHECK-01–04 | "Fewer X" vs "No more X"; history keyed by line position; no overkill credit; Sniper card wording, per-troop stats, C4 damage, heals per second. |
| BAL-01 | Sandbag Line has no covered wall gunners and lighter buildings (`easy: .55`): Riflemen outrange its Gunmen. Command Tent wall gunners 4 → 2. Level 1 lines now 3.3–5.7 min. |
| UX-02 | Enemy list wraps and is ordered barracks → live threats (biggest first) → fixed defenses → destroyed. |
| UX-03 | Persistent objective strip on the field: goal plus one hint (army full, counter suggestion after a failed wave, open a square, affordable upgrade). |
| UX-05 | Opening a square uses a confirm card (row, price, next price, Cancel/Open) that never expires. |
| UX-08 (part) | Speed button's accessible name includes the multiplier. |
| IDEA-01 | Bases screen in the menu (captured / playing / locked, Replay, Continue endless) and a Campaign complete! screen with stats after the last HQ. |

## Open

BAL-02 to BAL-07, UX-01, UX-04, UX-06, UX-07, rest of UX-08, UX-09 (name decision), IDEA-02 to IDEA-09.
