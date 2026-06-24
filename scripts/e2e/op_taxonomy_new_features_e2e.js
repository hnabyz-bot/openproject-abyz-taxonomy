/**
 * E2E tests for new features introduced in 0.2.25:
 *   TC-053: Tooltip ⓘ icon on taxonomy rows
 *   TC-055: DnD handle on WP rows + API-level WP move + bug-fix verification
 *   TC-056: DnD handle on project rows + API-level project move
 */

const fs = require("fs");
const path = require("path");
const { chromium } = require("playwright");

const baseUrl = process.env.OP_BASE_URL || "http://localhost:8087";
const username = process.env.OP_E2E_USER || "taxonomy.e2e";
const password = process.env.OP_E2E_PASSWORD;
const apiToken = process.env.OP_E2E_API_TOKEN;
const stamp = process.env.E2E_STAMP || new Date().toISOString().replace(/[-:.TZ]/g, "").slice(0, 14) + "nf";
const resultDir = process.env.OP_E2E_RESULT_DIR || path.join("test-results", "op-taxonomy", stamp);

if (!password) throw new Error("OP_E2E_PASSWORD is required");
if (!apiToken) throw new Error("OP_E2E_API_TOKEN is required");

fs.mkdirSync(resultDir, { recursive: true });

function url(p) { return new URL(p, baseUrl).toString(); }

async function screenshot(page, name) {
  await page.screenshot({ path: path.join(resultDir, `${name}.png`), fullPage: true });
}

async function suppressOnboarding(page) {
  await page.addStyleTag({
    content: ".enjoyhint,.enjoyhint_disable_events{display:none!important;pointer-events:none!important;}"
  }).catch(() => {});
  await page.evaluate(() => {
    document.querySelectorAll(".enjoyhint,.enjoyhint_disable_events").forEach((el) => el.remove());
  }).catch(() => {});
}

async function login(page) {
  await page.goto(url("/login"), { waitUntil: "domcontentloaded" });
  await page.locator("#username").fill(username);
  await page.locator("#password").fill(password);
  await Promise.all([
    page.waitForLoadState("domcontentloaded"),
    page.locator('form[data-test-selector="user-login--form"] button[type="submit"]').click()
  ]);
  await page.waitForURL((u) => !u.pathname.includes("/login"), { timeout: 90000 });
  await suppressOnboarding(page);
}

