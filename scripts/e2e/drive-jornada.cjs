// E2E del ciclo del líder en /my-work:
//   expandir actividad → Registrar jornada → Guardar borrador → Reportar.
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
    await page.waitForTimeout(5000); // asentar antes de navegar (aborts de auth-js)

    const errsBefore = consoleErrors.length;
    await page.goto('http://localhost:3000/my-work', { waitUntil: 'domcontentloaded' });

    // 1. El plan sembrado aparece con su sitio y actividades
    await page.waitForSelector(`text=${groupTitle}`, { timeout: 90000 });
    const activity = activityNames[0];
    await page.waitForSelector(`text=${activity}`, { timeout: 30000 });
    console.log(`PLAN VISIBLE: sitio="${groupTitle}", actividad="${activity}"`);
    await page.screenshot({ path: path.join(OUT, 'jornada-1-plan.png') });

    // 2. Expandir la actividad y abrir el formulario
    await page.locator(`button:has-text("${activity}")`).first().click();
    await page.waitForSelector('button:has-text("Registrar jornada")', { timeout: 30000 });
    await page.locator('button:has-text("Registrar jornada")').click();
    await page.waitForSelector('button:has-text("Guardar borrador")', { timeout: 30000 });

    // 3. Llenar el formulario: cuadrilla, 3 trabajadores, 25 unidades
    const form = page.locator('form');
    await form.locator('input[placeholder="Nombre de la cuadrilla"]').fill('Cuadrilla Norte');
    await form.locator('input[type="number"]').first().fill('3');
    await form.locator('input[type="number"]').nth(1).fill('25');
    await page.screenshot({ path: path.join(OUT, 'jornada-2-form.png') });
    await page.locator('button:has-text("Guardar borrador")').click();

    // 4. Aparece la jornada en borrador
    await page.waitForSelector('text=Borrador', { timeout: 30000 });
    console.log('BORRADOR CREADO (chip visible)');
    await page.screenshot({ path: path.join(OUT, 'jornada-3-borrador.png') });

    // 5. Reportar
    await page.locator('button:has-text("Reportar")').click();
    await page.waitForSelector('text=Reportada', { timeout: 30000 });
    console.log('JORNADA REPORTADA (chip visible)');
    await page.waitForTimeout(3000); // invalidación → refresco de agregados
    await page.screenshot({ path: path.join(OUT, 'jornada-4-reportada.png') });

    // 6. El agregado del item refleja lo reportado (trigger en BD)
    const bodyText = await page.$eval('body', (b) => b.innerText);
    const aggregateOk = bodyText.includes('25');
    console.log('AGREGADO EJECUTADO VISIBLE: ' + aggregateOk);

    const viewErrors = consoleErrors.slice(errsBefore);
    console.log('CONSOLE-ERRORS-VISTA: ' + viewErrors.length);
    for (const e of [...new Set(viewErrors)].slice(0, 6)) console.log('  ERR: ' + e);

    const ok = viewErrors.length === 0 && aggregateOk;
    console.log('E2E JORNADA: ' + (ok ? 'PASS' : 'FAIL'));
    process.exit(ok ? 0 : 1);
  } finally { await browser.close(); }
})().catch((e) => { console.error('DRIVER FAIL:', e); process.exit(1); });
