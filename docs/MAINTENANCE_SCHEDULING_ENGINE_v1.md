# Maintenance Scheduling Engine — Especificación Funcional v1

**Versión:** 1.1  
**Fecha:** 2026-06-28  
**Estado:** CONGELADO — No modificar sin revisión de arquitectura  
**Equivalente a:** `BOARD_ENGINE_V1.md` para el módulo de planificación operativa

---

## Propósito

Este documento define el modelo de dominio, las reglas de negocio, los flujos de datos y el contrato de la IA para el motor de planificación de mantenimiento de Mantenix. Cualquier tabla, componente o función que participe en la planificación operativa debe cumplir con este modelo.

**Principio central:** El motor determinista debe funcionar correctamente sin IA. Gemini entra como optimizador sobre un plan ya válido, no como el corazón del sistema.

---

## Principios de diseño

1. **Los estándares pertenecen al contrato.** `board_activity_standards` es la única tabla de actividades. No existe un catálogo global: "Plateo" en el contrato A puede tener distinto rendimiento que en el contrato B.
2. **`activity_key` como identidad semántica.** Igual que `Column.key`. Los joins, la IA y el scheduler usan `activity_key`. El UUID es identidad física. El `name` es solo texto visible que puede cambiar.
3. **`group_id UUID` nunca `site_id TEXT`.** Los sitios son `groups` del board. Se referencian por FK con índice, no por texto libre.
4. **Rendimiento por sitio mediante excepción.** `group_id = NULL` indica el estándar del contrato. `group_id = UUID` es la excepción del sitio. El scheduler resuelve: sitio primero, contrato como fallback.
5. **Una sola fórmula matemática.** `calculateTheoreticalJournals()` en `schedulerMath.ts`. Ningún componente replica el cálculo.
6. **INSERT-only para estándares.** Actualizar un rendimiento = crear fila nueva + cerrar la anterior. Nunca UPDATE. El historial queda intacto.
7. **La IA recibe un objeto serializado, no acceso a la base de datos.** `WeeklyPlanningContext` es el contrato de entrada/salida entre el scheduler y Gemini.
8. **La prioridad es semántica, no numérica.** `must_execute | preferred | flexible`. El scheduler compara categorías de restricción, no ordena enteros.
9. **Las reglas son datos, no columnas booleanas.** `activity_scope_mappings` y, en el futuro, `activity_rules`, evitan que `board_activity_standards` acumule booleanos dispersos.

---

## Modelo de dominio

### Capa 1 — Estándares del Contrato

#### `board_activity_standards` ← tabla principal del motor

Almacena qué actividades existen en un contrato, cómo se ejecutan y cuál es su rendimiento. Soporta estándares del contrato (group_id = NULL) y excepciones por sitio (group_id = UUID). Mantiene historial de versiones mediante INSERT-only.

| Campo | Tipo | Descripción |
|---|---|---|
| `id` | UUID PK | Identidad física |
| `board_id` | UUID FK → `boards` | El contrato |
| `group_id` | UUID FK → `groups` NULLABLE | `NULL` = contrato; `UUID` = excepción del sitio |
| `activity_key` | TEXT | Identidad semántica estable. Snake_case, sin tildes. Ej: `plateo`, `poda_arbustos` |
| `name` | TEXT | Texto visible. Puede cambiar. Nunca se usa en joins. |
| `category` | TEXT | `ZONA VERDE` \| `ZONA DURA` \| `ZONA DE PLAYA` |
| `unit` | TEXT | `m2/dia`, `und/dia` |
| `rendimiento` | NUMERIC | Unidades por jornal. Ej: `160` und/jornal |
| `frecuencia` | NUMERIC | Veces en 25 días hábiles/mes. Ej: `12.5`, `25`, `2.083` |
| `priority` | TEXT | `must_execute` \| `preferred` \| `flexible` |
| `version` | INT | Secuencia de cambios de este estándar en este board/grupo. Empieza en 1. |
| `effective_from` | DATE | Inicio de vigencia |
| `effective_to` | DATE NULLABLE | Fin de vigencia. `NULL` = activo |
| `source` | TEXT | `operational_manual`, `supervisor_adjustment`, `historical_calibration` |
| `created_at` | TIMESTAMPTZ | |

