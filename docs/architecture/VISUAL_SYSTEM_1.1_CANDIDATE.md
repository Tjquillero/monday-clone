# Mantenix — Visual System 1.1 (Candidato de Modificación Controlada de BRAND-01)

> **ESTADO DE GOBERNANZA:** `CANDIDATE / MODIFICACIÓN CONTROLADA DE BRAND-01`
> **LÍNEA BASE HISTÓRICA:** BRAND-01 Original (`CLOSED / FROZEN`)
> **ALCANCE:** Gobernanza Documental & Mini Gate Visual del Wordmark
> **CÓDIGO PRODUCTIVO / DDL:** 0 cambios en `src/`, 0 DDL, 0 mutaciones de datos.

---

## 1. Matriz de Gobernanza y Separación Semántica

| Elemento | Fuente / Tratamiento | Destino y Uso | Estado de Decisión |
| :--- | :--- | :--- | :--- |
| **Wordmark ("Mantenix")** | **Manrope 800** (curvas vectoriales `<path>`) | Logotipos maestros horizontales, verticales y lockups | **Mini Gate Visual en curso** (Tracking `0%`, `-2%`, `-3%`, `-4%`) |
| **Símbolo Maestro & Micro-mark** | SVG nativo (`#0B2A4A`, `#E8792F`, `#FFFFFF`) | Identidad visual, favicons, app icons, avatares | **FROZEN (Sin cambios)** |
| **UI Headings & `.brand-title`** | **IBM Plex Sans** (600 / 700) | Encabezados de módulo, modales, títulos de vista | **Aprobado en Visual System 1.1** |
| **UI Body, Tablas & Controles** | **IBM Plex Sans** (400 / 500 / 600) | Toda la superficie interactiva de la aplicación | **Aprobado en Visual System 1.1** |
| **Cifras Numéricas / Financieras** | **IBM Plex Sans** + `tabular-nums` | Tablas de Actas, Planner, KPIs ejecutivos (14 px) | **Aprobado en Visual System 1.1** |
| **Datos Técnicos & Monospace** | **IBM Plex Mono** (400 / 600) | IDs (`ALERT-01`), códigos, hashes, coordenadas GPS (12 px) | **Aprobado en Visual System 1.1** |
| **Webfont Syne en runtime** | `next/font/google` (`Syne`) | Desacople y retiro tras validar 0 consumidores | **Pendiente de retiro post-regeneración** |

---

## 2. Protocolo del Mini Gate Visual de Tracking (Manrope 800)

### Variables Bajo Prueba:
* `Tracking 0%` (`letter-spacing: 0em`): Espaciado natural de la tipografía.
* `Tracking -2%` (`letter-spacing: -0.02em`): Ajuste sutil de cohesión óptica.
* `Tracking -3%` (`letter-spacing: -0.03em`): Densidad compacta industrial.
* `Tracking -4%` (`letter-spacing: -0.04em`): Máxima condensación sin empaste tipográfico.

### Superficies y Escalas de Prueba:
1. **Header / Navbar:** Wordmark compacto a escala reducida (`24 px` – `32 px` de alto).
2. **Login / Splash / Hero:** Wordmark grande con presencia protagonista (`48 px` – `64 px` de alto).
3. **Fondo Claro:** Off-white canvas (`#F7F8F6`) y Pure White (`#FFFFFF`) con texto Deep Navy (`#0B2A4A`).
4. **Fondo Oscuro:** Dark Navy (`#0B1420` / `#121D2B`) con texto Pure White (`#FFFFFF`).
5. **Lockup Horizontal:** Símbolo a la izquierda (140px / 32px) + Wordmark.
6. **Lockup Vertical:** Símbolo centrado superior + Wordmark inferior.

---

## 3. Secuencia de Ejecución Controlada

```text
1. Mini Gate Visual (evaluación de tracking 0%, -2%, -3%, -4%)
        ↓
2. Selección y congelación del valor de tracking definitivo
        ↓
3. Regeneración de los 5 SVGs de logotipo a curvas vectoriales (<path>)
        ↓
4. Actualización de consumidores de logo (MantenixLogo.tsx, assets públicos)
        ↓
5. Implementación de IBM Plex Sans + IBM Plex Mono en layout y globals
        ↓
6. Drift Check de CERO consumidores de Syne
        ↓
7. Retiro de Syne de next/font/google
        ↓
8. Visual QA en navegador & Certificación final de Visual System 1.1
```
