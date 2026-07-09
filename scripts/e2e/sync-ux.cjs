// Verifica el Incremento 4c (UX de sincronización):
//  - Un solo origen de verdad: reconectar dispara UNA sola corrida de sync
//    (antes había 3 instancias independientes de useOfflineSync).
//  - Badge técnico por ejecución (Pendiente de sincronizar) en Mis Actividades,
//    separado del chip de negocio (Borrador) — nunca debe decir "Reportada".
//  - Mensaje de cierre ("N operaciones sincronizadas.") tras terminar triggerSync.
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
const syncStartLogs = [];

(async () => {
  const browser = await chromium.launch({ channel: 'chrome', headless: true });
  try {
    const ctx = await browser.newContext({ viewport: { width: 1600, height: 900 } });
    const page = await ctx.newPage();
    page.setDefaultNavigationTimeout(120000);
    page.setDefaultTimeout(90000);
    page.on('console', (m) => {
      const text = m.text();
      if (text.includes('[offlineSync] Starting sync for') && text.includes('domain command')) {
        syncStartLogs.push(text);
      }
    });

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

    // ── 1. Crear borrador y reportarlo offline (queda encolado) ──
    await page.goto('http://localhost:3000/my-work', { waitUntil: 'domcontentloaded' });
    await page.waitForSelector(`text=${groupTitle}`, { timeout: 90000 });
    await page.waitForSelector(`text=${activity}`, { timeout: 30000 });
    await page.locator(`button:has-text("${activity}")`).first().click();
    await page.waitForSelector('button:has-text("Registrar jornada")', { timeout: 30000 });
    await page.locator('button:has-text("Registrar jornada")').click();
    await page.waitForSelector('button:has-text("Guardar borrador")', { timeout: 30000 });
    const form = page.locator('form');
    await form.locator('input[placeholder="Nombre de la cuadrilla"]').fill('Cuadrilla SyncUX');
    await form.locator('input[type="number"]').first().fill('2');
    await form.locator('input[type="number"]').nth(1).fill('10');
    await page.locator('button:has-text("Guardar borrador")').click();
    await page.waitForSelector('text=Borrador', { timeout: 30000 });
    await page.waitForTimeout(1500);

    await ctx.setOffline(true);
    await page.locator('button:has-text("Reportar")').click();
    await page.waitForSelector('text=Pendiente de sincronizar', { timeout: 15000 });
    console.log('BADGE TÉCNICO "Pendiente de sincronizar" VISIBLE OFFLINE');

    // El chip de NEGOCIO debe seguir diciendo "Borrador" — nunca "Reportada"
    // mientras el comando solo está encolado (separación técnico/negocio).
    const businessChipStillDraft = await page.locator('span:has-text("Borrador")').count();
    console.log('CHIP DE NEGOCIO SIGUE "Borrador" (no finge "Reportada"): ' + (businessChipStillDraft > 0));
    await page.screenshot({ path: path.join(OUT, 'syncux-1-pendiente.png') });

    // ── 2. Reconectar: un solo triggerSync real, no 2-3 redundantes ──
    syncStartLogs.length = 0; // limpiar logs previos (los del login/carga inicial)
    await ctx.setOffline(false);
    await page.waitForTimeout(500);

    // Capturar el toast de cierre y/o el progreso mientras corre. El toast se
    // auto-oculta a los 5s desde que aparece, y triggerSync tiene su propio
    // debounce de 1.5s al reconectar — hay que revisar en la misma ventana de
    // polling, no esperar un bloque fijo aparte (si no, se puede pasar de largo
    // el momento exacto en que el toast está visible).
    let progressSeen = false;
    let toastVisible = false;
    for (let i = 0; i < 40; i++) { // ~10s de polling a 250ms
      if (!progressSeen) {
        const progressText = await page.locator('text=/Sincronizando \\d+\\/\\d+/').count();
        if (progressText > 0) progressSeen = true;
      }
      if (!toastVisible) {
        const toastText = await page.locator('text=/operaci[oó]n(es)? sincronizada/i').count();
        if (toastText > 0) { toastVisible = true; await page.screenshot({ path: path.join(OUT, 'syncux-2-toast.png') }); }
      }
      if (progressSeen && toastVisible) break;
      await page.waitForTimeout(250);
    }
    console.log('PROGRESO REAL "Sincronizando X/Y" VISIBLE EN ALGÚN MOMENTO: ' + progressSeen);
    console.log('TOAST "N OPERACIONES SINCRONIZADAS" VISIBLE: ' + toastVisible);
    if (!toastVisible) await page.screenshot({ path: path.join(OUT, 'syncux-2-toast.png') });

    console.log('LOGS "[offlineSync] Starting sync for N domain commands" capturados: ' + syncStartLogs.length);
    for (const l of syncStartLogs) console.log('  LOG: ' + l);

    const ok = businessChipStillDraft > 0 && toastVisible && syncStartLogs.length <= 1;
    console.log('E2E SYNC UX: ' + (ok ? 'PASS' : 'FAIL'));
    process.exit(ok ? 0 : 1);
  } finally { await browser.close(); }
})().catch((e) => { console.error('DRIVER FAIL:', e); process.exit(1); });
