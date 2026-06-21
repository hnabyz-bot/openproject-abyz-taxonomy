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
  await page.locator('.project-list-page button[aria-label="추가"]').first().click();
  await page
    .locator('[data-abyz-menu-scope="project-list"][data-abyz-action="project-title"][data-taxonomy-type="title"]')
    .waitFor({ state: "visible", timeout: 90000 });
}

async function openGlobalQuickAddMenu(page) {
  await suppressOnboarding(page);
  await page.locator("#op-app-header--quick-add-menu-button").click();
  await page
    .locator('#op-app-header--quick-add-menu-list [data-abyz-menu-scope="global"][data-abyz-action="project-title"][data-taxonomy-type="title"]')
    .waitFor({ state: "visible", timeout: 90000 });
}

async function openWorkPackageCreateMenu(page) {
  await suppressOnboarding(page);
  await page.locator("button.add-work-package").first().click();
  await page
    .locator('#abyz-taxonomy-wp-create-menu [data-abyz-action="wp-section"]')
    .waitFor({ state: "visible", timeout: 90000 });
}

async function openNodeMenu(page, code) {
  await suppressOnboarding(page);
  await page.keyboard.press("Escape").catch(() => {});
  await page.locator('[data-test-selector="abyz-taxonomy-node-menu"]').waitFor({ state: "hidden", timeout: 5000 }).catch(() => {});
  await page.locator(`[data-abyz-taxonomy-code="${code}"] [data-abyz-action="open-node-menu"]`).first().click();
  await page.locator('[data-test-selector="abyz-taxonomy-node-menu"]').waitFor({ state: "visible", timeout: 90000 });
}

async function clickNodeMenuItem(page, text) {
  await page.locator('[data-test-selector="abyz-taxonomy-node-menu"]').getByText(text, { exact: true }).click();
}

async function updateNodeThroughSettings(page, evidence, code, name, taxonomyType, menuScreenshot, settingsScreenshot) {
  await openNodeMenu(page, code);
  await screenshot(page, menuScreenshot);
  evidence.screenshots.push(`${menuScreenshot}.png`);
  await clickNodeMenuItem(page, "타이틀 설정");
  await page.locator("#node_name").waitFor({ state: "visible", timeout: 90000 });
  await screenshot(page, settingsScreenshot);
  evidence.screenshots.push(`${settingsScreenshot}.png`);
  await page.locator("#node_name").fill(name);
  if (taxonomyType) {
    await page.locator("#node_taxonomy_type").selectOption(taxonomyType);
  }
  await Promise.all([
    page.waitForLoadState("domcontentloaded"),
    page.locator('button[type="submit"]').filter({ hasText: "세부 정보 업데이트" }).click()
  ]);
}

