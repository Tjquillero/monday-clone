import fs from 'fs';
import path from 'path';
import { createRequire } from 'module';

const require = createRequire(import.meta.url);
const opentype = require('./opentype.min.js');

const fontPath = path.resolve('scripts/Manrope-800.ttf');
if (!fs.existsSync(fontPath)) {
  console.error('Missing font file:', fontPath);
  process.exit(1);
}

const font = opentype.loadSync(fontPath);
console.log('Loaded font:', font.names.fullName.en, 'UnitsPerEm:', font.unitsPerEm);

function generateWordmarkPath(text, startX, startY, fontSize, trackingEm) {
  const trackingPx = trackingEm * fontSize;
  const glyphs = font.stringToGlyphs(text);
  let currentX = startX;
  const pathObj = new opentype.Path();

  for (let i = 0; i < glyphs.length; i++) {
    const glyph = glyphs[i];
    let kerning = 0;
    if (i < glyphs.length - 1) {
      kerning = font.getKerningValue(glyph, glyphs[i + 1]);
    }
    const glyphKerningPx = (kerning / font.unitsPerEm) * fontSize;
    const glyphAdvancePx = (glyph.advanceWidth / font.unitsPerEm) * fontSize;

    const glyphPath = glyph.getPath(currentX, startY, fontSize);
    pathObj.commands.push(...glyphPath.commands);

    // Advance x for next glyph (do NOT add tracking after last glyph)
    currentX += glyphAdvancePx + glyphKerningPx + ((i < glyphs.length - 1) ? trackingPx : 0);
  }

  return {
    svgPathData: pathObj.toPathData(2),
    totalWidth: currentX - startX,
    bbox: pathObj.getBoundingBox(),
    endX: currentX
  };
}

// 1. Horizontal logos: fontSize = 88, startX = 195, startY = 116, tracking = -0.03em
const horiz = generateWordmarkPath('Mantenix', 195, 116, 88, -0.03);
console.log('Horizontal lockup wordmark width:', horiz.totalWidth, 'px; BBox:', horiz.bbox);

// 2. Vertical logos: fontSize = 64, startY = 280, tracking = -0.03em
// Centered at x = 200 in 400px viewBox -> startX = 200 - (width / 2)
const vertWidth = generateWordmarkPath('Mantenix', 0, 0, 64, -0.03).totalWidth;
const vertStartX = Number((200 - (vertWidth / 2)).toFixed(2));
const vert = generateWordmarkPath('Mantenix', vertStartX, 280, 64, -0.03);
console.log('Vertical lockup wordmark width:', vert.totalWidth, 'px; startX:', vertStartX, 'BBox:', vert.bbox);

// Build 5 SVGs

// 1. mantenix-logo-horizontal.svg (Light)
const svgHorizLight = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 700 180" width="700" height="180">
  <g transform="translate(30, 20)">
    <circle cx="70" cy="70" r="66" fill="#0B2A4A"/>
    <path d="M 33 90 C 40 78, 48 81, 56 77 C 64 73, 71 55, 85 55 C 97 55, 103 77, 110 77" fill="none" stroke="#FFFFFF" stroke-width="7.5" stroke-linecap="round" stroke-linejoin="round"/>
    <circle cx="85" cy="55" r="6.8" fill="#E8792F" stroke="#FFFFFF" stroke-width="1.8"/>
  </g>
  <path d="${horiz.svgPathData}" fill="#0B2A4A"/>
</svg>
`;

// 2. mantenix-logo-horizontal-dark.svg (Dark with rect)
const svgHorizDark = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 700 180" width="700" height="180">
  <rect width="700" height="180" fill="#0B1420" rx="16"/>
  <g transform="translate(30, 20)">
    <circle cx="70" cy="70" r="66" fill="#4C86C9"/>
    <path d="M 33 90 C 40 78, 48 81, 56 77 C 64 73, 71 55, 85 55 C 97 55, 103 77, 110 77" fill="none" stroke="#0B1420" stroke-width="7.5" stroke-linecap="round" stroke-linejoin="round"/>
    <circle cx="85" cy="55" r="6.8" fill="#E8792F" stroke="#0B1420" stroke-width="1.8"/>
  </g>
  <path d="${horiz.svgPathData}" fill="#FFFFFF"/>
</svg>
`;

// 3. mantenix-logo-horizontal-white.svg (Monochrome white)
const svgHorizWhite = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 700 180" width="700" height="180">
  <g transform="translate(30, 20)">
    <circle cx="70" cy="70" r="66" fill="#FFFFFF"/>
    <path d="M 33 90 C 40 78, 48 81, 56 77 C 64 73, 71 55, 85 55 C 97 55, 103 77, 110 77" fill="none" stroke="#0B2A4A" stroke-width="7.5" stroke-linecap="round" stroke-linejoin="round"/>
    <circle cx="85" cy="55" r="6.8" fill="#E8792F" stroke="#0B2A4A" stroke-width="1.8"/>
  </g>
  <path d="${horiz.svgPathData}" fill="#FFFFFF"/>
</svg>
`;

// 4. mantenix-logo-vertical.svg (Vertical Light)
const svgVertLight = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 400 340" width="400" height="340">
  <g transform="translate(110, 30)">
    <circle cx="90" cy="90" r="85" fill="#0B2A4A"/>
    <path d="M 42 116 C 51 100, 62 104, 72 99 C 82 94, 91 71, 109 71 C 125 71, 132 99, 141 99" fill="none" stroke="#FFFFFF" stroke-width="9.5" stroke-linecap="round" stroke-linejoin="round"/>
    <circle cx="109" cy="71" r="8.5" fill="#E8792F" stroke="#FFFFFF" stroke-width="2.2"/>
  </g>
  <path d="${vert.svgPathData}" fill="#0B2A4A"/>
</svg>
`;

