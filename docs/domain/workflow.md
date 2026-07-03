# Flujo de estados del ciclo semanal — CONTRATO CONGELADO

**Fuente de verdad:** `supabase/migrations/20260709_weekly_plans_nucleus.sql`
(funciones `SECURITY DEFINER` + triggers + RLS) y su especificación ejecutable
`supabase/tests/01_state_machine.sql` (45 tests pgTAP).

Este documento describe lo que la base de datos **ya hace cumplir**. No es una
propuesta. Agregar, renombrar o "completar" un estado (`approved`, `completed`,
etc. "porque parecía lógico") requiere: decisión de dominio explícita +
migración + tests pgTAP + actualización de este documento, en el mismo cambio.

---

## Máquina 1 — Plan semanal (`weekly_plans.status`)

```
draft ──publish──▶ published ──(auto)──▶ in_progress ──confirm──▶ confirmed ──close──▶ closed
                      └──────────────confirm──────────────┘

cancelled: declarado en el CHECK, SIN transición implementada (ver nota).
```

| Transición | Quién | Mecanismo | Reglas / efectos |
|---|---|---|---|
| `draft → published` | admin, assistant | RPC `publish_weekly_plan` | Sella `published_by/at`. |
| `published → in_progress` | **automática** | trigger `fn_auto_set_plan_in_progress` | Se dispara al insertar la **primera ejecución**. Nadie la llama a mano. |
| `published \| in_progress → confirmed` | admin, assistant | RPC `confirm_weekly_plan` | **Gate:** 0 ejecuciones en `reported` — el supervisor debe verificar o rechazar todo antes. Sella `confirmed_by/at`. |
| `confirmed → closed` | **solo admin** | RPC `close_weekly_plan` | **Efecto:** genera `activity_performance_observations` (`observed_rendimiento = executed_qty / executed_jr`) por cada item con `executed_jr > 0`; idempotente vía `NOT EXISTS`. Sella `closed_by/at`. Alimenta el siguiente ciclo de planificación. |

- Los **items** del plan (`replace_weekly_plan_items`) solo se pueden modificar
  con el plan en `draft` (RLS).
- **`cancelled`**: existe en el CHECK constraint como estado previsto para
  "plan abortado", pero **ninguna función implementa la transición**. Es
  inalcanzable a propósito. Quien lo necesite debe diseñar su función
  (¿quién puede cancelar? ¿desde qué estados? ¿qué pasa con las ejecuciones?)
  — no insertar el estado a mano.

## Máquina 2 — Jornada / ejecución (`weekly_plan_item_executions.status`)

```
(insert) ──▶ draft ──report──▶ reported ──verify──▶ verified   (TERMINAL)
               ▲                   │
               │                   └──reject──▶ rejected       (TERMINAL)
           editable                              │
        (solo el creador)                        ▼
                                   corrección = NUEVA ejecución en draft
```

| Transición | Quién | Mecanismo | Reglas / efectos |
|---|---|---|---|
| insertar (`→ draft`) | leader, assistant, admin | INSERT (RLS) | Solo si el plan está en `published` o `in_progress`. `executed_jr` es **columna generada** (trabajadores × duración / 8 h): la UI nunca la calcula. |
| editar en `draft` | creador | UPDATE (RLS + guard) | Solo mientras `status = 'draft'`. |
| `draft → reported` | creador; admin y assistant pueden reportar de cualquiera | RPC `report_execution` | Diseño deliberado: el assistant actúa como coordinador y puede reportar por un líder sin conectividad (comentario en la función; si el negocio cambia, se ajusta allí). |
| `reported → verified` | supervisor, admin | RPC `verify_execution` | Sella `verified_by/at`. **Terminal.** |
| `reported → rejected` | supervisor, admin | RPC `reject_execution` | `rejection_notes` **obligatorio**. **Terminal**: no hay re-reporte; el líder ve el motivo y registra una **nueva** ejecución corregida (comentario en la función). |

- **Agregados del item** (`fn_sync_plan_item_totals`): `executed_qty` y
  `executed_jr` del item suman **solo** ejecuciones en `reported` + `verified`.
  Los borradores y las rechazadas **no cuentan** para el avance.

## Roles y superficies

| Rol (`get_user_board_role`) | Superficie | Acciones del ciclo |
|---|---|---|
| assistant | Cronograma (ribbon) | crear plan, guardar items, publicar, confirmar; puede reportar por un líder |
| leader | Mis actividades (sidebar, `/my-work`) | crear jornada, editar borrador, reportar |
| supervisor | Verificación (sidebar, **pendiente de construir**) | verificar, rechazar |
| admin | todas | todo lo anterior + cerrar el plan |
| viewer | lectura | ninguna transición |

La UI **no** muestra controles de transiciones ajenas al rol de la superficie
(p. ej. verificar/rechazar no aparecen en Mis actividades), aunque la base los
rechazaría igualmente: la separación en UI evita confusión y errores de permiso.

## Ciclo completo

```
Asistente        draft → published                    (Cronograma)
Líder            jornadas: draft → reported           (Mis actividades)
  (trigger)      plan: published → in_progress
Supervisor       reported → verified | rejected       (Verificación)
Asistente        plan → confirmed  (gate: 0 reported)
Admin            plan → closed → observaciones de rendimiento
                 └──▶ alimentan la planificación de la siguiente semana
```
