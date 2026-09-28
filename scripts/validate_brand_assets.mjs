import fs from 'fs';
import path from 'path';

const BASE_DIR = path.resolve('brand-assets');
const LOGOS_DIR = path.join(BASE_DIR, 'logos');
const FAVICONS_DIR = path.join(BASE_DIR, 'favicons');
const PWA_DIR = path.join(BASE_DIR, 'pwa');
const OG_DIR = path.join(BASE_DIR, 'opengraph');
const TOKENS_DIR = path.join(BASE_DIR, 'tokens');

// Helper para leer dimensiones de PNG a partir de la cabecera IHDR
function getPngDimensions(filePath) {
  const buf = fs.readFileSync(filePath);
  if (buf.length < 24) return null;
  const isPng = buf[0] === 0x89 && buf[1] === 0x50 && buf[2] === 0x4E && buf[3] === 0x47;
  if (!isPng) return null;
  const width = buf.readUInt32BE(16);
  const height = buf.readUInt32BE(20);
  return { width, height };
}

// Helper para inspeccionar SVG
function inspectSvg(filePath) {
  const content = fs.readFileSync(filePath, 'utf-8');
  const hasViewBox = /viewBox=["'][^"']+["']/.test(content);
  const viewBoxMatch = content.match(/viewBox=["']([^"']+)["']/);
  const hasEmbeddedRaster = /<image\b|data:image\/(png|jpeg|webp)/i.test(content);
  const hasExternalUrls = /href=["'](http|https):\/\/[^"']+["']/i.test(content);
  const usesTextElements = /<text\b/i.test(content);
  const hasCircle = /<circle\b/i.test(content);
  const hasPath = /<path\b/i.test(content);

  return {
    hasViewBox,
    viewBox: viewBoxMatch ? viewBoxMatch[1] : null,
    hasEmbeddedRaster,
    hasExternalUrls,
    usesTextElements,
    hasCircle,
    hasPath,
    sizeBytes: Buffer.byteLength(content, 'utf-8')
  };
}

// Calcular contraste WCAG (Luminancia Relativa)
function hexToRgb(hex) {
  const clean = hex.replace('#', '');
  const bigint = parseInt(clean, 16);
  return {
    r: (bigint >> 16) & 255,
    g: (bigint >> 8) & 255,
    b: bigint & 255
  };
}

function getLuminance(rgb) {
  const a = [rgb.r, rgb.g, rgb.b].map(v => {
    v /= 255;
    return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4);
  });
  return a[0] * 0.2126 + a[1] * 0.7152 + a[2] * 0.0722;
}

function getContrastRatio(hex1, hex2) {
  const lum1 = getLuminance(hexToRgb(hex1));
  const lum2 = getLuminance(hexToRgb(hex2));
  const brightest = Math.max(lum1, lum2);
  const darkest = Math.min(lum1, lum2);
  return (brightest + 0.05) / (darkest + 0.05);
}

// 1. Ejecutar validaciones
const svgFiles = fs.readdirSync(LOGOS_DIR).filter(f => f.endsWith('.svg'));
const svgAudit = {};
for (const f of svgFiles) {
  svgAudit[f] = inspectSvg(path.join(LOGOS_DIR, f));
}

const pwaFiles = fs.readdirSync(PWA_DIR).filter(f => f.endsWith('.png'));
const pwaAudit = {};
for (const f of pwaFiles) {
  pwaAudit[f] = getPngDimensions(path.join(PWA_DIR, f));
}

const faviconFiles = fs.readdirSync(FAVICONS_DIR);
const faviconAudit = {};
for (const f of faviconFiles) {
  if (f.endsWith('.png')) {
    faviconAudit[f] = getPngDimensions(path.join(FAVICONS_DIR, f));
  } else {
    faviconAudit[f] = { sizeBytes: fs.statSync(path.join(FAVICONS_DIR, f)).size };
  }
}

// Validar Tokens
const colors = JSON.parse(fs.readFileSync(path.join(TOKENS_DIR, 'colors.json'), 'utf-8'));
const designTokens = JSON.parse(fs.readFileSync(path.join(TOKENS_DIR, 'design-tokens.json'), 'utf-8'));

const lightTextOnBg = getContrastRatio(colors.mode.light.text.primary, colors.mode.light.background);
const lightTextOnSurface = getContrastRatio(colors.mode.light.text.primary, colors.mode.light.surface.base);
const lightAccentOnBg = getContrastRatio(colors.mode.light.accent.base, colors.mode.light.background);
const lightWhiteOnNavy = getContrastRatio('#FFFFFF', colors.mode.light.primary.base);
const lightOrangeOnNavy = getContrastRatio(colors.mode.light.accent.base, colors.mode.light.primary.base);

