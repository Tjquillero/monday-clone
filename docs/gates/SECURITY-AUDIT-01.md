# Auditoría de Seguridad: SECURITY-AUDIT-01

**Fecha:** 2026-09-30  
**Alcance:** Remediación de escalamiento de privilegios vía `user_metadata`, aseguramiento de `search_path` en funciones `SECURITY DEFINER` y rotación de claves de acceso en producción.

---

## 1. Resumen Ejecutivo y Hallazgo S1

En la arquitectura previa, la función `public.is_admin()` leía el rol de administración directamente desde `auth.jwt()->'user_metadata'->>'role'`. Dado que `user_metadata` es un campo editable por el propio usuario final a través de la API de Supabase Auth (`supabase.auth.updateUser()`), esto representaba una vulnerabilidad crítica de escalamiento de privilegios que afectaba a 18 políticas RLS en 11 tablas (activity_templates, board_columns, boards, financial_acta_details, financial_actas, groups, items, notifications, personnel, site_incidents, task_dependencies); por comando: ALL 7, DELETE 4, INSERT 3, UPDATE 3, SELECT 1.

Adicionalmente, varias funciones con privilegios elevados (`SECURITY DEFINER`) carecían de la fijación explícita del parámetro `search_path`, exponiéndolas a ataques de búsqueda de esquemas no confiables.

---

## 2. Remediación S1 (Aplicada en Producción)

Se aplicó en producción la migración `supabase/migrations/2026093002_security_is_admin_app_metadata.sql`:
1. `public.is_admin()` fue redefinida para consultar exclusivamente `raw_app_meta_data ->> 'role'` desde la tabla del sistema `auth.users`, un campo que el cliente no puede modificar (solo el servidor o el dashboard):
   ```sql
   CREATE OR REPLACE FUNCTION public.is_admin()
   RETURNS boolean
   LANGUAGE sql
   STABLE
   SECURITY DEFINER
   SET search_path = pg_catalog, public, pg_temp
   AS $fn$
     SELECT COALESCE(
       (SELECT u.raw_app_meta_data ->> 'role'
          FROM auth.users u
         WHERE u.id = auth.uid()) = 'admin',
       false);
   $fn$;
   ```
2. Se fijó `SET search_path = pg_catalog, public, pg_temp` en 5 funciones `SECURITY DEFINER`:
   - `public.is_admin()`
   - `public.get_user_board_role(uuid, uuid)`
   - `public.handle_new_user()`
   - `public.fn_insert_activity_standard()`
   - `public.get_or_create_financial_item(uuid, text, jsonb)`

### Evidencia del Ensayo con Rollback (2026-09-30)
- **Antes del cambio:** Un usuario inventado con `user_metadata.role=admin` obtenía `is_admin() = true`.
- **Después del cambio:** Ese mismo usuario obtiene `false`.
- **Admin real:** Con `app_metadata.role=admin` (asignado el 2026-09-30) obtiene `true`.
- **Sin sesión:** Retorna `false`.
- **Funciones SECURITY DEFINER:** 0 funciones `SECURITY DEFINER` sin `search_path`.

---

## 3. Remediación S2 — Rotación de claves (2026-09-30)

- **Motivo:** La clave `service_role` legacy estuvo presente en `.env.local` y fue utilizada por agentes y scripts (E2E) para crear cuentas en producción. Se verificó que ningún archivo `.env` estuvo nunca versionado en git (`git ls-files` y `git log` limpios).
- **Pasos ejecutados por Tomás:**
  1. **Supabase:** Creada secret key `"vercel-server"` (uso exclusivo: Vercel, `/api/personnel/bootstrap`).
  2. **Vercel:** `SUPABASE_SERVICE_ROLE_KEY` reemplazada por `vercel-server`; redeploy realizado.
  3. **Vercel:** `NEXT_PUBLIC_SUPABASE_ANON_KEY` recreada como tipo Config con la publishable key (`sb_publishable_…`); redeploy realizado. Verificado en el navegador (DevTools → Network → header `apikey = sb_publishable_…`).
  4. **Entorno local:** En `.env.local`, anon key reemplazada por la publishable key y línea `SUPABASE_SERVICE_ROLE_KEY` eliminada por completo. En `.env.production`, anon key reemplazada.
  5. **Supabase:** Claves legacy (`anon`, `service_role`) desactivadas (*"JWT-based API keys" disabled*). Aplicación verificada funcionando correctamente después del cambio.
  6. **Supabase:** Secret key `"default"` revocada.
- **Estado final:** Única clave privilegiada activa = `vercel-server` (confinada exclusivamente en Vercel).
- **Riesgo residual:** La desactivación de claves legacy es reversible desde el dashboard; la invalidación permanente requiere rotar el JWT secret (*Settings → JWT Keys*), lo cual cerraría todas las sesiones activas de usuarios. Queda como pendiente opcional.
- **Nota operativa:** La carga de Excel de personal (`/api/personnel/bootstrap`) no se probó funcionalmente con la nueva clave; se validará en la próxima carga real de datos.

---

## 4. Estado de Mitigaciones y Tareas Pendientes

### A. Tareas Ejecutadas / Mitigadas
- **CI cortado (Mitigado):** Secreto `SUPABASE_ACCESS_TOKEN` eliminado de GitHub Actions; el job `pgtap` pasó de 1m34s a 13s finalizando sin conectar a infraestructura remota.
- **Aislamiento de service_role (Mitigado en S2):** Clave `service_role` eliminada de entornos locales y confinada a Vercel bajo nombre `vercel-server`.

### B. Pendiente S3: Interfaz de Usuario
En el código fuente de la aplicación cliente (`src/`), existen componentes y hooks que continúan leyendo `user_metadata` para determinar roles o permisos en la interfaz de usuario:

| Archivo | Línea | Código / Contexto |
|---|---|---|
| `src/hooks/usePermissions.ts` | 25 | `const role = (user?.user_metadata?.role as Role) \|\| ROLES.MEMBER;` |
| `src/contexts/AuthContext.tsx` | 52-59 | `DEV_FALLBACK_USER` usa el id real del admin de producción (`9e1ed244…`) y role `admin`; se activa solo con `NODE_ENV=development`. |
| `src/contexts/AuthContext.tsx` | 55 | `user_metadata: { role: 'admin' },` (en objeto `DEV_FALLBACK_USER`) |
| `src/contexts/AuthContext.tsx` | 137 | `const isAdmin = (user?.user_metadata as any)?.role?.toLowerCase() === 'admin' \|\|` |
| `src/contexts/AuthContext.tsx` | 138-139 | `isAdmin` se concede también por email (`admin@mantenix.com`, `admin@example.com`). |
| `src/components/views/BoardViewContainer.tsx` | 46 | `const role = (user?.user_metadata as any)?.role?.toLowerCase();` |

> **Nota:** Ninguno de estos usos en el cliente fue modificado en S1/S2 para preservar la estabilidad de la UI mientras se planifica la migración integral de la sesión en S3.

### C. Pendientes de Infraestructura y Testing
- **Proyecto Supabase separado para tests:** Crear y aislar un proyecto dedicado exclusivamente a testing automatizado y suites de integración.
- **Skill E2E:** Reconfigurar la suite y skills de E2E para interactuar exclusivamente con el entorno de pruebas aislado sin acceso a producción.
