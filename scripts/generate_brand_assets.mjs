import fs from 'fs';
import path from 'path';
import puppeteer from 'puppeteer';
import { execSync } from 'child_process';

const OUTPUT_DIR = path.resolve('brand-assets');
const ICONS_DIR = path.join(OUTPUT_DIR, 'icons');
const TOKENS_DIR = path.join(OUTPUT_DIR, 'tokens');
const LOGOS_DIR = path.join(OUTPUT_DIR, 'logos');
const FAVICONS_DIR = path.join(OUTPUT_DIR, 'favicons');
const PWA_DIR = path.join(OUTPUT_DIR, 'pwa');
const OG_DIR = path.join(OUTPUT_DIR, 'opengraph');

[OUTPUT_DIR, ICONS_DIR, TOKENS_DIR, LOGOS_DIR, FAVICONS_DIR, PWA_DIR, OG_DIR].forEach(dir => {
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
});

// ==========================================
// 1. DEFINICIÓN VECTORIAL DEL SÍMBOLO Y LOGOS
// ==========================================

function getSymbolSvg({ bgColor = '#0B2A4A', strokeColor = '#FFFFFF', dotColor = '#E8792F', size = 512, transparentBg = false } = {}) {
  const bg = transparentBg ? '' : `<circle cx="256" cy="256" r="240" fill="${bgColor}"/>`;
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512" width="${size}" height="${size}">
  <defs>
    <style>
      .terrain-line {
        fill: none;
        stroke: ${strokeColor};
        stroke-width: 28;
        stroke-linecap: round;
        stroke-linejoin: round;
      }
    </style>
  </defs>
  ${bg}
  <!-- Perfil de terreno continuo: superficie dura, valle suave, cresta de control, descenso operativo -->
  <path class="terrain-line" d="M 120 330 C 145 285, 175 295, 205 280 C 235 265, 260 200, 310 200 C 355 200, 375 280, 400 280" />
  <!-- Nodo de verificación activa / punto de control -->
  <circle cx="310" cy="200" r="24" fill="${dotColor}" stroke="${strokeColor}" stroke-width="6"/>
</svg>`;
}

function getMicroMarkSvg() {
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32" width="32" height="32">
  <circle cx="16" cy="16" r="15" fill="#0B2A4A"/>
  <path d="M 7 21 C 9 18, 11 19, 13 18 C 15 17, 16.5 12.5, 19.5 12.5 C 22.5 12.5, 23.5 18, 25.5 18" fill="none" stroke="#FFFFFF" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/>
  <circle cx="19.5" cy="12.5" r="2.2" fill="#E8792F" stroke="#FFFFFF" stroke-width="0.8"/>
</svg>`;
}

// Logo Horizontal (Header, Dashboard)
function getLogoHorizontalSvg({ textColor = '#0B2A4A', symbolBg = '#0B2A4A', strokeColor = '#FFFFFF', dotColor = '#E8792F', isDark = false } = {}) {
  const bg = isDark ? `<rect width="700" height="180" fill="#0B1420" rx="16"/>` : '';
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 700 180" width="700" height="180">
  <defs>
    <style>
      .brand-name {
        font-family: 'Syne', system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
        font-weight: 800;
        font-size: 88px;
        fill: ${textColor};
        letter-spacing: -2px;
      }
    </style>
  </defs>
  ${bg}
  <g transform="translate(30, 20)">
    <circle cx="70" cy="70" r="66" fill="${symbolBg}"/>
    <path d="M 33 90 C 40 78, 48 81, 56 77 C 64 73, 71 55, 85 55 C 97 55, 103 77, 110 77" fill="none" stroke="${strokeColor}" stroke-width="7.5" stroke-linecap="round" stroke-linejoin="round"/>
    <circle cx="85" cy="55" r="6.8" fill="${dotColor}" stroke="${strokeColor}" stroke-width="1.8"/>
  </g>
  <text x="195" y="116" class="brand-name">Mantenix</text>
</svg>`;
}

// Logo Vertical (Login, Splash)
function getLogoVerticalSvg({ textColor = '#0B2A4A', symbolBg = '#0B2A4A', strokeColor = '#FFFFFF', dotColor = '#E8792F', isDark = false } = {}) {
  const bg = isDark ? `<rect width="400" height="340" fill="#0B1420" rx="20"/>` : '';
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 400 340" width="400" height="340">
  <defs>
    <style>
      .brand-name-v {
        font-family: 'Syne', system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
        font-weight: 800;
        font-size: 64px;
        fill: ${textColor};
        letter-spacing: -1.5px;
        text-anchor: middle;
      }
    </style>
  </defs>
  ${bg}
  <g transform="translate(110, 30)">
    <circle cx="90" cy="90" r="85" fill="${symbolBg}"/>
    <path d="M 42 116 C 51 100, 62 104, 72 99 C 82 94, 91 71, 109 71 C 125 71, 132 99, 141 99" fill="none" stroke="${strokeColor}" stroke-width="9.5" stroke-linecap="round" stroke-linejoin="round"/>
    <circle cx="109" cy="71" r="8.5" fill="${dotColor}" stroke="${strokeColor}" stroke-width="2.2"/>
  </g>
  <text x="200" y="280" class="brand-name-v">Mantenix</text>
</svg>`;
}

