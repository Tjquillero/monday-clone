// Tipos del Maintenance Scheduling Engine
// Ref: docs/MAINTENANCE_SCHEDULING_ENGINE_v1.md

export type ActivityPriority = 'must_execute' | 'preferred' | 'flexible';
export type ActivityCategory = 'ZONA VERDE' | 'ZONA DURA' | 'ZONA DE PLAYA';

// ─────────────────────────────────────────────────────────────────────────────
// Entidades de base de datos
// ─────────────────────────────────────────────────────────────────────────────

export interface ActivityStandard {
  id: string;
  board_id: string;
  group_id: string | null;   // null = estándar del contrato; UUID = excepción del sitio
  activity_key: string;
  name: string;
  category: ActivityCategory;
  unit: string;
  rendimiento: number;
  frecuencia: number;
  priority: ActivityPriority;
  version: number;
  effective_from: string;    // ISO date string (DATE en PG)
  effective_to: string | null;
  source: string;
  created_at: string;
}

export interface ScopeMapping {
  activity_key: string;
  scope_key: string;
  weight: number;
}

export interface PerformanceObservation {
  id: string;
  activity_key: string;
  work_order_id: string | null;
  board_id: string;
  group_id: string;
  observed_rendimiento: number;
  qty_executed: number | null;
  jornales_used: number | null;
  observation_date: string;
  source: string;
  notes: string | null;
  created_at: string;
}

// ─────────────────────────────────────────────────────────────────────────────
// Contrato de la IA — entrada y salida para Gemini
// Ref: WeeklyPlanningContext en el documento funcional
// ─────────────────────────────────────────────────────────────────────────────

export interface PlanningActivity {
  activity_key: string;
  name: string;
  category: ActivityCategory;
  priority: ActivityPriority;
  qty: number;
  unit: string;
  rendimiento: number;
  frecuencia: number;
  theoretical_journals_month: number;
  theoretical_journals_week: number;
  rules: Array<{ rule_type: string; rule_value: Record<string, unknown> }>;
}

export interface WeeklyPlanningContext {
  week: {
    start: string;         // ISO date
    end: string;
    number: number;        // 1–4 dentro del mes
    working_days: number;
  };
  zone: {
    id: string;
    name: string;
    daily_capacity: number;
    available_capacity: number;
  };
  activities: PlanningActivity[];
  capacity: {
    weekly_available: number;
    weekly_required: number;
    feasible: boolean;
    deficit: number;
  };
  constraints: {
    incompatible_pairs: Array<[string, string]>;
    dependencies: Array<{ before: string; after: string }>;
    weather_sensitive: string[];
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Phase 5 — Plans + Execution Events
// ─────────────────────────────────────────────────────────────────────────────

export type PlanStatus =
  | 'draft'
  | 'published'
  | 'in_progress'
  | 'confirmed'
  | 'closed'
  | 'cancelled';

export type ExecutionStatus = 'draft' | 'reported' | 'verified' | 'rejected';

export type BoardRole = 'admin' | 'assistant' | 'supervisor' | 'leader' | 'viewer' | 'member';

export interface WeeklyPlan {
  id: string;
  board_id: string;
  group_id: string;
  week_start: string;      // ISO date
  period_number: number;   // 1–4 (calculateContractWeek)
  status: PlanStatus;

  published_by: string | null;
  published_at: string | null;
  confirmed_by: string | null;
  confirmed_at: string | null;
  closed_by: string | null;
  closed_at: string | null;

  created_by: string;
  updated_by: string | null;
  created_at: string;
  updated_at: string;
}

export interface WeeklyPlanItem {
  id: string;
  plan_id: string;
  planned_sequence: number;
  activity_key: string;
  activity_standard_id: string;
  planned_rendimiento: number;    // snapshot del estándar al planificar
  planned_frecuencia: number;
  priority: ActivityPriority;
  planned_qty: number;
  unit: string;
  planned_jr: number;
  executed_qty: number;           // mantenido por trigger (reported + verified)
  executed_jr: number;            // mantenido por trigger (reported + verified)
  created_at: string;
  updated_at: string;
}

export interface WeeklyPlanItemExecution {
  id: string;
  plan_item_id: string;
  execution_date: string;       // ISO date
  crew_name: string | null;
  crew_leader_id: string | null;
  worker_count: number;
  started_at: string;           // ISO timestamptz
  finished_at: string;
  executed_qty: number;
  executed_jr: number;          // GENERATED: worker_count × duration_s / 28800
  status: ExecutionStatus;
  rejection_notes: string | null;
  verified_by: string | null;
  verified_at: string | null;
  notes: string | null;
  created_by: string;
  updated_by: string | null;
  created_at: string;
  updated_at: string;
}

// ─────────────────────────────────────────────────────────────────────────────
// Errores de dominio
// ─────────────────────────────────────────────────────────────────────────────

export class SchedulerMigrationMissingError extends Error {
  readonly tableName: string;

  constructor(tableName: string) {
    super(
      `Tabla "${tableName}" no encontrada. ` +
      `Aplica la migración 20260708_scheduler_engine.sql en el Dashboard de Supabase ` +
      `antes de usar el módulo de planificación.`
    );
    this.name = 'SchedulerMigrationMissingError';
    this.tableName = tableName;
  }
}

export class ActivityStandardNotFound extends Error {
  readonly boardId: string;
  readonly groupId: string | null;
  readonly activityKey: string;

  constructor(boardId: string, groupId: string | null, activityKey: string) {
    const scope = groupId ? `sitio ${groupId}` : 'contrato';
    super(
      `Sin estándar activo para "${activityKey}" en board "${boardId}" (${scope}). ` +
      `Verifica que board_activity_standards tenga una fila con effective_to IS NULL.`
    );
    this.name = 'ActivityStandardNotFound';
    this.boardId = boardId;
    this.groupId = groupId;
    this.activityKey = activityKey;
  }
}
