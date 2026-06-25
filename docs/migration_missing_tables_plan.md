# Plan de Migración — Tablas Faltantes
**Fecha:** 2026-06-24  
**Archivo generado:** `supabase/migrations/20260624_missing_tables.sql`  
**Estado:** PENDIENTE DE VALIDACIÓN — no aplicar sin completar el checklist

---

## Cambios propuestos

### Función nueva: `handle_updated_at()`
Ninguna migración en `supabase/migrations/` definía esta función. Las tablas `items`, `resource_analysis`, `dashboards` y `automations` tienen columna `updated_at` pero ningún trigger la actualiza automáticamente. Se crea aquí con `CREATE OR REPLACE` (idempotente) y se usa solo en las nuevas tablas.

### Tabla nueva: `financial_actas`
Cabecera de cada acta de cobro de avance de obra. Originalmente en `src/db/migrations/03_create_actas_tables.sql` sin RLS ni trigger. La migración añade:
- RLS siguiendo el patrón de `dashboards` (sub-tabla con `board_id UUID`)
- Roles válidos confirmados: `'admin'`, `'member'`, `'viewer'` — no existe `'owner'`
- Trigger `set_updated_at_financial_actas` usando `handle_updated_at()`
- Índice compuesto `(board_id, date DESC)` para la query de `useActas` que ordena por fecha

### Tabla nueva: `financial_acta_details`
Líneas de detalle de cada acta. Originalmente en `src/db/migrations/03_create_actas_tables.sql` sin RLS, sin trigger, y **faltando las columnas `previous_qty` y `previous_value`**. La migración añade:
- Ambas columnas en la definición `CREATE TABLE`
- `ALTER TABLE ADD COLUMN IF NOT EXISTS` como salvaguarda si la tabla ya existiera parcialmente
- RLS heredando permisos del board a través de join con `financial_actas`
- Trigger `set_updated_at_financial_acta_details`
- Índice adicional en `group_id` (usado por `useActaDetailsByBoard`)

### Tabla nueva: `site_incidents`
Registro de novedades de campo. Consolida `01_create_site_incidents.sql` + `02_add_solution_to_incidents.sql`. Cambios respecto a los originales:
- RLS **más estricto**: las políticas originales permitían que cualquier usuario autenticado viera incidentes de cualquier proyecto. Las nuevas restringen por membresía al board
- Estrategia de JOIN segura para `board_id TEXT`: `b.id::TEXT = board_id` en lugar de `board_id::UUID`, evitando error de cast en RLS
- `solution` incluida directamente en la tabla (ya no necesita migración separada)
- Política DELETE ausente de forma intencional (registros de auditoría inmutables)

---

## Archivos afectados

| Acción | Archivo |
|--------|---------|
| **Creado** | `supabase/migrations/20260624_missing_tables.sql` |
| Solo lectura (fuente) | `src/db/migrations/01_create_site_incidents.sql` |
| Solo lectura (fuente) | `src/db/migrations/02_add_solution_to_incidents.sql` |
| Solo lectura (fuente) | `src/db/migrations/03_create_actas_tables.sql` |
| Se desbloquean sin cambios | `src/hooks/useActas.ts` |
| Se desbloquean sin cambios | `src/components/views/FinancialViewContainer.tsx` |
| Se desbloquean sin cambios | `src/components/modals/NewsModal.tsx` |
| Se desbloquean sin cambios | `src/components/ReportsView.tsx` |
| Se desbloquean sin cambios | `src/hooks/useOfflineSync.ts` (deja de fallar en site_incidents) |

---

## Riesgos

| Riesgo | Probabilidad | Impacto | Mitigación |
|--------|-------------|---------|------------|
| Board owner no está en `board_members` | Baja | Medio — no puede ver sus actas | El owner debe tener rol 'admin' en board_members. Confirmar antes de aplicar. |
| Bucket `evidence` creado manualmente con `public: false` | Baja | Bajo — upload de fotos falla | Verificar en Supabase Dashboard → Storage antes de aplicar. |
| Storage policies de `evidence` ya existían con configuración distinta | Media | Bajo — `DROP POLICY IF EXISTS` las sobreescribe | Revisar policies actuales de storage.objects en el Dashboard. |
| `site_incidents` ya existe con datos y RLS permisiva | Baja | Informativo — registros existentes pueden quedar ocultos bajo la nueva RLS | Esperado y correcto: si el usuario no es miembro del board, no debería ver esos incidentes. |
| `handle_updated_at` colisiona con función existente diferente | Muy baja | Bajo — `CREATE OR REPLACE` la reemplaza | Verificar en SQL Editor: `SELECT proname, prosrc FROM pg_proc WHERE proname = 'handle_updated_at';` |

