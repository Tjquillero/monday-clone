# Diseño: Agenda Operativa

**Estado: Propuesto — usuarios, ubicación, alcance y MVP ya confirmados por el dueño del producto (2026-07-17); queda un punto abierto (sección 10). Diseño previo a implementación, no construido todavía.**

Continuación de [ADR-0006](../adr/ADR-0006-execution-engine-consolidation.md), que congeló la condición de retiro de `ExecutionView.tsx`: existe hasta que esta agenda cubra lo que hoy solo `ExecutionView` ofrece (semáforo de cumplimiento, vista Hoy/Semana). Este documento responde las preguntas de negocio antes de escribir código — no es un ADR (no reemplaza una decisión de arquitectura existente) ni un documento de dominio (menciona tablas). Sigue el mismo formato que `execution-certification-design.md`.

**Límite explícito:** este diseño es de solo lectura. No agrega ninguna regla de negocio, no toca `confirm_weekly_plan`/`close_weekly_plan`/`generate_acta_draft`, y no introduce ninguna tabla ni columna nueva — es una vista sobre datos que el motor real ya produce.

---

## 1. Objetivo

Que un supervisor o un administrador pueda responder, sin navegar entre pantallas, las preguntas que hoy exigen abrir Mis actividades, Verificación y Cronograma por separado — y cruzar mentalmente lo que cada una muestra. La Agenda Operativa no reemplaza esas pantallas (siguen siendo donde se actúa); es donde se **mira** antes de decidir a cuál de ellas ir, y desde donde se **salta** directamente a actuar (sección 9, Accesos rápidos).

## 2. Usuarios — CONFIRMADO

Supervisor y Administrador/Asistente — los mismos `BoardRole` que ya existen, sin rol nuevo. Decisión explícita del dueño del producto: **los roles representan permisos, no cargos**. Si hoy "Director de Operaciones" opera como `admin` o `assistant`, esa es su vía de acceso — no se crea una identidad nueva para un cargo que puede variar entre organizaciones.

- **Supervisor** — hoy solo ve, en Verificación, la bandeja de jornadas `reported` pendientes de su acción. No tiene ninguna vista de lo que YA se verificó ni de cómo va el sitio en conjunto.
- **Administrador / Asistente** — hoy ven el Cronograma por sitio y semana (uno a la vez) y Costos, pero no una vista consolidada de "qué está pasando hoy" antes de llegar al punto de Confirmar/Cerrar un plan.

**Fuera de alcance a propósito:** el Líder (ya tiene Mis actividades, acotada a sus propias jornadas) y cualquier vista corporativa multi-contrato (sección 4).

## 3. Dónde vive — CONFIRMADO

Reemplaza el destino de la pestaña **"Ejecución"** del ribbon. No es una pestaña nueva, no es una entrada de sidebar: quien hoy hace clic en "Ejecución" sigue llegando ahí, pero encuentra la vista alimentada por el motor real en vez de `ExecutionView.tsx`.

**Consecuencia técnica, no solo de producto:** `src/config/navigation.ts` **no cambia** — el id `execution` y la etiqueta "Ejecución" son contrato público (`?view=execution`) y ya están congelados sin tocarse. Lo único que cambia, el día del swap, es qué componente renderiza `ExecutionViewContainer.tsx` internamente. Ese swap sigue siendo un momento deliberado (gateado por ADR-0006 y por la sección 10 de este documento), no una consecuencia automática de terminar el MVP.

## 4. Alcance — CONFIRMADO: un board a la vez

Mismo patrón que Cronograma, no el de Mis actividades/Verificación (que cruzan todos los boards visibles). Razón explícita: todo el dominio ya construido — POA, Weekly Plans, Actas, copiloto — gira alrededor de un board. Una agenda multi-board es un problema distinto (agregación entre contratos, permisos, rendimiento) que no se resuelve como efecto secundario de este incremento.

Un dashboard corporativo multi-board queda explícitamente fuera de alcance — se diseñaría aparte, el día que exista una necesidad real de comparar contratos simultáneamente, no antes.

## 5. Preguntas que responde (observacionales)

Tomadas directamente de esta conversación — no inventadas para este documento:

- ¿Qué actividades comenzaron hoy?
- ¿Quién está trabajando (qué cuadrillas siguen activas)?
- ¿Qué evidencia existe y qué falta?
- ¿Qué quedó pendiente (de verificar, de ejecutar)?
- ¿Qué sitios están atrasados?
- ¿Qué porcentaje del mes/semana está ejecutado y verificado?
- ¿Qué días quedaron sin trabajo?

## 6. Preguntas operativas que debe responder (filtro de diseño)

A diferencia de la sección 5 (observación), estas son de **decisión** — atadas directamente a una acción que el usuario puede tomar desde otra pantalla del mismo pipeline (Verificación, Confirmación/Cierre en Cronograma, Costos). Criterio explícito del dueño del producto: **si una tarjeta, gráfico o semáforo no ayuda a responder alguna de estas, probablemente no debería existir** — es el filtro contra el que se evalúa cualquier indicador nuevo que se proponga después, para que esto no termine siendo un tablero de indicadores bonitos que nadie consulta para trabajar.

