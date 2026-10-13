# Implementation brief for Codex / ChatGPT Work

Build a playable 2D tactical-idle prototype for Ascensus in this folder.

## First deliverable
Create `index.html`, `styles.css`, and `game.js` (or similarly simple structure). Launch by opening the HTML file or with a documented local static server. Implement three auto-attacking specialists (Davit, Adrian Seo, Cook), enemies with health, attack timers, a clear victory/defeat state, a pause toggle, selectable enemy target priority, and a restart button.

## Next milestones
Add distinct player-triggered skills: Davit protects an ally; Adrian interrupts a chosen enemy; Cook heals and buffs. Show cooldowns. Add Vitality, Endurance, and Capacity (persistent operational readiness) with configurable depletion of at least 10 percentage points per operation, typically 15–25. Recovery uses in-game rest, not real-world timers. Add an optional Containment Operation that removes or weakens the boss's reinforcement ability.

## Acceptance
- Can complete or fail an operation
- Auto-attacks occur without input; targeting and abilities affect outcomes
- UI clearly displays specialist/enemy state and cooldowns
- Capacity persists between operations in the play session; explicit rest recovers it
- Containment visibly changes the boss
- Document launch steps, tested behavior, and known issues
- Prefer lightweight unit tests for game logic and manually verify browser behavior if possible

## Boundaries
This is a mechanics experiment, not canon lore. Do not generate elaborate assets, add monetization, use paid APIs, or modify Unity content. Keep changes on `feature/combat-lab-2d` and prepare a PR for review; never merge automatically.
