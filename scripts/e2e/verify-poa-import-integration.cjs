// E2E del Commit 3: reimportar el mismo archivo tras resolver una zona
// refleja el cambio, sin perder el archivo seleccionado ni duplicar
// lógica (solo reinvoca importPoaService). Simula el flujo real: el
// usuario abre "Ir a resolver mapeos de zona" en una pestaña nueva
// (target="_blank"), resuelve UNA zona ahí, vuelve a la pestaña de
// importación (que nunca navegó, el archivo sigue seleccionado) y pulsa
// Importar de nuevo.
// Requiere: dev server, usuario E2E, seed-poa-import-integration.cjs.
const fs = require('fs');
const os = require('os');
const path = require('path');
const { createRequire } = require('module');
const req = createRequire(path.join(process.cwd(), 'package.json'));
const { chromium } = req('playwright-core');

const OUT = path.join(os.tmpdir(), 'mantenix-e2e');
fs.mkdirSync(OUT, { recursive: true });
const { email, password } = JSON.parse(fs.readFileSync(path.join(os.tmpdir(), 'mantenix-e2e-creds.json'), 'utf8'));
const { poaId } = JSON.parse(fs.readFileSync(path.join(os.tmpdir(), 'mantenix-e2e-poa-import-integration-seed.json'), 'utf8'));
const EXCEL_PATH = path.join(process.cwd(), 'POA 2026 V.02 Ene.26-2026.xlsx');
const ZONE_TO_RESOLVE = 'PLAZA DE PTO COLOMBIA';
const consoleErrors = [];

async function login(page, ctx, targetUrl) {
  await ctx.request.get(targetUrl, { timeout: 120000 });
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
}

(async () => {
  const browser = await chromium.launch({ channel: 'chrome', headless: true });
  try {
    const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
    const importPage = await ctx.newPage();
    importPage.setDefaultNavigationTimeout(120000);
    importPage.setDefaultTimeout(90000);
    importPage.on('console', (m) => { if (m.type() === 'error') consoleErrors.push(m.text().slice(0, 300)); });
    importPage.on('pageerror', (e) => consoleErrors.push('PAGEERROR: ' + String(e).slice(0, 300)));

    const importUrl = `http://localhost:3000/poa/${poaId}/import`;
    await login(importPage, ctx, importUrl);

    const errsBefore = consoleErrors.length;
    await importPage.goto(importUrl, { waitUntil: 'domcontentloaded' });

    // 1. Seleccionar el archivo e importar — primer intento, blocked con
    //    las 9 zonas sin mapear.
    await importPage.waitForSelector('text=Selecciona el Excel del POA', { timeout: 90000 });
    await importPage.setInputFiles('input[type="file"]', EXCEL_PATH);
    await importPage.locator('button:has-text("Importar")').click();
    await importPage.waitForSelector('text=/zonas? sin mapear/', { timeout: 60000 });
    const zonesBefore = await importPage.locator('li', { hasText: ZONE_TO_RESOLVE }).count();
    console.log(`PRIMER INTENTO: "${ZONE_TO_RESOLVE}" presente en unresolvedZones =`, zonesBefore > 0);
    await importPage.screenshot({ path: path.join(OUT, 'poa-import-integration-1-primer-intento.png') });

    // 2. Abrir "Ir a resolver mapeos de zona" — debe abrir una PESTAÑA
    //    NUEVA (target="_blank"), sin navegar la pestaña de importación.
    const [zonePage] = await Promise.all([
      ctx.waitForEvent('page'),
      importPage.locator('a:has-text("Ir a resolver mapeos de zona")').click(),
    ]);
    await zonePage.waitForLoadState('domcontentloaded');
    await zonePage.waitForSelector('text=/zona.*pendiente/', { timeout: 60000 });
    console.log('PESTAÑA NUEVA: pantalla de zone-mappings cargada, la de importación no navegó');

    // La pestaña de importación NUNCA navegó — el archivo sigue seleccionado.
    const fileStillSelected = await importPage.locator(`text=POA 2026`).count();
    console.log('Archivo sigue seleccionado en la pestaña de importación:', fileStillSelected > 0);

    // 3. Resolver la zona en la pestaña nueva — localiza la fila cuyo
    //    TÍTULO (no cualquier texto del subárbol) es ZONE_TO_RESOLVE.
    //    Filtrar solo por hasText en el div completo es ambiguo: el
    //    <select> de esa misma fila lista los 9 groups como <option>,
    //    y uno de ellos se llama igual que la zona (nombres de prueba
    //    calcados de los reales) — coincidiría con las 9 filas a la vez.
    const row = zonePage.locator('div.bg-white.border', {
      has: zonePage.locator('p.font-bold', { hasText: ZONE_TO_RESOLVE }),
    });
    await row.locator('select').selectOption({ label: ZONE_TO_RESOLVE });
    await row.locator('button:has-text("Asignar")').click();
    await zonePage.waitForTimeout(2000); // asentar la mutación + invalidación
    await zonePage.screenshot({ path: path.join(OUT, 'poa-import-integration-2-zona-resuelta.png') });
    await zonePage.close();

    // 4. Volver a importar el MISMO archivo en la pestaña original — sin
    //    volver a seleccionarlo.
    await importPage.locator('button:has-text("Importar")').click();
    await importPage.waitForSelector('text=/zonas? sin mapear/', { timeout: 60000 });
    const zonesAfter = await importPage.locator('li', { hasText: ZONE_TO_RESOLVE }).count();
    console.log(`SEGUNDO INTENTO: "${ZONE_TO_RESOLVE}" presente en unresolvedZones =`, zonesAfter > 0);
    await importPage.screenshot({ path: path.join(OUT, 'poa-import-integration-3-reimportado.png') });

    const newErrors = consoleErrors.slice(errsBefore);
    const ok = zonesBefore > 0 && fileStillSelected > 0 && zonesAfter === 0 && newErrors.length === 0;

    if (newErrors.length) console.log('CONSOLE ERRORS:', JSON.stringify(newErrors, null, 2));
    console.log(ok ? 'RESULT: PASS' : 'RESULT: FAIL');
    if (!ok) process.exitCode = 1;
  } catch (err) {
    console.error('DRIVER ERROR:', err.message);
    process.exitCode = 1;
  } finally {
    await browser.close();
  }
})();
