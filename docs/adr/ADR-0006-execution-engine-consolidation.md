# ADR-0006 — Consolidación del Motor de Ejecución: `ExecutionView` deja de ser el motor operativo

## Estado
Aceptado

## Fecha
2026-07-17

## Contexto

Una auditoría del flujo operativo completo (Cronograma → Mis actividades → Captura → Fotos → Verificación → Confirmación → Cierre → Acta, ver ADR-0002 y ADR-0003) encontró que la pestaña **"Ejecución"** del ribbon (`?view=execution`, `ExecutionViewContainer` → `ExecutionView.tsx`) — el nombre que un supervisor o director abriría primero para ver el avance del día — **no participa del flujo real**. Lee y escribe `item.values['daily_execution']`, `item.values['verification_gallery']` y `item.values['operador']`: JSONB suelto en la tabla `items`, sin relación alguna con `weekly_plans`, `weekly_plan_item_executions`, `execution_attachments` ni las funciones de dominio (`report_execution`, `verify_execution`, `confirm_weekly_plan`, `close_weekly_plan`).

Mientras tanto, desde Fase 5 en adelante, el motor real evolucionó exclusivamente alrededor de esas tablas: jornadas con offline-first, evidencia fotográfica con fases y hash, verificación del supervisor, y — cerrado en la sesión inmediatamente anterior a este ADR — Confirmación y Cierre del plan, que finalmente conectan la operación con la generación del Acta. `ExecutionView` quedó congelado antes de que empezara esa evolución y nunca se reconectó.

Una segunda auditoría, esta vez funcional (no solo técnica), confirmó que `ExecutionView` no es pura deuda técnica sin valor: contiene una capacidad — una agenda operativa mensual/semanal con semáforo de cumplimiento — que **no tiene equivalente** en el flujo nuevo. El inventario completo:

| Funcionalidad de `ExecutionView` | ¿Existe en el motor real? | Dónde vive |
|---|---|---|
| Captura de jornadas | ✅ | Mis actividades (`weekly_plan_item_executions`) |
| Fotos de evidencia | ✅ | `execution_attachments` |
| Verificación del supervisor | ✅ | Verificación |
| Evaluación de evidencia con IA | ✅ | Copiloto Fase 5 |
| Observaciones de la jornada | ✅ | `JornadaForm` → campo "Notas" → `weekly_plan_item_executions.notes` |
| Capacidad diaria por sitio | ✅, y más precisa | `useWeeklyPlan.ts` → `src/lib/siteCapacity.ts` (capacidades reales por nombre de sitio del contrato). La copia local de `ExecutionView` (`execution/utils.ts`) es una tabla genérica por categoría, y además está rota: festivos hardcodeados solo hasta 2025 |
| Asignación de operador (vínculo a `personnel.id` + tarifa) | ❌ | — (verificado: `personnel.default_rate` no alimenta ningún cálculo financiero activo hoy, fuera de `PersonnelManagement.tsx`) |
| **Agenda operativa mensual/semanal** (semáforo de 7 días, vista "Hoy"/"Semana", % verificado cruzando sitios) | ❌ | — |

## Decisión

1. **`ExecutionView.tsx` deja de considerarse el motor operativo.** No se agregará ninguna lógica nueva de captura, fotos, verificación o cierre a ese componente ni a `execution/utils.ts`. El motor operativo vigente es, exclusivamente, `weekly_plans` → `weekly_plan_item_executions` → `execution_attachments`, gobernado por las funciones de dominio ya congeladas (`report_execution`, `verify_execution`, `reject_execution`, `confirm_weekly_plan`, `close_weekly_plan`).

2. **`ExecutionView.tsx` NO se retira todavía.** Permanece accesible en la pestaña "Ejecución" del ribbon, sin cambios, como referencia de una capacidad aún sin reemplazo (la agenda operativa) — no como red de seguridad general ni por costumbre. Retirarlo hoy dejaría a los supervisores sin una vista que usan a diario (calendario de cumplimiento) sin ofrecerles un sustituto.

