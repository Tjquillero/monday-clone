# Separación de fases: Contractual vs. Técnica

**Estado:** Propuesto — decisiones cerradas por el usuario (2026-07-18), documento listo para implementar.

## Marco (por qué existe este cambio)

El sistema tiene dos fases distintas que hoy comparten un solo gate de validación:

```
Fase contractual                    Fase técnica
─────────────────                   ─────────────
Excel                                board_activity_standards
  ↓                                    ↓
POA                                  Scheduler
  ↓                                    ↓
poa_activities                      weekly_plans
```

La fase contractual responde "¿qué contrató el cliente esta versión?". La fase técnica responde "¿puedo programar jornales para eso?". Son preguntas distintas, con dueños distintos (el contrato lo define el cliente/administrador del proceso; el rendimiento lo define quien opera el sitio) y con tiempos distintos (el contrato se firma una vez al año; el rendimiento técnico puede tardar en confirmarse).

**El importador de POA no deja de validar `board_activity_standards` porque "ya no haga falta" — deja de validarlo porque todavía no está en la fase del sistema donde ese dato es relevante.** Esta distinción es el motivo del cambio, no un detalle de implementación — evita que en el futuro alguien reintroduzca la validación en `validate.ts` pensando que corrige un bug, cuando en realidad estaría remezclando dos fases que se separaron a propósito.

## Por qué es seguro separarlas (verificado, no asumido)

- **No hay acoplamiento de esquema.** `poa_activities.activity_key` (`supabase/migrations/20260714_poa_domain_schema.sql:75`) es `TEXT` plano, sin FK hacia `board_activity_standards`. `import_poa_version()` nunca consulta `board_activity_standards`.
- **No contradice ADR-0004.** La regla "todo o nada" (Regla 4) es sobre el mapeo de zonas, no sobre el catálogo técnico (`poa-excel-import-design.md:114`).
- **No contradice ADR-0008** (no inventar rendimientos): no se escribe ningún rendimiento para las 31 — al contrario, se deja de exigir que exista antes de tiempo.
- **`board_activity_standards.rendimiento NOT NULL CHECK (rendimiento > 0)` no se toca.**
- **Ya se descartó que las 31 se resuelvan solas con datos legacy** (cruce exhaustivo de 88 códigos × 58 nombres del cronograma legacy, solo 3 coincidencias no equivalentes — ver `docs/discovery/poa-rendimiento-decision-request.md`).
- **`poa_activities` hoy tiene 45 filas en toda la base, todas de boards de prueba (E2E)** — Tablero Principal (el único board real) no tiene ninguna todavía, porque la importación real sigue bloqueada. El costo de un backfill es nulo en la práctica.

## Decisión 1 — `poa_activities` pasa a ser autocontenido: agrega `description`, `unit`

`poa_activities` es el catálogo contractual de la versión — una actividad contractual sin descripción ni unidad está incompleta desde el dominio, no solo desde la UI. Depender del Excel original para mostrar un nombre (en reportes, auditoría de versiones, comparación entre versiones, exportación, o la lista de "pendientes de configuración técnica" de la Decisión 2) es una dependencia externa evitable.

```sql
ALTER TABLE public.poa_activities
  ADD COLUMN IF NOT EXISTS description TEXT,
  ADD COLUMN IF NOT EXISTS unit        TEXT;

UPDATE public.poa_activities
  SET description = '(sin descripción histórica)', unit = '(sin unidad histórica)'
  WHERE description IS NULL;

ALTER TABLE public.poa_activities
  ALTER COLUMN description SET NOT NULL,
  ALTER COLUMN unit        SET NOT NULL;
```

El backfill cubre únicamente las 45 filas de prueba existentes (ningún board real tiene datos todavía) — texto centinela explícito, nunca inventando una descripción real.

`import_poa_version()` (`20260725_import_poa_version_zones_and_activation.sql`) agrega `description`/`unit` al `INSERT INTO poa_activities` y al `SELECT` desde `p_activities` (`item->>'description'`, `item->>'unidad'`) — mismo patrón que `activity_key`/`precio_unitario`/`frecuencia`. `buildImportPayload.ts` (capa pura) agrega esos dos campos a `ImportPayloadActivity`, tomados de `ParsedActivity.descripcion`/`ParsedActivity.unidad` (ya extraídos por `parseExcel.ts`, nunca persistidos hasta ahora).

Esto resuelve, como efecto colateral, la divergencia que ya señalaba la tarea #40 (`poa-excel-import-design.md` preveía poblar metadata descriptiva automáticamente y nunca se implementó) — con alcance mínimo: solo metadata descriptiva en `poa_activities`, no autopoblar `board_activity_standards` (eso seguiría exigiendo el rendimiento real, sin atajos).

## Decisión 2 — detección centralizada en una función SQL, no en el cliente

