const fs = require("fs");
const path = require("path");
const { chromium } = require("playwright");

const baseUrl = process.env.OP_BASE_URL || "http://localhost:8087";
const username = process.env.OP_E2E_USER || "taxonomy.e2e";
const password = process.env.OP_E2E_PASSWORD;
const apiToken = process.env.OP_E2E_API_TOKEN;
const stamp = process.env.E2E_STAMP || new Date().toISOString().replace(/[-:.TZ]/g, "").slice(0, 14);
const resultDir = process.env.OP_E2E_RESULT_DIR || path.join("test-results", "op-taxonomy", stamp);

if (!password) {
  throw new Error("OP_E2E_PASSWORD is required");
}

if (!apiToken) {
  throw new Error("OP_E2E_API_TOKEN is required");
}

fs.mkdirSync(resultDir, { recursive: true });

function url(relativePath) {
  return new URL(relativePath, baseUrl).toString();
}

async function screenshot(page, name) {
  await page.screenshot({
    path: path.join(resultDir, `${name}.png`),
    fullPage: true
  });
}

async function waitForText(page, text, timeout = 90000) {
  await page.locator(`text=${text}`).first().waitFor({ state: "visible", timeout });
}

async function suppressOnboarding(page) {
  await page.addStyleTag({
    content: ".enjoyhint,.enjoyhint_disable_events{display:none!important;pointer-events:none!important;}"
  }).catch(() => {});
  await page.evaluate(() => {
    document.querySelectorAll(".enjoyhint,.enjoyhint_disable_events").forEach((element) => element.remove());
  }).catch(() => {});
}

async function clickAndSave(page) {
  await suppressOnboarding(page);
  await page.locator('[data-abyz-action="submit-modal"]').click();
  await page.locator("#abyz-taxonomy-modal-root").waitFor({ state: "detached", timeout: 90000 });
}

async function openProjectCreateMenu(page) {
  await suppressOnboarding(page);
  await page.locator('button[aria-label="추가"]').first().click();
  await page
    .locator('[role="menu"] [data-abyz-action="project-title"][data-taxonomy-type="title"]')
    .waitFor({ state: "visible", timeout: 90000 });
}

async function openWorkPackageCreateMenu(page) {
  await suppressOnboarding(page);
  await page.locator("button.add-work-package").first().click();
  await page
    .locator('#abyz-taxonomy-wp-create-menu [data-abyz-action="wp-section"]')
    .waitFor({ state: "visible", timeout: 90000 });
}

