# ADR-0007 — Retiro progresivo de `daily_execution` como fuente operativa

## Estado
Propuesto — el problema y el inventario de consumidores están confirmados con evidencia; el plan de migración (sección "Decisión propuesta") todavía no está ejecutado ni aprobado como compromiso de calendario.

## Fecha
2026-07-18

## Contexto

La auditoría de retiro de `ExecutionView.tsx` (ver [ADR-0006](./ADR-0006-execution-engine-consolidation.md) y `docs/architecture/agenda-operativa-design.md`, sección 12 "Fase 3") encontró algo más grande que el propio componente: `items.values.daily_execution` (JSONB) no es una estructura de datos privada de `ExecutionView` — es un **segundo modelo de dominio completo** para representar "ejecución", coexistiendo con el modelo oficial (`weekly_plans` → `weekly_plan_item_executions` → `execution_attachments`) sobre el que se construyó todo lo demás: jornadas, evidencia fotográfica, verificación, visión por computador, confirmación, cierre y actas.

Este ADR existe para que, dentro de seis meses, nadie mire `daily_execution`, concluya "nadie usa esto" y lo borre — rompiendo en silencio reportes, widgets financieros y automatizaciones que sí lo consumen. Es exactamente el mismo espíritu de ADR-0006: congelar la evidencia antes de que la memoria institucional se pierda.

## Inventario de consumidores (evidencia, no suposición)

**Escritores:**

| Origen | Dónde | Alcance |
|---|---|---|
| `ExecutionView.tsx` (vía `execution/ExecutionRow.tsx`, `execution/utils.ts`) | Pestaña "Ejecución" del ribbon | En retiro — ver ADR-0006, Fase 3 |
| `src/components/modals/ItemModal.tsx` (`handleUpdateDaily`, ~línea 109; tab "Ejecución", ~línea 171) | Modal de ítem — abierto desde **cualquier vista** (Tabla, Kanban, donde sea que se use `ItemModal`) | **Vivo, alcance amplio** — hallazgo principal de este ADR |
| `src/components/GanttView.tsx` (~línea 797) | — | Código muerto: `GanttView.tsx` solo lo importa `src/app/page.tsx.bak` (no es una ruta real) y su propio test. No reachable en producción |

**Lectores:**

| Origen | Dónde | Alcance |
|---|---|---|
| `src/utils/financialUtils.ts` (`getExecutedQuantity`, ~línea 49) | Fallback cuando `executed_qty` del ítem es 0 | Vivo — alimenta widgets financieros |
| `src/components/dashboard/SCurveWidget.tsx`, `FinancialWidget.tsx` | Widgets del dashboard financiero | Vivo (vía el fallback de arriba) |
| `src/components/ReportsView.tsx` (vía `ReportsViewContainer`, `?view=reports`) | Reportes | Vivo y alcanzable |
| `src/hooks/useAutomations.ts` (~línea 163) | Evaluación de condiciones de reglas de automatización | Vivo — puede disparar automatizaciones reales |
| `src/components/CalendarView.tsx`, `TacticalOperationsView.tsx`, `AssessmentView.tsx` | Sus `*ViewContainer` no están importados en ninguna ruta de `src/app/` | Código muerto, no reachable |
| `src/lib/cleanupUtils.ts` (`cleanupLegacyPhotos`) | Utilidad de limpieza, no está cableada a ninguna UI | Herramienta manual, sin uso activo confirmado |
| `scripts/seed_excel_categories.mjs` (~línea 110) | Inicializa `daily_execution: {}` al crear ítems | Solo inicializa el shape, no es un consumidor funcional |

## Significado funcional de cada consumidor (no solo "¿lo usa?", sino "¿qué calcula y tiene reemplazo real?")

Antes de aceptar la "Decisión propuesta" de abajo, se leyó el código real de cada consumidor vivo para responder, uno por uno: ¿qué calcula exactamente, y existe un dato equivalente en el modelo oficial?

