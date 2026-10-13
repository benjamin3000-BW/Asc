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

No build step, backend, account, or browser runtime dependency is required. To run the complete application over HTTP, use Python 3 and the included launcher. From the Asc repository root:

```sh
git switch feature/combat-lab-2d
git pull --ff-only origin feature/combat-lab-2d
python3 combat-lab-2d/serve.py
```

Then open `http://127.0.0.1:8000/` in a normal browser tab. Stop the server with Ctrl+C. If port 8000 is occupied, add `--port 8001` and use the URL printed by the launcher. In this cloud checkout, the repository root is `/workspace/Asc`; `python3 /workspace/Asc/combat-lab-2d/serve.py` also works from any directory.

The launcher always serves the folder containing itself, checks that every required application asset exists, and explicitly returns JavaScript as `text/javascript` and CSS as `text/css`. It does not depend on your shell's working directory or host MIME database. It also serves a strict Content Security Policy without permitting inline scripts. The cloud onboarding UI does not provide a localhost web preview.

Alternatively, opening `combat-lab-2d/index.html` directly works in browsers that allow local-file scripts; this cloud machine's managed Chromium policy blocks file URLs, so use HTTP here. For a plain Python static server, explicitly set the directory:

```sh
python3 -m http.server 8000 --bind 127.0.0.1 --directory /workspace/Asc/combat-lab-2d
```

Use your own checkout path outside the cloud environment. Do not serve or upload `index.html` alone: `combat.js`, `game.js`, `styles.css`, and `favicon.svg` must be available alongside it.

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

If using an existing Chromium installation, skip the download and set `CHROMIUM_PATH` to its executable when running the browser checks. Python 3 is also required for these integration checks; optionally set `COMBAT_LAB_PYTHON` to its executable. The runner launches the actual `serve.py` from an unrelated working directory on a temporary local port, closes its own server/browser on completion, and also tests opening `index.html` directly.

### Balance and implementation

`combat.js` owns the deterministic simulation and exports the same API to the browser and Node. Adjust `DEFAULT_CONFIG` to tune health, damage, and attack intervals; `createBattle(customConfig)` also accepts a full pair of rosters for tests or experiments. `game.js` owns the browser controls and presentation; `styles.css` supplies the responsive layout and reduced-motion support. No external assets or requests are needed to play.

Combat resolves every due attack in simulation time order. Simultaneous attacks resolve in roster order, specialists first; a unit killed at that timestamp cannot retaliate. Defeated units never attack, health never drops below zero, and terminal states stop the simulation. Slow browser frames advance at most 0.2 simulation seconds per frame, so a stalled page does not instantly finish the encounter.

### Tested behavior and limitations

The 18 logic tests pass, covering automatic attacks, enemy targeting, priority/fallback targeting, paused and terminal states, fresh restart state, independent battles, large and partitioned time steps, and victory/defeat strategies. Ten Chromium browser checks pass for the actual launcher started from another directory, automatic damage, all three specialists, health bars, mouse/keyboard targeting, pause/resume, restart, both outcomes, terminal freeze, a narrow viewport, strict-CSP asset loading, and proper 404 handling. One direct-file check is skipped in this cloud machine because managed Chromium blocks `file://` navigation (`ERR_BLOCKED_BY_ADMINISTRATOR`); use the static server here. Other browser engines have not been verified.

This is one deterministic training encounter with simple geometric portraits. Cook auto-attacks in Milestone 1; healing, buffs, protection, disruption abilities, and their cooldowns belong to Milestone 2. Vitality, Endurance, persistent Capacity, rest, recovery, roster preparation, Containment, and the boss are not implemented yet. There is no saved progression or random variation. The broader acceptance criteria in the implementation brief span those later milestones.

### Preview troubleshooting

Use the local HTTP launch above to diagnose an embedded preview that stays at `00:00` with empty teams. The application entry point is `index.html`; there is no `runner.html` in this project. Scripts are loaded from `combat.js` and `game.js`, and styling from `styles.css`, with no inline script blocks, inline event handlers, external libraries, remote fonts, or gameplay network requests. Static display styles also live in the stylesheet.

Standalone Chromium against the documented Python server renders all six cards, advances the clock, and produces combat events with no console errors or failed requests. `styles.css` responds with HTTP 200 and `text/css`; both JavaScript files respond with HTTP 200 and `text/javascript`. A JavaScript URL returning HTTP 404 and `application/xml` is an error document, not the game's JavaScript; changing a script tag's `type` cannot repair a missing resource. A stylesheet response of `text/html` similarly indicates an HTML wrapper or error page. Serve the entire `combat-lab-2d` directory so the relative asset URLs resolve together.

The follow-up investigation found the application files tracked in local commit `c98df38`, while the remote feature branch was still at scaffold commit `c3072ec`, which contained none of the application files. A branch-based consumer of that older commit cannot load these assets. Check that your checkout or preview artifact includes the implementation commits and all sibling files. A remote preview may instead have uploaded only HTML; its exact request URLs are needed to distinguish those delivery problems.

The reported CSP violation in `runner.html` belongs to the embedded preview wrapper, which is outside this repository. Its exact blocked request URLs and response bodies were not available for inspection here. No such failure occurs when serving the game directly. The browser suite uses the actual launcher, whose restrictive policy permits only same-origin scripts/styles and denies connections, and checks for CSP violations and asset-loading errors. Do not add `unsafe-inline` or disable the preview's security policy to make this game run.
