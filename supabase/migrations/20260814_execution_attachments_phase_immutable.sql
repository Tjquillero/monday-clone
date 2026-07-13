-- =============================================================================
-- execution_attachments.phase — refuerzo de contrato, sin cambio de esquema
--
-- Decisión del usuario: la fase se captura al momento de subir la foto,
-- nunca se edita después como parte del flujo operativo normal. Si algún
-- día se necesita una corrección administrativa, debe ser una capacidad
-- APARTE con permisos específicos — no una edición silenciosa que
-- convierta la clasificación en algo que "se arregla después" para
-- satisfacer a la IA, cuando en realidad es un dato del proceso operativo.
--
-- Verificado empíricamente (no solo leído): execution_attachments nunca
-- tuvo una política RLS de UPDATE (solo SELECT/INSERT/DELETE desde su
-- creación en 20260716_execution_attachments.sql) — RLS deny-by-default ya
-- bloqueaba esto estructuralmente, incluso para un admin del board. Esta
-- migración no cambia nada funcional: documenta la decisión en el propio
-- esquema para que quede explícita y no dependa de que alguien recuerde
-- "nunca agregamos esa política a propósito". El contrato permanente queda
-- protegido por un test pgTAP (supabase/tests/20_ai_execution_attachments_lookup.sql,
-- Test 10) que falla si en el futuro se agrega una política UPDATE sin
-- que sea una decisión consciente.
-- =============================================================================

COMMENT ON COLUMN public.execution_attachments.phase IS
  'Fase de la evidencia: before (previo a la intervención) o after (posterior). NULL = sin clasificar (fotos históricas o subidas sin elegir fase). Nunca se infiere desde created_at. Se captura ÚNICAMENTE al momento de subir la foto — deliberadamente sin política RLS de UPDATE (deny-by-default), así que no se edita después como parte del flujo normal ni siquiera por un admin del board. Una corrección administrativa, si algún día se necesita, debe ser una capacidad aparte con permisos específicos, protegida por su propia decisión explícita — no una relajación silenciosa de esta política.';
