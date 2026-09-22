# ADR-0013 / H6.1 — Motor de Proyección, Diagnóstico y Reprogramación Gobernada del Cronograma v1.1

**Estado:** 🟡 **PROPUESTA DE DISEÑO CONTRACTUAL (DESIGN REVIEW · NO-GO IMPLEMENTACIÓN)**  
**Fecha:** 2026-09-12  
**Baseline Rector Vigente:** `107 Test Suites / 833 Tests PASS / 0 Failures / 0 Skips / TypeScript 0 errores`  
**Autoridad de Gobierno:** Mantenix Architecture & Governance Committee  
**Aislamiento:** 🔴 **H8 Solver STRICTLY NO-GO (0 imports, 0 dependencias, 0 llamadas a optimizadores)**  

---

## 1. Alcance (In-Scope)
1. **Motor de Proyección Temporal del Cronograma (Read Model Consultivo Puro):** Proyección visual agregada multi-semanal y mensual de ocurrencias planificadas (`weekly_plan_items`), asociando el estado de ejecución física de F5.3 y la carga de capacidad de cuadrilla de H4.9.
2. **Diagnóstico Determinista de Conflictos:** Detección y reporte consultivo de colisiones de calendario (`CONF-01`), sobrecarga de cuadrilla según H4.9 (`CONF-02`), tareas atrasadas (`CONF-03`), tareas próximas sin cuadrilla (`CONF-04`) y advertencias de precedencia (`CONF-05`).
3. **Validador de Reprogramación Intra-Semana (Command Validation):** Evaluación determinista de compuertas de inmutabilidad y reglas de calendario para autorizar o rechazar el cambio de fecha (`planned_date`) dentro de la misma semana operativa del plan.
4. **Persistencia Gobernada mediante Gateway Autorizado:** Aplicación de cambios aprobados exclusivamente sobre `weekly_plan_items` sin llamadas PostgREST directas no autorizadas.
5. **Integración Soberana de Calendario Colombiano:** Determinismo de días hábiles, descansos dominicales y feriados nacionales (Ley Emiliani) derivados de `colombianHolidays.ts`.

---

## 2. Fuera de Alcance (Out-of-Scope · Límites Inviolables)
1. ❌ **DDL o Nuevas Tablas en Base de Datos:** 0 migraciones. El esquema actual de `weekly_plans` y `weekly_plan_items` contiene todos los campos necesarios.
2. ❌ **Reprogramación Inter-Semana en H6.1 v1:** El traslado de una tarea a una semana diferente no se realiza mediante mutación in-place de fecha, ya que violaría `weekly_plan_id` y `occurrence_key`. Requiere cancelación formal en el plan de origen y materialización en el plan de destino vía F3.1.
3. ❌ **Solver o Algoritmos Heurísticos H8:** 🔴 **STRICTLY NO-GO**. 0 optimizadores combinatorios, 0 solucionadores CSP, 0 reordenamientos automáticos.
4. ❌ **Modificación Retrospectiva de Fuentes de Verdad:** Prohibición absoluta de alterar registros históricos de `poas`, `execution_records`, `verifications`, `certifications`, `actas` o `billing`.
5. ❌ **Reprogramación de Ítems con Ejecuciones Físicas:** Todo ítem con `>= 1` ejecución no rechazada o vinculado a un Acta emitida es **estrictamente inmutable**.

---

## 3. Problema de Negocio
Permitir a supervisores y coordinadores:
1. Proyectar el cronograma de mantenimiento en horizontes multi-semanales sin duplicar ni divergir de los datos de ejecución física de F5.3.
2. Detectar de manera temprana e inequívoca conflictos de programación (días no hábiles, sobrecargas de cuadrilla, tareas huérfanas próximas).
3. Reprogramar fechas de ejecución futura (`planned_date`) dentro de la semana ante eventualidades climáticas u operativas, garantizando trazabilidad total con 0 DDL.

---

## 4. Fuente de Verdad (SoT) y Desacoplamiento de Responsabilidades

```text
                 ┌─────────────────────────────────────────┐
                 │             EXISTING SoT                │
                 │ weekly_plans, weekly_plan_items (F3.1)  │
                 │ weekly_plan_item_executions (F5.3)      │
                 │ operationalCapacity (H4.9)              │
                 └────────────────────┬────────────────────┘
                                      │
                                      ▼
                 ┌─────────────────────────────────────────┐
                 │     H6.1 Schedule Projection View       │
                 │       (READ MODEL CONSULTIVO PURO)      │
                 │ - Proyección temporal multi-semanal     │
                 │ - Enriquecimiento consultivo F5.3       │
                 │ - Diagnóstico de conflictos CONF-01..05 │
                 └────────────────────┬────────────────────┘
                                      │
                                 solicitud
                                      │
                                      ▼
                 ┌─────────────────────────────────────────┐
                 │       H6.1 Reschedule Command           │
                 │         (VALIDATION ONLY)               │
                 │ - Validación de compuertas séxtuples    │
                 │ - Validación de calendario hábil        │
                 └────────────────────┬────────────────────┘
                                      │
                               mutación válida
                                      │
                                      ▼
                 ┌─────────────────────────────────────────┐
                 │         Authorized Gateway              │
                 │     (SINGLE WRITE AUTHORITY)            │
                 │ - update weekly_plan_items (override)   │
                 └─────────────────────────────────────────┘
```

