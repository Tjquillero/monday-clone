# Diseño: Agenda Operativa

**Estado: Propuesto — diseño previo a implementación, no construido todavía.**

Continuación de [ADR-0006](../adr/ADR-0006-execution-engine-consolidation.md), que congeló la condición de retiro de `ExecutionView.tsx`: existe hasta que esta agenda cubra lo que hoy solo `ExecutionView` ofrece (semáforo de cumplimiento, vista Hoy/Semana). Este documento responde las preguntas de negocio antes de escribir código — no es un ADR (no reemplaza una decisión de arquitectura existente) ni un documento de dominio (menciona tablas). Sigue el mismo formato que `execution-certification-design.md`.

**Límite explícito:** este diseño es de solo lectura. No agrega ninguna regla de negocio, no toca `confirm_weekly_plan`/`close_weekly_plan`/`generate_acta_draft`, y no introduce ninguna tabla ni columna nueva — es una vista sobre datos que el motor real ya produce.

---

## 1. Objetivo

Que un supervisor o un administrador pueda responder, sin navegar entre pantallas, las preguntas que hoy exigen abrir Mis actividades, Verificación y Cronograma por separado — y cruzar mentalmente lo que cada una muestra. La Agenda Operativa no reemplaza esas pantallas (siguen siendo donde se actúa); es donde se **mira** antes de decidir a cuál de ellas ir.

## 2. Usuarios (propuesto — a confirmar)

Se propone acotar a los dos roles de `BoardRole` que ya tienen motivo real para ver el estado agregado de la operación, no solo su propia tarea:

- **Supervisor** — hoy solo ve, en Verificación, la bandeja de jornadas `reported` pendientes de su acción. No tiene ninguna vista de lo que YA se verificó ni de cómo va el sitio en conjunto.
- **Administrador / Asistente** — hoy ven el Cronograma por sitio y semana (uno a la vez) y Costos, pero no una vista consolidada de "qué está pasando hoy" antes de llegar al punto de Confirmar/Cerrar un plan.

**Fuera de alcance a propósito:** el Líder. Ya tiene su vista (Mis actividades), acotada a sus propias jornadas — una agenda cruzando sitios no resuelve ninguna pregunta que él necesite responder.

**Pregunta abierta:** ¿"director de operaciones" es el rol `admin`/`assistant` ya existente, o es una persona sin cuenta en el sistema hoy (revisaría el reporte en papel/Excel)? Si es lo segundo, esta agenda sería su primera superficie real en la aplicación — vale la pena confirmarlo porque cambia qué tan permisivo debe ser el acceso.

## 3. Preguntas que responde

Tomadas directamente de esta conversación — no inventadas para este documento:

- ¿Qué actividades comenzaron hoy?
- ¿Quién está trabajando (qué cuadrillas siguen activas)?
- ¿Qué evidencia existe y qué falta?
- ¿Qué quedó pendiente (de verificar, de ejecutar)?
- ¿Qué sitios están atrasados?
- ¿Qué porcentaje del mes/semana está ejecutado y verificado?
- ¿Qué días quedaron sin trabajo?

Siete preguntas, no una lista abierta — cualquier indicador que se proponga después debe justificarse contra una de estas o quedar fuera del alcance de la primera versión.

## 4. Fuentes de datos (cerradas — sin ambigüedad)

Únicamente lectura, únicamente estas cuatro fuentes, ya existentes:

| Fuente | Qué aporta |
|---|---|
| `weekly_plans` | Plan por sitio/semana, `status` (para saber si un sitio todavía tiene trabajo abierto) |
| `weekly_plan_items` | Actividad planificada, `planned_qty`, para comparar contra lo ejecutado |
| `weekly_plan_item_executions` | Jornadas reales: `execution_date`, `status` (draft/reported/verified/rejected), `crew_name`, `executed_qty`, `verified_at` |
| `execution_attachments` | Evidencia — existencia y `phase` (antes/después) por ejecución |

**Explícitamente NO:** `item.values`, `daily_execution`, `verification_gallery`, ni ninguna columna de `items` — esa es la fuente que este mismo incremento existe para dejar de usar (ver ADR-0006).

Reutiliza, no reimplementa: el gate de evidencia ya tiene su lógica resuelta en `get_executions_without_evidence` (RPC del copiloto, v2.1) — la Agenda debería llamarla o replicar su misma consulta, nunca definir un segundo criterio de "qué cuenta como evidencia faltante".

## 5. KPIs y semáforos (propuesto)

| KPI | Cálculo | Responde |
|---|---|---|
| % verificado (día / semana / sitio) | `verified` ÷ (`verified`+`reported`+`rejected`) de las ejecuciones del período | "¿cómo va el mes/semana?" |
| Semáforo de cumplimiento | mismos umbrales ya validados en `DailyAgendaPanel` (≥80% verde, ≥50% ámbar, <50% rojo) — se reutiliza el criterio, no el componente | "¿qué sitios están atrasados?" |
| Cuadrillas activas hoy | `crew_name` distintos con una ejecución de `execution_date = hoy` | "¿quién está trabajando?" |
| Jornadas sin evidencia | `get_executions_without_evidence` (ya existe, sin cambios) | "¿qué evidencia falta?" |
| Jornadas pendientes de verificar | mismo criterio que la bandeja de Verificación (`status = 'reported'`) | "¿qué quedó pendiente?" |
| Días sin trabajo | días del período sin ninguna `weekly_plan_item_execution` para un sitio con plan `published`/`in_progress` | "¿qué días quedaron sin trabajo?" |

Ninguno de estos KPIs requiere una columna o tabla nueva — todos se derivan de datos que el motor ya escribe por su cuenta durante el flujo normal (Mis actividades, Verificación).

## 6. Criterios de aceptación (propuesto)

1. La Agenda nunca ejecuta un `INSERT`/`UPDATE`/`DELETE` — verificable revisando que ningún hook use `useMutation`.
2. Los números que muestra coinciden exactamente con los de Mis actividades/Verificación para el mismo plan — misma fuente, nunca un cálculo paralelo.
3. Un supervisor puede identificar el sitio más atrasado del día en un vistazo, sin abrir ningún otro módulo.
4. Cubre, como mínimo, semáforo de cumplimiento + vista Hoy/Semana (la condición de retiro de `ExecutionView` fijada en ADR-0006).

## 7. Condición para retirar `ExecutionView` (heredada de ADR-0006, sin cambios)

Cuando esta agenda cumpla el criterio de aceptación 4, `ExecutionView.tsx` se retira. No antes.

## 8. Preguntas abiertas — a confirmar antes de implementar

1. **Rol "director"** (sección 2): ¿es `admin`/`assistant` ya existente, o una persona sin cuenta hoy?
2. **Ubicación en la navegación**: ¿pestaña nueva del ribbon, entrada nueva del sidebar (como Verificación), o reemplaza el destino de la pestaña "Ejecución" directamente una vez lista? `navigation.ts` sigue congelado — cualquier respuesta requiere aprobación explícita antes de tocarlo.
3. **Alcance**: ¿todos los boards/sitios visibles para el usuario a la vez (como Mis actividades/Verificación), o un board a la vez (como Cronograma)?
4. **Prioridad de alcance temporal**: ¿la vista diaria (Hoy) es el MVP y semana/mes vienen después, o hay que cubrir las tres desde la primera versión?

Mientras estas cuatro no se respondan, este documento se trata como propuesta reversible, no como contrato congelado — mismo criterio que ya usa el proyecto en `ADR-0003`, sección "Puntos pendientes de confirmación".