async function verifyNativeWorkPackageForm(page, projectIdentifier) {
  await page.keyboard.press("Escape").catch(() => {});
  await suppressOnboarding(page);
  await openWorkPackageCreateMenu(page);

  const formResponsePromise = page.waitForResponse((response) => {
    return response.request().method() === "POST" &&
      response.url().includes(`/api/v3/projects/${projectIdentifier}/work_packages/form`);
  }, { timeout: 90000 });

  await page.locator('#abyz-taxonomy-wp-create-menu [data-abyz-action="native-work-package"]').click();
  const formResponse = await formResponsePromise;

  if (formResponse.status() !== 200) {
    throw new Error(`Native work package form API failed: ${formResponse.status()} ${formResponse.url()}`);
  }

  return {
    status: formResponse.status(),
    url: formResponse.url()
  };
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
  const editedTitleName = `E2E 프로그램 편집 ${stamp}`;
  const editedTitleTypeLabel = "프로그램";
  const deleteTitleName = `E2E delete fixture ${stamp}`;
  const apiDeleteTitleName = `E2E API delete fixture ${stamp}`;
  const titleCode = `project.e2e-${stamp}`;
  const deleteTitleCode = `project.e2e-delete-fixture-${stamp}`;
  const apiDeleteTitleCode = `project.e2e-api-delete-${stamp}`;
  const projectName = `E2E 프로젝트 ${stamp}`;
  const projectIdentifier = `e2e-taxonomy-${stamp.toLowerCase()}`;
  const sectionName = `E2E 섹션 ${stamp}`;
  const editedSectionName = `E2E 섹션 편집 ${stamp}`;
  const sectionCode = `wp.${projectIdentifier}.e2e-${stamp.toLowerCase()}`;
  const wpSubject = `E2E WP ${stamp}`;
  const wpStartDate = "2026-06-22";
  const wpDueDate = "2026-06-26";

  const evidence = {
    baseUrl,
    stamp,
    titleCode,
    editedTitleName,
    editedTitleTypeLabel,
    projectIdentifier,
    sectionCode,
    editedSectionName,
    workPackageSubject: wpSubject,
    workPackageStartDate: wpStartDate,
    workPackageDueDate: wpDueDate,
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
    await openGlobalQuickAddMenu(page);
    await screenshot(page, "00-global-project-actions");
    evidence.screenshots.push("00-global-project-actions.png");
    await page.keyboard.press("Escape").catch(() => {});
    await suppressOnboarding(page);
    await openProjectCreateMenu(page);
    await screenshot(page, "01-project-actions");
    evidence.screenshots.push("01-project-actions.png");

    await suppressOnboarding(page);
    await page.locator('[data-abyz-menu-scope="project-list"][data-abyz-action="project-title"][data-taxonomy-type="title"]').click();
    await page.locator('#abyz-taxonomy-modal-root input[name="name"]').fill(titleName);
    await page.locator('#abyz-taxonomy-modal-root input[name="code"]').fill(titleCode);
    await clickAndSave(page);
    await page.locator(`[data-abyz-taxonomy-code="${titleCode}"]`).waitFor({ state: "visible", timeout: 90000 });
    await screenshot(page, "02-project-title-row");
    evidence.screenshots.push("02-project-title-row.png");

    evidence.projectTitleRowUxBeforeEdit = await page.evaluate((titleCode) => {
      const row = document.querySelector(`[data-abyz-taxonomy-code="${titleCode}"]`);
      return {
        hasVisibleEditButton: !!(row && Array.from(row.querySelectorAll("button")).some((button) => button.innerText.trim() === "편집")),
        hasVisibleDeleteButton: !!(row && Array.from(row.querySelectorAll("button")).some((button) => button.innerText.trim() === "삭제")),
        hasContextMenuButton: !!(row && row.querySelector('[data-abyz-action="open-node-menu"]'))
      };
    }, titleCode);
    if (
      evidence.projectTitleRowUxBeforeEdit.hasVisibleEditButton ||
      evidence.projectTitleRowUxBeforeEdit.hasVisibleDeleteButton ||
      !evidence.projectTitleRowUxBeforeEdit.hasContextMenuButton
    ) {
      throw new Error(`Project-like row UX assertion failed: ${JSON.stringify(evidence.projectTitleRowUxBeforeEdit)}`);
    }

    await updateNodeThroughSettings(page, evidence, titleCode, editedTitleName, "program", "02c-project-title-row-menu", "02d-project-title-settings");
    await page.goto(url("/projects"), { waitUntil: "domcontentloaded" });
    await suppressOnboarding(page);
    await waitForText(page, editedTitleName);
    await page.waitForFunction(({ titleCode, editedTitleTypeLabel }) => {
      const row = document.querySelector(`[data-abyz-taxonomy-code="${titleCode}"]`);
      return !!(row && row.innerText.includes(editedTitleTypeLabel));
    }, { titleCode, editedTitleTypeLabel }, { timeout: 90000 });
    await screenshot(page, "02b-project-title-edited");
    evidence.screenshots.push("02b-project-title-edited.png");
    evidence.projectTitleEditAssertion = await page.evaluate(({ titleCode, editedTitleName, editedTitleTypeLabel }) => {
      const row = document.querySelector(`[data-abyz-taxonomy-code="${titleCode}"]`);
      const text = row && row.innerText.trim().replace(/\s+/g, " ");
      return {
        text,
        hasEditedName: !!(text && text.includes(editedTitleName)),
        hasTypeLabel: !!(text && text.includes(editedTitleTypeLabel)),
        hidesInternalKind: !!(text && !text.includes("project_title"))
      };
    }, { titleCode, editedTitleName, editedTitleTypeLabel });
    if (
      !evidence.projectTitleEditAssertion.hasEditedName ||
      !evidence.projectTitleEditAssertion.hasTypeLabel ||
      !evidence.projectTitleEditAssertion.hidesInternalKind
    ) {
      throw new Error(`Project title edit assertion failed: ${JSON.stringify(evidence.projectTitleEditAssertion)}`);
    }

    await page.evaluate(async ({ deleteTitleName, deleteTitleCode }) => {
      const csrf = document.querySelector('meta[name="csrf-token"]')?.content;
      const response = await fetch("/abyz_taxonomy/ui/project_titles", {
        method: "POST",
        credentials: "same-origin",
        headers: {
          "Accept": "application/json",
          "Content-Type": "application/json",
          "X-CSRF-Token": csrf || ""
        },
        body: JSON.stringify({
          name: deleteTitleName,
          code: deleteTitleCode,
          taxonomyType: "title"
        })
      });
      if (!response.ok) {
        throw new Error(`delete fixture title create failed: ${response.status}`);
      }
    }, { deleteTitleName, deleteTitleCode });
    await page.goto(url("/projects"), { waitUntil: "domcontentloaded" });
    await suppressOnboarding(page);
    await waitForText(page, deleteTitleName);
    page.once("dialog", (dialog) => dialog.accept());
    await openNodeMenu(page, deleteTitleCode);
    await clickNodeMenuItem(page, "삭제");
    await page.waitForFunction((code) => !document.querySelector(`[data-abyz-taxonomy-code="${code}"]`), deleteTitleCode, { timeout: 90000 });
    evidence.deletedProjectTitle = true;

    await openNodeMenu(page, titleCode);
    await clickNodeMenuItem(page, "새 하위 프로젝트");
    await page.locator('#abyz-taxonomy-modal-root select[name="titleCode"]').selectOption(titleCode);
    await page.locator('#abyz-taxonomy-modal-root input[name="name"]').fill(projectName);
    await page.locator('#abyz-taxonomy-modal-root input[name="identifier"]').fill(projectIdentifier);
    await clickAndSave(page);
    await page.waitForTimeout(3000);
    await page.goto(url("/projects"), { waitUntil: "domcontentloaded" });
    await suppressOnboarding(page);
    await waitForText(page, editedTitleName);
    await waitForText(page, projectName);
    await page.locator(`[data-abyz-taxonomy-code="${titleCode}"]`).scrollIntoViewIfNeeded();
    await page.waitForTimeout(500);
    await screenshot(page, "03-project-under-title");
    evidence.screenshots.push("03-project-under-title.png");
    evidence.projectListOrder = await page.evaluate(({ titleCode, projectIdentifier, projectName }) => {
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
          hasProgramLabel: row.innerText.includes("프로그램"),
          hasContextMenuButton: !!row.querySelector('[data-abyz-action="open-node-menu"]'),
          hasVisibleEditButton: Array.from(row.querySelectorAll("button")).some((button) => button.innerText.trim() === "편집"),
          hasVisibleDeleteButton: Array.from(row.querySelectorAll("button")).some((button) => button.innerText.trim() === "삭제"),
          text: row.innerText.trim().replace(/\s+/g, " ")
        };
      });
      const titleIndex = rows.findIndex((row) => row.taxonomyCode === titleCode);
      const projectIndex = rows.findIndex((row) => row.projectIdentifier === projectIdentifier);
      const table = document.querySelector("#project-table");
      const titleRow = document.querySelector(`[data-abyz-taxonomy-code="${titleCode}"]`);
      const projectRow = Array.from(document.querySelectorAll("#project-table tbody tr")).find((row) => projectIdentifierFromRow(row) === projectIdentifier);
      const titleNameCell = titleRow && titleRow.querySelector("td.abyz-taxonomy-title-cell");
      const projectNameCell = projectRow && projectRow.querySelector("td.name");
      const titleLabel = titleNameCell && titleNameCell.querySelector(".abyz-taxonomy-row-label");
      const titleText = titleLabel && titleLabel.querySelector("span");
      const projectLink = projectRow && (
        projectRow.querySelector(".abyz-taxonomy-project-child-display-link") ||
        (projectNameCell && projectNameCell.querySelector('a[href*="/projects/"]'))
      );
      const tableRect = table && table.getBoundingClientRect();
      const titleLabelRect = titleLabel && titleLabel.getBoundingClientRect();
      const titleRect = titleText && titleText.getBoundingClientRect();
      const projectRect = projectLink && projectLink.getBoundingClientRect();
      const visualAlignment = {
        titleCellIndex: titleNameCell ? Array.from(titleRow.children).indexOf(titleNameCell) : -1,
        projectNameCellIndex: projectNameCell ? Array.from(projectRow.children).indexOf(projectNameCell) : -1,
        titleTextAlign: titleNameCell ? getComputedStyle(titleNameCell).textAlign : null,
        titleOffsetFromTable: tableRect && titleLabelRect ? Math.round(titleLabelRect.left - tableRect.left) : null,
        titleLeft: titleRect ? Math.round(titleRect.left) : null,
        childProjectLeft: projectRect ? Math.round(projectRect.left) : null,
        indentPx: titleRect && projectRect ? Math.round(projectRect.left - titleRect.left) : null,
        childProjectText: projectLink ? projectLink.innerText.trim() : null
      };
      return {
        titleIndex,
        projectIndex,
        adjacent: titleIndex >= 0 && projectIndex === titleIndex + 1,
        titleHasProgramLabel: rows[titleIndex] && rows[titleIndex].hasProgramLabel,
        titleHasContextMenuButton: rows[titleIndex] && rows[titleIndex].hasContextMenuButton,
        titleHasVisibleEditButton: rows[titleIndex] && rows[titleIndex].hasVisibleEditButton,
        titleHasVisibleDeleteButton: rows[titleIndex] && rows[titleIndex].hasVisibleDeleteButton,
        visualAlignment,
        rows: rows.slice(Math.max(0, titleIndex - 1), projectIndex + 2)
      };
    }, { titleCode, projectIdentifier, projectName });

    if (
      !evidence.projectListOrder.adjacent ||
      !evidence.projectListOrder.titleHasProgramLabel ||
      !evidence.projectListOrder.titleHasContextMenuButton ||
      evidence.projectListOrder.titleHasVisibleEditButton ||
      evidence.projectListOrder.titleHasVisibleDeleteButton ||
      evidence.projectListOrder.visualAlignment.titleTextAlign !== "left" ||
      evidence.projectListOrder.visualAlignment.titleCellIndex !== 0 ||
      evidence.projectListOrder.visualAlignment.titleOffsetFromTable > 24 ||
      evidence.projectListOrder.visualAlignment.indentPx < 8 ||
      evidence.projectListOrder.visualAlignment.indentPx > 48 ||
      evidence.projectListOrder.visualAlignment.childProjectText !== projectName
    ) {
      throw new Error(`Project title/project adjacency failed: ${JSON.stringify(evidence.projectListOrder)}`);
    }

    await page.goto(url(`/projects/${projectIdentifier}/work_packages`), { waitUntil: "domcontentloaded" });
    await suppressOnboarding(page);
    await page.locator(".wp-create-button").waitFor({ state: "visible", timeout: 120000 });
    await page.locator('[data-test-selector="op-projects-menu"]').click();
    await page
      .locator(`[data-test-selector="op-header-project-select--list"] .abyz-taxonomy-project-select-title[data-abyz-taxonomy-code="${titleCode}"]`)
      .waitFor({ state: "visible", timeout: 90000 });
    await page.evaluate((titleCode) => {
      document
        .querySelector(`[data-test-selector="op-header-project-select--list"] .abyz-taxonomy-project-select-title[data-abyz-taxonomy-code="${titleCode}"]`)
        ?.scrollIntoView({ block: "center" });
    }, titleCode);
    await page.waitForTimeout(500);
    await screenshot(page, "03b-project-selector-taxonomy");
    evidence.screenshots.push("03b-project-selector-taxonomy.png");
    evidence.projectSelectorOrder = await page.evaluate(({ titleCode, projectIdentifier }) => {
      const identifierFromHref = (href) => {
        const match = String(href || "").match(/\/projects\/([^/?#]+)\/?(?:[?#].*)?$/);
        return match && match[1] !== "new" ? decodeURIComponent(match[1]) : null;
      };
      const rows = Array.from(document.querySelectorAll('[data-test-selector="op-header-project-select--list"] li[data-test-selector="op-header-project-select--item"]')).map((row, index) => {
        const link = row.querySelector('a[href*="/projects/"]');
        return {
          index,
          taxonomyCode: row.getAttribute("data-abyz-taxonomy-code"),
          projectIdentifier: link && identifierFromHref(link.getAttribute("href")),
          hasAnyButton: !!row.querySelector("button"),
          hasProgramLabel: row.innerText.includes("프로그램"),
          text: row.innerText.trim().replace(/\s+/g, " ")
        };
      });
      const titleIndex = rows.findIndex((row) => row.taxonomyCode === titleCode);
      const projectIndex = rows.findIndex((row) => row.projectIdentifier === projectIdentifier);
      const list = document.querySelector('[data-test-selector="op-header-project-select--list"]');
      const titleRow = list && list.querySelector(`.abyz-taxonomy-project-select-title[data-abyz-taxonomy-code="${titleCode}"]`);
      const projectRow = Array.from(document.querySelectorAll('[data-test-selector="op-header-project-select--list"] li[data-test-selector="op-header-project-select--item"]')).find((row) => {
        const link = row.querySelector('a[href*="/projects/"]');
        return link && identifierFromHref(link.getAttribute("href")) === projectIdentifier;
      });
      const listRect = list && list.getBoundingClientRect();
      const titleLabel = titleRow && titleRow.querySelector(".abyz-taxonomy-project-select-title-label");
      const projectLink = projectRow && projectRow.querySelector('a[href*="/projects/"]');
      const projectLabel = projectRow && (
        projectRow.querySelector('[data-test-selector="op-header-project-select--item-title"] span') ||
        projectRow.querySelector('[data-test-selector="op-header-project-select--item-title"]') ||
        projectLink
      );
      const titleRect = titleLabel && titleLabel.getBoundingClientRect();
      const projectRect = projectLabel && projectLabel.getBoundingClientRect();
      const visualAlignment = {
        titleOffsetFromList: listRect && titleRect ? Math.round(titleRect.left - listRect.left) : null,
        indentPx: titleRect && projectRect ? Math.round(projectRect.left - titleRect.left) : null,
        titleTextAlign: titleRow ? getComputedStyle(titleRow.querySelector(".abyz-taxonomy-project-select-title-action")).textAlign : null,
        titleLabelText: titleLabel ? titleLabel.innerText.trim() : null,
        projectText: projectLabel ? projectLabel.innerText.trim() : null
      };
      return {
        titleIndex,
        projectIndex,
        adjacent: titleIndex >= 0 && projectIndex === titleIndex + 1,
        titleHasAnyButton: rows[titleIndex] && rows[titleIndex].hasAnyButton,
        titleHasProgramLabel: rows[titleIndex] && rows[titleIndex].hasProgramLabel,
        visualAlignment,
        rows: rows.slice(Math.max(0, titleIndex - 1), projectIndex + 2)
      };
    }, { titleCode, projectIdentifier });
    if (
      !evidence.projectSelectorOrder.adjacent ||
      evidence.projectSelectorOrder.titleHasAnyButton ||
      !evidence.projectSelectorOrder.titleHasProgramLabel ||
      evidence.projectSelectorOrder.visualAlignment.titleTextAlign !== "left" ||
      evidence.projectSelectorOrder.visualAlignment.titleOffsetFromList > 24 ||
      evidence.projectSelectorOrder.visualAlignment.indentPx < 8
    ) {
      throw new Error(`Project selector taxonomy assertion failed: ${JSON.stringify(evidence.projectSelectorOrder)}`);
    }
    await page.keyboard.press("Escape").catch(() => {});
    await suppressOnboarding(page);
    await openGlobalQuickAddMenu(page);
    await page
      .locator('#op-app-header--quick-add-menu-list [data-abyz-menu-scope="global"][data-abyz-action="wp-section"]')
      .waitFor({ state: "visible", timeout: 90000 });
    await screenshot(page, "03b-global-project-wp-actions");
    evidence.screenshots.push("03b-global-project-wp-actions.png");
    await page.keyboard.press("Escape").catch(() => {});
    await suppressOnboarding(page);
    await openWorkPackageCreateMenu(page);
    await screenshot(page, "04-wp-actions");
    evidence.screenshots.push("04-wp-actions.png");
    evidence.nativeWorkPackageFormApi = await verifyNativeWorkPackageForm(page, projectIdentifier);
    await screenshot(page, "04b-native-wp-type-menu");
    evidence.screenshots.push("04b-native-wp-type-menu.png");
    await page.keyboard.press("Escape").catch(() => {});
    await suppressOnboarding(page);
    await openWorkPackageCreateMenu(page);

    await suppressOnboarding(page);
    await page.locator('#abyz-taxonomy-wp-create-menu [data-abyz-action="wp-section"]').click();
    await page.locator('#abyz-taxonomy-modal-root input[name="name"]').fill(sectionName);
    await page.locator('#abyz-taxonomy-modal-root input[name="code"]').fill(sectionCode);
    await clickAndSave(page);
    await waitForText(page, sectionName);
    await screenshot(page, "05-wp-section-row");
    evidence.screenshots.push("05-wp-section-row.png");

    evidence.wpSectionRowUxBeforeEdit = await page.evaluate((sectionCode) => {
      const row = document.querySelector(`[data-abyz-taxonomy-code="${sectionCode}"]`);
      return {
        hasVisibleEditButton: !!(row && Array.from(row.querySelectorAll("button")).some((button) => button.innerText.trim() === "편집")),
        hasVisibleDeleteButton: !!(row && Array.from(row.querySelectorAll("button")).some((button) => button.innerText.trim() === "삭제")),
        hasVisibleWpAddButton: !!(row && Array.from(row.querySelectorAll("button")).some((button) => button.innerText.trim() === "WP 추가")),
        hasContextMenuButton: !!(row && row.querySelector('[data-abyz-action="open-node-menu"]'))
      };
    }, sectionCode);
    if (
      evidence.wpSectionRowUxBeforeEdit.hasVisibleEditButton ||
      evidence.wpSectionRowUxBeforeEdit.hasVisibleDeleteButton ||
      evidence.wpSectionRowUxBeforeEdit.hasVisibleWpAddButton ||
      !evidence.wpSectionRowUxBeforeEdit.hasContextMenuButton
    ) {
      throw new Error(`WP-like section row UX assertion failed: ${JSON.stringify(evidence.wpSectionRowUxBeforeEdit)}`);
    }

    await openNodeMenu(page, sectionCode);
    await screenshot(page, "05c-wp-section-row-menu");
    evidence.screenshots.push("05c-wp-section-row-menu.png");
    await clickNodeMenuItem(page, "자세히 보기");
    await page.locator("#node_name").waitFor({ state: "visible", timeout: 90000 });
    await screenshot(page, "05d-wp-section-settings");
    evidence.screenshots.push("05d-wp-section-settings.png");
    await page.locator("#node_name").fill(editedSectionName);
    await Promise.all([
      page.waitForLoadState("domcontentloaded"),
      page.locator('button[type="submit"]').filter({ hasText: "세부 정보 업데이트" }).click()
    ]);
    await page.goto(url(`/projects/${projectIdentifier}/work_packages`), { waitUntil: "domcontentloaded" });
    await suppressOnboarding(page);
    await waitForText(page, editedSectionName);
    await screenshot(page, "05b-wp-section-edited");
    evidence.screenshots.push("05b-wp-section-edited.png");

    await openNodeMenu(page, sectionCode);
    await clickNodeMenuItem(page, "새 작업 패키지 만들기");
    await page.locator('#abyz-taxonomy-modal-root select[name="sectionCode"]').selectOption(sectionCode);
    await page.locator('#abyz-taxonomy-modal-root input[name="subject"]').fill(wpSubject);
    await page.locator('#abyz-taxonomy-modal-root input[name="startDate"]').fill(wpStartDate);
    await page.locator('#abyz-taxonomy-modal-root input[name="dueDate"]').fill(wpDueDate);
    await clickAndSave(page);
    await page.waitForTimeout(5000);
    await page.goto(url(`/projects/${projectIdentifier}/work_packages`), { waitUntil: "domcontentloaded" });
    await suppressOnboarding(page);
    await waitForText(page, editedSectionName);
    await waitForText(page, wpSubject);
    await screenshot(page, "06-wp-under-section");
    evidence.screenshots.push("06-wp-under-section.png");
    await page.goto(url(`/projects/${projectIdentifier}/gantt`), { waitUntil: "domcontentloaded" });
    await suppressOnboarding(page);
    await waitForText(page, editedSectionName);
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

    evidence.ganttTimelineAlignment = await page.evaluate(({ sectionCode, wpSubject }) => {
      const rows = Array.from(document.querySelectorAll("table.work-package-table tbody tr")).map((row, index) => {
        const rect = row.getBoundingClientRect();
        return {
          index,
          taxonomyCode: row.getAttribute("data-abyz-taxonomy-code"),
          workPackageId: row.getAttribute("data-work-package-id"),
          text: row.innerText.trim().replace(/\s+/g, " "),
          y: Math.round(rect.y),
          height: Math.round(rect.height)
        };
      });
      const sectionRow = rows.find((row) => row.taxonomyCode === sectionCode);
      const workPackageRow = rows.find((row) => row.text.includes(wpSubject));
      const timelineSection = document.querySelector(`.abyz-taxonomy-gantt-section-row[data-abyz-taxonomy-code="${sectionCode}"]`);
      const timelineCell = workPackageRow && document.querySelector(`.wp-timeline-cell[data-work-package-id="${workPackageRow.workPackageId}"]`);
      const timelineBar = timelineCell && timelineCell.querySelector(".timeline-element.bar");
      const timelineSectionRect = timelineSection && timelineSection.getBoundingClientRect();
      const timelineCellRect = timelineCell && timelineCell.getBoundingClientRect();
      const timelineBarRect = timelineBar && timelineBar.getBoundingClientRect();

      return {
        sectionRow,
        workPackageRow,
        timelineSection: timelineSectionRect && {
          y: Math.round(timelineSectionRect.y),
          height: Math.round(timelineSectionRect.height),
          text: timelineSection.innerText.trim()
        },
        timelineCell: timelineCellRect && {
          workPackageId: timelineCell.getAttribute("data-work-package-id"),
          y: Math.round(timelineCellRect.y),
          height: Math.round(timelineCellRect.height)
        },
        timelineBar: timelineBarRect && {
          y: Math.round(timelineBarRect.y),
          width: Math.round(timelineBarRect.width),
          text: timelineBar.innerText.trim().replace(/\s+/g, " ")
        },
        aligned: !!(workPackageRow && timelineCellRect && Math.abs(workPackageRow.y - timelineCellRect.y) <= 3),
        hasBar: !!(timelineBarRect && timelineBarRect.width > 0)
      };
    }, { sectionCode, wpSubject });

    if (!evidence.ganttTimelineAlignment.aligned || !evidence.ganttTimelineAlignment.hasBar) {
      throw new Error(`Gantt timeline alignment failed: ${JSON.stringify(evidence.ganttTimelineAlignment)}`);
    }

    const tree = await page.evaluate(async () => {
      const response = await fetch("/abyz_taxonomy/ui/tree", { credentials: "same-origin" });
      return response.json();
    });
    evidence.treeAssertion = {
      hasTitle: tree.projectTitles.some((entry) => entry.title.code === titleCode && entry.title.name === editedTitleName),
      deletedTitleAbsent: !tree.projectTitles.some((entry) => entry.title.code === deleteTitleCode),
      titleTypeProgram: tree.projectTitles.some((entry) => entry.title.code === titleCode && entry.title.rules && entry.title.rules.taxonomyType === "program"),
      hasProject: tree.projectTitles.some((entry) => entry.projects.some((project) => project.identifier === projectIdentifier)),
      hasSection: tree.wpSections.some((entry) => entry.section.code === sectionCode && entry.section.name === editedSectionName),
      hasWorkPackage: tree.wpSections.some((entry) => entry.workPackages.some((wp) => wp.subject === wpSubject))
    };

    if (!Object.values(evidence.treeAssertion).every(Boolean)) {
      throw new Error(`Tree assertion failed: ${JSON.stringify(evidence.treeAssertion)}`);
    }

    evidence.nodeManagementApi = await page.evaluate(async ({ apiDeleteTitleName, apiDeleteTitleCode, apiToken }) => {
      const auth = `Basic ${btoa(`apikey:${apiToken}`)}`;
      const jsonRequest = async (path, options = {}) => {
        const response = await fetch(path, {
          credentials: "same-origin",
          ...options,
          headers: {
            "Accept": "application/json",
            "Authorization": auth,
            "Content-Type": "application/json",
            ...(options.headers || {})
          }
        });
        const text = await response.text();
        let body;
        try {
          body = JSON.parse(text);
        } catch (error) {
          body = { raw: text };
        }
        return {
          status: response.status,
          body
        };
      };
      const nodePath = `/api/v3/abyz_taxonomy/nodes/${encodeURIComponent(apiDeleteTitleCode)}`;
      const create = await jsonRequest("/api/v3/abyz_taxonomy/titles", {
        method: "POST",
        body: JSON.stringify({
          name: apiDeleteTitleName,
          code: apiDeleteTitleCode,
          taxonomyType: "portfolio"
        })
      });
      const patch = await jsonRequest(nodePath, {
        method: "PATCH",
        body: JSON.stringify({
          name: `${apiDeleteTitleName} patched`,
          taxonomyType: "program"
        })
      });
      const remove = await jsonRequest(nodePath, { method: "DELETE" });
      const treeResponse = await jsonRequest("/api/v3/abyz_taxonomy/tree", { method: "GET" });
      return {
        create,
        patch,
        remove,
        deletedAbsentFromTree: !treeResponse.body.projectTitles.some((entry) => entry.title.code === apiDeleteTitleCode)
      };
    }, { apiDeleteTitleName, apiDeleteTitleCode, apiToken });
    if (
      evidence.nodeManagementApi.create.status !== 201 ||
      evidence.nodeManagementApi.patch.status !== 200 ||
      evidence.nodeManagementApi.patch.body.node.rules.taxonomyType !== "program" ||
      evidence.nodeManagementApi.remove.status !== 200 ||
      evidence.nodeManagementApi.remove.body.active !== false ||
      evidence.nodeManagementApi.deletedAbsentFromTree !== true
    ) {
      throw new Error(`Node management API assertion failed: ${JSON.stringify(evidence.nodeManagementApi)}`);
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
