# MANTENIX — Plan de infraestructura de auditoría de solo lectura (para Antigravity / Gemini)

> **Propósito:** montar un canal de auditoría que **técnicamente** no pueda escribir en producción, y rehacer con él GATE-FIN-01 y la investigación del origen de los NULL.
> **Rol del agente:** ejecutor de este plan. No es auditor de su propio trabajo y no declara PASS. Entrega evidencia; el dictamen lo emite Tomás.

---

## Reglas duras (aplican a todo el plan)

1. **Prohibido** leer o usar `SUPABASE_SERVICE_ROLE_KEY`, `.env.local` o cualquier credencial distinta de `AUDITOR_DATABASE_URL`.
2. **Prohibido** usar `supabase-js`, PostgREST, `supabase db query --linked` o llamar RPCs. Toda consulta pasa por el runner del Paso 3.
3. **Prohibido** modificar el repo `C:\desarrollo\monday-clone`: sin commits, sin tocar `package.json`, sin archivos nuevos dentro del repo.
4. Todo lo que el agente cree va en `C:\desarrollo\auditoria\`, fuera del repo.
5. Si un paso falla o devuelve algo inesperado: **DETENER** y reportar. No improvisar alternativas.
6. Nunca convertir un error en "0". Toda consulta que falle debe abortar el script.
7. El agente no escribe "PASS" en ningún artefacto. Usa `EVIDENCE_COMPLETE` o `EVIDENCE_INCOMPLETE`.

---

## Paso 0 — Lo hace Tomás (el agente NO lo ejecuta)

**0.1** Actualizar Windows y reiniciar (requisito para el acceso de Claude al equipo).

**0.2** En el SQL Editor de Supabase, como dueño del proyecto:

```sql
CREATE ROLE mantenix_auditor LOGIN PASSWORD '<clave-larga-generada>' NOINHERIT;
ALTER ROLE mantenix_auditor SET default_transaction_read_only = on;
ALTER ROLE mantenix_auditor SET statement_timeout = '30s';
GRANT USAGE ON SCHEMA public, supabase_migrations TO mantenix_auditor;
GRANT SELECT ON ALL TABLES IN SCHEMA public TO mantenix_auditor;
GRANT SELECT ON supabase_migrations.schema_migrations TO mantenix_auditor;
-- BYPASSRLS NO se concede todavía (ver 0.2-bis)
```

**0.2-bis Decisión explícita sobre RLS.** Primero sin `BYPASSRLS`: ejecutar solo Q00–Q03 (Paso 5, primer bloque).
- Si Q03 da el universo esperado (~4.011), no se concede `BYPASSRLS`.
- Si Q03 da 0 o un número parcial (lo esperable: las políticas de Mantenix dependen de `auth.uid()`, que no existe para un rol de Postgres directo), Tomás decide conceder:
  ```sql
  ALTER ROLE mantenix_auditor BYPASSRLS;   -- si Supabase lo rechaza: DETENER y avisar a Claude
  ```
  y se repite Q00–Q03. La evidencia de ambas corridas queda guardada (`E-Q03` sin y con BYPASSRLS).

Nota: `BYPASSRLS` solo amplía lo que el rol puede **leer**; no le da escritura. Las alternativas (políticas SELECT por tabla o vistas `SECURITY DEFINER`) exigen más DDL en producción, así que son más invasivas.

**0.3** Crear `C:\desarrollo\auditoria\.env.auditor` con una sola línea, usando la cadena del **Session pooler** de Supabase con el usuario `mantenix_auditor`:

```
AUDITOR_DATABASE_URL=postgresql://mantenix_auditor.<project-ref>:<clave>@<host-pooler>:5432/postgres?sslmode=require
```

**0.4** Indicarle al agente que el Paso 0 está listo. El agente no ve la clave en el chat; solo lee el archivo.

---

## GATE-AUDIT-ENV-01 — Aislamiento de credenciales (Tomás, antes del Paso 1)

El runner rechaza la `service_role`, pero eso es una barrera lógica. La barrera física es que el agente no pueda leer `.env.local`.

**Opción recomendada:** el agente no trabaja sobre el repo, sino sobre un snapshot sin secretos.

```powershell
cd C:\desarrollo\monday-clone
git worktree add C:\desarrollo\auditoria\repo-snapshot HEAD      # .env.local está en .gitignore → no se copia
git diff > C:\desarrollo\auditoria\repo-snapshot-uncommitted.patch
git status --porcelain > C:\desarrollo\auditoria\repo-snapshot-status.txt
```

Abrir Antigravity con el workspace en `C:\desarrollo\auditoria\` únicamente.

Verificación (la hace el agente y la guarda como evidencia):
```powershell
Get-ChildItem -Recurse -Force C:\desarrollo\auditoria -Include .env* | Select-Object FullName
```
Debe listar **solo** `.env.auditor`.

**Riesgo residual declarado:** si Antigravity corre con tu mismo usuario de Windows, su terminal puede técnicamente leer `C:\desarrollo\monday-clone\.env.local` aunque el workspace sea otro. La única barrera física completa es una de estas:
- ejecutar la auditoría con **otro usuario de Windows** sin permisos sobre `monday-clone`; o
- rotar la clave de escritura al terminar (ver el final de este documento).

Registrar en `REPORT.md` cuál de las dos se aplicó.

---

## Paso 1 — Estructura de trabajo (agente)

```
C:\desarrollo\auditoria\
  .env.auditor              (lo creó Tomás; no se copia a ningún sitio)
  runner\                   (package.json propio, fuera del repo)
  queries\                  (Q00…Q12 .sql, uno por archivo)
  evidence\                 (salidas E-Q00… .json, generadas por el runner)
  REPORT.md
  claims.csv
