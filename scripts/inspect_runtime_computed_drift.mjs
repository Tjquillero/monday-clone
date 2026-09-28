import puppeteer from 'puppeteer';

const ROUTES_TO_AUDIT = [
  'http://localhost:3000/',
  'http://localhost:3000/login',
  'http://localhost:3000/dashboard',
  'http://localhost:3000/my-work',
  'http://localhost:3000/projects'
];

async function inspectRuntimeDrift() {
  console.log('Iniciando auditoría de runtime computed font-weight (Step 7)...');
  const browser = await puppeteer.launch({
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox']
  });

  const page = await browser.newPage();
  await page.setViewport({ width: 1440, height: 900 });

  const auditReport = [];

  for (const url of ROUTES_TO_AUDIT) {
    console.log(`\nAuditando ruta: ${url}`);
    try {
      await page.goto(url, { waitUntil: 'networkidle2', timeout: 15000 });
      await page.evaluateHandle('document.fonts.ready');

      const elementsData = await page.evaluate((currentUrl) => {
        const allElements = document.querySelectorAll('*');
        const heavyElements = [];

        allElements.forEach((el) => {
          // Ignore non-visible or script/style
          if (['SCRIPT', 'STYLE', 'NOSCRIPT', 'IFRAME', 'HEAD', 'META', 'LINK'].includes(el.tagName)) return;

          const style = window.getComputedStyle(el);
          const weightNum = parseInt(style.fontWeight, 10);

          // Only check elements with direct text or specific classes
          const hasDirectText = Array.from(el.childNodes).some(node => node.nodeType === Node.TEXT_NODE && node.textContent.trim().length > 0);

          if (weightNum >= 800) {
            const isPlexSans = style.fontFamily.toLowerCase().includes('plex sans') ||
                               style.fontFamily.toLowerCase().includes('ibm plex');
            const isSyne = style.fontFamily.toLowerCase().includes('syne');
            const isMono = style.fontFamily.toLowerCase().includes('plex mono') || style.fontFamily.toLowerCase().includes('mono');
            const isSvg = el.tagName.toLowerCase() === 'svg' || el.tagName.toLowerCase() === 'path' || el.closest('svg') !== null;

            heavyElements.push({
              url: currentUrl,
              tag: el.tagName,
              className: el.className ? (typeof el.className === 'string' ? el.className.slice(0, 100) : 'SVGClassName') : '',
              textSnippet: el.innerText ? el.innerText.trim().slice(0, 40) : '',
              fontFamily: style.fontFamily,
              computedWeight: style.fontWeight,
              isDirectText: hasDirectText,
              isPlexSans,
              isSyne,
              isMono,
              isSvg,
              classification: isSvg ? 'SVG_VECTOR' : (isPlexSans ? 'IBM_PLEX_SYNTHESIS_RISK' : (isSyne ? 'SYNE_TRANSITIONAL' : 'OTHER_FONT'))
            });
          }
        });

        return heavyElements;
      }, url);

      console.log(`-> Encontrados ${elementsData.length} elementos con fontWeight >= 800 en ${url}`);
      auditReport.push({
        url,
        count: elementsData.length,
        elements: elementsData
      });

    } catch (err) {
      console.error(`Error al auditar ${url}:`, err.message);
    }
  }

  await browser.close();

  console.log('\n=== RESUMEN RUNTIME COMPUTED WEIGHT (>= 800) ===');
  let totalHeavy = 0;
  let totalPlexRisk = 0;
  let totalSyne = 0;
  let totalSvg = 0;

  auditReport.forEach(r => {
    console.log(`\n[${r.url}] Total heavy elements: ${r.count}`);
    const sample = r.elements.slice(0, 5);
    sample.forEach(e => {
      console.log(`   Tag: <${e.tag}> | Weight: ${e.computedWeight} | Family: ${e.fontFamily.slice(0, 30)} | Class: ${e.className.slice(0, 50)} | Risk: ${e.classification}`);
    });
    r.elements.forEach(e => {
      totalHeavy++;
      if (e.isPlexSans) totalPlexRisk++;
      if (e.isSyne) totalSyne++;
      if (e.isSvg) totalSvg++;
    });
  });

  console.log('\n=======================================');
  console.log(`TOTAL ELEMENTOS COMPUTED >= 800: ${totalHeavy}`);
  console.log(`- IBM Plex Sans (Riesgo Síntesis): ${totalPlexRisk}`);
  console.log(`- Syne (Transicional): ${totalSyne}`);
  console.log(`- SVG / Vector: ${totalSvg}`);
  console.log('=======================================');
}

inspectRuntimeDrift().catch(console.error);
