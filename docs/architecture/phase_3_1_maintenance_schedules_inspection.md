# Map Técnico de Inspección y Matriz Before / After: Fase 3.1 · Cronogramas de Mantenimiento

**Fecha:** 2026-09-05  
**Estado:** 🟢 F3.1 AUTORIZADA PARA IMPLEMENTACIÓN (Correcciones documentales aplicadas)  
**Dictamen de Inspección:** 🟢 APROBADA CON PRECISIONES CONTRACTUALES Y DE RIESGO  
**Compatibilidad:** 100% Alineado con Baseline Arquitectónica Certificada 2386465 (ADR-0007 → ADR-0012), Fase 2.1 (`cb5cb3d`) y Fase 2.2 (`e780301`).

---

## 1. Resumen Ejecutivo de Inspección y Marco Normativo

La inspección empírica del código real de Mantenix confirma que:

1. **`weekly_plans` y `weekly_plan_items` representan la autoridad legítima de planificación operacional** que alimenta directamente a la ejecución (`/my-work`) y verificación (`/verification`).
2. **`GanttView.tsx` es una vista presentacional legacy** que opera sobre la estructura genérica de tableros (`monday.ts`) y columnas de fechas (`timeline`), pero **NO está conectada al contrato de `weekly_plans` ni a las actividades del POA**.
3. **El motor determinista de planificación existe y está certificado**:
   - `routineScheduler.ts` (ADR-0007): Cálculo determinista de recurrencias (diaria, 3x/sem, 2x/sem, semanal, quincenal, mensual).
   - `weeklyPlanner.ts` (ADR-0005): Motor determinista de cálculo de jornales teóricos y distribución semanal.
   - `weeklyPlanService.ts` (ADR-0008): Sincronización idéntica e idempotente en base de datos con protección de sobrescritura manual para ejecuciones iniciadas.
   - `colombianHolidays.ts`: Motor completo determinista de días festivos de Colombia (Ley Emiliani de 1983 + algoritmo de Pascua).
4. **Fase 3.1 NO ES UN INCREMENTO DE DOMINIO**: Es exclusivamente una **transformación de superficie UX** que conecta la visualización temporal con el motor y los contratos de planificación ya existentes.

---

## 2. Cadena Contractual de Planificación Consumida

$$\text{POA\_VERSION} \longrightarrow \text{POA\_ACTIVITY} \longrightarrow \text{POA\_ACTIVITY\_ZONE} \longrightarrow \text{WEEKLY\_PLAN (\texttt{weekly\_plans})} \longrightarrow \text{WEEKLY\_PLAN\_ITEM (\texttt{weekly\_plan\_items})} \longrightarrow \text{EXECUTION\_RECORD}$$

- **`weekly_plans`**: Cabecera del plan por `board_id`, `group_id` (sitio/zona), `week_start_date` (lunes ISO), `week_end_date` (domingo ISO) y `status` (`draft` $\rightarrow$ `published` $\rightarrow$ `in_progress` $\rightarrow$ `ready_for_confirmation` $\rightarrow$ `confirmed` $\rightarrow$ `closed`).
- **`weekly_plan_items`**: Ocurrencias planificadas deterministas compuestas por `activity_key`, `name`, `zone`, `unit`, `planned_date`, `planned_qty`, `theoretical_jr`, `source_type` (`ROUTINE` \| `INCIDENT` \| `MANUAL`), `routine_reference`, `occurrence_key`, y `status` (`planned` \| `in_progress` \| `completed` \| `cancelled`).

---

## 3. Matriz de Auditoría Empírica con Precisiones de Clasificación

