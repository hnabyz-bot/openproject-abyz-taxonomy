/**
 * TC-055 장기 관찰 스크립트
 * Angular CD 사이클이 여러 번 반복될 때 signature stuck이 발생하는지 15초간 관찰한다.
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

async function main() {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();

  page.on('console', msg => {
    if (msg.text().startsWith('[DIAG]')) process.stdout.write(msg.text() + '\n');
  });

  await page.goto(BASE_URL + '/login');
  await page.locator('#login-form #username').fill(USER);
  await page.locator('#login-form #password').fill(PASS);
  await page.locator('form[data-test-selector="user-login--form"] button[type="submit"]').click();
  await page.waitForURL(url => !url.pathname.includes('/login'), { timeout: 20000 });
  console.log(`[${ts()}] 로그인 완료`);

  // 프로젝트+섹션+WP 생성
  const pid = 'watch' + Date.now().toString().slice(-5);
  const csrf = () => page.evaluate(() => document.querySelector('meta[name="csrf-token"]')?.getAttribute('content') || '');
  const taxPost = async (path, body) => page.evaluate(async ({ path, csrf, body }) => {
    const r = await fetch(path, { method: 'POST', credentials: 'same-origin',
      headers: { 'X-CSRF-Token': csrf, 'Content-Type': 'application/json', 'Accept': 'application/json' },
      body: JSON.stringify(body) });
    return { status: r.status, body: await r.json().catch(() => ({})) };
  }, { path, csrf: await csrf(), body });

  const opPost = async (path, body) => page.evaluate(async ({ baseUrl, path, auth, body }) => {
    const r = await fetch(baseUrl + path, { method: 'POST', credentials: 'same-origin',
      headers: { 'Authorization': auth, 'Content-Type': 'application/json', 'Accept': 'application/json' },
      body: JSON.stringify(body) });
    return { status: r.status, body: await r.json().catch(() => ({})) };
  }, { baseUrl: BASE_URL, path, auth: AUTH, body });

  const opDel = async (path) => page.evaluate(async ({ baseUrl, path, auth }) => {
    const r = await fetch(baseUrl + path, { method: 'DELETE', credentials: 'same-origin',
      headers: { 'Authorization': auth } });
    return r.status;
  }, { baseUrl: BASE_URL, path, auth: AUTH });

  const proj = await opPost('/api/v3/projects', { identifier: pid, name: 'WATCH-' + pid });
  if (proj.status !== 201) { console.error('프로젝트 생성 실패'); await browser.close(); return; }
  const projectId = proj.body.id;
  console.log(`[${ts()}] 프로젝트 ${pid} id=${projectId}`);

  // WP 목록 페이지 열기
  const wpUrl = BASE_URL + '/projects/' + pid + '/work_packages?query_props=%7B%22c%22%3A%5B%22id%22%2C%22subject%22%5D%7D';
  await page.goto(wpUrl);
  await page.waitForSelector('table.work-package-table', { timeout: 15000 });
  await page.waitForTimeout(1500);

  // SEC-A 생성 + WP 생성+할당
  const s1 = await taxPost('/abyz_taxonomy/ui/wp_sections', { name: 'Sec-A Alpha', projectIdentifier: pid });
  const sec1Code = s1.body.section?.code;
  console.log(`[${ts()}] SEC-A: ${sec1Code} (${s1.status})`);

  const wp = await taxPost('/abyz_taxonomy/ui/work_packages', { projectIdentifier: pid, sectionCode: sec1Code, subject: 'Watch WP' });
  const wpId = String(wp.body.workPackage?.id);
  console.log(`[${ts()}] WP: ${wpId} (${wp.status})`);

  // 페이지 리로드 + 대기
  await page.reload();
  await page.waitForSelector('table.work-package-table tbody.work-package--results-tbody tr', { timeout: 15000 });
  await page.waitForTimeout(3000);

  // 모니터링 인젝션 (세밀 관찰)
  await page.evaluate(() => {
    window.__diagLog = [];
    window.__mutCount = 0;
    window.__stuckCount = 0;
    const t = () => new Date().toISOString().slice(11, 23);
    const log = (m) => { window.__diagLog.push('[' + t() + '] ' + m); console.log('[DIAG][' + t() + '] ' + m); };

    const table = document.querySelector('table.work-package-table');
    const tbody = table?.querySelector('tbody.work-package--results-tbody');
    if (!tbody) { log('ERROR: no tbody'); return; }

    const rowOrder = () => Array.from(tbody.querySelectorAll('tr')).map(r => {
      const c = r.getAttribute('data-abyz-taxonomy-code');
      const lk = r.querySelector('a[href*="/work_packages/"]');
      const wm = lk?.getAttribute('href')?.match(/\/work_packages\/(\d+)/);
      return c ? 'S:' + c.split('.').pop() : (wm ? 'W:' + wm[1] : '?');
    }).join(',');

    let lastSig = table.dataset.abyzTaxonomySignature || '';
    let sigSameCount = 0;
    let lastOrder = rowOrder();

    // signature 변화 → 렌더 발생 시점
    new MutationObserver(() => {
      const sig = table.dataset.abyzTaxonomySignature || '';
      if (sig !== lastSig) {
        log('SIG_CHANGE #' + (++window.__mutCount) + ' order=[' + rowOrder() + '] sig=' + sig.slice(0, 50));
        lastSig = sig;
        sigSameCount = 0;
      }
    }).observe(table, { attributes: true, attributeFilter: ['data-abyz-taxonomy-signature'] });

    // tbody 행 변화
    new MutationObserver((muts) => {
      muts.forEach(m => {
        if (m.type !== 'childList') return;
        const rmv = Array.from(m.removedNodes).filter(n => n.nodeType === 1).map(n => {
          const c = n.getAttribute?.('data-abyz-taxonomy-code');
          const lk = n.querySelector?.('a[href*="/work_packages/"]');
          const wm = lk?.getAttribute('href')?.match(/\/work_packages\/(\d+)/);
          return c ? '-S:' + c.split('.').pop() : (wm ? '-W:' + wm[1] : null);
        }).filter(Boolean);
        const add = Array.from(m.addedNodes).filter(n => n.nodeType === 1).map(n => {
          const c = n.getAttribute?.('data-abyz-taxonomy-code');
          const lk = n.querySelector?.('a[href*="/work_packages/"]');
          const wm = lk?.getAttribute('href')?.match(/\/work_packages\/(\d+)/);
          return c ? '+S:' + c.split('.').pop() : (wm ? '+W:' + wm[1] : null);
        }).filter(Boolean);
        if (!rmv.length && !add.length) return;
        const cur = rowOrder();
        if (cur !== lastOrder) {
          log('DOM_CHANGE ' + rmv.concat(add).join(' ') + ' → [' + cur + ']');
          lastOrder = cur;
        }
      });
    }).observe(tbody, { childList: true });

    // 2초마다 현재 상태 snapshot
    window.__watchInterval = setInterval(() => {
      const cur = rowOrder();
      const sig = (table.dataset.abyzTaxonomySignature || '').slice(0, 40);
      log('SNAP order=[' + cur + ']');
    }, 2000);

    log('WATCH START init=[' + rowOrder() + ']');
  });

  console.log(`\n[${ts()}] SEC-B 생성 + 15초 관찰 시작`);
  const s2 = await taxPost('/abyz_taxonomy/ui/wp_sections', { name: 'Sec-Z Zeta', projectIdentifier: pid });
  const sec2Code = s2.body.section?.code;
  console.log(`[${ts()}] SEC-B: ${sec2Code} (${s2.status})`);

  await page.waitForTimeout(15000);

  // 인터벌 정지
  await page.evaluate(() => clearInterval(window.__watchInterval));

  // 최종 상태
  const final = await page.evaluate(() => {
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

  console.log(`\n=== 최종 상태 ===`);
  console.log('rows:', final.rows.map(r => r.type === 'S' ? 'S:' + (r.code || '').split('.').pop() : 'W:' + r.wpId).join(' → '));

  const diagLog = await page.evaluate(() => window.__diagLog || []);
  console.log('\n=== 전체 DIAG 로그 (' + diagLog.length + '건) ===');
  diagLog.forEach(l => console.log(l));

  // 판정
  const rows = final.rows;
  const s1idx = rows.findIndex(r => r.code === sec1Code);
  const s2idx = rows.findIndex(r => r.code === sec2Code);
  const wpidx = rows.findIndex(r => r.wpId === wpId);
  console.log(`\n=== 판정 === sec-a=${s1idx} WP=${wpidx} sec-z=${s2idx}`);
  const correct = s1idx >= 0 && wpidx === s1idx + 1 && (s2idx < 0 || wpidx < s2idx);
  console.log(correct ? '✅ CORRECT' : '❌ BUG');

  await opDel('/api/v3/projects/' + projectId);
  await browser.close();
}

main().catch(e => { console.error(e); process.exit(1); });