- ¿Qué sitios necesitan atención hoy?
- ¿Qué jornadas siguen sin evidencia?
- ¿Qué planes están listos para confirmar?
- ¿Qué planes están listos para cerrar?
- ¿Qué bloquea generar el próximo Acta?
- ¿Cuál es el avance operativo del board hoy?

## 7. Fuentes de datos (cerradas — sin ambigüedad)

Únicamente lectura, únicamente estas fuentes, ya existentes:

| Fuente | Qué aporta |
|---|---|
| `weekly_plans` | Plan por sitio/semana, `status` (para saber qué está `published`/`in_progress`/`confirmed`/`closed` — insumo directo de la sección 6) |
| `weekly_plan_items` | Actividad planificada, `planned_qty`, para comparar contra lo ejecutado |
| `weekly_plan_item_executions` | Jornadas reales: `execution_date`, `status` (draft/reported/verified/rejected), `crew_name`, `executed_qty`, `verified_at` |
| `execution_attachments` | Evidencia — existencia y `phase` (antes/después) por ejecución |

**Explícitamente NO:** `item.values`, `daily_execution`, `verification_gallery`, ni ninguna columna de `items` — esa es la fuente que este mismo incremento existe para dejar de usar (ver ADR-0006).

Reutiliza, no reimplementa:
- **Evidencia faltante** → `get_executions_without_evidence` (RPC del copiloto, v2.1, sin cambios).
- **Planes listos para confirmar/cerrar** → mismo criterio que `get_weekly_plan_confirmation_summary` (Gate 1) y los gates de `confirm_weekly_plan`/`close_weekly_plan` — la Agenda muestra el resultado, nunca reimplementa el gate.
- **Qué bloquea el próximo Acta** → mismo universo que `generate_acta_draft` (`weekly_plans.status='closed' AND weekly_plan_item_executions.status='verified'`, ver `ADR-0003`) leído en sentido inverso: qué planes del board *todavía no* cumplen ese criterio.

## 8. KPIs y semáforos — MVP confirmado

Primera entrega, vista **Hoy** únicamente (decisión explícita: incremental, no las tres vistas de una vez):

| KPI | Cálculo | Responde |
|---|---|---|
| Semáforo de cumplimiento del día | mismos umbrales ya validados en `DailyAgendaPanel` (≥80% verde, ≥50% ámbar, <50% rojo) — se reutiliza el criterio, no el componente | "¿qué sitios necesitan atención hoy?" |
| Evidencia pendiente | `get_executions_without_evidence` | "¿qué jornadas siguen sin evidencia?" |
| Ejecuciones verificadas (hoy) | `status='verified'` con `execution_date` = hoy | "¿cuál es el avance operativo del board hoy?" |
| Pendientes (por verificar) | mismo criterio que la bandeja de Verificación (`status='reported'`) | "¿qué quedó pendiente?" |

**Diferido a v2, sobre el mismo modelo de datos, una vez validado el uso de la vista Hoy:** vista Semana y vista Mes (% verificado agregado, días sin trabajo, semáforo de 7 días).

## 9. Accesos rápidos

Parte del MVP, no un extra: cada elemento que señale algo accionable (un sitio atrasado, una jornada sin evidencia, un plan listo para confirmar) enlaza directamente a la pantalla donde se actúa — Verificación, el panel de Confirmación/Cierre dentro de Cronograma, o Costos. La Agenda es el punto de partida, nunca el lugar donde se ejecuta la acción (consistente con el Objetivo, sección 1, y con que este diseño es estrictamente de solo lectura).

## 10. Criterios de aceptación

1. La Agenda nunca ejecuta un `INSERT`/`UPDATE`/`DELETE` — verificable revisando que ningún hook use `useMutation`.
2. Los números que muestra coinciden exactamente con los de Mis actividades/Verificación/Cronograma para el mismo plan — misma fuente, nunca un cálculo paralelo.
3. Un supervisor puede identificar el sitio más atrasado del día en un vistazo, sin abrir ningún otro módulo.
4. Cada indicador del MVP (sección 8) se justifica contra al menos una pregunta de la sección 6 — si no, no entra al alcance.

## 11. Condición para retirar `ExecutionView` — punto pendiente de confirmar

ADR-0006 fija el mínimo para retirar `ExecutionView.tsx` en **semáforo de cumplimiento + vista Hoy/Semana**. El MVP recién confirmado (sección 8) es **Hoy únicamente** — la vista Semana queda para v2.

Esto deja una tensión sin resolver, no decidida silenciosamente en este documento: ¿el MVP (solo Hoy) ya es suficiente para reemplazar `ExecutionView` en el ribbon (sección 3), dejando la vista Semana como una mejora incremental sobre el reemplazo ya hecho? ¿O `ExecutionView` permanece en el ribbon hasta que la vista Semana también exista, tal como fijó ADR-0006 literalmente?

Mientras no se responda, se asume la lectura literal de ADR-0006 (semáforo + Hoy **y** Semana) — el swap del ribbon (sección 3) no ocurre al cerrar el MVP de la sección 8, sino cuando también exista la vista Semana. Si el dueño del producto prefiere la lectura incremental (swap con Hoy solo), ADR-0006 debe corregirse explícitamente en su sección "Criterio para revisar esta decisión" — no reinterpretarse aquí.