**Constraints:**
```sql
CHECK (rendimiento > 0)
CHECK (frecuencia > 0)
CHECK (version > 0)
CHECK (priority IN ('must_execute', 'preferred', 'flexible'))
CHECK (effective_to IS NULL OR effective_to >= effective_from)
```

**Índices de unicidad histórica** (dos índices parciales para manejar `group_id IS NULL`):
```sql
-- Solo una fila activa por actividad a nivel de contrato
CREATE UNIQUE INDEX idx_bas_active_contract
  ON board_activity_standards (board_id, activity_key, effective_from)
  WHERE group_id IS NULL AND effective_to IS NULL;

-- Solo una fila activa por actividad a nivel de sitio
CREATE UNIQUE INDEX idx_bas_active_site
  ON board_activity_standards (board_id, group_id, activity_key, effective_from)
  WHERE group_id IS NOT NULL AND effective_to IS NULL;
```

**Algoritmo de resolución del estándar vigente:**
```sql
SELECT *
FROM   board_activity_standards
WHERE  board_id     = $board_id
  AND  activity_key = $activity_key
  AND  (group_id = $group_id OR group_id IS NULL)
  AND  effective_to IS NULL
ORDER BY (group_id IS NOT NULL) DESC  -- sitio específico gana sobre contrato
LIMIT 1;
```

**Seed inicial (23 actividades — se insertan con `group_id = NULL` en el board activo):**

| `activity_key` | `name` | `category` | `unit` | `rendimiento` | `frecuencia` |
|---|---|---|---|---|---|
| `limpieza_general` | Limpieza General | ZONA VERDE | m2/dia | 7500 | 2.083 |
| `op_guadana` | Op Guadaña | ZONA VERDE | m2/dia | 5000 | 25 |
| `riego_grama` | Riego general Grama | ZONA VERDE | m2/dia | 3500 | 2.083 |
| `insecticida_fungicida_grama` | TC Insecticida y Fungicida | ZONA VERDE | m2/dia | 3500 | 150 |
| `herbicida_grama` | TC Herbicida Grama | ZONA VERDE | m2/dia | 2400 | 50 |
| `fertilizacion_grama` | Fertil Grama | ZONA VERDE | m2/dia | 3500 | 150 |
| `plateo` | Plateo | ZONA VERDE | und/dia | 160 | 12.5 |
| `poda_arbustos` | Poda Arbustos y CS | ZONA VERDE | m2/dia | 1495 | 12.5 |
| `mantenimiento_cama_siembra` | Mto Cama Siembra | ZONA VERDE | m2/dia | 450 | 6.25 |
| `riego_arbustos` | Riego general Arbusto | ZONA VERDE | m2/dia | 3500 | 2.083 |
| `insecticida_fungicida_arbustos` | TC Insect y Fung Arbus | ZONA VERDE | m2/dia | 2400 | 50 |
| `fertilizacion_arbustos` | Fertil Arbust y Cubresul | ZONA VERDE | m2/dia | 3500 | 150 |
| `poda_arboles_palmas` | Poda Arboles y Palmas | ZONA VERDE | und/dia | 450 | 75 |
| `riego_arboles` | Riego general Arboles | ZONA VERDE | und/dia | 480 | 3.125 |
| `insecticida_fungicida_arboles` | TC Insecticida y Fung Arb | ZONA VERDE | und/dia | 360 | 50 |
| `fertilizacion_arboles_comp` | Fertil Arb y Palmas Comp | ZONA VERDE | und/dia | 240 | 150 |
| `fertilizacion_arboles_quim` | Fertil Arb y Palmas Quim | ZONA VERDE | und/dia | 490 | 150 |
| `limpieza_zona_dura` | Limpieza General Zonas Duras | ZONA DURA | m2/dia | 10000 | 1 |
| `limpieza_marmol` | Limpieza general mármol | ZONA DURA | m2/dia | 600 | 1 |
| `limpieza_playa` | Acopio y limpieza manual | ZONA DE PLAYA | m2/dia | 3000 | 25 |
| `trasiego_playa` | Arrume con tractor (trasiego) | ZONA DE PLAYA | m2/dia | 5000 | 4 |
| `limpieza_manual_extra` | Limpieza Manual (Extra) | ZONA DE PLAYA | m2/dia | 3000 | 25 |
| `corte_troncos` | Corte de troncos | ZONA DE PLAYA | und/dia | 15 | 4 |

