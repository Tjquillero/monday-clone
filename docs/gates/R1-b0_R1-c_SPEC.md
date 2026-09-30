# Especificación Técnica de Implementación — Gate R1-b0 + R1-c (Versión 4.4)

> **Documento:** `docs/gates/R1-b0_R1-c_SPEC.md`  
> **Versión:** 4.4 (Decisión D13 Alcance Estricto Tablero -> POA -> Versión Activa -> Actividades y Trazabilidad Contractual)  
> **Estado:** FASE 1 — ESPECIFICACIÓN TÉCNICA (SOLO DOCUMENTO — CERO MODIFICACIÓN DE CÓDIGO/MIGRACIONES)  
> **Ámbito:** `R1-b0` (Observabilidad Estructurada y Persistencia P3) + `R1-c` (Integridad y Validación Pre/Post-RPC)  
> **Línea Base Registrada (Pre-Gate):** 166 suites / 1.444 tests — 0 errores TypeScript (`tsc --noEmit`)  
> **Reglas Rectoras:** Invariantes de Dominio Mantenix, Política de Evidencia, Cero DDL ejecutado en Fase 1, Cero Datos Contractuales Inventados.

---

## 1. Decisiones Aprobadas por Tomás

> Las siguientes decisiones han sido formalmente ratificadas por el dueño del producto y rigen de forma exclusiva e inapelable la arquitectura del gate:

