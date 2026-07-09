// Verifica lectura offline real (Incremento 1 de
// docs/architecture/offline-certification-design.md): /my-work y
// /verification deben seguir mostrando los datos ya vistos cuando el
// navegador pierde conexión y se recarga la página — el caché de IndexedDB
// (weekly_plans/weekly_plan_items/weekly_plan_item_executions/
// board_activity_standards) debe suplir la lectura, no solo `supabase.from`.
// Requiere: dev server, usuario E2E, plan sembrado (seed-plan.cjs) y una
// jornada reportada (drive-jornada.cjs).
const fs = require('fs');
const os = require('os');
const path = require('path');
const { createRequire } = require('module');
const req = createRequire(path.join(process.cwd(), 'package.json'));
const { chromium } = req('playwright-core');

const OUT = path.join(os.tmpdir(), 'mantenix-e2e');
fs.mkdirSync(OUT, { recursive: true });
const { email, password } = JSON.parse(fs.readFileSync(path.join(os.tmpdir(), 'mantenix-e2e-creds.json'), 'utf8'));
const { activityNames, groupTitle } = JSON.parse(fs.readFileSync(path.join(os.tmpdir(), 'mantenix-e2e-seed.json'), 'utf8'));
const consoleErrors = [];

(async () => {
  const browser = await chromium.launch({ channel: 'chrome', headless: true });
  try {
    const ctx = await browser.newContext({ viewport: { width: 1600, height: 900 } });
    const page = await ctx.newPage();
    page.setDefaultNavigationTimeout(120000);
    page.setDefaultTimeout(90000);
    page.on('console', (m) => { if (m.type() === 'error') consoleErrors.push(m.text().slice(0, 200)); });
    page.on('pageerror', (e) => consoleErrors.push('PAGEERROR: ' + String(e).slice(0, 200)));

    // login
    await ctx.request.get('http://localhost:3000/my-work', { timeout: 120000 });
    const hasSession = () => page.evaluate(() => document.cookie.includes('-auth-token'));
    await page.goto('http://localhost:3000/login', { waitUntil: 'domcontentloaded' });
    let loggedIn = false;
    for (let i = 0; i < 5 && !loggedIn; i++) {
      if (!(await hasSession())) {
        if (!page.url().includes('/login')) await page.goto('http://localhost:3000/login', { waitUntil: 'domcontentloaded' });
        try { await page.waitForSelector('input[type="email"]', { timeout: 20000 }); } catch { continue; }
        try { await page.waitForLoadState('networkidle', { timeout: 10000 }); } catch {}
        await page.fill('input[type="email"]', email);
        await page.fill('input[type="password"]', password);
        await page.locator('button:has-text("Iniciar Sesión")').last().click();
        try { await page.waitForURL('**/dashboard**', { timeout: 60000, waitUntil: 'commit' }); } catch {}
      }
      if (await hasSession()) loggedIn = true;
    }
    if (!loggedIn) throw new Error('sin sesión');
    await page.waitForTimeout(5000);

    const activity = activityNames[0];

    // ── Paso 1: visitar /my-work EN LÍNEA para poblar el caché IndexedDB ──
    await page.goto('http://localhost:3000/my-work', { waitUntil: 'domcontentloaded' });
    await page.waitForSelector(`text=${groupTitle}`, { timeout: 90000 });
    await page.waitForSelector(`text=${activity}`, { timeout: 30000 });
    await page.waitForTimeout(1500); // dejar que upsertRecords() termine de escribir en IndexedDB
    console.log('MY-WORK ONLINE: plan visible, caché debería estar poblado');

    const idbCounts = await page.evaluate(() => new Promise((resolve) => {
      const req = indexedDB.open('mantenix_offline_db');
      req.onsuccess = () => {
        const db = req.result;
        const tables = ['weekly_plans', 'weekly_plan_items', 'weekly_plan_item_executions', 'board_activity_standards'];
        const counts = {};
        let pending = tables.length;
        tables.forEach((t) => {
          const tx = db.transaction(t, 'readonly');
          const countReq = tx.objectStore(t).count();
          countReq.onsuccess = () => { counts[t] = countReq.result; pending -= 1; if (pending === 0) resolve(counts); };
        });
      };
      req.onerror = () => resolve({ error: 'no se pudo abrir IndexedDB' });
    }));
    console.log('IDB COUNTS (tras visita online): ' + JSON.stringify(idbCounts));

    // ── Paso 2: visitar /verification EN LÍNEA para poblar su parte del caché ──
    await page.goto('http://localhost:3000/verification', { waitUntil: 'domcontentloaded' });
    await page.waitForSelector(`text=${activity}`, { timeout: 30000 });
    await page.waitForTimeout(1500);
    console.log('VERIFICATION ONLINE: jornada reportada visible');

    // ── Paso 3: forzar offline real (Playwright, no solo navigator.onLine) ──
    await ctx.setOffline(true);
    console.log('CONTEXTO OFFLINE ACTIVADO');

    // ── Paso 4: recargar /verification offline ──
    const errsBeforeVerifOffline = consoleErrors.length;
    await page.reload({ waitUntil: 'domcontentloaded' });
    let verifOfflineOk = false;
    let verifOfflineBody = '';
    try {
      await page.waitForSelector(`text=${activity}`, { timeout: 20000 });
      verifOfflineOk = true;
    } catch {}
    verifOfflineBody = await page.$eval('body', (b) => b.innerText.replace(/\s+/g, ' ').slice(0, 400));
    await page.screenshot({ path: path.join(OUT, 'offline-1-verification.png') });
    const verifErrors = consoleErrors.slice(errsBeforeVerifOffline);
    console.log('VERIFICATION OFFLINE: jornada visible=' + verifOfflineOk);
    console.log('  BODY: ' + verifOfflineBody);

    // ── Paso 5: recargar /my-work offline ──
    const errsBeforeMyWorkOffline = consoleErrors.length;
    await page.goto('http://localhost:3000/my-work', { waitUntil: 'domcontentloaded' });
    let myWorkOfflineOk = false;
    let myWorkOfflineBody = '';
    try {
      await page.waitForSelector(`text=${groupTitle}`, { timeout: 20000 });
      await page.waitForSelector(`text=${activity}`, { timeout: 10000 });
      myWorkOfflineOk = true;
    } catch {}
    myWorkOfflineBody = await page.$eval('body', (b) => b.innerText.replace(/\s+/g, ' ').slice(0, 400));
    await page.screenshot({ path: path.join(OUT, 'offline-2-mywork.png') });
    const myWorkErrors = consoleErrors.slice(errsBeforeMyWorkOffline);
    console.log('MY-WORK OFFLINE: plan visible=' + myWorkOfflineOk);
    console.log('  BODY: ' + myWorkOfflineBody);

    // ── Paso 6: expandir la actividad offline y ver la jornada reportada ──
    let jornadaOfflineOk = false;
    try {
      await page.locator(`button:has-text("${activity}")`).first().click();
      await page.waitForSelector('text=Reportada', { timeout: 10000 });
      jornadaOfflineOk = true;
    } catch {}
    await page.screenshot({ path: path.join(OUT, 'offline-3-jornada-expandida.png') });
    console.log('JORNADA OFFLINE VISIBLE AL EXPANDIR: ' + jornadaOfflineOk);

    await ctx.setOffline(false);

    const allErrors = [...verifErrors, ...myWorkErrors];
    console.log('CONSOLE-ERRORS-OFFLINE: ' + allErrors.length);
    for (const e of [...new Set(allErrors)].slice(0, 8)) console.log('  ERR: ' + e);

    const ok = verifOfflineOk && myWorkOfflineOk && jornadaOfflineOk;
    console.log('E2E OFFLINE MY-WORK/VERIFICATION: ' + (ok ? 'PASS' : 'FAIL'));
    process.exit(ok ? 0 : 1);
  } finally { await browser.close(); }
})().catch((e) => { console.error('DRIVER FAIL:', e); process.exit(1); });