```

```powershell
mkdir C:\desarrollo\auditoria\runner, C:\desarrollo\auditoria\queries, C:\desarrollo\auditoria\evidence
cd C:\desarrollo\auditoria\runner
npm init -y
npm install pg@8 dotenv@16
```

Verificación: `node -e "require('pg'); console.log('ok')"` imprime `ok`.

---

## Paso 2 — Registrar el estado del repo (agente, solo lectura)

```powershell
cd C:\desarrollo\auditoria\repo-snapshot
git rev-parse HEAD            > C:\desarrollo\auditoria\evidence\repo_head.txt
copy ..\repo-snapshot-status.txt       ..\evidence\repo_status.txt
copy ..\repo-snapshot-uncommitted.patch ..\evidence\repo_uncommitted.patch
```

---

## Paso 3 — Runner con controles incorporados

Crear `C:\desarrollo\auditoria\runner\run.js` **exactamente** así:

```js
// Runner de auditoría Mantenix — solo lectura, falla ruidosamente, guarda evidencia.
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
require('dotenv').config({ path: path.resolve(__dirname, '..', '.env.auditor') });
const { Client } = require('pg');

const URL = process.env.AUDITOR_DATABASE_URL;
if (!URL) throw new Error('Falta AUDITOR_DATABASE_URL');
if (!/mantenix_auditor/.test(URL)) throw new Error('La URL no usa el rol mantenix_auditor. ABORTAR.');
if (/service_role|postgres:\/\/postgres[.:]/.test(URL)) throw new Error('Credencial privilegiada detectada. ABORTAR.');

const FORBIDDEN = /\b(insert|update|delete|merge|alter|create|drop|truncate|grant|revoke|comment|call|do|copy|vacuum|reindex|cluster|refresh|lock|set_config|dblink\w*|pg_terminate_backend|pg_cancel_backend|lo_\w+|set\s+(session\s+)?(role|default_transaction_read_only|transaction_read_only))\b/i;

