# MANTENIX — Mandato de auditoría independiente C1.5 / C1.5-R1 (v2)

> Para una sesión NUEVA de Claude Code, sin historial previo de esta discusión.
> Rol: auditor técnico independiente. No implementas, no corriges, no cambias estados de gates.

---

## 0. Controles previos (los prepara Tomás, no el auditor)

Las reglas en el prompt no son controles. Antes de lanzar la sesión:

**0.1 Permisos de Claude Code.** En `.claude/settings.local.json` (verificar la sintaxis contra la documentación de tu versión):

```json
{
  "permissions": {
    "deny": [
      "Edit", "Write", "NotebookEdit",
      "Bash(git commit:*)", "Bash(git push:*)", "Bash(git checkout:*)", "Bash(git reset:*)", "Bash(git stash:*)",
      "Bash(supabase db push:*)", "Bash(supabase migration:*)", "Bash(supabase functions deploy:*)",
      "Bash(npm install:*)", "Bash(rm:*)", "Bash(mv:*)"
    ]
  }
}
```

**0.2 Acceso a la BD con un rol de solo lectura.** Nunca con `service_role` ni con el usuario `postgres`.
- El rol no hereda EXECUTE sobre RPCs mutativas (no pertenece a `authenticated`).
- `default_transaction_read_only = on` en el rol.
- Cuidado con RLS: un rol sin BYPASSRLS verá tablas vacías. Resolverlo antes y confirmar con un `count(*)` conocido.
- Quitar del entorno de la sesión cualquier `.env` con claves de escritura.

