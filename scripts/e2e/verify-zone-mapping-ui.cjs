// E2E de la pantalla /poa/[poaId]/zone-mappings (ADR-0004):
//   carga la zona pendiente sembrada -> selecciona el group -> Asignar ->
//   la fila desaparece (mapeo resuelto) -> estado vacío.
// Requiere: dev server, usuario E2E, seed-zone-mapping.cjs.
const fs = require('fs');
const os = require('os');
const path = require('path');
const { createRequire } = require('module');
const req = createRequire(path.join(process.cwd(), 'package.json'));
const { chromium } = req('playwright-core');

const OUT = path.join(os.tmpdir(), 'mantenix-e2e');
fs.mkdirSync(OUT, { recursive: true });
const { email, password } = JSON.parse(fs.readFileSync(path.join(os.tmpdir(), 'mantenix-e2e-creds.json'), 'utf8'));
const { poaId, groupTitle } = JSON.parse(fs.readFileSync(path.join(os.tmpdir(), 'mantenix-e2e-zone-mapping-seed.json'), 'utf8'));
const consoleErrors = [];

(async () => {
  const browser = await chromium.launch({ channel: 'chrome', headless: true });
  try {
    const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
    const page = await ctx.newPage();
    page.setDefaultNavigationTimeout(120000);
    page.setDefaultTimeout(90000);
    page.on('console', (m) => { if (m.type() === 'error') consoleErrors.push(m.text().slice(0, 200)); });
    page.on('pageerror', (e) => consoleErrors.push('PAGEERROR: ' + String(e).slice(0, 200)));

    const targetUrl = `http://localhost:3000/poa/${poaId}/zone-mappings`;

    // login (mismo patrón que drive-jornada.cjs: precalentar con request.get,
    // login real por formulario, sesión en cookies vía @supabase/ssr)
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

    // 1. La zona pendiente sembrada es visible
    await page.waitForSelector('text=PLAZA DE PTO COLOMBIA (E2E)', { timeout: 90000 });
    console.log('ZONA PENDIENTE VISIBLE: "PLAZA DE PTO COLOMBIA (E2E)"');
    await page.screenshot({ path: path.join(OUT, 'zone-mapping-1-pending.png') });

    // 2. Seleccionar el group real en el <select> de esa fila (una sola
    //    fila pendiente sembrada, así que el primer <select> es inequívoco)
    const select = page.locator('select').first();
    await select.selectOption({ label: groupTitle });
    await page.screenshot({ path: path.join(OUT, 'zone-mapping-2-selected.png') });

    // 3. Asignar
    await page.locator('button:has-text("Asignar")').first().click();

    // 4. La fila desaparece -> estado vacío "Sin mapeos de zona pendientes"
    await page.waitForSelector('text=Sin mapeos de zona pendientes', { timeout: 30000 });
    console.log('MAPEO RESUELTO: la fila desapareció, estado vacío visible');
    await page.screenshot({ path: path.join(OUT, 'zone-mapping-3-resolved.png') });

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
    try { await (await (await browser.contexts())[0]?.pages())?.[0]?.screenshot({ path: path.join(OUT, 'zone-mapping-error.png') }); } catch {}
    process.exitCode = 1;
  } finally {
    await browser.close();
  }
})();
