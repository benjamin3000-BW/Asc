#!/usr/bin/env node
"use strict";

// Optional integration checks. Uses Playwright and an existing Chromium browser;
// the prototype itself has no runtime dependencies.
const assert = require("node:assert/strict");
const { spawn } = require("node:child_process");
const { existsSync } = require("node:fs");
const { tmpdir } = require("node:os");
const path = require("node:path");
const { pathToFileURL } = require("node:url");

let chromium;
try {
  ({ chromium } = require("playwright"));
} catch {
  try {
    ({ chromium } = require("playwright-core"));
  } catch {
    console.error("Browser checks need Playwright or playwright-core and Chromium. See README.md for the optional test setup.");
    process.exit(1);
  }
}

const root = path.resolve(__dirname, "..");
const startTime = new Date("2026-01-01T12:00:00Z");
const results = { passed: 0, skipped: 0 };

async function stopServer(child) {
  if (!child.pid || child.exitCode !== null || child.signalCode !== null) return;
  await new Promise((resolve) => {
    const timeout = setTimeout(() => child.kill("SIGKILL"), 2000);
    child.once("exit", () => {
      clearTimeout(timeout);
      resolve();
    });
    child.kill("SIGTERM");
  });
}

async function serve() {
  // Exercise the documented launcher itself. Running from another directory
  // catches accidental dependence on the caller's current working directory.
  const child = spawn(process.env.COMBAT_LAB_PYTHON || "python3", [path.join(root, "serve.py"), "--port", "0"], {
    cwd: tmpdir(),
    stdio: ["ignore", "pipe", "pipe"],
  });
  let output = "";
  let errors = "";
  child.stderr.on("data", (chunk) => { errors = (errors + chunk).slice(-8192); });
  try {
    const url = await new Promise((resolve, reject) => {
      const timeout = setTimeout(() => reject(new Error(`Combat Lab launcher did not become ready. ${errors}`)), 10000);
      const fail = (error) => {
        clearTimeout(timeout);
        reject(error);
      };
      child.once("error", fail);
      child.once("exit", (code, signal) => fail(new Error(`Combat Lab launcher exited before startup (${signal || code}). ${errors}`)));
      child.stdout.on("data", (chunk) => {
        output = (output + chunk).slice(-8192);
        const ready = output.match(/^Combat Lab: (http:\/\/127\.0\.0\.1:\d+\/)\r?$/m);
        if (ready) {
          clearTimeout(timeout);
          resolve(ready[1]);
        }
      });
    });
    return { server: { close: () => stopServer(child) }, url };
  } catch (error) {
    await stopServer(child);
    throw error;
  }
}

async function health(page) {
  return page.locator("[data-health-for]").evaluateAll((elements) => Object.fromEntries(
    elements.map((element) => [element.dataset.healthFor, Number(element.dataset.health)]),
  ));
}

async function status(page) {
  return (await page.locator("#battle-status").textContent()).trim().toLowerCase();
}

async function check(name, run) {
  const result = await run();
  results[result?.skip ? "skipped" : "passed"]++;
  console.log(result?.skip ? `SKIP ${name}: ${result.skip}` : `PASS ${name}`);
}

