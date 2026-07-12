# Diseño: Esquema del Acta de Cobro

**Estado: Implementado.** Esquema (`20260727_acta_billing_schema.sql`), generador de borrador (`generate_acta_draft`, `20260728_generate_acta_draft.sql`) y emisión (`issue_acta`, `20260729_issue_acta.sql` + hardening de concurrencia en `20260730_generate_acta_draft_lock_board.sql`) ya están en producción, con 133/133 pgTAP en verde. Pendiente: UI de edición del borrador, PDF, y RLS para las 3 tablas.

Traduce a esquema técnico las reglas ya congeladas en `docs/domain/poa-domain.md` (Regla 7) y `docs/adr/ADR-0003-billing-source.md` ("Mecanismo de emisión del Acta"). No decide ninguna regla de negocio nueva — solo estructura las entidades necesarias para representarlas. Referencia técnica, no un ADR: si algo aquí necesita cambiar, se cambia este documento directamente, sin el proceso de gobernanza de un ADR.

## Entidades

### `Acta`
Documento contractual de facturación. No representa una ejecución ni una versión del POA — es el documento mediante el cual se cobran una o más cantidades previamente certificadas.

| Campo | Notas |
|---|---|
| `id` | |
| `board_id` | |
| `numero` | Consecutivo único del contrato, continuo entre años (hoy: 37). Asignado al emitir, no al crear el borrador. |
| `estado` | `draft` \| `issued` |
| `fecha` | |
| `observaciones` | |
| `generated_by`/`generated_at` | |
| `issued_by`/`issued_at` | Solo se completan al emitir. |

### `ActaItem`
Línea de facturación. No representa una actividad del POA ni una ejecución — representa el cobro de una cantidad determinada de **una** actividad contractual. Referencia exactamente un `poa_activity_id` — dos actividades nunca se combinan en una sola línea, aunque compartan precio o descripción, para no perder el origen contractual exacto (consistente con Regla 14, Origen Único del Cobro).

| Campo | Notas |
|---|---|
| `id` | |
| `acta_id` | |
| `poa_activity_id` | Exactamente una actividad por línea. |
| `descripcion_snapshot` | Congelado al emitir. |
| `unidad_snapshot` | Congelado al emitir. |
| `precio_unitario_snapshot` | Congelado al emitir — mientras el acta es `draft`, se recalcula contra la versión `active` del POA (Regla de negocio central, ADR-0003). |
| `cantidad_facturada` | Suma de sus `ActaItemSource.cantidad_consumida`. |
| `valor_total` | `cantidad_facturada * precio_unitario_snapshot`, congelado al emitir. |

### `ActaItemSource`
De dónde sale la cantidad de una línea. Una línea puede alimentarse de varias ejecuciones (ej. 80 + 20 = 100); una ejecución puede alimentar varias líneas en distintas actas, mientras le quede saldo certificado sin facturar.

| Campo | Notas |
|---|---|
| `id` | |
| `acta_item_id` | |
| `execution_id` (`weekly_plan_item_executions.id`) | |
| `cantidad_consumida` | Porción de la cantidad certificada de esa ejecución que esta línea consume. |

### `Execution` (`weekly_plan_item_executions`, ya existente)
Sin cambios de significado — evidencia certificada de que cierta cantidad fue ejecutada. La ejecución en sí **nunca sabe si fue facturada**; eso vive exclusivamente en `ActaItemSource`, no como una columna en la propia ejecución (se descartó explícitamente una columna simple `billed_in_acta_id` — no representa la facturación parcial entre actas).

## Relación

```
Acta (1) ── (N) ActaItem (1) ── (N) ActaItemSource (N) ── (1) Execution
```

Ejemplo — una línea alimentada por dos ejecuciones:

```
Execution A: cantidad certificada = 80
Execution B: cantidad certificada = 20

Acta 15
  ActaItem "Poda de árboles" — cantidad_facturada = 100
    ActaItemSource → Execution A, cantidad_consumida = 80
    ActaItemSource → Execution B, cantidad_consumida = 20
```

Ejemplo — una ejecución repartida entre dos actas (caso excepcional de cierre contable, Regla 7):

```
Execution A: cantidad certificada = 100

Acta 10
  ActaItem — cantidad_facturada = 30
    ActaItemSource → Execution A, cantidad_consumida = 30
  (Execution A: saldo disponible = 70)

Acta 12
  ActaItem — cantidad_facturada = 70
    ActaItemSource → Execution A, cantidad_consumida = 70
  (Execution A: saldo disponible = 0)
```

