/**
 * 진짜 마우스 기반 DnD 검증 (dispatchEvent 합성 이벤트 아님)
 * page.mouse 수동 제어: mousedown → mousemove steps → 인디케이터 캡처 → mouseup(drop)
 * 브라우저가 draggable=true 핸들에서 실제 dragstart/dragover/drop 이벤트 자동 발생
 *
 * 각 TC: before 스크린샷 → 드래그 중 인디케이터 스크린샷 → after 스크린샷 + DB position 변경 확인
 */
const fs = require("fs");
const path = require("path");
const { chromium } = require("playwright");

const baseUrl = "http://localhost:8087";
const user = "taxonomy.e2e";
const pass = "TaxonomyE2E2026!";
const rd = "/tmp/op-taxonomy-playwright-runner/real-out/real_" + Date.now();
fs.mkdirSync(rd, { recursive: true });
const results = { tcs: {} };
function log(m) { console.log("[real] " + m); }
function rec(id, status, detail) { results.tcs[id] = { status, ...detail }; log(id + ": " + status + (detail.reason ? " — " + detail.reason : "")); }

async function login(p) {
  await p.goto(baseUrl + "/login", { waitUntil: "domcontentloaded", timeout: 30000 });
  const f = 'form[data-test-selector="user-login--form"]';
  await p.locator(f + " input[name=username]").fill(user);
  await p.locator(f + " input[name=password]").fill(pass);
  await p.locator(f + " input[name=password]").press("Enter");
  await p.waitForURL((u) => !/\/login/.test(u.pathname), { timeout: 30000 }).catch(() => {});
  await p.waitForTimeout(1500);
  // 드래그 핸들 강제 표시 + 인디케이터를 굵은 빨간 선/배경으로 override (검증 목적 — 비전 분석에서 확실히 보이도록)
  await p.addStyleTag({ content: ".abyz-drag-handle{display:inline-block!important;visibility:visible!important;opacity:1!important;cursor:grab!important;width:18px!important;height:18px!important;}" +
    ".abyz-drop-insert-after td{border-bottom:8px solid red!important;box-shadow:inset 0 -8px 0 red!important;}" +
    ".abyz-drop-insert-before td{border-top:8px solid red!important;box-shadow:inset 0 8px 0 red!important;}" +
    ".abyz-drop-insert-after .abyz-taxonomy-row-inner, .abyz-drop-insert-after .abyz-taxonomy-project-select-title-action{background:rgba(255,0,0,0.18)!important;border-bottom:6px solid red!important;}" +
    ".abyz-drop-insert-before .abyz-taxonomy-row-inner, .abyz-drop-insert-before .abyz-taxonomy-project-select-title-action{background:rgba(255,0,0,0.18)!important;border-top:6px solid red!important;}" });
}

async function getTree(p) {
  return p.evaluate(async () => { const r = await fetch("/api/v3/abyz_taxonomy/tree", { headers: { Accept: "application/json" } }); return r.ok ? await r.json() : null; });
}
function titlePositions(t) { return (t.projectTitles || []).map((e) => ({ code: e.title.code, pos: e.title.position, projects: (e.projects || []).map((pr) => pr.identifier) })); }
function sectionPositions(t, pid) { return (t.wpSections || []).filter((x) => x.project && x.project.identifier === pid).map((x) => ({ code: x.section.code, pos: x.section.position })); }
function projectParent(t, iden) { for (const e of t.projectTitles || []) if ((e.projects || []).some((p) => p.identifier === iden)) return e.title.code; return null; }
function wpSection(t, pid, wpId) { const e = (t.wpSections || []).find((x) => x.project && x.project.identifier === pid && (x.workPackages || []).some((w) => String(w.id) === String(wpId))); return e ? e.section.code : null; }

