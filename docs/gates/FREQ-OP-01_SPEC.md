# GATE FREQ-OP-01 — Especificación de Gobernanza: Frecuencia Operativa (D19)

> **Estado:** IMPLEMENTADO / LISTO PARA VERIFICACIÓN  
> **Fecha:** 2026-10-01  
> **Decisión Arquitectónica:** D19 (Aprobada por Tomás)  
> **Ámbito:** Motor de Materialización Semanal y Despacho Operativo (`src/lib/routineScheduler.ts`, `src/lib/materialization/siteActivityClassifier.ts`, `src/lib/scheduleMaterializationService.ts`, `src/lib/poaImport/parseExcel.ts`)

---

## 1. Principio Rector D19 (Soberanía y Separación de Frecuencias)

En Mantenix se establece formalmente la dualidad y separación de propósitos entre las frecuencias contractuales y operativas:

1. **Frecuencia Operativa (`visits_per_month`):**
   - Es la **única** frecuencia utilizada para **PLANIFICAR** y **MATERIALIZAR** los ítems en el plan semanal (`weekly_plan_items`).
   - Se obtiene prioritariamente del **Cronograma Operativo**, o si no está definida allí, de la **FREC del POA**.
   - Se almacena de forma persistente y gobernada en la tabla `public.operational_frequencies`.

2. **Frecuencia Contractual del POA (`FREC`):**
   - Queda reservada con soberanía exclusiva para la **FACTURACIÓN** y emisión de **ACTAS CONTRACTUALES** (`financial_actas`, AIU 20/5/5).
   - No se utiliza para determinar el calendario físico semanal de visitas.

---

## 2. Esquema Físico y Seguridad (Migración y Semilla)

### Migración `2026100101_operational_frequencies.sql`
- **Tabla:** `public.operational_frequencies`
  - `id`: `uuid primary key default gen_random_uuid()`
  - `board_id`: `uuid not null references public.boards(id) on delete cascade`
  - `group_id`: `uuid not null references public.groups(id) on delete cascade`
  - `activity_key`: `text not null`
  - `visits_per_month`: `numeric not null check (visits_per_month > 0)`
  - `source`: `text not null check (source in ('CRONOGRAMA', 'POA'))`
  - `created_at`: `timestamptz default now()`
  - **Constraint:** `unique (board_id, group_id, activity_key)`
- **Políticas RLS:**
  - `SELECT`: Permitido para miembros del tablero mediante `public.get_user_board_role(board_id, auth.uid()) IS NOT NULL`.
  - `REVOKE ALL (INSERT, UPDATE, DELETE)` de roles `anon` y `authenticated`.

### Verificación de Claves Reales en Base de Datos
Se confirmó en la base de datos física y esquema POA que las claves contractuales reales son:
- **`'2.2'`** (correspondiente a Limpieza y Mantenimiento de Playa, fila 38 del Excel, no `'2.20'`).
- **`'3.1'`** (correspondiente a Mantenimiento de Bombas y Pozos, fila 50 del Excel, no `'3.10'`).

### Semilla de Frecuencias Operativas (`2026100101_operational_frequencies_seed.sql`)
La semilla inserta frecuencias calculadas sobre `poa_activity_zones` con `cantidad_contratada > 0` para la versión activa del tablero `3ea0326f-6ff7-409f-848a-1f296e6e3cc8`:
- **CRONOGRAMA:**
  - General: `1.01=25`, `1.04=25`, `1.09=4`, `1.10=4`, `1.11=4`, `2.01=4`, `2.03=2`, `2.06=0.5`, `2.07=0.5`, `2.08=0.5`, `2.09=0.33`, `2.10=0.33`, `2.11=0.33`, `2.12=2`, `2.13=1`, `2.14=0.33`, `2.16=12`, `3.03=25`, `3.04=1`.
  - Especificidades:
    - `1.14`: General = 1; PLAZA PUERTO COLOMBIA = 4.
    - `1.15`: General = 8; PLAYA DEL COUNTRY = 6.
    - `2.18`: General = 12; CENTRO GASTRONÓMICO = 25.
    - `3.06`: 25 (únicamente para CENTRO GASTRONÓMICO y PLAZA PUERTO COLOMBIA).