---

## 5. Contratos Consumidos sin Modificación
1. **`routineScheduler.ts` (ADR-0007):** `isOperationalWorkingDay`, `addOperationalWorkingDays`, `generateRoutineScheduleForWeek`.
2. **`colombianHolidays.ts`:** `isColombianHoliday`, `getColombianHolidayName`.
3. **`weeklyPlan.ts` (ADR-0008):** `computeOccurrenceKey(boardId, groupId, routineRef, activityKey, plannedDate, patternOffset)`.
4. **`operationalCapacityService.ts` (H4.9):** `calculateCrewWorkloads(...)`, `DailyCrewWorkload`.
5. **`crewAssignmentService.ts` (F5.2):** `getEligibleCrewsForBoard`, `validateUserRole`.
6. **`fieldWorkflowExecutionService.ts` (F5.3):** Consulta de ejecuciones físicas y estados terminales.
7. **`realCostVarianceService.ts` (F5.4):** Paridad de cantidades físicas e indicadores.
8. **`supervisorExecutiveDashboardService.ts` (F5.5):** `TrustedAuthContext` y redacción RBAC.

---

## 6. Invariantes Arquitectónicos
* **`H6.1-INV-01` Invarianza Absoluta de Demanda:** La reprogramación jamás altera `planned_qty`, `theoretical_jr`, `unit`, `poa_item_id`, `activity_key` ni precios.
* **`H6.1-INV-02` Inmutabilidad Retrospectiva:** Ninguna ocurrencia con `execution_date < referenceDate` o con ejecuciones registradas (`>= 1` no rechazada) o vinculada a un plan cerrado/confirmado/Acta emitida puede ser reprogramada.
* **`H6.1-INV-03` Invarianza de Identidad de Slot (Opción B):** `occurrence_key` es estrictamente inmutable; identifica de forma permanente el slot original de materialización asignado por F3.1. La reprogramación altera exclusivamente `planned_date` marcando `is_manual_override = true`.
* **`H6.1-INV-04` Respeto a Calendario Hábil Colombia:** Todo `planned_date` debe ser día hábil operativo según `isOperationalWorkingDay` de ADR-0007.
* **`H6.1-INV-05` Aislamiento Total de H8:** 🔴 STRICTLY NO-GO (0 imports, 0 dependencias, 0 llamadas a optimizadores).
* **`H6.1-INV-06` Control de Concurrencia Optimista (OCC):** El Gateway de escritura condiciona el `UPDATE` a coincidencia estricta de `planned_date` (y `updated_at`), rechazando con `CONCURRENT_MUTATION_DETECTED` si el registro fue alterado concurrentemente.

---

## 7. Proyección del Estado del Ítem (Sin Duplicación de F5.3)

H6.1 **no crea un enum paralelo de ejecución**. Proyecta directamente:
* El estado del ítem en `weekly_plan_items`: `item.status` (`'planned' | 'in_progress' | 'completed' | 'cancelled'`).
* Enriquecimiento consultivo derivado de F5.3:
  - `hasExecutions`: `boolean` (indica si existen ejecuciones asociadas).
  - `totalExecutedQtyVerified`: `number` (suma de cantidades verificadas).
  - `isRescheduled`: `boolean` (`item.is_manual_override === true`).

---

## 8. Reglas Contractuales de Reprogramación Intra-Semana

Para que `reschedulePlanItemValidated` autorice la mutación:
1. **Compuerta de Estado del Plan:** `weekly_plan.status` debe ser `'draft'` o `'published'`. Si está en `'ready_for_confirmation'`, `'confirmed'`, `'closed'` o `'cancelled'` $\rightarrow$ **RECHAZO DETERMINISTA (`PLAN_IMMUTABLE`)**.
2. **Compuerta de Ejecución Física (F5.3):** El ítem debe tener `0 ejecuciones` o el `100% rejected` $\rightarrow$ si existe alguna ejecución con `status !== 'rejected'` $\rightarrow$ **RECHAZO DETERMINISTA (`ITEM_HAS_EXECUTIONS`)**.
3. **Compuerta de Acta Emitida (ADR-0012):** Si el ítem está referenciado en `acta_items` de un Acta en estado `'issued'` $\rightarrow$ **RECHAZO DETERMINISTA (`ITEM_LINKED_TO_ISSUED_ACTA`)**.
4. **Compuerta de Día Hábil:** `isOperationalWorkingDay(targetDate, customNonWorkingDays)` debe ser `true` $\rightarrow$ si es `false` $\rightarrow$ **RECHAZO DETERMINISTA (`NON_WORKING_DAY`)**.
5. **Compuerta Intra-Semana:** `targetDate >= weekly_plan.week_start_date` y `targetDate <= weekly_plan.week_end_date` $\rightarrow$ si cae fuera $\rightarrow$ **RECHAZO DETERMINISTA (`DATE_OUT_OF_PLAN_BOUNDS`)**.
6. **Idempotencia:** Si `targetDate === item.planned_date` $\rightarrow$ **NO_OP exitoso sin mutación**.
7. **Control de Concurrencia (OCC):** El Gateway exige coincidencia de snapshot en la mutación $\rightarrow$ si 0 filas afectadas $\rightarrow$ **RECHAZO DETERMINISTA (`CONCURRENT_MUTATION_DETECTED`)**.