## Restricciones

1. Una ejecución solo puede aportar hasta su cantidad certificada — `SUM(ActaItemSource.cantidad_consumida)` agrupado por `execution_id`, a través de todas las actas, nunca supera la cantidad certificada de esa ejecución.
2. Un acta emitida (`estado = 'issued'`) es inmutable — ni `Acta`, ni sus `ActaItem`, ni sus `ActaItemSource` se modifican después de emitir.
3. Los snapshots de `ActaItem` (`descripcion`/`unidad`/`precio_unitario`) nunca se recalculan una vez emitida el acta.
4. El precio unitario de una línea, mientras el acta es `draft`, siempre proviene de la versión `active` del POA en el momento del cálculo (Regla de negocio central, ADR-0003) — no del precio vigente cuando se ejecutó.
5. Una línea (`ActaItem`) puede alimentarse de múltiples ejecuciones.
6. Una ejecución puede alimentar múltiples líneas de acta, en la misma o en distintas actas, mientras le quede saldo certificado sin facturar.
7. Cada `ActaItem` referencia exactamente una `poa_activity` — nunca combina dos actividades contractuales distintas en una sola línea, incluso si comparten precio y descripción.

## Concurrencia

Toda operación que crea o consume el único borrador (`draft`) de un board se serializa mediante `SELECT ... FROM boards WHERE id = board_id FOR UPDATE` sobre la fila correspondiente de `boards` — **ese lock es el mecanismo oficial de sincronización de este subsistema**, no un detalle interno de una función aislada.

Lo comparten hoy `generate_acta_draft()` e `issue_acta()`:

- `issue_acta()` lo toma para calcular `numero` de forma segura bajo concurrencia (mismo patrón que `import_poa_version()` para `poa_versions.version_number`).
- `generate_acta_draft()` lo toma (desde `20260730_generate_acta_draft_lock_board.sql`) por la misma razón que `issue_acta()`, aunque no calcula ningún número: sin el lock, un `SELECT` de "¿ya hay un draft abierto?" podía leer `draft` un instante antes de que otra transacción confirmara la emisión de esa misma acta, devolviendo un `acta_id` que dejaba de ser editable justo después. No corrompía datos (el índice único parcial y los triggers de inmutabilidad ya lo impedían) pero violaba el contrato observable de la API. Serializar ambas funciones sobre el mismo recurso cierra la ventana sin introducir un segundo mecanismo de concurrencia.

**Cualquier función nueva que cree, lea el estado de, o modifique el borrador único de un board** (ej. una futura `cancel_acta_draft()` o `rebuild_acta()`) debe tomar este mismo lock como primer paso, antes de leer o decidir nada sobre `actas`. No introducir un mecanismo de sincronización alternativo (otra tabla de lock, un campo de versión optimista, etc.) sin una razón concreta que el lock de `boards` no pueda cubrir.

## RLS

### Inventario de operaciones por tabla (borrador, previo a las políticas)

Antes de escribir una sola política, el inventario de quién lee y quién escribe cada tabla — para que las políticas refuercen un modelo ya decidido, no lo inventen sobre la marcha:

| Tabla | `SELECT` | `INSERT`/`UPDATE`/`DELETE` directo (rol `authenticated`) | Escritura real | Notas |
|---|---|---|---|---|
| `actas` | Cualquier miembro del board (`get_user_board_role(board_id, auth.uid()) IS NOT NULL`) | **Denegado siempre** — ningún rol, ni `admin`, escribe la tabla directamente | `generate_acta_draft()` / `issue_acta()` (`SECURITY DEFINER`) | Emitida (`issued`) es inmutable por trigger (Commit 3), no por RLS — RLS y el trigger son capas independientes, ambas deniegan. |
| `acta_items` | Cualquier miembro del board (vía `acta_id → actas.board_id`) | **Denegado siempre** | `generate_acta_draft()` (crea las líneas); ajuste de `cantidad_facturada` en un borrador (Commit 4, UI) también deberá ser una función `SECURITY DEFINER` nueva, no un `UPDATE` directo desde la UI | Ni siquiera `admin` actualiza esta tabla por SQL directo — el Commit 4 no introduce una excepción a esta regla, introduce una función más. |
| `acta_item_sources` | Cualquier miembro del board (vía `acta_item_id → acta_items.acta_id → actas.board_id`) | **Denegado siempre** | `generate_acta_draft()` únicamente | Entidad técnica — ningún flujo previsto (ni el editor del Commit 4) expone edición directa de `acta_item_sources`; si un ajuste de cantidad mueve saldo entre fuentes, esa función también recalcula `acta_item_sources`, la UI no. |

