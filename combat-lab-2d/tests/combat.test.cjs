"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const { DEFAULT_CONFIG, createBattle, advanceBattle, togglePause, selectTarget } = require("../combat.js");

function unit(id, overrides = {}) {
  return { id, name: id, role: "Test", maxHealth: 100, damage: 5, attackInterval: 1, ...overrides };
}

function battle(allies, enemies) {
  return createBattle({ allies, enemies });
}

function snapshot(state) {
  return JSON.parse(JSON.stringify(state));
}

function close(actual, expected) {
  assert.ok(Math.abs(actual - expected) < 1e-8, `${actual} is not approximately ${expected}`);
}

test("a fresh encounter contains the three specialists and independent full-health rosters", () => {
  const first = createBattle();
  const second = createBattle();
  assert.deepEqual(first.allies.map(u => u.name), ["Davit", "Adrian Seo", "Cook"]);
  assert.equal(first.status, "running");
  assert.equal(first.elapsed, 0);
  assert.equal(first.selectedTargetId, first.enemies[0].id);
  for (const u of [...first.allies, ...first.enemies]) {
    assert.equal(u.health, u.maxHealth);
    assert.equal(u.attackTimer, 0);
  }
  first.allies[0].health = 1;
  assert.equal(second.allies[0].health, DEFAULT_CONFIG.allies[0].maxHealth);
  assert.equal(DEFAULT_CONFIG.allies[0].health, undefined);
});

test("automatic attacks fire at their configured intervals and carry source and target ids", () => {
  const state = battle([unit("ally", { damage: 8, attackInterval: 1 })], [unit("enemy", { attackInterval: 2 })]);
  assert.deepEqual(advanceBattle(state, 0.75), []);
  assert.equal(state.enemies[0].health, 100);
  close(state.allies[0].attackTimer, 0.75);
  const events = advanceBattle(state, 0.25);
  assert.equal(state.enemies[0].health, 92);
  assert.equal(state.allies[0].health, 100);
  assert.equal(state.allies[0].attackTimer, 0);
  assert.equal(events.length, 1);
  assert.equal(events[0].type, "attack");
  assert.equal(events[0].attackerId, "ally");
  assert.equal(events[0].targetId, "enemy");
  assert.equal(events[0].time, 1);
  advanceBattle(state, 1);
  assert.equal(state.enemies[0].health, 84);
  assert.equal(state.allies[0].health, 95);
});

test("pause freezes health, elapsed time, log, and partially charged attack timers", () => {
  const state = createBattle();
  advanceBattle(state, 0.75);
  assert.equal(togglePause(state), "paused");
  const before = snapshot(state);
  assert.deepEqual(advanceBattle(state, 60), []);
  assert.deepEqual(state, before);
  assert.equal(togglePause(state), "running");
  advanceBattle(state, 0.25);
  assert.equal(state.elapsed, 1);
  assert.equal(state.allies[0].health, 165);
  assert.equal(state.enemies[0].health, 205);
});

test("target selection directs every ally while enemies attack the first surviving ally", () => {
  const state = battle([unit("front"), unit("rear")], [unit("first"), unit("priority")]);
  assert.equal(selectTarget(state, "priority"), true);
  const events = advanceBattle(state, 1);
  assert.equal(state.enemies[0].health, 100);
  assert.equal(state.enemies[1].health, 90);
  assert.equal(state.allies[0].health, 90);
  assert.equal(state.allies[1].health, 100);
  assert.deepEqual(events.slice(0, 2).map(e => e.targetId), ["priority", "priority"]);
  assert.deepEqual(events.slice(2).map(e => e.targetId), ["front", "front"]);
});