async function main() {
  const files = process.argv.slice(2);
  if (!files.length) throw new Error('Uso: node run.js ../queries/Q00.sql [...]');
  const client = new Client({ connectionString: URL, ssl: { rejectUnauthorized: false } });
  await client.connect();
  try {
    for (const f of files) {
      const sql = fs.readFileSync(f, 'utf8');
      const body = sql.replace(/--.*$/gm, '').trim();
      if (!/^(select|with)\b/i.test(body)) throw new Error(`${f}: solo se permite SELECT/WITH`);
      const scan = body.replace(/'(?:[^']|'')*'/g, "''");   // ignorar literales ('INSERT' en has_table_privilege)
      if (FORBIDDEN.test(scan)) throw new Error(`${f}: contiene palabra prohibida`);
      await client.query('BEGIN READ ONLY');
      const started = new Date().toISOString();
      let res;
      try {
        res = await client.query(sql);            // cualquier error lanza y aborta
      } finally {
        await client.query('ROLLBACK');
      }
      const out = {
        query_file: path.basename(f),
        sql,
        sql_sha256: crypto.createHash('sha256').update(sql).digest('hex'),
        executed_at_utc: started,
        row_count: res.rowCount,
        rows: res.rows,
      };
      const dest = path.resolve(__dirname, '..', 'evidence', `E-${path.basename(f, '.sql')}.json`);
      fs.writeFileSync(dest, JSON.stringify(out, null, 2));
      console.log(`OK ${path.basename(f)} → ${res.rowCount} filas → ${path.basename(dest)}`);
    }
  } finally {
    await client.end();
  }
}
main().catch(e => { console.error('ERROR:', e.message); process.exit(1); });
```

Nota: el filtro de palabras es una segunda barrera, no la principal. La barrera real es que el rol no tiene privilegios de escritura (lo comprueba Q01).

---

## Paso 4 — Consultas

Crear cada archivo en `C:\desarrollo\auditoria\queries\` con el contenido **exacto**.
**Las consultas Q00–Q03 son un gate: si alguna falla su criterio, DETENER.**

### Q00_identity.sql — ¿quién soy?
```sql
SELECT current_user,
       current_setting('default_transaction_read_only') AS default_ro,
       current_setting('transaction_read_only')         AS tx_ro,
       (SELECT rolbypassrls FROM pg_roles WHERE rolname = current_user) AS bypassrls;
```
Criterio: `current_user = mantenix_auditor`, `tx_ro = on`, `bypassrls = true`.

### Q01_no_write_privileges.sql — el rol no puede escribir
```sql
WITH objs AS (
  SELECT n.nspname, c.relname, c.relkind, c.oid
  FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
  WHERE c.relkind IN ('r','p','v','m','f','S')
    AND n.nspname NOT IN ('pg_catalog','information_schema')
    AND n.nspname NOT LIKE 'pg_toast%'
)
SELECT
  (SELECT count(*) FROM objs WHERE relkind <> 'S')                               AS relations_inspected,
  (SELECT count(*) FROM objs WHERE relkind = 'S')                                AS sequences_inspected,
  (SELECT count(*) FROM objs WHERE relkind <> 'S'
     AND has_table_privilege(current_user, oid, 'SELECT'))                       AS relations_selectable,
  (SELECT json_agg(nspname || '.' || relname) FROM objs WHERE relkind <> 'S'
     AND (has_table_privilege(current_user, oid, 'INSERT')
       OR has_table_privilege(current_user, oid, 'UPDATE')
       OR has_table_privilege(current_user, oid, 'DELETE')
       OR has_table_privilege(current_user, oid, 'TRUNCATE')))                   AS writable_relations,
  (SELECT json_agg(nspname || '.' || relname) FROM objs WHERE relkind = 'S'
     AND (has_sequence_privilege(current_user, oid, 'UPDATE')
       OR has_sequence_privilege(current_user, oid, 'USAGE')))                   AS writable_sequences;
```
Criterio: `writable_relations` y `writable_sequences` **nulos** (ninguno). El alcance declarado es exactamente `relations_inspected` + `sequences_inspected`, en todos los esquemas no internos (incluye `auth`, `storage` y `supabase_migrations`).

### Q02_schema_discovery.sql — columnas reales (evita consultar columnas inventadas)
```sql
SELECT table_name, string_agg(column_name, ', ' ORDER BY ordinal_position) AS columns
FROM information_schema.columns
WHERE table_schema = 'public'
  AND table_name IN ('weekly_plans','weekly_plan_items','weekly_plan_item_executions',
                     'poa','poa_versions','poa_activities','poa_activity_zones','poa_zone_mappings',
                     'actas','acta_items','acta_item_sources','groups')
