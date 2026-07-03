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
