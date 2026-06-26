/**
 * 드래그 이동 전수 재검증 — 모든 화면 × 모든 이동 케이스, 진짜 마우스 + DB 변경
 *
 * 케이스 매트릭스:
 *   A1: 프로젝트 목록(/projects) — 타이틀 reorder
 *   A2: 프로젝트 목록 — 프로젝트 이동(타이틀 간)
 *   E1: 사이드바 드롭다운(#projects-menu) — 타이틀 reorder
 *   E2: 사이드바 드롭다운 — 프로젝트 이동(타이틀 간)  ← 핸들 없음 예상
 *   B:  WP 테이블 — 섹션 reorder
 *   D:  WP 테이블 — WP 이동(섹션 간)
 *
 * 판정: handleFound + 진짜 마우스 DnD + DB(API) 변경 3종 교차
 */
const fs = require("fs");
const path = require("path");
const { chromium } = require("playwright");
const baseUrl = "http://localhost:8087";
const rd = "/tmp/op-taxonomy-playwright-runner/full-out/full_" + Date.now();
fs.mkdirSync(rd, { recursive: true });
const results = { tcs: {} };
function log(m) { console.log("[full] " + m); }
function rec(id, s, d) { results.tcs[id] = { status: s, ...d }; log(id + ": " + s + (d.reason ? " — " + d.reason : "")); }

async function login(p) {
  await p.goto(baseUrl + "/login", { waitUntil: "domcontentloaded", timeout: 30000 });
  const f = "form[data-test-selector='user-login--form']";
  await p.locator(f + " input[name=username]").fill("taxonomy.e2e");
  await p.locator(f + " input[name=password]").fill("TaxonomyE2E2026!");
  await p.locator(f + " input[name=password]").press("Enter");
  await p.waitForTimeout(1500);
  await p.addStyleTag({ content: ".abyz-drag-handle{display:inline-block!important;visibility:visible!important;opacity:1!important;}" });
}
async function tree(p) { return p.evaluate(async () => { const r = await fetch("/api/v3/abyz_taxonomy/tree"); return r.ok ? await r.json() : null; }); }
function tpos(t) { return (t.projectTitles || []).map((e) => ({ code: e.title.code, pos: e.title.position, projects: (e.projects || []).map((p) => p.identifier) })); }
function spos(t, pid) { return (t.wpSections || []).filter((x) => x.project && x.project.identifier === pid).map((x) => ({ code: x.section.code, pos: x.section.position })); }
function pparent(t, iden) { for (const e of t.projectTitles || []) if ((e.projects || []).some((p) => p.identifier === iden)) return e.title.code; return null; }
function wpsec(t, pid, id) { const e = (t.wpSections || []).find((x) => x.project && x.project.identifier === pid && (x.workPackages || []).some((w) => String(w.id) === String(id))); return e ? e.section.code : null; }

// 진짜 마우스 DnD. handleLoc -> targetLoc. handle 없으면 {error}
async function realDrag(p, handleLoc, targetLoc) {
  const h = p.locator(handleLoc).first();
  const t = p.locator(targetLoc).first();
  const hc = await h.count();
  if (hc === 0) return { error: "no handle", handleLoc };
  const tc = await t.count();
  if (tc === 0) return { error: "no target", targetLoc };
  await h.scrollIntoViewIfNeeded().catch(() => {});
  await p.waitForTimeout(200);
  const hb = await h.boundingBox();
  const tb = await t.boundingBox();
  if (!hb || !tb) return { error: "no bbox" };
  const hx = hb.x + hb.width/2, hy = hb.y + hb.height/2;
  await p.mouse.move(hx, hy); await p.waitForTimeout(120);
  await p.mouse.down();
  await p.mouse.move(hx + 18, hy + 6, { steps: 6 }); await p.waitForTimeout(100);
  await p.mouse.move(tb.x + tb.width/2, tb.y + tb.height - 10, { steps: 20 }); await p.waitForTimeout(400);
  const ind = await p.evaluate((sel) => { const el = document.querySelector(sel); return el ? el.className : null; }, targetLoc);
  await p.mouse.up(); await p.waitForTimeout(1200);
  return { ok: true, indicator: ind };
}
// li 자체 드래그 시도 (핸들 없는 경우) — draggable=false면 dragstart 안 일어남
async function dragLi(p, liLoc, targetLoc) {
  const li = p.locator(liLoc).first();
  const t = p.locator(targetLoc).first();
  if ((await li.count()) === 0) return { error: "no li" };
  if ((await t.count()) === 0) return { error: "no target" };
  const hb = await li.boundingBox();
  const tb = await t.boundingBox();
  if (!hb || !tb) return { error: "no bbox" };
  await p.mouse.move(hb.x + hb.width/2, hb.y + hb.height/2); await p.waitForTimeout(120);
  await p.mouse.down();
  await p.mouse.move(hb.x + hb.width/2 + 20, hb.y + 10, { steps: 8 }); await p.waitForTimeout(100);
  await p.mouse.move(tb.x + tb.width/2, tb.y + tb.height/2, { steps: 20 }); await p.waitForTimeout(400);
  await p.mouse.up(); await p.waitForTimeout(1200);
  return { ok: true };
}