GROUP BY table_name ORDER BY table_name;
```
Criterio: **comparar contra los nombres que usan Q03–Q12.** Esas consultas asumen `weekly_plans.week_start`, `weekly_plan_item_executions.plan_item_id`, `poa_activities.poa_version_id`, `poa_versions.status`, `actas.board_id`. Si alguno no existe, DETENER y reportar la diferencia. No adaptar por cuenta propia.

### Q03_positive_control.sql — el rol ve los datos
```sql
SELECT count(*) AS board_items
FROM weekly_plan_items i JOIN weekly_plans p ON p.id = i.plan_id
WHERE p.board_id = '3ea0326f-6ff7-409f-848a-1f296e6e3cc8';
```
Criterio: **> 0**; valor esperado cercano a 4.011. Si da 0, RLS está ocultando datos: DETENER.

### Q04_financial_exposure.sql — GATE-FIN-01 rehecho
```sql
WITH b AS (SELECT '3ea0326f-6ff7-409f-848a-1f296e6e3cc8'::uuid AS board_id)
SELECT
  (SELECT count(*) FROM actas)                                           AS actas_total,
  (SELECT count(*) FROM actas a, b WHERE a.board_id = b.board_id)        AS actas_board,
  (SELECT count(*) FROM acta_items)                                      AS acta_items_total,
  (SELECT count(*) FROM acta_item_sources)                               AS acta_sources_total,
  (SELECT count(*) FROM weekly_plan_item_executions)                     AS executions_total,
  (SELECT count(*) FROM weekly_plan_item_executions e
     JOIN weekly_plan_items i ON i.id = e.plan_item_id
     JOIN weekly_plans p ON p.id = i.plan_id, b
    WHERE p.board_id = b.board_id)                                       AS executions_board;
```

### Q05_exposure_by_zone.sql — ejecuciones y actas sobre ítems con zona no canónica
```sql
WITH items AS (
  SELECT i.id, i.activity_key, i.poa_activity_zone_id AS current_zone, p.group_id, p.board_id
  FROM weekly_plan_items i JOIN weekly_plans p ON p.id = i.plan_id
  WHERE p.board_id = '3ea0326f-6ff7-409f-848a-1f296e6e3cc8'
),
canon AS (
  SELECT it.id,
         count(paz.id) AS n_canon,
         min(paz.id::text)::uuid AS canon_zone
  FROM items it
  LEFT JOIN poa po ON po.board_id = it.board_id
  LEFT JOIN poa_versions pv ON pv.poa_id = po.id AND pv.status = 'active'
  LEFT JOIN poa_activities pa ON pa.poa_version_id = pv.id AND pa.activity_key = it.activity_key
  LEFT JOIN poa_activity_zones paz ON paz.poa_activity_id = pa.id AND paz.zone_id = it.group_id
  GROUP BY it.id
),
cls AS (
  SELECT it.id,
         CASE WHEN c.n_canon = 0 THEN 'UNRESOLVED'
              WHEN c.n_canon > 1 THEN 'AMBIGUOUS'
              WHEN c.canon_zone = it.current_zone THEN 'MATCH'
              ELSE 'MISMATCH' END AS zone_class
  FROM items it JOIN canon c ON c.id = it.id
)
SELECT cls.zone_class,
       count(*)                                   AS items,
       count(DISTINCT e.id)                       AS executions,
       count(DISTINCT s.id)                       AS acta_sources
FROM cls
LEFT JOIN weekly_plan_item_executions e ON e.plan_item_id = cls.id
LEFT JOIN acta_item_sources s ON s.execution_id = e.id
GROUP BY cls.zone_class ORDER BY cls.zone_class;
```
Nota para el informe: el valor `'active'` de `poa_versions.status` es un supuesto. Q02 y Q06 deben confirmarlo (listar los estados distintos existentes).

### Q06_poa_versions.sql
```sql
SELECT pv.id, pv.version_number, pv.status, pv.published_at, pv.closed_at, pv.created_at,
       (SELECT count(*) FROM poa_activities pa WHERE pa.poa_version_id = pv.id) AS activities
