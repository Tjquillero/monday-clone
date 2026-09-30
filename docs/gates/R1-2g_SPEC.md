# Especificación GATE 2g — Guardia Atómica en Base de Datos para `sync_weekly_plan_items_rpc`

**Fecha:** 2026-09-30  
**Decisiones Ratificadas:** D16 y D17 (Aprobadas por Tomás)  
**Alcance:** Base de Datos (`supabase/migrations/2026093001_sync_gateway_guard_d17.sql`), Validación Estática (`src/lib/__tests__/syncGatewayGuardD17.test.ts`), Script de Verificación (`supabase/verification/2g_rollback_check.sql`) y Archivo de Rechazados (`supabase/rejected/`).

---

## 1. Contexto y Evidencia en Producción (2026-09-30)

Una auditoría forense sobre la base de datos de producción reveló que la función RPC `sync_weekly_plan_items_rpc` (versión viva 2026091401) contenía vicios estructurales de integridad:
1. **Zonas foráneas arbitrarias:** Usaba `COALESCE(poa_activity_zone_id, (SELECT id FROM poa_activity_zones LIMIT 1))`, asignando la primera zona encontrada globalmente. Esto produjo 3.998 ítems (semanas 07–28 sep) vinculados a zonas de otro sitio (3.283 apuntando indebidamente a "Sitio AI Hito 1-2 / AI12_001") y 0 ítems con su zona contractual correcta.
2. **Relleno de huecos y colisión de secuencias:** Empleaba `ON CONFLICT (plan_id, planned_sequence) DO NOTHING`, lo que rellenaba huecos en secuencias de planes ya existentes o duplicaba actividades en secuencias libres (caso 2.12 duplicado).
3. **Filtro silencioso:** El bloque `WHERE` descartaba ítems mal formados en silencio sin notificar ni fallar cerrado.

---

## 2. Decisión D16 — Rechazo de Migración 2026092801

La propuesta de migración `supabase/migrations/2026092801_reconcile_weekly_plan_items_gateway.sql` y su prueba asociada `supabase/tests/31_weekly_plan_items_reconciliation_c15.sql` quedan **RECHAZADAS** y movidas a `supabase/rejected/` por las siguientes tres razones:
1. Mantenía la asignación arbitraria de zona vía `LIMIT 1` sobre `poa_activity_zones`.
2. Utilizaba `activity_standard_id` como identificador de zona.
3. Cambiaba la estrategia a `ON CONFLICT DO UPDATE`, violando directamente la decisión D14 (prohibición de sobreescritura/mutación retrospectiva en planes con ítems).

El archivo `src/lib/__tests__/governedTemporalReconciliationC15.test.ts` queda listado como pendiente de decisión fuera de este gate.

---

## 3. Decisión D17 — Guardia Atómica y Todo o Nada

La nueva función `sync_weekly_plan_items_rpc` implementada en `supabase/migrations/2026093001_sync_gateway_guard_d17.sql`:
- Se ejecuta como `SECURITY DEFINER` con `search_path = pg_catalog, public, pg_temp`.
- Requiere autenticación y autorización operativa (`can_report_execution`).
- Exige que el plan esté en un estado no terminal, tenga sitio (`group_id`) y pertenezca al tablero.
- Obtiene `week_start` del plan bajo bloqueo `FOR UPDATE`.
- **Invariante D14/D17:** Solo acepta planes **VACÍOS** (`[PLAN_NOT_EMPTY]`).
- Valida estrictamente la versión activa única del POA para el tablero (`[ACTIVE_POA_VERSION_INVALID]`).
- Valida la ausencia de duplicados de secuencia en el payload (`[DUPLICATE_SEQUENCE]`).
- Valida ítem por ítem:
  - Tipos JSON numéricos (`jsonb_typeof = 'number'`) para `planned_sequence`, `planned_qty`, `planned_jr`, `planned_rendimiento`, `planned_frecuencia` (un string numérico es `[INVALID_ITEM]`).
  - Rangos: `planned_sequence` entero > 0; `planned_qty >= 0`; `planned_jr >= 0`; `planned_rendimiento > 0`; `planned_frecuencia > 0` (`[INVALID_ITEM]`).
  - `priority` dentro de `('must_execute', 'preferred', 'flexible')` (`[INVALID_ITEM]`).
  - `unit` no nulo ni vacío (`[INVALID_ITEM]`).
  - `planned_date` fecha válida comprendida entre `week_start` y `week_start + 6` días (`[DATE_OUT_OF_WEEK]`).
  - Existencia física de la tupla `(id, zone_id, poa_version_id, activity_key)` en `poa_activity_zones` y `poa_activities` (`[ZONE_MISMATCH]`).
