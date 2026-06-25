/**
 * TC-055 서버 tree API 진단
 * SEC-M에 WP 할당 → SEC-Z 추가 후 server tree JSON 직접 덤프
 * workPackageRenderSignature 계산값도 캡처
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

async function fetchTree(page) {
  return page.evaluate(async ({ baseUrl }) => {
    const r = await fetch(baseUrl + '/abyz_taxonomy/ui/tree', { credentials: 'same-origin' });
    return r.json();
  }, { baseUrl: BASE_URL });
}

async function captureSignature(page) {
  return page.evaluate(() => {
    const table = document.querySelector('table.work-package-table');
    const tbody = table?.querySelector('tbody.work-package--results-tbody');
    if (!table || !tbody) return null;
    return {
      domSig: table.dataset.abyzTaxonomySignature,
      domRows: Array.from(tbody.querySelectorAll('tr')).map(r => {
        const c = r.getAttribute('data-abyz-taxonomy-code');
        const lk = r.querySelector('a[href*="/work_packages/"]');
        const m = lk?.getAttribute('href')?.match(/\/work_packages\/(\d+)/);
        return c ? 's:' + c.split('.').pop() : (m ? 'w:' + m[1] : '?');
      })
    };
  });
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

  const pid = 'tree' + Date.now().toString().slice(-4);
  const projRes = await apiReq(page, 'POST', '/api/v3/projects', { identifier: pid, name: 'TREE-' + pid });
  const projectId = projRes.body.id;
  console.log(`[${ts()}] 프로젝트: ${pid} id=${projectId}`);

  const wpListUrl = BASE_URL + '/projects/' + pid + '/work_packages?query_props=%7B%22c%22%3A%5B%22id%22%2C%22subject%22%5D%7D';
  await page.goto(wpListUrl);
  await page.waitForSelector('table.work-package-table', { timeout: 15000 });
  await page.waitForTimeout(2000);

  // SEC-A + SEC-M 생성 및 WP 할당
  const s1 = await taxPost(page, '/abyz_taxonomy/ui/wp_sections', { name: 'Sec-A Alpha', projectIdentifier: pid });
  const secA = s1.body.section?.code;
  console.log(`[${ts()}] SEC-A: ${secA}`);

  const s2 = await taxPost(page, '/abyz_taxonomy/ui/wp_sections', { name: 'Sec-M Middle', projectIdentifier: pid });
  const secM = s2.body.section?.code;
  console.log(`[${ts()}] SEC-M: ${secM}`);

  const wpM = [];
  for (let i = 1; i <= 3; i++) {
    const wp = await taxPost(page, '/abyz_taxonomy/ui/work_packages', { projectIdentifier: pid, sectionCode: secM, subject: 'WP-M-' + i });
    wpM.push(wp.body.workPackage?.id);
  }
  console.log(`[${ts()}] WP-M IDs: ${wpM.join(',')}`);

  await page.reload();
  await page.waitForSelector('table.work-package-table tbody.work-package--results-tbody tr', { timeout: 15000 });
  await page.waitForTimeout(3000);

  // Tree API - SEC-Z 추가 전
  const treeBefore = await fetchTree(page);
  const wpSectionsBefore = treeBefore.wpSections || [];
  console.log(`\n[${ts()}] === TREE BEFORE (wpSections) ===`);
  wpSectionsBefore.forEach(e => {
    const wps = (e.workPackages || []).map(w => w.id).join(',');
    console.log(`  section=${e.section?.code} wps=[${wps}]`);
  });

  const sigBefore = await captureSignature(page);
  console.log(`[${ts()}] DOM sig (before): ${sigBefore?.domSig?.slice(0, 100)}`);
  console.log(`[${ts()}] DOM rows (before): ${sigBefore?.domRows?.join(' → ')}`);

  // SEC-Z 추가 via modal
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
        if (await submitBtn.count() > 0) {
          console.log(`\n[${ts()}] === 모달 제출 ===`);
          await submitBtn.click();
        }
      }
    }
  } else {
    await taxPost(page, '/abyz_taxonomy/ui/wp_sections', { name: 'Sec-Z Zeta', projectIdentifier: pid });
  }

  // 렌더 완료 대기
  await page.waitForTimeout(2000);

  // Tree API - SEC-Z 추가 후
  const treeAfter = await fetchTree(page);
  const wpSectionsAfter = treeAfter.wpSections || [];
  console.log(`\n[${ts()}] === TREE AFTER (wpSections) ===`);
  wpSectionsAfter.forEach(e => {
    const wps = (e.workPackages || []).map(w => w.id).join(',');
    console.log(`  section=${e.section?.code} wps=[${wps}]`);
  });

  const sigAfter = await captureSignature(page);
  console.log(`\n[${ts()}] DOM sig (after): ${sigAfter?.domSig?.slice(0, 120)}`);
  console.log(`[${ts()}] DOM rows (after): ${sigAfter?.domRows?.join(' → ')}`);

  // 판정
  console.log(`\n[${ts()}] === 판정 ===`);
  const rows = sigAfter?.domRows || [];
  const secMIdx = rows.indexOf('s:' + secM.split('.').pop());
  const secZIdx = rows.findIndex(r => r.startsWith('s:') && !r.includes('sec-a') && !r.includes('sec-m'));
  const wpMIdx = wpM.map(id => rows.indexOf('w:' + id));
  console.log(`secM=${secMIdx} WP-M=[${wpMIdx.join(',')}] secZ=${secZIdx}`);

  const allWpMBeforeSecZ = wpMIdx.every(pos => secZIdx < 0 || pos < secZIdx);
  console.log(allWpMBeforeSecZ ? '✅ CORRECT' : '❌ BUG: WP-M이 SEC-Z 아래에 있음 (TC-055!)');

  // tree API에서 WP-M이 SEC-Z에 잘못 배치됐는지도 확인
  const secZEntry = wpSectionsAfter.find(e => e.section?.code?.includes('sec-z'));
  if (secZEntry) {
    const secZWps = (secZEntry.workPackages || []).map(w => w.id);
    const misassigned = wpM.filter(id => secZWps.includes(id));
    if (misassigned.length) {
      console.log(`❌ SERVER BUG: WP ${misassigned.join(',')}가 서버에서도 SEC-Z에 잘못 배치됨`);
    } else {
      console.log('✅ SERVER: SEC-Z에 WP-M이 없음 (서버 데이터는 정상)');
    }
  }

  await apiReq(page, 'DELETE', '/api/v3/projects/' + projectId);
  await browser.close();
}

main().catch(e => { console.error(e); process.exit(1); });