| Capacidad de Planificación | Estado Real en Código / Base de Datos | Evidencia Técnica Directa | Clasificación / Dictamen |
| :--- | :--- | :--- | :--- |
| **1. Programación Semanal** | 🟢 **EXISTENTE Y INTEGRADA** | `weekly_plans` + `weekly_plan_items` + `weeklyPlanner.ts` | Consumir en UI F3.1 |
| **2. Distribución Temporal (Días)** | 🟢 **EXISTENTE** | `calculateWeeklyDistribution` en `schedulerMath.ts` & `routineScheduler.ts` | Consumir en UI F3.1 |
| **3. Asignación de Cuadrillas** | 🟡 **CAPACIDAD ESTRUCTURAL PARCIAL** | `weekly_plan_items.crew_id` existe en DB. Sin interfaz de administración. | No resolver en F3.1; pertenece al Módulo 2 del roadmap (Cuadrillas). |
| **4. Días Operativos y Festivos** | 🟢 **EXISTENTE** | `isOperationalWorkingDay()` en `routineScheduler.ts` + `colombianHolidays.ts` (Calendario operativo L-S sujeto a exclusión de domingos y festivos colombianos). | Consumir en UI F3.1 |
| **5. Festivos Colombia** | 🟢 **EXISTENTE** | `colombianHolidays.ts` (`isColombianHoliday`, Ley Emiliani, Pascua) | Consumir y resaltar en UI F3.1 |
| **6. Recurrencia Contractual** | 🟢 **EXISTENTE** | `routineScheduler.ts` (Intervalos de frecuencia en días hábiles) | Consumir en UI F3.1 |
| **7. Sincronización de Plan** | 🟢 **EXISTENTE** | `weeklyPlanService.ts` (`syncWeeklyPlanForBoard`) reconcilia plan con plantilla POA. | Preservar en F3.1 |
| **8. Protección de Overrides** | 🟢 **EXISTENTE** | `syncWeeklyPlanForBoard` preserva ítems `completed`, `in_progress` e `is_manual_override`. | Preservar en F3.1 |
| **9. Reprogramación Explícita por Usuario** | 🟡 **PARCIAL / POR VERIFICAR** | `syncWeeklyPlanForBoard` reconcilia el plan, pero NO existe mecanismo explícito de reprogramación manual/drag&drop en UX. | Out of Scope para F3.1 |
| **10. Dependencias de Tareas** | 🔴 **LEGACY / DESCONECTADO** | `GanttView.tsx` usa array `dependencies` de `monday.ts`. Desconectado de `weekly_plans` y POA. | No reutilizar; eliminar dependencia de `monday.ts` |
| **11. Capacidad por Zona & Advertencias** | 🟡 **CAPACIDAD PARCIAL** | `PlanningWarnings.tsx` advierte si `weekly_required > weekly_available`. | Presentar alertas existentes en UI |

---

## 4. Matriz Before / After Arquitectónico-UX (Fase 3.1 — Con Precisiones Obligatorias)