**Implicación que este inventario deja explícita para el próximo commit**: como las 3 tablas no aceptan escritura directa de ningún rol, las políticas de escritura no son un "quién puede" graduado por rol — son un cierre total (`WITH CHECK (false)` o ausencia de política de escritura, según cuál sea más legible). Toda la graduación por rol (`admin` vs. resto) ya vive dentro de las funciones `SECURITY DEFINER` (`get_user_board_role(...) != 'admin' THEN RAISE EXCEPTION`), no en RLS — RLS aquí solo necesita resolver lectura.

**Verificado empíricamente (2026-07-12), no solo por metadata**: `generate_acta_draft()` e `issue_acta()` son propiedad de `postgres` (`BYPASSRLS`), `SECURITY DEFINER`, y ninguna de las 3 tablas tiene `FORCE ROW LEVEL SECURITY`. Se confirmó con una prueba de comportamiento (no solo lectura de `pg_proc`/`pg_class`): con una política `WITH CHECK (false)` activa y el rol `authenticated` (sin `BYPASSRLS`), ambas funciones siguieron escribiendo con normalidad, mientras que un `INSERT` directo a `actas` bajo el mismo rol y la misma política sí fue rechazado (control negativo — confirma que la política realmente actuaba).

> **Dependencia arquitectónica.** La escritura de este subsistema depende por completo de que `generate_acta_draft()`, `issue_acta()` y cualquier función de dominio equivalente que se agregue después sigan ejecutándose con un propietario que bypassea RLS (`SECURITY DEFINER` + owner con `BYPASSRLS`, hoy `postgres`) y de que ninguna de las 3 tablas active `FORCE ROW LEVEL SECURITY`. No es una casualidad de configuración de Supabase ni un detalle incidental de esta migración — es una dependencia explícita del diseño. La suite pgTAP (`10_acta_billing_rls.sql`) protege el COMPORTAMIENTO ("las funciones de dominio pueden escribir aunque `authenticated` no tenga permiso directo"), no una configuración puntual — sigue siendo válida aunque cambie el mecanismo interno exacto (ej. ownership, o cómo se otorga el bypass).

### Políticas (mismo patrón ya usado en el resto del dominio POA)

`get_user_board_role(board_id, auth.uid())`. `ActaItem`/`ActaItemSource` heredan el `board_id` a través de `Acta` (sin columna `board_id` propia), mismo precedente verificado que `poa_activity_zones` (ver más abajo).

**Verificado contra el precedente real, no solo por analogía**: `poa_activity_zones` (`20260714_poa_domain_schema.sql`) tampoco tiene `board_id` propio, y su política de RLS ya resuelve una cadena de **tres** JOINs (`poa_activity_zones → poa_activities → poa_versions → poa.board_id`), con índice de soporte en la FK (`idx_poa_activity_zones_activity`) — patrón en producción, cubierto por 88/88 pgTAP. La cadena propuesta aquí es más corta (`Acta` ya trae `board_id` directo, sin depender de subir hasta una tabla raíz): `ActaItem → Acta.board_id` es un solo salto, `ActaItemSource → ActaItem → Acta.board_id` son dos. Al migrar, indexar `ActaItem.acta_id` y `ActaItemSource.acta_item_id` (mismo criterio que el índice ya existente en `poa_activity_zones.poa_activity_id`).

## Qué NO decide este documento

- El mecanismo exacto de generación del borrador automático (qué función SQL, qué trigger) — eso es el Commit 2 (generador) de la secuencia ya acordada.
- La UI de edición del borrador ni el formato del PDF — Commits 3 y 4.
- Si `poa_activity_id` en `ActaItem` debe permitir NULL para casos NP (Novedad de Pago) — `docs/discovery/billing-source-analysis.md`/ADR-0003 dejan NP como supuesto de trabajo no confirmado; este documento no lo resuelve.

## Documentos relacionados
- `docs/domain/poa-domain.md`, Regla 7 — regla de negocio que este esquema traduce.
- `docs/adr/ADR-0003-billing-source.md`, "Mecanismo de emisión del Acta" — decisión de la que este esquema es consecuencia directa.