test("a defeated priority immediately falls back, including another attack at the same time", () => {
  const state = battle(
    [unit("first-ally", { damage: 5 }), unit("second-ally", { damage: 3 })],
    [unit("fallback", { maxHealth: 10, attackInterval: 10 }), unit("priority", { maxHealth: 5, attackInterval: 10 })]
  );
  selectTarget(state, "priority");
  const events = advanceBattle(state, 1);
  assert.equal(state.enemies[1].health, 0);
  assert.equal(state.enemies[0].health, 7);
  assert.equal(state.selectedTargetId, "fallback");
  assert.deepEqual(events.map(e => e.targetId), ["priority", "fallback"]);
  assert.equal(selectTarget(state, "priority"), false);
});

test("enemies switch to the next ally immediately after the frontline falls", () => {
  const state = battle(
    [unit("front", { maxHealth: 3, attackInterval: 10 }), unit("rear", { maxHealth: 5, attackInterval: 10 })],
    [unit("first-enemy", { damage: 3 }), unit("second-enemy", { damage: 3 })]
  );
  const events = advanceBattle(state, 1);
  assert.equal(state.allies[0].health, 0);
  assert.equal(state.allies[1].health, 2);
  assert.deepEqual(events.map(e => e.targetId), ["front", "rear"]);
});

test("a dead combatant never attacks later, and overkill cannot create negative health", () => {
  const state = battle(
    [unit("fallen", { maxHealth: 2, attackInterval: 2 }), unit("survivor", { attackInterval: 10 })],
    [unit("enemy", { damage: 50 })]
  );
  const events = advanceBattle(state, 2);
  assert.equal(state.allies[0].health, 0);
  assert.equal(state.allies[1].health, 50);
  assert.ok(events.every(event => event.attackerId !== "fallen"));
  assert.ok([...state.allies, ...state.enemies].every(u => u.health >= 0));
});

test("same-time attacks follow allies-first roster order and victory prevents retaliation", () => {
  const state = battle([unit("ally", { maxHealth: 1, damage: 100 })], [unit("enemy", { maxHealth: 1, damage: 100 })]);
  const events = advanceBattle(state, 100);
  assert.equal(state.status, "victory");
  assert.equal(state.elapsed, 1);
  assert.equal(state.enemies[0].health, 0);
  assert.equal(state.allies[0].health, 1);
  assert.equal(state.selectedTargetId, null);
  assert.deepEqual(events.map(e => e.type), ["attack", "victory"]);
});

test("defeat occurs immediately when the final specialist falls", () => {
  const state = battle([unit("ally", { maxHealth: 2, attackInterval: 10 })], [unit("enemy", { damage: 10 })]);
  const events = advanceBattle(state, 100);
  assert.equal(state.status, "defeat");
  assert.equal(state.elapsed, 1);
  assert.equal(state.allies[0].health, 0);
  assert.deepEqual(events.map(e => e.type), ["attack", "defeat"]);
});

test("terminal battles cannot resume, receive damage, change target, or advance time", () => {
  for (const state of [
    battle([unit("ally", { damage: 100 })], [unit("enemy", { maxHealth: 1 })]),
    battle([unit("ally", { maxHealth: 1, attackInterval: 10 })], [unit("enemy")])
  ]) {
    advanceBattle(state, 100);
    const before = snapshot(state);
    assert.equal(togglePause(state), before.status);
    assert.equal(selectTarget(state, "enemy"), false);
    assert.deepEqual(advanceBattle(state, 100), []);
    assert.deepEqual(state, before);
  }
});

test("restart is a fresh operation with restored health, timers, priority, and running status", () => {
  const ended = createBattle();
  selectTarget(ended, "ranged-foe");
  advanceBattle(ended, 100);
  const restarted = createBattle();
  assert.equal(restarted.status, "running");
  assert.equal(restarted.elapsed, 0);
  assert.equal(restarted.selectedTargetId, "armored-foe");
  assert.deepEqual(restarted.log, []);
  assert.ok([...restarted.allies, ...restarted.enemies].every(u => u.health === u.maxHealth && u.attackTimer === 0));
  assert.notEqual(ended.allies[0], restarted.allies[0]);
});