async function fixture(p) {
  const s = "fix" + String(Date.now()).slice(-10);
  const pid = "fix-" + s;
  const s1 = "wp." + pid + ".s1", s2 = "wp." + pid + ".s2";
  const tr = await tree(p);
  const tc0 = (tr.projectTitles || [])[0].title.code;
  const post = (pa, b) => p.evaluate(async ({ pa, b }) => { const r = await fetch(pa, { method: "POST", credentials: "same-origin", headers: { Accept: "application/json", "Content-Type": "application/json", "X-CSRF-Token": document.querySelector('meta[name="csrf-token"]')?.content || "" }, body: JSON.stringify(b) }); return { status: r.status }; }, { pa, b });
  await post("/abyz_taxonomy/ui/projects", { titleCode: tc0, name: "Fix " + s, identifier: pid });
  await post("/abyz_taxonomy/ui/wp_sections", { projectIdentifier: pid, name: "FixS1 " + s, code: s1 });
  await post("/abyz_taxonomy/ui/wp_sections", { projectIdentifier: pid, name: "FixS2 " + s, code: s2 });
  const wp = await p.evaluate(async ({ pid, s1, s }) => { const r = await fetch("/abyz_taxonomy/ui/work_packages", { method: "POST", credentials: "same-origin", headers: { Accept: "application/json", "Content-Type": "application/json", "X-CSRF-Token": document.querySelector('meta[name="csrf-token"]')?.content || "" }, body: JSON.stringify({ projectIdentifier: pid, sectionCode: s1, subject: "Fix WP " + s }) }); return { body: await r.json().catch(() => ({})) }; }, { pid, s1, s });
  return { pid, s1, s2, wpId: wp.body && wp.body.workPackage && wp.body.workPackage.id };
}

