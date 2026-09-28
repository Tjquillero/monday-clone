import puppeteer from 'puppeteer';

async function auditPlannerSurface() {
  console.log('Iniciando Discovery de Runtime para C1.3 (/dashboard?view=planner)...');
  const browser = await puppeteer.launch({
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox']
  });

  const page = await browser.newPage();
  await page.setViewport({ width: 1440, height: 900 });

  const url = 'http://localhost:3000/dashboard?view=planner';
  console.log(`Navegando a: ${url}`);

  await page.goto(url, { waitUntil: 'networkidle2', timeout: 15000 });
  await page.evaluateHandle('document.fonts.ready');

  const analysis = await page.evaluate(() => {
    // 1. Detección de componentes principales
    const headers = Array.from(document.querySelectorAll('h1, h2, h3')).map(h => ({
      tag: h.tagName,
      text: h.innerText.trim(),
      classes: h.className
    }));

    const buttons = Array.from(document.querySelectorAll('button')).map(b => ({
      text: b.innerText.trim(),
      disabled: b.disabled,
      classes: b.className.slice(0, 80)
    }));

    const selects = Array.from(document.querySelectorAll('select')).map(s => ({
      value: s.value,
      options: Array.from(s.options).map(o => o.text)
    }));

    const warnings = Array.from(document.querySelectorAll('[class*="border-amber"], [class*="border-red"], [class*="bg-amber"], [class*="bg-red"]')).map(w => ({
      text: w.innerText.trim().slice(0, 100),
      classes: w.className.slice(0, 80)
    }));

    const tables = document.querySelectorAll('table').length;

    // 2. Verificar estado de empty state o selección de sitio
    const hasSiteSelector = document.querySelector('[data-testid="planning-site-selector"]') !== null ||
                           document.body.innerText.includes('Selecciona un sitio');

    return {
      title: document.title,
      headers,
      buttonsCount: buttons.length,
      sampleButtons: buttons.slice(0, 8),
      selects,
      warningsCount: warnings.length,
      sampleWarnings: warnings.slice(0, 4),
      tablesCount: tables,
      hasSiteSelector
    };
  });

  await browser.close();

  console.log('\n=== RESULTADOS DISCOVERY RUNTIME C1.3 ===');
  console.log(JSON.stringify(analysis, null, 2));
}

auditPlannerSurface().catch(console.error);
