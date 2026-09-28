# Scope: UX & Brand (Frontend Presentation & Design Tokens)

> **Ámbito:** Presentación de interfaces de usuario, componentes React, diseño visual, tokens BRAND-01, accesibilidad y fidelidad estética.
> **Directiva de Aislamiento:** Este scope NO autoriza mutaciones en SQL, migraciones DDL, endpoints RPC ni servicios de backend (`src/lib/*Service.ts`).

---

## 1. Perímetro Autorizado de Archivos

* `src/components/**` (Componentes visuales, vistas, tarjetas, modales, tablas)
* `src/app/**` (Páginas, layouts, rutas de App Router, `globals.css`)
* `brand-assets/**` (Tokens canónicos JSON, SVG vectoriales, previews)
* `src/components/**/__tests__/**` (Tests de componentes y UI)

---

## 2. Sistema de Identidad Visual BRAND-01 (Invariantes)

### Paleta Institucional Canónica
* **Primary (Navy Industrial):** `--color-primary` (`#0B2A4A`), `--color-primary-hover` (`#123A63`), `--color-primary-subtle` (`#E7EDF3`), `--color-primary-foreground` (`#FFFFFF`).
* **Accent (Safety Orange):** `--color-accent` (`#E8792F`), `--color-accent-hover` (`#D66B24`), `--color-accent-subtle` (`#FDF1E9`), `--color-accent-foreground` (`#FFFFFF`).
* **Superficies y Bordes:** `--bg-primary`, `--bg-secondary`, `--card-bg`, `--border-color`, `--color-surface-subtle`.
* **Texto:** `--text-primary`, `--text-secondary`, `--text-muted`.

### Tipografía Canónica (Google Fonts vía `next/font/google`)
* **`font-brand` (Syne 700/800):** Exclusivo para títulos estructurales, encabezados display y marcas.
* **`font-sans` (Inter 400/600/700):** Tipografía base para botones, navegación, textos descriptivos y controles UI.
* **`font-mono` (JetBrains Mono):** Exclusivo para identificadores técnicos (`#{id}`), códigos de actividad, fechas ISO y valores numéricos tabulares.

### Radios y Elevación
* **Controles y Botones:** `rounded-[var(--radius-control)]` (10px).
* **Superficies y Tarjetas:** `rounded-[var(--radius-surface)]` (14px).
* **Sombras:** `shadow-[var(--shadow-card)]`, `shadow-[var(--shadow-floating)]`.

---

## 3. Regla Fundamental: Color de Marca ≠ Color Semántico

* **Vistas/Filtros/Orden activos & Botones principales:** `primary` (`--color-primary`).
* **Vista modificada (`isDirty`):** `accent` (`--color-accent`).
* **Warning real / Columnas ocultas:** `amber-500` / `amber-600` (Semántico).
* **Acciones destructivas / Eliminar:** `rose-500` (Semántico).
* **Estados Kanban y Labels de Tablero:** Preservar los colores dinámicos de dominio (`options.labels`). **PROHIBIDO forzar labels a colores de marca.**

---

## 4. Regla React de Prevención de Duplicados

* En filas de tareas, tablas de planner, listas o barras de Gantt: **validar siempre que el `id` sea único**.
* **NUNCA usar el índice del array (`index`) como `key` en elementos renderizados.**

---

## 5. Pruebas y Validación en este Scope

1. **Nivel 1:** `npx jest src/components/path/to/component.test.tsx`
2. **Nivel 2:** `npx tsc --noEmit`
3. **Validación Visual:** Comprobar contraste y adaptación en **Light Mode** y **Dark Mode**.