// Setup: create taxonomy data via UI/API for new-feature tests
async function setupFixtures(page) {
  const s = stamp.replace(/nf$/, "");
  const titleCode = `project.nf-${s}`;
  const title2Code = `project.nf2-${s}`;
  const projectIdentifier = `nf-proj-${s.toLowerCase()}`;
  const section1Code = `wp.${projectIdentifier}.sec1-${s.toLowerCase()}`;
  const section2Code = `wp.${projectIdentifier}.sec2-${s.toLowerCase()}`;

  const csrf = await page.evaluate(() => {
    return document.querySelector('meta[name="csrf-token"]')?.content || "";
  });

  async function apiPost(path, body) {
    return page.evaluate(async ({ path, body, apiToken }) => {
      const r = await fetch(path, {
        method: "POST",
        credentials: "same-origin",
        headers: {
          "Accept": "application/json",
          "Content-Type": "application/json",
          "Authorization": `Basic ${btoa(`apikey:${apiToken}`)}`
        },
        body: JSON.stringify(body)
      });
      return { status: r.status, body: await r.json().catch(() => ({})) };
    }, { path, body, apiToken });
  }

  // Create title 1
  const t1 = await apiPost("/api/v3/abyz_taxonomy/titles", { name: `NF타이틀1 ${s}`, code: titleCode, taxonomyType: "title" });
  if (t1.status !== 201 && t1.status !== 422) throw new Error(`title1 create failed: ${t1.status}`);

  // Create title 2
  const t2 = await apiPost("/api/v3/abyz_taxonomy/titles", { name: `NF타이틀2 ${s}`, code: title2Code, taxonomyType: "title" });
  if (t2.status !== 201 && t2.status !== 422) throw new Error(`title2 create failed: ${t2.status}`);

  // Create project under title 1
  const proj = await page.evaluate(async ({ titleCode, projectIdentifier, apiToken, s }) => {
    const r = await fetch("/abyz_taxonomy/ui/projects", {
      method: "POST",
      credentials: "same-origin",
      headers: {
        "Accept": "application/json",
        "Content-Type": "application/json",
        "X-CSRF-Token": document.querySelector('meta[name="csrf-token"]')?.content || "",
      },
      body: JSON.stringify({ titleCode, name: `NF프로젝트 ${s}`, identifier: projectIdentifier })
    });
    return { status: r.status, body: await r.json().catch(() => ({})) };
  }, { titleCode, projectIdentifier, apiToken, s });
  if (proj.status !== 201 && proj.status !== 422) throw new Error(`project create failed: ${proj.status} ${JSON.stringify(proj.body)}`);

  // Create section 1
  const sec1 = await page.evaluate(async ({ projectIdentifier, section1Code, s }) => {
    const r = await fetch("/abyz_taxonomy/ui/wp_sections", {
      method: "POST",
      credentials: "same-origin",
      headers: {
        "Accept": "application/json",
        "Content-Type": "application/json",
        "X-CSRF-Token": document.querySelector('meta[name="csrf-token"]')?.content || "",
      },
      body: JSON.stringify({ projectIdentifier, name: `NF섹션1 ${s}`, code: section1Code })
    });
    return { status: r.status, body: await r.json().catch(() => ({})) };
  }, { projectIdentifier, section1Code, s });
  if (sec1.status !== 201 && sec1.status !== 422) throw new Error(`section1 create failed: ${sec1.status}`);

  // Create WP under section 1 via UI endpoint
  const wp = await page.evaluate(async ({ projectIdentifier, section1Code, s }) => {
    const r = await fetch("/abyz_taxonomy/ui/work_packages", {
      method: "POST",
      credentials: "same-origin",
      headers: {
        "Accept": "application/json",
        "Content-Type": "application/json",
        "X-CSRF-Token": document.querySelector('meta[name="csrf-token"]')?.content || "",
      },
      body: JSON.stringify({ projectIdentifier, sectionCode: section1Code, subject: `NF WP ${s}` })
    });
    const body = await r.json().catch(() => ({}));
    return { status: r.status, body };
  }, { projectIdentifier, section1Code, s });
  if (wp.status !== 201) throw new Error(`WP create failed: ${wp.status} ${JSON.stringify(wp.body)}`);
  const wpId = wp.body.workPackage && wp.body.workPackage.id;
  if (!wpId) throw new Error("WP id missing from response: " + JSON.stringify(wp.body));

  return { titleCode, title2Code, projectIdentifier, section1Code, section2Code, wpId, s };
}