`get_missing_board_activity_standards(p_board_id UUID, p_poa_version_id UUID)` — `SECURITY INVOKER STABLE`, con su propio chequeo de autorización (`get_user_board_role`, mismo patrón que `get_board_operational_agenda_week`). Devuelve `activity_key, description, unit` para toda `poa_activities` de esa versión cuyo `activity_key` no tenga fila vigente en `board_activity_standards` (`board_id = p_board_id`, `effective_to IS NULL`).

```sql
CREATE OR REPLACE FUNCTION public.get_missing_board_activity_standards(
  p_board_id        UUID,
  p_poa_version_id  UUID
)
RETURNS TABLE (activity_key TEXT, description TEXT, unit TEXT)
LANGUAGE plpgsql
SECURITY INVOKER
STABLE
AS $$
BEGIN
  IF get_user_board_role(p_board_id, auth.uid()) IS NULL THEN
    RAISE EXCEPTION 'No tiene acceso a este board.';
  END IF;

  RETURN QUERY
  SELECT pa.activity_key, pa.description, pa.unit
  FROM public.poa_activities pa
  WHERE pa.poa_version_id = p_poa_version_id
    AND NOT EXISTS (
      SELECT 1 FROM public.board_activity_standards bas
      WHERE bas.board_id = p_board_id
        AND bas.activity_key = pa.activity_key
        AND bas.effective_to IS NULL
    )
  ORDER BY pa.import_order;
END;
$$;
```

Un solo lugar de verdad para "¿qué le falta a este board?" — ni el Scheduler ni la pantalla de importación reimplementan el cruce.

## Decisión 3 — SUPERSEDIDA (2026-07-19): el Scheduler genera planes parciales, no bloquea por completo

Esta decisión se tomó antes de que existiera una pantalla dedicada del Catálogo Técnico (Pendientes/Configurado, banner explícito, contador). El riesgo que la justificaba — un plan parcial indistinguible de uno completo, omitiendo trabajo real en silencio — ya no aplica: hoy existen señales explícitas e imposibles de ignorar en la UI. Bloquear el Cronograma completo por 31 de 50 actividades pendientes dejó de ser proporcional.

**Modelo vigente:** `useWeeklyPlan.ts` construye el plan con las actividades que sí tienen `board_activity_standards` (el merge las excluye naturalmente si no existen — nunca hace falta un chequeo aparte) y expone `missingStandards` como advertencia informativa junto al plan, nunca en su lugar. El bloqueo real de negocio se movió a `confirm_weekly_plan()` (`ERRCODE = 'MTCFG'`): certificar cumplimiento contractual exige el catálogo completo, generar un borrador de trabajo no. "Parcial" es un estado derivado en cada lectura (comparación en vivo contra `get_missing_board_activity_standards`), nunca una bandera persistida en el plan — completar el catálogo después de generar el plan permite confirmarlo sin recrearlo.

Mensaje de UI (`PlanningWarnings.tsx`): banner "Cronograma parcial" listando las actividades sin configurar, mostrado junto a la tabla de actividades sí planificadas (nunca reemplazándola). `PlanLifecyclePanel` deshabilita "Confirmar" proactivamente mientras `missingStandards` no esté vacío, reflejando lo que el RPC exigiría de todos modos.

## Decisión 4 — actividades que no requieren rendimiento (`requiere_rendimiento`, 2026-07-19)

"Falta configurar" y "no aplica" son dos hechos distintos que el modelo original confundía: `board_activity_standards` solo sabía representar "existe con rendimiento" o "no existe fila" — no había forma de registrar que una actividad, por su naturaleza (reactiva, por evento, por volumen retirado, por condición de campo), nunca va a tener un rendimiento técnico único y no debería seguir apareciendo como pendiente indefinidamente.

Mismo principio que ADR-0005 ya aplicó a `frecuencia` (`poa_activities.frecuencia IS NULL` = "actividad contratada sin programación periódica", excluida explícitamente en `weeklyPlanner.ts:126-132` antes de construir `PlanningActivity`) — esta decisión completa la simetría que faltaba para `rendimiento`.

**Modelo:** columna nueva `requiere_rendimiento BOOLEAN NOT NULL DEFAULT true`, `rendimiento` pasa a nullable. Es un booleano, no un enum de estados: una vez que "pendiente" queda fuera de la columna (ver abajo), lo que distingue no es una fase de un flujo con transiciones — es una característica permanente de la actividad ("¿esta actividad se planifica por rendimiento, sí o no?"), del mismo tipo que `category`. La ambigüedad clásica de un booleano ("¿`false` es decisión deliberada, error de captura, o campo sin revisar?") no aplica aquí porque el tercer caso (sin revisar) nunca llega a existir como fila — para que exista una fila con `requiere_rendimiento = false`, alguien ya tuvo que decidirlo explícitamente (Regla 2 de ADR-0008: ninguna equivalencia se persiste sin confirmación humana). El estado "pendiente" sigue sin persistirse como valor de columna: se representa, sin ambigüedad, por la ausencia de fila (`get_missing_board_activity_standards` sigue usando `NOT EXISTS`, sin cambios).

