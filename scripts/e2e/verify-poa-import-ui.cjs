// E2E del esqueleto de /poa/[poaId]/import (Commit 1): selecciona el Excel
// real del POA, pulsa Importar, y verifica que aparece un resultado
// tipado (status visible) sin errores de consola — no exige 'success'
// (con este seed sin zonas/catálogo resueltos, el resultado esperado es
// 'blocked').
// Requiere: dev server, usuario E2E, seed-poa-import.cjs.
const fs = require('fs');
const os = require('os');
const path = require('path');
const { createRequire } = require('module');
const req = createRequire(path.join(process.cwd(), 'package.json'));
const { chromium } = req('playwright-core');

const OUT = path.join(os.tmpdir(), 'mantenix-e2e');
fs.mkdirSync(OUT, { recursive: true });
const { email, password } = JSON.parse(fs.readFileSync(path.join(os.tmpdir(), 'mantenix-e2e-creds.json'), 'utf8'));
const { poaId } = JSON.parse(fs.readFileSync(path.join(os.tmpdir(), 'mantenix-e2e-poa-import-seed.json'), 'utf8'));
const EXCEL_PATH = path.join(process.cwd(), 'POA 2026 V.02 Ene.26-2026.xlsx');
const consoleErrors = [];

(async () => {
  const browser = await chromium.launch({ channel: 'chrome', headless: true });
  try {
    const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
    const page = await ctx.newPage();
    page.setDefaultNavigationTimeout(120000);
    page.setDefaultTimeout(90000);
    page.on('console', (m) => { if (m.type() === 'error') consoleErrors.push(m.text().slice(0, 300)); });
    page.on('pageerror', (e) => consoleErrors.push('PAGEERROR: ' + String(e).slice(0, 300)));

    const targetUrl = `http://localhost:3000/poa/${poaId}/import`;

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

    const errsBefore = consoleErrors.length;
    await page.goto(targetUrl, { waitUntil: 'domcontentloaded' });

    // 1. La pantalla carga con el selector de archivo
    await page.waitForSelector('text=Selecciona el Excel del POA', { timeout: 90000 });
    console.log('PANTALLA CARGADA: selector de archivo visible');
    await page.screenshot({ path: path.join(OUT, 'poa-import-1-inicial.png') });

    // 2. Seleccionar el Excel real del POA
    await page.setInputFiles('input[type="file"]', EXCEL_PATH);
    await page.waitForSelector(`text=POA 2026`, { timeout: 10000 });
    await page.screenshot({ path: path.join(OUT, 'poa-import-2-archivo-seleccionado.png') });

    // 3. Importar
    await page.locator('button:has-text("Importar")').click();

    // 4. Aparece la presentación por variante de ImportPoaResult — con este
    //    seed sin zonas/catálogo resueltos, el resultado esperado es
    //    'blocked': sección de zonas sin mapear + sección de errores del
    //    Excel (catálogo vacío -> todas las actividades son "desconocidas").
    await page.waitForSelector('text=/zonas? sin mapear/', { timeout: 60000 });
    console.log('RESULTADO RENDERIZADO: sección "zonas sin mapear" visible');
    const hasZoneLink = await page.locator('a:has-text("Ir a resolver mapeos de zona")').count();
    console.log('Enlace a /zone-mappings presente:', hasZoneLink > 0);
    const hasErrorsSection = await page.locator('text=/error(es)? en el Excel/').count();
    console.log('Sección de errores del Excel presente:', hasErrorsSection > 0);
    await page.screenshot({ path: path.join(OUT, 'poa-import-3-resultado.png') });

    const newErrors = consoleErrors.slice(errsBefore);
    if (newErrors.length) {
      console.log('CONSOLE ERRORS:', JSON.stringify(newErrors, null, 2));
      process.exitCode = 1;
    } else {
      console.log('0 errores de consola');
    }

    console.log(newErrors.length ? 'RESULT: FAIL' : 'RESULT: PASS');
  } catch (err) {
    console.error('DRIVER ERROR:', err.message);
    try { await (await (await browser.contexts())[0]?.pages())?.[0]?.screenshot({ path: path.join(OUT, 'poa-import-error.png') }); } catch {}
    process.exitCode = 1;
  } finally {
    await browser.close();
  }
})();