// 5. mantenix-logo-vertical-white.svg (Vertical White)
const svgVertWhite = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 400 340" width="400" height="340">
  <g transform="translate(110, 30)">
    <circle cx="90" cy="90" r="85" fill="#FFFFFF"/>
    <path d="M 42 116 C 51 100, 62 104, 72 99 C 82 94, 91 71, 109 71 C 125 71, 132 99, 141 99" fill="none" stroke="#0B2A4A" stroke-width="9.5" stroke-linecap="round" stroke-linejoin="round"/>
    <circle cx="109" cy="71" r="8.5" fill="#E8792F" stroke="#0B2A4A" stroke-width="2.2"/>
  </g>
  <path d="${vert.svgPathData}" fill="#FFFFFF"/>
</svg>
`;

const logosDir = path.resolve('brand-assets/logos');
const publicLogosDir = path.resolve('public/logos');
if (!fs.existsSync(publicLogosDir)) {
  fs.mkdirSync(publicLogosDir, { recursive: true });
}

fs.writeFileSync(path.join(logosDir, 'mantenix-logo-horizontal.svg'), svgHorizLight);
fs.writeFileSync(path.join(logosDir, 'mantenix-logo-horizontal-dark.svg'), svgHorizDark);
fs.writeFileSync(path.join(logosDir, 'mantenix-logo-horizontal-white.svg'), svgHorizWhite);
fs.writeFileSync(path.join(logosDir, 'mantenix-logo-vertical.svg'), svgVertLight);
fs.writeFileSync(path.join(logosDir, 'mantenix-logo-vertical-white.svg'), svgVertWhite);

// Synchronize to public/logos
fs.writeFileSync(path.join(publicLogosDir, 'mantenix-logo-horizontal.svg'), svgHorizLight);
fs.writeFileSync(path.join(publicLogosDir, 'mantenix-logo-horizontal-dark.svg'), svgHorizDark);
fs.writeFileSync(path.join(publicLogosDir, 'mantenix-logo-horizontal-white.svg'), svgHorizWhite);
fs.writeFileSync(path.join(publicLogosDir, 'mantenix-logo-vertical.svg'), svgVertLight);
fs.writeFileSync(path.join(publicLogosDir, 'mantenix-logo-vertical-white.svg'), svgVertWhite);

// 6. OpenGraph Vector Banner (1200x630)
const ogWordmark = generateWordmarkPath('Mantenix', 290, 210, 92, -0.03);

const ogSvgContent = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1200 630" width="1200" height="630">
  <defs>
    <style>
      .og-badge {
        font-family: 'IBM Plex Mono', monospace;
        font-weight: 700;
        font-size: 13px;
        fill: #E8792F;
        letter-spacing: 2px;
      }
      .og-subtitle {
        font-family: 'IBM Plex Sans', system-ui, -apple-system, sans-serif;
        font-weight: 700;
        font-size: 32px;
        fill: #FFFFFF;
        letter-spacing: -0.5px;
      }
    </style>
    <linearGradient id="bg-grad" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="#081726" />
      <stop offset="50%" stop-color="#0B2A4A" />
      <stop offset="100%" stop-color="#05101C" />
    </linearGradient>
  </defs>

  <rect width="1200" height="630" fill="url(#bg-grad)" />
  <circle cx="1100" cy="150" r="350" fill="#123A63" opacity="0.3" />
  <circle cx="200" cy="550" r="250" fill="#E8792F" opacity="0.08" />

  <g transform="translate(100, 100)">
    <circle cx="80" cy="80" r="76" fill="#0B2A4A" stroke="#223347" stroke-width="4"/>
    <path d="M 38 103 C 46 89, 55 93, 64 88 C 73 83, 81 63, 97 63 C 111 63, 117 88, 125 88" fill="none" stroke="#FFFFFF" stroke-width="8.5" stroke-linecap="round" stroke-linejoin="round"/>
    <circle cx="97" cy="63" r="7.8" fill="#E8792F" stroke="#FFFFFF" stroke-width="2"/>
  </g>

  <!-- Wordmark Vector Path (Manrope 800 -0.03em) -->
  <path d="${ogWordmark.svgPathData}" fill="#FFFFFF" />

  <g transform="translate(100, 360)">
    <rect x="0" y="0" width="220" height="34" rx="17" fill="#16324F" stroke="#223347" stroke-width="1.5"/>
    <text x="20" y="22" class="og-badge">OPERACIONES &amp; POA</text>

    <text x="0" y="85" class="og-subtitle">Control · Continuidad · Ejecución · Infraestructura</text>
    <text x="0" y="125" style="font-family: 'IBM Plex Sans', system-ui, sans-serif; font-size: 20px; fill: #659CDC;">Sistema Integral de Gestión y Evidencia de Mantenimiento en Campo</text>
  </g>

  <line x1="100" y1="540" x2="1100" y2="540" stroke="#223347" stroke-width="1.5" />
  <text x="100" y="580" style="font-family: 'IBM Plex Sans', system-ui, sans-serif; font-size: 16px; fill: #AAB4BF;">© 2026 Mantenix Platform · Control de Infraestructura y Actas</text>
  <text x="1100" y="580" style="font-family: 'IBM Plex Mono', monospace; font-size: 16px; fill: #E8792F; text-anchor: end; font-weight: 600;">v1.3.0</text>
</svg>
`;

fs.writeFileSync('brand-assets/opengraph/og-image-1200x630.svg', ogSvgContent);
fs.writeFileSync('public/opengraph/og-image-1200x630.svg', ogSvgContent);

console.log('Successfully written all 5 SVGs + OG banner in brand-assets and public!');