- **POA:**
  - General: `1.05=1`, `1.06=1`, `1.07=1`, `1.08=1`, `2.02=1`, `2.15=1`, `2.17=1`, `2.19=1`, `2.2=1`, `3.01=1`, `3.02=1`, `3.05=1`, `3.07=1`, `3.08=1`, `3.09=1`, `3.11=1`, `3.12=1`, `3.13=1`, `2.04=0.5`, `2.05=0.5`, `2.21=0.5`, `2.22=0.33`.
  - Especificidades:
    - `1.12`: PLAZA PUERTO COLOMBIA = 4, MANGLARES = 4, SALINAS DEL REY = 4, PUNTA ASTILLEROS = 4, PLAYA DEL COUNTRY = 6, SABANILLA 2 = 6, MIRAMAR = 6.
    - `1.13`: PLAZA PUERTO COLOMBIA = 2, MANGLARES = 2, SALINAS DEL REY = 4, PUNTA ASTILLEROS = 1, PLAYA DEL COUNTRY = 4, SABANILLA 2 = 4, MIRAMAR = 4.
    - `3.1` (bombas): PLAZA PUERTO COLOMBIA = 0.5, PLAYA DEL COUNTRY = 1, SABANILLA 2 = 1, CENTRO GASTRONÓMICO = 1 (SALINAS y MERCADO sin fila).
- **Sin fila (no programables):** `1.03` (suministro, manual en acta) y `3.14` (sin FREC).

---

## 3. Reglas de Despacho Semanal y Calendario

### Cálculo de Semana del Mes
La semana del mes se calcula determinísticamente a partir del día del mes del lunes (`weekStart`):
$$\text{weekOfMonth} = \left\lceil \frac{\text{dayOfMonth(monday)}}{7} \right\rceil$$

### Mapeo de Frecuencia a Días Operativos
| Visitas / Mes | Días Programados | Regla de Activación Mensual / Semanal |
| :---: | :--- | :--- |
| **25** | Lunes a Sábado (6 días) | Todas las semanas (S1, S2, S3, S4, S5) |
| **12** | Lunes, Miércoles, Viernes (3 días) | Todas las semanas (S1, S2, S3, S4, S5) |
| **8** | Martes, Jueves (2 días) | Todas las semanas (S1, S2, S3, S4, S5) |
| **6** | Martes y Jueves (S1, S3) / Miércoles (S2, S4) | Semanas 1 y 3 (2 días); Semanas 2 y 4 (1 día); S5 = Martes y Jueves |
| **4** | 1 día a la semana (determinista) | Todas las semanas (S1, S2, S3, S4, S5). Día determinista: `(hash(activity_key + siteId) % 6)` |
| **2** | 1 día a la semana (determinista) | Solo en semanas 1 y 3 |
| **1** | 1 día a la semana (determinista) | Solo en semana 2 |
| **0.5** | 1 día a la semana (determinista) | Solo en semana 3 de meses pares (`month % 2 === 0`) |
| **0.33** | 1 día a la semana (determinista) | Solo en semana 4 de meses con `month % 3 === 1` |

### Reglas Especiales:
1. **Semana 5 (`weekOfMonth === 5` / día $\ge 29$):** Únicamente se programan actividades con frecuencia $\ge 4$ visitas/mes. Frecuencias $< 4$ se descartan en semana 5.
2. **Festivos Colombianos (`isColombianHoliday`):** Si un día asignado cae en día festivo, la tarea **no se programa** (se omite; no se desplaza ni se corre a otro día).
3. **Valores Materializados por Ítem:**
   - `planned_qty` = `cantidad_contratada` de la zona (`poa_activity_zones`).
   - `planned_jr` = `cantidad_contratada / rendimiento`.
   - `planned_frecuencia` = `visits_per_month` (frecuencia operativa).

---

## 4. Clasificador y Guardias del Scheduler

1. **Lectura Segura de Frecuencias:**
   - Si la consulta de `operational_frequencies` para el sitio falla → Emite evento `FAILED` con código `OPERATIONAL_FREQ_READ_FAILED` y detiene el proceso con 0 escrituras.
