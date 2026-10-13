(function (root, factory) {
  "use strict";
  const combat = factory();
  if (typeof module === "object" && module.exports) {
    module.exports = combat;
  } else {
    root.CombatLab = combat;
  }
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  "use strict";

  const EPSILON = 1e-10;
  const LOG_LIMIT = 10;

  // These numbers describe the prototype encounter, not established lore.
  // Pass a different configuration to createBattle to experiment with balance.
  const DEFAULT_CONFIG = {
    allies: [
      { id: "davit", name: "Davit", role: "Frontline", maxHealth: 175, damage: 11, attackInterval: 1.25 },
      { id: "adrian-seo", name: "Adrian Seo", role: "Ranged", maxHealth: 100, damage: 16, attackInterval: 1.4 },
      { id: "cook", name: "Cook", role: "Support", maxHealth: 110, damage: 7, attackInterval: 1.8 }
    ],
    enemies: [
      { id: "armored-foe", name: "Armored Foe", role: "Armored", maxHealth: 205, damage: 8, attackInterval: 2 },
      { id: "striker", name: "Striker", role: "Melee", maxHealth: 110, damage: 10, attackInterval: 1 },
      { id: "ranged-foe", name: "Ranged Foe", role: "Ranged", maxHealth: 85, damage: 15, attackInterval: 1.4 }
    ]
  };
  for (const roster of [DEFAULT_CONFIG.allies, DEFAULT_CONFIG.enemies]) {
    roster.forEach(Object.freeze);
    Object.freeze(roster);
  }
  Object.freeze(DEFAULT_CONFIG);

  function livingUnit(roster) {
    return roster.find(function (unit) { return unit.health > 0; });
  }

  function addEvent(state, event) {
    const entry = Object.assign({ id: state._nextEventId++, time: state.elapsed }, event);
    state.log.push(entry);
    if (state.log.length > LOG_LIMIT) state.log.shift();
    return entry;
  }

  function refreshTarget(state) {
    const selected = state.enemies.find(function (unit) {
      return unit.id === state.selectedTargetId && unit.health > 0;
    });
    const target = selected || livingUnit(state.enemies);
    state.selectedTargetId = target ? target.id : null;
    return target;
  }

  function createBattle(config) {
    config = config || DEFAULT_CONFIG;
    const ids = new Set();
    function createRoster(roster) {
      if (!Array.isArray(roster) || roster.length === 0) {
        throw new TypeError("Each side requires at least one combatant.");
      }
      return roster.map(function (unit) {
        if (!unit.id || ids.has(unit.id)) throw new TypeError("Combatant ids must be unique.");
        ids.add(unit.id);
        if (![unit.maxHealth, unit.damage, unit.attackInterval].every(Number.isFinite) ||
            unit.maxHealth <= 0 || unit.damage <= 0 || unit.attackInterval <= 0) {
          throw new TypeError("Health, damage, and attack interval must be finite positive numbers.");
        }
        return Object.assign({}, unit, {
          health: unit.maxHealth,
          attackTimer: 0,
          _attackCount: 0
        });
      });
    }
    const allies = createRoster(config.allies);
    const enemies = createRoster(config.enemies);
    return {
      status: "running",
      elapsed: 0,
      allies: allies,
      enemies: enemies,
      selectedTargetId: enemies[0].id,
      log: [],
      _nextEventId: 1
    };
  }

  function nextAttackAt(unit) {
    // Absolute times avoid accumulated timer drift and skipped attacks when a
    // browser frame is delayed. Every due attack is simulated in time order.
    return (unit._attackCount + 1) * unit.attackInterval;
  }

  function advanceTime(state, time) {
    state.elapsed = time;
    for (const unit of state.allies.concat(state.enemies)) {
      if (unit.health > 0) {
        unit.attackTimer = Math.max(0, Math.min(unit.attackInterval,
          time - unit._attackCount * unit.attackInterval));
      }
    }
  }

  function finishIfNeeded(state, events) {
    if (!livingUnit(state.enemies)) {
      state.status = "victory";
      state.selectedTargetId = null;
      events.push(addEvent(state, { type: "victory", text: "Victory — all enemies defeated." }));
    } else if (!livingUnit(state.allies)) {
      state.status = "defeat";
      events.push(addEvent(state, { type: "defeat", text: "Defeat — all specialists are down." }));
    }
    return state.status !== "running";
  }

  function advanceBattle(state, deltaSeconds) {
    if (!Number.isFinite(deltaSeconds) || deltaSeconds < 0) {
      throw new RangeError("Time step must be a finite nonnegative number.");
    }
    const events = [];
    if (state.status !== "running" || deltaSeconds === 0) return events;
    if (finishIfNeeded(state, events)) return events;
    refreshTarget(state);
    const endTime = state.elapsed + deltaSeconds;
    if (!Number.isFinite(endTime)) throw new RangeError("Battle time exceeds the supported range.");

    while (state.status === "running") {
      const activeUnits = state.allies.concat(state.enemies).filter(function (unit) {
        return unit.health > 0;
      });
      const dueTime = Math.min.apply(null, activeUnits.map(nextAttackAt));
      if (dueTime > endTime + EPSILON) {
        // A tolerated floating-point boundary must not move elapsed time back
        // behind an attack that was just resolved at that boundary.
        advanceTime(state, Math.max(state.elapsed, endTime));
        break;
      }
      advanceTime(state, Math.max(state.elapsed, dueTime));

      // Ties are resolved in roster order, allies first. A unit killed at this
      // timestamp cannot retaliate. This order is stable across frame sizes.
      for (const attacker of activeUnits) {
        if (attacker.health <= 0 || nextAttackAt(attacker) > state.elapsed + EPSILON) continue;
        const isAlly = state.allies.includes(attacker);
        const target = isAlly ? refreshTarget(state) : livingUnit(state.allies);
        if (!target) break;
        attacker._attackCount += 1;
        attacker.attackTimer = 0;
        const damage = Math.min(target.health, attacker.damage);
        target.health = Math.max(0, target.health - attacker.damage);
        events.push(addEvent(state, {
          type: "attack",
          attackerId: attacker.id,
          targetId: target.id,
          text: attacker.name + " hits " + target.name + " for " + damage +
            (target.health === 0 ? " — defeated." : ".")
        }));
        refreshTarget(state);
        if (finishIfNeeded(state, events)) break;
      }
    }
    return events;
  }

  function togglePause(state) {
    if (state.status === "running") state.status = "paused";
    else if (state.status === "paused") state.status = "running";
    return state.status;
  }

  function selectTarget(state, id) {
    if (state.status !== "running" && state.status !== "paused") return false;
    const target = state.enemies.find(function (unit) { return unit.id === id && unit.health > 0; });
    if (!target) return false;
    if (state.selectedTargetId !== id) {
      state.selectedTargetId = id;
      addEvent(state, { type: "target", targetId: id, text: "Priority target: " + target.name + "." });
    }
    return true;
  }

  return { DEFAULT_CONFIG: DEFAULT_CONFIG, createBattle: createBattle, advanceBattle: advanceBattle,
    togglePause: togglePause, selectTarget: selectTarget };
});
