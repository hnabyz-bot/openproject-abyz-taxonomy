/**
 * TC-055 진단 스크립트 — Angular mid-render race condition
 *
 * 검증 목표:
 *   SEC-M에 WP 5개 할당 → SEC-Z 추가 후, WP들이 SEC-M 아래 유지되는지 검증
 *
 * TC-055 근본 원인:
 *   Angular CD mid-render 중 WP 행에 <a href="/work_packages/N"> 링크가 없을 때
 *   workPackageRowMap()이 해당 행을 누락 → 미할당 취급 → SEC-Z 이후 배치
 *
 * 0.2.34 수정:
 *   realRows.forEach에서 링크 없는 행을 skip → 다음 refresh 사이클에서 정상 처리
 *
 * 헤드리스 Playwright에서는 Angular 렌더가 빠르게 완료돼 타이밍 창이 좁음.
 * 실 브라우저/대량 WP 환경에서 재현 가능.
 */
const { chromium } = require('/tmp/op-taxonomy-playwright-runner/node_modules/playwright');

const BASE_URL = process.env.OP_BASE_URL || 'http://localhost:8087';
const USER = process.env.OP_E2E_USER || 'taxonomy.e2e';
const PASS = process.env.OP_E2E_PASSWORD || 'TaxonomyE2E2026!';
const API_TOKEN = process.env.OP_E2E_API_TOKEN || 'opapi-1257353c8d3f0f5419bb1fbc5c4496098d24e650fe288a7a7faf23bdac5347fa';
const AUTH = 'Basic ' + Buffer.from('apikey:' + API_TOKEN).toString('base64');
const ts = () => new Date().toISOString().slice(11, 23);

async function apiReq(page, method, path2, body) {
  return page.evaluate(async ({ baseUrl, method, path2, auth, body }) => {
    const r = await fetch(baseUrl + path2, {
      method, credentials: 'same-origin',
      headers: { 'Authorization': auth, 'Content-Type': 'application/json', 'Accept': 'application/json' },
      body: body ? JSON.stringify(body) : undefined
    });
    return { status: r.status, body: await r.json().catch(() => ({})) };
  }, { baseUrl: BASE_URL, method, path2, auth: AUTH, body });
}

async function taxPost(page, path2, body) {
  return page.evaluate(async ({ baseUrl, path2, body }) => {
    const csrf = document.querySelector('meta[name="csrf-token"]')?.getAttribute('content') || '';
    const r = await fetch(baseUrl + path2, {
      method: 'POST', credentials: 'same-origin',
      headers: { 'X-CSRF-Token': csrf, 'Content-Type': 'application/json', 'Accept': 'application/json' },
      body: JSON.stringify(body)
    });
    return { status: r.status, body: await r.json().catch(() => ({})) };
  }, { baseUrl: BASE_URL, path2, body });
}