- **D1:** Datos contractuales inválidos → **A2**: la actividad inválida no se inserta; plan marcado **PARCIAL** con motivo.
- **D2 (ADR-0005 vigente):** `poa_activities.frecuencia` finita > 0 → se planifica, `frequency_source='POA'`. frecuencia `NULL` → NO se planifica; acción `NOT_SCHEDULED_NO_PERIODIC_FREQ`, INFORMATIVA, el plan NO queda PARCIAL. Cualquier otro valor no finito o <= 0 → `EXCLUDED_INVALID_CONTRACT` (A2, PARCIAL). SIN respaldo de frecuencia externo. Eliminar `?? Number(std.frecuencia) ?? 1` ([`src/lib/scheduleMaterializationService.ts:181`](file:///c:/desarrollo/monday-clone/src/lib/scheduleMaterializationService.ts#L181)) y `?? std.frecuencia ?? 1` ([`src/lib/scheduleMaterializationService.ts:246`](file:///c:/desarrollo/monday-clone/src/lib/scheduleMaterializationService.ts#L246)).
- **D3:** Cantidad 0: se omite y se registra `SKIPPED_ZERO_QTY` como informativo (PROVISIONAL, pendiente de confirmación).
- **D4:** Errores del RPC (header/sync/excepción): **SIN fallback** a `syncWeeklyPlanForBoard`. Error visible y registrado.
- **D5:** Validar las actividades **ANTES** de `ensure_weekly_plan_header`.
- **D6:** Aislamiento por sitio: el fallo de un sitio **no detiene** a los demás.
- **D7:** Persistencia **P3**: tabla append-only de eventos, escrita solo vía RPC `SECURITY DEFINER` con `search_path` fijo, `REVOKE EXECUTE FROM PUBLIC`, `GRANT` solo a `authenticated`, validando `auth.uid()` y el rol en el board. `SELECT` solo para administradores. Sin `UPDATE` ni `DELETE`. Si la escritura del evento falla: `console.error` + aviso en la UI. P1 y P2 descartados.
- **D8:** Aviso de plan parcial o error: visible **solo para administradores**, con el mecanismo de rol que ya existe ([`src/contexts/AuthContext.tsx:137-139`](file:///c:/desarrollo/monday-clone/src/contexts/AuthContext.tsx#L137-L139)). El aviso para administradores muestra también las actividades `NOT_SCHEDULED_*` (informativas), con clave y motivo, aunque el plan no sea PARCIAL.
- **D9:** Fuera de alcance: filtro de tableros de prueba (su parte mínima de filtro board/versión en `poa_activities` pasó a R1-c por D13), reparación de zonas, reparación de `planned_date`, migración `2026092801`.
- **D10:** Sin `gId` → **FALLAR CERRADO**. Error `MISSING_GROUP_ID`, visible y registrado; no se escribe ningún ítem y no se llama a `syncWeeklyPlanForBoard`. Evento `FAILED` con `group_id` NULL. El RPC de eventos acepta `p_group_id` NULL solo en este caso (omite la validación `group ∈ board`) y valida el resto.
- **D12 (literal):** Las actividades 1.12, 1.13 y 1.15 SÍ tienen frecuencia contractual: está en el POA V.10, por zona, en visitas por mes. Mientras esa frecuencia por zona no esté cargada en la base (gate FREQ-SITE-01), su ausencia NO es informativa: el plan queda PARCIAL.
- **D13 (literal, Tomás 2026-09-29):** La materialización lee SOLO el contrato del tablero: tablero → poa (board_id) → poa_versions (status = 'active') → poa_activities (poa_version_id) → poa_activity_zones (de esas actividades). Nunca todas las poa_activities.

---

## 2. Contexto de Incidente y Cifras de Auditoría

En la auditoría de producción se registraron las siguientes cifras físicas oficiales:

- **2.159 filas con `planned_date` NULL en el board `3ea0326f`, todas las semanas (E-Q08, 2026-09-29T01:31:48Z).**
- **De ellas, 2.145 corresponden a las semanas `2026-09-21` (1.430) y `2026-09-28` (715).**

---

## 3. Sección FREQ-SEMANTICS-01 (Fuera de Alcance, Sin Cambios en este Gate)

> **Propósito:** Documentar los hechos de divergencia semántica y matemática identificados en el motor de planificación para su resolución en un incremento posterior.

1. **Divergencia de Base Diaria:**
   - [`src/lib/schedulerMath.ts:42-48`](file:///c:/desarrollo/monday-clone/src/lib/schedulerMath.ts#L42-L48) documenta `25 = diaria` (tasa mensual en base de 25 días laborables).
   - [`src/lib/poaImport/poaFrequencyNormalizer.ts:104-144`](file:///c:/desarrollo/monday-clone/src/lib/poaImport/poaFrequencyNormalizer.ts#L104-L144) y [`src/lib/routineScheduler.ts:19`](file:///c:/desarrollo/monday-clone/src/lib/routineScheduler.ts#L19) usan `1 = diaria` (intervalo de 1 día laborable entre ocurrencias).
2. **Divergencia en Patrón Semanal:**
   - Semanal = 4 en [`src/lib/poaImport/poaFrequencyNormalizer.ts:104`](file:///c:/desarrollo/monday-clone/src/lib/poaImport/poaFrequencyNormalizer.ts#L104) y migración `2026092301` frente al patrón semanal `6.25` en el Cronograma ([`src/lib/routineScheduler.ts:249`](file:///c:/desarrollo/monday-clone/src/lib/routineScheduler.ts#L249)).
3. **Dispersión de Ocurrencias sin Historial:**
   - [`src/lib/scheduleMaterializationService.ts:265`](file:///c:/desarrollo/monday-clone/src/lib/scheduleMaterializationService.ts#L265) pasa historial `executionHistory = []`, provocando que en el Cronograma las frecuencias `12.5`, `25` y personalizadas se programen todas las semanas ([`src/lib/routineScheduler.ts:277, 314, 347`](file:///c:/desarrollo/monday-clone/src/lib/routineScheduler.ts#L277)).
4. **Acumulación de Jornales en Asignaciones:**
   - `planned_jr` en cada asignación diaria `DailyRoutineAssignment` recibe el total de jornales teóricos mensuales calculados para la actividad ([`src/lib/routineScheduler.ts:156-161, 177`](file:///c:/desarrollo/monday-clone/src/lib/routineScheduler.ts#L156-L161)) a través de `assign.theoretical_jr`. (`planned_jr` viene solo de `theoretical_jr`; `frequency_interval` alimenta `planned_frecuencia`).

---

## 4. Universo de Evaluación por Sitio y Catálogo Fijo

### A. Universo Contractual por Sitio
El universo de evaluación para la materialización de un sitio **NO son los `board_activity_standards`**, sino las actividades que poseen cantidad contratada en `poa_activity_zones` para ese `group_id` (`zone_id`).

Cada actividad del universo del sitio recibe **exactamente una acción determinística**:

1. `MATERIALIZED`: Actividad con frecuencia finita > 0, rendimiento > 0, cantidad contratada > 0 y estándar asociado. Se incluye en el plan.
2. `NOT_SCHEDULED_NO_PERIODIC_FREQ`: Actividad con frecuencia `NULL` en POA. **Acción informativa: el plan NO queda PARCIAL.**
3. `NOT_SCHEDULED_NO_RENDIMIENTO`: Actividad con `requiere_rendimiento = false` en catálogo. **Acción informativa: el plan NO queda PARCIAL.**
4. `SKIPPED_ZERO_QTY`: Actividad con cantidad contractual `= 0` para el sitio. **Acción informativa: el plan NO queda PARCIAL.** (Provisional, D3).
5. `EXCLUDED_MISSING_STANDARD`: Actividad contractual sin registro correspondiente en `board_activity_standards`. **Acción A2: el plan queda PARCIAL.**
6. `EXCLUDED_INVALID_CONTRACT`: Actividad con frecuencia no finita o `<= 0` (distinta de `NULL`), o rendimiento `<= 0`. **Acción A2: el plan queda PARCIAL.**
7. `EXCLUDED_ZONE_FREQUENCY_PENDING`: Actividades transitorias (`1.12`, `1.13`, `1.15`) con frecuencia contractual en POA V.10 por zona pero pendiente de carga en BD (gate FREQ-SITE-01). **Acción A2: el plan queda PARCIAL.**

### B. Manejo de Plantillas y Catálogo Fijo (~L214–259)
En [`src/lib/scheduleMaterializationService.ts:214-259`](file:///c:/desarrollo/monday-clone/src/lib/scheduleMaterializationService.ts#L214-L259):
- **Con POA activo y cero plantillas generadas:** Se emite evento P3 con estado `FAILED` y motivo `NO_TEMPLATES`. **Queda estrictamente prohibido recurrir a `OPERATIONAL_STANDARDS_CATALOG_V3`.**
- **Sin POA activo (tableros legados):** Se conserva el comportamiento existente de contingencia y se registra en el payload `template_source = 'CATALOG_V3_CONSTANT'`.

---

## 5. Estructura del Evento Resumen por Sitio (C2)

Se emite **1 evento `SITE_MATERIALIZATION_SUMMARY` por sitio y semana**, más eventos de alerta (`SEQUENCE_IDENTITY_CONFLICT`, `WEEKLY_PLAN_ITEMS_GATEWAY_DROPPED`) **solo cuando ocurran**:

```typescript
export type SiteActivityAction =
  | 'MATERIALIZED'
  | 'NOT_SCHEDULED_NO_PERIODIC_FREQ'
  | 'NOT_SCHEDULED_NO_RENDIMIENTO'
  | 'SKIPPED_ZERO_QTY'
  | 'EXCLUDED_MISSING_STANDARD'
  | 'EXCLUDED_INVALID_CONTRACT'
  | 'EXCLUDED_ZONE_FREQUENCY_PENDING';

export interface ActivityProcessingDetail {
  activity_key: string;
  action: SiteActivityAction;
  reason?: string;
  frequency_source: 'POA' | 'NONE';
  planned_qty?: number;
  planned_frecuencia?: number | null;
  planned_rendimiento?: number;
}

export interface SiteMaterializationSummaryPayload {
  board_id: string;
  group_id: string | null;
  week_start: string;
  plan_id?: string | null;
  status: 'SUCCESS' | 'PARTIAL' | 'FAILED';
  total_activities_evaluated: number;
  materialized_count: number;
  not_scheduled_no_freq_count: number;
  not_scheduled_no_rendimiento_count: number;
  skipped_zero_qty_count: number;
  excluded_missing_standard_count: number;
  excluded_invalid_contract_count: number;
  excluded_zone_frequency_pending_count: number;
  is_partial: boolean;
  partial_reasons: string[];
  activities_detail: ActivityProcessingDetail[];
  detail_truncated?: boolean;
  error?: {
    stage: 'pre_validation' | 'header' | 'sync' | 'post_verify' | 'exception';
    code?: string;
    message: string;
    details?: unknown;
  };
}
```

---

## 6. Diseño y Esquema de Persistencia P3 (`materialization_events`)

Conforme a **D7** (P1 y P2 formalmente descartados) y la resolución de seguridad (E-Q18a / E-Q18c), la persistencia se realiza en una tabla *append-only* en PostgreSQL:

```sql
CREATE TABLE IF NOT EXISTS public.materialization_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id TEXT NOT NULL UNIQUE,
  event_type TEXT NOT NULL,
  board_id UUID NOT NULL REFERENCES public.boards(id),
  group_id UUID REFERENCES public.groups(id),
  week_start DATE NOT NULL,
  plan_id UUID REFERENCES public.weekly_plans(id),
  status TEXT NOT NULL CHECK (status IN ('SUCCESS', 'PARTIAL', 'FAILED')),
  actor_id UUID NOT NULL REFERENCES auth.users(id),
  payload JSONB NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Índices de Rendimiento
CREATE INDEX IF NOT EXISTS idx_mat_events_board_week ON public.materialization_events(board_id, week_start DESC);
CREATE INDEX IF NOT EXISTS idx_mat_events_group ON public.materialization_events(group_id);
CREATE INDEX IF NOT EXISTS idx_mat_events_created_at ON public.materialization_events(created_at DESC);
```

### Políticas de Seguridad y Privilegios
1. **Permisos de Tabla:**
   ```sql
   REVOKE ALL ON public.materialization_events FROM PUBLIC, anon, authenticated;
   GRANT SELECT ON public.materialization_events TO authenticated;
   ALTER TABLE public.materialization_events ENABLE ROW LEVEL SECURITY;
   ```
2. **Política de Lectura RLS (Resuelta vía E-Q18a / E-Q18c):**
   ```sql
   CREATE POLICY "Admin Select Only" ON public.materialization_events 
     FOR SELECT TO authenticated 
     USING (public.get_user_board_role(board_id, auth.uid()) = 'admin');
   ```
   > **Regla de Seguridad:** Queda **PROHIBIDO** usar `public.is_admin()` para esta política. Aunque existe y es `SECURITY DEFINER`, lee `auth.jwt()->'user_metadata'->>'role'`, el cual puede ser editado por el propio usuario en el cliente.
3. **RPC `SECURITY DEFINER` de Inserción:**
   - Función: `public.log_materialization_event_rpc(p_board_id UUID, p_group_id UUID, p_week_start DATE, p_plan_id UUID, p_event_type TEXT, p_status TEXT, p_payload JSONB)`
   - Configuración: `LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public, pg_temp`
   - Validaciones en Servidor:
     - `auth.uid() IS NOT NULL`
     - `public.can_report_execution(p_board_id, auth.uid())`
     - Si `p_group_id` no es NULL: validar que pertenece a `p_board_id` (`EXISTS(SELECT 1 FROM public.groups WHERE id = p_group_id AND board_id = p_board_id)`). Si `p_group_id` es NULL (caso D10 `MISSING_GROUP_ID`): omitir esta validación y validar el resto.
     - `p_plan_id` pertenece a `p_board_id`/`p_group_id` (si no es nulo)
     - `p_event_type` en lista blanca (`'SITE_MATERIALIZATION_SUMMARY'`, `'SEQUENCE_IDENTITY_CONFLICT'`, `'WEEKLY_PLAN_ITEMS_GATEWAY_DROPPED'`)
     - `actor_id` asignado en el servidor como `auth.uid()` (se ignora cualquier valor cliente)
     - Rechazo estricto si `octet_length(p_payload::text) > 65536` (64 KB)
4. **Truncamiento Defensivo en Cliente:**
   - Si el payload supera 60 KB, el cliente recorta `activities_detail` a un resumen agregando `detail_truncated: true`. **Se conservan intactos todos los contadores numéricos.** Nunca se recorta en silencio.

### Parámetros Operacionales de la Tabla P3
- **Volumen P3:** sitios × 52 eventos/año; para el board `3ea0326f` (10 sitios) ≈ 520 eventos/año.

---

## 7. Algoritmo Post-RPC, Validación Estricta y Cobertura Dual (Caso 142/143)

### A. Validación Estricta de Fechas (Round-Trip)
```typescript
export function isValidISODateString(d: unknown): boolean {
  return (
    typeof d === 'string' &&
    /^\d{4}-\d{2}-\d{2}$/.test(d) &&
    new Date(d + 'T00:00:00Z').toISOString().slice(0, 10) === d
  );
}
```

### B. Verificación de Identidad de Secuencias y Descartes Post-RPC
Antes de invocar el RPC, se leen las filas existentes del plan:
`SELECT planned_sequence, activity_key, planned_date FROM weekly_plan_items WHERE plan_id = headerPlanId;`

1. **Detección de Conflicto de Identidad:**
   - Si una `planned_sequence` enviada ya existe en la base con un `activity_key` diferente:
   - Se emite el evento estructurado `SEQUENCE_IDENTITY_CONFLICT` detallando `sequence`, `sent_key` y `existing_key`. *(Solo detección; la corrección de identidad corresponde a R1-d)*.
2. **Detección de Descartes en Gateway:**
   - `esperadas = Set(s for s in enviadas if s NOT IN existing_sequences)`
   - `devueltas = Set(syncedRows.map(r => r.planned_sequence))`
   - `faltantes = Set(s for s in esperadas if s NOT IN devueltas)`
   - Si `faltantes.size > 0` → Emite alerta crítica `WEEKLY_PLAN_ITEMS_GATEWAY_DROPPED`.

### C. Cobertura Dual del Caso 142/143 (Q13)
- **Camino 1 (Código Actual):** La actividad `1.15` con frecuencia `NULL` se clasifica antes del envío como `NOT_SCHEDULED_NO_PERIODIC_FREQ` (acción informativa, plan no queda parcial). No viaja al RPC.
- **Camino 2 (Incidente `fd1b92b`):** Si un ítem viaja con `planned_jr = null` y el `WHERE` del RPC lo descarta (142 de 143), el algoritmo post-RPC detecta la secuencia faltante y emite `WEEKLY_PLAN_ITEMS_GATEWAY_DROPPED`.

---

## 8. Visibilidad de Advertencias y Errores en UI (D8)

Conforme a **D8**, los avisos de **Plan Parcial**, **Errores de Materialización** y **Actividades No Programadas (`NOT_SCHEDULED_*`)** son visibles **únicamente para usuarios con rol Administrador**:

- **Mecanismo de Evaluación:**
  - Archivo fuente: [`src/contexts/AuthContext.tsx:137-139`](file:///c:/desarrollo/monday-clone/src/contexts/AuthContext.tsx#L137-L139) mediante `useAuth().isAdmin`.
  - **Nota de Gobernanza:** `isAdmin` evalúa actualmente `(user?.user_metadata as any)?.role === 'admin'`. Dado que `user_metadata` es editable por el usuario en Supabase estándar, este aspecto queda registrado para remediación en `SECURITY-AUDIT-01` y no se modifica en este gate.

- **Renderizado Condicional:**
  - En [`src/components/planner/PlanLifecyclePanel.tsx`](file:///c:/desarrollo/monday-clone/src/components/planner/PlanLifecyclePanel.tsx) y [`src/components/planner/WeeklyPlannerView.tsx`](file:///c:/desarrollo/monday-clone/src/components/planner/WeeklyPlannerView.tsx):
    ```tsx
    {isAdmin && (isPartialPlan || summary.not_scheduled_no_freq_count > 0 || summary.not_scheduled_no_rendimiento_count > 0) && (
      <AdminMaterializationNotice 
        siteName={group.title} 
        isPartial={isPartialPlan}
        partialReasons={planSummary.partial_reasons}
        notScheduledItems={planSummary.activities_detail.filter(a => a.action.startsWith('NOT_SCHEDULED'))} 
      />
    )}
    ```

---

## 9. Análisis de Llamadores de `syncWeeklyPlanForBoard` (D4, D10)

Conforme a **D4** y **D10**, no se elimina la función `syncWeeklyPlanForBoard` de la base de código, sino su invocación tras fallos o ante `gId` nulo en `scheduleMaterializationService.ts`.

### Salida Literal de Búsqueda Recursiva (`Select-String` en `src`):

```text
src\lib\__tests__\contractualFrequencyCertificationIntegration.test.ts:8:import { syncWeeklyPlanForBoard } from '../weeklyPlanService';
src\lib\__tests__\contractualFrequencyCertificationIntegration.test.ts:180:    const res1 = await syncWeeklyPlanForBoard(mockSupabase, boardId, siteId, weekStartISO, newProjection);
src\lib\__tests__\contractualFrequencyCertificationIntegration.test.ts:199:    const res2 = await syncWeeklyPlanForBoard(mockSupabase, boardId, siteId, weekStartISO, newProjection);
src\lib\__tests__\contractualFrequencyCorrection.test.ts:2:import { syncWeeklyPlanForBoard } from '../weeklyPlanService';
src\lib\__tests__\contractualFrequencyCorrection.test.ts:223:    const result = await syncWeeklyPlanForBoard(
src\lib\__tests__\governedTemporalReconciliationC15.test.ts:12:import { syncWeeklyPlanForBoard } from '../weeklyPlanService';
src\lib\__tests__\governedTemporalReconciliationC15.test.ts:62:  test('2. syncWeeklyPlanForBoard no sobrescribe ítems con is_manual_override = true ni status terminal', async () => {
src\lib\__tests__\governedTemporalReconciliationC15.test.ts:144:    const result = await syncWeeklyPlanForBoard(
src\lib\__tests__\transversalArchitectureAudit.test.ts:14:import { syncWeeklyPlanForBoard } from '../weeklyPlanService';
src\lib\__tests__\transversalArchitectureAudit.test.ts:288:  await syncWeeklyPlanForBoard(
src\lib\__tests__\weeklyPlanService.test.ts:18:  syncWeeklyPlanForBoard,
src\lib\__tests__\weeklyPlanService.test.ts:253:    const result1 = await syncWeeklyPlanForBoard(mockSupabase, boardId, groupId, '2026-09-07', projection);
src\lib\__tests__\weeklyPlanService.test.ts:258:    const result2 = await syncWeeklyPlanForBoard(mockSupabase, boardId, groupId, '2026-09-07', projection);
src\lib\__tests__\weeklyPlanService.test.ts:272:    await syncWeeklyPlanForBoard(mockSupabase, boardId, groupId, '2026-09-07', projection);
src\lib\__tests__\weeklyPlanService.test.ts:287:    const result = await syncWeeklyPlanForBoard(mockSupabase, boardId, groupId, '2026-09-07', emptyProjection);
src\lib\__tests__\weeklyPlanService.test.ts:301:    await syncWeeklyPlanForBoard(mockSupabase, boardId, groupId, '2026-09-07', projection);
src\lib\__tests__\weeklyPlanService.test.ts:311:    const result = await syncWeeklyPlanForBoard(mockSupabase, boardId, groupId, '2026-09-07', projection);
src\lib\__tests__\weeklyPlanService.test.ts:340:    await syncWeeklyPlanForBoard(mockSupabase, boardId, groupId, '2026-09-07', projection);
src\lib\__tests__\weeklyPlanService.test.ts:348:    await syncWeeklyPlanForBoard(mockSupabase, boardId, groupId, '2026-09-07', projection);
src\lib\__tests__\weeklyPlanService.test.ts:361:    const result = await syncWeeklyPlanForBoard(mockSupabase, boardId, groupId, '2026-09-07', projection);
src\lib\__tests__\weeklyPlanService.test.ts:382:      syncWeeklyPlanForBoard(mockSupabase, boardId, groupId, '2026-09-07', projection),
src\lib\__tests__\weeklyPlanService.test.ts:383:      syncWeeklyPlanForBoard(mockSupabase, boardId, groupId, '2026-09-07', projection),
src\lib\scheduleMaterializationService.ts:15:  syncWeeklyPlanForBoard,
src\lib\scheduleMaterializationService.ts:325:  return await syncWeeklyPlanForBoard(
src\lib\weeklyPlanService.ts:183:export async function syncWeeklyPlanForBoard(
```

---

## 10. Matriz de Archivos a Modificar en Fase 2

```
┌──────────────────────────────────────────────────────────────────────────────────────────────────┐
│ ARCHIVOS A INTERVENIR EN FASE 2                                                                   │
├────────────────────────────────────────┬────────────────────────────────┬────────────────────────┤
│ Archivo                                │ Función / Sección              │ Líneas de Referencia   │
├────────────────────────────────────────┼────────────────────────────────┼────────────────────────┤
│ src/lib/scheduleMaterializationService.ts│ ensureWeeklyPlanMaterialized   │ ~L95–108 (poaActivities)│
│                                        │ (Validación D5, D2, D4, D10)   │ ~L176–212 (Plantillas) │
│                                        │                                │ ~L270–325 (RPC y P3)   │
├────────────────────────────────────────┼────────────────────────────────┼────────────────────────┤
│ src/lib/weeklyPlanService.ts           │ syncWeeklyPlanForBoard         │ ~L280–330 (Preservar   │
│                                        │                                │ función, no eliminar)  │
├────────────────────────────────────────┼────────────────────────────────┼────────────────────────┤
│ src/lib/myWorkSurfaceTriggerService.ts │ materializeWeeklyPlanForTrigger│ ~L271–295 (Plantillas) │
│                                        │                                │ ~L305–335 (Pre-RPC D5) │
├────────────────────────────────────────┼────────────────────────────────┼────────────────────────┤
│ src/hooks/useWeeklyPlans.ts            │ Query Hook de Materialización  │ ~L302–313 (Aislamiento │
│                                        │                                │ por sitio D6)          │
├────────────────────────────────────────┼────────────────────────────────┼────────────────────────┤
│ src/hooks/useWeeklyPlan.ts             │ Query Hook Single Site         │ ~L115–124 (Captura UI) │
├────────────────────────────────────────┼────────────────────────────────┼────────────────────────┤
│ src/components/planner/PlanLifecyclePanel.tsx │ Renderizado de Alerta Admin   │ ~L80–120 (Aviso D8)    │
├────────────────────────────────────────┼────────────────────────────────┼────────────────────────┤
│ supabase/migrations/YYYYMMDDNN_materialization_events.sql │ DDL Tabla P3 y RPC SECURITY DEFINER │ Archivo Nuevo (Fase 2) │
└────────────────────────────────────────┴────────────────────────────────┴────────────────────────┘
```

---

## 11. Límites Estrictos de Alcance (Fuera de Alcance - D9)

Quedan **expresamente excluidos** de este gate:
- ❌ **Filtro de tableros de prueba:** No se altera el filtrado general de boards en esta fase.
- ❌ **Filtro board/versión en `poa_activities`:** Pasa formalmente al incremento **R1-d**.
- ❌ **Reparación de zonas:** No se modifican relaciones ni llaves foráneas de zonas.
- ❌ **Reparación de `planned_date` históricas:** Las 2.159 filas históricas de producción serán tratadas en un procedimiento de datos separado.
- ❌ **Migración 2026092801:** Permanece rechazada y sin tocar.

### Hallazgo Crítico Registrado: `SECURITY-AUDIT-01`
En la auditoría E-Q18a y E-Q18c (2026-09-29T05:02Z) se registraron los siguientes hechos críticos en la capa de seguridad de Supabase:
1. `public.is_admin()` usa `user_metadata` y es invocado por ~50 políticas RLS con permiso `ALL` (`actas`, `acta_items`, `poa*`, `weekly_plans`, `weekly_plan_items`, `board_members`, `user_board_roles`, `boards`, `groups`, `user_profiles`, entre otras).
2. `board_members`, la tabla desde la cual lee `get_user_board_role`, está protegida por `is_admin()`: por tanto, la nueva política de lectura solo será 100% segura cuando se subsane el punto (1).
3. `get_user_board_role` es una función `SECURITY DEFINER` que carece de `SET search_path`.
4. `AuthContext.isAdmin` evalúa `user_metadata` y dos correos fijos en el cliente.

### Gates Futuros Registrados (Sin Diseñar en este Gate):

1. **`FREQ-SITE-01`:**
   - Frecuencia por zona para las actividades `1.12`, `1.13` y `1.15`, expresada en visitas por mes.
   - Enmienda la decisión del 2026-07-18 en [`docs/discovery/poa-frequency-per-zone.md`](file:///c:/desarrollo/monday-clone/docs/discovery/poa-frequency-per-zone.md) (que catalogaba "m³/pasadas, no periódica").
   - Fuente oficial: `POA 2026 V.10 a cierre Acta 37 (Jun-2026).xlsx` (sha256 `063a0686fb2bb0cf...`).
   - Valores contractuales por zona:
     - `1.12` → Plaza 4, Manglares 4, Country1 6, Sabanilla2 6, Miramar 6, Salinas 4, Punta Astilleros 4
     - `1.13` → Plaza 2, Manglares 2, Country1 4, Sabanilla2 4, Miramar 4, Salinas 4, Punta Astilleros 1
     - `1.15` → Plaza 4, Manglares 4, Country1 6, Sabanilla2 6, Miramar 4, Salinas 4, Punta Astilleros sin frecuencia (no se planifica)
   - Dependencia: Depende formalmente de `FREQ-SEMANTICS-01`.

2. **`POA-V10-IMPORT`:**
   - La versión contractual vigente es V.10 (no V.02).
   - Diferencias estructurales: 172 ítems frente a 107 (65 nuevos), precio unitario 2026 distinto en los 107 comunes, `1.15` cambia en Manglares y Punta Astilleros, 6 cantidades cambian en Mercado La Sazón.
   - Error de origen confirmado: en Miramar (31 fórmulas), Salinas del Rey (18), Manglares y Country1 (`2.09`), el `PRECIO TOTAL` no multiplica por `FREC.`. El sistema NUNCA debe importar `PRECIO TOTAL`; debe calcular siempre `cantidad × FREC. × precio unitario`.
   - Verificar si el importador bloquea la actividad `1.15` (frecuencia vacía en una zona con cantidad, regla de 20260726).
   - *Nota de corrección documental:* La línea 143 de [`docs/discovery/poa-frequency-per-zone.md`](file:///c:/desarrollo/monday-clone/docs/discovery/poa-frequency-per-zone.md) (*"el precio cuadra en cada zona"*) es falsa para Miramar y Salinas, y deberá corregirse en el gate `POA-V10-IMPORT`.

---

## 12. Elementos Marcados "A Verificar"

- **Sin pendientes.** (Todos los puntos técnicos y decisiones operacionales D1 a D10 han sido formalmente resueltos y ratificados).

---

## 13. Autoverificación

Salida literal de las búsquedas ejecutadas sobre este archivo mediante PowerShell (`Select-String`):

```powershell
# 1. Búsqueda de Cronograma, frequency_interval o assign.
Get-Content docs\gates\R1-b0_R1-c_SPEC.md | Select-String -Pattern "Cronograma|frequency_interval|assign\."
docs\gates\R1-b0_R1-c_SPEC.md:45:   - Semanal = 4 en [`src/lib/poaImport/poaFrequencyNormalizer.ts:104`](file:///c:/desarrollo/monday-clone/src/lib/poaImport/poaFrequencyNormalizer.ts#L104) y migración `2026092301` frente al patrón semanal `6.25` en el Cronograma ([`src/lib/routineScheduler.ts:249`](file:///c:/desarrollo/monday-clone/src/lib/routineScheduler.ts#L249)).
docs\gates\R1-b0_R1-c_SPEC.md:47:   - [`src/lib/scheduleMaterializationService.ts:265`](file:///c:/desarrollo/monday-clone/src/lib/scheduleMaterializationService.ts#L265) pasa historial `executionHistory = []`, provocando que en el Cronograma las frecuencias `12.5`, `25` y personalizadas se programen todas las semanas ([`src/lib/routineScheduler.ts:277, 314, 347`](file:///c:/desarrollo/monday-clone/src/lib/routineScheduler.ts#L277)).
docs\gates\R1-b0_R1-c_SPEC.md:49:   - `planned_jr` en cada asignación diaria `DailyRoutineAssignment` recibe el total de jornales teóricos mensuales calculados para la actividad ([`src/lib/routineScheduler.ts:156-161, 177`](file:///c:/desarrollo/monday-clone/src/lib/routineScheduler.ts#L156-L161)) a través de `assign.theoretical_jr`. (`planned_jr` viene solo de `theoretical_jr`; `frequency_interval` alimenta `planned_frecuencia`).

# 2. Búsqueda de user_metadata
Get-Content docs\gates\R1-b0_R1-c_SPEC.md | Select-String -Pattern "user_metadata"
docs\gates\R1-b0_R1-c_SPEC.md:167:   > **Regla de Seguridad:** Queda **PROHIBIDO** usar `public.is_admin()` para esta política. Aunque existe y es `SECURITY DEFINER`, lee `auth.jwt()->'user_metadata'->>'role'`, el cual puede ser editado por el propio usuario en el cliente.
docs\gates\R1-b0_R1-c_SPEC.md:218:  - **Nota de Gobernanza:** `isAdmin` evalúa actualmente `(user?.user_metadata as any)?.role === 'admin'`. Dado que `user_metadata` es editable por el usuario en Supabase estándar, este aspecto queda registrado para remediación en `SECURITY-AUDIT-01` y no se modifica en este gate.
docs\gates\R1-b0_R1-c_SPEC.md:276:1. `public.is_admin()` usa `user_metadata` y es invocado por ~50 políticas RLS con permiso `ALL` (`actas`, `acta_items`, `poa*`, `weekly_plans`, `weekly_plan_items`, `board_members`, `user_board_roles`, `boards`, `groups`, `user_profiles`, entre otras).
docs\gates\R1-b0_R1-c_SPEC.md:279:4. `AuthContext.isAdmin` evalúa `user_metadata` y dos correos fijos en el cliente.

# 3. Búsqueda de timezone('utc'
Get-Content docs\gates\R1-b0_R1-c_SPEC.md | Select-String -Pattern "timezone\('utc'"
# (0 coincidencias)

# 4. Búsqueda de CRONOGRAMA
Get-Content docs\gates\R1-b0_R1-c_SPEC.md | Select-String -Pattern "CRONOGRAMA"
# (0 coincidencias)

# 5. Búsqueda de is_admin
Get-Content docs\gates\R1-b0_R1-c_SPEC.md | Select-String -Pattern "is_admin"
docs\gates\R1-b0_R1-c_SPEC.md:167:   > **Regla de Seguridad:** Queda **PROHIBIDO** usar `public.is_admin()` para esta política. Aunque existe y es `SECURITY DEFINER`, lee `auth.jwt()->'user_metadata'->>'role'`, el cual puede ser editado por el propio usuario en el cliente.
docs\gates\R1-b0_R1-c_SPEC.md:276:1. `public.is_admin()` usa `user_metadata` y es invocado por ~50 políticas RLS con permiso `ALL` (`actas`, `acta_items`, `poa*`, `weekly_plans`, `weekly_plan_items`, `board_members`, `user_board_roles`, `boards`, `groups`, `user_profiles`, entre otras).
docs\gates\R1-b0_R1-c_SPEC.md:277:2. `board_members`, la tabla desde la cual lee `get_user_board_role`, está protegida por `is_admin()`: por tanto, la nueva política de lectura solo será 100% segura cuando se subsane el punto (1).
```

---

*Especificación Técnica v4.2 formalizada conforme a las Decisiones Aprobadas D1–D10 de Tomás y la evidencia de auditoría de seguridad E-Q18a / E-Q18c. Cero modificaciones de código en Fase 1.*