FROM poa_versions pv JOIN poa po ON po.id = pv.poa_id
WHERE po.board_id = '3ea0326f-6ff7-409f-848a-1f296e6e3cc8'
ORDER BY pv.created_at;
```

### Q07_zone_signatures.sql — qué son 5eb5a0f9 y 2969b907
```sql
SELECT paz.id AS zone_row, paz.zone_id AS group_id, g.title AS group_title,
       paz.created_at AS zone_created_at, pa.activity_key, pa.precio_unitario,
       pv.version_number, pv.status AS version_status, pv.created_at AS version_created_at,
       po.board_id
FROM poa_activity_zones paz
JOIN poa_activities pa ON pa.id = paz.poa_activity_id
JOIN poa_versions pv ON pv.id = pa.poa_version_id
JOIN poa po ON po.id = pv.poa_id
LEFT JOIN groups g ON g.id = paz.zone_id
WHERE paz.id IN ('5eb5a0f9-fa86-4046-b26e-973011703681','2969b907-0076-4f11-adad-04842f9dd0fe');
```

### Q08_zone_distribution_timeline.sql — qué zona recibió cada lote de ítems y cuándo
```sql
SELECT p.week_start, g.title AS site, i.poa_activity_zone_id,
       count(*) AS items,
       count(*) FILTER (WHERE i.planned_date IS NULL) AS null_dates,
       count(*) FILTER (WHERE i.occurrence_key IS NOT NULL) AS with_occ_key,
       min(i.created_at) AS first_created, max(i.created_at) AS last_created
FROM weekly_plan_items i
JOIN weekly_plans p ON p.id = i.plan_id
LEFT JOIN groups g ON g.id = p.group_id
WHERE p.board_id = '3ea0326f-6ff7-409f-848a-1f296e6e3cc8'
GROUP BY p.week_start, g.title, i.poa_activity_zone_id
ORDER BY min(i.created_at);
```

### Q09_isolated_zone_rows.sql — las ~14 filas con zona distinta a las dos dominantes
```sql
SELECT i.id, p.week_start, p.group_id, i.activity_key, i.poa_activity_zone_id,
       i.planned_date, i.occurrence_key, i.is_manual_override, i.created_at, i.updated_at
FROM weekly_plan_items i JOIN weekly_plans p ON p.id = i.plan_id
WHERE p.board_id = '3ea0326f-6ff7-409f-848a-1f296e6e3cc8'
  AND i.poa_activity_zone_id NOT IN ('5eb5a0f9-fa86-4046-b26e-973011703681','2969b907-0076-4f11-adad-04842f9dd0fe')
ORDER BY i.created_at;
```

### Q10_live_functions.sql — cuerpos vivos relevantes
```sql
SELECT p.proname, pg_get_function_identity_arguments(p.oid) AS args,
       p.prosecdef AS security_definer,
       md5(pg_get_functiondef(p.oid)) AS def_md5,
       pg_get_functiondef(p.oid) AS def
FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname = 'public'
  AND p.proname IN ('sync_weekly_plan_items_rpc','ensure_weekly_plan_header','generate_acta_draft',
                    'issue_acta','compute_acta_totals','adjust_acta_item_quantity')
ORDER BY p.proname;
```

### Q11_public_secdef.sql — funciones SECURITY DEFINER ejecutables por PUBLIC
```sql
SELECT p.proname, pg_get_function_identity_arguments(p.oid) AS args
FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname = 'public' AND p.prosecdef
  AND has_function_privilege('public', p.oid, 'EXECUTE')
