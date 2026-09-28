import puppeteer from 'puppeteer';

const ROUTES_TO_AUDIT = [
  'http://localhost:3000/',
  'http://localhost:3000/login',
  'http://localhost:3000/dashboard',
  'http://localhost:3000/my-work',
  'http://localhost:3000/projects'
];

async function verifyStep8() {
  console.log('Iniciando verificación Puppeteer tras eliminación de Syne (Step 8)...');
  const browser = await puppeteer.launch({
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox']
  });

  const page = await browser.newPage();
  await page.setViewport({ width: 1440, height: 900 });

  const results = [];

  for (const url of ROUTES_TO_AUDIT) {
    console.log(`Auditando ruta: ${url}`);
    await page.goto(url, { waitUntil: 'networkidle2', timeout: 15000 });
    await page.evaluateHandle('document.fonts.ready');

    const pageData = await page.evaluate((currentUrl) => {
      const all = Array.from(document.querySelectorAll('*'));

      let syneCount = 0;
      let plexSansCount = 0;
      let plexMonoCount = 0;
      let heavyWeightsCount = 0;

      all.forEach(el => {
        if (['SCRIPT', 'STYLE', 'NOSCRIPT', 'IFRAME', 'HEAD', 'META', 'LINK'].includes(el.tagName)) return;
        const style = window.getComputedStyle(el);
        const family = style.fontFamily.toLowerCase();
        const weight = parseInt(style.fontWeight, 10);

        if (family.includes('syne')) syneCount++;
        if (family.includes('ibm plex sans') || family.includes('plex sans')) plexSansCount++;
        if (family.includes('ibm plex mono') || family.includes('plex mono')) plexMonoCount++;
        if (weight >= 800) heavyWeightsCount++;
      });

      // Chequear variables CSS en documentElement
      const htmlClasses = document.documentElement.className;

      return {
        url: currentUrl,
        htmlClasses,
        syneCount,
        plexSansCount,
        plexMonoCount,
        heavyWeightsCount,
        hasSyneVar: htmlClasses.includes('--font-syne')
      };
    }, url);

    results.push(pageData);
  }

  await browser.close();

  console.log('\n=== REPORTE STEP 8: DESACOPLE DE SYNE ===');
  results.forEach(r => {
    console.log(`[${r.url}]`);
    console.log(`- HTML Classes: ${r.htmlClasses}`);
    console.log(`- syne font occurrences: ${r.syneCount}`);
    console.log(`- plex sans occurrences: ${r.plexSansCount}`);
    console.log(`- plex mono occurrences: ${r.plexMonoCount}`);
    console.log(`- computed >= 800: ${r.heavyWeightsCount}`);
    console.log(`- Has --font-syne: ${r.hasSyneVar}`);
    console.log('---');
  });
}

verifyStep8().catch(console.error);