// 진짜 마우스 DnD. handleLoc -> targetLoc. half: "top"(before)/"bottom"(after). shotMid: 중간 인디케이터 스크린샷 경로
async function realDrag(p, handleLoc, targetLoc, half, shotMid) {
  const handle = p.locator(handleLoc).first();
  const target = p.locator(targetLoc).first();
  if ((await handle.count()) === 0) return { error: "handle not found: " + handleLoc };
  if ((await target.count()) === 0) return { error: "target not found: " + targetLoc };
  await handle.scrollIntoViewIfNeeded().catch(() => {});
  await p.waitForTimeout(200);
  const hb = await handle.boundingBox();
  const tb = await target.boundingBox();
  if (!hb || !tb) return { error: "no boundingBox" };
  const hx = hb.x + hb.width / 2, hy = hb.y + hb.height / 2;
  // 1) 핸들 위로 마우스 이동 (hover) 후 mousedown
  await p.mouse.move(hx, hy);
  await p.waitForTimeout(150);
  await p.mouse.down();
  // 2) drag 임계치 이동 (브라우저가 dragstart 발생시키도록 살짝 이동)
  await p.mouse.move(hx + 18, hy + 6, { steps: 6 });
  await p.waitForTimeout(120);
  // 3) target으로 이동 (half 위치)
  const ty = half === "top" ? tb.y + 10 : tb.y + tb.height - 10;
  const tx = tb.x + tb.width / 2;
  await p.mouse.move(tx, ty, { steps: 20 });
  await p.waitForTimeout(500); // dragover 인디케이터 렌더 대기
  // 4) 인디케이터 스크린샷
  if (shotMid) await p.screenshot({ path: path.join(rd, shotMid), fullPage: true });
  // 인디케이터 클래스 캡처 (검증 증거)
  const indicator = await p.evaluate((sel) => { const el = document.querySelector(sel); return el ? el.className : null; }, targetLoc);
  // 5) mouseup = drop
  await p.mouse.up();
  await p.waitForTimeout(1200);
  return { ok: true, indicator };
}

async function setupWpFixtures(p) {
  const s = "rfix" + String(Date.now()).slice(-10);
  const pid = "rfix-" + s;
  const s1 = "wp." + pid + ".s1", s2 = "wp." + pid + ".s2";
  const tree = await getTree(p);
  const titleCode = (tree.projectTitles || [])[0].title.code;
  const post = (path2, body) => p.evaluate(async ({ path2, body }) => {
    const r = await fetch(path2, { method: "POST", credentials: "same-origin", headers: { Accept: "application/json", "Content-Type": "application/json", "X-CSRF-Token": document.querySelector('meta[name="csrf-token"]')?.content || "" }, body: JSON.stringify(body) });
    return { status: r.status };
  }, { path2, body });
  await post("/abyz_taxonomy/ui/projects", { titleCode, name: "RFix " + s, identifier: pid });
  await post("/abyz_taxonomy/ui/wp_sections", { projectIdentifier: pid, name: "RFix섹션1 " + s, code: s1 });
  await post("/abyz_taxonomy/ui/wp_sections", { projectIdentifier: pid, name: "RFix섹션2 " + s, code: s2 });
  const wp = await p.evaluate(async ({ pid, s1, s }) => {
    const r = await fetch("/abyz_taxonomy/ui/work_packages", { method: "POST", credentials: "same-origin", headers: { Accept: "application/json", "Content-Type": "application/json", "X-CSRF-Token": document.querySelector('meta[name="csrf-token"]')?.content || "" }, body: JSON.stringify({ projectIdentifier: pid, sectionCode: s1, subject: "RFix WP " + s }) });
    return { status: r.status, body: await r.json().catch(() => ({})) };
  }, { pid, s1, s });
  return { pid, s1, s2, wpId: wp.body && wp.body.workPackage && wp.body.workPackage.id };
}