- Realiza una inserción atómica `INSERT INTO weekly_plan_items ... RETURNING *` sin cláusula `ON CONFLICT`, sin filtro `WHERE` silencioso, forzando `is_manual_override` a `false` y `override_reason` a `NULL` (ignorando lo que venga en el payload), y usando casts directos de los valores ya verificados.

---

## 4. Matriz de Códigos de Error (Orden Estricto)

| Paso | Condición de Fallo | Código de Error | Mensaje / Detalle |
|---|---|---|---|
| **a** | `auth.uid() IS NULL` | `[UNAUTHENTICATED]` | Usuario no autenticado |
| **b** | Payload nulo, no array o longitud 0 | `[EMPTY_PAYLOAD]` | Payload inválido o vacío |
| **c.1** | `SELECT ... FROM weekly_plans` no encuentra fila | `[PLAN_NOT_FOUND]` | Plan semanal no existe |
| **c.2** | `weekly_plans.group_id IS NULL` | `[PLAN_WITHOUT_SITE]` | Plan sin sitio asignado |
| **c.3** | `status IN ('cancelled', 'closed')` | `[PLAN_TERMINAL]` | Plan en estado terminal |
| **d** | `NOT can_report_execution(board_id, auth.uid())` | `[FORBIDDEN]` | Usuario sin permisos operativos en el tablero |
| **e** | El sitio no pertenece al tablero (`groups.board_id <> weekly_plans.board_id`) | `[SITE_BOARD_MISMATCH]` | Frontera de sitio violada |
| **f** | `EXISTS (SELECT 1 FROM weekly_plan_items WHERE plan_id = ...)` | `[PLAN_NOT_EMPTY]` | Plan no está vacío (D14/D17) |
| **g** | Versiones de POA activas para el tablero <> 1 | `[ACTIVE_POA_VERSION_INVALID]` | 0 o múltiples versiones activas de POA |
| **h** | `planned_sequence` duplicada en el payload | `[DUPLICATE_SEQUENCE]` | Secuencias repetidas en el DTO |
| **i.1** | Tipos JSON no numéricos, rangos inválidos, prioridad inválida o unidad vacía | `[INVALID_ITEM]` | Tipos, rangos, valores de enumeración o UUIDs mal formados |
| **i.2** | `planned_date` fuera de la ventana `[week_start, week_start + 6]` | `[DATE_OUT_OF_WEEK]` | Fecha planificada fuera de la semana del plan |
| **i.3** | Zona no pertenece al sitio / actividad / versión POA activa | `[ZONE_MISMATCH]` | Zona no corresponde al alcance contractual |

---

## 5. Relación y Coordinación con el Cliente TypeScript

1. **Doble Barrera:**
   - **Primera Barrera (Cliente):** `scheduleMaterializationService.ts` verifica el estado del plan y las secuencias antes de invocar el RPC (decisión D14).
   - **Segunda Barrera (Base de Datos):** `sync_weekly_plan_items_rpc` (D17) ejecuta el bloqueo definitivo bajo `FOR UPDATE` a nivel de base de datos, garantizando atomicidad incluso ante condiciones de carrera concurrentes entre navegadores.
2. **Manejo de Errores y Telemetría:**
   - El cliente no sufre modificaciones de código en esta fase.
   - Si `sync_weekly_plan_items_rpc` rechaza el payload con cualquiera de las excepciones `[CODE]`, la llamada PostgREST genera un rechazo que es capturado por el bloque `catch` de `materializeWeeklyScheduleForBoard`.
   - Esto invoca inmediatamente `logMaterializationEvent` registrando un evento `FAILED` con `stage: 'sync'` y el mensaje detallado del error devuelto por la base de datos (comportamiento validado por el test `T07: Falla RPC sync_weekly_plan_items_rpc registra FAILED (stage: 'sync')`).