**Impacto:**
- `get_missing_board_activity_standards`: sin cambios de código — en cuanto existe una fila (`requiere_rendimiento` true o false), la actividad deja de ser "pendiente".
- `weeklyPlanner.ts`: mismo patrón que `frecuencia === null` — `if (!s.requiere_rendimiento) continue;` antes de construir el `PlanningActivity`. No entra al plan con "0 jornales" (eso confundiría el caso con un error de captura); simplemente no participa del modelo de capacidad semanal.
- Catálogo Técnico (modal "Configurar"): gana una segunda acción explícita, "Marcar como No aplica", junto al campo numérico de rendimiento.
- `confirm_weekly_plan`/gate MTCFG: sin cambios — sigue dependiendo de `get_missing_board_activity_standards`.

**Tarea #39 replanteada:** ya no es "esperar respuesta externa sobre rendimientos" — la clasificación de las 31 actividades (requieren rendimiento vs. no aplica) es una decisión que el responsable del proceso (el propio usuario del sistema) ya puede tomar directamente en el Catálogo Técnico, sin dependencia externa pendiente.

## Import ya no conoce nada del Scheduler

Consecuencia de las 3 decisiones: `resolveValidationContext.ts` deja de consultar `board_activity_standards` (`catalogQuery` se elimina) y `ValidatePoaImportContext.knownActivityKeys` desaparece — el importador termina dependiendo únicamente de POA, zonas, versión y las reglas de negocio propias del dominio del POA. No conoce el Scheduler ni el catálogo técnico. `validateActivity()` en `validate.ts` elimina el bloque `if (!context.knownActivityKeys.has(act.activityKey))` — las actividades contratadas se validan igual que cualquier otra (unidad/precio/frecuencia) y quedan en `activities`, listas para persistir con o sin catálogo técnico todavía.

## Fuera de alcance de este incremento

- `ResourceEfficiencyWidget.tsx` tiene el mismo patrón de invisibilidad silenciosa (mismo cruce `board_activity_standards × activity_scope_mappings`) — se resolvería con el mismo mecanismo (`get_missing_board_activity_standards` ya sirve), pero en un incremento aparte.
- No se muestra la lista de pendientes en Agenda Operativa en este incremento (candidato natural para después, no repetir el cruce ahí).

## Impacto en pruebas y documentación existentes

- `validate.test.ts`: los casos que hoy esperan `activity_key_inexistente` para actividades contratadas cambian de expectativa — la actividad pasa a `activities` normalmente.
- `resolveValidationContext.test.ts`, `buildImportPayload.test.ts`, `persistImportPoaVersion.test.ts`: actualizar para `description`/`unit`.
- Nueva suite pgTAP para `get_missing_board_activity_standards` (patrón ya establecido: fixtures propias, casos con 0/algunas/todas las actividades cubiertas, chequeo de autorización con `authenticated` real).
- `poa-excel-import-test-matrix.md`: nueva fila documentando el comportamiento (actividad contratada sin catálogo técnico se importa igual).
- `docs/discovery/poa-rendimiento-decision-request.md`: no cambia el contenido (las 31 siguen siendo las mismas), pero el "impacto de no responder" pasa de "bloquea la importación" a "bloquea la generación del Cronograma" — reflejar el cambio de fase.
- Tarea #39: redescribir de "esperar respuesta para importar el POA" a "esperar respuesta para generar el Cronograma" (la importación deja de estar bloqueada).
- Tarea #40: se resuelve como efecto colateral de la Decisión 1 (persistir `description`/`unit` en `poa_activities`) — marcar como parte de este mismo incremento, no aparte.

## Plan de implementación (orden)

1. Migración: `ALTER TABLE poa_activities` (Decisión 1) + `CREATE OR REPLACE FUNCTION import_poa_version` (agrega description/unit) + `CREATE FUNCTION get_missing_board_activity_standards` (Decisión 2).
2. `parseExcel.ts` ya extrae `descripcion`/`unidad` — sin cambios ahí. `buildImportPayload.ts` los agrega al payload.
3. `validate.ts`: eliminar el chequeo de `knownActivityKeys`. `resolveValidationContext.ts`: eliminar `catalogQuery`/`knownActivityKeys`.
4. Hook nuevo (o extensión de `useWeeklyPlan.ts`) que consulta `get_missing_board_activity_standards` antes de construir el plan; estado de bloqueo explícito.
5. UI: banner de bloqueo en Cronograma; contador informativo en pantalla de resultado de importación.
6. Actualizar tests (unitarios + pgTAP nueva) y `poa-excel-import-test-matrix.md`.
7. Verificación E2E: importar el archivo real completo (107 actividades) contra un board de prueba sin las 31 en `board_activity_standards` → import exitoso, Cronograma bloqueado con mensaje explícito listando las 31.
