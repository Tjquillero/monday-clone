# Diseño: Agenda Operativa

**Estado: Propuesto — usuarios, ubicación, alcance, MVP y roadmap de retiro ya confirmados por el dueño del producto (2026-07-17). Diseño previo a implementación, no construido todavía.**

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

**Excluido del MVP a propósito, no por límite técnico: "Alertas IA".** Decisión explícita del dueño del producto — el motivo no es técnico, es de enfoque. Si el copiloto aparece desde el día uno, la pantalla deja de sentirse como un tablero operativo y pasa a sentirse como "el módulo de IA", deshaciendo el trabajo ya hecho de separar con cuidado lo determinístico de lo sugerido por el modelo (mismo principio que gobernó toda la Fase 5 del copiloto — ver `project_ai_copiloto_v2_vision` en memoria de sesión). Una vez la Agenda esté consolidada y en uso, una sección de observaciones inteligentes puede añadirse como una **capa adicional** sobre la vista ya probada — nunca como el centro de la experiencia desde el arranque.

### Boceto de referencia de la vista Hoy (no es contrato visual, solo estructura de contenido)

```
AGENDA OPERATIVA
──────────────────────────────────────────
🟢 Hoy
✔ Jornadas reportadas
✔ Pendientes de verificar
✔ Sin evidencia
✔ Listas para confirmar
✔ Listas para cerrar
──────────────────────────────────────────
Semáforo (por sitio del board)
🟢 Playa   🟡 Puerto   🔴 Manglares
──────────────────────────────────────────
Acciones
[ Revisar pendientes ] [ Verificar ] [ Confirmar ] [ Cerrar ] [ Ir al Acta ]
──────────────────────────────────────────
Incidencias
• 2 jornadas sin fotos
• 1 plan listo para cerrar
• 3 verificaciones pendientes
```

Cuatro bloques, cada uno trazable 1:1 a un KPI de la tabla de arriba o a un acceso rápido (sección 9) — ninguno introduce un dato que no esté ya en la sección 7 (Fuentes de datos) o la sección 8. "Incidencias" no es un KPI nuevo: es la MISMA información de los tres bloques anteriores, redactada como lista accionable en vez de número — una forma de presentación, no una fuente de datos adicional.

## 9. Accesos rápidos

Parte del MVP, no un extra: cada elemento que señale algo accionable (un sitio atrasado, una jornada sin evidencia, un plan listo para confirmar) enlaza directamente a la pantalla donde se actúa — Verificación, el panel de Confirmación/Cierre dentro de Cronograma, o Costos. La Agenda es el punto de partida, nunca el lugar donde se ejecuta la acción (consistente con el Objetivo, sección 1, y con que este diseño es estrictamente de solo lectura). El bloque "Acciones" del boceto de arriba es la materialización literal de este principio: cada botón navega, ninguno muta datos desde la propia Agenda.

## 10. Criterios de aceptación

1. La Agenda nunca ejecuta un `INSERT`/`UPDATE`/`DELETE` — verificable revisando que ningún hook use `useMutation`.
2. Los números que muestra coinciden exactamente con los de Mis actividades/Verificación/Cronograma para el mismo plan — misma fuente, nunca un cálculo paralelo.
3. Un supervisor puede identificar el sitio más atrasado del día en un vistazo, sin abrir ningún otro módulo.
4. Cada indicador del MVP (sección 8) se justifica contra al menos una pregunta de la sección 6 — si no, no entra al alcance.

## 11. Condición para retirar `ExecutionView` — CONFIRMADO: lectura literal de ADR-0006, sin modificarlo

ADR-0006 fija el mínimo para retirar `ExecutionView.tsx` en **semáforo de cumplimiento + vista Hoy/Semana**. El MVP confirmado (sección 8) es **Hoy únicamente** — por lo tanto, terminar el MVP **no** dispara el swap del ribbon (sección 3) ni el retiro de `ExecutionView`.

Decisión explícita del dueño del producto, con su razón registrada (no solo el resultado): ADR-0006 **no se modifica ahora** para ajustarlo al MVP. El ADR define el estado final de la arquitectura (cuándo `ExecutionView` deja de tener motivo de existir); este documento define el plan para llegar ahí. Mezclar ambos —adaptar el ADR a cada hito intermedio— dejaría, dentro de unos meses, la duda de si `ExecutionView` debía seguir existiendo o si la Agenda simplemente nunca se terminó. La vista Hoy es un **hito intermedio**, no el reemplazo definitivo.

`ExecutionView.tsx` permanece en el ribbon durante la Fase 1 y la Fase 2 (sección 12) — visible, funcional, pero marcado como legacy en la propia UI (ver Fase 1 abajo) para que quien lo abra sepa que está en transición, no que fue olvidado.

**Sobre el estado del ADR:** no hace falta un estado nuevo fuera de los cuatro que ya define `docs/adr/README.md` (Propuesto/Aceptado/Reemplazado/Obsoleto). ADR-0006 permanece **Aceptado** durante todo el roadmap — ya es la lectura correcta hoy (rige la decisión vigente) y sigue siéndolo en la Fase 3, cuando la decisión se cumple: un ADR aceptado no cambia de estado por haberse implementado, solo cuando una decisión posterior lo reemplaza u obsoletiza. Si al llegar a la Fase 3 se prefiere dejar constancia explícita de que ya se ejecutó, se agrega una nota de actualización fechada dentro del propio ADR-0006 (mismo patrón que ya usa `ADR-0003`), no un estado nuevo en la taxonomía del proyecto.

