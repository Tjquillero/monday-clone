// Verificación E2E de la navegación congelada (src/config/navigation.ts):
//   1) ribbon = exactamente las pestañas de BOARD_TABS
//   2) cada pestaña carga con contenido y sin errores de consola
//   3) los ids retirados (?view=gantt|work-orders|ops) caen en Tabla
// Requiere: dev server en :3000, usuario E2E creado (e2e-user.cjs) y
// playwright-core resoluble desde el node_modules del proyecto.
// Ejecutar desde la raíz del repo. Screenshots en <tmp>/mantenix-e2e/.
const fs = require('fs');
const os = require('os');
const path = require('path');
const { createRequire } = require('module');

const ROOT = process.cwd();
const req = createRequire(path.join(ROOT, 'package.json'));
const { chromium } = req('playwright-core');

const OUT = path.join(os.tmpdir(), 'mantenix-e2e');
fs.mkdirSync(OUT, { recursive: true });
const { email, password } = JSON.parse(fs.readFileSync(path.join(os.tmpdir(), 'mantenix-e2e-creds.json'), 'utf8'));

const EXPECTED_TABS = ['Tabla', 'Ejecución', 'Mapa', 'Costos', 'Cronograma'];
const STALE_IDS = ['gantt', 'work-orders', 'ops', 'planner-viejo'];
const consoleErrors = [];
let failures = 0;