async function main() {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ viewport: { width: 1400, height: 900 } });
  const page = await context.newPage();

  await page.goto(BASE_URL + '/login');
  await page.locator('#login-form #username').fill(USER);
  await page.locator('#login-form #password').fill(PASS);
  await page.locator('form[data-test-selector="user-login--form"] button[type="submit"]').click();
  await page.waitForURL(url => !url.pathname.includes('/login'), { timeout: 20000 });

  const pid = 'rowmap' + Date.now().toString().slice(-4);
  const projRes = await apiReq(page, 'POST', '/api/v3/projects', { identifier: pid, name: 'ROWMAP-' + pid });
  const projectId = projRes.body.id;
  console.log(`[${ts()}] 프로젝트: ${pid} id=${projectId}`);

  const wpListUrl = BASE_URL + '/projects/' + pid + '/work_packages?query_props=%7B%22c%22%3A%5B%22id%22%2C%22subject%22%5D%7D';
  await page.goto(wpListUrl);
  await page.waitForSelector('table.work-package-table', { timeout: 15000 });
  await page.waitForTimeout(2000);

  // SEC-M + WP 5개 (알파벳 마지막 섹션)
  const s1 = await taxPost(page, '/abyz_taxonomy/ui/wp_sections', { name: 'Sec-M Middle', projectIdentifier: pid });
  const secM = s1.body.section?.code;
  console.log(`[${ts()}] SEC-M: ${secM}`);

  const wpIds = [];
  for (let i = 1; i <= 5; i++) {
    const wp = await taxPost(page, '/abyz_taxonomy/ui/work_packages', { projectIdentifier: pid, sectionCode: secM, subject: 'WP-M-' + i });
    wpIds.push(String(wp.body.workPackage?.id));
  }
  console.log(`[${ts()}] WP-M IDs: ${wpIds.join(',')}`);

  await page.reload();
  await page.waitForSelector('table.work-package-table tbody.work-package--results-tbody tr', { timeout: 15000 });
  await page.waitForTimeout(3000);

  // 현재 DOM에서 WP row들의 <a> 링크 상태 검사
  const rowAnalysis = await page.evaluate(({ wpIds }) => {
    const tbody = document.querySelector('table.work-package-table tbody.work-package--results-tbody');
    if (!tbody) return { error: 'no tbody' };

    const rows = Array.from(tbody.querySelectorAll('tr'));
    return rows.map(r => {
      const code = r.getAttribute('data-abyz-taxonomy-code');
      const links = Array.from(r.querySelectorAll('a[href*="/work_packages/"]'));
      const wpLink = links.find(a => {
        const m = a.getAttribute('href').match(/\/work_packages\/(\d+)/);
        return m && wpIds.includes(m[1]);
      });
      const anyLink = r.querySelector('a[href*="/work_packages/"]');
      return {
        isSectionRow: !!code,
        sectionCode: code,
        wpLinkFound: !!wpLink,
        anyWpLinkFound: !!anyLink,
        wpLinkHref: wpLink ? wpLink.getAttribute('href') : null,
        anyWpLinkHref: anyLink ? anyLink.getAttribute('href') : null,
        rowHtml: r.innerHTML.slice(0, 200)
      };
    });
  }, { wpIds });

  console.log(`\n[${ts()}] === DOM row 분석 ===`);
  rowAnalysis.forEach((r, i) => {
    if (r.error) { console.log(`  ERROR: ${r.error}`); return; }
    if (r.isSectionRow) {
      console.log(`  [${i}] SECTION: ${r.sectionCode}`);
    } else if (r.wpLinkFound) {
      console.log(`  [${i}] WP row ✅ link=${r.wpLinkHref}`);
    } else if (r.anyWpLinkFound) {
      console.log(`  [${i}] WP row ⚠️ anyLink=${r.anyWpLinkHref} (타겟WP 아님)`);
    } else {
      console.log(`  [${i}] row ❌ NO WP LINK | html: ${r.rowHtml.slice(0, 80)}`);
    }
  });

  // workPackageRowMap 시뮬레이션
  const rowMapResult = await page.evaluate(({ wpIds }) => {
    const tbody = document.querySelector('table.work-package-table tbody.work-package--results-tbody');
    if (!tbody) return { error: 'no tbody' };
    const map = {};
    let skipCount = 0;
    Array.from(tbody.querySelectorAll('tr')).forEach(row => {
      if (row.classList.contains('abyz-taxonomy-wp-section-row')) return;
      const link = row.querySelector('a[href*="/work_packages/"]');
      if (!link) { skipCount++; return; }
      const match = link.getAttribute('href').match(/\/work_packages\/(\d+)/);
      if (match) map[match[1]] = true;
    });
    const missing = wpIds.filter(id => !map[id]);
    return { mappedIds: Object.keys(map), missing, skipCount };
  }, { wpIds });

  console.log(`\n[${ts()}] === workPackageRowMap 시뮬레이션 ===`);
  console.log(`  매핑된 IDs: ${rowMapResult.mappedIds.join(',')}`);
  console.log(`  누락 IDs (SEC-M WP): ${rowMapResult.missing.join(',') || '없음'}`);
  console.log(`  링크 없는 행 수: ${rowMapResult.skipCount}`);

  if (rowMapResult.missing.length > 0) {
    console.log(`\n❌ BUG 경로 발견: WP ${rowMapResult.missing.join(',')}가 rowsById에 없음 → 미할당 풀에 빠짐`);
  } else {
    console.log(`\n✅ workPackageRowMap 정상: 모든 SEC-M WP 링크 탐지됨`);
  }

  // SEC-Z 추가 후 동일 검사
  console.log(`\n[${ts()}] === SEC-Z 추가 ===`);
  const addWpBtn = page.locator('button.add-work-package').first();
  if (await addWpBtn.count() > 0) {
    await addWpBtn.click({ force: true });
    await page.waitForTimeout(500);
    const menuBtn = page.locator('#abyz-taxonomy-wp-create-menu [data-abyz-action="wp-section"]');
    if (await menuBtn.count() > 0) {
      await menuBtn.click();
      await page.waitForTimeout(500);
      const nameInput = page.locator('#abyz-taxonomy-modal-root input[name="name"], #abyz-taxonomy-modal-root input[type="text"]').first();
      if (await nameInput.count() > 0) {
        await nameInput.fill('Sec-Z Zeta');
        let submitBtn = page.locator('#abyz-taxonomy-modal-root button[type="submit"]').first();
        if (await submitBtn.count() === 0)
          submitBtn = page.locator('#abyz-taxonomy-modal-root button').filter({ hasText: /확인|저장|추가|Submit|OK/i }).first();
        if (await submitBtn.count() > 0) await submitBtn.click();
      }
    }
  } else {
    await taxPost(page, '/abyz_taxonomy/ui/wp_sections', { name: 'Sec-Z Zeta', projectIdentifier: pid });
  }

  await page.waitForTimeout(2000);

  // SEC-Z 추가 후 재검사
  const rowMapAfter = await page.evaluate(({ wpIds }) => {
    const tbody = document.querySelector('table.work-package-table tbody.work-package--results-tbody');
    if (!tbody) return { error: 'no tbody' };
    const map = {};
    let skipCount = 0;
    Array.from(tbody.querySelectorAll('tr')).forEach(row => {
      if (row.classList.contains('abyz-taxonomy-wp-section-row')) return;
      const link = row.querySelector('a[href*="/work_packages/"]');
      if (!link) { skipCount++; return; }
      const match = link.getAttribute('href').match(/\/work_packages\/(\d+)/);
      if (match) map[match[1]] = true;
    });
    const missing = wpIds.filter(id => !map[id]);
    const rows = Array.from(tbody.querySelectorAll('tr')).map(r => {
      const c = r.getAttribute('data-abyz-taxonomy-code');
      const lk = r.querySelector('a[href*="/work_packages/"]');
      const m = lk?.getAttribute('href')?.match(/\/work_packages\/(\d+)/);
      return c ? 's:' + c.split('.').pop() : (m ? 'w:' + m[1] : '?');
    });
    return { mappedIds: Object.keys(map), missing, skipCount, rows };
  }, { wpIds });

  console.log(`\n[${ts()}] === SEC-Z 추가 후 rowMap ===`);
  console.log(`  매핑된 IDs: ${rowMapAfter.mappedIds.join(',')}`);
  console.log(`  누락 IDs: ${rowMapAfter.missing.join(',') || '없음'}`);
  console.log(`  링크 없는 행 수: ${rowMapAfter.skipCount}`);
  console.log(`  DOM rows: ${rowMapAfter.rows?.join(' → ')}`);

  const secMIdx = (rowMapAfter.rows || []).findIndex(r => r.includes('sec-m'));
  const secZIdx = (rowMapAfter.rows || []).findIndex(r => r.includes('sec-z'));
  const wpMAfterZ = wpIds.filter(id => {
    const pos = (rowMapAfter.rows || []).indexOf('w:' + id);
    return secZIdx >= 0 && pos > secZIdx;
  });

  if (wpMAfterZ.length > 0) {
    console.log(`\n❌ TC-055 BUG: WP ${wpMAfterZ.join(',')}가 SEC-Z 아래에 있음`);
  } else {
    console.log(`\n✅ TC-055 CORRECT: SEC-M WP들이 SEC-Z 아래로 이동하지 않음`);
  }

  await apiReq(page, 'DELETE', '/api/v3/projects/' + projectId);
  await browser.close();
}

main().catch(e => { console.error(e); process.exit(1); });
