import puppeteer from 'puppeteer';

async function inspectDashboardSurfaces() {
  const browser = await puppeteer.launch({
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox']
  });

  const page = await browser.newPage();

  // Test /my-work
  console.log('=== 5. /my-work ===');
  await page.goto('http://localhost:3000/my-work', { waitUntil: 'domcontentloaded' });
  const myWorkData = await page.evaluate(() => {
    const h1 = document.querySelector('h1');
    const brandTitles = Array.from(document.querySelectorAll('.brand-title, .font-brand')).map(el => ({
      tag: el.tagName,
      fontFamily: window.getComputedStyle(el).fontFamily,
      fontWeight: window.getComputedStyle(el).fontWeight
    }));
    return {
      title: h1 ? {
        text: h1.innerText.slice(0, 30),
        fontFamily: window.getComputedStyle(h1).fontFamily,
        fontWeight: window.getComputedStyle(h1).fontWeight
      } : null,
      brandElementsCount: brandTitles.length,
      sampleBrand: brandTitles[0] || null
    };
  });
  console.log('MyWork Data:', JSON.stringify(myWorkData, null, 2));

  // Test /projects
  console.log('\n=== 6. /projects ===');
  await page.goto('http://localhost:3000/projects', { waitUntil: 'domcontentloaded' });
  const projectsData = await page.evaluate(() => {
    const h1 = document.querySelector('h1');
    const cards = document.querySelectorAll('.industrial-card, [class*=\"rounded\"]');
    return {
      title: h1 ? {
        text: h1.innerText.slice(0, 30),
        fontFamily: window.getComputedStyle(h1).fontFamily,
        fontWeight: window.getComputedStyle(h1).fontWeight
      } : null,
      cardCount: cards.length
    };
  });
  console.log('Projects Data:', JSON.stringify(projectsData, null, 2));

  // Test /dashboard
  console.log('\n=== 7. /dashboard ===');
  await page.goto('http://localhost:3000/dashboard', { waitUntil: 'domcontentloaded' });
  const dashboardData = await page.evaluate(() => {
    const h1 = document.querySelector('h1, h2');
    const monoElements = Array.from(document.querySelectorAll('.font-mono, .font-tech, [class*=\"font-mono\"]')).map(el => ({
      text: el.innerText.slice(0, 20),
      fontFamily: window.getComputedStyle(el).fontFamily,
      fontWeight: window.getComputedStyle(el).fontWeight
    }));
    return {
      header: h1 ? {
        text: h1.innerText.slice(0, 30),
        fontFamily: window.getComputedStyle(h1).fontFamily,
        fontWeight: window.getComputedStyle(h1).fontWeight
      } : null,
      monoElementsCount: monoElements.length,
      sampleMono: monoElements[0] || null
    };
  });
  console.log('Dashboard Data:', JSON.stringify(dashboardData, null, 2));

  await browser.close();
}

inspectDashboardSurfaces().catch(console.error);