| Superficie Actual | Comportamiento Actual (Before) | Fuente de Datos | Motor Consumido | Interacción Propuesta (After F3.1) | Payload Existente | Mutación Existente | Permisos | Estado DB | Clasificación de Riesgo | Clasificación | Criterio de No-Regresión |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| **Visualización Principal (`/dashboard?view=planner`)** | Tabla semanal bilingüe en `WeeklyPlannerView.tsx` o vista Gantt desconectada en `GanttView.tsx` sobre `monday.ts`. | `weekly_plans`, `weekly_plan_items` | `weeklyPlanner.ts`, `routineScheduler.ts` | **Cronograma Operacional Conectado**: Rejilla temporal de calendario operativo agrupada por zonas con badges de estado, recurrencia y cantidades planificadas. | `{ planId: string, items: WeeklyPlanItem[] }` | **Consulta pura**: La visualización no invoca `savePlanItems` ni genera mutaciones. | `usePermissions()` + RLS Supabase | `weekly_plans` / `weekly_plan_items` | **Arq:** Bajo<br>**Regresión:** Bajo (sujeto a cert.)<br>**Contractual:** Nulo | Extensión UX de Motor Existente | 72/72 suites PASS, `npx tsc --noEmit` 0 errores, inmutabilidad de `ExecutionRecord` y `Acta`. |
| **Días Operativos y Festivos Colombia** | Columnas de días genéricos en la cuadrilla sin resaltado de días no laborables ni festivos. | `colombianHolidays.ts` | `isColombianHoliday`, `getColombianHolidayName`, `isOperationalWorkingDay` | Columnas visualmente diferenciadas: **Calendario operativo L-S sujeto a exclusión de domingos y festivos colombianos según `isOperationalWorkingDay()`** con tooltip informativo. | Ninguno (Lectura de UI) | Ninguna (0 mutaciones) | Libre (Presentacional) | N/A (Sin cambio DB) | **Arq:** Bajo<br>**Regresión:** Bajo<br>**Contractual:** Nulo | Extensión UX de Motor Existente | 72/72 suites PASS, 0 errores TypeScript. |
| **Expresión de Recurrencia POA** | Valor numérico abstracto de frecuencia (ej. `2.083`). | `POA_ACTIVITY.frecuencia` | `routineScheduler.ts` (`formatPOAInterval`) | Badge visual con color e ícono descriptivo de frecuencia (*Diaria*, *3x / sem*, *Semanal*, *Quincenal*, *Mensual*). | Ninguno (Lectura de UI) | Ninguna (0 mutaciones) | Libre (Presentacional) | `poa_activities.frecuencia` | **Arq:** Bajo<br>**Regresión:** Bajo<br>**Contractual:** Nulo | Extensión UX de Motor Existente | 72/72 suites PASS, 0 errores TypeScript. |
| **Navegación Temporal de Semanas** | Selección estática de fecha con desplazamiento rígido de 7 días. | `weekly_plans.week_start_date` | `weeklyPlanner.ts` (`getMonday`, `addWeeks`) | Controles de semana anterior/siguiente (`<` `/` `>`), botón "Hoy" e **Indicador derivado de posición temporal dentro del período visualizado (Semana 1–4; no constituye nueva unidad contractual ni modifica POA_VERSION)**. | `{ boardId, groupId, weekStartDate }` | `useWeeklyPlans` (re-fetch) | RLS `weekly_plans` (Select) | `weekly_plans` | **Arq:** Bajo<br>**Regresión:** Bajo<br>**Contractual:** Nulo | Extensión UX de Motor Existente | 72/72 suites PASS, 0 errores TypeScript. |
| **Visualización de Capacidad y Alertas** | Banner de texto básico `PlanningWarnings.tsx` en la parte superior. | `weekly_plan_items`, `POA_ACTIVITY_ZONE` | `weeklyPlanner.ts` (`buildWeeklyPlanningContext`) | Panel de proyección de capacidad en el pie del cronograma con indicador de carga diaria/semanal (Verde $\le100\%$, Rojo $>100\%$) y resumen de jornales teóricos. | Ninguno (Cálculo derivado) | Ninguna (0 mutaciones) | Libre (Presentacional) | N/A (Calculado en cliente) | **Arq:** Bajo<br>**Regresión:** Bajo<br>**Contractual:** Nulo | Extensión UX de Motor Existente | 72/72 suites PASS, 0 errores TypeScript. |
| **Protección Visual de Ejecuciones** | Celdas de días no distinguían si una actividad tenía ejecuciones iniciadas en campo (`/my-work`). | `weekly_plan_items.status`, `is_manual_override`, `weekly_plan_item_executions` | `weeklyPlanService.ts` (`syncWeeklyPlanForBoard`) | Badge 🔒 de protección visual. **La indicación visual representa estados contractuales y ejecuciones en `weekly_plan_item_executions` existentes y no introduce una nueva regla de inmutabilidad.** | Ninguno (Lectura de estado) | Ninguna (0 mutaciones) | RLS `weekly_plan_items` (Select) | `weekly_plan_items` / `weekly_plan_item_executions` | **Arq:** Bajo<br>**Regresión:** Bajo<br>**Contractual:** Nulo | Extensión UX de Motor Existente | 72/72 suites PASS, 0 errores TypeScript. |

---

## 5. Elementos Explícitamente FUERA DE ALCANCE (Out of Scope para F3.1)

