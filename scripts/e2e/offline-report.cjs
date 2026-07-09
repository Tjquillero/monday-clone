// Verifica el Incremento 2 del soporte offline (cola de comandos de dominio,
// REPORT_EXECUTION): crear un borrador en línea, reportarlo SIN CONEXIÓN,
// confirmar que queda "Pendiente de sincronizar" (no se pierde, no se marca
// reportado localmente como si el servidor ya lo hubiera aceptado — Invariante
// 5 de offline-certification-design.md), reconectar y confirmar que el RPC
// report_execution se ejecuta solo y la jornada queda realmente 'reported'
// en el servidor.
// Requiere: dev server, usuario E2E, plan sembrado (seed-plan.cjs).
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

    // ── 1. Crear un borrador de jornada EN LÍNEA (carril CRUD, ya cubierto) ──
    await page.goto('http://localhost:3000/my-work', { waitUntil: 'domcontentloaded' });
    await page.waitForSelector(`text=${groupTitle}`, { timeout: 90000 });
    await page.waitForSelector(`text=${activity}`, { timeout: 30000 });
    await page.locator(`button:has-text("${activity}")`).first().click();
    await page.waitForSelector('button:has-text("Registrar jornada")', { timeout: 30000 });
    await page.locator('button:has-text("Registrar jornada")').click();
    await page.waitForSelector('button:has-text("Guardar borrador")', { timeout: 30000 });
    const form = page.locator('form');
    await form.locator('input[placeholder="Nombre de la cuadrilla"]').fill('Cuadrilla Offline');
    await form.locator('input[type="number"]').first().fill('2');
    await form.locator('input[type="number"]').nth(1).fill('15');
    await page.locator('button:has-text("Guardar borrador")').click();
    await page.waitForSelector('text=Borrador', { timeout: 30000 });
    await page.waitForTimeout(1500); // asentar caché IndexedDB de weekly_plan_item_executions
    console.log('BORRADOR CREADO EN LÍNEA');

    // ── 2. Desconectar y reportar ──
    await ctx.setOffline(true);
    console.log('CONTEXTO OFFLINE ACTIVADO');
    await page.locator('button:has-text("Reportar")').click();

    let queuedNoticeOk = false;
    try {
      await page.waitForSelector('text=Sin conexión — se reportará automáticamente', { timeout: 15000 });
      queuedNoticeOk = true;
    } catch {}
    console.log('AVISO "PENDIENTE DE SINCRONIZAR" (mensaje) VISIBLE: ' + queuedNoticeOk);

    let chipOk = false;
    try {
      await page.waitForSelector('text=Pendiente de sincronizar', { timeout: 10000 });
      chipOk = true;
    } catch {}
    console.log('CHIP "PENDIENTE DE SINCRONIZAR" VISIBLE: ' + chipOk);
    await page.screenshot({ path: path.join(OUT, 'offline-report-1-queued.png') });

    // El chip "Borrador" debe seguir ahí — el cliente NUNCA marca localmente
    // "reportado" como si el servidor ya lo hubiera aceptado (Invariante 5).
    const stillDraftChip = await page.locator('text=Borrador').count();
    console.log('CHIP "BORRADOR" AÚN VISIBLE (invariante: no fingir éxito): ' + (stillDraftChip > 0));

    // ── 3. Recargar offline: el comando encolado debe sobrevivir el reload (IndexedDB, no memoria) ──
    await page.reload({ waitUntil: 'domcontentloaded' });
    await page.waitForSelector(`text=${activity}`, { timeout: 30000 });
    await page.locator(`button:has-text("${activity}")`).first().click();
    let chipSurvivedReload = false;
    try {
      await page.waitForSelector('text=Pendiente de sincronizar', { timeout: 15000 });
      chipSurvivedReload = true;
    } catch {}
    console.log('CHIP SOBREVIVE RELOAD OFFLINE (persistido en IndexedDB, no en memoria): ' + chipSurvivedReload);
    await page.screenshot({ path: path.join(OUT, 'offline-report-2-reload-offline.png') });

    // ── 4. Reconectar: useOfflineSync debe reproducir el comando solo ──
    await ctx.setOffline(false);
    console.log('CONTEXTO ONLINE RESTAURADO');
    await page.waitForTimeout(6000); // debounce de triggerSync (1.5s) + round-trip del RPC

    await page.reload({ waitUntil: 'domcontentloaded' });
    await page.waitForSelector(`text=${activity}`, { timeout: 30000 });
    await page.locator(`button:has-text("${activity}")`).first().click();
    let reportedAfterSync = false;
    try {
      await page.waitForSelector('text=Reportada', { timeout: 20000 });
      reportedAfterSync = true;
    } catch {}
    console.log('JORNADA REALMENTE REPORTADA TRAS RECONECTAR (estado real del servidor): ' + reportedAfterSync);
    await page.screenshot({ path: path.join(OUT, 'offline-report-3-synced.png') });

    const body = await page.$eval('body', (b) => b.innerText.replace(/\s+/g, ' ').slice(0, 500));
    console.log('BODY FINAL: ' + body);

    console.log('CONSOLE-ERRORS: ' + consoleErrors.length);
    for (const e of [...new Set(consoleErrors)].slice(0, 10)) console.log('  ERR: ' + e);

    const ok = queuedNoticeOk && chipOk && stillDraftChip > 0 && chipSurvivedReload && reportedAfterSync;
    console.log('E2E OFFLINE REPORT_EXECUTION: ' + (ok ? 'PASS' : 'FAIL'));
    process.exit(ok ? 0 : 1);
  } finally { await browser.close(); }
})().catch((e) => { console.error('DRIVER FAIL:', e); process.exit(1); });
