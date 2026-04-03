# Coffee Master — Project Guide

## What this is
A fast-paced barista game built with plain HTML, CSS, and JavaScript.
Open `index.html` in any browser — no build step, no dependencies.

## Files
- `index.html` — page structure and all screens
- `style.css`  — all styles (no frameworks)
- `script.js`  — all game logic (no frameworks)

## Active branch
`claude/barista-game-wnCHs` — all changes go here.

## Current task (in progress)
Full visual and UX overhaul:
- Realistic SVG coffee cup that renders actual espresso/latte/cappuccino visuals
- Fixed no-scroll layout — serve button always visible at bottom
- Horizontal customer queue strip at the top (like mobile cooking games)
- Level + XP progress system
- Voice lines via Web Speech API ("You're fucking amazing!" etc.)
- Premium dark cafe aesthetic with espresso machine UI

## Code style
- Vanilla JS only — no imports, no bundler
- All balance/tuning values live in the `CONFIG` object at the top of `script.js`
- SVG cup is generated programmatically in `buildCupSVG(drink)` in `script.js`
- Keep functions small and named clearly

## Easy tweaks
| What | Where in script.js |
|---|---|
| Customer patience timing | `CONFIG.basePatience` / `CONFIG.minPatience` |
| Arrival rate | `CONFIG.baseArrivalRate` / `CONFIG.minArrivalRate` |
| Score values | `CONFIG.baseScore`, `CONFIG.speedBonusMax`, `CONFIG.wrongPenalty` |
| XP / level thresholds | `CONFIG.xpPerOrder`, `CONFIG.xpToLevel()` |
| Difficulty ramp speed | `CONFIG.diffInterval` |
| Ingredient unlocks per level | `CONFIG.unlocks` |
| Voice lines | `CONFIG.voice.*` arrays |
| Colors / fonts | `:root` variables at top of `style.css` |
