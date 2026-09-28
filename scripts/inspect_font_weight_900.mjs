import puppeteer from 'puppeteer';

async function diagnoseFontWeights() {
  const browser = await puppeteer.launch({
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox']
  });

  const page = await browser.newPage();
  await page.goto('http://localhost:3000/', { waitUntil: 'networkidle0' });
  await page.evaluateHandle('document.fonts.ready');

  const matches = await page.evaluate(() => {
    const all = Array.from(document.querySelectorAll('*'));
    const results = [];

    for (const el of all) {
      // Ignore script, style, meta, svg children
      if (['SCRIPT', 'STYLE', 'LINK', 'META', 'NOSCRIPT', 'path', 'svg', 'g', 'defs'].includes(el.tagName)) {
        continue;
      }
      const style = window.getComputedStyle(el);
      const font = style.fontFamily;
      const weight = style.fontWeight;

      if (weight === '800' || weight === '900') {
        const text = el.innerText ? el.innerText.trim().slice(0, 120).replace(/\n/g, ' ') : '';
        results.push({
          tagName: el.tagName,
          className: el.className || '',
          id: el.id || '',
          textSnippet: text,
          fontFamily: font,
          fontWeight: weight,
          fontSize: style.fontSize,
          lineHeight: style.lineHeight,
          letterSpacing: style.letterSpacing
        });
      }
    }
    return results;
  });

  console.log('=== DOM ELEMENTS WITH FONT-WEIGHT 800 OR 900 ON http://localhost:3000/ ===');
  console.log(`Total elements found: ${matches.length}`);
  console.log(JSON.stringify(matches, null, 2));

  await browser.close();
}

diagnoseFontWeights().catch(console.error);