3. **La brecha de "Operador" (asignación estructurada a `personnel`) no se migra.** Se investigó explícitamente antes de descartarla, no se ignoró por omisión: `default_rate` no tiene ningún consumidor financiero activo hoy. Si en el futuro aparece un caso de negocio real que lo necesite, se diseña como una capacidad nueva sobre `weekly_plan_item_executions.crew_leader_id` (ya existe en el tipo, sin UI) — no se reintroduce el `PersonnelPicker` legacy.

4. **La agenda operativa, cuando se construya, es una vista — nunca un almacén.** Se alimenta exclusivamente por lectura de `weekly_plans`, `weekly_plan_item_executions`, `execution_attachments` y el estado de verificación — nunca escribe, nunca mantiene su propia copia de `daily_execution` ni de ningún otro dato. No se reutiliza el componente `DailyAgendaPanel.tsx` actual: nace acoplado al modelo JSONB legacy, y reutilizarlo arrastraría esa dependencia durante años, exactamente el patrón que produjo este ADR. Se diseña como un incremento nuevo, con su propio contrato, cuando se decida construirlo.

5. **`ExecutionView.tsx` se retira definitivamente solo cuando la agenda operativa nueva exista y cubra la necesidad funcional** (semáforo de cumplimiento, vista Hoy/Semana, % verificado por sitio). Hasta entonces, este ADR es la señal explícita de que su presencia en el ribbon es temporal y con fecha de vencimiento condicionada, no indefinida.

## Alternativas consideradas

- **Retirar `ExecutionView` de inmediato.** Descartada: perdería la única vista de calendario operativo sin sustituto, imponiendo al usuario un retroceso funcional a cambio de una mejora de arquitectura que él nunca pidió.
- **Migrar `DailyAgendaPanel` tal cual, adaptando sus queries al nuevo modelo.** Descartada explícitamente por el dueño del producto: el componente nace sobre `item.values['daily_execution']`; adaptar sus queries sin rediseñar su contrato arrastraría los mismos supuestos legacy bajo una fuente de datos distinta — el mismo error que ya costó que `ExecutionView` quedara desconectado la primera vez.
- **Mantener `ExecutionView` indefinidamente "por si acaso".** Descartada: sin una condición explícita de retiro, se convierte permanentemente en un segundo sistema paralelo — el riesgo que este mismo ADR existe para evitar.

## Consecuencias

- Cualquier propuesta futura de agregar funcionalidad de captura/verificación/cierre a `ExecutionView.tsx` debe rechazarse o redirigirse al motor real — este ADR es el criterio explícito para esa decisión.
- La pestaña "Ejecución" del ribbon (`src/config/navigation.ts`) no cambia de nombre, posición ni destino todavía — esa decisión de navegación queda fuera de alcance de este ADR, pendiente hasta que exista la agenda operativa (ver "Próximos pasos" en la memoria de sesión asociada).
- Construir la agenda operativa es ahora un incremento de **visibilidad operacional**, no de dominio — a diferencia de POA, Actas, Certificación, IA y Verificación (todos incrementos de reglas de negocio), este responde preguntas de "¿qué está pasando?" sin agregar ninguna regla nueva. No requiere cambios en `confirm_weekly_plan`, `close_weekly_plan` ni `generate_acta_draft`.
- `execution/utils.ts` y `DailyAgendaPanel.tsx` quedan explícitamente marcados como código a no extender ni reutilizar — se documentan aquí en vez de solo comentarse en el código, para que la próxima persona que toque este archivo entienda por qué sigue existiendo sin recibir mantenimiento.

## Documentos afectados
- `docs/adr/README.md` — se agrega este ADR al índice.
- Ninguna migración ni cambio de código acompaña este ADR — es una decisión de arquitectura pura, previa al diseño de la agenda operativa.

## Criterio para revisar esta decisión

Este ADR se da por cumplido (y `ExecutionView.tsx` se retira) cuando la agenda operativa nueva cubra, como mínimo, el semáforo de cumplimiento por sitio y la vista "Hoy"/"Semana" — no antes. Si durante el diseño de esa agenda aparece una necesidad real de asignación estructurada de operador (contradiciendo el punto 3), este ADR se corrige explícitamente en esa sección, no se reinterpreta en el código.
