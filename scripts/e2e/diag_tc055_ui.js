/**
 * TC-055 진단 스크립트 (UI 버전)
 * 실제 모달 UI를 통해 섹션을 추가하여 Angular CD 경쟁 조건을 관찰한다.
 * - 모달로 SEC-A 생성 → WP 할당 → DOM 모니터링 시작 → 모달로 SEC-B 생성
 * - 각 DOM mutation 순간의 tbody 상태를 1ms 단위로 기록
 */
const { chromium } = require('/tmp/op-taxonomy-playwright-runner/node_modules/playwright');

const BASE_URL = process.env.OP_BASE_URL || 'http://localhost:8087';
const USER = process.env.OP_E2E_USER || 'taxonomy.e2e';
const PASS = process.env.OP_E2E_PASSWORD;
if (!PASS) {
  throw new Error('OP_E2E_PASSWORD is required for TC-055 diagnostics');
}
const API_TOKEN = process.env.OP_E2E_API_TOKEN;
if (!API_TOKEN) {
  throw new Error('OP_E2E_API_TOKEN is required for TC-055 diagnostics');
}
const AUTH = 'Basic ' + Buffer.from('apikey:' + API_TOKEN).toString('base64');

const ts = () => new Date().toISOString().slice(11, 23);

async function apiReq(page, method, path, body) {
  return page.evaluate(async ({ baseUrl, method, path, auth, body }) => {
    const r = await fetch(baseUrl + path, {
      method,
      credentials: 'same-origin',
      headers: { 'Authorization': auth, 'Content-Type': 'application/json', 'Accept': 'application/json' },
      body: body ? JSON.stringify(body) : undefined
    });
    return { status: r.status, body: await r.json().catch(() => ({})) };
  }, { baseUrl: BASE_URL, method, path, auth: AUTH, body });
}

async function snapRows(page) {
  return page.evaluate(() => {
    const tbody = document.querySelector('table.work-package-table tbody.work-package--results-tbody');
    const table = document.querySelector('table.work-package-table');
    if (!tbody) return { rows: [], sig: null };
    const rows = Array.from(tbody.querySelectorAll('tr')).map((r, i) => {
      const code = r.getAttribute('data-abyz-taxonomy-code');
      const link = r.querySelector('a[href*="/work_packages/"]');
      const wpMatch = link && link.getAttribute('href').match(/\/work_packages\/(\d+)/);
      return { i, type: code ? 'S' : (wpMatch ? 'W' : '?'), code: code || null, wpId: wpMatch ? wpMatch[1] : null };
    });
    return { rows, sig: table ? table.dataset.abyzTaxonomySignature : null };
  });
}

