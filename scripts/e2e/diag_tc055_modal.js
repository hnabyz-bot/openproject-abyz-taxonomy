/**
 * TC-055 진단: 실제 모달 UI 클릭 플로우 시뮬레이션
 * OP의 "+ Work Package" 버튼을 직접 클릭 → taxonomy 팝업 → "섹션 추가" → 모달 → 제출
 */
const { chromium } = require('/tmp/op-taxonomy-playwright-runner/node_modules/playwright');
const path = require('path');
const fs = require('fs');

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
const SS_DIR = '/tmp/diag_tc055_modal_screenshots';

const ts = () => new Date().toISOString().slice(11, 23);
let ssIdx = 0;

async function screenshot(page, label) {
  const p = path.join(SS_DIR, String(++ssIdx).padStart(2, '0') + '_' + label + '.png');
  await page.screenshot({ path: p, fullPage: false });
  console.log(`[${ts()}] 📸 ${p}`);
}

async function apiReq(page, method, path2, body) {
  return page.evaluate(async ({ baseUrl, method, path2, auth, body }) => {
    const r = await fetch(baseUrl + path2, {
      method,
      credentials: 'same-origin',
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
      method: 'POST',
      credentials: 'same-origin',
      headers: { 'X-CSRF-Token': csrf, 'Content-Type': 'application/json', 'Accept': 'application/json' },
      body: JSON.stringify(body)
    });
    return { status: r.status, body: await r.json().catch(() => ({})) };
  }, { baseUrl: BASE_URL, path2, body });
}

async function snapRows(page) {
  return page.evaluate(() => {
    const tbody = document.querySelector('table.work-package-table tbody.work-package--results-tbody');
    const table = document.querySelector('table.work-package-table');
    if (!tbody) return { rows: [], sig: null };
    return {
      rows: Array.from(tbody.querySelectorAll('tr')).map((r, i) => {
        const code = r.getAttribute('data-abyz-taxonomy-code');
        const link = r.querySelector('a[href*="/work_packages/"]');
        const m = link && link.getAttribute('href').match(/\/work_packages\/(\d+)/);
        return { i, type: code ? 'S' : (m ? 'W' : '?'), code: code || null, wpId: m ? m[1] : null };
      }),
      sig: table ? table.dataset.abyzTaxonomySignature : null
    };
  });
}

async function injectMonitor(page) {
  await page.evaluate(() => {
    window.__diagLog = [];
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
    let lastOrder = rowOrder();

    new MutationObserver(() => {
      const sig = table.dataset.abyzTaxonomySignature || '';
      if (sig !== lastSig) {
        log('SIG_CHANGE order=[' + rowOrder() + ']');
        lastSig = sig;
      }
    }).observe(table, { attributes: true, attributeFilter: ['data-abyz-taxonomy-signature'] });

    new MutationObserver((muts) => {
      muts.forEach(m => {
        if (m.type !== 'childList') return;
        const rmv = Array.from(m.removedNodes).filter(n => n.nodeType === 1).map(n => {
          const c = n.getAttribute?.('data-abyz-taxonomy-code');
          const lk = n.querySelector?.('a[href*="/work_packages/"]');
          const wm = lk?.getAttribute?.('href')?.match(/\/work_packages\/(\d+)/);
          return c ? '-S:' + c.split('.').pop() : (wm ? '-W:' + wm[1] : null);
        }).filter(Boolean);
        const add = Array.from(m.addedNodes).filter(n => n.nodeType === 1).map(n => {
          const c = n.getAttribute?.('data-abyz-taxonomy-code');
          const lk = n.querySelector?.('a[href*="/work_packages/"]');
          const wm = lk?.getAttribute?.('href')?.match(/\/work_packages\/(\d+)/);
          return c ? '+S:' + c.split('.').pop() : (wm ? '+W:' + wm[1] : null);
        }).filter(Boolean);
        if (!rmv.length && !add.length) return;
        const cur = rowOrder();
        if (cur !== lastOrder) { log('DOM_CHG ' + rmv.concat(add).join(' ') + ' → [' + cur + ']'); lastOrder = cur; }
      });
    }).observe(tbody, { childList: true });

    log('MONITOR START init=[' + rowOrder() + ']');
  });
}