**0.3 Ruta de salida permitida.** El auditor no toca el repo. El informe y la evidencia van a una carpeta fuera del repo, o a una carpeta en `.gitignore`: `C:\desarrollo\auditorias\C1.5-R1\`.
Es la única excepción a "no escribir", y se habilita solo para esa ruta.

**0.4 Retención de logs (urgente, antes de auditar).** Los logs de API y Postgres de Supabase se retienen pocos días según el plan. Si existen registros de las llamadas que crearon las 715 filas, pueden perderse. Exportarlos hoy.

---

## 1. Fijar el estado auditado

El auditor debe registrar primero, antes de cualquier análisis:

- SHA de `main`: `git rev-parse HEAD`.
- `git status --porcelain` completo. Hay trabajo local sin commit; por ejemplo, la migración `2026092801` no está en `main`.
- Fecha y hora UTC de cada consulta a producción.

Todo hallazgo debe decir si se refiere a `main@SHA`, al working tree o a producción.

---

## 2. FASE A — Descubrimiento ciego

En esta fase no recibes hipótesis. Responde con evidencia propia:

| # | Pregunta |
|---|---|
| A1 | ¿Qué caminos de código escriben o sincronizan `weekly_plan_items`? Para cada uno: archivo:línea, payload exacto y qué pasa si falla. |
| A2 | ¿Qué versiones de `sync_weekly_plan_items_rpc` existen en migraciones? Haz un diff de sus cuerpos. |
| A3 | ¿Qué cuerpo está instalado en producción? (`md5(pg_get_functiondef(...))` comparado contra cada migración) ¿Qué migraciones figuran como aplicadas? |
| A4 | Para el board `3ea0326f-6ff7-409f-848a-1f296e6e3cc8`, semana 2026-09-28, 10 planes: conteos por plan de `planned_date` NULL, `occurrence_key` NULL, overrides, ejecuciones, estados, `created_at` mín/máx y `updated_at`. |
| A5 | ¿Qué evidencia existe, o no existe, sobre quién insertó cada fila y con qué payload? (columnas de auditoría, logs, `pg_stat_statements`, triggers) |
| A6 | ¿Cómo se genera `occurrence_key` en el código? ¿Hay una sola autoridad? |
| A7 | Resolución canónica de zona para las 1.426 filas (afectadas y control por separado): cardinalidad 0 / 1 / >1 y comparación con la zona actual. |
| A8 | ¿Qué devuelve hoy `SELECT id FROM poa_activity_zones LIMIT 1`? ¿Coincide con alguna zona repetida en los datos? |
| A9 | ¿`/my-work` y `/verification` filtran o agrupan, directa o indirectamente, por `poa_activity_zone_id`? Sigue la cadena real de código. |
| A10 | ¿Los tests del RPC ejecutan la función de la migración o una copia? ¿Usan el payload real de los productores? |

Cada respuesta debe traer su evidencia: `archivo:línea@SHA`, o el texto SQL más la salida y la hora.
Toda consulta a producción corre dentro de `BEGIN READ ONLY; … ROLLBACK;` y se guarda en `evidence/`.

**Cierra la Fase A y guarda el informe antes de leer la Fase B.**

---

## 3. FASE B — Adjudicación de afirmaciones

Estas son afirmaciones hechas por el equipo. Tu trabajo es intentar refutarlas, no confirmarlas.

| ID | Afirmación del equipo |
|---|---|
| C1 | `ON CONFLICT (plan_id, planned_sequence) DO NOTHING` impide reparar `planned_date` en resincronizaciones. |
| C2 | El origen de los NULL es la materialización de esa semana. |
| C3 | El fallback del cliente no produjo filas en estos 10 planes. |
| C4 | Hay 3 caminos de escritura y 2 cuerpos históricos del RPC. |
| C5 | `routineRef = activity_key` y `patternOffset = 'default'` en todos los call sites. |
| C6 | `planned_sequence ↔ activity_key` es 1:1 en los 5 planes afectados. |
| C7 | 381 ZONE_MISMATCH y 334 ZONE_UNRESOLVED en las afectadas. |
| C8 | `5eb5a0f9-…` es el resultado del `LIMIT 1`. |
| C9 | El defecto de zona es sistémico (también afecta al control). |
| C10 | La migración local `2026092801` rompería `myWorkSurfaceTriggerService` con el payload real. |
| C11 | Una reparación que solo toque `planned_date` + `updated_at` es independiente del defecto espacial en runtime. |
| C12 | Los tests de C1.5 validan una copia de la función y un payload distinto al real. |

Para cada afirmación entrega:

| Campo | Contenido |
|---|---|
| Estado | PROVEN / SUPPORTED / PLAUSIBLE / UNPROVEN / CONTRADICTED / UNKNOWN |
| Tipo | hecho observado · mecanismo demostrado · causa histórica · hipótesis · decisión |
| Evidencia | referencias verificables |
| Alternativas consideradas | al menos una, o "ninguna compatible" justificando por qué |
| Qué la refutaría | observación concreta |

Criterio: PROVEN exige evidencia directa **y** que ninguna alternativa listada sea compatible con ella.

Añade además las afirmaciones implícitas que detectes y que el equipo no formuló.

---

## 4. Reglas de escalamiento

- Si descubres un riesgo activo en producción (por ejemplo, un cuerpo de RPC peligroso ya instalado): detente, repórtalo en la primera línea del informe y no intentes mitigarlo.
- Si una consulta necesita permisos que no tienes: reporta UNKNOWN. No busques otra credencial.
- Si el contexto se te acaba antes de terminar: entrega lo cerrado y marca el resto como NOT_AUDITED. No lo resumas como cubierto.

---

## 5. Salida

1. `claims.csv`: `id, afirmación, estado, tipo, evidencia, alternativas, refutador`.
2. `informe.md` con estas secciones:
   - Estado auditado (SHA / working tree / producción)
   - Resultados de la Fase A
   - Adjudicación de la Fase B
   - Contradicciones encontradas
   - Afirmaciones implícitas nuevas
   - Riesgos activos
   - Siguiente gate recomendado (con sus criterios de entrada)
   - NOT_AUDITED
3. `evidence/`: cada consulta SQL con su salida y hora, más los diffs de funciones.

No cambies el estado de ningún gate. Solo recomiendas.
