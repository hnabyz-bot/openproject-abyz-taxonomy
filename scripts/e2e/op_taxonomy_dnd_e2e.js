/**
 * E2E tests for actual HTML5 DnD UI behavior (no API calls — real drag simulation):
 *   TC-057: WP DnD — drag WP from sec1 to sec2, verify DOM update + no OP sort query
 *   TC-058: Project DnD — drag project from title1 to title2, verify DOM update
 */

const fs = require("fs");
const path = require("path");
const { chromium } = require("playwright");

const baseUrl = process.env.OP_BASE_URL || "http://localhost:8087";
const username = process.env.OP_E2E_USER || "taxonomy.e2e";
const password = process.env.OP_E2E_PASSWORD;
const apiToken = process.env.OP_E2E_API_TOKEN;
const stamp = process.env.E2E_STAMP || new Date().toISOString().replace(/[-:.TZ]/g, "").slice(0, 14) + "dnd";
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

async function setupFixtures(page) {
  const s = stamp.replace(/dnd$/, "");

  const titleCode = `project.dnd-${s}`;
  const title2Code = `project.dnd2-${s}`;
  const projectIdentifier = `dnd-proj-${s.toLowerCase().replace(/[^a-z0-9-]/g, "-")}`;
  const section1Code = `wp.${projectIdentifier}.sec1`;
  const section2Code = `wp.${projectIdentifier}.sec2`;

  async function apiCall(method, path, body) {
    return page.evaluate(async ({ method, path, body, apiToken }) => {
      const r = await fetch(path, {
        method,
        credentials: "same-origin",
        headers: {
          "Accept": "application/json",
          "Content-Type": "application/json",
          "X-CSRF-Token": document.querySelector('meta[name="csrf-token"]')?.content || "",
          "Authorization": `Basic ${btoa("apikey:" + apiToken)}`
        },
        body: body ? JSON.stringify(body) : undefined
      });
      return { status: r.status, body: await r.json().catch(() => ({})) };
    }, { method, path, body, apiToken });
  }

  // Create title 1
  const t1 = await apiCall("POST", "/api/v3/abyz_taxonomy/titles", { name: `DnD타이틀1 ${s}`, code: titleCode, taxonomyType: "title" });
  if (t1.status !== 201 && t1.status !== 422) throw new Error(`title1 failed: ${t1.status}`);

  // Create title 2
  const t2 = await apiCall("POST", "/api/v3/abyz_taxonomy/titles", { name: `DnD타이틀2 ${s}`, code: title2Code, taxonomyType: "title" });
  if (t2.status !== 201 && t2.status !== 422) throw new Error(`title2 failed: ${t2.status}`);

  // Create project under title 1
  const proj = await page.evaluate(async ({ titleCode, projectIdentifier, s }) => {
    const r = await fetch("/abyz_taxonomy/ui/projects", {
      method: "POST",
      credentials: "same-origin",
      headers: {
        "Accept": "application/json",
        "Content-Type": "application/json",
        "X-CSRF-Token": document.querySelector('meta[name="csrf-token"]')?.content || "",
      },
      body: JSON.stringify({ titleCode, name: `DnD프로젝트 ${s}`, identifier: projectIdentifier })
    });
    return { status: r.status, body: await r.json().catch(() => ({})) };
  }, { titleCode, projectIdentifier, s });
  if (proj.status !== 201 && proj.status !== 422) throw new Error(`project failed: ${proj.status} ${JSON.stringify(proj.body)}`);

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
      body: JSON.stringify({ projectIdentifier, name: `DnD섹션1 ${s}`, code: section1Code })
    });
    return { status: r.status, body: await r.json().catch(() => ({})) };
  }, { projectIdentifier, section1Code, s });
  if (sec1.status !== 201 && sec1.status !== 422) throw new Error(`section1 failed: ${sec1.status}`);

  // Create section 2
  const sec2 = await page.evaluate(async ({ projectIdentifier, section2Code, s }) => {
    const r = await fetch("/abyz_taxonomy/ui/wp_sections", {
      method: "POST",
      credentials: "same-origin",
      headers: {
        "Accept": "application/json",
        "Content-Type": "application/json",
        "X-CSRF-Token": document.querySelector('meta[name="csrf-token"]')?.content || "",
      },
      body: JSON.stringify({ projectIdentifier, name: `DnD섹션2 ${s}`, code: section2Code })
    });
    return { status: r.status, body: await r.json().catch(() => ({})) };
  }, { projectIdentifier, section2Code, s });
  if (sec2.status !== 201 && sec2.status !== 422) throw new Error(`section2 failed: ${sec2.status}`);

  // Create WP under section 1
  const wp = await page.evaluate(async ({ projectIdentifier, section1Code, s }) => {
    const r = await fetch("/abyz_taxonomy/ui/work_packages", {
      method: "POST",
      credentials: "same-origin",
      headers: {
        "Accept": "application/json",
        "Content-Type": "application/json",
        "X-CSRF-Token": document.querySelector('meta[name="csrf-token"]')?.content || "",
      },
      body: JSON.stringify({ projectIdentifier, sectionCode: section1Code, subject: `DnD WP ${s}` })
    });
    const body = await r.json().catch(() => ({}));
    return { status: r.status, body };
  }, { projectIdentifier, section1Code, s });
  if (wp.status !== 201) throw new Error(`WP create failed: ${wp.status} ${JSON.stringify(wp.body)}`);
  const wpId = wp.body.workPackage && wp.body.workPackage.id;
  if (!wpId) throw new Error("WP id missing: " + JSON.stringify(wp.body));

  return { titleCode, title2Code, projectIdentifier, section1Code, section2Code, wpId, s };
}