| Consumidor | Qué calcula (leído en el código) | ¿Reemplazo en el modelo oficial? | Estado |
|---|---|---|---|
| `ReportsView.tsx` (Reporte Ejecutivo) | Cantidad ejecutada + fotos, agregado por ítem × sitio | El dato equivalente ya existe y es **mejor**: `weekly_plan_item_executions.executed_qty` + `execution_attachments` (con `phase`, `file_hash`) | Migrable en teoría — bloqueado (ver más abajo) |
| `FinancialWidget.tsx` | Presupuesto/ejecutado en $ + "eficiencia de rendimiento" (`executedQty ÷ díasTrabajados` vs. rendimiento objetivo) | El $ ejecutado ya es, literalmente, lo que calcula `generate_acta_draft` (`executed_qty × poa_activities.precio_unitario`) | Migrable en teoría — mismo bloqueo |
| `SCurveWidget.tsx` | Curva $ planificado-vs-ejecutado en el tiempo, usando una columna `timeline` libre del ítem + las fechas de `daily_execution` | El "ejecutado" tiene equivalente; el "planificado" hoy es un rango de fechas libre por ítem — el Cronograma piensa en semanas (`week_start`), no en ese `timeline` | **No es un swap** — hay que redefinir qué significa "planificado" en este widget |
| `useAutomations.ts` (`processExecutionUpdate`) | % de avance del **ítem genérico** para mover automáticamente su `status` (Not Started → Working on it → Done) | No es una lectura de dato, es una regla de negocio sobre el ítem tipo Monday — el equivalente conceptual sería un evento de dominio (plan `confirmed`/`closed`), no una simple sustitución de fuente | Revisar el **diseño** de la regla, no solo su fuente de datos |
| `ItemModal.tsx` (tab "Ejecución", escritura) | Entrada manual de cantidad por día, por ítem | Sustituible por `JornadaForm` (Mis actividades) | Sustituible — mismo bloqueo |
| `CalendarView.tsx` / `TacticalOperationsView.tsx` / `AssessmentView.tsx` | Vistas legacy — ninguna ruta las monta | N/A | Eliminar (código muerto confirmado, sin dependencia) |

**El bloqueo real, encontrado al verificar el esquema, no supuesto:** la tabla `items` (`supabase/migrations/20240316_consolidated_schema.sql`) tiene únicamente `id, group_id, parent_id, name, description, values JSONB, position` — **ningún `activity_key` ni `poa_activity_zone_id`**. No hay, y nunca hubo, un vínculo estructural entre un `item` genérico del tablero y una actividad del POA/`weekly_plan_item`. Esto no es un accidente: la Fase 4 (Scheduling Engine, ADR-0002) construyó el Cronograma deliberadamente SIN depender de `items`.

Consecuencia para el plan de migración: no basta con "leer de otra tabla" para los cuatro consumidores marcados "migrable en teoría" — antes hay que decidir **una** de dos rutas, y esa decisión es de negocio, no técnica:
- **(a)** construir un puente item↔actividad POA (nuevo, no existe hoy), o
- **(b)** rediseñar esos reportes/widgets para construirse enteramente sobre `weekly_plans`/`weekly_plan_item_executions`, abandonando `items` como fuente — mismo camino que ya tomó el Cronograma.

**Conclusión de la auditoría:** el problema no es una migración de consultas, sino una migración de modelo. Hasta que se decida explícitamente si los reportes continúan basándose en `items` o pasan a construirse directamente sobre el dominio operativo (`weekly_plans`), no debe iniciarse la sustitución de ningún consumidor individual.

**Inclinación registrada — no es todavía una decisión formal:** visto en conjunto con la evolución del resto del proyecto (el POA como fuente contractual, las jornadas como fuente de ejecución, `execution_attachments` para evidencia, las actas derivadas de ejecuciones verificadas), la ruta (b) — abandonar `items` como fuente y reconstruir estos reportes sobre `weekly_plans` — es la que más se alinea con la dirección que el proyecto ya tomó en cada incremento reciente. Tender un puente hacia `items` (ruta a) reintroduciría un modelo paralelo justo cuando el proyecto ha estado eliminando duplicidades. Esta preferencia queda anotada como contexto para cuando se tome la decisión formal — no reemplaza el "Estado: Propuesto" de este documento ni autoriza a empezar la migración.

## Problema

Existen dos fuentes de verdad para el mismo concepto de negocio ("¿qué se ejecutó y cuándo?"):