---

#### `activity_scope_mappings` ← puente hacia resource_analysis

Relaciona cada `activity_key` con el `scope_key` de `resource_analysis.scope_data`. Esta tabla es un registro de convención global: `plateo → arbustos` es universalmente correcto, independiente del contrato.

No tiene FK a `board_activity_standards` — la coherencia se mantiene por convención del `activity_key`.

| Campo | Tipo | Descripción |
|---|---|---|
| `activity_key` | TEXT | Mismo valor que en `board_activity_standards` |
| `scope_key` | TEXT | Clave en `resource_analysis.scope_data` |
| `weight` | NUMERIC DEFAULT 1 | Peso si la actividad se distribuye entre scopes |
| PK: `(activity_key, scope_key)` | | |

**Seed inicial:**

| `activity_key` | `scope_key` |
|---|---|
| `limpieza_general` | `total_paisajismo` |
| `op_guadana` | `grama` |
| `riego_grama` | `grama` |
| `insecticida_fungicida_grama` | `grama` |
| `herbicida_grama` | `grama` |
| `fertilizacion_grama` | `grama` |
| `plateo` | `arbustos` |
| `poda_arbustos` | `arbustos` |
| `mantenimiento_cama_siembra` | `arbustos` |
| `riego_arbustos` | `arbustos` |
| `insecticida_fungicida_arbustos` | `arbustos` |
| `fertilizacion_arbustos` | `arbustos` |
| `poda_arboles_palmas` | `arboles` |
| `riego_arboles` | `arboles` |
| `insecticida_fungicida_arboles` | `arboles` |
| `fertilizacion_arboles_comp` | `arboles` |
| `fertilizacion_arboles_quim` | `arboles` |
| `limpieza_zona_dura` | `zona_dura` |
| `limpieza_marmol` | `limpieza_marmol` |
| `limpieza_playa` | `zona_playa` |
| `trasiego_playa` | `trasiego_playa` |
| `limpieza_manual_extra` | `limpieza_manual` |
| `corte_troncos` | `corte_troncos` |

---

#### `activity_rules` _(prevista — no implementar en v1)_

Reglas operativas por `activity_key` como datos, no como columnas booleanas en `board_activity_standards`.

```
rule_type             | rule_value (JSONB)
----------------------|-------------------------------------------
'weather'             | { "condition": "rain", "blocks": true }
'incompatible'        | { "activity_key": "riego_grama" }
'dependency'          | { "requires_before": "limpieza_zona_dura" }
'execution_window'    | { "max_deferral_days": 5 }
'equipment'           | { "requires": "tractor" }
'personnel'           | { "min_workers": 2 }
```

---

### Capa 2 — Dimensiones Físicas del Sitio

#### `resource_analysis` _(existente — sin cambios de schema)_

Cantidades de cada scope type por sitio. Las claves de `scope_data` coinciden con `activity_scope_mappings.scope_key`.

```
board_id  = UUID del contrato
site_id   = UUID del group (PENDIENTE migrar de TEXT a group_id UUID)
scope_data = { "arbustos": 2295, "grama": 544, "zona_dura": 17150, ... }
```

#### `siteCapacity.ts` _(hardcodeado — candidato a tabla futura)_

Hoy: constante en `src/lib/siteCapacity.ts`. No mover en v1.