// OpenGraph Banner 1200x630
function getOpenGraphSvg() {
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1200 630" width="1200" height="630">
  <defs>
    <style>
      .og-title {
        font-family: 'Syne', system-ui, -apple-system, sans-serif;
        font-weight: 800;
        font-size: 72px;
        fill: #FFFFFF;
        letter-spacing: -2px;
      }
      .og-subtitle {
        font-family: 'Inter', system-ui, -apple-system, sans-serif;
        font-weight: 500;
        font-size: 26px;
        fill: #AAB4BF;
        line-height: 1.5;
      }
      .og-badge {
        font-family: 'Inter', system-ui, -apple-system, sans-serif;
        font-weight: 700;
        font-size: 14px;
        fill: #E8792F;
        letter-spacing: 2px;
      }
    </style>
    <linearGradient id="bg-grad" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="#0B1420" />
      <stop offset="50%" stop-color="#0B2A4A" />
      <stop offset="100%" stop-color="#082036" />
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

  <g transform="translate(290, 155)">
    <text x="0" y="40" class="og-title">Mantenix</text>
  </g>

  <g transform="translate(100, 360)">
    <rect x="0" y="0" width="220" height="34" rx="17" fill="#16324F" stroke="#223347" stroke-width="1.5"/>
    <text x="20" y="22" class="og-badge">OPERACIONES &amp; POA</text>

    <text x="0" y="85" class="og-subtitle">Control · Continuidad · Ejecución · Infraestructura</text>
    <text x="0" y="125" style="font-family: 'Inter', system-ui, sans-serif; font-size: 20px; fill: #659CDC;">Sistema Integral de Gestión y Evidencia de Mantenimiento en Campo</text>
  </g>

  <line x1="100" y1="540" x2="1100" y2="540" stroke="#223347" stroke-width="1.5" />
  <text x="100" y="580" style="font-family: 'Inter', system-ui, sans-serif; font-size: 16px; fill: #4A5560;">© 2026 Mantenix Platform · Control de Infraestructura y Actas</text>
  <text x="1100" y="580" style="font-family: 'Inter', system-ui, sans-serif; font-size: 16px; fill: #E8792F; text-anchor: end; font-weight: 600;">v1.3.0</text>
</svg>`;
}

// Generación de archivos SVG
fs.writeFileSync(path.join(LOGOS_DIR, 'mantenix-symbol.svg'), getSymbolSvg());
fs.writeFileSync(path.join(LOGOS_DIR, 'mantenix-symbol-monochrome.svg'), getSymbolSvg({ bgColor: '#111827', strokeColor: '#F3F4F6', dotColor: '#9CA3AF' }));
fs.writeFileSync(path.join(LOGOS_DIR, 'mantenix-symbol-white.svg'), getSymbolSvg({ bgColor: '#FFFFFF', strokeColor: '#0B2A4A', dotColor: '#E8792F' }));
fs.writeFileSync(path.join(LOGOS_DIR, 'mantenix-logo-horizontal.svg'), getLogoHorizontalSvg({ textColor: '#0B2A4A', symbolBg: '#0B2A4A' }));
fs.writeFileSync(path.join(LOGOS_DIR, 'mantenix-logo-horizontal-dark.svg'), getLogoHorizontalSvg({ textColor: '#FFFFFF', symbolBg: '#4C86C9', strokeColor: '#0B1420', dotColor: '#E8792F', isDark: true }));
fs.writeFileSync(path.join(LOGOS_DIR, 'mantenix-logo-horizontal-white.svg'), getLogoHorizontalSvg({ textColor: '#FFFFFF', symbolBg: '#FFFFFF', strokeColor: '#0B2A4A', dotColor: '#E8792F' }));
fs.writeFileSync(path.join(LOGOS_DIR, 'mantenix-logo-vertical.svg'), getLogoVerticalSvg({ textColor: '#0B2A4A', symbolBg: '#0B2A4A' }));
fs.writeFileSync(path.join(LOGOS_DIR, 'mantenix-logo-vertical-white.svg'), getLogoVerticalSvg({ textColor: '#FFFFFF', symbolBg: '#FFFFFF', strokeColor: '#0B2A4A', dotColor: '#E8792F' }));
fs.writeFileSync(path.join(LOGOS_DIR, 'mantenix-micro-mark.svg'), getMicroMarkSvg());

// Favicon SVG y OG SVG
fs.writeFileSync(path.join(FAVICONS_DIR, 'favicon.svg'), getSymbolSvg({ size: 64 }));
fs.writeFileSync(path.join(OG_DIR, 'og-image-1200x630.svg'), getOpenGraphSvg());

console.log('✅ SVGs creados exitosamente');

// ==========================================
// 2. SISTEMA DE DESIGN TOKENS (JSON)
// ==========================================

const colors = {
  $schema: "http://json-schema.org/draft-07/schema#",
  name: "Mantenix Color Palette",
  version: "1.0.0",
  mode: {
    light: {
      primary: {
        base: "#0B2A4A",
        hover: "#123A63",
        active: "#082036",
        subtle: "#E7EDF3"
      },
      accent: {
        base: "#E8792F",
        hover: "#D66B24",
        subtle: "#FDF1E9"
      },
      background: "#F7F8F6",
      surface: {
        base: "#FFFFFF",
        elevated: "#FFFFFF",
        subtle: "#F0F2F0"
      },
      border: {
        base: "#E1E4E2",
        subtle: "#EDF0EE",
        focus: "#0B2A4A"
      },
      text: {
        primary: "#0B2A4A",
        secondary: "#4A5560",
        muted: "#8A94A0",
        inverse: "#FFFFFF"
      },
      semantics: {
        success: { base: "#16A34A", subtle: "#DCFCE7", border: "#86EFAC" },
        warning: { base: "#D97706", subtle: "#FEF3C7", border: "#FDE68A" },
        danger: { base: "#DC2626", subtle: "#FEE2E2", border: "#FCA5A5" },
        info: { base: "#2563EB", subtle: "#DBEAFE", border: "#93C5FD" }
      }
    },
    dark: {
      primary: {
        base: "#4C86C9",
        hover: "#659CDC",
        active: "#3A6DA8",
        subtle: "#16324F"
      },
      accent: {
        base: "#E8792F",
        hover: "#F28C49",
        subtle: "#2A1D15"
      },
      background: "#0B1420",
      surface: {
        base: "#121D2B",
        elevated: "#172435",
        subtle: "#0E1824"
      },
      border: {
        base: "#223347",
        subtle: "#1A2737",
        focus: "#4C86C9"
      },
      text: {
        primary: "#F7F8F6",
        secondary: "#AAB4BF",
        muted: "#5C6B7B",
        inverse: "#0B1420"
      },
      semantics: {
        success: { base: "#22C55E", subtle: "#052E16", border: "#14532D" },
        warning: { base: "#F59E0B", subtle: "#451A03", border: "#78350F" },
        danger: { base: "#EF4444", subtle: "#450A0A", border: "#7F1D1D" },
        info: { base: "#3B82F6", subtle: "#172554", border: "#1E3A8A" }
      }
    }
  }
};

const typography = {
  $schema: "http://json-schema.org/draft-07/schema#",
  name: "Mantenix Typography Tokens",
  fontFamilies: {
    brand: "Syne, system-ui, -apple-system, sans-serif",
    ui: "Inter, system-ui, -apple-system, sans-serif",
    mono: "JetBrains Mono, monospace"
  },
  scales: {
    display: { family: "brand", size: "56px", lineHeight: "1.1", weight: 800, tracking: "-0.03em" },
    h1: { family: "brand", size: "40px", lineHeight: "1.15", weight: 800, tracking: "-0.02em" },
    h2: { family: "brand", size: "32px", lineHeight: "1.2", weight: 700, tracking: "-0.02em" },
    h3: { family: "ui", size: "24px", lineHeight: "1.3", weight: 600, tracking: "-0.01em" },
    h4: { family: "ui", size: "20px", lineHeight: "1.35", weight: 600, tracking: "-0.01em" },
    bodyLarge: { family: "ui", size: "18px", lineHeight: "1.5", weight: 400 },
    body: { family: "ui", size: "15px", lineHeight: "1.5", weight: 400 },
    bodySmall: { family: "ui", size: "13px", lineHeight: "1.4", weight: 400 },
    caption: { family: "ui", size: "12px", lineHeight: "1.35", weight: 500, tracking: "0.01em" },
    numericLarge: { family: "ui", size: "36px", lineHeight: "1.1", weight: 700, fontVariantNumeric: "tabular-nums" },
    numeric: { family: "ui", size: "15px", lineHeight: "1.4", weight: 600, fontVariantNumeric: "tabular-nums" }
  }
};

const spacing = {
  $schema: "http://json-schema.org/draft-07/schema#",
  name: "Mantenix Spacing Tokens",
  unit: "4px",
  scale: {
    "0": "0px",
    "1": "4px",
    "2": "8px",
    "3": "12px",
    "4": "16px",
    "5": "20px",
    "6": "24px",
    "8": "32px",
    "10": "40px",
    "12": "48px",
    "16": "64px",
    "20": "80px",
    "24": "96px"
  },
  layout: {
    touchTargetMin: "44px",
    sidebarWidth: "260px",
    sidebarCollapsedWidth: "64px",
    headerHeight: "60px",
    containerMaxWidth: "1440px"
  }
};

const radius = {
  $schema: "http://json-schema.org/draft-07/schema#",
  name: "Mantenix Border Radius Tokens",
  scale: {
    none: "0px",
    sm: "6px",
    control: "10px",
    md: "10px",
    surface: "14px",
    lg: "14px",
    xl: "20px",
    full: "9999px"
  }
};

const shadows = {
  $schema: "http://json-schema.org/draft-07/schema#",
  name: "Mantenix Elevation & Shadows",
  light: {
    sm: "0 1px 2px rgba(11, 42, 74, 0.05)",
    card: "0 2px 8px rgba(11, 42, 74, 0.06)",
    floating: "0 8px 24px rgba(11, 42, 74, 0.12)",
    modal: "0 16px 40px rgba(11, 42, 74, 0.18)",
    focusRing: "0 0 0 2px #FFFFFF, 0 0 0 4px #0B2A4A"
  },
  dark: {
    sm: "0 1px 3px rgba(0, 0, 0, 0.3)",
    card: "0 4px 12px rgba(0, 0, 0, 0.4)",
    floating: "0 8px 28px rgba(0, 0, 0, 0.5)",
    modal: "0 20px 48px rgba(0, 0, 0, 0.7)",
    focusRing: "0 0 0 2px #0B1420, 0 0 0 4px #4C86C9"
  },
  overlay: "rgba(11, 20, 32, 0.60)"
};

const motion = {
  $schema: "http://json-schema.org/draft-07/schema#",
  name: "Mantenix Motion Tokens",
  duration: {
    fast: "150ms",
    normal: "250ms",
    slow: "400ms"
  },
  easing: {
    default: "cubic-bezier(0.4, 0, 0.2, 1)",
    in: "cubic-bezier(0.4, 0, 1, 1)",
    out: "cubic-bezier(0, 0, 0.2, 1)",
    bounce: "cubic-bezier(0.34, 1.56, 0.64, 1)"
  }
};

const designTokens = {
  colors,
  typography,
  spacing,
  radius,
  shadows,
  motion
};

fs.writeFileSync(path.join(TOKENS_DIR, 'colors.json'), JSON.stringify(colors, null, 2));
fs.writeFileSync(path.join(TOKENS_DIR, 'typography.json'), JSON.stringify(typography, null, 2));
fs.writeFileSync(path.join(TOKENS_DIR, 'spacing.json'), JSON.stringify(spacing, null, 2));
fs.writeFileSync(path.join(TOKENS_DIR, 'radius.json'), JSON.stringify(radius, null, 2));
fs.writeFileSync(path.join(TOKENS_DIR, 'shadows.json'), JSON.stringify(shadows, null, 2));
fs.writeFileSync(path.join(TOKENS_DIR, 'motion.json'), JSON.stringify(motion, null, 2));
fs.writeFileSync(path.join(TOKENS_DIR, 'design-tokens.json'), JSON.stringify(designTokens, null, 2));

console.log('✅ Tokens JSON creados exitosamente');

// ==========================================
// 3. MANIFEST PWA
// ==========================================

const manifest = {
  name: "Mantenix — Gestión Inteligente de Flujos de Trabajo",
  short_name: "Mantenix",
  description: "Plataforma operativa y contractual de mantenimiento de infraestructura en campo.",
  start_url: "/my-work",
  display: "standalone",
  orientation: "portrait-primary",
  background_color: "#0B1420",
  theme_color: "#0B2A4A",
  icons: [
    { src: "/pwa/pwa-72x72.png", sizes: "72x72", type: "image/png", purpose: "any" },
    { src: "/pwa/pwa-96x96.png", sizes: "96x96", type: "image/png", purpose: "any" },
    { src: "/pwa/pwa-128x128.png", sizes: "128x128", type: "image/png", purpose: "any" },
    { src: "/pwa/pwa-144x144.png", sizes: "144x144", type: "image/png", purpose: "any" },
    { src: "/pwa/pwa-152x152.png", sizes: "152x152", type: "image/png", purpose: "any" },
    { src: "/pwa/pwa-192x192.png", sizes: "192x192", type: "image/png", purpose: "any" },
    { src: "/pwa/pwa-384x384.png", sizes: "384x384", type: "image/png", purpose: "any" },
    { src: "/pwa/pwa-512x512.png", sizes: "512x512", type: "image/png", purpose: "any" },
    { src: "/pwa/maskable-icon-512x512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    { src: "/pwa/apple-touch-icon-180x180.png", sizes: "180x180", type: "image/png", purpose: "any" }
  ]
};

fs.writeFileSync(path.join(OUTPUT_DIR, 'manifest.json'), JSON.stringify(manifest, null, 2));
console.log('✅ manifest.json creado exitosamente');

// ==========================================
// 4. GUÍA DE ICONOGRAFÍA Y REGLAS DE USO
// ==========================================

const iconSystemDoc = `# Sistema de Iconografía Mantenix v1.0

## 1. Gramática y Reglas de Diseño
* **Grid Base:** 24 × 24 px
* **Grosor de Trazo (Stroke):** 2px constante (\`strokeWidth={2}\`)
* **Terminaciones y Vértices:** Redondeadas (\`strokeLinecap="round"\`, \`strokeLinejoin="round"\`)
* **Relleno:** Sin relleno en reposo (\`fill="none"\`); relleno suave (\`fill="currentColor" opacity="0.15"\`) únicamente en estado activo.
* **Proporción icono:texto:** 1:1 en altura visual.
* **Biblioteca Base:** Lucide React (no se recrean iconos genéricos; se define el catálogo unívoco).

---

## 2. Catálogo Canónico por Módulo

| Módulo / Dominio | Icono Lucide Base | Concepto Visual | Variante Activa |
|---|---|---|---|
| **Navegación / Inicio** | \`Home\` | Casa con trazo continuo | \`Home\` + Primary subtle |
| **Navegación / Sitios** | \`MapPin\` | Pin de geolocalización | \`MapPin\` con punto interno |
| **Navegación / Actividades** | \`CheckSquare\` / \`ListTodo\` | Cuadrado de verificación | Borde primario |
| **Navegación / Calendario** | \`Calendar\` | Calendario con grid | Días marcados |
| **Navegación / Planificación** | \`SlidersHorizontal\` / \`Layers\` | Niveles de ajuste | Puntos activos |
| **Navegación / Personal** | \`Users\` / \`User\` | Cuadrillas y operarios | Relleno acento |
| **Navegación / Maquinaria** | \`Truck\` / \`Wrench\` | Equipos pesados y menores | Línea acentuada |
| **Navegación / Reportes** | \`BarChart3\` | Columnas métricas | Columna activa |
| **Navegación / Configuración** | \`Settings\` | Ajustes de sistema | Rotación / Acabado |

---

## 3. Estados Operativos (Regla: Color + Forma + Icono + Texto)

| Estado | Icono Canónico | Color | Semántica |
|---|---|---|---|
| **Planificado** | \`Clock\` / \`CircleDashed\` | Neutral / \`#8A94A0\` | Espera de fecha |
| **En progreso** | \`PlayCircle\` / \`Loader2\` | Azul / \`#2563EB\` | Ejecución activa |
| **Reportado** | \`FileText\` / \`Send\` | Violeta / \`#7C3AED\` | Enviado por cuadrilla |
| **Pendiente de evidencia** | \`CameraOff\` / \`AlertCircle\` | Ámbar / \`#D97706\` | Falta foto causal |
| **Verificado** | \`ShieldCheck\` | Verde / \`#16A34A\` | Aprobado por supervisor |
| **Confirmado** | \`CheckCircle2\` | Verde / \`#15803D\` | Validado con acta |
| **Cerrado** | \`Archive\` / \`SquareCheck\` | Pizarra / \`#475569\` | Finalizado documental |
| **Rechazado** | \`XCircle\` | Rojo / \`#DC2626\` | Devuelto con nota |
| **Resagado** | \`AlertTriangle\` / \`Clock4\` | Naranja / \`#E8792F\` | Vencido no completado |
| **Futuro** | \`CalendarClock\` | Pizarra tenue / \`#94A3B8\` | Fecha posterior a hoy |

---

## 4. Estados Offline & Sincronización

* **Offline:** \`WifiOff\` (Gris neutro)
* **Online:** \`Wifi\` / \`Circle\` (Verde discreto)
* **Sincronizando:** \`RefreshCw\` (Azul tenue girando)
* **Sincronizado:** \`Check\` (Verde discreto)
* **Pendiente de sync:** \`CloudUpload\` (Ámbar)
* **Error de sync:** \`AlertOctagon\` (Rojo peligro — exclusivo para fallo real)
`;

fs.writeFileSync(path.join(ICONS_DIR, 'ICON_SYSTEM.md'), iconSystemDoc);
console.log('✅ ICON_SYSTEM.md creado exitosamente');

// ==========================================
// 5. DOCUMENTACIÓN GENERAL BRAND_README.md
// ==========================================

const brandReadme = `# Mantenix — Paquete de Identidad Visual y Marca Digital (Fase 0)

Este paquete contiene la totalidad de assets vectoriales, rasterizados, tokens de diseño y configuraciones requeridas para el sistema visual oficial de **Mantenix**.

---

## 📁 Estructura del Paquete

\`\`\`text
mantenix-brand-assets/
├── BRAND_README.md               # Esta documentación
├── manifest.json                 # Web App Manifest PWA con rutas canónicas
├── logos/
│   ├── mantenix-symbol.svg               # Símbolo oficial (Navy + Blanco + Naranja #E8792F)
│   ├── mantenix-symbol-monochrome.svg    # Símbolo monocromático
│   ├── mantenix-symbol-white.svg         # Símbolo blanco para fondos oscuros
│   ├── mantenix-logo-horizontal.svg      # Logo horizontal oficial (Light mode)
│   ├── mantenix-logo-horizontal-dark.svg # Logo horizontal oficial (Dark mode)
│   ├── mantenix-logo-horizontal-white.svg# Logo horizontal blanco plano
│   ├── mantenix-logo-vertical.svg        # Logo vertical para Login y Splash
│   ├── mantenix-logo-vertical-white.svg  # Logo vertical blanco plano
│   └── mantenix-micro-mark.svg           # Micro-mark optimizado para 16px/32px
├── icons/
│   └── ICON_SYSTEM.md            # Reglas de trazo 24px/2px y catálogo de estados/navegación
├── tokens/
│   ├── colors.json               # Paleta Light/Dark mode, Navy #0B2A4A, Acento #E8792F
│   ├── typography.json           # Fuentes Syne (Display/Marca) + Inter (UI/Tablas)
│   ├── spacing.json              # Grid 4px y layout tokens (Touch target 44px)
│   ├── radius.json               # 10px controles / 14px superficies / full circular
│   ├── shadows.json              # Sombras suaves y foco 2px
│   ├── motion.json               # Curvas de animación y duraciones
│   └── design-tokens.json        # Consolidado completo de tokens
├── favicons/
│   ├── favicon.svg               # Vectorial para navegadores modernos
│   ├── favicon-16x16.png         # Pestaña navegador compacta
│   ├── favicon-32x32.png         # Pestaña estándar y bookmarks
│   ├── favicon-48x48.png         # Pestaña HiDPI y accesos directos
│   └── favicon.ico               # Multi-resolución legado (16, 32, 48)
├── pwa/
│   ├── pwa-72x72.png
│   ├── pwa-96x96.png
│   ├── pwa-128x128.png
│   ├── pwa-144x144.png
│   ├── pwa-152x152.png
│   ├── pwa-192x192.png
│   ├── pwa-384x384.png
│   ├── pwa-512x512.png
│   ├── maskable-icon-512x512.png # Ícono con safe-area para Android/PWA
│   └── apple-touch-icon-180x180.png # iOS Home Screen
└── opengraph/
    ├── og-image-1200x630.svg     # Banner OpenGraph vectorial 1200x630
    └── og-image-1200x630.png     # Banner OpenGraph rasterizado para redes y links
\`\`\`

---

## 🎨 Fundamentos del Sistema de Identidad

1. **Resolución de Sistema Visual:**
   - **Dirección única seleccionada:** Sistema de Identidad Operativa (PDF Oficial Fases 1–3).
   - **Color Primario:** Navy Profundo \`#0B2A4A\` (transmite solidez, robustez de infraestructura y precisión).
   - **Color Acento:** Naranja Operacional \`#E8792F\` (punto de verificación activa, foco de acción en terreno).
   - **Tipografía de Marca y Titulares:** **Syne** (700/800) — geométrica, moderna, tecnológica sin frialdad corporativa.
   - **Tipografía de Interfaz y Datos:** **Inter** (400/600/700) — legibilidad técnica superior en tablas, cifras y microcopia.
2. **Símbolo de Perfil de Control:**
   - Trazo blanco continuo que representa la superficie bajo mantenimiento (zonas duras, verdes, playa).
   - Nodo naranja en la cresta que representa el punto de verificación activa y control de calidad.
   - Geometría circular cerrada que denota cobertura total de infraestructura.
3. **Regla de Invarianza de Estados:**
   - Ningún estado o resultado operativo se comunica únicamente por color. Se acompaña siempre de **Icono + Forma + Color + Texto** para garantizar accesibilidad WCAG 2.2 y claridad bajo luz solar en campo.
`;

fs.writeFileSync(path.join(OUTPUT_DIR, 'BRAND_README.md'), brandReadme);
console.log('✅ BRAND_README.md creado exitosamente');

// ==========================================
// 6. RASTERIZACIÓN EXACTA CON PUPPETEER (PNGs e ICO)
// ==========================================

async function rasterizeAll() {
  console.log('🚀 Iniciando rasterización de PNGs e ICO...');
  const browser = await puppeteer.launch({ headless: true, args: ['--no-sandbox', '--disable-setuid-sandbox'] });
  const page = await browser.newPage();

  async function renderSvgToPng(svgString, width, height, outputPath) {
    await page.setViewport({ width, height, deviceScaleFactor: 1 });
    const html = `<!DOCTYPE html>
    <html>
      <head>
        <meta charset="utf-8">
        <style>
          * { margin: 0; padding: 0; box-sizing: border-box; }
          body { width: ${width}px; height: ${height}px; display: flex; align-items: center; justify-content: center; background: transparent; overflow: hidden; }
          svg { width: 100%; height: 100%; }
        </style>
      </head>
      <body>
        ${svgString}
      </body>
    </html>`;
    await page.setContent(html, { waitUntil: 'domcontentloaded', timeout: 10000 });
    await page.screenshot({ path: outputPath, omitBackground: true, type: 'png' });
    console.log(`  ✓ Generado: ${path.basename(outputPath)} (${width}x${height})`);
  }

  // Favicons PNG
  await renderSvgToPng(getSymbolSvg({ size: 16 }), 16, 16, path.join(FAVICONS_DIR, 'favicon-16x16.png'));
  await renderSvgToPng(getSymbolSvg({ size: 32 }), 32, 32, path.join(FAVICONS_DIR, 'favicon-32x32.png'));
  await renderSvgToPng(getSymbolSvg({ size: 48 }), 48, 48, path.join(FAVICONS_DIR, 'favicon-48x48.png'));

  // PWA PNGs
  const pwaSizes = [72, 96, 128, 144, 152, 192, 384, 512];
  for (const size of pwaSizes) {
    await renderSvgToPng(getSymbolSvg({ size }), size, size, path.join(PWA_DIR, `pwa-${size}x${size}.png`));
  }

  // Maskable PWA
  function getMaskableSymbolSvg() {
    return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512" width="512" height="512">
      <rect width="512" height="512" fill="#0B2A4A"/>
      <g transform="translate(51, 51) scale(0.8)">
        <path d="M 120 330 C 145 285, 175 295, 205 280 C 235 265, 260 200, 310 200 C 355 200, 375 280, 400 280" fill="none" stroke="#FFFFFF" stroke-width="32" stroke-linecap="round" stroke-linejoin="round"/>
        <circle cx="310" cy="200" r="28" fill="#E8792F" stroke="#FFFFFF" stroke-width="8"/>
      </g>
    </svg>`;
  }
  await renderSvgToPng(getMaskableSymbolSvg(), 512, 512, path.join(PWA_DIR, 'maskable-icon-512x512.png'));

  // Apple Touch Icon 180x180
  await renderSvgToPng(getSymbolSvg({ size: 180 }), 180, 180, path.join(PWA_DIR, 'apple-touch-icon-180x180.png'));

  // OpenGraph 1200x630 PNG
  await renderSvgToPng(getOpenGraphSvg(), 1200, 630, path.join(OG_DIR, 'og-image-1200x630.png'));

  await browser.close();

  // Generación de favicon.ico binario
  createIcoFile([
    path.join(FAVICONS_DIR, 'favicon-16x16.png'),
    path.join(FAVICONS_DIR, 'favicon-32x32.png'),
    path.join(FAVICONS_DIR, 'favicon-48x48.png')
  ], path.join(FAVICONS_DIR, 'favicon.ico'));

  console.log('✅ Favicon.ico binario multi-resolución creado');
}

function createIcoFile(pngFilePaths, outputIcoPath) {
  const images = pngFilePaths.map(filePath => {
    const data = fs.readFileSync(filePath);
    const width = data.readUInt32BE(16);
    const height = data.readUInt32BE(20);
    return { data, width: width >= 256 ? 0 : width, height: height >= 256 ? 0 : height };
  });

  const count = images.length;
  const headerSize = 6;
  const dirEntrySize = 16;
  let offset = headerSize + (count * dirEntrySize);

  const header = Buffer.alloc(headerSize);
  header.writeUInt16LE(0, 0); // Reserved
  header.writeUInt16LE(1, 2); // Type: 1 = ICO
  header.writeUInt16LE(count, 4); // Number of images

  const entries = [];
  for (const img of images) {
    const entry = Buffer.alloc(dirEntrySize);
    entry.writeUInt8(img.width, 0);
    entry.writeUInt8(img.height, 1);
    entry.writeUInt8(0, 2);
    entry.writeUInt8(0, 3);
    entry.writeUInt16LE(1, 4);
    entry.writeUInt16LE(32, 6);
    entry.writeUInt32LE(img.data.length, 8);
    entry.writeUInt32LE(offset, 12);
    entries.push(entry);
    offset += img.data.length;
  }

  const buffers = [header, ...entries, ...images.map(img => img.data)];
  const icoBuffer = Buffer.concat(buffers);
  fs.writeFileSync(outputIcoPath, icoBuffer);
}

rasterizeAll().then(() => {
  console.log('📦 Empaquetando mantenix-brand-assets.zip...');
  try {
    const zipPath = path.resolve('mantenix-brand-assets.zip');
    if (fs.existsSync(zipPath)) {
      fs.unlinkSync(zipPath);
    }
    execSync(`powershell.exe -NoProfile -Command "Compress-Archive -Path '${OUTPUT_DIR}\\*' -DestinationPath '${zipPath}' -Force"`, { stdio: 'inherit' });
    console.log(`🎉 Paquete ZIP generado exitosamente en: ${zipPath}`);
  } catch (err) {
    console.error('Error generando zip:', err);
  }
}).catch(err => {
  console.error('Error durante la generación:', err);
  process.exit(1);
});
