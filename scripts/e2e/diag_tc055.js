/**
 * TC-055 진단 스크립트
 * DOM 변화와 signature 변경을 실시간 캡처하여 정확한 버그 원인을 파악한다.
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

// OP v3 API: API 토큰 인증
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

// taxonomy UI API: 세션 쿠키 + CSRF 토큰
async function taxReq(page, method, path, body) {
  return page.evaluate(async ({ baseUrl, method, path, body }) => {
    const csrfTag = document.querySelector('meta[name="csrf-token"]');
    const csrf = csrfTag ? csrfTag.getAttribute('content') : '';
    const r = await fetch(baseUrl + path, {
      method,
      credentials: 'same-origin',
      headers: { 'X-CSRF-Token': csrf, 'Content-Type': 'application/json', 'Accept': 'application/json' },
      body: body ? JSON.stringify(body) : undefined
    });
    return { status: r.status, body: await r.json().catch(() => ({})) };
  }, { baseUrl: BASE_URL, method, path, body });
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
      return {
        i,
        type: code ? 'SECTION' : (wpMatch ? 'WP' : 'OTHER'),
        code: code || null,
        wpId: wpMatch ? wpMatch[1] : null
      };
    });
    return { rows, sig: table ? table.dataset.abyzTaxonomySignature : null };
  });
}

async function main() {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext();
  const page = await context.newPage();

  // console 메시지를 Node.js 로 출력
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
  let projRes = await apiReq(page, 'POST', '/api/v3/projects', { identifier: pid, name: 'DIAG-' + pid });
  if (projRes.status !== 201) {
    console.error('프로젝트 생성 실패:', projRes.status, JSON.stringify(projRes.body));
    await browser.close(); return;
  }
  const projectId = projRes.body.id;
  console.log(`[${ts()}] 프로젝트 생성: ${pid} (id=${projectId})`);

  // taxonomy UI API는 세션 쿠키 + CSRF 필요 → WP 목록 페이지에서 세션 확보
  const wpListUrl = BASE_URL + '/projects/' + pid + '/work_packages?query_props=%7B%22c%22%3A%5B%22id%22%2C%22subject%22%5D%7D';
  await page.goto(wpListUrl);
  await page.waitForSelector('table.work-package-table', { timeout: 15000 });
  await page.waitForTimeout(1000);

  // --- SEC-A 섹션 생성 ---
  const sec1Res = await taxReq(page, 'POST', '/abyz_taxonomy/ui/wp_sections', {
    name: 'Sec-A Alpha', projectIdentifier: pid
  });
  const sec1Code = sec1Res.body.section && sec1Res.body.section.code;
  console.log(`[${ts()}] SEC-A 생성: code=${sec1Code} status=${sec1Res.status}`, sec1Res.body.message || '');

  if (!sec1Code) {
    console.error('SEC-A 생성 실패:', JSON.stringify(sec1Res.body));
    await browser.close(); return;
  }

  // --- WP 생성 + SEC-A에 할당 (UI API: projectIdentifier + sectionCode + subject 필요) ---
  const wpCreateRes = await taxReq(page, 'POST', '/abyz_taxonomy/ui/work_packages', {
    projectIdentifier: pid, sectionCode: sec1Code, subject: 'Diag WP'
  });
  const wpId = wpCreateRes.body.workPackage && String(wpCreateRes.body.workPackage.id);
  console.log(`[${ts()}] WP 생성+할당: id=${wpId} status=${wpCreateRes.status}`, wpCreateRes.body.message || '');

  // WP 목록 재로드 (taxonomy 상태 반영)
  await page.reload();
  await page.waitForSelector('table.work-package-table tbody.work-package--results-tbody tr', { timeout: 15000 });
  await page.waitForTimeout(2500);

  let snap = await snapRows(page);
  console.log(`\n[${ts()}] === 초기 상태 ===`);
  console.log('rows:', snap.rows.map(r => (r.type === 'SECTION' ? 'S:' + r.code : 'W:' + r.wpId)).join(' → '));
  console.log('sig:', (snap.sig || '').slice(0, 80) + '...');

  // --- DOM 변화 모니터링 인젝션 ---
  await page.evaluate(() => {
    window.__diagLog = [];
    const tlog = (msg) => {
      const t = new Date().toISOString().slice(11, 23);
      window.__diagLog.push('[' + t + '] ' + msg);
      console.log('[DIAG][' + t + '] ' + msg);
    };

    const table = document.querySelector('table.work-package-table');
    const tbody = table && table.querySelector('tbody.work-package--results-tbody');
    if (!tbody || !table) { tlog('ERROR: tbody not found'); return; }

    // signature attribute 변화 감지
    new MutationObserver(() => {
      tlog('SIG=' + (table.dataset.abyzTaxonomySignature || '').slice(0, 60));
    }).observe(table, { attributes: true, attributeFilter: ['data-abyz-taxonomy-signature'] });

    // tbody 행 추가/제거 감지
    new MutationObserver((muts) => {
      muts.forEach(m => {
        if (m.type !== 'childList') return;
        const added = Array.from(m.addedNodes).filter(n => n.nodeType === 1).map(n => {
          const c = n.getAttribute && n.getAttribute('data-abyz-taxonomy-code');
          const lk = n.querySelector && n.querySelector('a[href*="/work_packages/"]');
          const wm = lk && lk.getAttribute('href').match(/\/work_packages\/(\d+)/);
          return c ? '+S:' + c : (wm ? '+W:' + wm[1] : '+?');
        });
        const removed = Array.from(m.removedNodes).filter(n => n.nodeType === 1).map(n => {
          const c = n.getAttribute && n.getAttribute('data-abyz-taxonomy-code');
          const lk = n.querySelector && n.querySelector('a[href*="/work_packages/"]');
          const wm = lk && lk.getAttribute('href').match(/\/work_packages\/(\d+)/);
          return c ? '-S:' + c : (wm ? '-W:' + wm[1] : '-?');
        });
        if (!added.length && !removed.length) return;
        const order = Array.from(tbody.querySelectorAll('tr')).map(r => {
          const c = r.getAttribute('data-abyz-taxonomy-code');
          const lk = r.querySelector('a[href*="/work_packages/"]');
          const wm = lk && lk.getAttribute('href').match(/\/work_packages\/(\d+)/);
          return c ? 'S:' + c : (wm ? 'W:' + wm[1] : '?');
        });
        tlog('ROWS ' + added.concat(removed).join(' ') + ' | ORDER=[' + order.join(',') + ']');
      });
    }).observe(tbody, { childList: true });

    tlog('monitoring START | init order=[' +
      Array.from(tbody.querySelectorAll('tr')).map(r => {
        const c = r.getAttribute('data-abyz-taxonomy-code');
        const lk = r.querySelector('a[href*="/work_packages/"]');
        const wm = lk && lk.getAttribute('href').match(/\/work_packages\/(\d+)/);
        return c ? 'S:' + c : (wm ? 'W:' + wm[1] : '?');
      }).join(',') + ']'
    );
  });

  // --- SEC-B 섹션 생성 (알파벳 후순위: Sec-Z) ---
  console.log(`\n[${ts()}] === SEC-B 생성 ===`);
  const sec2Res = await taxReq(page, 'POST', '/abyz_taxonomy/ui/wp_sections', {
    name: 'Sec-Z Zeta', projectIdentifier: pid
  });
  const sec2Code = sec2Res.body.code;
  console.log(`[${ts()}] SEC-B 생성: code=${sec2Code} status=${sec2Res.status}`);

  // 4초 관찰
  await page.waitForTimeout(4000);

  snap = await snapRows(page);
  console.log(`\n[${ts()}] === 최종 상태 ===`);
  console.log('rows:', snap.rows.map(r => (r.type === 'SECTION' ? 'S:' + r.code : 'W:' + r.wpId)).join(' → '));
  console.log('sig:', (snap.sig || '').slice(0, 100));

  const diagLog = await page.evaluate(() => window.__diagLog || []);
  console.log('\n=== 전체 DIAG 로그 ===');
  diagLog.forEach(l => console.log(l));

  // 버그 판정
  const rows = snap.rows;
  const s1 = rows.findIndex(r => r.code === sec1Code);
  const s2 = rows.findIndex(r => r.code === sec2Code);
  const wp = rows.findIndex(r => r.wpId === wpId);
  console.log(`\n=== 판정 === s1=${s1} wp=${wp} s2=${s2}`);
  const correct = s1 >= 0 && wp === s1 + 1 && (s2 < 0 || wp < s2);
  console.log(correct ? '✅ CORRECT' : '❌ BUG: WP가 잘못된 위치');

  await apiReq(page, 'DELETE', '/api/v3/projects/' + projectId);
  await browser.close();
}

main().catch(e => { console.error(e); process.exit(1); });
