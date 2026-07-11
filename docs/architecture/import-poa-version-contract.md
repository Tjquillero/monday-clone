# Contrato: `import_poa_version()` — especificación de la puerta de entrada a la persistencia del POA

**Estado: Vigente — describe el comportamiento real de la función tal como quedó implementada al cierre del Incremento 5** (`supabase/migrations/20260721_import_poa_version.sql` a `20260725_import_poa_version_zones_and_activation.sql`, commits `f3b5384`, `e77a077`, `50ae856`, `7f919e3`).

Este documento no es una guía del parser ni del Excel — es la especificación del endpoint de persistencia en sí. `import_poa_version()` es, desde el cierre del Incremento 5, **la única forma de crear una versión del POA**. RLS no permite ningún INSERT/UPDATE/DELETE directo sobre `poa_versions`, `poa_activities` ni `poa_activity_zones` — ver [`import-poa-version-contract.md#rls`](#rls-y-superficie-de-escritura) abajo. Cualquier consumidor futuro (UI de importación, un CLI, un proceso batch, una integración con otra fuente de datos que no sea el Excel) debe tratar esta función como un contrato estable: cambios en su firma, en las reglas de activación/cierre, en la atomicidad, en la idempotencia o en la estructura del JSON de entrada requieren una decisión explícita de arquitectura (ADR o equivalente), no un ajuste silencioso "porque la UI lo necesita".

---

## Firma

```sql
import_poa_version(
  p_poa_id              UUID,
  p_activities          JSONB,
  p_import_operation_id UUID DEFAULT NULL
) RETURNS UUID  -- id de la poa_version resultante
```

`SECURITY DEFINER`, mismo patrón que `replace_weekly_plan_items`/`report_execution`. Autorización verificada en código (`can_manage_poa`, basada en `auth.uid()`), no en RLS de la tabla — funciona igual sin importar el rol de Postgres con el que se llame.

---

## Campos obligatorios y tipos

### `p_poa_id` (obligatorio)
UUID de un `poa` existente (`public.poa.id`). No puede ser `NULL`.

### `p_activities` (obligatorio)
Array JSON. Puede ser `[]` (una versión sin ninguna actividad contratada es válida — se crea y se activa igual). Cada elemento:

| Campo | Tipo JSON | Obligatorio | Restricción |
|---|---|---|---|
| `activity_key` | string | Sí | Cualquier valor no nulo — la función NO valida contra el catálogo técnico; esa validación ya ocurrió en `src/lib/poaImport/validate.ts` antes de llegar aquí |
| `precio_unitario` | number | Sí | `NOT NULL`, `CHECK (precio_unitario >= 0)` a nivel de tabla — un valor negativo o ausente aborta toda la importación |
| `frecuencia` | number | Sí | `NOT NULL`, `CHECK (frecuencia > 0)` a nivel de tabla |
| `zonas` | array | Sí | **No puede ser `[]`** — toda actividad debe traer al menos una zona, o la función la rechaza explícitamente (ver Errores esperables) |

Cada elemento de `zonas`:

| Campo | Tipo JSON | Obligatorio | Restricción |
|---|---|---|---|
| `group_id` | string (UUID) | Sí | Debe ser un `groups.id` real — `FOREIGN KEY ... REFERENCES public.groups(id)`. La función NO verifica su existencia antes de intentar el INSERT; si no existe, la violación de FK aborta toda la importación |
| `cantidad_contratada` | number | Sí | `NOT NULL`, `CHECK (cantidad_contratada >= 0)` |

No se permiten dos elementos de `zonas` con el mismo `group_id` dentro de la misma actividad — `UNIQUE(poa_activity_id, zone_id)` lo rechaza como violación de integridad.

### `p_import_operation_id` (opcional, `DEFAULT NULL`)
UUID generado **una vez por operación de importación** por el llamador (no por el usuario, no por el contenido del Excel). Ver [Idempotencia](#idempotencia) abajo. Si se omite (`NULL`), la llamada nunca es idempotente — cada invocación crea una versión nueva incondicionalmente.

---

## Qué NO valida esta función (deliberado)

Por diseño (instrucción explícita del dueño del proceso durante el Incremento 5): esta función confía en que `src/lib/poaImport/validate.ts` ya validó el contenido antes de construir el JSON. **No** vuelve a verificar:
- que `activity_key` exista en el catálogo técnico (`board_activity_standards`);
- que los `group_id` correspondan a zonas ya resueltas vía `poa_zone_mappings` (ADR-0004) — eso es responsabilidad del llamador, antes de construir `p_activities`;
- que la frecuencia sea constante o razonable — si el llamador envía una `frecuencia` inconsistente con lo que el dominio espera, la función la persiste tal cual.

Las únicas validaciones que SÍ ejecuta son las mínimas para no corromper el propio modelo relacional (ver siguiente sección) — la inteligencia de negocio vive en TypeScript, no aquí.

---

## Invariantes garantizados por el código (requieren ADR para cambiar)

1. **Atomicidad total.** Una función de Postgres sin manejador de excepciones es una única transacción implícita respecto al llamador: cualquier `RAISE EXCEPTION` revierte TODO lo insertado en esa invocación — `poa_versions`, `poa_activities` y `poa_activity_zones` por igual. Verificado con tests explícitos que comprueban ausencia de huérfanos (`supabase/tests/05_import_poa_version.sql`, Tests 11-14), no asumido por "Postgres hace transacciones".
2. **Idempotencia por `import_operation_id`.** Reintentar la misma operación (mismo `p_import_operation_id`) devuelve el `id` de la versión ya creada, sin duplicar ni volver a ejecutar el resto de la función — independiente del `status` actual de esa versión (una versión ya cerrada por una importación posterior sigue siendo la respuesta correcta para esa operación específica).
3. **Nunca dos versiones `active` para el mismo `poa_id`.** La versión previamente activa (si existe) pasa a `closed` (con `closed_at`) en la MISMA operación que activa la nueva — nunca en una transacción separada, nunca antes de que la nueva versión termine de validarse.
4. **Ninguna actividad puede persistir sin al menos una zona.** Verificado explícitamente después de insertar (no solo confiado a la FK) — ver Errores esperables.
5. **El total de zonas insertadas se re-verifica contra el JSON de entrada** antes de activar — protección adicional contra un bug lógico en el `INSERT ... JOIN LATERAL`, no solo contra datos de entrada inválidos.
6. **`import_order` (actividad) y `zone_import_order` (zona) son columnas independientes.** El orden de las zonas dentro de una actividad nunca se deriva ni se mezcla con el orden de las actividades dentro del array — preserva el orden de llegada de cada nivel del JSON por separado.
7. **La versión nace `draft` y solo se activa al final**, después de insertar actividades, insertar zonas, y pasar ambas verificaciones de consistencia. Nunca existe, ni siquiera transitoriamente dentro de la transacción, una versión `active` con datos parciales.

---

## Errores esperables

Ninguno de estos errores dispara lógica de negocio adicional (retry automático, corrección silenciosa, etc.) — todos abortan la operación completa y no dejan rastro.

| Condición | Mecanismo | Mensaje (aproximado) |
|---|---|---|
| `p_poa_id` no existe | `RAISE EXCEPTION` explícito | `POA % no encontrado` |
| El llamador no es admin del board del POA | `RAISE EXCEPTION` explícito (`can_manage_poa`) | `Sin permiso para importar una versión de este POA` |
| `p_activities` no es un array JSON (o es `NULL`) | `RAISE EXCEPTION` explícito | `p_activities debe ser un array JSON` |
| Una actividad tiene `zonas: []` | `RAISE EXCEPTION` explícito, tras el INSERT de actividades/zonas | `Actividad sin ninguna zona asociada — la importación se revierte por completo` |
| El conteo de zonas insertadas no coincide con el JSON | `RAISE EXCEPTION` explícito | `Inconsistencia: % zonas esperadas, % insertadas` |
| `group_id` no existe en `groups` | Violación de FK de Postgres (`23503`, `foreign_key_violation`) | `insert or update on table "poa_activity_zones" violates foreign key constraint ...` |
| `precio_unitario`/`frecuencia`/`cantidad_contratada` fuera de rango o ausentes | Violación de `CHECK`/`NOT NULL` de Postgres | mensaje estándar de Postgres, no personalizado |
| Dos zonas con el mismo `group_id` en la misma actividad | Violación de `UNIQUE` de Postgres (`23505`) | mensaje estándar de Postgres, no personalizado |

El llamador (orquestador TypeScript, todavía por construir) es responsable de traducir estos errores a mensajes de dominio para el usuario final — la función no lo hace por él.

---

## RLS y superficie de escritura

`poa_versions`, `poa_activities` y `poa_activity_zones` no tienen ninguna política RLS de `INSERT`/`UPDATE`/`DELETE` (verificado en `supabase/tests/05_import_poa_version.sql`, Test 4, vía `pg_policies`). RLS por defecto deniega lo que no tiene una política permisiva explícita — así que, sin importar el rol del usuario (incluido admin), un `.from('poa_versions').insert(...)` directo desde el cliente falla siempre. `import_poa_version()` es literalmente el único camino.

---

## Idempotencia

`p_import_operation_id` debe generarse **una vez por intento de importación**, no por archivo ni por usuario ni por contenido — un mismo Excel importado dos veces DELIBERADAMENTE (dos decisiones de negocio distintas, aunque el archivo no haya cambiado) debe usar dos `import_operation_id` distintos, y crea dos `poa_versions` distintas (Regla 1 de `poa-domain.md`: ninguna versión se edita, toda modificación contractual es una versión nueva — ver TC-05 de `docs/architecture/poa-excel-import-test-matrix.md`). `import_operation_id` protege contra un reintento accidental de la MISMA operación (doble clic, retry de red), no contra reimportar el mismo contenido a propósito.

---

## Ejemplo completo

```sql
SELECT public.import_poa_version(
  'a1b2c3d4-0000-0000-0000-000000000001',  -- p_poa_id
  '[
    {
      "activity_key": "1.01",
      "precio_unitario": 1412.8795648795647,
      "frecuencia": 1,
      "zonas": [
        { "group_id": "b2c3d4e5-0000-0000-0000-000000000010", "cantidad_contratada": 7887 },
        { "group_id": "b2c3d4e5-0000-0000-0000-000000000011", "cantidad_contratada": 15000 }
      ]
    },
    {
      "activity_key": "1.02",
      "precio_unitario": 890.15,
      "frecuencia": 2,
      "zonas": [
        { "group_id": "b2c3d4e5-0000-0000-0000-000000000010", "cantidad_contratada": 500 }
      ]
    }
  ]'::JSONB,
  'c3d4e5f6-0000-0000-0000-000000000001'   -- p_import_operation_id, generado por el llamador
);
-- devuelve el UUID de la nueva poa_version, ya 'active'
```

Correspondencia con el tipo TypeScript (`src/lib/poaImport/types.ts`, `ValidatedActivity[]`) que el orquestador (por construir) debe mapear a este JSON:

| TypeScript (`ValidatedActivity`) | JSON (`p_activities`) |
|---|---|
| `activityKey` | `activity_key` |
| `precioUnitario` | `precio_unitario` |
| `frecuencia` | `frecuencia` |
| `zonas[].groupId` | `zonas[].group_id` |
| `zonas[].cantidadContratada` | `zonas[].cantidad_contratada` |

`ValidatedActivity[]` solo existe cuando `ValidationResult.valid === true` — las actividades en `noContratadas` (sin cobertura de zona) y las marcadas `frecuencia_pendiente_regla_negocio` (Grupo B, ver `docs/discovery/poa-frequency-per-zone.md`) nunca deben llegar a este JSON.

---

## Documentos relacionados

- [`poa-excel-import-design.md`](./poa-excel-import-design.md) — diseño del parser y el flujo de importación completo (de dónde viene el JSON, no qué hace con él la base de datos).
- [`poa-excel-import-test-matrix.md`](./poa-excel-import-test-matrix.md) — contrato de aceptación del parser (capas 1-3).
- [`docs/adr/ADR-0002-schedule-contractual-source.md`](../adr/ADR-0002-schedule-contractual-source.md) — esquema de `poa_versions`/`poa_activities`/`poa_activity_zones`.
- [`docs/adr/ADR-0004-poa-zone-catalog.md`](../adr/ADR-0004-poa-zone-catalog.md) — de dónde deben venir los `group_id` (resolución de zonas), responsabilidad del llamador, no de esta función.
- [`docs/discovery/poa-frequency-per-zone.md`](../discovery/poa-frequency-per-zone.md) — bloqueo de negocio pendiente (Grupo B) antes de poder importar el POA real completo.