(async () => {
  const browser = await chromium.launch({
    headless: true,
    executablePath: process.env.CHROMIUM_PATH || "/usr/bin/chromium-browser"
  });
  const context = await browser.newContext({ viewport: { width: 1440, height: 1000 }, ignoreHTTPSErrors: true });
  await context.tracing.start({ screenshots: true, snapshots: true });

  const page = await context.newPage();
  const consoleMessages = [];
  page.on("console", (msg) => consoleMessages.push(`${msg.type()}: ${msg.text()}`));
  page.on("pageerror", (err) => consoleMessages.push(`pageerror: ${err.message}`));

  const evidence = { baseUrl, stamp, screenshots: [], consoleMessages };

  const tcResults = Object.fromEntries(
    ["TC-053", "TC-055", "TC-056"].map((id) => [
      id, { id, status: "pending", detail: null, timestamp: null }
    ])
  );
  function passTc(id, detail) {
    tcResults[id] = { id, status: "pass", detail: detail || {}, timestamp: new Date().toISOString() };
  }
  function failTc(id, reason) {
    tcResults[id] = { id, status: "fail", detail: { reason }, timestamp: new Date().toISOString() };
  }
  function writeTcArtifacts() {
    for (const tc of Object.values(tcResults)) {
      fs.writeFileSync(path.join(resultDir, `${tc.id}.json`), JSON.stringify(tc, null, 2));
    }
  }

  try {
    // Login
    await login(page);
    await page.goto(url("/projects"), { waitUntil: "domcontentloaded" });
    await suppressOnboarding(page);

    // Setup fixtures
    const fix = await setupFixtures(page);
    evidence.fixtures = fix;

    // ─── TC-053: Tooltip ⓘ on taxonomy rows ───────────────────────────────────
    await page.goto(url("/projects"), { waitUntil: "domcontentloaded" });
    await suppressOnboarding(page);

    // Wait for taxonomy rows to render
    await page.locator(`tr[data-abyz-taxonomy-code="${fix.titleCode}"]`).waitFor({ state: "visible", timeout: 60000 });
    await page.waitForTimeout(1000);

    const tooltipOnTitle = await page.evaluate((titleCode) => {
      const row = document.querySelector(`[data-abyz-taxonomy-code="${titleCode}"]`);
      if (!row) return { found: false, error: "title row not found" };
      const icon = row.querySelector(".abyz-info-icon");
      if (!icon) return { found: false, error: "no .abyz-info-icon in title row" };
      const tooltip = icon.getAttribute("data-tooltip") || "";
      return {
        found: true,
        tooltip,
        hasTooltipText: tooltip.length > 0,
        containsTitleWord: tooltip.includes("타이틀") || tooltip.includes("포트폴리오") || tooltip.includes("프로그램")
      };
    }, fix.titleCode);

    evidence.tc053_titleTooltip = tooltipOnTitle;
    await screenshot(page, "tc053-01-title-tooltip");
    evidence.screenshots.push("tc053-01-title-tooltip.png");

    if (!tooltipOnTitle.found || !tooltipOnTitle.hasTooltipText || !tooltipOnTitle.containsTitleWord) {
      throw new Error(`TC-053 title tooltip failed: ${JSON.stringify(tooltipOnTitle)}`);
    }

    // Navigate to WP table
    await page.goto(url(`/projects/${fix.projectIdentifier}/work_packages`), { waitUntil: "domcontentloaded" });
    await suppressOnboarding(page);
    await page.locator(".wp-create-button").waitFor({ state: "visible", timeout: 120000 });
    await page.locator(`tr[data-abyz-taxonomy-code="${fix.section1Code}"]`).waitFor({ state: "visible", timeout: 60000 });
    await page.waitForTimeout(1000);

    const tooltipOnSection = await page.evaluate((sectionCode) => {
      const row = document.querySelector(`[data-abyz-taxonomy-code="${sectionCode}"]`);
      if (!row) return { found: false, error: "section row not found" };
      const icon = row.querySelector(".abyz-info-icon");
      if (!icon) return { found: false, error: "no .abyz-info-icon in section row" };
      const tooltip = icon.getAttribute("data-tooltip") || "";
      return {
        found: true,
        tooltip,
        hasTooltipText: tooltip.length > 0,
        containsSectionWord: tooltip.includes("섹션")
      };
    }, fix.section1Code);

    evidence.tc053_sectionTooltip = tooltipOnSection;
    await screenshot(page, "tc053-02-section-tooltip");
    evidence.screenshots.push("tc053-02-section-tooltip.png");

    if (!tooltipOnSection.found || !tooltipOnSection.hasTooltipText || !tooltipOnSection.containsSectionWord) {
      throw new Error(`TC-053 section tooltip failed: ${JSON.stringify(tooltipOnSection)}`);
    }

    passTc("TC-053", {
      titleTooltip: tooltipOnTitle.tooltip.slice(0, 60),
      sectionTooltip: tooltipOnSection.tooltip.slice(0, 60)
    });
    console.log("TC-053: PASS");

    // ─── TC-055: DnD handle on WP rows + API move + bug-fix verification ───────
    // WP row should have drag handle
    const wpDndCheck = await page.evaluate((sectionCode) => {
      // Collect WP rows that immediately follow the target section row (until next section or end)
      const allRows = Array.prototype.slice.call(
        document.querySelectorAll("table.work-package-table tbody tr")
      );
      const sec1Idx = allRows.findIndex(
        (r) => r.getAttribute("data-abyz-taxonomy-code") === sectionCode
      );
      if (sec1Idx < 0) return { wpRows: 0, handles: [], error: "section1 row not found" };

      const assignedWpRows = [];
      for (let i = sec1Idx + 1; i < allRows.length; i++) {
        if (allRows[i].classList.contains("abyz-taxonomy-wp-section-row")) break;
        // Only include actual WP rows (skip sums rows, inline-create rows, etc.)
        if (allRows[i].getAttribute("data-work-package-id")) {
          assignedWpRows.push(allRows[i]);
        }
      }

      const handles = assignedWpRows.map((row) => ({
        hasHandle: !!row.querySelector(".abyz-drag-handle"),
        draggable: row.querySelector(".abyz-drag-handle")
          ? row.querySelector(".abyz-drag-handle").getAttribute("draggable")
          : null
      }));

      return { wpRows: assignedWpRows.length, handles };
    }, fix.section1Code);

    evidence.tc055_dndCheck = wpDndCheck;

    if (wpDndCheck.wpRows === 0) {
      throw new Error(`TC-055: no WP rows found in tbody`);
    }
    if (!wpDndCheck.handles.every((h) => h.hasHandle)) {
      throw new Error(`TC-055: drag handle missing on some WP rows: ${JSON.stringify(wpDndCheck.handles)}`);
    }

    // Create section 2 and verify WPs stay under section 1 (bug-fix check)
    const sec2Create = await page.evaluate(async ({ projectIdentifier, section2Code, s }) => {
      const r = await fetch("/abyz_taxonomy/ui/wp_sections", {
        method: "POST",
        credentials: "same-origin",
        headers: {
          "Accept": "application/json",
          "Content-Type": "application/json",
          "X-CSRF-Token": document.querySelector('meta[name="csrf-token"]')?.content || "",
        },
        body: JSON.stringify({ projectIdentifier, name: `NF섹션2 ${s}`, code: section2Code })
      });
      return { status: r.status, body: await r.json().catch(() => ({})) };
    }, { projectIdentifier: fix.projectIdentifier, section2Code: fix.section2Code, s: fix.s });

    if (sec2Create.status !== 201) throw new Error(`section2 create failed: ${sec2Create.status}`);

    // Reload and check order: sec1 → WP → sec2 (WP must NOT be after sec2)
    await page.reload({ waitUntil: "domcontentloaded" });
    await suppressOnboarding(page);
    await page.locator(`tr[data-abyz-taxonomy-code="${fix.section1Code}"]`).waitFor({ state: "visible", timeout: 60000 });
    await page.locator(`tr[data-abyz-taxonomy-code="${fix.section2Code}"]`).waitFor({ state: "visible", timeout: 60000 });
    await page.waitForTimeout(1000);

    await screenshot(page, "tc055-01-after-sec2-create");
    evidence.screenshots.push("tc055-01-after-sec2-create.png");

    const bugFixCheck = await page.evaluate(({ section1Code, section2Code, wpId }) => {
      const rows = Array.prototype.slice.call(
        document.querySelectorAll("table.work-package-table tbody tr")
      );
      const indices = rows.map((r, i) => ({
        i,
        code: r.getAttribute("data-abyz-taxonomy-code"),
        wpLink: r.querySelector('a[href*="/work_packages/"]')
          ? r.querySelector('a[href*="/work_packages/"]').getAttribute("href")
          : null
      }));
      const sec1Idx = indices.findIndex((r) => r.code === section1Code);
      const sec2Idx = indices.findIndex((r) => r.code === section2Code);
      const wpIdx = indices.findIndex((r) => r.wpLink && r.wpLink.includes(`/${wpId}`));

      return {
        sec1Idx, sec2Idx, wpIdx,
        // WP should come right after sec1 and before sec2 (or sec2 at end)
        wpAfterSec1: wpIdx === sec1Idx + 1,
        wpBeforeSec2: sec2Idx < 0 || wpIdx < sec2Idx
      };
    }, { section1Code: fix.section1Code, section2Code: fix.section2Code, wpId: fix.wpId });

    evidence.tc055_bugFixCheck = bugFixCheck;

    if (!bugFixCheck.wpAfterSec1) {
      throw new Error(`TC-055 bug-fix: WP not immediately after sec1. Indices: ${JSON.stringify(bugFixCheck)}`);
    }
    if (!bugFixCheck.wpBeforeSec2) {
      throw new Error(`TC-055 bug-fix: WP incorrectly placed after sec2. Indices: ${JSON.stringify(bugFixCheck)}`);
    }

    // API-level move: move WP to section 2
    const moveWp = await page.evaluate(async ({ wpId, section2Code }) => {
      const r = await fetch("/abyz_taxonomy/ui/assignments/move_wp", {
        method: "PATCH",
        credentials: "same-origin",
        headers: {
          "Accept": "application/json",
          "Content-Type": "application/json",
          "X-CSRF-Token": document.querySelector('meta[name="csrf-token"]')?.content || "",
        },
        body: JSON.stringify({ wpId, toSectionCode: section2Code })
      });
      return { status: r.status, body: await r.json().catch(() => ({})) };
    }, { wpId: fix.wpId, section2Code: fix.section2Code });

    evidence.tc055_moveWp = moveWp;
    if (moveWp.status !== 200) throw new Error(`move_wp API failed: ${moveWp.status} ${JSON.stringify(moveWp.body)}`);

    // Reload and verify WP is now under sec2
    await page.reload({ waitUntil: "domcontentloaded" });
    await suppressOnboarding(page);
    await page.locator(`tr[data-abyz-taxonomy-code="${fix.section2Code}"]`).waitFor({ state: "visible", timeout: 60000 });
    await page.waitForTimeout(1000);

    await screenshot(page, "tc055-02-after-move");
    evidence.screenshots.push("tc055-02-after-move.png");

    const afterMove = await page.evaluate(({ section2Code, wpId }) => {
      const rows = Array.prototype.slice.call(
        document.querySelectorAll("table.work-package-table tbody tr")
      );
      const indices = rows.map((r, i) => ({
        i,
        code: r.getAttribute("data-abyz-taxonomy-code"),
        wpLink: r.querySelector('a[href*="/work_packages/"]')
          ? r.querySelector('a[href*="/work_packages/"]').getAttribute("href")
          : null
      }));
      const sec2Idx = indices.findIndex((r) => r.code === section2Code);
      const wpIdx = indices.findIndex((r) => r.wpLink && r.wpLink.includes(`/${wpId}`));
      return { sec2Idx, wpIdx, wpUnderSec2: wpIdx === sec2Idx + 1 };
    }, { section2Code: fix.section2Code, wpId: fix.wpId });

    evidence.tc055_afterMove = afterMove;
    if (!afterMove.wpUnderSec2) {
      throw new Error(`TC-055: WP not under sec2 after move: ${JSON.stringify(afterMove)}`);
    }

    passTc("TC-055", {
      dndHandlePresent: true,
      bugFixOk: bugFixCheck.wpAfterSec1 && bugFixCheck.wpBeforeSec2,
      moveApiStatus: moveWp.status,
      wpMovedToSec2: afterMove.wpUnderSec2
    });
    console.log("TC-055: PASS");

    // ─── TC-056: DnD handle on project rows + API-level project move ───────────
    await page.goto(url("/projects"), { waitUntil: "domcontentloaded" });
    await suppressOnboarding(page);
    await page.locator(`tr[data-abyz-taxonomy-code="${fix.titleCode}"]`).waitFor({ state: "visible", timeout: 60000 });
    await page.waitForTimeout(1000);

    const projectDndCheck = await page.evaluate(({ titleCode, projectIdentifier }) => {
      // Project child rows have data-abyz-display-parent
      const projectRows = Array.prototype.slice.call(
        document.querySelectorAll(`#project-table tbody tr[data-abyz-display-parent="${titleCode}"]`)
      );
      const handles = projectRows.map((row) => ({
        hasHandle: !!row.querySelector(".abyz-drag-handle"),
        draggable: row.querySelector(".abyz-drag-handle")
          ? row.querySelector(".abyz-drag-handle").getAttribute("draggable")
          : null,
        identifier: (() => {
          const links = row.querySelectorAll('a[href*="/projects/"]');
          for (const l of links) {
            const m = l.getAttribute("href").match(/\/projects\/([^/?#]+)/);
            if (m && m[1] !== "new") return decodeURIComponent(m[1]);
          }
          return null;
        })()
      }));
      return { projectRows: projectRows.length, handles };
    }, { titleCode: fix.titleCode, projectIdentifier: fix.projectIdentifier });

    evidence.tc056_projectDndCheck = projectDndCheck;

    if (projectDndCheck.projectRows === 0) {
      throw new Error(`TC-056: no project child rows found under title ${fix.titleCode}`);
    }
    if (!projectDndCheck.handles.every((h) => h.hasHandle)) {
      throw new Error(`TC-056: drag handle missing on project rows: ${JSON.stringify(projectDndCheck.handles)}`);
    }

    await screenshot(page, "tc056-01-project-dnd-handle");
    evidence.screenshots.push("tc056-01-project-dnd-handle.png");

    // API-level move: move project to title 2
    const moveProject = await page.evaluate(async ({ projectIdentifier, title2Code }) => {
      const r = await fetch("/abyz_taxonomy/ui/assignments/move_project", {
        method: "PATCH",
        credentials: "same-origin",
        headers: {
          "Accept": "application/json",
          "Content-Type": "application/json",
          "X-CSRF-Token": document.querySelector('meta[name="csrf-token"]')?.content || "",
        },
        body: JSON.stringify({ projectIdentifier, toTitleCode: title2Code })
      });
      return { status: r.status, body: await r.json().catch(() => ({})) };
    }, { projectIdentifier: fix.projectIdentifier, title2Code: fix.title2Code });

    evidence.tc056_moveProject = moveProject;
    if (moveProject.status !== 200) throw new Error(`move_project API failed: ${moveProject.status} ${JSON.stringify(moveProject.body)}`);

    // Reload and verify project is under title 2
    await page.reload({ waitUntil: "domcontentloaded" });
    await suppressOnboarding(page);
    await page.locator(`tr[data-abyz-taxonomy-code="${fix.title2Code}"]`).waitFor({ state: "visible", timeout: 60000 });
    await page.waitForTimeout(1000);

    await screenshot(page, "tc056-02-after-move");
    evidence.screenshots.push("tc056-02-after-move.png");

    const afterProjectMove = await page.evaluate(({ title2Code, projectIdentifier }) => {
      const rows = Array.prototype.slice.call(document.querySelectorAll("#project-table tbody tr"));
      const title2Idx = rows.findIndex((r) => r.getAttribute("data-abyz-taxonomy-code") === title2Code);
      const projIdx = rows.findIndex((r) => {
        const parent = r.getAttribute("data-abyz-display-parent");
        if (parent !== title2Code) return false;
        const links = r.querySelectorAll('a[href*="/projects/"]');
        for (const l of links) {
          const m = l.getAttribute("href").match(/\/projects\/([^/?#]+)/);
          if (m && decodeURIComponent(m[1]) === projectIdentifier) return true;
        }
        return false;
      });
      return {
        title2Idx, projIdx,
        projectUnderTitle2: projIdx > title2Idx && projIdx === title2Idx + 1
      };
    }, { title2Code: fix.title2Code, projectIdentifier: fix.projectIdentifier });

    evidence.tc056_afterMove = afterProjectMove;
    if (!afterProjectMove.projectUnderTitle2) {
      throw new Error(`TC-056: project not under title2 after move: ${JSON.stringify(afterProjectMove)}`);
    }

    passTc("TC-056", {
      dndHandlePresent: true,
      moveApiStatus: moveProject.status,
      projectMovedToTitle2: afterProjectMove.projectUnderTitle2
    });
    console.log("TC-056: PASS");

    // ─── Final ───────────────────────────────────────────────────────────────────
    evidence.tcResults = tcResults;
    writeTcArtifacts();
    await context.tracing.stop({ path: path.join(resultDir, "trace.zip") });
    fs.writeFileSync(path.join(resultDir, "result.json"), JSON.stringify(evidence, null, 2));
    console.log(`Result dir: ${resultDir}`);
    await browser.close();

  } catch (error) {
    evidence.error = error.message;
    console.error("E2E FAILED:", error.message);
    await screenshot(page, "failure").catch(() => {});
    await context.tracing.stop({ path: path.join(resultDir, "trace.zip") }).catch(() => {});
    evidence.tcResults = tcResults;
    writeTcArtifacts();
    fs.writeFileSync(path.join(resultDir, "result.json"), JSON.stringify(evidence, null, 2));
    await browser.close();
    process.exit(1);
  }
})();