Para proteger estrictamente la baseline contractual congelada y evitar inflar el alcance de la Fase 3.1, quedan declarados como **FUERA DE ALCANCE**:

1. 🚫 **Dependencias Legacy**: No reintroducir ni conectar el array `dependencies` de `monday.ts` ni la entidad o tabla `task_dependencies`.
2. 🚫 **Reprogramación No Demostrada**: No implementar mecanismos de reprogramación por arrastre de ratón (Drag & Drop) ni movimiento interactivo de fechas en F3.1.
3. 🚫 **Sin Mutaciones desde el Cronograma**: La visualización del cronograma no genera mutaciones de `weekly_plan_items` ni invoca `savePlanItems` por interacción de consulta.
4. 🚫 **Administración de Cuadrillas**: No implementar asignación, disponibilidad ni gestión de cuadrillas de operadores en F3.1 (pertenece al Módulo 2 del roadmap).
5. 🚫 **Gestión de Recursos**: No incorporar asignación ni seguimiento de maquinaria, vehículos o herramientas.
6. 🚫 **Control de Costos**: No modificar ni calcular tarifas, costos reales, precios unitarios ni métricas financieras dentro del cronograma.
7. 🚫 **Automatizaciones de Flujos**: No crear motores de reglas, triggers de eventos ni automatizaciones no existentes.
8. 🚫 **Modificaciones Contractuales**: Inmutabilidad 100% garantizada sobre `POA_VERSION`, `POA_ACTIVITY`, `POA_ACTIVITY_ZONE`, precios unitarios y cantidades contratadas.
9. 🚫 **Modificaciones a Ejecución o Billing**: Queda prohibido alterar la lógica o esquema de `weekly_plan_item_executions`, `verificationService`, `actaService`, `Certification` o `Billing`.

---

## 6. Invariantes Congelados durante la Implementación F3.1

- `POA_VERSION`, `POA_ACTIVITY` y `POA_ACTIVITY_ZONE` no sufren mutación.
- `weekly_plans` mantiene su función como autoridad de planificación.
- `weekly_plan_items` mantiene su función como unidad operativa planificada.
- `routineScheduler.ts` continúa siendo la autoridad para la lógica de recurrencias.
- `weeklyPlanner.ts` continúa siendo la autoridad para la distribución temporal de jornales.
- `colombianHolidays.ts` continúa siendo la autoridad para el cálculo de festivos en Colombia.
- `isOperationalWorkingDay()` continúa siendo la autoridad para la evaluación de días operativos.
- `weeklyPlanService.ts` continúa gobernando la sincronización y protección de overrides.
- No se conecta `GanttView.tsx`/`monday.ts` como fuente de verdad.
- No se reintroduce `task_dependencies`.
- No se crean nuevas entidades, tablas ni RPCs en base de datos.
- No se modifica `ExecutionRecord`, `Verification`, `Certification` ni `Acta`/`Billing`.

---

## 7. Estado de Gobernanza

```
BASELINE 2386465 → F0 ed9890b → F1.1 ac6771c → F1.2 5411a1d → F1.3 e5cf13e → F1.4 85715e1 → F2.1 cb5cb3d → F2.2 e780301
                                                                                                        │
                                                                                                        ▼
FASE 3.1 · CRONOGRAMAS DE MANTENIMIENTO
  ├── Inspección Empírica ✅ COMPLETADA
  ├── Mapeo de Superficie y Contrato ✅ COMPLETADO
  ├── Matriz de Auditoría de Capacidades ✅ CORREGIDA
  ├── Matriz Before / After Architectural-UX (12 Columnas) ✅ CORREGIDA (5 Precisiones Aprobadas)
  ├── Sección de Fuera de Alcance Estricta ✅ DECLARADA
  ├── Autorización Formal de Implementación 🟢 OTORGADA
  ├── Ejecución Atómica de Código ⏳ EN PROCESO
  └── Certificación (72/72 tests, 0 tsc errores, Invariantes preservados) ⏳ PENDIENTE
```