---

## 9. Trazabilidad de Reprogramación con 0 DDL

Se demuestra que el esquema actual de `weekly_plan_items` soporta la auditoría sin requerir DDL ni nuevas tablas:
* Campo existente: `is_manual_override` $\rightarrow$ se asigna en `true`.
* Campo existente: `override_reason` $\rightarrow$ se codifica en formato canónico estructurado:
  `[RESCHEDULE:${reasonCode}] prev:${previousPlannedDate} by:${userId} at:${isoTimestamp}`
  * Razones autorizadas (`RescheduleReasonCode`): `'WEATHER_DELAY'`, `'OPERATIONAL_PRIORITY'`, `'LOGISTICS_EQUIPMENT'`, `'SUPERVISOR_ADJUSTMENT'`.
* Campo existente: `updated_at` $\rightarrow$ timestamp ISO de persistencia.

---

## 10. Calendario Laboral Colombia y Excepciones
* Consumo directo de `src/lib/colombianHolidays.ts` (Ley 51 de 1983 / Ley Emiliani).
* Lunes a Sábado: días hábiles estándar.
* Domingos: descanso obligatorio salvo `allowSunday = true`.
* Días Festivos: no laborables salvo excepción operativa explícita.
* `customNonWorkingDays`: lista opcional de fechas `YYYY-MM-DD` bloqueadas por contingencia de sitio.
* Timezone determinístico: `America/Bogota` (UTC-5) para derivar `referenceDate` desde `evaluatedAt`.

---

## 11. Definición Matemática y Temporal de la Matriz de Conflictos

| Código | Categoría | Condición Determinista de Disparo | Severidad |
| :--- | :--- | :--- | :--- |
| **`CONF-01`** | Calendario | `!isOperationalWorkingDay(item.planned_date, customNonWorkingDays, allowSunday)` | `HIGH` |
| **`CONF-02`** | Capacidad | Consumo directo de H4.9: `DailyCrewWorkload.capacityStatus === 'OVERLOADED'` para la cuadrilla y fecha del ítem | `MEDIUM` |
| **`CONF-03`** | Temporal | `item.status === 'planned' && item.planned_date < referenceDate` (Tarea atrasada sin ejecutar) | `HIGH` |
| **`CONF-04`** | Cuadrilla | `item.crew_id === null && 0 <= diffDays(item.planned_date, referenceDate) <= 2` (Ítem sin cuadrilla a $\le 48\text{ h}$ de su ejecución) | `MEDIUM` |
| **`CONF-05`** | Precedencia | Actividad predecesora (`FINISH_TO_START`) programada para fecha posterior a sucesora | `LOW` |

*Nota sobre `CONF-04`:* `diffDays(d1, d2)` calcula la diferencia de días calendario enteros entre `d1` (`planned_date`) y `d2` (`referenceDate` en `America/Bogota`).

---

## 12. Control de Acceso Server-Side RBAC (`TrustedAuthContext`)
Se consume el modelo de autorización server-side de F5.5:
* **`canReschedule = true`:** `userRoles` contiene `{ board_id: item.board_id, role: r }` donde `r ∈ {'admin', 'coordinator', 'supervisor'}`.
* **`canReschedule = false`:** Roles no autorizados (`'crew_leader'`, `'worker'`, `'viewer'`) o usuarios de otros tableros.

---

## 13. Rendimiento y Complejidad
* **Proyección de Cronograma:** Complejidad lineal $\mathcal{O}(N)$ respecto al número de ocurrencias.
* **Diagnóstico de Conflictos:** Complejidad $\mathcal{O}(N + C)$ donde $C$ es el número de cuadrillas evaluadas en H4.9.
* **Tiempo de Ejecución Objetivo:** $< 50\text{ ms}$ en memoria para horizontes de 4 semanas.

---

## 14. Aislamiento Estricto de Solver H8
* 🔴 **STRICTLY NO-GO:** Cero dependencias, cero imports y cero llamadas a optimizadores autónomos.
* **Auditoría AST:** La suite de pruebas incluirá una prueba estática obligatoria que verifique que el servicio no contiene referencias ni imports a solvers.

---

## 15. Criterios de Certificación y Cierre
* **0 DDL / 0 Migraciones.**
* **0 Mutaciones Retrospectivas.**
* **Suite Contractual H6.1:** 100% de pruebas nuevas en estado PASS.
* **Regresión Global:** 100% de suites existentes (107 suites / 833 tests) en estado PASS sin fallos ni skips.
* **TypeScript:** `npx tsc --noEmit` con 0 errores.
* **Aislamiento H8:** Confirmado por auditoría AST.
