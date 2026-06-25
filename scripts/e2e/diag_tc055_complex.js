/**
 * TC-055 심층 진단: 복잡한 시나리오 (다중 WP + 미할당 WP)
 * 실제 사용 환경 재현: SEC-A(WP 3개) + 미할당 WP 2개 → SEC-Z 추가 → 30초 관찰
 */
const { chromium } = require('/tmp/op-taxonomy-playwright-runner/node_modules/playwright');
const path = require('path');
const fs = require('fs');

const BASE_URL = process.env.OP_BASE_URL || 'http://localhost:8087';
const USER = process.env.OP_E2E_USER || 'taxonomy.e2e';
const PASS = process.env.OP_E2E_PASSWORD || 'TaxonomyE2E2026!';
const API_TOKEN = process.env.OP_E2E_API_TOKEN || 'opapi-1257353c8d3f0f5419bb1fbc5c4496098d24e650fe288a7a7faf23bdac5347fa';
const AUTH = 'Basic ' + Buffer.from('apikey:' + API_TOKEN).toString('base64');
const SS_DIR = '/tmp/diag_tc055_complex_screenshots';

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
        const subject = r.querySelector('td .op-wp-single-card--subject, td .subject, td span')?.textContent?.trim()?.slice(0, 20) || '';
        return { i, type: code ? 'S' : (m ? 'W' : '?'), code: code || null, wpId: m ? m[1] : null, subject };
      }),
      sig: table ? table.dataset.abyzTaxonomySignature : null
    };
  });
}

async function injectDeepMonitor(page) {
  await page.evaluate(() => {
    window.__diagLog = [];
    window.__diagMutCount = 0;
    const t = () => new Date().toISOString().slice(8, 23);
    const log = (m) => {
      const entry = '[' + t() + '] ' + m;
      window.__diagLog.push(entry);
      console.log('[DIAG]' + entry);
    };

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
    let renderCount = 0;

    // Signature 변경 감시
    new MutationObserver(() => {
      const sig = table.dataset.abyzTaxonomySignature || '';
      if (sig !== lastSig) {
        renderCount++;
        log('SIG#' + renderCount + ' order=[' + rowOrder() + '] sig=' + sig.slice(0, 60));
        lastSig = sig;
      }
    }).observe(table, { attributes: true, attributeFilter: ['data-abyz-taxonomy-signature'] });

    // tbody 행 변경 감시 (매우 상세하게)
    new MutationObserver((muts) => {
      muts.forEach(m => {
        if (m.type !== 'childList') return;
        window.__diagMutCount++;
        const rmv = Array.from(m.removedNodes).filter(n => n.nodeType === 1).map(n => {
          const c = n.getAttribute?.('data-abyz-taxonomy-code');
          const lk = n.querySelector?.('a[href*="/work_packages/"]');
          const wm = lk?.getAttribute?.('href')?.match(/\/work_packages\/(\d+)/);
          return c ? '-S:' + c.split('.').pop() : (wm ? '-W:' + wm[1] : '-?');
        }).filter(Boolean);
        const add = Array.from(m.addedNodes).filter(n => n.nodeType === 1).map(n => {
          const c = n.getAttribute?.('data-abyz-taxonomy-code');
          const lk = n.querySelector?.('a[href*="/work_packages/"]');
          const wm = lk?.getAttribute?.('href')?.match(/\/work_packages\/(\d+)/);
          return c ? '+S:' + c.split('.').pop() : (wm ? '+W:' + wm[1] : '+?');
        }).filter(Boolean);
        if (!rmv.length && !add.length) return;
        const cur = rowOrder();
        if (cur !== lastOrder) {
          log('DOM_MUT#' + window.__diagMutCount + ' ' + rmv.concat(add).join(' ') + ' → [' + cur + ']');
          lastOrder = cur;
        }
      });
    }).observe(tbody, { childList: true });

    log('MONITOR_START init=[' + rowOrder() + ']');
  });
}

