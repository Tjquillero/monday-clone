# Drivers E2E de escenarios de negocio

Verificación en navegador de flujos funcionales contra la base enlazada.

**Frontera con el skill `.claude/skills/verify-nav`:**

- **Skill `verify-nav`** → navegación y verificación general de la aplicación
  (ribbon congelado, fallback de ids retirados). Aporta además `e2e-user.cjs`,
  el usuario E2E temporal que estos scripts reutilizan.
- **`scripts/e2e/`** → escenarios funcionales del negocio (cronograma,
  jornadas, verificación…). Un script nuevo de flujo de negocio vive AQUÍ,
  no en el skill.

## Prerequisitos

Comunes:

- Next.js corriendo en `http://localhost:3000`
- Proyecto Supabase enlazado (`supabase link`)
- `.env.local` en la raíz del repo
- `playwright-core` resoluble desde el proyecto
  (`npm i --no-save playwright-core` si falta; usa el Chrome del sistema)
- Ejecutar desde la raíz del repo, en Bash

Por script:

| Script | Necesita además |
|---|---|
| `smoke-mywork.cjs` | Usuario E2E creado |
| `seed-plan.cjs` | `SUPABASE_SERVICE_ROLE_KEY` en `.env.local` |
| `drive-jornada.cjs` | Usuario E2E creado **y** plan sembrado por `seed-plan.cjs` |
| `seed-zone-mapping.cjs` | Usuario E2E creado |
| `verify-zone-mapping-ui.cjs` | Usuario E2E creado **y** seed de `seed-zone-mapping.cjs` |
| `seed-poa-import.cjs` | Usuario E2E creado |
| `verify-poa-import-ui.cjs` | Usuario E2E creado, seed de `seed-poa-import.cjs` **y** `POA 2026 V.02 Ene.26-2026.xlsx` en la raíz del repo |
| `seed-poa-import-integration.cjs` | Usuario E2E creado |
| `verify-poa-import-integration.cjs` | Usuario E2E creado, seed de `seed-poa-import-integration.cjs` **y** el Excel real del POA |
| `verify-poa-import-commit4.cjs` | Usuario E2E creado, seed de `seed-poa-import.cjs` **y** el Excel real del POA |
| `seed-poa-import-full-flow.cjs` | Usuario E2E creado |
| `verify-poa-import-success.cjs` | Usuario E2E creado, seed de `seed-poa-import-full-flow.cjs` **y** `fixtures/poa-subset-19.xlsx` |

Ejecutar `drive-jornada.cjs` sin sembrar el plan falla con timeout esperando
un plan que no existe — sembrar primero.

## Secuencia completa

```bash
node .claude/skills/verify-nav/scripts/e2e-user.cjs   # 1. usuario temporal
node scripts/e2e/seed-plan.cjs                        # 2. plan publicado de esta semana
node scripts/e2e/drive-jornada.cjs                    # 3. escenario del líder
node scripts/e2e/seed-plan.cjs --cleanup              # 4. limpieza del seed
node .claude/skills/verify-nav/scripts/e2e-user.cjs --cleanup  # 5. limpieza del usuario
```

## Qué hace cada script

- **`smoke-mywork.cjs`** — humo de render de `/my-work` (no necesita seed):
  login real, la página carga, sin errores de consola. Sin plan publicado, el
  estado vacío es el resultado correcto.
- **`seed-plan.cjs`** — siembra 2 estándares marcados `source='e2e-seed'` y un
  `weekly_plan` en `published` para la semana actual (la tabla
  `board_activity_standards` está vacía en dev hasta que se carguen las 220
  actividades del contrato).
- **`drive-jornada.cjs`** — escenario completo del líder en `/my-work`.
  Screenshots en `<tmp>/mantenix-e2e/`.
- **`seed-zone-mapping.cjs`** — siembra un board/poa/group de prueba propios
  (no reutiliza el board de `seed-plan.cjs`) con UN mapeo de zona pendiente
  (`poa_zone_mappings.group_id = NULL`, simulando la Regla 5 de ADR-0004:
  el group original se eliminó). `--cleanup` borra el board completo
  (poa/groups/mapeo caen por cascade).
- **`verify-zone-mapping-ui.cjs`** — verifica `/poa/[poaId]/zone-mappings`:
  la zona pendiente es visible, seleccionar el group real y pulsar
  "Asignar" resuelve el mapeo (fila desaparece, estado vacío visible).
  Screenshots `zone-mapping-*.png` en `<tmp>/mantenix-e2e/`.
