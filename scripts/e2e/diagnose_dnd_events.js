/**
 * DnD 진단: page.mouse(수동) vs locator.dragAndDrop(공식) — 어느 쪽이 진짜 dragstart/dragover/drop 발생시키는가
 * TC-A(타이틀 reorder)로 검증. handle에 dragstart 감지, target에 dragover/drop 감지 카운터.
 */
const fs = require("fs");
const path = require("path");
const { chromium } = require("playwright");
const baseUrl = "http://localhost:8087";
const rd = "/tmp/op-taxonomy-playwright-runner/diag-out/diag_" + Date.now();
fs.mkdirSync(rd, { recursive: true });

async function login(p) {
  await p.goto(baseUrl + "/login", { waitUntil: "domcontentloaded", timeout: 30000 });
  const f = 'form[data-test-selector="user-login--form"]';
  await p.locator(f + " input[name=username]").fill("taxonomy.e2e");
  await p.locator(f + " input[name=password]").fill("TaxonomyE2E2026!");
  await p.locator(f + " input[name=password]").press("Enter");
  await p.waitForTimeout(1500);
  await p.addStyleTag({ content: ".abyz-drag-handle{display:inline-block!important;visibility:visible!important;opacity:1!important;}" });
}
async function getTree(p) { return p.evaluate(async () => { const r = await fetch("/api/v3/abyz_taxonomy/tree"); return r.ok ? await r.json() : null; }); }
function titlePos(t) { return (t.projectTitles || []).map((e) => ({ code: e.title.code, pos: e.title.position })); }

// 감지 리스너 부착
async function attachCounters(p, handleSel, targetSel) {
  await p.evaluate(({ handleSel, targetSel }) => {
    window.__dnd = { dragStart: 0, dragOver: 0, drop: 0, stateDragSet: false };
    const h = document.querySelector(handleSel);
    const t = document.querySelector(targetSel);
    if (h) h.addEventListener("dragstart", () => { window.__dnd.dragStart++; }, true);
    if (t) {
      t.addEventListener("dragover", () => { window.__dnd.dragOver++; }, true);
      t.addEventListener("drop", () => { window.__dnd.drop++; }, true);
    }
  }, { handleSel, targetSel });
}
async function resetCounters(p) { await p.evaluate(() => { window.__dnd = { dragStart: 0, dragOver: 0, drop: 0 }; }); }
async function readCounters(p) { return p.evaluate(() => window.__dnd); }

(async () => {
  const b = await chromium.launch({ headless: true });
  const c = await b.newContext({ viewport: { width: 1440, height: 900 } });
  const p = await c.newPage();
  try {
    await login(p);
    await p.goto(baseUrl + "/projects", { waitUntil: "domcontentloaded", timeout: 60000 });
    await p.waitForTimeout(5000);
    const rows = await p.$$eval(".abyz-taxonomy-project-title-row[data-abyz-taxonomy-code]", (e) => e.map((x) => x.getAttribute("data-abyz-taxonomy-code")));
    const first = rows[0], second = rows[1];
    const handleSel = '.abyz-taxonomy-project-title-row[data-abyz-taxonomy-code="' + first + '"] .abyz-reorder-handle';
    const targetSel = '.abyz-taxonomy-project-title-row[data-abyz-taxonomy-code="' + second + '"]';

    // ── (a) page.mouse 수동 ──
    await attachCounters(p, handleSel, targetSel);
    const beforeA = titlePos(await getTree(p));
    const handle = p.locator(handleSel).first();
    const target = p.locator(targetSel).first();
    await handle.scrollIntoViewIfNeeded().catch(() => {});
    const hb = await handle.boundingBox();
    const tb = await target.boundingBox();
    await p.mouse.move(hb.x + hb.width/2, hb.y + hb.height/2);
    await p.waitForTimeout(150);
    await p.mouse.down();
    await p.mouse.move(hb.x + hb.width/2 + 18, hb.y + hb.height/2 + 6, { steps: 6 });
    await p.mouse.move(tb.x + tb.width/2, tb.y + tb.height - 10, { steps: 20 });
    await p.waitForTimeout(500);
    await p.screenshot({ path: path.join(rd, "mouseA_mid.png"), fullPage: true });
    const cntMouseMid = await readCounters(p);
    await p.mouse.up();
    await p.waitForTimeout(1200);
    const cntMouse = await readCounters(p);
    const afterA = titlePos(await getTree(p));
    console.log("[A-mouse] counters=" + JSON.stringify(cntMouse) + " pos " + (beforeA.find(t=>t.code===first)||{}).pos + "->" + (afterA.find(t=>t.code===first)||{}).pos);

    // ── (b) locator.dragAndDrop ──
    await resetCounters(p);
    await attachCounters(p, handleSel, targetSel);
    const beforeB = titlePos(await getTree(p));
    let dndErr = null;
    try {
      await p.locator(handleSel).first().dragAndDrop(p.locator(targetSel).first(), { targetPosition: { x: 0, y: 50 }, force: true, timeout: 10000 });
    } catch (e) { dndErr = String(e).slice(0, 150); }
    await p.waitForTimeout(1500);
    const cntDnd = await readCounters(p);
    const afterB = titlePos(await getTree(p));
    await p.screenshot({ path: path.join(rd, "dndB_after.png"), fullPage: true });
    console.log("[B-dragAndDrop] err=" + dndErr + " counters=" + JSON.stringify(cntDnd) + " pos " + (beforeB.find(t=>t.code===first)||{}).pos + "->" + (afterB.find(t=>t.code===first)||{}).pos);

    console.log("dir=" + rd);
  } catch (e) { console.log("ERR " + e); }
  finally { await b.close(); }
})();
