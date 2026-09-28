import fs from 'fs';

const data = JSON.parse(fs.readFileSync('runtime_drift_precise_step7.json', 'utf8'));

console.log('=== DESGLOSE DE LOS 19 ELEMENTOS RUNTIME CONFIRMADOS ===\n');

data.runtimeAudit.elements.forEach((el, idx) => {
  console.log(`[Item #${idx + 1}]`);
  console.log(`- Ruta: ${el.route}`);
  console.log(`- Selector / Tag: ${el.selector} (<${el.tag}>)`);
  console.log(`- Texto: "${el.textSnippet}"`);
  console.log(`- Clases: ${el.className}`);
  console.log(`- Font Family Computada: ${el.computedFontFamily}`);
  console.log(`- Font Weight Computado: ${el.computedFontWeight}`);
  console.log('');
});
