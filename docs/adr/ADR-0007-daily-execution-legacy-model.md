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

## Problema

Existen dos fuentes de verdad para el mismo concepto de negocio ("¿qué se ejecutó y cuándo?"):

1. `weekly_plan_item_executions` — el modelo oficial, con ciclo de vida completo (`draft→reported→verified/rejected`), evidencia (`execution_attachments`), verificación, confirmación, cierre y Acta.
2. `items.values.daily_execution` — JSONB suelto, sin ciclo de vida, sin RLS propia (hereda la de `items`), sin relación con el POA ni con las Actas.

Esto contradice el principio que este mismo proyecto ha aplicado consistentemente en cada incremento reciente (Confirmación/Cierre, Agenda Operativa, el propio ADR-0006): **una sola fuente de verdad por concepto de negocio.**

## Decisión propuesta

**No se elimina `daily_execution` ahora.** El orden propuesto:

1. **Inventariar** (este documento ya lo hace) todos los consumidores, sin excepción.
2. **Migrar uno por uno** cada consumidor vivo al modelo oficial, empezando por el de mayor alcance (`ItemModal.tsx`, por ser el más ampliamente reachable) y siguiendo por los de solo lectura (Reportes, widgets financieros, Automatizaciones) — cada migración es su propio incremento, con su propio contrato congelado antes de escribir código, mismo método que el resto del proyecto.
3. **Solo cuando no quede ningún consumidor vivo**, se retira la columna/campo `daily_execution` y el código muerto asociado (`GanttView.tsx`, `TacticalOperationsView.tsx`, `CalendarView.tsx`, `AssessmentView.tsx` y sus `*ViewContainer`, si nada más los reactiva).

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

Este ADR pasa de "Propuesto" a "Aceptado" cuando el dueño del producto confirme el orden de migración (o proponga uno distinto) y se defina qué consumidor se migra primero. Se da por cumplido, y `daily_execution` se retira, cuando el inventario de la sección anterior quede en cero consumidores vivos — verificable repitiendo las mismas búsquedas que originaron este documento.