(async () => {
  const browser = await chromium.launch({ channel: 'chrome', headless: true });
  try {
    const ctx = await browser.newContext({ viewport: { width: 1600, height: 900 } });
    const page = await ctx.newPage();
    // Turbopack en dev puede tardar >30 s por ruta fría; sin esto, cualquier
    // goto intermedio revienta con el default de 30 s.
    page.setDefaultNavigationTimeout(120000);
    page.setDefaultTimeout(90000);
    page.on('console', (m) => { if (m.type() === 'error') consoleErrors.push(m.text().slice(0, 300)); });
    page.on('pageerror', (e) => consoleErrors.push('PAGEERROR: ' + String(e).slice(0, 300)));

    // Precalentar /dashboard ANTES del login: en frío Turbopack tarda 30 s+
    // en compilar+renderizar la ruta, y ese lapso rompe la navegación post-login.
    // OJO: con petición HTTP pura, NO con page.goto — visitar /dashboard anónimo
    // deja un redirect diferido de ProtectedRoute que luego expulsa del login.
    await ctx.request.get('http://localhost:3000/dashboard', { timeout: 120000 });

    // Login real por el formulario (el botón "Iniciar Sesión" existe 2 veces:
    // toggle y submit — usar .last()).
    // La app usa createBrowserClient de @supabase/ssr: la sesión vive en
    // COOKIES (sb-<ref>-auth-token), NO en localStorage.
    const hasSession = () => page.evaluate(() => document.cookie.includes('-auth-token'));
    await page.goto('http://localhost:3000/login', { waitUntil: 'domcontentloaded' });
    let loggedIn = false;
    for (let i = 0; i < 5 && !loggedIn; i++) {
      if (!(await hasSession())) {
        // La SPA puede habernos movido (p.ej. submit nativo pre-hidratación
        // navega fuera): volver a /login y esperar a que hidrate.
        if (!page.url().includes('/login')) {
          await page.goto('http://localhost:3000/login', { waitUntil: 'domcontentloaded' });
        }
        try { await page.waitForSelector('input[type="email"]', { timeout: 20000 }); } catch { continue; }
        try { await page.waitForLoadState('networkidle', { timeout: 10000 }); } catch {}
        await page.fill('input[type="email"]', email);
        await page.fill('input[type="password"]', password);
        await page.locator('button:has-text("Iniciar Sesión")').last().click();
        try { await page.waitForURL('**/dashboard**', { timeout: 60000, waitUntil: 'commit' }); } catch {}
      } else if (!page.url().includes('/dashboard')) {
        // sesión creada pero ProtectedRoute rebotó durante una compilación:
        // navegar directo, la ruta ya está caliente
        await page.goto('http://localhost:3000/dashboard', { waitUntil: 'domcontentloaded' });
        await page.waitForTimeout(2000);
      }
      if (page.url().includes('/dashboard') && (await hasSession())) loggedIn = true;
    }
    if (!loggedIn) {
      await page.screenshot({ path: path.join(OUT, 'login-fail.png') });
      const bodyText = await page.$eval('body', (b) => b.innerText.trim().slice(0, 400));
      console.log('LOGIN-FAIL url=' + page.url());
      console.log('LOGIN-FAIL body: ' + bodyText.replace(/\s+/g, ' '));
      for (const e of [...new Set(consoleErrors)].slice(0, 5)) console.log('  ERR: ' + e);
      throw new Error('Login no llegó a /dashboard con sesión tras 5 intentos');
    }

    // ---- Check 1: ribbon (los labels viven en spans "hidden xl:inline";
    // el viewport 1600px los hace visibles).
    await page.waitForFunction(
      () => Array.from(document.querySelectorAll('header nav button span')).filter((s) => s.textContent.trim()).length >= 3,
      undefined, { timeout: 90000 }
    );
    const labels = await page.$$eval('header nav button span', (els) => els.map((e) => e.textContent.trim()));
    const tabsOk = JSON.stringify(labels) === JSON.stringify(EXPECTED_TABS);
    if (!tabsOk) failures++;
    console.log(`TABS ${tabsOk ? 'OK' : 'MAL'}: ${JSON.stringify(labels)}`);
    await page.screenshot({ path: path.join(OUT, 'ribbon.png') });

    const mainLen = async () => {
      try {
        await page.waitForSelector('main', { timeout: 20000 });
        return await page.$eval('main', (m) => m.innerText.trim().length);
      } catch { return await page.$eval('body', (b) => b.innerText.trim().length); }
    };

    // ---- Check 2: cada pestaña carga (Turbopack compila on-demand: esperas generosas).
    for (const label of labels) {
      const before = consoleErrors.length;
      try {
        await page.waitForFunction(
          (n) => document.querySelectorAll('header nav button').length >= n,
          labels.length, { timeout: 90000 }
        );
        await page.locator(`header nav button:has-text("${label}")`).first().click({ timeout: 90000 });
        await page.waitForTimeout(4000);
        const len = await mainLen();
        const errs = consoleErrors.length - before;
        if (len === 0 || errs > 0) failures++;
        console.log(`VIEW ${label}: contenido=${len} chars, errores-consola=${errs}`);
      } catch (e) {
        failures++;
        console.log(`VIEW ${label}: FALLO — ${String(e).slice(0, 150)}`);
      }
      await page.screenshot({ path: path.join(OUT, `view-${label.toLowerCase().normalize('NFD').replace(/[^a-z]/g, '')}.png`) });
    }

    // ---- Check 3: ids retirados caen en la primera pestaña (board).
    for (const stale of STALE_IDS) {
      await page.goto(`http://localhost:3000/dashboard?view=${stale}`, { waitUntil: 'domcontentloaded' });
      await page.waitForSelector('header nav button', { timeout: 90000 });
      await page.waitForTimeout(2500);
      const active = await page.$$eval('header nav button', (btns) => {
        const a = btns.find((b) => b.className.includes('text-white'));
        return a ? a.innerText.trim() : '(ninguna)';
      });
      const len = await mainLen();
      const ok = active.toUpperCase() === EXPECTED_TABS[0].toUpperCase() && len > 0;
      if (!ok) failures++;
      console.log(`STALE ?view=${stale} ${ok ? 'OK' : 'MAL'}: activa="${active}", contenido=${len} chars`);
      await page.screenshot({ path: path.join(OUT, `stale-${stale}.png`) });
    }

    console.log(`CONSOLE-ERRORS-TOTAL: ${consoleErrors.length}`);
    for (const e of [...new Set(consoleErrors)].slice(0, 8)) console.log('  ERR: ' + e);
    console.log(`RESULTADO: ${failures === 0 ? 'PASS' : `FAIL (${failures} checks)`} — screenshots en ${OUT}`);
  } finally {
    await browser.close();
  }
  process.exit(failures === 0 ? 0 : 1);
})().catch((e) => { console.error('DRIVER FAIL:', e); process.exit(1); });