2. **Manejo de Exclusiones (Decisión D19):**
   - Actividad con cantidad y rendimiento pero sin frecuencia operativa → Acción `EXCLUDED_MISSING_OPERATIONAL_FREQ` (Estado `PARTIAL`, razón explícita). Se retiró la lista fija hardcodeada D12.
   - Actividad con frecuencia operativa pero sin rendimiento (`rendimiento <= 0`) → Acción `EXCLUDED_MISSING_RENDIMIENTO` (Estado `PARTIAL`, razón explícita). Sin invención de rendimientos.

---

## 5. Soporte de Salinas del Rey y Parser Excel

- **Parser Excel (`src/lib/poaImport/parseExcel.ts`):**
  - Reconoce columnas de zonas que contengan sufijo `"(cantidad presupuesto mes)"` además de `"(presupuesto mes)"`.
  - Excluye explícitamente zonas de `CASTILLO SALGAR`.
- **Semilla de Zonas Salinas (`2026100102_salinas_zones_seed.sql`):**
  - Contiene las 26 zonas con cantidades contratadas extraídas directamente de `POA 2026 V.02 Ene.26-2026.xlsx` para la versión activa.

---

## 6. Decisión D20: Actividades sin Rendimiento SÍ se Programan (FREQ-OP-01b)

> **Decisión Aprobada por Tomás (2026-10-01):** Una actividad con frecuencia operativa y estándar técnico configurado con `requiere_rendimiento = false` **SÍ SE PROGRAMA** con su cantidad contratada y frecuencia operativa, con `planned_rendimiento = null` y sin asignación de jornales (`planned_jr = 0`).

### Afectación Actual en Catálogo
Afecta a actividades de apoyo, supervisión y suministro:
- `1.04`, `1.05`, `1.06`, `1.07`, `1.08`, `1.12`, `1.13`, `3.09`, `3.1`, `3.12`.

### Matriz de Comportamiento del Clasificador
| Frecuencia Operativa | Estándar `requiere_rendimiento` | Rendimiento Físico | Acción del Clasificador | Estado / Jornales |
| :---: | :---: | :---: | :---: | :---: |
| **Presente (> 0)** | `false` | *No aplica (null / 0)* | `MATERIALIZED` | `SUCCESS` (`planned_jr = 0`, `planned_rendimiento = null`) |
| **Ausente** | `false` | *No aplica (null / 0)* | `NOT_SCHEDULED_NO_RENDIMIENTO` | `SUCCESS` (Informativa, 0 parcial) |
| **Ausente** | `true` | *Indiferente* | `EXCLUDED_MISSING_OPERATIONAL_FREQ` | `PARTIAL` (Requiere frecuencia) |
| **Presente (> 0)** | `true` | `<= 0` o nulo | `EXCLUDED_MISSING_RENDIMIENTO` | `PARTIAL` (Requiere rendimiento) |
| **Presente (> 0)** | `true` | `> 0` | `MATERIALIZED` | `SUCCESS` (`planned_jr = qty / rendimiento`) |

### Guardia en Base de Datos y Esquema DDL (`2026100102_sync_gateway_rendimiento_optional.sql`)
1. **Modificación de Columna y Constraint D20 (FREQ-OP-01c):**
   ```sql
   ALTER TABLE public.weekly_plan_items ALTER COLUMN planned_rendimiento DROP NOT NULL;
   ALTER TABLE public.weekly_plan_items ADD CONSTRAINT weekly_plan_items_rendimiento_d20_chk
     CHECK ((planned_rendimiento IS NULL AND planned_jr = 0) OR planned_rendimiento > 0) NOT VALID;
   ```
2. **Validación Condicional en RPC:**
   - `sync_weekly_plan_items_rpc` valida condicionalmente `planned_rendimiento`:
     - Si `board_activity_standards.requiere_rendimiento = false`: `planned_rendimiento` puede ser `NULL` y `planned_jr` debe ser exactamente `0`.
     - Si `board_activity_standards.requiere_rendimiento = true`: exige `planned_rendimiento > 0`. Si es nulo o ausente, rechaza con el código de error `[RENDIMIENTO_REQUIRED]`.
   - Todo-o-nada, bloqueo con `FOR UPDATE`, validación de pertenencia de sitio y RLS se mantienen inalterados bajo D17.