async function main() {
  if (!fs.existsSync(SS_DIR)) fs.mkdirSync(SS_DIR, { recursive: true });

  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ viewport: { width: 1400, height: 900 } });
  const page = await context.newPage();
  page.on('console', msg => {
    const t = msg.text();
    if (t.startsWith('[DIAG]')) process.stdout.write(t + '\n');
  });

  // 로그인
  await page.goto(BASE_URL + '/login');
  await page.locator('#login-form #username').fill(USER);
  await page.locator('#login-form #password').fill(PASS);
  await page.locator('form[data-test-selector="user-login--form"] button[type="submit"]').click();
  await page.waitForURL(url => !url.pathname.includes('/login'), { timeout: 20000 });
  console.log(`[${ts()}] 로그인 완료`);

  // 프로젝트 생성
  const pid = 'cmplx' + Date.now().toString().slice(-4);
  const projRes = await apiReq(page, 'POST', '/api/v3/projects', { identifier: pid, name: 'COMPLEX-' + pid });
  if (projRes.status !== 201) { console.error('프로젝트 생성 실패', projRes); await browser.close(); return; }
  const projectId = projRes.body.id;
  console.log(`[${ts()}] 프로젝트: ${pid} id=${projectId}`);

  // WP 목록 페이지로 이동 (다중 섹션 시나리오: SEC-A + SEC-M, 새 SEC-Z 추가 시 SEC-M WP 이동 여부 확인)
  const wpListUrl = BASE_URL + '/projects/' + pid + '/work_packages?query_props=%7B%22c%22%3A%5B%22id%22%2C%22subject%22%5D%7D';
  await page.goto(wpListUrl);
  await page.waitForSelector('table.work-package-table', { timeout: 15000 });
  await page.waitForTimeout(2000);

  // SEC-A 생성 + WP 3개 할당
  const s1 = await taxPost(page, '/abyz_taxonomy/ui/wp_sections', { name: 'Sec-A Alpha', projectIdentifier: pid });
  const sec1Code = s1.body.section?.code;
  if (!sec1Code) { console.error('SEC-A 생성 실패'); await browser.close(); return; }
  console.log(`[${ts()}] SEC-A: ${sec1Code}`);

  const wpIds = []; // SEC-A WPs
  for (let i = 1; i <= 3; i++) {
    const wp = await taxPost(page, '/abyz_taxonomy/ui/work_packages', {
      projectIdentifier: pid, sectionCode: sec1Code, subject: 'WP-A-' + i
    });
    wpIds.push(String(wp.body.workPackage?.id));
    console.log(`[${ts()}] WP-A-${i}: ${wpIds[wpIds.length-1]} (${wp.status})`);
  }

  // SEC-M 생성 + WP 3개 할당 (마지막 섹션 - TC-055는 이 WP들이 SEC-Z로 이동하는 버그)
  const s2 = await taxPost(page, '/abyz_taxonomy/ui/wp_sections', { name: 'Sec-M Middle', projectIdentifier: pid });
  const sec2Code = s2.body.section?.code;
  if (!sec2Code) { console.error('SEC-M 생성 실패'); await browser.close(); return; }
  console.log(`[${ts()}] SEC-M: ${sec2Code}`);

  const wpIds2 = []; // SEC-M WPs (these should NOT move under SEC-Z)
  for (let i = 1; i <= 3; i++) {
    const wp = await taxPost(page, '/abyz_taxonomy/ui/work_packages', {
      projectIdentifier: pid, sectionCode: sec2Code, subject: 'WP-M-' + i
    });
    wpIds2.push(String(wp.body.workPackage?.id));
    console.log(`[${ts()}] WP-M-${i}: ${wpIds2[wpIds2.length-1]} (${wp.status})`);
  }

  // 페이지 리로드 → 초기 상태 확인
  await page.reload();
  await page.waitForSelector('table.work-package-table tbody.work-package--results-tbody tr', { timeout: 15000 });
  await page.waitForTimeout(3000);
  await screenshot(page, 'initial_state');

  const init = await snapRows(page);
  console.log(`\n[${ts()}] ===== 초기 상태 =====`);
  init.rows.forEach((r, i) => console.log(`  [${i}] ${r.type}:${r.code || r.wpId} "${r.subject}"`));
  console.log(`  sig: ${init.sig?.slice(0, 80)}`);

  // 모니터 주입
  await injectDeepMonitor(page);

  // 실제 UI로 SEC-Z 추가
  console.log(`\n[${ts()}] ===== SEC-Z UI 추가 시작 =====`);
  const addWpBtn = page.locator('button.add-work-package').first();
  const hasBtnCount = await addWpBtn.count();

  if (!hasBtnCount) {
    console.log(`[${ts()}] 버튼 없음 → API fallback`);
    await taxPost(page, '/abyz_taxonomy/ui/wp_sections', { name: 'Sec-Z Zeta', projectIdentifier: pid });
  } else {
    await addWpBtn.click({ force: true });
    await page.waitForTimeout(600);
    await screenshot(page, 'menu_open');

    const sectionMenuBtn = page.locator('#abyz-taxonomy-wp-create-menu [data-abyz-action="wp-section"]');
    if (await sectionMenuBtn.count() === 0) {
      console.log(`[${ts()}] 메뉴 없음 → API fallback`);
      await taxPost(page, '/abyz_taxonomy/ui/wp_sections', { name: 'Sec-Z Zeta', projectIdentifier: pid });
    } else {
      await sectionMenuBtn.click();
      await page.waitForTimeout(500);
      await screenshot(page, 'modal_open');

      const nameInput = page.locator('#abyz-taxonomy-modal-root input[name="name"], #abyz-taxonomy-modal-root input[type="text"]').first();
      if (await nameInput.count() > 0) {
        await nameInput.fill('Sec-Z Zeta');
        await screenshot(page, 'modal_filled');

        // 제출
        let submitBtn = page.locator('#abyz-taxonomy-modal-root button[type="submit"]').first();
        if (await submitBtn.count() === 0) {
          submitBtn = page.locator('#abyz-taxonomy-modal-root button').filter({ hasText: /확인|저장|추가|Submit|OK/i }).first();
        }
        if (await submitBtn.count() > 0) {
          console.log(`[${ts()}] === 모달 제출 ===`);
          await submitBtn.click();
        } else {
          const html = await page.locator('#abyz-taxonomy-modal-root').innerHTML().catch(() => '없음');
          console.log(`[${ts()}] 제출 버튼 없음. 모달 HTML: ${html.slice(0, 300)}`);
        }
      } else {
        console.log(`[${ts()}] 이름 입력 없음 → API fallback`);
        await taxPost(page, '/abyz_taxonomy/ui/wp_sections', { name: 'Sec-Z Zeta', projectIdentifier: pid });
      }
    }
  }

  // === 30초 관찰 (5초 간격 스냅) ===
  console.log(`\n[${ts()}] ===== 30초 관찰 시작 =====`);
  let bugDetected = false;

  for (let i = 0; i < 6; i++) {
    await page.waitForTimeout(5000);
    const snap = await snapRows(page);
    const label = 'snap_' + String((i + 1) * 5) + 's';
    await screenshot(page, label);

    const secAIdx = snap.rows.findIndex(r => r.code === sec1Code);
    const secMIdx = snap.rows.findIndex(r => r.code === sec2Code);
    const secZIdx = snap.rows.findIndex(r => r.type === 'S' && r.code !== sec1Code && r.code !== sec2Code);

    // SEC-M WP들이 SEC-Z 아래에 있으면 TC-055 버그
    const wpM_positions = wpIds2.map(id => snap.rows.findIndex(r => r.wpId === id));
    const wrongWps = wpIds2.filter((id, idx) => {
      const wpos = wpM_positions[idx];
      return secZIdx >= 0 && wpos > secZIdx;
    });

    const orderStr = snap.rows.map(r => r.type === 'S' ? 'S:' + (r.code || '?').split('.').pop() : 'W:' + r.wpId).join(' → ');
    console.log(`[${ts()}] T+${(i+1)*5}s: ${orderStr}`);
    if (wrongWps.length) {
      console.log(`[${ts()}] ❌ BUG 감지! WP가 SEC-Z 아래에 있음: ${wrongWps.join(', ')}`);
      bugDetected = true;
    }
  }

  // 최종 상태
  const final = await snapRows(page);
  const diagLog = await page.evaluate(() => window.__diagLog || []);
  const mutCount = await page.evaluate(() => window.__diagMutCount || 0);

  console.log(`\n[${ts()}] ===== 최종 상태 =====`);
  final.rows.forEach((r, i) => console.log(`  [${i}] ${r.type}:${r.code || r.wpId} "${r.subject}"`));

  console.log(`\n===== DIAG 로그 (${diagLog.length}건, 총 MutationObserver 발화: ${mutCount}) =====`);
  diagLog.forEach(l => console.log(l));

  // 판정
  const secAFinal = final.rows.findIndex(r => r.code === sec1Code);
  const secMFinal = final.rows.findIndex(r => r.code === sec2Code);
  const secZFinal = final.rows.findIndex(r => r.type === 'S' && r.code !== sec1Code && r.code !== sec2Code);
  const wpAPositions = wpIds.map(id => final.rows.findIndex(r => r.wpId === id));
  const wpMPositions = wpIds2.map(id => final.rows.findIndex(r => r.wpId === id));

  // SEC-M WP들이 SEC-Z보다 앞에 있어야 정상
  const secMWpsCorrect = wpMPositions.every(pos => secZFinal < 0 || pos < secZFinal);

  console.log(`\n===== 판정 =====`);
  console.log(`secA=${secAFinal} WP-A=${wpAPositions.join(',')} secM=${secMFinal} WP-M=${wpMPositions.join(',')} secZ=${secZFinal}`);
  if (!bugDetected && secMWpsCorrect) {
    console.log('✅ CORRECT: SEC-M WP들이 SEC-Z 아래로 이동하지 않음');
  } else {
    console.log('❌ BUG(TC-055): SEC-M WP들이 SEC-Z 아래에 나타남!');
  }

  await apiReq(page, 'DELETE', '/api/v3/projects/' + projectId);
  await browser.close();
  console.log(`\n📸 스크린샷: ${SS_DIR}/`);
}

main().catch(e => { console.error(e); process.exit(1); });