(async () => {
  const browser = await chromium.launch({
    headless: true,
    executablePath: process.env.CHROMIUM_PATH || "/usr/bin/chromium-browser"
  });
  const context = await browser.newContext({
    viewport: { width: 1440, height: 1000 },
    ignoreHTTPSErrors: true
  });
  await context.tracing.start({ screenshots: true, snapshots: true });

  const page = await context.newPage();
  const consoleMessages = [];
  page.on("console", (msg) => consoleMessages.push(`${msg.type()}: ${msg.text()}`));
  page.on("pageerror", (err) => consoleMessages.push(`pageerror: ${err.message}`));

  const titleName = `E2E 타이틀 ${stamp}`;
  const titleCode = `project.e2e.${stamp}`;
  const projectName = `E2E 프로젝트 ${stamp}`;
  const projectIdentifier = `e2e-taxonomy-${stamp.toLowerCase()}`;
  const sectionName = `E2E 섹션 ${stamp}`;
  const sectionCode = `wp.${projectIdentifier}.e2e.${stamp.toLowerCase()}`;
  const wpSubject = `E2E WP ${stamp}`;

  const evidence = {
    baseUrl,
    stamp,
    titleCode,
    projectIdentifier,
    sectionCode,
    workPackageSubject: wpSubject,
    screenshots: [],
    consoleMessages
  };

  try {
    await page.goto(url("/login"), { waitUntil: "domcontentloaded" });
    await page.locator("#username").fill(username);
    await page.locator("#password").fill(password);
    await Promise.all([
      page.waitForLoadState("domcontentloaded"),
      page.locator('form[data-test-selector="user-login--form"] button[type="submit"]').click()
    ]);
    await page.waitForURL((current) => !current.pathname.includes("/login"), { timeout: 90000 });
    await suppressOnboarding(page);

    await page.goto(url("/projects"), { waitUntil: "domcontentloaded" });
    await suppressOnboarding(page);
    if (await page.locator("#login-form").isVisible().catch(() => false)) {
      throw new Error("Login did not produce an authenticated OpenProject session");
    }
    await page.locator(".project-list-page").waitFor({ state: "visible", timeout: 90000 });
    await openProjectCreateMenu(page);
    await screenshot(page, "01-project-actions");
    evidence.screenshots.push("01-project-actions.png");

    await suppressOnboarding(page);
    await page.locator('[role="menu"] [data-abyz-action="project-title"][data-taxonomy-type="title"]').click();
    await page.locator('#abyz-taxonomy-modal-root input[name="name"]').fill(titleName);
    await page.locator('#abyz-taxonomy-modal-root input[name="code"]').fill(titleCode);
    await clickAndSave(page);
    await waitForText(page, titleName);
    await screenshot(page, "02-project-title-row");
    evidence.screenshots.push("02-project-title-row.png");

    await page
      .locator('[data-test-selector="abyz-taxonomy-project-title-row"]')
      .filter({ hasText: titleName })
      .locator('[data-abyz-action="project-under-title"]')
      .click();
    await page.locator('#abyz-taxonomy-modal-root select[name="titleCode"]').selectOption(titleCode);
    await page.locator('#abyz-taxonomy-modal-root input[name="name"]').fill(projectName);
    await page.locator('#abyz-taxonomy-modal-root input[name="identifier"]').fill(projectIdentifier);
    await clickAndSave(page);
    await page.waitForTimeout(3000);
    await page.goto(url("/projects"), { waitUntil: "domcontentloaded" });
    await suppressOnboarding(page);
    await waitForText(page, titleName);
    await waitForText(page, projectName);
    await screenshot(page, "03-project-under-title");
    evidence.screenshots.push("03-project-under-title.png");
    evidence.projectListOrder = await page.evaluate(({ titleCode, projectIdentifier }) => {
      const projectIdentifierFromHref = (href) => {
        const match = String(href || "").match(/\/projects\/([^/?#]+)\/?(?:[?#].*)?$/);
        return match && match[1] !== "new" ? decodeURIComponent(match[1]) : null;
      };
      const projectIdentifierFromRow = (row) => {
        const links = Array.from(row.querySelectorAll('a[href*="/projects/"]'));
        for (const link of links) {
          const identifier = projectIdentifierFromHref(link.getAttribute("href"));
          if (identifier) return identifier;
        }
        return null;
      };
      const rows = Array.from(document.querySelectorAll("#project-table tbody tr")).map((row, index) => {
        return {
          index,
          taxonomyCode: row.getAttribute("data-abyz-taxonomy-code"),
          projectIdentifier: projectIdentifierFromRow(row),
          text: row.innerText.trim().replace(/\s+/g, " ")
        };
      });
      const titleIndex = rows.findIndex((row) => row.taxonomyCode === titleCode);
      const projectIndex = rows.findIndex((row) => row.projectIdentifier === projectIdentifier);
      return {
        titleIndex,
        projectIndex,
        adjacent: titleIndex >= 0 && projectIndex === titleIndex + 1,
        rows: rows.slice(Math.max(0, titleIndex - 1), projectIndex + 2)
      };
    }, { titleCode, projectIdentifier });

    if (!evidence.projectListOrder.adjacent) {
      throw new Error(`Project title/project adjacency failed: ${JSON.stringify(evidence.projectListOrder)}`);
    }

    await page.goto(url(`/projects/${projectIdentifier}/work_packages`), { waitUntil: "domcontentloaded" });
    await suppressOnboarding(page);
    await page.locator(".wp-create-button").waitFor({ state: "visible", timeout: 120000 });
    await openWorkPackageCreateMenu(page);
    await screenshot(page, "04-wp-actions");
    evidence.screenshots.push("04-wp-actions.png");

    await suppressOnboarding(page);
    await page.locator('#abyz-taxonomy-wp-create-menu [data-abyz-action="wp-section"]').click();
    await page.locator('#abyz-taxonomy-modal-root input[name="name"]').fill(sectionName);
    await page.locator('#abyz-taxonomy-modal-root input[name="code"]').fill(sectionCode);
    await clickAndSave(page);
    await waitForText(page, sectionName);
    await screenshot(page, "05-wp-section-row");
    evidence.screenshots.push("05-wp-section-row.png");

    await openWorkPackageCreateMenu(page);
    await page.locator('#abyz-taxonomy-wp-create-menu [data-abyz-action="wp-under-section"]').click();
    await page.locator('#abyz-taxonomy-modal-root select[name="sectionCode"]').selectOption(sectionCode);
    await page.locator('#abyz-taxonomy-modal-root input[name="subject"]').fill(wpSubject);
    await clickAndSave(page);
    await page.waitForTimeout(5000);
    await page.goto(url(`/projects/${projectIdentifier}/work_packages`), { waitUntil: "domcontentloaded" });
    await suppressOnboarding(page);
    await waitForText(page, sectionName);
    await waitForText(page, wpSubject);
    await screenshot(page, "06-wp-under-section");
    evidence.screenshots.push("06-wp-under-section.png");
    await page.goto(url(`/projects/${projectIdentifier}/gantt`), { waitUntil: "domcontentloaded" });
    await suppressOnboarding(page);
    await waitForText(page, sectionName);
    await waitForText(page, wpSubject);
    await screenshot(page, "07-gantt-under-section");
    evidence.screenshots.push("07-gantt-under-section.png");
    evidence.ganttOrder = await page.evaluate(({ sectionCode, wpSubject }) => {
      const rows = Array.from(document.querySelectorAll("table.work-package-table tbody tr")).map((row, index) => {
        return {
          index,
          taxonomyCode: row.getAttribute("data-abyz-taxonomy-code"),
          workPackageId: row.getAttribute("data-work-package-id"),
          text: row.innerText.trim().replace(/\s+/g, " ")
        };
      });
      const sectionIndex = rows.findIndex((row) => row.taxonomyCode === sectionCode);
      const workPackageIndex = rows.findIndex((row) => row.text.includes(wpSubject));
      return {
        sectionIndex,
        workPackageIndex,
        adjacent: sectionIndex >= 0 && workPackageIndex === sectionIndex + 1,
        rows: rows.slice(Math.max(0, sectionIndex - 1), workPackageIndex + 2)
      };
    }, { sectionCode, wpSubject });

    if (!evidence.ganttOrder.adjacent) {
      throw new Error(`Gantt section/WP adjacency failed: ${JSON.stringify(evidence.ganttOrder)}`);
    }

    const tree = await page.evaluate(async () => {
      const response = await fetch("/abyz_taxonomy/ui/tree", { credentials: "same-origin" });
      return response.json();
    });
    evidence.treeAssertion = {
      hasTitle: tree.projectTitles.some((entry) => entry.title.code === titleCode),
      hasProject: tree.projectTitles.some((entry) => entry.projects.some((project) => project.identifier === projectIdentifier)),
      hasSection: tree.wpSections.some((entry) => entry.section.code === sectionCode),
      hasWorkPackage: tree.wpSections.some((entry) => entry.workPackages.some((wp) => wp.subject === wpSubject))
    };

    if (!Object.values(evidence.treeAssertion).every(Boolean)) {
      throw new Error(`Tree assertion failed: ${JSON.stringify(evidence.treeAssertion)}`);
    }

    evidence.validationApi = await page.evaluate(async ({ sectionCode, projectIdentifier, stamp, apiToken }) => {
      const postValidate = async (payload) => {
        const response = await fetch("/api/v3/abyz_taxonomy/validate", {
          method: "POST",
          credentials: "same-origin",
          headers: {
            "Accept": "application/json",
            "Authorization": `Basic ${btoa(`apikey:${apiToken}`)}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify(payload)
        });
        return {
          status: response.status,
          body: await response.json()
        };
      };

      return {
        validSection: await postValidate({ taxonomyCode: sectionCode, projectIdentifier }),
        missingCode: await postValidate({ projectIdentifier }),
        unknownCode: await postValidate({ taxonomyCode: `wp.unknown.${stamp}`, projectIdentifier })
      };
    }, { sectionCode, projectIdentifier, stamp, apiToken });

    if (
      evidence.validationApi.validSection.status !== 200 ||
      evidence.validationApi.validSection.body.valid !== true ||
      evidence.validationApi.missingCode.status !== 422 ||
      evidence.validationApi.missingCode.body.valid !== false ||
      evidence.validationApi.unknownCode.status !== 422 ||
      evidence.validationApi.unknownCode.body.valid !== false
    ) {
      throw new Error(`Validation API assertion failed: ${JSON.stringify(evidence.validationApi)}`);
    }

    await context.tracing.stop({ path: path.join(resultDir, "trace.zip") });
    fs.writeFileSync(path.join(resultDir, "result.json"), JSON.stringify(evidence, null, 2));
    await browser.close();
  } catch (error) {
    evidence.error = error.message;
    await screenshot(page, "failure").catch(() => {});
    await context.tracing.stop({ path: path.join(resultDir, "trace.zip") }).catch(() => {});
    fs.writeFileSync(path.join(resultDir, "result.json"), JSON.stringify(evidence, null, 2));
    await browser.close();
    throw error;
  }
})();