---

### Capa 3 — Ejecución

#### Modificación a `work_orders` _(agregar `activity_key`)_

```sql
ALTER TABLE work_orders
  ADD COLUMN activity_key TEXT;  -- NULL = OT correctiva sin actividad programada
```

Referencia a `board_activity_standards.activity_key` por convención (no FK formal para evitar rigidez). Habilita: ¿cuántas OTs de Plateo hubo? ¿Cuánto costó? ¿Cuánto rindió?

#### `activity_performance_observations` _(nueva)_

| Campo | Tipo | Descripción |
|---|---|---|
| `id` | UUID PK | |
| `activity_key` | TEXT | Referencia por convención a `board_activity_standards` |
| `work_order_id` | UUID FK → `work_orders` NULLABLE | Trazabilidad: OT → observación |
| `board_id` | UUID FK → `boards` | |
| `group_id` | UUID FK → `groups` | Sitio donde se observó |
| `observed_rendimiento` | NUMERIC | `qty_executed / jornales_used` |
| `qty_executed` | NUMERIC | Cantidad real ejecutada |
| `jornales_used` | NUMERIC | Trabajadores × días efectivos |
| `observation_date` | DATE | |
| `source` | TEXT DEFAULT `'execution_record'` | |
| `notes` | TEXT NULLABLE | |
| `created_at` | TIMESTAMPTZ | |

---

### Trigger — Invariante de versión única vigente

```sql
CREATE OR REPLACE FUNCTION fn_close_previous_activity_standard()
RETURNS TRIGGER AS $$
BEGIN
  UPDATE board_activity_standards
  SET    effective_to = NEW.effective_from - INTERVAL '1 day'
  WHERE  board_id     = NEW.board_id
    AND  activity_key = NEW.activity_key
    AND  (
           (group_id IS NULL AND NEW.group_id IS NULL)
           OR (group_id = NEW.group_id)
         )
    AND  effective_to IS NULL
    AND  id != NEW.id;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER trg_close_previous_activity_standard
BEFORE INSERT ON board_activity_standards
FOR EACH ROW EXECUTE FUNCTION fn_close_previous_activity_standard();
```

---

## Motor Matemático — `src/lib/schedulerMath.ts`

**Regla absoluta:** Esta es la única fuente de la fórmula. `ResourceEfficiencyWidget`, el scheduler y el prompt builder de Gemini importan desde aquí. Sin React, sin Supabase, sin state. Solo números → números.

```
JR_teórico = qty / (rendimiento × frecuencia / workingDays)
           = qty × workingDays / (rendimiento × frecuencia)
```

Funciones implementadas y con 54 tests verdes:
- `calculateTheoreticalJournals(qty, rendimiento, frecuencia, workingDays?)`
- `calculateDailyJournals(theoreticalJournals, workingDays?)`
- `calculateWeeklyDistribution(theoreticalJournals, weeksInMonth?)`
- `calculateCapacityUsage(totalRequired, dailyCapacity, workingDays?)`
- `calculatePerformanceDeviation(standard, observed)`

---

## Flujo de Datos Completo