## 12. Roadmap de retiro — CONFIRMADO

**Fase 1 — MVP — COMPLETA (2026-07-17, commits `15917f1`/`b05ee24`/`1303c25`, pusheados):**
- Agenda Operativa: vista Hoy, semáforo, evidencia pendiente, planes listos para confirmar, planes listos para cerrar, accesos rápidos. RPC `get_board_operational_agenda` verificada (17 aserciones) + E2E real en navegador (semáforo con datos reales, deep-link Agenda→Cronograma→`PlanLifecyclePanel` funcionando de punta a punta).
- `ExecutionView` permanece disponible, marcado explícitamente como **Legacy** en su propia UI (banner "Vista en transición" + enlace a la Agenda beta) — un aviso visible indicando que será reemplazado, no un retiro silencioso ni una promesa sin fecha.

**Fase 2 — Semana — COMPLETA (2026-07-17):**
- Vista Semana construida sobre el mismo modelo de datos (sección 7) y el mismo filtro de diseño (sección 6): `get_board_operational_agenda_week`, semáforo semanal por sitio (`pct_verified_week`) y tira de 5 días (lunes-viernes) marcando `has_activity`. Toggle Hoy/Semana en la propia Agenda, sin selector de semanas anteriores (guardrail respetado). Verificada en tres capas: 9 aserciones pgTAP (`24_board_operational_agenda_week.sql`), verificación manual PL/pgSQL contra la base real, y E2E en navegador (`scripts/e2e/verify-agenda-operativa.cjs`, extendido) con captura de pantalla confirmando el semáforo y la tira de días con datos reales sembrados en dos días distintos de la semana.
- Se valida explícitamente que la Agenda ya responde las seis "preguntas operativas" de la sección 6 — no se asume, se confirma una por una.
- **Criterio de aceptación objetivo (matriz, no impresión subjetiva)** — reemplaza "comparar contra ExecutionView" por una verificación explícita, capacidad por capacidad:

  | Funcionalidad | ExecutionView | Agenda | Resultado |
  |---|---|---|---|
  | Estado operativo diario | ✅ | ✅ (Fase 1) | Cubierto |
  | Estado semanal | ✅ | ✅ (Fase 2) | Cubierto |
  | Semáforo | ✅ | ✅ (Fase 1) | Cubierto |
  | Evidencia pendiente | ❌ | ✅ (Fase 1) | Mejorado |
  | Planes listos para confirmar | ❌ | ✅ (Fase 1) | Mejorado |
  | Planes listos para cerrar | ❌ | ✅ (Fase 1) | Mejorado |
  | Navegación al flujo correcto (deep-links) | ❌ | ✅ (Fase 1) | Mejorado |
  | KPIs operativos (reportadas/verificadas/pendientes) | ❌ | ✅ (Fase 1) | Mejorado |

  **Deliberadamente solo funciones operativas — ninguna capacidad de IA en esta matriz, ni siquiera mencionada.** El criterio de retiro de `ExecutionView` depende exclusivamente de si la Agenda cubre las necesidades operativas que hoy obligan a abrirlo, no de si integra el copiloto. Las capacidades de IA (Gemini, evaluación de evidencia, duplicados, observaciones) pertenecen a **otro eje de evolución del producto** (ver `docs/AI_COPILOT_V2_VISION.md`) — ya viven en sus módulos correspondientes y no forman parte de esta comparación. Si algún día se decide integrarlas a la Agenda, es una Fase posterior con su propio contrato y su propio criterio de aceptación — nunca mezclada con el retiro del módulo legacy.

- **Guardrail de alcance para toda la Fase 2 (principio explícito del dueño del producto):** la Agenda responde una sola pregunta — *"¿qué debo atender hoy?"*. No se agregan gráficos, tendencias, comparativos mensuales ni KPIs históricos dentro de la propia Agenda; cualquier análisis más profundo abre el módulo especializado correspondiente (Cronograma, Costos, Reportes). Este guardrail es el mismo filtro de la sección 6, reafirmado para que la vista Semana no se convierta en un "superdashboard" — el riesgo concreto es que la Agenda termine compitiendo con Cronograma/Costos en vez de enrutar hacia ellos.

**Fase 3 — Retiro:**
- **Auditoría de uso real, ANTES de borrar código** (paso nuevo, evita reabrir el módulo una semana después): confirmar que ningún flujo operativo depende todavía de `ExecutionView` — enlaces desde otros módulos hacia `?view=execution`, marcadores/accesos guardados por usuarios reales, permisos específicos atados a esa vista, documentación o manuales que la mencionen, scripts E2E (`scripts/e2e/*.cjs`) y pruebas automatizadas (`*.test.tsx`) que la ejerciten.
- Solo cuando la Fase 2 esté validada Y la auditoría de uso real no encuentre dependencias: se retira `ExecutionView.tsx` del ribbon, se elimina su código (`execution/*`, `DailyAgendaPanel.tsx`, `PersonnelPicker.tsx` si nada más lo usa) y la documentación asociada.
- ADR-0006 se actualiza con una nota fechada confirmando el cumplimiento (ver sección 11) — no se reemplaza ni se marca "Obsoleto": la decisión sigue siendo válida, ya se ejecutó.