---

## Checklist de validación antes de aplicar

### Prerequisitos en Supabase
- [ ] La migración `20240316_consolidated_schema.sql` está aplicada
  - Verificar: `SELECT proname FROM pg_proc WHERE proname = 'get_user_board_role';` debe retornar 1 fila
- [ ] La tabla `boards` existe con columna `id UUID` y `owner_id UUID`
  - Verificar: `SELECT column_name FROM information_schema.columns WHERE table_name = 'boards';`
- [ ] La tabla `board_members` existe con CHECK `role IN ('admin', 'member', 'viewer')`

### Estado del Storage
- [ ] Verificar si el bucket `evidence` ya existe en Supabase Dashboard → Storage
  - Si existe como **privado**: cambiar a público antes o ajustar las políticas en el SQL
  - Si existe como **público**: el `ON CONFLICT DO NOTHING` lo preserva sin cambios
- [ ] Verificar si ya existen storage policies para el bucket `evidence` en el Dashboard

### Ambientes con tablas parcialmente creadas
- [ ] Verificar si `financial_actas` ya existe en la BD:
  ```sql
  SELECT table_name FROM information_schema.tables
  WHERE table_schema = 'public' AND table_name = 'financial_actas';
  ```
- [ ] Si existe, verificar que tenga `previous_qty` y `previous_value` (el `ADD COLUMN IF NOT EXISTS` las añade si no están):
  ```sql
  SELECT column_name FROM information_schema.columns
  WHERE table_name = 'financial_acta_details';
  ```
- [ ] Verificar si `site_incidents` ya existe y si tiene datos que respetar

### Roles de usuario
- [ ] Confirmar que el propietario del tablero principal tiene rol `'admin'` en `board_members`:
  ```sql
  SELECT bm.role FROM board_members bm
  JOIN boards b ON b.id = bm.board_id
  WHERE b.owner_id = bm.user_id;
  ```
  Si no hay filas, el owner no podrá acceder a actas ni incidentes hasta que se agregue a `board_members`.

### Cómo aplicar
```bash
# Opción A — CLI de Supabase (recomendado, registra en historial de migraciones)
supabase db push

# Opción B — SQL Editor del Dashboard de Supabase
# Pegar el contenido de supabase/migrations/20260624_missing_tables.sql y ejecutar
```

### Verificación post-aplicación
```sql
-- Confirmar que las 3 tablas existen
SELECT table_name FROM information_schema.tables
WHERE table_schema = 'public'
  AND table_name IN ('financial_actas', 'financial_acta_details', 'site_incidents')
ORDER BY table_name;
-- Esperado: 3 filas

-- Confirmar columnas críticas en financial_acta_details
SELECT column_name FROM information_schema.columns
WHERE table_name = 'financial_acta_details'
  AND column_name IN ('previous_qty', 'previous_value');
-- Esperado: 2 filas

-- Confirmar RLS activo
SELECT tablename, rowsecurity FROM pg_tables
WHERE schemaname = 'public'
  AND tablename IN ('financial_actas', 'financial_acta_details', 'site_incidents');
-- Esperado: rowsecurity = true en las 3

-- Confirmar triggers
SELECT trigger_name, event_object_table FROM information_schema.triggers
WHERE trigger_schema = 'public'
  AND trigger_name LIKE 'set_updated_at%';
-- Esperado: 2 filas (financial_actas y financial_acta_details)

-- Confirmar publicación Realtime
SELECT tablename FROM pg_publication_tables
WHERE pubname = 'supabase_realtime'
  AND tablename IN ('financial_actas', 'financial_acta_details', 'site_incidents');
-- Esperado: 3 filas
```