ORDER BY 1;
```

### Q12_migrations_applied.sql
```sql
SELECT version, name FROM supabase_migrations.schema_migrations ORDER BY version;
```

---

## Paso 5 — Ejecución

```powershell
cd C:\desarrollo\auditoria\runner
node run.js ..\queries\Q00_identity.sql ..\queries\Q01_no_write_privileges.sql ..\queries\Q02_schema_discovery.sql ..\queries\Q03_positive_control.sql
```

**Revisar los criterios de Q00–Q03 antes de continuar.** Si todos se cumplen:

```powershell
node run.js ..\queries\Q04_financial_exposure.sql ..\queries\Q05_exposure_by_zone.sql ..\queries\Q06_poa_versions.sql ..\queries\Q07_zone_signatures.sql ..\queries\Q08_zone_distribution_timeline.sql ..\queries\Q09_isolated_zone_rows.sql ..\queries\Q10_live_functions.sql ..\queries\Q11_public_secdef.sql ..\queries\Q12_migrations_applied.sql
```

Cualquier `ERROR:` detiene todo. Reportarlo tal cual; no reintentar con otra credencial ni por otra vía.

---

## Paso 6 — Entrega

**`REPORT.md`**, con exactamente estas secciones:

1. Estado del repo (`repo_head`, `repo_status`, `repo_diffstat`)
2. Gate de controles: resultados de Q00–Q03 y si cada criterio se cumplió
3. Exposición financiera: Q04 y Q05, **sin interpretación**, solo tablas
4. Firmas de zona y línea de tiempo: Q06–Q09
5. Funciones vivas: Q10 (md5 de cada una) y Q11
6. Migraciones aplicadas: Q12
7. Observaciones: solo hechos que contradigan supuestos de las consultas (por ejemplo, otro valor de `status`)
8. `EVIDENCE_COMPLETE` o `EVIDENCE_INCOMPLETE` (con la lista de lo que faltó)

**`claims.csv`**, solo claims derivados directamente de las evidencias, con estas columnas:
`id, claim, evidence_file, sql_sha256, observed_value`

Sin columnas de estado PROVEN ni PASS: ese dictamen se emite fuera del agente.

---

## Paso 7 — Revisión

Tomás comparte con Claude la carpeta `C:\desarrollo\auditoria\`. Claude verifica:

- que cada cifra del `REPORT.md` coincida con el JSON de evidencia;
- que el `sql_sha256` de cada evidencia coincida con el archivo de consulta;
- que Q00–Q03 se hayan cumplido antes de Q04.

**GATE-AUDIT-VERIFY-01**

| # | Control | Cómo se verifica |
|---|---|---|
| 1 | Cada cifra del REPORT existe en la evidencia | cruce REPORT ↔ `E-*.json` |
| 2 | Cada evidencia tiene su consulta, con SQL exacto y hash | `sql_sha256` = sha256 del archivo en `queries/` |
| 3 | El control positivo Q03 se cumplió y quedó registrado | `E-Q03*.json` |
| 4 | No hubo errores silenciados | toda consulta de `queries/` tiene su `E-*.json`; ninguna falta |
| 5 | La conexión fue la del rol auditor | `E-Q00.json` |
| 6 | El rol no podía escribir | `E-Q01.json` |
| 7 | No se ejecutó nada fuera del runner, ni RPCs ni escrituras | **Tomás**, como administrador, consulta lo que el rol ejecutó realmente (si `pg_stat_statements` está habilitado): |

```sql
SELECT calls, left(query, 200) AS query
FROM pg_stat_statements
WHERE userid = (SELECT oid FROM pg_roles WHERE rolname = 'mantenix_auditor')
ORDER BY calls DESC;
```
Esa lista debe contener solo `BEGIN READ ONLY`, `ROLLBACK`, los `SELECT` de `queries/` y lo que el propio cliente `pg` emite al conectar. Cualquier otra sentencia invalida la auditoría.

Después, Claude emite su dictamen sobre GATE-FIN-01, el origen de los NULL y el alcance de la reparación.

---

## Al terminar la auditoría (Tomás)

```sql
ALTER ROLE mantenix_auditor WITH PASSWORD '<nueva-clave>';   -- o bien:
DROP ROLE mantenix_auditor;
```

**Sobre rotar la `service_role`:** hacerlo **después** de verificar el canal auditor, nunca antes, para no quedarte sin ruta administrativa. Antes de rotar, confirma en el panel de Supabase qué tipo de claves usa el proyecto:
- **Claves nuevas (`sb_secret_…`):** se puede crear una nueva y revocar la anterior sin afectar a la clave pública.
- **Claves JWT heredadas:** rotar el JWT secret cambia **también la clave `anon`** y rompe la app en producción hasta actualizar las variables de entorno.

Verifica esto en la documentación vigente de Supabase antes de ejecutarlo.
