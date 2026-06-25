/**
 * /projects 목록에서 프로젝트 드래그 이동 → DB 반영 → 사이드바 드롭다운 동기화 검증
 * (사이드바 드래그 한계 대신 /projects가 주 경로임을 증명)
 */
const { chromium } = require("playwright");
(async () => {
  const b = await chromium.launch({ headless: true });
  const p = await b.newContext({ viewport: { width: 1440, height: 900 } }).then((c) => c.newPage());
  try {
    await p.goto("http://localhost:8087/login", { waitUntil: "domcontentloaded", timeout: 30000 });
    const f = "form[data-test-selector='user-login--form']";
    await p.locator(f + " input[name=username]").fill("taxonomy.e2e");
    await p.locator(f + " input[name=password]").fill("TaxonomyE2E2026!");
    await p.locator(f + " input[name=password]").press("Enter");
    await p.waitForTimeout(1500);
    await p.addStyleTag({ content: ".abyz-drag-handle{display:inline-block!important;visibility:visible!important;opacity:1!important;}" });

    // /projects 진입, src 프로젝트 + dst 타이틀 식별
    await p.goto("http://localhost:8087/projects", { waitUntil: "domcontentloaded", timeout: 60000 });
    await p.waitForTimeout(5000);
    const beforeTree = await p.evaluate(async () => { const r = await fetch("/api/v3/abyz_taxonomy/tree"); return await r.json(); });
    const tpos = beforeTree.projectTitles.map((e) => ({ code: e.title.code, projects: (e.projects || []).map((p) => p.identifier) }));
    const vis = await p.$$eval("a.abyz-taxonomy-project-child-display-link[href]", (e) => e.map((x) => ({ id: x.getAttribute("href").split("/").pop() })));
    const vwp = vis.map((v) => ({ id: v.id, parent: (beforeTree.projectTitles.find((e) => (e.projects || []).some((pr) => pr.identifier === v.id)) || {}).title.code })).filter((v) => v.parent);
    const src = vwp[0];
    const dst = tpos.find((t) => t.code !== src.parent);
    console.log("src=" + src.id + " beforeParent=" + src.parent + " dst=" + dst.code);

    // 사이드바 드롭다운: before 부모
    const sidebarBefore = await (async () => {
      await p.locator("#projects-menu").click();
      await p.waitForTimeout(2500);
      const sb = await p.evaluate((srcId) => {
        const list = document.querySelector("#op-header-project-select-listbox, [data-test-selector='op-header-project-select--list']");
        const li = Array.from(list.querySelectorAll("li")).find((l) => { const a = l.querySelector("a[href*='/projects/']"); return a && new URL(a.href).pathname.split("/").pop() === srcId; });
        return li ? li.getAttribute("data-abyz-display-parent") : null;
      }, src.id);
      // 드롭다운 닫기 (Esc)
      await p.keyboard.press("Escape").catch(() => {});
      await p.waitForTimeout(500);
      return sb;
    })();
    console.log("sidebarBefore=" + sidebarBefore);

    // realDrag: src handle → dst 타이틀 행
    const moveP = p.waitForResponse((r) => /move_project/.test(r.url()), { timeout: 8000 }).then((r) => ({ s: r.status() })).catch(() => ({ timeout: 1 }));
    const handle = p.locator("tr:has(a.abyz-taxonomy-project-child-display-link[href*='/projects/" + src.id + "']) .abyz-drag-handle:not(.abyz-reorder-handle)").first();
    const target = p.locator(".abyz-taxonomy-project-title-row[data-abyz-taxonomy-code='" + dst.code + "']").first();
    const hb = await handle.boundingBox(), tb = await target.boundingBox();
    await p.mouse.move(hb.x + hb.width/2, hb.y + hb.height/2); await p.waitForTimeout(150);
    await p.mouse.down(); await p.mouse.move(hb.x + 18, hb.y + 6, { steps: 6 }); await p.waitForTimeout(100);
    await p.mouse.move(tb.x + tb.width/2, tb.y + tb.height/2, { steps: 20 }); await p.waitForTimeout(500);
    await p.mouse.up(); await p.waitForTimeout(1800);
    const mp = await moveP;
    const afterParent_DB = await p.evaluate(async (srcId) => { const r = await fetch("/api/v3/abyz_taxonomy/tree"); const j = await r.json(); const e = j.projectTitles.find((e) => (e.projects || []).some((pr) => pr.identifier === srcId)); return e ? e.title.code : null; }, src.id);

    // 사이드바 드롭다운: after 부모 (DB 반영 → 사이드바 동기화)
    await p.waitForTimeout(1000);
    await p.locator("#projects-menu").click();
    await p.waitForTimeout(2500);
    const sidebarAfter = await p.evaluate((srcId) => {
      const list = document.querySelector("#op-header-project-select-listbox, [data-test-selector='op-header-project-select--list']");
      const li = Array.from(list.querySelectorAll("li")).find((l) => { const a = l.querySelector("a[href*='/projects/']"); return a && new URL(a.href).pathname.split("/").pop() === srcId; });
      return li ? li.getAttribute("data-abyz-display-parent") : null;
    }, src.id);

    console.log("move_project=" + JSON.stringify(mp) + " afterParent_DB=" + afterParent_DB);
    console.log("sidebarBefore=" + sidebarBefore + " sidebarAfter=" + sidebarAfter + " dst=" + dst.code);
    console.log("결과: /projects이동=" + (afterParent_DB === dst.code ? "PASS" : "FAIL") + " 사이드바동기화=" + (sidebarAfter === dst.code ? "PASS" : "FAIL"));
  } catch (e) { console.log("ERR " + e); }
  finally { await b.close(); }
})();
