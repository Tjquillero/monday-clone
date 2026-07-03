// Smoke E2E de /my-work (Mis actividades): login real, render, errores de consola.
const fs = require('fs');
const os = require('os');
const path = require('path');
const { createRequire } = require('module');
const req = createRequire(path.join(process.cwd(), 'package.json'));
const { chromium } = req('playwright-core');

const OUT = path.join(os.tmpdir(), 'mantenix-e2e');
fs.mkdirSync(OUT, { recursive: true });
const { email, password } = JSON.parse(fs.readFileSync(path.join(os.tmpdir(), 'mantenix-e2e-creds.json'), 'utf8'));
const consoleErrors = [];

(async () => {
  const browser = await chromium.launch({ channel: 'chrome', headless: true });
  try {
    const ctx = await browser.newContext({ viewport: { width: 1600, height: 900 } });
    const page = await ctx.newPage();
    page.setDefaultNavigationTimeout(120000);
    page.setDefaultTimeout(90000);
    page.on('console', (m) => { if (m.type() === 'error') consoleErrors.push(m.text().slice(0, 300)); });
    page.on('pageerror', (e) => consoleErrors.push('PAGEERROR: ' + String(e).slice(0, 300)));

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

    // Dejar asentar el dashboard post-login: navegar con fetches de auth en
    // vuelo los aborta y genera "Failed to fetch" espurios de auth-js.
    await page.waitForTimeout(5000);
    const errsBeforeView = consoleErrors.length; // excluir ruido del login
    await page.goto('http://localhost:3000/my-work', { waitUntil: 'domcontentloaded' });
    await page.waitForSelector('h1:has-text("Mis actividades")', { timeout: 90000 });
    await page.waitForTimeout(5000); // fetch del plan semanal
    const body = await page.$eval('body', (b) => b.innerText.replace(/\s+/g, ' ').slice(0, 500));
    await page.screenshot({ path: path.join(OUT, 'my-work.png') });
    const viewErrors = consoleErrors.slice(errsBeforeView);
    console.log('BODY: ' + body);
    console.log('CONSOLE-ERRORS-VISTA: ' + viewErrors.length);
    for (const e of [...new Set(viewErrors)].slice(0, 6)) console.log('  ERR: ' + e);
    const ok = viewErrors.length === 0 && !body.includes('No se pudo cargar');
    console.log('SMOKE: ' + (ok ? 'PASS' : 'FAIL'));
    process.exit(ok ? 0 : 1);
  } finally { await browser.close(); }
})().catch((e) => { console.error('DRIVER FAIL:', e); process.exit(1); });
