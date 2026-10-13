/* Browser presentation. All simulation and balance live in combat.js. */
(() => {
  "use strict";

  const engine = globalThis.CombatLab;
  const elements = {
    allies: document.getElementById("allies"),
    enemies: document.getElementById("enemies"),
    status: document.getElementById("battle-status"),
    elapsed: document.getElementById("elapsed"),
    pause: document.getElementById("pause-button"),
    restart: document.getElementById("restart-button"),
    outcomeRestart: document.getElementById("outcome-restart-button"),
    priority: document.getElementById("priority-target"),
    alliesCount: document.getElementById("allies-count"),
    enemiesCount: document.getElementById("enemies-count"),
    log: document.getElementById("combat-log"),
    emptyFeed: document.getElementById("feed-empty"),
    outcome: document.getElementById("outcome"),
    outcomeTitle: document.getElementById("outcome-title"),
    outcomeDescription: document.getElementById("outcome-description"),
    announcement: document.getElementById("announcement"),
  };
  const views = new Map();
  const hitTimeouts = new Map();
  let battle = engine.createBattle();
  let lastFrame = performance.now();
  let lastPaint = -Infinity;
  let lastLogId = null;
  let previousStatus = null;

  function formatTime(seconds) {
    const whole = Math.floor(seconds);
    return `${String(Math.floor(whole / 60)).padStart(2, "0")}:${String(whole % 60).padStart(2, "0")}`;
  }

  function iconFor(unit, isEnemy) {
    if (isEnemy) return '<svg viewBox="0 0 36 42" aria-hidden="true"><path d="M10 8 18 4l8 4v12l-8 5-8-5Z"/><path d="m11 13 4 2m10-2-4 2M8 37v-7l10-5 10 5v7M13 37v-6m10 6v-6"/><path d="M15 20h6"/></svg>';
    if (unit.name === "Davit") return '<svg viewBox="0 0 36 42" aria-hidden="true"><path d="M11 5h14v11l-7 4-7-4ZM6 34V24l12-4 12 4v10M11 12h14"/><path d="m18 26 7 3v7l-7 4-7-4v-7Z"/></svg>';
    if (unit.name === "Adrian Seo") return '<svg viewBox="0 0 36 42" aria-hidden="true"><path d="M12 5h12v11l-6 4-6-4ZM8 37V25l10-5 10 5v12M12 10h12M13 31h10"/><path d="m5 23 26 9m-2-4 2 4-4 2"/></svg>';
    return '<svg viewBox="0 0 36 42" aria-hidden="true"><path d="M12 5h12v11l-6 4-6-4ZM8 37V25l10-5 10 5v12M12 10h12"/><path d="M18 26v10m-5-5h10"/></svg>';
  }

  function makeCard(unit, isEnemy) {
    const card = document.createElement(isEnemy ? "button" : "article");
    card.className = `unit-card${isEnemy ? " enemy-card" : ""}`;
    card.dataset.unitId = unit.id;
    if (isEnemy) {
      card.type = "button";
      card.dataset.targetId = unit.id;
      card.setAttribute("aria-pressed", "false");
      card.addEventListener("click", () => {
        if (engine.selectTarget(battle, unit.id)) {
          elements.announcement.textContent = `Priority target: ${unit.name}.`;
          render();
        }
      });
    } else {
      card.setAttribute("aria-label", unit.name);
    }
    // This template contains only static markup; configuration text uses textContent below.
    card.innerHTML = `<span class="unit-avatar">${iconFor(unit, isEnemy)}</span>
      <span class="unit-body">
        <span class="unit-title"><span class="unit-name"></span><span class="unit-state"></span></span>
        <span class="unit-role"></span>
        <span class="health-details"><span class="health-label">HEALTH</span><span class="health-value"></span></span>
        <span class="health-track" role="progressbar"><span class="health-fill"></span></span>
        <span class="attack-details"><span class="attack-track"><span class="attack-fill"></span></span><span class="attack-label"></span></span>
      </span>`;
    card.querySelector(".unit-name").textContent = unit.name;
    card.querySelector(".unit-role").textContent = unit.role;
    const health = card.querySelector(".health-value");
    health.dataset.healthFor = unit.id;
    health.dataset.maxHealth = unit.maxHealth;
    const healthTrack = card.querySelector(".health-track");
    healthTrack.setAttribute("aria-label", `${unit.name} health`);
    healthTrack.setAttribute("aria-valuemin", "0");
    healthTrack.setAttribute("aria-valuemax", String(unit.maxHealth));
    views.set(unit.id, {
      card, health, healthTrack,
      healthFill: card.querySelector(".health-fill"),
      attackFill: card.querySelector(".attack-fill"),
      attackLabel: card.querySelector(".attack-label"),
      state: card.querySelector(".unit-state"),
    });
    return card;
  }

  function renderUnits(units, isEnemy) {
    const ended = battle.status === "victory" || battle.status === "defeat";
    for (const unit of units) {
      const view = views.get(unit.id);
      const alive = unit.health > 0;
      const selected = isEnemy && alive && unit.id === battle.selectedTargetId;
      view.card.classList.toggle("is-defeated", !alive);
      view.health.textContent = `${unit.health} / ${unit.maxHealth}`;
      view.health.dataset.health = String(unit.health);
      view.healthTrack.setAttribute("aria-valuenow", String(unit.health));
      view.healthFill.style.width = `${(unit.health / unit.maxHealth) * 100}%`;
      view.attackFill.style.width = alive ? `${Math.min(100, (unit.attackTimer / unit.attackInterval) * 100)}%` : "0%";
      view.attackLabel.textContent = alive ? `${unit.damage} DMG / ${unit.attackInterval}s` : "INACTIVE";
      view.state.textContent = !alive ? "Defeated" : selected ? "Priority" : "Active";
      if (isEnemy) {
        view.card.disabled = !alive || ended;
        view.card.setAttribute("aria-pressed", String(selected));
        view.card.setAttribute("aria-label", `Target ${unit.name}, ${unit.role}, ${unit.health} of ${unit.maxHealth} health${selected ? ", priority selected" : ""}`);
      }
    }
  }

  function renderLog() {
    const latest = battle.log.at(-1)?.id ?? null;
    if (latest === lastLogId) return;
    lastLogId = latest;
    elements.log.replaceChildren();
    for (const event of [...battle.log].reverse()) {
      const item = document.createElement("li");
      item.dataset.type = event.type;
      const time = document.createElement("time");
      time.textContent = formatTime(event.time);
      const text = document.createElement("span");
      text.textContent = event.text;
      item.append(time, text);
      elements.log.append(item);
    }
    elements.emptyFeed.hidden = battle.log.length > 0;
  }

  function render() {
    const ended = battle.status === "victory" || battle.status === "defeat";
    renderUnits(battle.allies, false);
    renderUnits(battle.enemies, true);
    elements.elapsed.textContent = formatTime(battle.elapsed);
    elements.status.dataset.status = battle.status;
    elements.status.textContent = { running: "Combat active", paused: "Combat paused", victory: "Victory", defeat: "Defeat" }[battle.status];
    elements.pause.textContent = battle.status === "paused" ? "Resume combat" : "Pause combat";
    elements.pause.disabled = ended;
    elements.pause.setAttribute("aria-pressed", String(battle.status === "paused"));
    const target = battle.enemies.find((unit) => unit.id === battle.selectedTargetId && unit.health > 0);
    elements.priority.textContent = target?.name ?? "No active enemies";
    const alliesActive = battle.allies.filter((unit) => unit.health > 0).length;
    const enemiesActive = battle.enemies.filter((unit) => unit.health > 0).length;
    elements.alliesCount.textContent = `${alliesActive} / ${battle.allies.length} active`;
    elements.enemiesCount.textContent = `${enemiesActive} / ${battle.enemies.length} active`;
    elements.outcome.hidden = !ended;
    if (ended) {
      const victory = battle.status === "victory";
      elements.outcome.dataset.result = battle.status;
      elements.outcomeTitle.textContent = victory ? "Operation complete." : "Operation failed.";
      elements.outcomeDescription.textContent = victory
        ? `All enemies defeated in ${formatTime(battle.elapsed)}. ${alliesActive} of ${battle.allies.length} specialists remain active. Restart to try another priority order.`
        : "All specialists have fallen. Restart and focus the ranged foe, then the striker, before taking on the armored foe.";
    }
    if (battle.status !== previousStatus) {
      elements.announcement.textContent = ended
        ? `${elements.status.textContent}. ${elements.outcomeDescription.textContent}`
        : elements.status.textContent;
      previousStatus = battle.status;
    }
    renderLog();
  }

  function flashHits(events) {
    for (const event of events) {
      if (event.type !== "attack" || !views.has(event.targetId)) continue;
      const card = views.get(event.targetId).card;
      clearTimeout(hitTimeouts.get(event.targetId));
      card.classList.remove("is-hit");
      // Restart the short impact animation when several attackers hit the same target.
      void card.offsetWidth;
      card.classList.add("is-hit");
      hitTimeouts.set(event.targetId, setTimeout(() => {
        card.classList.remove("is-hit");
        hitTimeouts.delete(event.targetId);
      }, 240));
    }
  }

  function restart() {
    const focusWasOnOutcome = document.activeElement === elements.outcomeRestart;
    for (const timeout of hitTimeouts.values()) clearTimeout(timeout);
    hitTimeouts.clear();
    battle = engine.createBattle();
    for (const view of views.values()) view.card.classList.remove("is-hit");
    elements.log.replaceChildren();
    elements.emptyFeed.hidden = false;
    lastLogId = null;
    lastFrame = performance.now();
    render();
    elements.announcement.textContent = "New encounter started. All specialists and enemies restored.";
    if (focusWasOnOutcome) elements.restart.focus();
  }

  elements.pause.addEventListener("click", () => {
    engine.togglePause(battle);
    lastFrame = performance.now();
    render();
  });
  elements.restart.addEventListener("click", restart);
  elements.outcomeRestart.addEventListener("click", restart);
  document.addEventListener("visibilitychange", () => {
    lastFrame = performance.now();
    if (document.hidden && battle.status === "running") {
      engine.togglePause(battle);
      render();
      elements.announcement.textContent = "Combat paused because this tab is hidden. Resume when ready.";
    }
  });

  for (const unit of battle.allies) elements.allies.append(makeCard(unit, false));
  for (const unit of battle.enemies) elements.enemies.append(makeCard(unit, true));
  render();

  function frame(now) {
    const delta = Math.min(0.2, Math.max(0, (now - lastFrame) / 1000));
    lastFrame = now;
    const events = engine.advanceBattle(battle, delta);
    flashHits(events);
    if (events.length > 0 || now - lastPaint >= 80) {
      render();
      lastPaint = now;
    }
    requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);
})();