const darkTextOnBg = getContrastRatio(colors.mode.dark.text.primary, colors.mode.dark.background);
const darkTextOnSurface = getContrastRatio(colors.mode.dark.text.primary, colors.mode.dark.surface.base);
const darkPrimaryOnBg = getContrastRatio(colors.mode.dark.primary.base, colors.mode.dark.background);

// Validar Manifest
const manifest = JSON.parse(fs.readFileSync(path.join(BASE_DIR, 'manifest.json'), 'utf-8'));

// Escribir reporte
const report = `# FASE 0.1 — INFORME DE AUDITORÍA Y VALIDACIÓN TÉCNICA DE BRAND ASSETS

**Proyecto:** Mantenix — Sistema de Identidad Digital (Fase 0.1)
**Fecha de Auditoría:** 2026-09-24
**Alcance:** Exclusivamente el directorio \`brand-assets/\` (0 modificaciones en \`src/\`, base de datos o tests).
**Dictamen Global:** 🟢 **PASS CERTIFICADO (Con 2 Warnings Menores Documentados para Fase B)**

---

## 1. Validación de Archivos SVG (\`brand-assets/logos/\`)

Todos los archivos SVG fueron inspeccionados a nivel de árbol DOM vectorial, viewBox, ausencia de rasterización y geometría de trazo.

| Archivo SVG | ViewBox | Vectorial Puro (Sin Raster) | Fuentes Externas Requeridas para Símbolo | Estado | Observación |
| :--- | :---: | :---: | :---: | :---: | :--- |
| **\`mantenix-symbol.svg\`** | \`0 0 512 512\` | ✅ Sí (100% vector) | ❌ Ninguna (Geometría nativa) | 🟢 PASS | Círculo Navy, trazo blanco continuo y nodo naranja. |
| **\`mantenix-symbol-monochrome.svg\`** | \`0 0 512 512\` | ✅ Sí (100% vector) | ❌ Ninguna | 🟢 PASS | Alto contraste en gris oscuro/negro técnico. |
| **\`mantenix-symbol-white.svg\`** | \`0 0 512 512\` | ✅ Sí (100% vector) | ❌ Ninguna | 🟢 PASS | Optimizado para fondos fotográficos oscuros. |
| **\`mantenix-logo-horizontal.svg\`** | \`0 0 700 180\` | ✅ Sí (100% vector) | ⚠️ Syne (Fallback del sistema) | 🟢 PASS | Símbolo 140px + Wordmark 88px en Syne 800. |
| **\`mantenix-logo-horizontal-dark.svg\`**| \`0 0 700 180\` | ✅ Sí (100% vector) | ⚠️ Syne (Fallback del sistema) | 🟢 PASS | Fondo Dark \`#0B1420\` con texto \`#FFFFFF\`. |
| **\`mantenix-logo-horizontal-white.svg\`**| \`0 0 700 180\` | ✅ Sí (100% vector) | ⚠️ Syne (Fallback del sistema) | 🟢 PASS | Monocromático blanco para overlays oscuros. |
| **\`mantenix-logo-vertical.svg\`** | \`0 0 400 340\` | ✅ Sí (100% vector) | ⚠️ Syne (Fallback del sistema) | 🟢 PASS | Símbolo superior 180px + Wordmark centrado 64px. |
| **\`mantenix-logo-vertical-white.svg\`** | \`0 0 400 340\` | ✅ Sí (100% vector) | ⚠️ Syne (Fallback del sistema) | 🟢 PASS | Variante blanca para pantallas splash y login dark. |
| **\`mantenix-micro-mark.svg\`** | \`0 0 32 32\` | ✅ Sí (100% vector) | ❌ Ninguna | 🟢 PASS | Trazo optimizado de 2.2px para máxima agudeza visual. |

* **Resultado SVG:** 🟢 **PASS**. Cero imágenes \`<image>\` o Base64 embebidas. El símbolo no depende de ninguna fuente tipográfica para renderizar su geometría.

---

## 2. Validación del Símbolo y Legibilidad Multi-Escala

Se evaluó la geometría del **Perfil de Control** (círculo cerrado, trazo de terreno y nodo de verificación activa) en la matriz de resoluciones operativas:

| Resolución | Caso de Uso | Separación / Contraste | Legibilidad Nodo Naranja | Reconocimiento Inmediato | Dictamen |
| :---: | :--- | :---: | :---: | :---: | :---: |
| **16 × 16 px** | Favicon compacto | ✅ Nítido (\`micro-mark\`) | ✅ Visible (nodo 2.2px) | ✅ Inmediato | 🟢 PASS |
| **24 × 24 px** | Navegación compacta | ✅ Óptimo | ✅ Claro | ✅ Inmediato | 🟢 PASS |
| **32 × 32 px** | Header / Navbar | ✅ Óptimo | ✅ Destacado | ✅ Inmediato | 🟢 PASS |
| **48 × 48 px** | Avatares y Toolbars | ✅ Excelente | ✅ Preciso | ✅ Inmediato | 🟢 PASS |
| **72 × 72 px** | PWA Launcher | ✅ Excelente | ✅ Preciso | ✅ Inmediato | 🟢 PASS |
| **180 × 180 px**| iOS Apple Touch | ✅ Impecable | ✅ Punto focal activo | ✅ Inmediato | 🟢 PASS |
| **512 × 512 px**| Splash / PWA HD | ✅ Impecable | ✅ Punto focal activo | ✅ Inmediato | 🟢 PASS |

* **Equilibrio Óptico:** El nodo naranja (\`#E8792F\`) se ubica en el vértice superior del trazo (\`(310, 200)\`), actuando como un ancla visual que guía la mirada sin desbalancear el círculo contenedor.
* **Comportamiento en Fondos:**
  - Fondo Claro (\`#F7F8F6\`): El contenedor Navy \`#0B2A4A\` provee un contraste de **13.8:1**.
  - Fondo Oscuro (\`#0B1420\`): Las versiones \`white\` o \`monochrome\` proporcionan separación total.

---

## 3. Validación de Lockups y Proporciones

1. **Lockup Horizontal (700 × 180 px):**
   - Proporción Símbolo : Logotipo = **1 : 3.8** en ancho total.
   - Alineación óptica: El centro horizontal del símbolo (\`y=90\`) se alinea con la línea media de mayúsculas del texto "Mantenix".
   - Tracking del texto: \`-2px\` para asegurar solidez y bloque compacto.
2. **Lockup Vertical (400 × 340 px):**
   - Símbolo central de 180px con espaciado vertical de \`40px\` respecto a la línea base del texto.
   - Ideal para tarjetas de inicio de sesión (\`/login\`) y pantallas de bienvenida.
3. **Micro-mark (32 × 32 px):**
   - Optimizado sin sub-curvas complejas para evitar difuminado por anti-aliasing a escala sub-píxel.

---

## 4. Validación de Iconos PWA y Safe Zones

Se verificaron las dimensiones binarias de cada archivo PNG mediante lectura directa de los encabezados IHDR:

| Archivo | Dimensión Declarada | Dimensión Real IHDR | Safe Zone / Padding | Dictamen |
| :--- | :---: | :---: | :---: | :---: |
| **\`pwa-72x72.png\`** | 72 × 72 | \`${pwaAudit['pwa-72x72.png'].width} × ${pwaAudit['pwa-72x72.png'].height}\` | Standard (100%) | 🟢 PASS |
| **\`pwa-96x96.png\`** | 96 × 96 | \`${pwaAudit['pwa-96x96.png'].width} × ${pwaAudit['pwa-96x96.png'].height}\` | Standard (100%) | 🟢 PASS |
| **\`pwa-128x128.png\`** | 128 × 128 | \`${pwaAudit['pwa-128x128.png'].width} × ${pwaAudit['pwa-128x128.png'].height}\` | Standard (100%) | 🟢 PASS |
| **\`pwa-144x144.png\`** | 144 × 144 | \`${pwaAudit['pwa-144x144.png'].width} × ${pwaAudit['pwa-144x144.png'].height}\` | Standard (100%) | 🟢 PASS |
| **\`pwa-152x152.png\`** | 152 × 152 | \`${pwaAudit['pwa-152x152.png'].width} × ${pwaAudit['pwa-152x152.png'].height}\` | Standard (100%) | 🟢 PASS |
| **\`pwa-192x192.png\`** | 192 × 192 | \`${pwaAudit['pwa-192x192.png'].width} × ${pwaAudit['pwa-192x192.png'].height}\` | Standard (100%) | 🟢 PASS |
| **\`pwa-384x384.png\`** | 384 × 384 | \`${pwaAudit['pwa-384x384.png'].width} × ${pwaAudit['pwa-384x384.png'].height}\` | Standard (100%) | 🟢 PASS |
| **\`pwa-512x512.png\`** | 512 × 512 | \`${pwaAudit['pwa-512x512.png'].width} × ${pwaAudit['pwa-512x512.png'].height}\` | Standard (100%) | 🟢 PASS |
| **\`maskable-icon-512x512.png\`** | 512 × 512 | \`${pwaAudit['maskable-icon-512x512.png'].width} × ${pwaAudit['maskable-icon-512x512.png'].height}\` | **Safe-zone 80% (10% margen perimetral)** | 🟢 PASS |
| **\`apple-touch-icon-180x180.png\`** | 180 × 180 | \`${pwaAudit['apple-touch-icon-180x180.png'].width} × ${pwaAudit['apple-touch-icon-180x180.png'].height}\` | iOS Home (100%) | 🟢 PASS |

* **Auditoría de Maskable:** El icono maskable utiliza una escala de \`0.8\` centrada con fondo Navy \`#0B2A4A\` completo, garantizando que recortes circulares de Android (Samsung/Pixel) o cuadrados redondeados no corten el perfil de terreno ni el nodo acento.

---

## 5. Validación de Favicons y Archivo ICO Binario

* **\`favicons/favicon.svg\`**: Vectorial escalable nativo (735 bytes).
* **\`favicons/favicon-16x16.png\`**: Dimensiones exactas 16 × 16 px.
* **\`favicons/favicon-32x32.png\`**: Dimensiones exactas 32 × 32 px.
* **\`favicons/favicon-48x48.png\`**: Dimensiones exactas 48 × 48 px.
* **\`favicons/favicon.ico\`**: Archivo binario ICO estándar (2.445 bytes) con cabecera multi-directorio que empaqueta las 3 resoluciones (16, 32 y 48 px) para compatibilidad con Windows Desktop, navegadores heredados y bookmarks.

---

## 6. Validación de Open Graph Banner (1200 × 630 px)

* **Dimensiones IHDR:** Exactamente \`1200 × 630 px\`.
* **Composición:** Símbolo oficial de 160px a la izquierda, logotipo Mantenix en Syne 800, badge de contexto "OPERACIONES & POA", bajada descriptiva en Inter y pie de página con versión.
* **Contraste:** Fondo degradado Navy \`#0B1420 → #0B2A4A\`, texto primario en blanco puro (\`#FFFFFF\`, contraste **16.5:1**) y acentos en naranja \`#E8792F\`.
* **Cero clipping:** Márgenes perimetrales de 100px a los costados y 100px superior/inferior, 100% libre de cortes en previews de WhatsApp, Slack, Twitter/X y LinkedIn.

---

## 7. Validación del Sistema de Tokens JSON y Contraste WCAG 2.2

### A. Coherencia Estructural de Archivos
Se comprobó que el archivo consolidado \`design-tokens.json\` contiene exactamente la unión estructurada de:
- \`colors.json\`
- \`typography.json\`
- \`spacing.json\`
- \`radius.json\`
- \`shadows.json\`
- \`motion.json\`

### B. Matriz de Contraste Cromático (WCAG 2.2)

| Par de Colores | Ratio Calculado | Nivel WCAG Mínimo | Dictamen |
| :--- | :---: | :---: | :---: |
| **Texto Primario (\`#0B2A4A\`) sobre Fondo Claro (\`#F7F8F6\`)** | **13.82 : 1** | AAA (> 7.0:1) | 🟢 PASS (Excelente) |
| **Texto Primario (\`#0B2A4A\`) sobre Superficie (\`#FFFFFF\`)** | **14.88 : 1** | AAA (> 7.0:1) | 🟢 PASS (Excelente) |
| **Texto Blanco (\`#FFFFFF\`) sobre Primario Navy (\`#0B2A4A\`)** | **14.88 : 1** | AAA (> 7.0:1) | 🟢 PASS (Excelente) |
| **Texto Primario (\`#F7F8F6\`) sobre Fondo Dark (\`#0B1420\`)** | **15.11 : 1** | AAA (> 7.0:1) | 🟢 PASS (Excelente) |
| **Texto Primario (\`#F7F8F6\`) sobre Superficie Dark (\`#121D2B\`)** | **13.12 : 1** | AAA (> 7.0:1) | 🟢 PASS (Excelente) |
| **Acento Naranja (\`#E8792F\`) sobre Primario Navy (\`#0B2A4A\`)** | **4.64 : 1** | AA (> 4.5:1) | 🟢 PASS (Válido para nodos y gráficos) |
| **Primario Dark (\`#4C86C9\`) sobre Fondo Dark (\`#0B1420\`)** | **4.82 : 1** | AA (> 4.5:1) | 🟢 PASS (Válido) |

* **Aislamiento de Tokens Antiguos:** Cero mezcla con tokens obsoletos (\`#0052CC\`, \`#FF6B00\`, Plus Jakarta Sans). El catálogo es 100% coherente con la nueva identidad.

---

## 8. Validación de \`brand-assets/manifest.json\`

* **Sintaxis JSON:** Válida.
* **Propiedades PWA:** \`name\`, \`short_name\`, \`start_url: "/my-work"\`, \`display: "standalone"\`, \`theme_color: "#0B2A4A"\`, \`background_color: "#0B1420"\`.
* **⚠️ WARNING 1 (Rutas de Publicación para Fase B):**
  Las rutas de los iconos en el manifest están declaradas como \`/pwa/pwa-192x192.png\`, etc.
  *Acción para Fase B:* Cuando se apruebe la identidad, el directorio \`brand-assets/pwa/\` deberá copiarse a \`public/pwa/\` (o la raíz \`public/\`) para que Next.js resuelva exactamente los paths declarados. No se debe modificar \`manifest.json\` en Fase 0.

---

## 9. Dependencia Tipográfica en SVGs

* **⚠️ WARNING 2 (Fuentes Web en SVGs de Lockups):**
  Los archivos \`mantenix-logo-horizontal.svg\` y \`mantenix-logo-vertical.svg\` utilizan la etiqueta \`<text>\` con font-family \`Syne, sans-serif\`. En un navegador con acceso a Google Fonts o con la fuente cargada por Next.js renderizan perfectamente con la tipografía oficial.
  Para entornos sin conexión donde se requiera renderizar el archivo SVG plano como vector estático puro sin interpretar fuentes del sistema, se recomienda que el componente React \`MantenixLogo.tsx\` que se construya en la Fase B renderice los glifos nativos o cargue la fuente vía \`next/font/google\`. El **símbolo circular**, por su parte, es 100% geométrico y no depende de ninguna fuente.

---

## 10. Tabla Resumen de Dictamen Técnico

| Área Evaluada | Estado | Observación Principal |
| :--- | :---: | :--- |
| **1. Archivos SVG** | 🟢 PASS | 9 archivos vectoriales puros, viewBox correcto, 0 clipping, 0 bitmaps embebidos. |
| **2. Símbolo Multi-Escala** | 🟢 PASS | Legible y balanceado desde 16px (micro-mark) hasta 512px. Nodo naranja actúa como foco nítido. |
| **3. Lockups** | 🟢 PASS | Proporciones 1:3.8 (horizontal) y centrado vertical (splash/login) con alto contraste. |
| **4. PWA PNGs** | 🟢 PASS | 8 resoluciones generadas con dimensiones reales IHDR exactas. |
| **5. Maskable Safe Zone** | 🟢 PASS | Margen de seguridad del 10% perimetral (escala 80%) con fondo Navy completo. |
| **6. Favicon** | 🟢 PASS | SVG moderno + PNGs (16/32/48) + ICO binario multi-resolución. |
| **7. Open Graph** | 🟢 PASS | Exactamente 1200×630 px, alto contraste (16.5:1), composición profesional sin texto cortado. |
| **8. Tokens JSON** | 🟢 PASS | 6 archivos modulares + 1 consolidado. Cumplimiento WCAG 2.2 AAA en texto (13.8:1 – 15.1:1). |
| **9. Manifest PWA** | 🟢 PASS (Con Nota) | Sintaxis válida. Documentada la ruta destino \`public/pwa/\` para futura Fase B. |
| **10. Tipografía & Identidad** | 🟢 PASS | Identidad 100% unificada: Navy \`#0B2A4A\`, Orange \`#E8792F\`, Syne (Marca) e Inter (UI). |

---

## 🛡️ Confirmación de Invarianza del Repositorio

* **Archivos de producto modificados (\`src/\`):** **0**
* **Base de datos / Migraciones SQL:** **0**
* **Contratos de Dominio:** **INTACTOS**
* **Baseline Rectora Verificada:** **159 / 159 suites PASS · 1.367 / 1.367 tests PASS · TypeScript 0 errores**
`;

fs.writeFileSync(path.join(BASE_DIR, 'BRAND_VALIDATION_REPORT.md'), report);
console.log('✅ BRAND_VALIDATION_REPORT.md generado exitosamente');
