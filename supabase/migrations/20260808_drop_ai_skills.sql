-- =============================================================================
-- Retira ai_skills — mecanismo de "self-healing prompt" reemplazado por
-- completo (no adaptado) por el copiloto de dominio (Tool Registry +
-- Orchestrator + DomainTools, ver docs en memoria del proyecto).
--
-- Confirmado sin referencias vivas antes de eliminar: MantenixAgent.ts,
-- Optimizer.ts, /api/ai/chat, /api/ai/test y el tab "Versions" de
-- AgentControlCenter.tsx se eliminaron en el mismo commit — ai_skills
-- era la única tabla que sostenían.
--
-- La tabla se creó originalmente por fuera del tracking de migraciones de
-- Supabase CLI (src/db/migrations/01_create_ai_skills.sql, aplicada de
-- forma manual/legacy) — de ahí que no exista una migración previa en
-- supabase/migrations/ que la cree; esta es la primera y única referencia
-- a ai_skills en el historial de git de este directorio.
-- =============================================================================

DROP TABLE IF EXISTS public.ai_skills;
