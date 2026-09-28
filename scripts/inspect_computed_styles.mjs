import puppeteer from 'puppeteer';

async function inspectComputedStyles() {
  const browser = await puppeteer.launch({
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox']
  });

  const page = await browser.newPage();

  console.log('=== 1. /login ===');
  await page.goto('http://localhost:3000/login', { waitUntil: 'networkidle0' });
  const loginData = await page.evaluate(() => {
    const h1 = document.querySelector('h1');
    const p = document.querySelector('p');
    const input = document.querySelector('input');
    const btn = document.querySelector('button');
    const svgLogo = document.querySelector('svg');
    const paths = document.querySelectorAll('svg path');

    return {
      h1: h1 ? {
        fontFamily: window.getComputedStyle(h1).fontFamily,
        fontWeight: window.getComputedStyle(h1).fontWeight,
        fontSize: window.getComputedStyle(h1).fontSize,
        lineHeight: window.getComputedStyle(h1).lineHeight
      } : 'not found',
      p: p ? {
        fontFamily: window.getComputedStyle(p).fontFamily,
        fontWeight: window.getComputedStyle(p).fontWeight
      } : 'not found',
      input: input ? {
        fontFamily: window.getComputedStyle(input).fontFamily,
        fontWeight: window.getComputedStyle(input).fontWeight
      } : 'not found',
      button: btn ? {
        fontFamily: window.getComputedStyle(btn).fontFamily,
        fontWeight: window.getComputedStyle(btn).fontWeight
      } : 'not found',
      svgLogo: {
        present: !!svgLogo,
        pathCount: paths.length,
        hasTextTag: document.querySelectorAll('svg text').length
      }
    };
  });
  console.log('Login Result:', JSON.stringify(loginData, null, 2));

  console.log('\n=== 2. Landing / Dashboard (http://localhost:3000) ===');
  await page.goto('http://localhost:3000/', { waitUntil: 'networkidle0' });
  const landingData = await page.evaluate(() => {
    const body = document.body;
    const h1 = document.querySelector('h1');
    const h2 = document.querySelector('h2');
    const brandTitles = Array.from(document.querySelectorAll('.brand-title')).map(el => ({
      tag: el.tagName,
      fontFamily: window.getComputedStyle(el).fontFamily,
      fontWeight: window.getComputedStyle(el).fontWeight
    }));
    const navLogo = document.querySelector('nav svg, header svg');

    return {
      bodyFont: window.getComputedStyle(body).fontFamily,
      bodyWeight: window.getComputedStyle(body).fontWeight,
      h1: h1 ? {
        fontFamily: window.getComputedStyle(h1).fontFamily,
        fontWeight: window.getComputedStyle(h1).fontWeight,
        fontSize: window.getComputedStyle(h1).fontSize
      } : null,
      h2: h2 ? {
        fontFamily: window.getComputedStyle(h2).fontFamily,
        fontWeight: window.getComputedStyle(h2).fontWeight
      } : null,
      brandTitles,
      navLogo: navLogo ? {
        pathCount: navLogo.querySelectorAll('path').length,
        textCount: navLogo.querySelectorAll('text').length
      } : null
    };
  });
  console.log('Landing Result:', JSON.stringify(landingData, null, 2));

  console.log('\n=== 3. Dark Mode Computed Styles ===');
  await page.evaluate(() => document.documentElement.classList.add('dark'));
  const darkData = await page.evaluate(() => {
    const body = document.body;
    return {
      color: window.getComputedStyle(body).color,
      backgroundColor: window.getComputedStyle(body).backgroundColor,
      fontFamily: window.getComputedStyle(body).fontFamily
    };
  });
  console.log('Dark Mode Result:', JSON.stringify(darkData, null, 2));

  console.log('\n=== 4. Responsive Mobile Viewport (375x812) ===');
  await page.setViewport({ width: 375, height: 812 });
  const mobileData = await page.evaluate(() => {
    const body = document.body;
    const h1 = document.querySelector('h1');
    return {
      bodyWidth: body.offsetWidth,
      h1FontSize: h1 ? window.getComputedStyle(h1).fontSize : null,
      h1LineHeight: h1 ? window.getComputedStyle(h1).lineHeight : null,
      h1FontFamily: h1 ? window.getComputedStyle(h1).fontFamily : null,
      hasHorizontalOverflow: document.documentElement.scrollWidth > window.innerWidth
    };
  });
  console.log('Mobile Result:', JSON.stringify(mobileData, null, 2));

  await browser.close();
}

inspectComputedStyles().catch(console.error);