```
[1] CONFIGURACIÓN DEL CONTRATO
    → INSERT board_activity_standards (group_id = NULL, 23 actividades seed)

[2] EXCEPCIÓN POR SITIO (opcional, para sitios con rendimiento diferente)
    → INSERT board_activity_standards (group_id = UUID del group)
    → TRIGGER cierra la fila anterior automáticamente

[3] INGRESO DE CANTIDADES POR SITIO
    → UPSERT resource_analysis.scope_data { arbustos: 2295, grama: 544, ... }

[4] CÁLCULO DE JORNALES TEÓRICOS
    → RESOLVER estándar vigente por (board, group, activity_key)
    → qty desde resource_analysis → activity_scope_mappings → scope_key
    → jr = calculateTheoreticalJournals(qty, rendimiento, frecuencia)

[5] VALIDACIÓN DE FACTIBILIDAD
    → calculateCapacityUsage(Σ jr_actividades, siteCapacity.daily_capacity)
    → Si INFEASIBLE: bloquear, mostrar déficit. No continuar.

[6] DISTRIBUCIÓN SEMANAL (determinista)
    → calculateWeeklyDistribution(jr, weeksInMonth=4) por actividad

[7] PLAN DIARIO
    → Actividades del día ordenadas por priority ('must_execute' primero)
    → Asignar hasta daily_capacity

[8] EJECUCIÓN
    → Operario registra cantidad real y jornales usados
    → INSERT activity_performance_observations (via work_order_id)

[9] RETROALIMENTACIÓN
    → observed = qty_executed / jornales_used
    → calculatePerformanceDeviation(estándar, observed)
    → |desviación| > 20% → alerta al supervisor

[10] OPTIMIZACIÓN CON IA (solo después de que [1]–[9] funcionen solos)
    → Construir WeeklyPlanningContext desde datos de [4]–[6]
    → Gemini recibe solo ese objeto → devuelve plan reordenado con razonamiento
    → Si Gemini no está disponible → plan determinista de [6]–[7] sigue vigente
```

---

## Contrato de la IA — `WeeklyPlanningContext`

```ts
// src/types/scheduler.ts

export interface PlanningActivity {
  activity_key: string;
  name: string;
  category: string;
  priority: 'must_execute' | 'preferred' | 'flexible';
  qty: number;
  unit: string;
  rendimiento: number;
  frecuencia: number;
  theoretical_journals_month: number;
  theoretical_journals_week: number;
  rules: Array<{ rule_type: string; rule_value: Record<string, unknown> }>;
}

export interface WeeklyPlanningContext {
  week: { start: string; end: string; number: number; working_days: number };
  zone: { id: string; name: string; daily_capacity: number; available_capacity: number };
  activities: PlanningActivity[];
  capacity: { weekly_available: number; weekly_required: number; feasible: boolean; deficit: number };
  constraints: {
    incompatible_pairs: Array<[string, string]>;
    dependencies: Array<{ before: string; after: string }>;
    weather_sensitive: string[];
  };
}
```

**Gemini puede:** reordenar, mover, balancear cuadrillas, explicar decisiones.  
**Gemini no puede:** calcular JR, acceder a tablas, modificar rendimientos, declarar un plan infactible como factible.

---

## Fases de Implementación

| Commit | Contenido | Estado |
|---|---|---|
| **1** | `schedulerMath.ts` + 54 tests + este documento | ✅ Listo |
| **2** | SQL: `board_activity_standards` + `activity_scope_mappings` + `activity_performance_observations` + trigger + RLS + seed | Siguiente |
| **3** | `useActivityStandards()` + `usePerformanceObservations()` — sin tocar UI | Pendiente |
| **4** | `ResourceEfficiencyWidget`: reemplazar `STANDARD_MAPPINGS` hardcodeado → hooks | Pendiente |
| **5** | Planificador semanal determinista + validación de capacidad | Pendiente |
| **6** | `WeeklyPlanningContext` + integración Gemini como optimizador | Después de 5 funciona solo |

---

## Decisiones Pendientes (no bloquean Commit 2)

1. **Migrar `resource_analysis.site_id TEXT` → `group_id UUID`**: Requiere mapear valores existentes a UUIDs de grupos. Se hace en migración separada.
2. **Mover `siteCapacity.ts` a tabla `group_capacities`**: Cuando los datos necesiten ser editables por el supervisor.
3. **Implementar `activity_rules`**: Prevista, no en v1. Las restricciones se expresan en `WeeklyPlanningContext` hasta que exista.

---

## Fuera de Alcance — v1

- Arborización (Cap. 4 — FREC=1/12, ejecución anual)
- Hidráulica (Cap. 9) y eléctrica (Cap. 11) — bajo demanda
- Rotación de actas por zona
- Actualización automática ICOCIV
- Calendario de disponibilidad de maquinaria
- Multi-cuadrilla por actividad