test("a large time step gives exactly the same final combat as 60 Hz simulation", () => {
  const large = createBattle();
  const small = createBattle();
  const largeEvents = advanceBattle(large, 100);
  const smallEvents = [];
  while (small.status === "running") smallEvents.push(...advanceBattle(small, 1 / 60));
  assert.deepEqual(smallEvents, largeEvents);
  assert.deepEqual(small, large);
  assert.equal(large.elapsed, 18.2);
});

test("fractional intervals never miss or duplicate attacks across partitioned steps", () => {
  const config = {
    allies: [unit("ally", { maxHealth: 10000, attackInterval: 0.1 })],
    enemies: [unit("enemy", { maxHealth: 10000, attackInterval: 0.3 })]
  };
  const large = createBattle(config);
  const small = createBattle(config);
  const expected = advanceBattle(large, 1.3);
  const actual = [];
  for (let i = 0; i < 130; i += 1) actual.push(...advanceBattle(small, 0.01));
  assert.deepEqual(actual, expected);
  assert.equal(large.enemies[0].health, 9935);
  assert.equal(large.allies[0].health, 9980);
  assert.deepEqual(small.log, large.log);
  close(small.elapsed, large.elapsed);
  close(small.allies[0].attackTimer, large.allies[0].attackTimer);
  close(small.enemies[0].attackTimer, large.enemies[0].attackTimer);
});

test("the recent event log stays bounded and ids remain chronological", () => {
  const state = battle([unit("ally", { maxHealth: 1000 })], [unit("enemy", { maxHealth: 1000 })]);
  const events = advanceBattle(state, 20);
  assert.equal(events.length, 40);
  assert.equal(state.log.length, 10);
  assert.deepEqual(state.log, events.slice(-10));
  assert.ok(state.log.every((event, i) => i === 0 || event.id > state.log[i - 1].id));
});

test("floating-point boundary tolerance never moves time backward after an attack", () => {
  const state = battle([unit("ally")], [unit("enemy")]);
  const events = advanceBattle(state, 1 - 1e-11);
  assert.equal(events.length, 2);
  assert.ok(state.elapsed >= events[events.length - 1].time);
  const before = state.elapsed;
  advanceBattle(state, 1e-12);
  assert.ok(state.elapsed >= before);
});

test("targeting is allowed during pause, while invalid ids leave priority unchanged", () => {
  const state = createBattle();
  togglePause(state);
  assert.equal(selectTarget(state, "striker"), true);
  const before = snapshot(state);
  assert.equal(selectTarget(state, "unknown"), false);
  assert.deepEqual(state, before);
  assert.equal(selectTarget(state, "striker"), true);
  assert.deepEqual(state, before);
});

test("invalid time steps and unusable balance configurations fail without modifying combat", () => {
  const state = createBattle();
  const before = snapshot(state);
  for (const delta of [-1, NaN, Infinity, -Infinity]) assert.throws(() => advanceBattle(state, delta), RangeError);
  assert.deepEqual(advanceBattle(state, 0), []);
  assert.deepEqual(state, before);
  for (const attackInterval of [0, -1, Infinity, NaN]) {
    assert.throws(() => battle([unit("ally", { attackInterval })], [unit("enemy")]), TypeError);
  }
  assert.throws(() => battle([unit("same")], [unit("same")]), TypeError);
  assert.throws(() => battle([], [unit("enemy")]), TypeError);
});

test("default priority loses, but ranged-then-striker priority wins the encounter", () => {
  const defaultState = createBattle();
  advanceBattle(defaultState, 100);
  assert.equal(defaultState.status, "defeat");

  const tacticalState = createBattle();
  selectTarget(tacticalState, "ranged-foe");
  for (let i = 0; i < 1000 && tacticalState.status === "running"; i += 1) {
    if (tacticalState.enemies[2].health === 0 && tacticalState.enemies[1].health > 0) {
      selectTarget(tacticalState, "striker");
    }
    advanceBattle(tacticalState, 0.05);
  }
  assert.equal(tacticalState.status, "victory");
  assert.equal(tacticalState.elapsed, 18);
  assert.ok(tacticalState.allies.every(u => u.health > 0));
});