async function main() {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext();
  const page = await context.newPage();

  page.on('console', msg => {
    if (msg.text().startsWith('[DIAG]')) process.stdout.write(msg.text() + '\n');
  });

  // --- 로그인 ---
  await page.goto(BASE_URL + '/login');
  await page.locator('#login-form #username').fill(USER);
  await page.locator('#login-form #password').fill(PASS);
  await page.locator('form[data-test-selector="user-login--form"] button[type="submit"]').click();
  await page.waitForURL(url => !url.pathname.includes('/login'), { timeout: 20000 });
  console.log(`[${ts()}] 로그인 완료`);

  // --- 진단용 프로젝트 생성 ---
  const pid = 'diag' + Date.now().toString().slice(-6);
  const projRes = await apiReq(page, 'POST', '/api/v3/projects', { identifier: pid, name: 'DIAG-' + pid });
  if (projRes.status !== 201) { console.error('프로젝트 생성 실패'); await browser.close(); return; }
  const projectId = projRes.body.id;
  console.log(`[${ts()}] 프로젝트: ${pid} id=${projectId}`);

  // --- WP 목록 페이지로 이동 ---
  const wpListUrl = BASE_URL + '/projects/' + pid + '/work_packages?query_props=%7B%22c%22%3A%5B%22id%22%2C%22subject%22%5D%7D';
  await page.goto(wpListUrl);
  await page.waitForSelector('table.work-package-table', { timeout: 15000 });
  await page.waitForTimeout(2000);
  console.log(`[${ts()}] WP 목록 페이지 로드 완료`);

  // --- 모달로 SEC-A 생성 ---
  console.log(`\n[${ts()}] SEC-A 생성 (모달 UI)`);
  // "+" 버튼 (WP 섹션 추가 버튼) 클릭
  const addBtnSelector = '[data-abyz-menu-scope="wp-list"][data-abyz-action="wp-section"]';
  const menuBtnSelector = '[data-abyz-action="open-wp-section-menu"], .abyz-taxonomy-add-button, button[data-abyz-action]';

  // 실제 버튼 찾기
  const btns = await page.locator('[data-abyz-action]').all();
  const btnTexts = await Promise.all(btns.map(b => b.getAttribute('data-abyz-action').catch(() => '')));
  console.log(`[${ts()}] 사용 가능한 abyz-action:`, btnTexts.filter(Boolean).slice(0, 10).join(', '));

  // 프로젝트 목록이 아닌 WP 목록에서 섹션 추가 버튼 찾기
  const wpSectionBtn = page.locator('[data-abyz-menu-scope="wp-list"]').first();
  const hasSectionBtn = await wpSectionBtn.count() > 0;
  console.log(`[${ts()}] WP 섹션 메뉴 버튼 존재:`, hasSectionBtn);

  if (!hasSectionBtn) {
    console.log('[' + ts() + '] 경고: WP 섹션 추가 UI 버튼을 찾지 못했습니다. API로 대체합니다.');

    // API fallback: taxReq 대신 JS inject
    const secRes = await page.evaluate(async ({ pid }) => {
      const csrf = document.querySelector('meta[name="csrf-token"]')?.getAttribute('content') || '';
      const r = await fetch('/abyz_taxonomy/ui/wp_sections', {
        method: 'POST',
        credentials: 'same-origin',
        headers: { 'X-CSRF-Token': csrf, 'Content-Type': 'application/json', 'Accept': 'application/json' },
        body: JSON.stringify({ name: 'Sec-A Alpha', projectIdentifier: pid })
      });
      const body = await r.json().catch(() => ({}));
      return { status: r.status, code: body.section?.code, message: body.message };
    }, { pid });
    console.log(`[${ts()}] SEC-A API 생성: code=${secRes.code} status=${secRes.status}`);

    var sec1Code = secRes.code;
    if (!sec1Code) { console.error('SEC-A 생성 실패'); await browser.close(); return; }

    // WP 생성+할당
    const wpRes = await page.evaluate(async ({ pid, sec1Code }) => {
      const csrf = document.querySelector('meta[name="csrf-token"]')?.getAttribute('content') || '';
      const r = await fetch('/abyz_taxonomy/ui/work_packages', {
        method: 'POST',
        credentials: 'same-origin',
        headers: { 'X-CSRF-Token': csrf, 'Content-Type': 'application/json', 'Accept': 'application/json' },
        body: JSON.stringify({ projectIdentifier: pid, sectionCode: sec1Code, subject: 'Diag WP' })
      });
      const body = await r.json().catch(() => ({}));
      return { status: r.status, wpId: String(body.workPackage?.id), message: body.message };
    }, { pid, sec1Code });
    console.log(`[${ts()}] WP 생성+할당: id=${wpRes.wpId} status=${wpRes.status}`);

    var wpId = wpRes.wpId;

    // page reload
    await page.reload();
    await page.waitForSelector('table.work-package-table tbody.work-package--results-tbody tr', { timeout: 15000 });
    await page.waitForTimeout(2500);

    var snap = await snapRows(page);
    console.log(`\n[${ts()}] 초기 상태: `, snap.rows.map(r => (r.type === 'S' ? 'S:' + r.code : 'W:' + r.wpId)).join(' → '));

    // --- 모니터링 시작 ---
    await page.evaluate(() => {
      window.__diagLog = [];
      const tlog = (msg) => {
        const t = new Date().toISOString().slice(11, 23);
        window.__diagLog.push('[' + t + '] ' + msg);
        console.log('[DIAG][' + t + '] ' + msg);
      };
      const table = document.querySelector('table.work-package-table');
      const tbody = table?.querySelector('tbody.work-package--results-tbody');
      if (!tbody) { tlog('ERROR: tbody not found'); return; }

      new MutationObserver(() => {
        tlog('SIG=' + (table.dataset.abyzTaxonomySignature || '').slice(0, 80));
      }).observe(table, { attributes: true, attributeFilter: ['data-abyz-taxonomy-signature'] });

      new MutationObserver((muts) => {
        muts.forEach(m => {
          if (m.type !== 'childList') return;
          const rowFmt = (n) => {
            if (!n.nodeType || n.nodeType !== 1) return null;
            const c = n.getAttribute?.('data-abyz-taxonomy-code');
            const lk = n.querySelector?.('a[href*="/work_packages/"]');
            const wm = lk?.getAttribute('href')?.match(/\/work_packages\/(\d+)/);
            return c ? 'S:' + c.slice(-8) : (wm ? 'W:' + wm[1] : null);
          };
          const added = Array.from(m.addedNodes).map(rowFmt).filter(Boolean).map(x => '+' + x);
          const removed = Array.from(m.removedNodes).map(rowFmt).filter(Boolean).map(x => '-' + x);
          if (!added.length && !removed.length) return;
          const order = Array.from(tbody.querySelectorAll('tr')).map(r => {
            const c = r.getAttribute('data-abyz-taxonomy-code');
            const lk = r.querySelector('a[href*="/work_packages/"]');
            const wm = lk?.getAttribute('href')?.match(/\/work_packages\/(\d+)/);
            return c ? 'S:' + c.slice(-8) : (wm ? 'W:' + wm[1] : '?');
          });
          tlog('MUT ' + added.concat(removed).join(' ') + ' → [' + order.join(',') + ']');
        });
      }).observe(tbody, { childList: true });

      tlog('MONITOR START');
    });

    // --- SEC-B 생성 (API, 모달 시뮬레이션) ---
    console.log(`\n[${ts()}] SEC-B 생성 (API 직접 호출)`);
    const sec2Res = await page.evaluate(async ({ pid }) => {
      const csrf = document.querySelector('meta[name="csrf-token"]')?.getAttribute('content') || '';
      const r = await fetch('/abyz_taxonomy/ui/wp_sections', {
        method: 'POST',
        credentials: 'same-origin',
        headers: { 'X-CSRF-Token': csrf, 'Content-Type': 'application/json', 'Accept': 'application/json' },
        body: JSON.stringify({ name: 'Sec-Z Zeta', projectIdentifier: pid })
      });
      const body = await r.json().catch(() => ({}));
      return { status: r.status, code: body.section?.code, message: body.message };
    }, { pid });
    console.log(`[${ts()}] SEC-B: code=${sec2Res.code} status=${sec2Res.status}`);
    var sec2Code = sec2Res.code;

    // Angular CD + refresh 사이클 관찰 (4초)
    await page.waitForTimeout(4000);

  } else {
    console.log('[' + ts() + '] UI 버튼으로 진행...');
    // UI 버튼 클릭으로 진행하는 코드 (생략 - 버튼이 있는 경우만)
    // TODO: 실제 UI 버튼 클릭 시나리오
    await browser.close();
    return;
  }

  // --- 최종 상태 ---
  const finalSnap = await snapRows(page);
  console.log(`\n[${ts()}] === 최종 상태 ===`);
  console.log('rows:', finalSnap.rows.map(r => (r.type === 'S' ? 'S:' + (r.code || '?').slice(-8) : 'W:' + r.wpId)).join(' → '));

  const diagLog = await page.evaluate(() => window.__diagLog || []);
  console.log('\n=== DIAG 로그 ===');
  diagLog.forEach(l => console.log(l));

  // 판정
  const rows = finalSnap.rows;
  const s1 = rows.findIndex(r => r.code === sec1Code);
  const s2 = rows.findIndex(r => r.code === sec2Code);
  const wp = rows.findIndex(r => r.wpId === wpId);
  console.log(`\n=== 판정 === sec-a=${s1} WP=${wp} sec-z=${s2}`);
  const correct = s1 >= 0 && wp === s1 + 1 && (s2 < 0 || wp < s2);
  console.log(correct ? '✅ CORRECT: [sec-a, WP, sec-z]' : '❌ BUG: 잘못된 순서');
  if (!correct) {
    if (wp > s2 && s2 >= 0) console.log('  → WP가 sec-z 아래에 있음 (TC-055 버그!)');
    if (s2 === wp + 1) console.log('  → sec-z가 WP 바로 다음에 있음 (올바름)');
  }

  await apiReq(page, 'DELETE', '/api/v3/projects/' + projectId);
  await browser.close();
  console.log(`\n[${ts()}] 완료`);
}

main().catch(e => { console.error(e); process.exit(1); });