(async () => {
  const browser = await chromium.launch({ headless: true });
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await ctx.newPage();
  try {
    await login(page);
    log("logged in");

    // ─── TC-A: 타이틀 reorder (진짜 마우스) ───
    try {
      await page.goto(baseUrl + "/projects", { waitUntil: "domcontentloaded", timeout: 60000 });
      await page.waitForTimeout(5000);
      const before = titlePositions(await getTree(page));
      const rows = await page.$$eval(".abyz-taxonomy-project-title-row[data-abyz-taxonomy-code]", (e) => e.map((x) => x.getAttribute("data-abyz-taxonomy-code")));
      await page.screenshot({ path: path.join(rd, "A_before.png"), fullPage: true });
      if (rows.length < 2) rec("TC-A", "SKIP", { reason: "타이틀 부족" });
      else {
        const first = rows[0], second = rows[1];
        const handleLoc = '.abyz-taxonomy-project-title-row[data-abyz-taxonomy-code="' + first + '"] .abyz-reorder-handle';
        const targetLoc = '.abyz-taxonomy-project-title-row[data-abyz-taxonomy-code="' + second + '"]';
        const r = await realDrag(page, handleLoc, targetLoc, "bottom", "A_mid.png");
        if (r.error) rec("TC-A", "FAIL", { reason: r.error });
        else {
          await page.screenshot({ path: path.join(rd, "A_after.png"), fullPage: true });
          const after = titlePositions(await getTree(page));
          const fb = before.find((t) => t.code === first).pos;
          const fa = (after.find((t) => t.code === first) || {}).pos;
          if (fa !== undefined && fa !== fb) rec("TC-A", "PASS", { first, firstBefore: fb, firstAfter: fa, indicator: r.indicator });
          else rec("TC-A", "FAIL", { reason: "position 미변경", fb, fa, indicator: r.indicator });
        }
      }
    } catch (e) { rec("TC-A", "ERROR", { reason: String(e) }); }

    // ─── TC-E: 사이드바 "모든 프로젝트" 타이틀 reorder (진짜 마우스) ───
    try {
      await page.goto(baseUrl + "/projects", { waitUntil: "domcontentloaded", timeout: 60000 });
      await page.waitForTimeout(3000);
      await page.locator("#projects-menu").click().catch(() => {});
      await page.waitForTimeout(2500);
      await page.screenshot({ path: path.join(rd, "E_before.png"), fullPage: true });
      const before = titlePositions(await getTree(page));
      const items = await page.$$eval(".abyz-taxonomy-project-select-title[data-abyz-taxonomy-code]", (e) => e.map((x) => x.getAttribute("data-abyz-taxonomy-code")));
      if (items.length < 2) rec("TC-E", "SKIP", { reason: "드롭다운 타이틀 부족" });
      else {
        const first = items[0], second = items[1];
        const handleLoc = '.abyz-taxonomy-project-select-title[data-abyz-taxonomy-code="' + first + '"] .abyz-reorder-handle';
        const targetLoc = '.abyz-taxonomy-project-select-title[data-abyz-taxonomy-code="' + second + '"]';
        const r = await realDrag(page, handleLoc, targetLoc, "bottom", "E_mid.png");
        if (r.error) rec("TC-E", "FAIL", { reason: r.error });
        else {
          const after = titlePositions(await getTree(page));
          const fb = before.find((t) => t.code === first).pos;
          const fa = (after.find((t) => t.code === first) || {}).pos;
          if (fa !== undefined && fa !== fb) rec("TC-E", "PASS", { first, firstBefore: fb, firstAfter: fa, indicator: r.indicator });
          else rec("TC-E", "FAIL", { reason: "position 미변경", fb, fa, indicator: r.indicator });
        }
      }
    } catch (e) { rec("TC-E", "ERROR", { reason: String(e) }); }

    // ─── TC-B: WP 섹션 reorder + TC-D: WP 이동 (fixture, 진짜 마우스) ───
    try {
      const fx = await setupWpFixtures(page);
      log("fixture: " + fx.pid + " wp=" + fx.wpId);
      await page.goto(baseUrl + "/projects/" + fx.pid + "/work_packages", { waitUntil: "domcontentloaded", timeout: 60000 });
      await page.waitForTimeout(5000);
      await page.screenshot({ path: path.join(rd, "B_before.png"), fullPage: true });
      const before = sectionPositions(await getTree(page), fx.pid);
      // TC-B 섹션 reorder
      const hb = '.abyz-taxonomy-wp-section-row[data-abyz-taxonomy-code="' + fx.s1 + '"] .abyz-reorder-handle';
      const tb = '.abyz-taxonomy-wp-section-row[data-abyz-taxonomy-code="' + fx.s2 + '"]';
      const rb = await realDrag(page, hb, tb, "bottom", "B_mid.png");
      if (rb.error) rec("TC-B", "FAIL", { reason: rb.error });
      else {
        await page.screenshot({ path: path.join(rd, "B_after.png"), fullPage: true });
        const after = sectionPositions(await getTree(page), fx.pid);
        const fb = (before.find((s) => s.code === fx.s1) || {}).pos;
        const fa = (after.find((s) => s.code === fx.s1) || {}).pos;
        if (fa !== undefined && fa !== fb) rec("TC-B", "PASS", { first: fx.s1, firstBefore: fb, firstAfter: fa, indicator: rb.indicator });
        else rec("TC-B", "FAIL", { reason: "position 미변경", fb, fa, indicator: rb.indicator });
      }
      // TC-D WP 이동 (s1->s2)
      const beforeSec = wpSection(await getTree(page), fx.pid, fx.wpId);
      await page.goto(baseUrl + "/projects/" + fx.pid + "/work_packages", { waitUntil: "domcontentloaded", timeout: 60000 });
      await page.waitForTimeout(5000);
      await page.screenshot({ path: path.join(rd, "D_before.png"), fullPage: true });
      const hd = 'tr:has(a[href*="/work_packages/' + fx.wpId + '"]) .abyz-drag-handle:not(.abyz-reorder-handle)';
      const td = '.abyz-taxonomy-wp-section-row[data-abyz-taxonomy-code="' + fx.s2 + '"]';
      const rd2 = await realDrag(page, hd, td, "bottom", "D_mid.png");
      if (rd2.error) rec("TC-D", "FAIL", { reason: rd2.error });
      else {
        await page.screenshot({ path: path.join(rd, "D_after.png"), fullPage: true });
        const afterSec = wpSection(await getTree(page), fx.pid, fx.wpId);
        if (afterSec === fx.s2) rec("TC-D", "PASS", { wpId: fx.wpId, beforeSec, afterSec, indicator: rd2.indicator });
        else rec("TC-D", "FAIL", { reason: "WP 섹션 미변경", beforeSec, afterSec, expected: fx.s2, indicator: rd2.indicator });
      }
    } catch (e) { rec("TC-B/TC-D", "ERROR", { reason: String(e) }); }

    // ─── TC-C: 프로젝트 이동 (DOM 보이는 프로젝트, 진짜 마우스) ───
    try {
      await page.goto(baseUrl + "/projects", { waitUntil: "domcontentloaded", timeout: 60000 });
      await page.waitForTimeout(5000);
      const beforeTree = await getTree(page);
      const before = titlePositions(beforeTree);
      const visible = await page.$$eval("a.abyz-taxonomy-project-child-display-link[href]", (e) => e.map((x) => ({ identifier: x.getAttribute("href").split("/").pop() })));
      const vwp = visible.map((v) => ({ identifier: v.identifier, parent: projectParent(beforeTree, v.identifier) })).filter((v) => v.parent);
      const src = vwp[0];
      const dst = before.find((t) => t.code !== (src && src.parent));
      if (!src || !dst) rec("TC-C", "SKIP", { reason: "이동 가능 프로젝트 부족" });
      else {
        const projId = src.identifier;
        const beforeParent = src.parent;
        await page.screenshot({ path: path.join(rd, "C_before.png"), fullPage: true });
        const hc = 'tr:has(a.abyz-taxonomy-project-child-display-link[href="/projects/' + projId + '"]) .abyz-drag-handle:not(.abyz-reorder-handle)';
        const tc = '.abyz-taxonomy-project-title-row[data-abyz-taxonomy-code="' + dst.code + '"]';
        const rc = await realDrag(page, hc, tc, "bottom", "C_mid.png");
        if (rc.error) rec("TC-C", "FAIL", { reason: rc.error, projId });
        else {
          await page.screenshot({ path: path.join(rd, "C_after.png"), fullPage: true });
          const afterParent = projectParent(await getTree(page), projId);
          if (afterParent === dst.code) rec("TC-C", "PASS", { projId, beforeParent, afterParent, dst: dst.code, indicator: rc.indicator });
          else rec("TC-C", "FAIL", { reason: "부모 미변경", beforeParent, afterParent, expected: dst.code, indicator: rc.indicator });
        }
      }
    } catch (e) { rec("TC-C", "ERROR", { reason: String(e) }); }

  } finally {
    fs.writeFileSync(path.join(rd, "result.json"), JSON.stringify(results, null, 2));
    log("SUMMARY: " + Object.entries(results.tcs).map(([k, v]) => k + "=" + v.status).join(" | "));
    log("dir: " + rd);
    await browser.close();
  }
})();