1. `weekly_plan_item_executions` — el modelo oficial, con ciclo de vida completo (`draft→reported→verified/rejected`), evidencia (`execution_attachments`), verificación, confirmación, cierre y Acta.
2. `items.values.daily_execution` — JSONB suelto, sin ciclo de vida, sin RLS propia (hereda la de `items`), sin relación con el POA ni con las Actas.

Esto contradice el principio que este mismo proyecto ha aplicado consistentemente en cada incremento reciente (Confirmación/Cierre, Agenda Operativa, el propio ADR-0006): **una sola fuente de verdad por concepto de negocio.**

## Decisión propuesta

**No se elimina `daily_execution` ahora.** El orden propuesto:

1. **Inventariar** (este documento ya lo hace) todos los consumidores, sin excepción.
2. **Decidir primero (a) o (b)** (sección anterior) — esta es la decisión de negocio que condiciona todo lo demás; migrar cualquier consumidor sin resolver esto sería adivinar la respuesta en código.
3. **Migrar uno por uno** cada consumidor vivo, en un orden a definir una vez resuelto el punto 2 — cada migración es su propio incremento, con su propio contrato congelado antes de escribir código, mismo método que el resto del proyecto. La regla de `useAutomations.ts` necesita, además, decidir su rediseño como evento de dominio antes de tocar su código (no es una migración de fuente de datos simple).
4. **Solo cuando no quede ningún consumidor vivo**, se retira la columna/campo `daily_execution` y el código muerto asociado (`GanttView.tsx`, `TacticalOperationsView.tsx`, `CalendarView.tsx`, `AssessmentView.tsx` y sus `*ViewContainer`, si nada más los reactiva).

**Explícitamente fuera del alcance de ADR-0006 / Fase 3 de la Agenda Operativa** — ese retiro es del componente `ExecutionView.tsx`, no de este modelo de datos. No se resuelven en el mismo incremento.

## Alternativas consideradas

- **Borrar `daily_execution` junto con `ExecutionView.tsx`.** Descartada: rompería Reportes, widgets financieros y Automatizaciones sin aviso — el error exacto que este ADR existe para prevenir.
- **Ignorar el hallazgo y no documentarlo.** Descartada: sin registro, la próxima persona que audite el código repetiría este mismo descubrimiento desde cero, o peor, no lo haría y borraría el campo asumiendo que ya no lo usa nadie.

## Consecuencias

- `daily_execution` sigue existiendo y siendo escrito/leído mientras dure la migración — no es una promesa de retiro inmediato.
- Cualquier incremento futuro que toque `ItemModal.tsx`, `ReportsView.tsx`, `SCurveWidget.tsx`, `FinancialWidget.tsx` o `useAutomations.ts` debería evaluar si es el momento de migrar ESE consumidor específico al modelo oficial, en vez de seguir extendiendo su dependencia del JSONB.
- `GanttView.tsx`, `TacticalOperationsView.tsx`, `CalendarView.tsx`, `AssessmentView.tsx` y sus `*ViewContainer` quedan marcados aquí como código muerto conocido — candidatos a eliminación independiente de esta migración, ya que ninguna ruta los renderiza hoy.
- No bloquea ni retrasa ADR-0006 / Fase 3 (retiro de `ExecutionView.tsx`) — son decisiones independientes, a propósito.

## Documentos afectados
- `docs/adr/README.md` — se agrega este ADR al índice.
- `docs/architecture/agenda-operativa-design.md` (sección 12, Fase 3) — referencia cruzada explícita de "fuera de alcance".
- `docs/roadmap_execution.md` — detectado como documento obsoleto durante esta misma auditoría (afirma que `financial_actas` no existe en ninguna migración, lo cual ya no es cierto); no se corrige en este ADR, queda anotado para que alguien lo archive o actualice aparte.

## Criterio para revisar esta decisión

Este ADR pasa de "Propuesto" a "Aceptado" cuando el dueño del producto elija entre la ruta (a) puente item↔actividad POA o (b) rediseñar los reportes/widgets sobre `weekly_plans` sin pasar por `items`, y se defina el orden de migración resultante. Se da por cumplido, y `daily_execution` se retira, cuando el inventario de consumidores quede en cero — verificable repitiendo las mismas búsquedas que originaron este documento.