async function main() {
  const { server, url } = await serve();
  const executablePath = process.env.CHROMIUM_PATH || ["/usr/bin/chromium", "/usr/bin/chromium-browser", "/usr/bin/google-chrome"].find(existsSync);
  let browser;
  try {
    browser = await chromium.launch({ executablePath, headless: true, args: ["--no-sandbox"] });
    const errors = [];
    const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
    context.on("page", (page) => {
      page.on("pageerror", (error) => errors.push(error.message));
    });
    const page = await context.newPage();
    const requests = [];
    const failedRequests = [];
    const responses = [];
    const consoleErrors = [];
    page.on("request", (request) => requests.push(request.url()));
    page.on("requestfailed", (request) => failedRequests.push({ url: request.url(), error: request.failure()?.errorText }));
    page.on("response", (response) => responses.push({
      url: response.url(), status: response.status(), type: response.headers()["content-type"],
      csp: response.headers()["content-security-policy"], nosniff: response.headers()["x-content-type-options"],
    }));
    page.on("console", (message) => {
      if (message.type() === "error") consoleErrors.push(message.text());
    });
    await page.addInitScript(() => {
      globalThis.policyViolations = [];
      document.addEventListener("securitypolicyviolation", (event) => {
        globalThis.policyViolations.push({ directive: event.violatedDirective, blocked: event.blockedURI });
      });
    });
    await page.clock.install({ time: startTime });
    await page.clock.pauseAt(startTime);
    await page.goto(url);

    let originalHealth;
    let originalTarget;
    await check("static server loads specialists, enemies, and accessible health bars", async () => {
      for (const name of ["Davit", "Adrian Seo", "Cook"]) {
        assert.ok(await page.getByText(name, { exact: true }).count(), `${name} is visible`);
      }
      assert.equal(await page.locator('[data-unit-id="davit"]').count(), 1);
      assert.equal(await page.locator('[data-unit-id="adrian-seo"]').count(), 1);
      assert.equal(await page.locator('[data-unit-id="cook"]').count(), 1);
      assert.equal(await page.locator("[data-unit-id]").count(), 6, "exactly three specialists and three enemies rendered");
      assert.equal(await page.locator("[data-target-id]").count(), 3);
      originalHealth = await health(page);
      assert.equal(Object.keys(originalHealth).length, 6);
      assert.ok(Object.values(originalHealth).every((hp) => Number.isFinite(hp) && hp > 0));
      assert.equal(await page.getByRole("progressbar").count(), Object.keys(originalHealth).length);
      assert.ok(await page.getByRole("progressbar").evaluateAll((bars) => bars.every((bar) => {
        const track = bar.getBoundingClientRect();
        const fill = bar.firstElementChild.getBoundingClientRect();
        return track.width > 0 && track.height > 0 && fill.width > 0 && fill.height > 0;
      })), "health tracks and their fills are visibly rendered");
      originalTarget = await page.locator('[data-target-id][aria-pressed="true"]').getAttribute("data-target-id");
      assert.match(await status(page), /running|combat|active/);
    });

    await check("automatic combat damages both teams without player input", async () => {
      await page.clock.runFor(3000);
      const currentHealth = await health(page);
      assert.ok(["davit", "adrian-seo", "cook"].some((id) => currentHealth[id] < originalHealth[id]), "an ally took damage");
      assert.ok(Object.keys(originalHealth).filter((id) => !["davit", "adrian-seo", "cook"].includes(id)).some((id) => currentHealth[id] < originalHealth[id]), "an enemy took damage");
      const log = await page.locator("#combat-log").textContent();
      for (const name of ["Davit", "Adrian Seo", "Cook"]) assert.match(log, new RegExp(name), `${name} attacked automatically`);
      assert.ok(await page.locator("#combat-log li").count() > 0, "combat events are visible");
      assert.notEqual((await page.locator("#elapsed").textContent()).trim(), "00:00", "the elapsed timer advances");
    });

    await check("pause freezes health and operation time; mouse and keyboard select targets", async () => {
      await page.locator("#pause-button").click();
      assert.match(await status(page), /paused/);
      const frozenHealth = await health(page);
      const frozenTime = await page.locator("#elapsed").textContent();
      await page.clock.runFor(5000);
      assert.deepEqual(await health(page), frozenHealth);
      assert.equal(await page.locator("#elapsed").textContent(), frozenTime);

      const ranged = page.locator('[data-target-id="ranged-foe"]');
      const striker = page.locator('[data-target-id="striker"]');
      await ranged.click();
      assert.equal(await ranged.getAttribute("aria-pressed"), "true");
      await striker.focus();
      await striker.press("Space");
      assert.equal(await striker.getAttribute("aria-pressed"), "true");
      assert.equal(await ranged.getAttribute("aria-pressed"), "false");
      await ranged.focus();
      await ranged.press("Enter");
      assert.equal(await ranged.getAttribute("aria-pressed"), "true");
      assert.deepEqual(await health(page), frozenHealth, "target changes while paused do not advance combat");

      await page.locator("#pause-button").click();
      assert.match(await status(page), /running|combat|active/);
      await page.clock.runFor(1500);
      const resumedHealth = await health(page);
      assert.ok(resumedHealth["ranged-foe"] < frozenHealth["ranged-foe"], "the selected ranged enemy receives automatic attacks");
      assert.notEqual(await page.locator("#elapsed").textContent(), frozenTime);
    });

    await check("restart resets health, target, time, and pause state", async () => {
      await page.locator("#pause-button").click();
      await page.locator("#restart-button").click();
      assert.deepEqual(await health(page), originalHealth);
      assert.equal(await page.locator('[data-target-id][aria-pressed="true"]').getAttribute("data-target-id"), originalTarget);
      assert.match(await status(page), /running|combat|active/);
      const elapsedDigits = (await page.locator("#elapsed").textContent()).match(/\d/g);
      assert.ok(elapsedDigits && elapsedDigits.every((digit) => digit === "0"), "the restarted operation time is zero");
      assert.equal(await page.locator("#outcome").isVisible(), false);
    });

    await check("the unattended default priority can finish in defeat", async () => {
      for (let i = 0; i < 180 && !/defeat|victory/.test(await status(page)); i++) await page.clock.runFor(1000);
      assert.match(await status(page), /defeat/);
      assert.equal(await page.locator("#outcome").isVisible(), true);
      assert.match((await page.locator("#outcome-title").textContent()).toLowerCase(), /failed|defeat/);
      const finalHealth = await health(page);
      assert.ok(["davit", "adrian-seo", "cook"].every((id) => finalHealth[id] === 0));
      await page.clock.runFor(5000);
      assert.deepEqual(await health(page), finalHealth, "terminal combat remains stopped");
    });

    await check("ranged, then striker, then armored priority finishes in victory", async () => {
      await page.locator("#restart-button").click();
      for (const id of ["ranged-foe", "striker", "armored-foe"]) {
        const target = page.locator(`[data-target-id="${id}"]`);
        if (!(await target.isDisabled())) await target.click();
        for (let i = 0; i < 120 && (await health(page))[id] > 0 && !/defeat|victory/.test(await status(page)); i++) await page.clock.runFor(500);
        assert.equal((await health(page))[id], 0, `${id} was defeated`);
      }
      assert.match(await status(page), /victory/);
      assert.match((await page.locator("#outcome-title").textContent()).toLowerCase(), /complete|victory/);
      assert.equal(await page.locator("#outcome").isVisible(), true);
      assert.equal(await page.locator('[data-target-id]:not([disabled])').count(), 0, "defeated enemies cannot be targeted");
      const finalHealth = await health(page);
      await page.clock.runFor(5000);
      assert.deepEqual(await health(page), finalHealth);
      await page.locator("#outcome-restart-button").focus();
      await page.locator("#outcome-restart-button").press("Enter");
      assert.deepEqual(await health(page), originalHealth);
      assert.equal(await page.locator("#outcome").isVisible(), false);
      assert.equal(await page.locator("#restart-button").evaluate((button) => document.activeElement === button), true,
        "outcome restart returns keyboard focus to the visible restart control");
    });

    await check("mobile viewport has no horizontal overflow", async () => {
      await page.setViewportSize({ width: 390, height: 844 });
      assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), "390px layout fits the viewport");
      assert.equal(await page.locator("#pause-button").isVisible(), true);
      assert.equal(await page.locator("#restart-button").isVisible(), true);
    });

    await check("self-hosted assets use correct MIME types and work under strict CSP", async () => {
      await page.waitForLoadState("networkidle");
      const expectedTypes = {
        "/": /^text\/html(?:;|$)/,
        "/styles.css": /^text\/css(?:;|$)/,
        "/combat.js": /^(?:text|application)\/javascript(?:;|$)/,
        "/game.js": /^(?:text|application)\/javascript(?:;|$)/,
        "/favicon.svg": /^image\/svg\+xml(?:;|$)/,
      };
      for (const [asset, type] of Object.entries(expectedTypes)) {
        const response = responses.find((entry) => new URL(entry.url).pathname === asset);
        assert.ok(response, `${asset} loaded`);
        assert.equal(response.status, 200, `${asset} returned HTTP 200`);
        assert.match(response.type, type, `${asset} uses its proper MIME type`);
        assert.equal(response.nosniff, "nosniff", `${asset} disallows MIME sniffing`);
      }
      const documentResponse = responses.find((entry) => new URL(entry.url).pathname === "/");
      assert.equal(documentResponse.csp, "default-src 'self'; script-src 'self'; style-src 'self'; connect-src 'none'; object-src 'none'; base-uri 'none'",
        "the actual launcher serves the application with strict CSP");
      assert.equal(await page.locator("script:not([src])").count(), 0, "the application contains no inline script blocks");
      assert.ok(requests.every((requestUrl) => new URL(requestUrl).origin === new URL(url).origin), "all requests stay on the local server");
      assert.ok(responses.every((response) => response.status === 200), "all resources load successfully");
      assert.deepEqual(failedRequests, [], "no blocked or failed network requests");
      assert.deepEqual(consoleErrors, [], "no browser console errors");
      assert.deepEqual(await page.evaluate(() => globalThis.policyViolations), [], "no CSP violations");
    });

    await check("missing JavaScript returns an honest HTML 404, never XML or executable JavaScript", async () => {
      const response = await context.request.get(new URL("missing-combat-script.js", url).href);
      assert.equal(response.status(), 404);
      assert.match(response.headers()["content-type"], /^text\/html(?:;|$)/);
      assert.equal(response.headers()["x-content-type-options"], "nosniff");
      assert.match(await response.text(), /404/);
      await response.dispose();
    });

    await check("opening index.html directly also starts automatic combat", async () => {
      const localPage = await context.newPage();
      await localPage.clock.install({ time: startTime });
      await localPage.clock.pauseAt(startTime);
      try {
        await localPage.goto(pathToFileURL(path.join(root, "index.html")).href);
      } catch (error) {
        await localPage.close();
        if (error.message.includes("ERR_BLOCKED_BY_ADMINISTRATOR")) {
          return { skip: "managed Chromium policy blocks file URLs; static-server launch passed" };
        }
        throw error;
      }
      assert.match(await status(localPage), /running|combat|active/);
      const localHealth = await health(localPage);
      await localPage.clock.runFor(3000);
      assert.notDeepEqual(await health(localPage), localHealth);
      await localPage.close();
    });

    assert.deepEqual(errors, [], "no uncaught browser errors");
    results.passed++;
    console.log("PASS no uncaught browser errors");
    console.log(`Browser checks: ${results.passed} passed, ${results.skipped} skipped.`);
    await context.close();
  } finally {
    if (browser) await browser.close();
    await server.close();
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