### Auditoría de Código y Manejo de NULL en `src/` (FREQ-OP-01c)
Todos los usos de `planned_rendimiento` y `rendimiento` fueron auditados para asegurar que `NULL` se presente como `"N/A"` o `"—"` y nunca sea utilizado en operaciones de división:

| Archivo | Líneas | Cambio / Protección Aplicada |
| :--- | :--- | :--- |
| `src/types/scheduler.ts` | L123, L208 | `PlanningActivity.rendimiento` y `WeeklyPlanItem.planned_rendimiento` admiten `number \| null`. |
| `src/hooks/useWeeklyPlanMutations.ts` | L31 | `PlanItemInput.planned_rendimiento` admite `number \| null`. |
| `src/lib/weeklyPlanService.ts` | L289–L304 | `preparePostgresRow` respeta `planned_rendimiento = null` y fija `planned_jr = 0` sin forzar default 500. |
| `src/components/views/WeeklyPlannerContainer.tsx` | L131 | Asignación segura `planned_rendimiento: a.rendimiento ?? null`. |
| `src/components/costos/CostosOperativosView.tsx` | L251 | Renderiza `"—"` cuando `a.rendimiento` es `null` o `undefined`. |
| `src/components/dashboard/ResourceEfficiencyWidget.tsx` | L21, L472 | Tipo `rendimiento: number \| null` y renderiza `"N/A"` cuando es `null`. |
| `src/lib/schedulerMath.ts` | L50–L58 | `calculateTheoreticalJournals` admite `number \| null \| undefined` y retorna `0` sin dividir. |
| `src/lib/materialization/siteActivityClassifier.ts` | L26, L246, L287 | Emite `planned_rendimiento: null` y `planned_jr: 0` para actividades sin rendimiento. |
| `src/lib/scheduleMaterializationService.ts` | L521 | DTO inserta `planned_rendimiento: null` y `planned_jr: 0` cuando `requiere_rendimiento === false`. |

---

## 7. Decisiones D21–D26: Parámetros Operativos por Sitio (GATE FREQ-OP-02)

> **Aprobadas por Tomás (2026-10-01):** Gobernanza de cantidades distribuidas (SPLIT), overrides de rendimiento por sitio, capacidades diarias de jornales, exclusión de sitios fuera de operación y despacho determinista en días festivos.

### 7.1. Definición de Decisiones

- **D21 (Modo de Cantidad SPLIT):** Para actividades `1.09` (recolección de troncos), `1.10` (trasiego de residuos) y `3.06` (mantenimiento de mármol), la cantidad contractual del POA representa el **TOTAL DEL MES** y se reparte equitativamente entre las visitas programadas:
  $$\text{planned\_qty} = \text{round}\left(\frac{\text{cantidad}}{\text{visits\_per\_month}}, 2\right)$$
  $$\text{planned\_jr} = \frac{\text{planned\_qty}}{\text{rendimiento\_efectivo}}$$
  Para el resto de actividades (`qty_mode = 'FULL'`), la cantidad del POA es la cantidad física ejecutada en **cada visita**.

- **D22 (Origen de Datos):** Las cantidades provienen soberanamente del POA; los rendimientos físicos y frecuencias de despacho provienen del Cronograma Operativo.

- **D23 (Override de Rendimiento por Sitio):** Si existe un rendimiento específico por sitio en `operational_frequencies.rendimiento`, este tiene precedencia sobre el catálogo técnico estándar (`board_activity_standards`). Si es `NULL`, se usa el del catálogo. Se mantiene D20: si `requiere_rendimiento = false`, `planned_rendimiento = null` y `planned_jr = 0`.

- **D24 (Límite Diario de Jornales por Sitio):** La tabla `public.site_daily_capacity` define el límite máximo diario de jornales por sitio. En este gate es **informativo**: se calcula la suma de jornales diarios en la semana y se reporta en el evento `SITE_MATERIALIZATION_SUMMARY` (`site_daily_capacity`, `exceeded_capacity_days`, `capacity_exceeded`) sin bloquear la materialización.