async function main() {
  if (!fs.existsSync(SS_DIR)) fs.mkdirSync(SS_DIR, { recursive: true });

  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ viewport: { width: 1400, height: 900 } });
  const page = await context.newPage();
  page.on('console', msg => { if (msg.text().startsWith('[DIAG]')) process.stdout.write(msg.text() + '\n'); });

  // 로그인
  await page.goto(BASE_URL + '/login');
  await page.locator('#login-form #username').fill(USER);
  await page.locator('#login-form #password').fill(PASS);
  await page.locator('form[data-test-selector="user-login--form"] button[type="submit"]').click();
  await page.waitForURL(url => !url.pathname.includes('/login'), { timeout: 20000 });
  console.log(`[${ts()}] 로그인 완료`);

  // 프로젝트 생성
  const pid = 'modal' + Date.now().toString().slice(-5);
  const projRes = await apiReq(page, 'POST', '/api/v3/projects', { identifier: pid, name: 'MODAL-' + pid });
  if (projRes.status !== 201) { console.error('프로젝트 생성 실패'); await browser.close(); return; }
  const projectId = projRes.body.id;
  console.log(`[${ts()}] 프로젝트: ${pid} id=${projectId}`);

  // SEC-A + WP 생성 (API)
  const wpListUrl = BASE_URL + '/projects/' + pid + '/work_packages?query_props=%7B%22c%22%3A%5B%22id%22%2C%22subject%22%5D%7D';
  await page.goto(wpListUrl);
  await page.waitForSelector('table.work-package-table', { timeout: 15000 });
  await page.waitForTimeout(2000);

  const s1 = await taxPost(page, '/abyz_taxonomy/ui/wp_sections', { name: 'Sec-A Alpha', projectIdentifier: pid });
  const sec1Code = s1.body.section?.code;
  console.log(`[${ts()}] SEC-A: ${sec1Code} (${s1.status})`);
  if (!sec1Code) { console.error('SEC-A 생성 실패'); await browser.close(); return; }

  const wp = await taxPost(page, '/abyz_taxonomy/ui/work_packages', { projectIdentifier: pid, sectionCode: sec1Code, subject: 'Modal WP' });
  const wpId = String(wp.body.workPackage?.id);
  console.log(`[${ts()}] WP: ${wpId} (${wp.status})`);

  // 페이지 리로드 → 초기 상태
  await page.reload();
  await page.waitForSelector('table.work-package-table tbody.work-package--results-tbody tr', { timeout: 15000 });
  await page.waitForTimeout(3000);
  await screenshot(page, 'initial_state');

  const init = await snapRows(page);
  console.log(`\n[${ts()}] 초기 상태: `, init.rows.map(r => (r.type === 'S' ? 'S:' + r.code?.split('.').pop() : 'W:' + r.wpId)).join(' → '));

  // 모니터 주입
  await injectMonitor(page);

  // OP의 "+ Work Package" 버튼 찾기
  const addWpBtn = page.locator('button.add-work-package').first();
  const hasBtnCount = await addWpBtn.count();
  console.log(`\n[${ts()}] '.add-work-package' 버튼 수: ${hasBtnCount}`);

  if (!hasBtnCount) {
    // fallback: 직접 API 호출로 SEC-B 생성
    console.log(`[${ts()}] 버튼 없음 → API fallback`);
    const s2 = await taxPost(page, '/abyz_taxonomy/ui/wp_sections', { name: 'Sec-Z Zeta', projectIdentifier: pid });
    console.log(`[${ts()}] SEC-B API: ${s2.body.section?.code} (${s2.status})`);
  } else {
    // 실제 UI 클릭 플로우
    console.log(`[${ts()}] 실제 UI 클릭 플로우 시작`);
    await screenshot(page, 'before_click_add_btn');

    // OP "+" 버튼 클릭 → taxonomy 팝업 메뉴
    await addWpBtn.click({ force: true });
    await page.waitForTimeout(500);
    await screenshot(page, 'after_click_add_btn_menu_open');

    // "섹션 추가" 메뉴 항목 클릭 (taxonomy 팝업 메뉴 안)
    const sectionMenuBtn = page.locator('#abyz-taxonomy-wp-create-menu [data-abyz-action="wp-section"]');
    const hasSectionMenu = await sectionMenuBtn.count() > 0;
    console.log(`[${ts()}] '섹션 추가' 메뉴 항목 존재: ${hasSectionMenu}`);

    if (!hasSectionMenu) {
      console.log(`[${ts()}] 메뉴 항목 없음 → API fallback`);
      const s2 = await taxPost(page, '/abyz_taxonomy/ui/wp_sections', { name: 'Sec-Z Zeta', projectIdentifier: pid });
      console.log(`[${ts()}] SEC-B API: ${s2.body.section?.code} (${s2.status})`);
    } else {
      await sectionMenuBtn.click();
      await page.waitForTimeout(500);
      await screenshot(page, 'modal_open');

      // 모달: "이름" 필드 찾기
      const nameInput = page.locator('#abyz-taxonomy-modal-root input[name="name"], #abyz-taxonomy-modal-root input[type="text"]').first();
      const hasInput = await nameInput.count() > 0;
      console.log(`[${ts()}] 모달 이름 입력 필드 존재: ${hasInput}`);

      if (hasInput) {
        await nameInput.fill('Sec-Z Zeta');
        await screenshot(page, 'modal_filled');

        // 제출 버튼 클릭
        const submitBtn = page.locator('#abyz-taxonomy-modal-root button[type="submit"], #abyz-taxonomy-modal-root button.abyz-submit-btn, #abyz-taxonomy-modal-root button[data-abyz-action="submit"]').first();
        const hasSubmit = await submitBtn.count() > 0;
        console.log(`[${ts()}] 제출 버튼 존재: ${hasSubmit}`);
        if (hasSubmit) {
          console.log(`\n[${ts()}] === 모달 제출 ===`);
          await submitBtn.click();
        } else {
          // submit 버튼 텍스트로 찾기
          const submitByText = page.locator('#abyz-taxonomy-modal-root button').filter({ hasText: /확인|저장|추가|Submit|OK/i }).first();
          if (await submitByText.count() > 0) {
            console.log(`[${ts()}] 제출 버튼 (텍스트 매칭)`);
            await submitByText.click();
          } else {
            console.log(`[${ts()}] ERROR: 제출 버튼 없음`);
            await screenshot(page, 'modal_no_submit');
          }
        }
      } else {
        // 모달 내 모든 버튼/입력 출력
        const modalHtml = await page.locator('#abyz-taxonomy-modal-root').innerHTML().catch(() => '(없음)');
        console.log(`[${ts()}] 모달 HTML:`, modalHtml.slice(0, 500));
      }
    }
  }

  // 5초 관찰
  await page.waitForTimeout(5000);
  await screenshot(page, 'after_5s');

  // 최종 상태
  const final = await snapRows(page);
  console.log(`\n[${ts()}] === 최종 상태 ===`);
  console.log('rows:', final.rows.map(r => (r.type === 'S' ? 'S:' + (r.code || '?').split('.').pop() : 'W:' + r.wpId)).join(' → '));

  const diagLog = await page.evaluate(() => window.__diagLog || []);
  console.log('\n=== DIAG 로그 (' + diagLog.length + '건) ===');
  diagLog.forEach(l => console.log(l));

  const rows = final.rows;
  const s1idx = rows.findIndex(r => r.code === sec1Code);
  const wpidx = rows.findIndex(r => r.wpId === wpId);
  const s2idx = rows.findIndex(r => r.type === 'S' && r.code !== sec1Code);
  console.log(`\n=== 판정 === sec-a=${s1idx} WP=${wpidx} sec-z=${s2idx}`);
  const correct = s1idx >= 0 && wpidx === s1idx + 1 && (s2idx < 0 || wpidx < s2idx);
  console.log(correct ? '✅ CORRECT' : '❌ BUG: ' + (wpidx > s2idx && s2idx >= 0 ? 'WP가 sec-z 아래에 있음 (TC-055!)' : '알 수 없는 순서 오류'));

  await apiReq(page, 'DELETE', '/api/v3/projects/' + projectId);
  await browser.close();
  console.log(`\n📸 스크린샷: ${SS_DIR}/`);
}

main().catch(e => { console.error(e); process.exit(1); });
