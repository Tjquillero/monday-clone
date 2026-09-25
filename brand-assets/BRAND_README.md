# Mantenix — Paquete de Identidad Visual y Marca Digital (Fase 0 / BRAND-01)

Este paquete contiene la totalidad de assets vectoriales, rasterizados, tokens de diseño y configuraciones requeridas para el sistema visual oficial de **Mantenix**.

**Estado Oficial:** `CLOSED / VERIFIED / APPROVED / FROZEN`

---

## 🏛️ BRAND-01 GOVERNANCE CLAUSE

> Once APPROVED / FROZEN, no visual asset, token, typography rule, responsive mark rule, color rule or semantic usage rule may be altered during subsequent implementation phases without an explicit new brand decision/version.
>
> Implementation phases MUST consume BRAND-01 as the source of truth.
>
> Any proposed deviation MUST be documented as a change request and must not be silently introduced through component-level styling.

---

## 📁 Estructura del Paquete

```text
brand-assets/
├── BRAND_README.md               # Esta documentación oficial y gobernanza
├── BRAND_VALIDATION_REPORT.md    # Reporte técnico y matriz de auditoría visual
├── manifest.json                 # Web App Manifest PWA con rutas canónicas
├── previews/                     # Renders de alta resolución para inspección visual
│   ├── 01_symbol_on_white.png
│   ├── 02_symbol_on_navy.png
│   ├── 03_scale_ladder.png
│   ├── 04_logo_horizontal_light.png
│   ├── 05_logo_horizontal_dark.png
│   ├── 06_logo_vertical.png
│   ├── 07_states_matrix.png
│   ├── 08_header_mockup.png
│   ├── 09_my_work_card.png
│   ├── 10_color_swatches.png
│   └── 11_micro_mark_32x32.png
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
```

---

## 🔒 Reglas Oficiales e Invariantes de Marca (BRAND-01)

### 1. Regla de Escalabilidad Responsive del Símbolo
* **16 px (Favicon / Micro-indicadores):** Usar estrictamente `mantenix-micro-mark.svg` (trazo optimizado a 2.2 px con nodo compensado).
* **24 – 32 px (Navegación compacta / Sub-headers):** `micro-mark` o símbolo oficial según la densidad del contenedor.
* **$\ge 48\text{ px}$ (Headers, Avatares, PWA, Splash):** Usar símbolo oficial completo (`mantenix-symbol.svg`).
* *Prohibición:* **Nunca reducir el símbolo maestro grande de 512 px indiscriminadamente a 16 px sin compensación óptica.**

### 2. Regla de Uso del Acento Naranja (`#E8792F`) y Accesibilidad
* **Uso exclusivo:** El naranja `#E8792F` se reserva para:
  - El **nodo de verificación activa** del símbolo.
  - Botones de llamada a la acción (CTA) destacados (ej. `REGISTRAR EJECUCIÓN`).
  - Pestañas activas y puntos de foco seleccionados.
* *Prohibición:* **No usar `#E8792F` como color genérico para párrafos o textos pequeños de lectura.**
* **Regla de Estados Operativos:** Todo estado operativo de campo (Planificado, En progreso, Reportado, Pendiente de evidencia, Verificado, Confirmado, Cerrado, Rechazado, Resagado, Futuro) debe expresarse invariablemente como **Color + Forma + Icono + Texto**. Ningún estado puede comunicarse únicamente mediante color.

### 3. Separación Semántica Tipográfica
* **Syne (700 / 800):** Exclusivo para Marca, Titulares principales (H1 / H2) y pantallas de bienvenida.
* **Inter (400 / 500 / 600 / 700):** UI de interfaz, tablas de datos, cuerpo de texto, etiquetas y cifras numéricas (`font-variant-numeric: tabular-nums`).
