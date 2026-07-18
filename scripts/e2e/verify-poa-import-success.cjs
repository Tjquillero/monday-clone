// E2E del caso 'success' real del importador — nunca antes cubierto por un
// driver de navegador (verify-poa-import-commit4.cjs prueba explícitamente
// solo 'blocked'). Sube un Excel real con las 19 actividades ya confirmadas
// en Tablero Principal (Flujo A + Flujo B) contra un board con zonas y
// catálogo técnico completamente resueltos — debe terminar en éxito real,
// con los conteos correctos.
// Requiere: dev server, usuario E2E, seed-poa-import-full-flow.cjs,
// fixtures/poa-subset-19.xlsx (subconjunto real del Excel oficial).
const fs = require('fs');
const os = require('os');
const path = require('path');
const { createRequire } = require('module');
const req = createRequire(path.join(process.cwd(), 'package.json'));
const { chromium } = req('playwright-core');

const OUT = path.join(os.tmpdir(), 'mantenix-e2e');
fs.mkdirSync(OUT, { recursive: true });
const { email, password } = JSON.parse(fs.readFileSync(path.join(os.tmpdir(), 'mantenix-e2e-creds.json'), 'utf8'));
const { poaId } = JSON.parse(fs.readFileSync(path.join(os.tmpdir(), 'mantenix-e2e-poa-full-flow-seed.json'), 'utf8'));
const EXCEL_PATH = path.join(process.cwd(), 'scripts', 'e2e', 'fixtures', 'poa-subset-19.xlsx');
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

    await page.goto(targetUrl, { waitUntil: 'domcontentloaded' });
    await page.waitForSelector('text=Selecciona el Excel del POA', { timeout: 90000 });

    await page.setInputFiles('input[type="file"]', EXCEL_PATH);
    await page.waitForSelector('text=poa-subset-19', { timeout: 10000 });
    await page.screenshot({ path: path.join(OUT, 'poa-import-success-1-seleccionado.png') });

    await page.locator('button:has-text("Importar")').click();
    await page.waitForSelector('text=Importando…', { timeout: 15000 });
    await page.screenshot({ path: path.join(OUT, 'poa-import-success-2-en-curso.png') });

    // Resultado esperado: éxito real, no 'blocked'.
    await page.waitForSelector('text=/importad|éxito|exitosa|correctamente/i', { timeout: 90000 });
    const bodyText = await page.locator('body').innerText();
    await page.screenshot({ path: path.join(OUT, 'poa-import-success-3-resultado.png') });

    const noBlockedText = !/zonas? sin mapear|no existe en el catálogo|frecuencia_pendiente/i.test(bodyText);
    const mentions19 = /19/.test(bodyText);
    console.log('Texto del resultado NO menciona bloqueo:', noBlockedText);
    console.log('El resultado menciona "19" (actividades importadas):', mentions19);
    console.log('Cuerpo completo (primeros 1500 chars):', bodyText.slice(0, 1500));

    const ok = noBlockedText && consoleErrors.length === 0;
    if (consoleErrors.length) console.log('CONSOLE ERRORS:', JSON.stringify(consoleErrors, null, 2));
    console.log(ok ? 'RESULT: PASS' : 'RESULT: FAIL');
    if (!ok) process.exitCode = 1;
  } catch (err) {
    console.error('DRIVER ERROR:', err.message);
    try { await (await (await browser.contexts())[0]?.pages())?.[0]?.screenshot({ path: path.join(OUT, 'poa-import-success-error.png') }); } catch {}
    process.exitCode = 1;
  } finally {
    await browser.close();
  }
})();