- **`seed-poa-import.cjs`** — siembra un board/poa mínimo, deliberadamente
  SIN zonas mapeadas ni catálogo técnico, para probar el esqueleto de
  `/poa/[poaId]/import` (Commit 1: el resultado esperado es `blocked`, no
  `success` — ese seed llega en un commit posterior).
- **`verify-poa-import-ui.cjs`** — sube el Excel real del POA (raíz del
  repo) a `/poa/[poaId]/import`, pulsa Importar, y confirma que se
  renderiza la presentación por variante de `ImportPoaResult` (secciones de
  zonas sin mapear / errores del Excel) sin errores de consola. Screenshots
  `poa-import-*.png` en `<tmp>/mantenix-e2e/`.
- **`seed-poa-import-integration.cjs`** — siembra un board con las 9 zonas
  reales del Excel del POA representadas como groups reales (mismos
  nombres), sin ningún mapeo resuelto todavía.
- **`verify-poa-import-integration.cjs`** — Commit 3: prueba con DOS
  pestañas simuladas que resolver una zona en `/poa/[poaId]/zone-mappings`
  (abierta en pestaña nueva desde el enlace de `blocked`) y volver a
  importar el MISMO archivo en la pestaña de importación original (que
  nunca navegó, el archivo sigue seleccionado) refleja el cambio: esa zona
  ya no aparece en `unresolvedZones`. Screenshots
  `poa-import-integration-*.png` en `<tmp>/mantenix-e2e/`.
- **`verify-poa-import-commit4.cjs`** — Commit 4 (pulido de UX): reutiliza
  el seed de `seed-poa-import.cjs` (resultado `blocked`, sin zonas/catálogo
  resueltos). Verifica el enlace "Seleccionar otro archivo" antes de
  importar, que el input de archivo queda `disabled` y el texto de progreso
  es visible mientras la importación está en curso, y que "Importar" sigue
  presente y habilitado tras un `blocked` (reintentar ahí es válido — a
  diferencia de `success`, donde el propio componente lo reemplaza por
  "Importar otro archivo"; ese caso se cubre con
  `src/components/poa/PoaImportContainer.test.tsx`, mockeando
  `importPoaService`, porque llegar a `success` real requeriría un catálogo
  y zonas resueltas que este seed deliberadamente no siembra). Screenshots
  `poa-import-c4-*.png` en `<tmp>/mantenix-e2e/`.
- **`seed-poa-import-full-flow.cjs`** — siembra un board con las 9 zonas
  reales del POA, `poa_zone_mappings` 9/9 resueltos, y `board_activity_standards`
  con las 19 actividades ya confirmadas con evidencia real en Tablero
  Principal (`docs/discovery/poa-activity-equivalences.md`) — mismos
  `activity_key`/`rendimiento`/`category`/`unit`, `source='e2e-full-flow-seed'`.
- **`verify-poa-import-success.cjs`** — primer E2E que prueba el camino
  `success` real del importador (ningún script anterior lo hacía — ver nota
  en `verify-poa-import-commit4.cjs`). Sube `fixtures/poa-subset-19.xlsx`
  (subconjunto real de 19 filas del Excel oficial, mismo contenido, generado
  filtrando por los 19 `activity_key` ya confirmados) y confirma
  "Importación exitosa" con los conteos correctos. **Hallazgo de esta
  verificación:** el Cronograma no genera plan para ninguna de las 19
  actividades importadas — causa raíz ajena al importador, ver
  `activity_scope_mappings` en la memoria del proyecto / tarea de
  seguimiento.

## Qué limpia realmente `--cleanup`

`seed-plan.cjs --cleanup` elimina **únicamente** los registros creados por el
seed: el `weekly_plan` sembrado (sus items y ejecuciones caen por cascade) y
los estándares con `source='e2e-seed'`. **Nunca toca datos creados
manualmente.** El orden importa: plan primero, estándares después (los items
los referencian con `ON DELETE RESTRICT`).

## Criterios de éxito de `drive-jornada.cjs`

- ✓ Login correcto con el usuario E2E
- ✓ Plan sembrado visible en `/my-work` (sitio + actividades)
- ✓ Jornada creada como borrador (chip "Borrador")
- ✓ Jornada reportada vía RPC (chip "Reportada")
- ✓ Totales del item actualizados por el trigger (cantidad ejecutada visible)
- ✓ 0 errores de consola en la vista
- ✓ Exit code 0

Si falla, el último mensaje impreso indica en qué paso se quedó.

Gotchas del navegador (sesión en cookies de `@supabase/ssr`, warmup por HTTP,
timeouts de Turbopack): ver `.claude/skills/verify-nav/SKILL.md`.