- **D25 (Sitios Fuera de Operación — PLAYA PUNTA ASTILLEROS):** Sitios sin filas en `operational_frequencies` se consideran fuera de operación: 0 llamadas a RPCs de cabecera y sincronización, emisión de evento `SITE_MATERIALIZATION_SUMMARY` con status `SUCCESS` y `error.code = 'SITE_NOT_OPERATIONAL'`. La UI muestra `"Sitio sin operación"` en tono informativo (sin error `FAILED`).

- **D26 (Gobernanza de Festivos):**
  - Visitas **NO diarias** (`visits_per_month < 25`): Si caen en día festivo colombiano, se trasladan al **siguiente día hábil** de la misma semana (Lunes a Sábado); si no hay día hábil posterior, se trasladan al **anterior**.
  - Visitas **diarias** (`visits_per_month >= 25`): Si caen en día festivo, la visita se **omite** (no se reprograma ni se corre).

---

### 7.2. Tabla Canónica de Overrides de Rendimiento (D23)

| Actividad | Sitio / Zona Operativa | Rendimiento Override | Rendimiento Estándar Catálogo |
| :--- | :--- | :---: | :---: |
| **1.01** (Corte de Césped) | PLAZA PUERTO COLOMBIA | **3,000** | 1,000 |
| **1.01** (Corte de Césped) | MANGLARES | **4,900** | 1,000 |
| **1.01** (Corte de Césped) | PLAYA DEL COUNTRY | **6,950** | 1,000 |
| **1.01** (Corte de Césped) | SALINAS DEL REY | **8,100** | 1,000 |
| **1.01** (Corte de Césped) | PLAYA DE SABANILLA 2 | **8,200** | 1,000 |
| **1.01** (Corte de Césped) | MIRAMAR SECTOR EL FARO | **8,850** | 1,000 |
| **1.09** (Recolección de Troncos) | *Todos los sitios con la actividad* | **30** | Catálogo |
| **2.03** (Pintura de Bordillos) | *Todos los sitios con la actividad* | **200** | Catálogo |
| **2.16** (Lavado de Superficies) | *Todos los sitios con la actividad* | **3,500** | Catálogo |
| **2.18** (Limpieza de Canecas) | *Todos los sitios con la actividad* | **7,500** | Catálogo |
| **3.06** (Mármol) | PLAZA PUERTO COLOMBIA | **600** | Catálogo |
| **3.06** (Mármol) | CENTRO GASTRONÓMICO | **300** | Catálogo |
| **3.04** (Limpieza de Vidrios) | CENTRO GASTRONÓMICO | **3,000** | Catálogo |
| **3.04** (Limpieza de Vidrios) | PLAYA DEL COUNTRY | **7,000** | Catálogo |
| **3.04** (Limpieza de Vidrios) | MIRAMAR SECTOR EL FARO | **7,000** | Catálogo |
| **3.04** (Limpieza de Vidrios) | SENDERO SANTA VERÓNICA | **7,000** | Catálogo |

---

### 7.3. Tabla Canónica de Capacidad Diaria por Sitio (D24)

Fuente: `COSTOS GENERALES V3` (Tablero `3ea0326f-6ff7-409f-848a-1f296e6e3cc8`):

| Sitio Operativo (`groups.title`) | Capacidad Diaria (Jornales / Día) | Fuente |
| :--- | :---: | :---: |
| **CENTRO GASTRONÓMICO** | **13.52** | COSTOS GENERALES V3 |
| **MIRAMAR SECTOR EL FARO** | **9.34** | COSTOS GENERALES V3 |
| **PLAZA PUERTO COLOMBIA** | **8.32** | COSTOS GENERALES V3 |
| **PLAYA DE SABANILLA 2** | **5.66** | COSTOS GENERALES V3 |
| **SALINAS DEL REY** | **5.45** | COSTOS GENERALES V3 |
| **PLAYA DEL COUNTRY** | **5.39** | COSTOS GENERALES V3 |
| **MANGLARES** | **4.49** | COSTOS GENERALES V3 |
| **SENDERO SANTA VERÓNICA** | **3.60** | COSTOS GENERALES V3 |
| **MERCADO LA SAZÓN** | **0.98** | COSTOS GENERALES V3 |
| **PLAYA PUNTA ASTILLEROS** | *0.00 (Sin Operación, D25)* | N/A |



