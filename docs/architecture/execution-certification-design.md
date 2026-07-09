# Diseño: Ejecución Certificada

**Estado: Propuesto — diseño previo a implementación, no construido todavía.**

Responde las cinco preguntas planteadas antes de escribir código. No es un ADR (no hay una decisión de arquitectura que reemplace algo existente) ni un documento de dominio (menciona tablas). Es la base para ampliar `execution-domain.md` (sección "Evidencias", hoy Fuera de Alcance) y actualizar `docs/architecture/schedule-mapping.md`/`workflow.md` cuando se implemente.

**Límite explícito:** este diseño llega hasta el punto en que un período cerrado queda listo para alimentar un Acta. No diseña la estructura del Acta ni decide qué pasa con la facturación histórica — eso depende de la decisión de negocio pendiente en `docs/discovery/billing-source-analysis.md`.

---

## Revisión: no hace falta ninguna entidad nueva

La primera versión de este diseño proponía dos tablas nuevas (`execution_certifications`, `execution_certification_items`) para representar la certificación. Al revisar el modelo ya congelado en `workflow.md`, esa complejidad no es necesaria: **el ciclo de vida ya existente cubre exactamente esto**, con una sola regla de validación adicional.

- **`verified`** (ya existe, Máquina 2 de `workflow.md`): el supervisor certifica **la ejecución** — actividad por actividad, Jornada por Jornada. Esto ya es la certificación operativa.
- **`closed`** (ya existe, Máquina 1 de `workflow.md`): el administrador cierra **el período** — declara que el conjunto de ejecuciones ya certificadas por el supervisor pasa a formar parte del ciclo administrativo (acta / informe). No es un sinónimo de "certificación"; es el acto administrativo que se apoya en ejecuciones ya certificadas para consolidar el período.

El flujo propuesto, sin entidades nuevas (los pasos "Sube evidencia" y el gate en `confirm` todavía no existen; el resto ya está construido y congelado en `workflow.md`):

```
POA
 └── Plan Semanal
      └── Líder ejecuta
           └── Sube evidencia (fotos)                — propuesto
                └── Supervisor → verified              — ya existe
                     └── Admin → confirm (gate propuesto: evidencia)
                          └── Admin → close             — ya existe
                               └── Acta      (fuera de alcance de este diseño)
                                    └── Factura
```

---

## 1. ¿Qué es la certificación?

No es una entidad — es el efecto combinado de dos transiciones que ya existen y ya están congeladas:

1. `reported → verified` (Máquina 2): el supervisor certifica que una Jornada específica ocurrió como se reportó. **Requisito propuesto**: además de lo que ya valida, se propone exigir al menos una evidencia adjunta antes de que el período que la contiene pueda avanzar (ver punto 5).
2. `confirmed → closed` (Máquina 1, solo admin): consolida el período. Ya genera `activity_performance_observations`; es el punto natural donde, en el futuro, se dispare la generación del Acta.

## 2. Estados

Ninguno nuevo. Se reutilizan:
- `weekly_plan_item_executions.status`: `draft → reported → verified | rejected` (sin cambios).
- `weekly_plans.status`: `draft → published → in_progress → confirmed → closed | cancelled` (sin cambios).

## 3. Tablas nuevas

Ninguna.

- **Ejecución certificada** = `weekly_plan_item_executions` en `verified`, cuyo `plan_id` está en `weekly_plans.status = 'closed'`. No requiere una tabla puente: la relación ya existe (`plan_item_id → weekly_plan_items → plan_id → weekly_plans`).
- **Evidencia** = `entity_attachments` (ya existe, huérfana del módulo `work_orders` eliminado, RLS deny-by-default sin políticas, cero consumidores en `src/`). Se propone reactivarla con `entity_type = 'weekly_plan_item_execution'`, `entity_id = weekly_plan_item_executions.id`, y políticas RLS vía `get_user_board_role` (mismo patrón que el resto de tablas del ciclo semanal). La evidencia se ataría **a la ejecución individual**, no a un concepto de "certificación" separado.

## 4. Qué información consume del POA / catálogo

Sin cambios respecto al diseño anterior: cuando se implemente la generación del Acta (fuera de alcance aquí), leerá `poa_activities.precio_unitario`, `poa_activity_zones.cantidad_contratada` y `activity_key` a través de `weekly_plan_items.poa_activity_zone_id` — nunca de un `item_id` genérico del tablero (Regla 14 de `poa-domain.md`, Origen Único del Cobro).

## 5. El único cambio funcional propuesto: gate de evidencia en `confirm_weekly_plan`

`confirm_weekly_plan` (`in_progress|published → confirmed`) ya tiene un gate: 0 ejecuciones en `reported` sin verificar. Se propone añadir un segundo gate del mismo tipo, no una tabla ni un estado nuevo:

> Toda ejecución en estado `verified` de este plan debería tener al menos una evidencia (`entity_attachments`) adjunta. Si alguna no la tiene, `confirm_weekly_plan` rechazaría con:
> **"No es posible confirmar el plan semanal porque existen ejecuciones verificadas sin evidencia fotográfica."**

Regla de suficiencia propuesta: **al menos una evidencia por ejecución** (no por actividad, no un mínimo configurable) — es la que mantendría el sistema simple y la que el flujo operativo descrito (el líder sube fotos al ejecutar) ya sustenta de forma natural.

Este cambio, de implementarse, modificaría una función ya congelada en `workflow.md` (el gate de `confirm_weekly_plan`), por lo que correspondería actualizar `workflow.md` y sus tests pgTAP (`supabase/tests/01_state_machine.sql`) en el mismo cambio que la migración — tal como su propio encabezado exige.

## 6. Cómo se conectaría con el Acta (límite del diseño)

Cuando un plan llegue a `closed`, sus ejecuciones `verified` (con evidencia garantizada, si el gate del punto 5 se implementa) quedarían disponibles como fuente para una futura Acta. Este diseño no define esa estructura — depende de la decisión de negocio pendiente en `docs/discovery/billing-source-analysis.md`.

---

## Próximo paso

Si este diseño se aprueba para implementación, el trabajo sería acotado: reactivar `entity_attachments` con RLS para `weekly_plan_item_execution`, UI de carga de fotos en "Mis actividades" (líder), y el gate de evidencia en `confirm_weekly_plan` + actualización de `workflow.md`/pgTAP en el mismo cambio.
