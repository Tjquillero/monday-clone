# Auditoría de Seguridad: SECURITY-AUDIT-01

**Fecha:** 2026-09-30  
**Alcance:** Remediación de escalamiento de privilegios vía `user_metadata` y aseguramiento de `search_path` en funciones `SECURITY DEFINER`.

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

## 3. Pendiente S2: la interfaz todavía lee user_metadata.role

En el código fuente de la aplicación cliente (`src/`), existen componentes y hooks que continúan leyendo `user_metadata` para determinar roles o permisos en la interfaz de usuario. Estos puntos deberán ser migrados en la fase S2 para leer desde `app_metadata` o desde las consultas de autorización del servidor:

| Archivo | Línea | Código / Contexto |
|---|---|---|
| `src/hooks/usePermissions.ts` | 25 | `const role = (user?.user_metadata?.role as Role) \|\| ROLES.MEMBER;` |
| `src/contexts/AuthContext.tsx` | 52-59 | `DEV_FALLBACK_USER` usa el id real del admin de producción (`9e1ed244…`) y role `admin`; se activa solo con `NODE_ENV=development`. |
| `src/contexts/AuthContext.tsx` | 55 | `user_metadata: { role: 'admin' },` (en objeto `DEV_FALLBACK_USER`) |
| `src/contexts/AuthContext.tsx` | 137 | `const isAdmin = (user?.user_metadata as any)?.role?.toLowerCase() === 'admin' \|\|` |
| `src/contexts/AuthContext.tsx` | 138-139 | `isAdmin` se concede también por email (`admin@mantenix.com`, `admin@example.com`). |
| `src/components/views/BoardViewContainer.tsx` | 46 | `const role = (user?.user_metadata as any)?.role?.toLowerCase();` |

> **Nota:** Ninguno de estos usos en el cliente fue modificado en esta fase S1 para preservar la estabilidad de la UI mientras se planifica la migración integral de la sesión en S2.
