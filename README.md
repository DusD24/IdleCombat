# IdleCombat — Breach Squad

An idle auto-battler with a modern-military theme. Your barracks train squads that line up on a grid and storm the enemy wall in waves, while you tweak the lineup live. Damage types counter armor classes (rock-paper-scissors), and each base has several sections to break through.

**Play in the browser:** https://dusd24.github.io/IdleCombat/

Single self-contained HTML file, no build dependencies beyond Python 3. Progress saves in the browser's local storage.

## Develop

```bash
python3 build.py                     # src/ -> dist/index.html
node --check dist/bundle_check.js    # syntax check
node tools/campaign.js               # play the whole campaign headlessly, print section times
node tools/pace.js 0 0 start 1       # probe one section: level, section, lineup preset, unit level
```

| Path | What |
|---|---|
| `src/data.js` | Tuning constants, units, enemies, levels, unlocks, costs |
| `src/world.js` | Simulation: production, waves, combat, breach |
| `src/render*.js` | Canvas drawing |
| `src/main.js` | UI, game loop, save/load, audio |
| `src/head.html`, `body.html`, `style.css` | Page shell and layout |
| `tools/` | Pacing sims and footage-analysis helpers |
| `analysis/FINDINGS.md` | Pacing research notes behind the current tuning |

Deploys to GitHub Pages automatically from `dist/` on every push to `main`.