(async () => {
  const b = await chromium.launch({ headless: true });
  const c = await b.newContext({ viewport: { width: 1440, height: 900 } });
  const p = await c.newPage();
  try {
    await login(p);
    log("logged in");

    // A1: 목록 타이틀 reorder
    try {
      await p.goto(baseUrl + "/projects", { waitUntil: "domcontentloaded", timeout: 60000 });
      await p.waitForTimeout(5000);
      const rows = await p.$$eval(".abyz-taxonomy-project-title-row[data-abyz-taxonomy-code]", (e) => e.map((x) => x.getAttribute("data-abyz-taxonomy-code")));
      const before = tpos(await tree(p));
      const h = '.abyz-taxonomy-project-title-row[data-abyz-taxonomy-code="' + rows[0] + '"] .abyz-reorder-handle';
      const t = '.abyz-taxonomy-project-title-row[data-abyz-taxonomy-code="' + rows[1] + '"]';
      const r = await realDrag(p, h, t);
      if (r.error) rec("A1", "FAIL", { reason: r.error });
      else { const after = tpos(await tree(p)); const fb = before.find((x) => x.code === rows[0]).pos, fa = (after.find((x) => x.code === rows[0]) || {}).pos;
        rec("A1", fa !== fb ? "PASS" : "FAIL", { first: rows[0], fb, fa }); }
    } catch (e) { rec("A1", "ERROR", { reason: String(e) }); }

    // A2: 목록 프로젝트 이동 (타이틀 간)
    try {
      const tr = await tree(p);
      const vis = await p.$$eval("a.abyz-taxonomy-project-child-display-link[href]", (e) => e.map((x) => ({ id: x.getAttribute("href").split("/").pop() })));
      const vwp = vis.map((v) => ({ id: v.id, parent: pparent(tr, v.id) })).filter((v) => v.parent);
      const src = vwp[0]; const dst = tpos(tr).find((x) => x.code !== src.parent);
      const beforeP = src.parent;
      const h = 'tr:has(a.abyz-taxonomy-project-child-display-link[href="/projects/' + src.id + '"]) .abyz-drag-handle:not(.abyz-reorder-handle)';
      const handleFound = (await p.locator(h).count()) > 0;
      const r = await realDrag(p, h, '.abyz-taxonomy-project-title-row[data-abyz-taxonomy-code="' + dst.code + '"]');
      const afterP = pparent(await tree(p), src.id);
      if (!handleFound) rec("A2", "FAIL", { reason: "프로젝트 드래그 핸들 없음(목록)", projId: src.id });
      else rec("A2", afterP === dst.code ? "PASS" : "FAIL", { projId: src.id, beforeP, afterP, expected: dst.code, handleFound });
    } catch (e) { rec("A2", "ERROR", { reason: String(e) }); }

    // E1: 사이드바 타이틀 reorder
    try {
      await p.goto(baseUrl + "/projects", { waitUntil: "domcontentloaded", timeout: 60000 });
      await p.waitForTimeout(3000);
      await p.locator("#projects-menu").click().catch(() => {});
      await p.waitForTimeout(2500);
      const items = await p.$$eval(".abyz-taxonomy-project-select-title[data-abyz-taxonomy-code]", (e) => e.map((x) => x.getAttribute("data-abyz-taxonomy-code")));
      const before = tpos(await tree(p));
      const h = '.abyz-taxonomy-project-select-title[data-abyz-taxonomy-code="' + items[0] + '"] .abyz-reorder-handle';
      const t = '.abyz-taxonomy-project-select-title[data-abyz-taxonomy-code="' + items[1] + '"]';
      const r = await realDrag(p, h, t);
      if (r.error) rec("E1", "FAIL", { reason: r.error });
      else { const after = tpos(await tree(p)); const fb = before.find((x) => x.code === items[0]).pos, fa = (after.find((x) => x.code === items[0]) || {}).pos;
        rec("E1", fa !== fb ? "PASS" : "FAIL", { first: items[0], fb, fa }); }
    } catch (e) { rec("E1", "ERROR", { reason: String(e) }); }

    // E2: 사이드바 프로젝트 이동 (타이틀 간) — 핸들 없음 예상
    try {
      const tr = await tree(p);
      // 사이드바에서 프로젝트 항목(비타이틀, display-parent 있음) 식별
      const info = await p.evaluate(() => {
        const list = document.querySelector("#op-header-project-select-listbox, [data-test-selector='op-header-project-select--list']");
        if (!list) return null;
        const projs = Array.from(list.querySelectorAll("li")).filter((li) => !li.classList.contains("abyz-taxonomy-project-select-title")).map((li) => ({
          id: (li.querySelector("a[href*='/projects/']") || {}).href ? new URL(li.querySelector("a[href*=\"/projects/\"]").href).pathname.split("/").pop() : null,
          parent: li.getAttribute("data-abyz-display-parent"),
          hasDragHandle: !!li.querySelector(".abyz-drag-handle"),
          cls: li.className,
        })).filter((x) => x.id && x.parent);
        const titles = Array.from(list.querySelectorAll(".abyz-taxonomy-project-select-title")).map((li) => li.getAttribute("data-abyz-taxonomy-code"));
        return { projs, titles };
      });
      const src = info.projs[0];
      const dstTitle = info.titles.find((t) => t !== src.parent);
      const handleFound = src.hasDragHandle;
      let afterP = src.parent;
      if (handleFound) {
        // 핸들 있으면 진짜 드래그 시도 + move_project API 완료 대기 (비동기 refresh)
        // @MX:NOTE: sidebar project link href has ?jump=projects query — use *= partial match (#4)
        await realDrag(p, "li:has(a[href*=\"/projects/" + src.id + "\"]) .abyz-drag-handle", ".abyz-taxonomy-project-select-title[data-abyz-taxonomy-code=\"" + dstTitle + "\"]");
        try { await p.waitForResponse((r) => /move_project/.test(r.url()), { timeout: 5000 }); } catch (e) {}
        await p.waitForTimeout(1500);
        afterP = pparent(await tree(p), src.id);
        rec("E2", afterP === dstTitle ? "PASS" : "FAIL", { projId: src.id, beforeP: src.parent, afterP, expected: dstTitle, handleFound });
      } else {
        // 핸들 없으면 li 자체 드래그 시도 (draggable=false → dragstart 안 일어남)
        await dragLi(p, "li:has(a[href=\"/projects/" + src.id + "\"])", ".abyz-taxonomy-project-select-title[data-abyz-taxonomy-code=\"" + dstTitle + "\"]");
        afterP = pparent(await tree(p), src.id);
        rec("E2", "FAIL", { reason: "사이드바 프로젝트에 드래그 핸들 없음 → 이동 불가", projId: src.id, beforeP: src.parent, afterP, handleFound });
      }
    } catch (e) { rec("E2", "ERROR", { reason: String(e) }); }

    // B/D: WP 테이블
    try {
      const fx = await fixture(p);
      await p.goto(baseUrl + "/projects/" + fx.pid + "/work_packages", { waitUntil: "domcontentloaded", timeout: 60000 });
      await p.waitForTimeout(5000);
      const before = spos(await tree(p), fx.pid);
      const hb = '.abyz-taxonomy-wp-section-row[data-abyz-taxonomy-code="' + fx.s1 + '"] .abyz-reorder-handle';
      const tb = '.abyz-taxonomy-wp-section-row[data-abyz-taxonomy-code="' + fx.s2 + '"]';
      const rb = await realDrag(p, hb, tb);
      if (rb.error) rec("B", "FAIL", { reason: rb.error });
      else { const after = spos(await tree(p), fx.pid); const fb = (before.find((s) => s.code === fx.s1) || {}).pos, fa = (after.find((s) => s.code === fx.s1) || {}).pos;
        rec("B", fa !== fb ? "PASS" : "FAIL", { first: fx.s1, fb, fa }); }
      const bsec = wpsec(await tree(p), fx.pid, fx.wpId);
      await p.goto(baseUrl + "/projects/" + fx.pid + "/work_packages", { waitUntil: "domcontentloaded", timeout: 60000 });
      await p.waitForTimeout(5000);
      const hd = 'tr:has(a[href*="/work_packages/' + fx.wpId + '"]) .abyz-drag-handle:not(.abyz-reorder-handle)';
      const handleFound = (await p.locator(hd).count()) > 0;
      const rd = await realDrag(p, hd, '.abyz-taxonomy-wp-section-row[data-abyz-taxonomy-code="' + fx.s2 + '"]');
      const asec = wpsec(await tree(p), fx.pid, fx.wpId);
      rec("D", asec === fx.s2 ? "PASS" : "FAIL", { wpId: fx.wpId, bsec, asec, expected: fx.s2, handleFound });
    } catch (e) { rec("B/D", "ERROR", { reason: String(e) }); }

  } finally {
    fs.writeFileSync(path.join(rd, "result.json"), JSON.stringify(results, null, 2));
    log("SUMMARY: " + Object.entries(results.tcs).map(([k, v]) => k + "=" + v.status).join(" | "));
    log("dir: " + rd);
    await b.close();
  }
})();