/**
 * Simulate HTML5 DnD by dispatching DragEvent on the given elements.
 * Returns { success, opSortQueryCreated, dataTransferData }.
 *
 * sourceHandle: CSS selector for the draggable <span> handle
 * targetRow:    CSS selector for the drop target <tr>
 */
async function simulateHtml5Drag(page, sourceHandleSelector, targetRowSelector) {
  return page.evaluate(({ sourceHandleSelector, targetRowSelector }) => {
    return new Promise((resolve) => {
      const handle = document.querySelector(sourceHandleSelector);
      const target = document.querySelector(targetRowSelector);

      if (!handle) { resolve({ success: false, error: "source handle not found: " + sourceHandleSelector }); return; }
      if (!target) { resolve({ success: false, error: "target row not found: " + targetRowSelector }); return; }

      let dataSet = null;

      // Intercept dataTransfer.setData to capture what our handler sets
      const dt = new DataTransfer();
      const origSetData = dt.setData.bind(dt);
      dt.setData = function (type, value) { dataSet = { type, value }; origSetData(type, value); };

      // Dispatch dragstart on the handle element
      handle.dispatchEvent(new DragEvent("dragstart", { bubbles: true, cancelable: true, dataTransfer: dt }));

      setTimeout(function () {
        // dragenter + dragover on target
        target.dispatchEvent(new DragEvent("dragenter", { bubbles: true, cancelable: true, dataTransfer: dt }));
        target.dispatchEvent(new DragEvent("dragover",  { bubbles: true, cancelable: true, dataTransfer: dt }));

        setTimeout(function () {
          // drop on target
          target.dispatchEvent(new DragEvent("drop", { bubbles: true, cancelable: true, dataTransfer: dt }));

          setTimeout(function () {
            // dragend on handle
            handle.dispatchEvent(new DragEvent("dragend", { bubbles: true, cancelable: true, dataTransfer: dt }));
            resolve({ success: true, dataTransferData: dataSet });
          }, 100);
        }, 150);
      }, 150);
    });
  }, { sourceHandleSelector, targetRowSelector });
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

  // Network request monitor — detect OP sort API calls
  const networkRequests = [];
  page.on("request", (req) => {
    const u = req.url();
    // OP creates a manual sort query via POST /api/v3/queries
    if (u.includes("/api/v3/queries") && req.method() === "POST") {
      networkRequests.push({ url: u, method: req.method(), postData: req.postData() });
    }
    // OP may also call PATCH /api/v3/queries/... to update an existing query
    if (u.includes("/api/v3/queries") && req.method() === "PATCH") {
      networkRequests.push({ url: u, method: req.method() });
    }
  });

  const evidence = { baseUrl, stamp, screenshots: [], consoleMessages };

  const tcResults = Object.fromEntries(
    ["TC-057", "TC-058"].map((id) => [
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
    await login(page);
    await page.goto(url("/projects"), { waitUntil: "domcontentloaded" });
    await suppressOnboarding(page);

    const fix = await setupFixtures(page);
    evidence.fixtures = fix;

    // ─── TC-057: Actual WP DnD ────────────────────────────────────────────────────
    // Navigate to WP table
    await page.goto(url(`/projects/${fix.projectIdentifier}/work_packages`), { waitUntil: "domcontentloaded" });
    await suppressOnboarding(page);
    await page.locator(".wp-create-button").waitFor({ state: "visible", timeout: 120000 });
    await page.locator(`tr[data-abyz-taxonomy-code="${fix.section1Code}"]`).waitFor({ state: "visible", timeout: 60000 });
    await page.locator(`tr[data-abyz-taxonomy-code="${fix.section2Code}"]`).waitFor({ state: "visible", timeout: 60000 });
    await page.waitForTimeout(1500);

    await screenshot(page, "tc057-00-before-drag");
    evidence.screenshots.push("tc057-00-before-drag.png");

    // Capture URL and network state before drag
    const urlBeforeDrag = page.url();
    networkRequests.length = 0; // reset counter

    // Verify WP is under sec1 initially
    const beforeDragState = await page.evaluate(({ section1Code, section2Code, wpId }) => {
      const rows = Array.prototype.slice.call(
        document.querySelectorAll("table.work-package-table tbody tr")
      );
      const sec1Idx = rows.findIndex((r) => r.getAttribute("data-abyz-taxonomy-code") === section1Code);
      const sec2Idx = rows.findIndex((r) => r.getAttribute("data-abyz-taxonomy-code") === section2Code);
      const wpIdx = rows.findIndex((r) => {
        const link = r.querySelector(`a[href*="/work_packages/${wpId}"]`);
        return !!link;
      });
      return { sec1Idx, sec2Idx, wpIdx, wpUnderSec1: wpIdx === sec1Idx + 1 };
    }, { section1Code: fix.section1Code, section2Code: fix.section2Code, wpId: fix.wpId });

    evidence.tc057_beforeDrag = beforeDragState;
    if (!beforeDragState.wpUnderSec1) {
      throw new Error(`TC-057: WP not under sec1 before drag. State: ${JSON.stringify(beforeDragState)}`);
    }

    // Find the drag handle CSS selector for the WP row
    const handleSelector = await page.evaluate(({ section1Code, wpId }) => {
      const rows = Array.prototype.slice.call(
        document.querySelectorAll("table.work-package-table tbody tr")
      );
      const sec1Idx = rows.findIndex((r) => r.getAttribute("data-abyz-taxonomy-code") === section1Code);
      for (let i = sec1Idx + 1; i < rows.length; i++) {
        const row = rows[i];
        if (row.getAttribute("data-abyz-taxonomy-code")) break;
        const link = row.querySelector(`a[href*="/work_packages/${wpId}"]`);
        if (link) {
          // This is the WP row — find its handle
          const handle = row.querySelector(".abyz-drag-handle");
          if (!handle) return null;
          // Build a unique selector using row index
          handle.setAttribute("data-tc-handle-idx", String(i));
          return `[data-tc-handle-idx="${i}"]`;
        }
      }
      return null;
    }, { section1Code: fix.section1Code, wpId: fix.wpId });

    if (!handleSelector) {
      throw new Error("TC-057: drag handle not found for WP row");
    }

    // Target: section 2 row
    const sec2Selector = `tr[data-abyz-taxonomy-code="${fix.section2Code}"]`;

    // Perform actual HTML5 DnD
    const dragResult = await simulateHtml5Drag(page, handleSelector, sec2Selector);
    evidence.tc057_dragResult = dragResult;

    if (!dragResult.success) {
      throw new Error(`TC-057: DnD simulation failed: ${dragResult.error}`);
    }

    // Verify dataTransfer.setData was called with our marker (not OP's)
    if (!dragResult.dataTransferData || dragResult.dataTransferData.value !== "abyz-wp-drag") {
      throw new Error(`TC-057: dataTransfer marker wrong: ${JSON.stringify(dragResult.dataTransferData)}. OP handler may have intercepted the event.`);
    }

    // Wait for async drop handler (debounce + API call = ~800ms)
    await page.waitForTimeout(1500);

    await screenshot(page, "tc057-01-after-drag-no-reload");
    evidence.screenshots.push("tc057-01-after-drag-no-reload.png");

    // Check URL did not change to manual sort query
    const urlAfterDrag = page.url();
    const urlChanged = urlBeforeDrag !== urlAfterDrag;
    const opSortCalls = networkRequests.filter((r) => r.url.includes("/api/v3/queries"));
    evidence.tc057_urlBeforeDrag = urlBeforeDrag;
    evidence.tc057_urlAfterDrag = urlAfterDrag;
    evidence.tc057_opSortApiCalls = opSortCalls;

    // Bug 3 check: no OP sort query API calls
    if (opSortCalls.length > 0) {
      throw new Error(`TC-057 Bug3: OP sort query API called ${opSortCalls.length} times after DnD. OP intercepted drag event. Calls: ${JSON.stringify(opSortCalls)}`);
    }

    // Check sidebar for "새로운 수동 정렬 쿼리" text
    const sidebarHasSortQuery = await page.evaluate(() => {
      const sidebar = document.querySelector(".-expanded-sidebar, .op-sidebar, #menu-sidebar");
      if (!sidebar) return false;
      return sidebar.textContent.includes("수동 정렬") || sidebar.textContent.includes("manual sort");
    });
    evidence.tc057_sidebarHasSortQuery = sidebarHasSortQuery;

    if (sidebarHasSortQuery) {
      throw new Error("TC-057 Bug3: Sidebar shows '수동 정렬 쿼리' after DnD — OP sort handler was triggered.");
    }

    // Bug 2 check: WP should be under sec2 in DOM WITHOUT page reload
    const domAfterDrag = await page.evaluate(({ section1Code, section2Code, wpId }) => {
      const rows = Array.prototype.slice.call(
        document.querySelectorAll("table.work-package-table tbody tr")
      );
      const sec1Idx = rows.findIndex((r) => r.getAttribute("data-abyz-taxonomy-code") === section1Code);
      const sec2Idx = rows.findIndex((r) => r.getAttribute("data-abyz-taxonomy-code") === section2Code);
      const wpIdx = rows.findIndex((r) => {
        return !!r.querySelector(`a[href*="/work_packages/${wpId}"]`);
      });
      return {
        sec1Idx,
        sec2Idx,
        wpIdx,
        wpUnderSec1: sec1Idx >= 0 && wpIdx === sec1Idx + 1,
        wpUnderSec2: sec2Idx >= 0 && wpIdx === sec2Idx + 1
      };
    }, { section1Code: fix.section1Code, section2Code: fix.section2Code, wpId: fix.wpId });

    evidence.tc057_domAfterDrag = domAfterDrag;

    if (!domAfterDrag.wpUnderSec2) {
      throw new Error(`TC-057 Bug2: WP not under sec2 in DOM after DnD (no reload). Indices: ${JSON.stringify(domAfterDrag)}`);
    }

    // Also verify after page reload (data persisted to DB)
    await page.reload({ waitUntil: "domcontentloaded" });
    await suppressOnboarding(page);
    await page.locator(`tr[data-abyz-taxonomy-code="${fix.section2Code}"]`).waitFor({ state: "visible", timeout: 60000 });
    await page.waitForTimeout(1000);

    await screenshot(page, "tc057-02-after-reload");
    evidence.screenshots.push("tc057-02-after-reload.png");

    const afterReload = await page.evaluate(({ section2Code, wpId }) => {
      const rows = Array.prototype.slice.call(
        document.querySelectorAll("table.work-package-table tbody tr")
      );
      const sec2Idx = rows.findIndex((r) => r.getAttribute("data-abyz-taxonomy-code") === section2Code);
      const wpIdx = rows.findIndex((r) => !!r.querySelector(`a[href*="/work_packages/${wpId}"]`));
      return { sec2Idx, wpIdx, wpUnderSec2: sec2Idx >= 0 && wpIdx === sec2Idx + 1 };
    }, { section2Code: fix.section2Code, wpId: fix.wpId });

    evidence.tc057_afterReload = afterReload;

    if (!afterReload.wpUnderSec2) {
      throw new Error(`TC-057: WP not under sec2 after reload (DB not updated). Indices: ${JSON.stringify(afterReload)}`);
    }

    passTc("TC-057", {
      dataTransferMarker: dragResult.dataTransferData,
      opSortApiCalls: opSortCalls.length,
      sidebarHasSortQuery,
      wpUnderSec2InDom: domAfterDrag.wpUnderSec2,
      wpUnderSec2AfterReload: afterReload.wpUnderSec2
    });
    console.log("TC-057: PASS");

    // ─── TC-058: Actual Project DnD ───────────────────────────────────────────────
    await page.goto(url("/projects"), { waitUntil: "domcontentloaded" });
    await suppressOnboarding(page);
    await page.locator(`tr[data-abyz-taxonomy-code="${fix.titleCode}"]`).waitFor({ state: "visible", timeout: 60000 });
    await page.locator(`tr[data-abyz-taxonomy-code="${fix.title2Code}"]`).waitFor({ state: "visible", timeout: 60000 });
    await page.waitForTimeout(1500);

    await screenshot(page, "tc058-00-before-drag");
    evidence.screenshots.push("tc058-00-before-drag.png");

    networkRequests.length = 0;

    // Find project drag handle
    const projHandleSelector = await page.evaluate(({ titleCode, projectIdentifier }) => {
      const rows = Array.prototype.slice.call(document.querySelectorAll("#project-table tbody tr"));
      for (const row of rows) {
        const parent = row.getAttribute("data-abyz-display-parent");
        if (parent !== titleCode) continue;
        // Check if this row links to our project
        const links = row.querySelectorAll('a[href*="/projects/"]');
        let matched = false;
        for (const l of links) {
          const m = l.getAttribute("href").match(/\/projects\/([^/?#]+)/);
          if (m && decodeURIComponent(m[1]) === projectIdentifier) { matched = true; break; }
        }
        if (!matched) continue;
        const handle = row.querySelector(".abyz-drag-handle");
        if (!handle) return null;
        const idx = rows.indexOf(row);
        handle.setAttribute("data-tc-proj-handle-idx", String(idx));
        return `[data-tc-proj-handle-idx="${idx}"]`;
      }
      return null;
    }, { titleCode: fix.titleCode, projectIdentifier: fix.projectIdentifier });

    if (!projHandleSelector) {
      throw new Error("TC-058: drag handle not found for project row");
    }

    const title2Selector = `tr[data-abyz-taxonomy-code="${fix.title2Code}"]`;

    const projDragResult = await simulateHtml5Drag(page, projHandleSelector, title2Selector);
    evidence.tc058_dragResult = projDragResult;

    if (!projDragResult.success) {
      throw new Error(`TC-058: DnD simulation failed: ${projDragResult.error}`);
    }

    if (!projDragResult.dataTransferData || projDragResult.dataTransferData.value !== "abyz-project-drag") {
      throw new Error(`TC-058: dataTransfer marker wrong: ${JSON.stringify(projDragResult.dataTransferData)}`);
    }

    await page.waitForTimeout(1500);

    await screenshot(page, "tc058-01-after-drag-no-reload");
    evidence.screenshots.push("tc058-01-after-drag-no-reload.png");

    const domAfterProjDrag = await page.evaluate(({ titleCode, title2Code, projectIdentifier }) => {
      const rows = Array.prototype.slice.call(document.querySelectorAll("#project-table tbody tr"));
      const title2Idx = rows.findIndex((r) => r.getAttribute("data-abyz-taxonomy-code") === title2Code);
      // Project row should now have data-abyz-display-parent === title2Code
      const projUnderTitle2 = rows.some((r) => {
        if (r.getAttribute("data-abyz-display-parent") !== title2Code) return false;
        const links = r.querySelectorAll('a[href*="/projects/"]');
        for (const l of links) {
          const m = l.getAttribute("href").match(/\/projects\/([^/?#]+)/);
          if (m && decodeURIComponent(m[1]) === projectIdentifier) return true;
        }
        return false;
      });
      return { title2Idx, projUnderTitle2 };
    }, { titleCode: fix.titleCode, title2Code: fix.title2Code, projectIdentifier: fix.projectIdentifier });

    evidence.tc058_domAfterDrag = domAfterProjDrag;

    if (!domAfterProjDrag.projUnderTitle2) {
      throw new Error(`TC-058 Bug2: Project not under title2 in DOM after DnD (no reload). ${JSON.stringify(domAfterProjDrag)}`);
    }

    // Verify after reload
    await page.reload({ waitUntil: "domcontentloaded" });
    await suppressOnboarding(page);
    await page.locator(`tr[data-abyz-taxonomy-code="${fix.title2Code}"]`).waitFor({ state: "visible", timeout: 60000 });
    await page.waitForTimeout(1000);

    await screenshot(page, "tc058-02-after-reload");
    evidence.screenshots.push("tc058-02-after-reload.png");

    const afterProjReload = await page.evaluate(({ title2Code, projectIdentifier }) => {
      const rows = Array.prototype.slice.call(document.querySelectorAll("#project-table tbody tr"));
      const projUnderTitle2 = rows.some((r) => {
        if (r.getAttribute("data-abyz-display-parent") !== title2Code) return false;
        const links = r.querySelectorAll('a[href*="/projects/"]');
        for (const l of links) {
          const m = l.getAttribute("href").match(/\/projects\/([^/?#]+)/);
          if (m && decodeURIComponent(m[1]) === projectIdentifier) return true;
        }
        return false;
      });
      return { projUnderTitle2 };
    }, { title2Code: fix.title2Code, projectIdentifier: fix.projectIdentifier });

    evidence.tc058_afterReload = afterProjReload;

    if (!afterProjReload.projUnderTitle2) {
      throw new Error(`TC-058: Project not under title2 after reload (DB not updated). ${JSON.stringify(afterProjReload)}`);
    }

    passTc("TC-058", {
      dataTransferMarker: projDragResult.dataTransferData,
      projUnderTitle2InDom: domAfterProjDrag.projUnderTitle2,
      projUnderTitle2AfterReload: afterProjReload.projUnderTitle2
    });
    console.log("TC-058: PASS");

    // ─── Final ────────────────────────────────────────────────────────────────────
    evidence.tcResults = tcResults;
    evidence.consoleMessages = consoleMessages;
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
