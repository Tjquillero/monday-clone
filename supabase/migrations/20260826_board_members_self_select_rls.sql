-- =============================================================================
-- board_members: política de SELECT para la propia membresía
--
-- Hallazgo (2026-07-19): board_members tiene RLS habilitado desde
-- 20240316_consolidated_schema.sql pero NUNCA tuvo una política de SELECT.
-- Nunca se notó porque hasta ahora ningún código de cliente hacía
-- `.from('board_members').select(...)` directamente — toda lectura pasaba
-- por funciones SECURITY DEFINER (get_user_board_role, can_manage_poa,
-- etc.), que ignoran RLS por diseño. useUserBoards() (navegación inicial de
-- /dashboard, ver docs/architecture) es el primer consumidor real del
-- cliente — y sin esta política, un usuario no puede ver ni siquiera su
-- propia fila de membresía, devolviendo [] aunque la fila exista.
--
-- Alcance deliberadamente mínimo: cada usuario ve SOLO sus propias filas
-- (user_id = auth.uid()) — no expone quién más es miembro de un board. Si
-- en el futuro se necesita una pantalla de "gestionar miembros", esa
-- política se agrega aparte, con su propio chequeo de rol admin.
-- =============================================================================

CREATE POLICY "Usuarios ven sus propias membresías"
  ON public.board_members FOR SELECT
  USING (user_id = auth.uid());
