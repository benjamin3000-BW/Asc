# Ascensus — Combat Lab 2D

A small browser-based tactical-idle combat prototype. This directory is isolated from any future Unity project.

## Goal
Validate whether automatic combat becomes meaningfully tactical when the player chooses priority targets and activates specialist abilities.

## Initial scope
- Davit (frontline protection), Adrian Seo (ranged disruption), Cook (healing/buffs)
- Automatic combat with player-selected priority targets
- Ability buttons and cooldowns; pause/resume
- Vitality, Endurance, persistent Capacity
- One optional Containment operation that changes the boss fight
- Basic win/loss feedback, recovery, and roster preparation

## Implementation
Vanilla HTML, CSS, and JavaScript. No backend or paid dependencies. Prefer a playable, testable loop over artwork.

## Milestones
1. Combat loop with enemies and victory/defeat
2. Targeting, specialist abilities, and cooldowns
3. Capacity, recovery, and roster
4. Containment and modified boss
5. Tests, balance pass, documentation

## Guardrails
Do not change established Ascensus lore. Keep numeric balance configurable. Do not modify Unity files or merge this branch without owner approval.

## Milestone 1 prototype

Implemented: Davit, Adrian Seo, and Cook automatically attack three basic enemies. Each unit shows health, damage, attack interval, and progress toward its next attack. Select an enemy card to make all active specialists focus it. Combat ends with victory when every enemy is defeated, or defeat when every specialist is down.

### Launch

No build step, backend, account, or runtime dependency is required. Open `combat-lab-2d/index.html` in a modern browser, or serve this folder locally:

```sh
cd /workspace/Asc/combat-lab-2d
python3 -m http.server 8000 --bind 127.0.0.1
```

Then open `http://127.0.0.1:8000` in your local browser. Outside this cloud checkout, use the corresponding path to `combat-lab-2d`. Stop the server with Ctrl+C. The cloud onboarding UI does not provide a localhost web preview.

### Play

- Combat starts automatically. Choose an enemy card with a click, tap, or keyboard (`Tab`, then `Enter` or `Space`). The selected card is marked **Priority**.
- **Pause combat** freezes health, attack timers, and elapsed time. You can change targets while paused; **Resume combat** continues the same encounter.
- **Restart** resets health, attack timers, priority, event history, and elapsed time, then immediately starts a new encounter. It also works after victory or defeat.
- The first active enemy becomes the fallback target when the selected enemy falls. Enemies always attack the first active specialist, in roster order: Davit, Adrian Seo, Cook.
- Leaving priority on the armored foe loses this encounter. Try the ranged foe first, then the striker, then the armored foe. Early target changes matter; the example winning strategy is deliberately narrow.
- Hiding the browser tab pauses the encounter. Return and resume explicitly; combat does not run in the background.

### Tests

The simulation tests use Node's built-in test runner (Node 18 or newer) and need no packages:

```sh
cd /workspace/Asc/combat-lab-2d
node --test tests/combat.test.cjs
```

Optional browser checks use Playwright and Chromium. In the prepared cloud environment they are already available:

```sh
node tests/browser-smoke.cjs
```

Elsewhere, install the browser test tooling without changing the project's dependency files:

```sh
npm install --no-save --package-lock=false playwright
npx playwright install chromium
node tests/browser-smoke.cjs
```

If using an existing Chromium installation, skip the download and set `CHROMIUM_PATH` to its executable when running the browser checks. The runner serves the project on a temporary local port, closes its own server/browser on completion, and also tests opening `index.html` directly.

### Balance and implementation

`combat.js` owns the deterministic simulation and exports the same API to the browser and Node. Adjust `DEFAULT_CONFIG` to tune health, damage, and attack intervals; `createBattle(customConfig)` also accepts a full pair of rosters for tests or experiments. `game.js` owns the browser controls and presentation; `styles.css` supplies the responsive layout and reduced-motion support. No external assets or requests are needed to play.

Combat resolves every due attack in simulation time order. Simultaneous attacks resolve in roster order, specialists first; a unit killed at that timestamp cannot retaliate. Defeated units never attack, health never drops below zero, and terminal states stop the simulation. Slow browser frames advance at most 0.2 simulation seconds per frame, so a stalled page does not instantly finish the encounter.

### Tested behavior and limitations

The 18 logic tests pass, covering automatic attacks, enemy targeting, priority/fallback targeting, paused and terminal states, fresh restart state, independent battles, large and partitioned time steps, and victory/defeat strategies. Nine Chromium browser checks pass for static-server launch, automatic damage, all three specialists, health bars, mouse/keyboard targeting, pause/resume, restart, both outcomes, terminal freeze, a narrow viewport, and strict-CSP asset loading. One direct-file check is skipped in this cloud machine because managed Chromium blocks `file://` navigation (`ERR_BLOCKED_BY_ADMINISTRATOR`); use the static server here. Other browser engines have not been verified.

This is one deterministic training encounter with simple geometric portraits. Cook auto-attacks in Milestone 1; healing, buffs, protection, disruption abilities, and their cooldowns belong to Milestone 2. Vitality, Endurance, persistent Capacity, rest, recovery, roster preparation, Containment, and the boss are not implemented yet. There is no saved progression or random variation. The broader acceptance criteria in the implementation brief span those later milestones.

### Preview troubleshooting

Use the local HTTP launch above to diagnose an embedded preview that stays at `00:00` with empty teams. The application entry point is `index.html`; there is no `runner.html` in this project. Scripts are loaded from `combat.js` and `game.js`, and styling from `styles.css`, with no inline script blocks, inline event handlers, external libraries, remote fonts, or gameplay network requests. Static display styles also live in the stylesheet.

Standalone Chromium against the documented Python server renders all six cards, advances the clock, and produces combat events with no console errors or failed requests. `styles.css` responds with HTTP 200 and `text/css`; both JavaScript files respond with HTTP 200 and `text/javascript`. A stylesheet response of `text/html` in another preview indicates that its route is returning an HTML wrapper or error page instead of this CSS file. Serve the entire `combat-lab-2d` directory so the relative asset URLs resolve together.

The reported CSP violation in `runner.html` belongs to the embedded preview wrapper, which is outside this repository. Its exact blocked request URLs and response bodies were not available for inspection here. No such failure occurs when serving the game directly. The browser suite also serves the game with a restrictive policy permitting only same-origin scripts/styles and denying connections, and checks for CSP violations and asset-loading errors. Do not add `unsafe-inline` or disable the preview's security policy to make this game run.
