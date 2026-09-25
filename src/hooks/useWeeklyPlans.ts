'use client';

import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/lib/supabaseClient';
import { offlineDB } from '@/lib/offlineDB';
import { isNetworkError } from './useBoardData';
import { WeeklyPlan, WeeklyPlanItem, WeeklyPlanItemExecution, WeeklyPlanConfirmationSummary } from '@/types/scheduler';
import { ensureWeeklyPlanMaterialized } from '@/lib/scheduleMaterializationService';

// ─────────────────────────────────────────────────────────────────────────────
// Query keys
// ─────────────────────────────────────────────────────────────────────────────

export const weeklyPlanKeys = {
  all:        (boardId: string)              => ['weekly_plans', boardId] as const,
  byGroup:    (boardId: string, groupId: string) => ['weekly_plans', boardId, groupId] as const,
  plan:       (planId: string)               => ['weekly_plan', planId] as const,
  items:      (planId: string)               => ['weekly_plan_items', planId] as const,
  executions: (planItemId: string)           => ['weekly_plan_executions', planItemId] as const,
  publishedWeek: (weekStartISO: string)      => ['weekly_plans', 'published_week', weekStartISO] as const,
  confirmationSummary: (planId: string)      => ['weekly_plan_confirmation_summary', planId] as const,
};

// ─────────────────────────────────────────────────────────────────────────────
// useWeeklyPlans
//
// Lista de planes para un board, opcionalmente filtrados por sitio.
// Ordered by week_start DESC so the most recent plan appears first.
// ─────────────────────────────────────────────────────────────────────────────

export function useWeeklyPlans(boardId: string | undefined, groupId?: string | null) {
  return useQuery<WeeklyPlan[]>({
    queryKey: groupId
      ? weeklyPlanKeys.byGroup(boardId!, groupId)
      : weeklyPlanKeys.all(boardId!),
    queryFn: async () => {
      let query = supabase
        .from('weekly_plans')
        .select('*')
        .eq('board_id', boardId!)
        .order('week_start', { ascending: false });

      if (groupId) query = query.eq('group_id', groupId);

      const { data, error } = await query;
      if (error) throw error;
      return (data ?? []) as WeeklyPlan[];
    },
    enabled: !!boardId,
    staleTime: 30_000,
    refetchOnWindowFocus: false,
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// useWeeklyPlanWithItems
//
// Plan individual + sus items ordenados por planned_sequence.
// Usado cuando el asistente edita o revisa un plan específico.
// ─────────────────────────────────────────────────────────────────────────────

export interface WeeklyPlanWithItems {
  plan: WeeklyPlan;
  items: WeeklyPlanItem[];
}

export function useWeeklyPlanWithItems(planId: string | undefined) {
  return useQuery<WeeklyPlanWithItems>({
    queryKey: weeklyPlanKeys.plan(planId!),
    queryFn: async () => {
      const [planRes, itemsRes] = await Promise.all([
        supabase.from('weekly_plans').select('*').eq('id', planId!).single(),
        supabase
          .from('weekly_plan_items')
          .select('*')
          .eq('plan_id', planId!)
          .order('planned_sequence', { ascending: true }),
      ]);

      if (planRes.error) throw planRes.error;
      if (itemsRes.error) throw itemsRes.error;

      return {
        plan: planRes.data as WeeklyPlan,
        items: (itemsRes.data ?? []) as WeeklyPlanItem[],
      };
    },
    enabled: !!planId,
    staleTime: 30_000,
    refetchOnWindowFocus: false,
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// usePublishedWeekPlans
//
// Superficie del LÍDER (Mis actividades): planes publicados o en ejecución
// de la semana indicada, con sus items y el nombre del estándar, a través de
// TODOS los boards visibles para el usuario (RLS delimita la visibilidad —
// no hay asignación individual por líder; criterio: items del grupo para el
// plan publicado de la semana activa).
// ─────────────────────────────────────────────────────────────────────────────

import { extractCuratedEvidencePair, ExecutionAttachmentItem } from '@/lib/evidenceCuration';

export interface ExecutionEvidencePreviewDTO {
  id: string;
  storage_path: string;
  phase: 'before' | 'after';
}

export type VerificationSummaryStatus =
  | 'none'
  | 'draft'
  | 'reported'
  | 'evidence_pending'
  | 'verified'
  | 'confirmed'
  | 'closed'
  | 'rejected';

export interface ItemExecutionSummaryDTO {
  totalExecutions: number;
  lastExecutionDate: string | null;
  verificationStatus: VerificationSummaryStatus;
  latestRejectionNotes?: string | null;
  evidencePreview: {
    before: ExecutionEvidencePreviewDTO[];
    after: ExecutionEvidencePreviewDTO[];
  };
}

export interface PublishedWeekPlanItem extends WeeklyPlanItem {
  standard: { name: string; category: string; unit: string } | null;
  displayJr?: number;
  crew?: {
    id: string;
    name: string;
    code?: string;
    leader_name?: string | null;
    members_count?: number;
    members?: Array<{
      id: string;
      full_name: string;
      role_in_site?: string | null;
      zone?: string | null;
    }>;
  } | null;
  isRescheduled?: boolean;
  overrideReasonLabel?: string | null;
  is_manual_override?: boolean;
  override_reason?: string | null;
  occurrence_key?: string;
  executionsSummary?: ItemExecutionSummaryDTO | null;
}

export interface PublishedWeekPlan extends WeeklyPlan {
  group: { title: string; color: string | null } | null;
  board: { name: string } | null;
  items: PublishedWeekPlanItem[];
}

const CANONICAL_REASON_MAP: Record<string, string> = {
  WEATHER_DELAY: 'Condición Climática',
  LOGISTICS_EQUIPMENT: 'Equipo / Insumos',
  OPERATIONAL_PRIORITY: 'Prioridad Operativa',
  SUPERVISOR_ADJUSTMENT: 'Ajuste de Supervisión',
};

/**
 * Helper puro H6.5: Parsea y traduce la razón de reprogramación (`override_reason`)
 * extrayendo la entrada más reciente en historiales acumulativos (|) y traduciendo
 * códigos canónicos de ADR-0013 sin alterar datos en BD ni inventar categorías.
 */
export function formatOverrideReason(reason: string | null | undefined): string | null {
  if (!reason || typeof reason !== 'string') return null;
  const trimmed = reason.trim();
  if (!trimmed) return null;

  // Si existen múltiples entradas de historial separadas por |, tomar la última (más reciente)
  const segments = trimmed.split('|');
  const lastSegment = segments[segments.length - 1].trim();
  if (!lastSegment) return null;

  // 1. Extraer código estructurado de patrones como [RESCHEDULE:CODE] o [CODE]
  const rescheduleMatch = lastSegment.match(/\[RESCHEDULE:([A-Z_]+)\]/i) || lastSegment.match(/\[([A-Z_]+)\]/i);
  if (rescheduleMatch) {
    const code = rescheduleMatch[1].toUpperCase();
    if (CANONICAL_REASON_MAP[code]) {
      return CANONICAL_REASON_MAP[code];
    }
  }

  // 2. Verificar directamente si la última sección contiene un código canónico conocido
  for (const [code, label] of Object.entries(CANONICAL_REASON_MAP)) {
    if (lastSegment.toUpperCase().includes(code)) {
      return label;
    }
  }

  // 3. Si no tiene código estructurado, extraer el texto descriptivo removiendo bloques entre corchetes [...]
  const cleanText = lastSegment.replace(/\[[^\]]*\]/g, '').trim();
  if (cleanText) {
    return cleanText.length > 35 ? `${cleanText.substring(0, 35)}...` : cleanText;
  }

  return null;
}

/**
 * Proyección pura de ViewModel H6.4:
 * Calcula la participación de jornal por ocurrencia (`displayJr`) derivada 100% de la semántica H6.2:
 * displayJr = (plannedJrTotal * canonicalFrequency) / 25
 */
export function calculateOccurrenceDisplayJr(
  plannedJrTotal: number,
  canonicalFrequency: number
): number {
  if (canonicalFrequency <= 0 || plannedJrTotal <= 0) return 0;
  return (plannedJrTotal * canonicalFrequency) / 25;
}

function addDaysISO(iso: string, days: number): string {
  const parts = iso.split('-').map(Number);
  if (parts.length !== 3) return iso;
  const date = new Date(Date.UTC(parts[0], parts[1] - 1, parts[2] + days));
  const yS = date.getUTCFullYear();
  const mS = String(date.getUTCMonth() + 1).padStart(2, '0');
  const dS = String(date.getUTCDate()).padStart(2, '0');
  return `${yS}-${mS}-${dS}`;
}

function resolvePlannedDate(item: PublishedWeekPlanItem, actOccurrenceIndex: number, weekStartISO: string): string {
  if (item.planned_date) return item.planned_date;
  const freq = Number(item.planned_frecuencia || 1);

  if (freq === 1) {
    // Daily routine: Mon..Sat (offsets 0..5)
    const offsets = [0, 1, 2, 3, 4, 5];
    return addDaysISO(weekStartISO, offsets[actOccurrenceIndex % 6]);
  }
  if (Math.abs(freq - 2.083) < 0.1 || freq === 3) {
    // 3x/week: Mon, Wed, Fri
    const offsets = [0, 2, 4];
    return addDaysISO(weekStartISO, offsets[actOccurrenceIndex % 3]);
  }
  if (freq === 2) {
    // 2x/week: Mon, Thu
    const offsets = [0, 3];
    return addDaysISO(weekStartISO, offsets[actOccurrenceIndex % 2]);
  }
  if (freq === 4) {
    // 4x/week: Mon, Tue, Thu, Fri
    const offsets = [0, 1, 3, 4];
    return addDaysISO(weekStartISO, offsets[actOccurrenceIndex % 4]);
  }
  if (freq === 5) {
    // 5x/week: Mon..Fri
    const offsets = [0, 1, 2, 3, 4];
    return addDaysISO(weekStartISO, offsets[actOccurrenceIndex % 5]);
  }
  if (freq >= 6) {
    // 6x/week: Mon..Sat
    const offsets = [0, 1, 2, 3, 4, 5];
    return addDaysISO(weekStartISO, offsets[actOccurrenceIndex % 6]);
  }
  return addDaysISO(weekStartISO, 0);
}

export function usePublishedWeekPlans(weekStartISO: string | undefined) {
  return useQuery<PublishedWeekPlan[]>({
    queryKey: weeklyPlanKeys.publishedWeek(weekStartISO!),
    queryFn: async () => {
      // Nota (ADR-0002): weekly_plan_items ya no tiene FK a board_activity_standards
      // (activity_standard_id → poa_activity_zone_id), así que PostgREST no puede
      // embeber `standard:board_activity_standards(...)` como antes. name/category
      // siguen viviendo en el Catálogo Técnico; se resuelven aparte por activity_key
      // + board_id (dos boards pueden compartir el mismo activity_key) en vez de por
      // una relación de FK.
      try {
        let { data, error } = await supabase
          .from('weekly_plans')
          .select(`
            *,
            group:groups(*),
            board:boards(*),
            items:weekly_plan_items(*)
          `)
          .eq('week_start', weekStartISO!)
          .in('status', ['published', 'in_progress']);

        if (error) throw error;

        let plans = (data ?? []) as PublishedWeekPlan[];

        // Gatillo Independiente de Superficie: Si no existen planes para la semana,
        // garantizar la materialización determinística e idempotente para todos los sitios/boards.
        if (plans.length === 0) {
          const { data: boards } = await supabase.from('boards').select('id');
          const { data: groups } = await supabase.from('groups').select('id, title, board_id');

          if (boards && boards.length > 0) {
            for (const b of boards) {
              const bGroups = (groups || []).filter(
                (g: any) => g.board_id === b.id && !(g.title || '').toUpperCase().includes('PRESUPUESTO GENERAL')
              );
              if (bGroups.length > 0) {
                for (const g of bGroups) {
                  await ensureWeeklyPlanMaterialized(supabase, b.id, (g as any).id, weekStartISO!);
                }
              }
            }
          }

          const refetched = await supabase
            .from('weekly_plans')
            .select(`
              *,
              group:groups(*),
              board:boards(*),
              items:weekly_plan_items(*)
            `)
            .eq('week_start', weekStartISO!)
            .in('status', ['published', 'in_progress']);

          if (refetched.error) throw refetched.error;
          plans = (refetched.data ?? []) as PublishedWeekPlan[];
        }

        // Filtro Estricto de Dominio Operacional (H6.4):
        // Excluir exclusivamente grupos financieros (PRESUPUESTO GENERAL).
        // NO descartar planes publicados cuya lista de items esté temporalmente vacía.
        plans = plans.filter((plan) => {
          const groupTitle = (plan.group?.title || '').toUpperCase().trim();
          return !groupTitle.includes('PRESUPUESTO GENERAL');
        });

        const boardIds = [...new Set(plans.map((p) => p.board_id))];
        const activityKeys = [...new Set(plans.flatMap((p) => (p.items || []).map((i) => i.activity_key)))];
        const crewIds = [...new Set(plans.flatMap((p) => (p.items || []).map((i) => i.crew_id).filter(Boolean)))];

        let standards: any[] = [];
        let standardsByKey = new Map<string, { name: string; category: string; unit: string }>();
        if (boardIds.length > 0 && activityKeys.length > 0) {
          const { data: stdData, error: stdError } = await supabase
            .from('board_activity_standards')
            .select('*')
            .in('board_id', boardIds)
            .in('activity_key', activityKeys)
            .is('effective_to', null);
          if (stdError) throw stdError;
          standards = stdData ?? [];
          standardsByKey = new Map(standards.map((s: any) => [`${s.board_id}|${s.activity_key}`, s]));
        }

        let crewsByKey = new Map<string, any>();
        if (boardIds.length > 0 && crewIds.length > 0) {
          try {
            const { data: crewsData } = await supabase
              .from('crews')
              .select(`
                id,
                name,
                code,
                leader:personnel!crews_leader_id_fkey(name),
                members:crew_members(
                  id,
                  personnel_assignment_id,
                  assignment:personnel_site_assignments(
                    id,
                    role_in_site,
                    zone,
                    personnel:personnel(name)
                  )
                )
              `)
              .in('id', crewIds);

            for (const c of crewsData || []) {
              const rawMembers = (c as any).members || [];
              const members = rawMembers.map((m: any) => ({
                id: m.id,
                full_name: m.assignment?.personnel?.name || 'Desconocido',
                role_in_site: m.assignment?.role_in_site || null,
                zone: m.assignment?.zone || null,
              }));

              crewsByKey.set(c.id, {
                id: c.id,
                name: c.name,
                code: c.code,
                leader_name: (c as any).leader?.name || null,
                members_count: rawMembers.length,
                members,
              });
            }
          } catch (_crewErr) {
            // Graceful fallback for environments where crews table is empty or unmocked
          }
        }

        const allItemIds = plans.flatMap((p) => (p.items || []).map((i) => i.id));
        let executionsByItemMap = new Map<string, any[]>();
        let allExecutionIds: string[] = [];

        if (allItemIds.length > 0) {
          try {
            const { data: execsData } = await supabase
              .from('weekly_plan_item_executions')
              .select('id, weekly_plan_item_id, execution_date, status, verification_status, rejection_notes, created_at')
              .in('weekly_plan_item_id', allItemIds);

            for (const exec of execsData || []) {
              const list = executionsByItemMap.get(exec.weekly_plan_item_id) || [];
              list.push(exec);
              executionsByItemMap.set(exec.weekly_plan_item_id, list);
              allExecutionIds.push(exec.id);
            }
          } catch (_execErr) {
            // Graceful fallback
          }
        }

        let attachmentsByExecMap = new Map<string, ExecutionAttachmentItem[]>();
        if (allExecutionIds.length > 0) {
          try {
            const { data: attsData } = await supabase
              .from('execution_attachments')
              .select('id, execution_id, file_name, file_url, file_type, created_at, phase, file_hash')
              .in('execution_id', allExecutionIds);

            for (const att of attsData || []) {
              const list = attachmentsByExecMap.get(att.execution_id) || [];
              list.push({
                id: att.id,
                execution_id: att.execution_id,
                storage_path: att.file_url || `execution/${att.execution_id}/${att.file_name}`,
                file_hash: att.file_hash || att.id,
                phase: att.phase === 'before' || att.phase === 'after' ? att.phase : 'after',
                captured_at: att.created_at,
              });
              attachmentsByExecMap.set(att.execution_id, list);
            }
          } catch (_attErr) {
            // Graceful fallback
          }
        }

        for (const plan of plans) {
          plan.items = plan.items || [];
          plan.items.sort((a, b) => a.planned_sequence - b.planned_sequence);
          const actCounters = new Map<string, number>();

          for (const item of plan.items) {
            item.standard = standardsByKey.get(`${plan.board_id}|${item.activity_key}`) ?? null;

            // H6.4 ViewModel Display JR Projection (Planned JR total * canonicalFrequency / 25)
            const plannedJrTotal = Number(item.planned_jr ?? 0);
            const canonicalFreq = typeof item.planned_frecuencia === 'number' && Number.isFinite(item.planned_frecuencia) && item.planned_frecuencia > 0
              ? item.planned_frecuencia
              : undefined;

            item.displayJr = canonicalFreq !== undefined && plannedJrTotal > 0
              ? calculateOccurrenceDisplayJr(plannedJrTotal, canonicalFreq)
              : undefined;

            // Proyección consultiva de cuadrilla
            if (item.crew_id) {
              item.crew = crewsByKey.get(item.crew_id) ?? null;
            } else {
              item.crew = null;
            }

            // Proyección consultiva de trazabilidad de reprogramación (H6.5)
            item.isRescheduled = Boolean(item.is_manual_override);
            item.overrideReasonLabel = formatOverrideReason(item.override_reason);

            // Proyección consultiva de ejecuciones y evidencias curadas (H6.7)
            const itemExecs = executionsByItemMap.get(item.id) || [];
            if (itemExecs.length === 0) {
              item.executionsSummary = null;
            } else {
              const sortedExecs = [...itemExecs].sort((a, b) => (b.execution_date || '').localeCompare(a.execution_date || ''));
              const lastExecutionDate = sortedExecs[0]?.execution_date || null;

              let vStatus: VerificationSummaryStatus = 'none';
              if (itemExecs.some((e) => e.verification_status === 'rejected' || e.status === 'rejected')) {
                vStatus = 'rejected';
              } else if (itemExecs.some((e) => e.verification_status === 'evidence_pending')) {
                vStatus = 'evidence_pending';
              } else if (itemExecs.some((e) => e.verification_status === 'verified')) {
                vStatus = 'verified';
              } else if (itemExecs.some((e) => e.verification_status === 'confirmed')) {
                vStatus = 'confirmed';
              } else if (itemExecs.some((e) => e.verification_status === 'closed')) {
                vStatus = 'closed';
              } else if (itemExecs.some((e) => e.status === 'reported')) {
                vStatus = 'reported';
              } else if (itemExecs.some((e) => e.status === 'draft')) {
                vStatus = 'draft';
              }

              const itemAttachments: ExecutionAttachmentItem[] = [];
              for (const exec of itemExecs) {
                const atts = attachmentsByExecMap.get(exec.id) || [];
                itemAttachments.push(...atts);
              }

              const curatedPair = extractCuratedEvidencePair(itemAttachments, 2);

              // PO-02: Extracción determinista de latestRejectionNotes
              // Filtra ejecuciones rejected y ordena determinísticamente por created_at DESC, con id DESC como desempate
              const rejectedExecs = itemExecs
                .filter((e) => e.status === 'rejected' || e.verification_status === 'rejected')
                .sort((a, b) => {
                  const createdA = a.created_at || '';
                  const createdB = b.created_at || '';
                  const cmp = createdB.localeCompare(createdA);
                  if (cmp !== 0) return cmp;
                  return (b.id || '').localeCompare(a.id || '');
                });

              const latestRejectionNotes =
                rejectedExecs.length > 0 && rejectedExecs[0].rejection_notes?.trim()
                  ? rejectedExecs[0].rejection_notes.trim()
                  : null;

              item.executionsSummary = {
                totalExecutions: itemExecs.length,
                lastExecutionDate,
                verificationStatus: vStatus,
                latestRejectionNotes,
                evidencePreview: {
                  before: curatedPair.before.map((att) => ({
                    id: att.id,
                    storage_path: att.storage_path,
                    phase: 'before',
                  })),
                  after: curatedPair.after.map((att) => ({
                    id: att.id,
                    storage_path: att.storage_path,
                    phase: 'after',
                  })),
                },
              };
            }

            if (!item.planned_date) {
              const count = actCounters.get(item.activity_key) ?? 0;
              actCounters.set(item.activity_key, count + 1);
              item.planned_date = resolvePlannedDate(item, count, plan.week_start);
            }
          }
        }

        // Caché de lectura offline (docs/architecture/offline-certification-design.md,
        // Incremento 1). Grupo/board se guardan con fila completa (select *) para no
        // pisar con datos parciales lo que ya cacheó useBoard/useBoardGroups en el
        // mismo object store.
        if (offlineDB) {
          const plansOnly = plans.map(({ group, board, items, ...p }) => p);
          await offlineDB.upsertRecords('weekly_plans', plansOnly);
          const itemsOnly = plans.flatMap((p) => p.items.map(({ standard, ...i }) => i));
          if (itemsOnly.length > 0) await offlineDB.upsertRecords('weekly_plan_items', itemsOnly);
          const groupsOnly = plans.map((p) => p.group).filter(Boolean);
          if (groupsOnly.length > 0) await offlineDB.upsertRecords('groups', groupsOnly);
          const boardsOnly = plans.map((p) => p.board).filter(Boolean);
          if (boardsOnly.length > 0) await offlineDB.upsertRecords('boards', boardsOnly);
          if (standards.length > 0) await offlineDB.upsertRecords('board_activity_standards', standards);
        }

        return plans;
      } catch (err: any) {
        if (isNetworkError(err) && offlineDB) {
          console.log('[Offline] Published week plans query failed due to network. Falling back to IndexedDB.');

          const [localPlans, localItems, localGroups, localBoards, localStandards] = await Promise.all([
            offlineDB.getTable('weekly_plans'),
            offlineDB.getTable('weekly_plan_items'),
            offlineDB.getTable('groups'),
            offlineDB.getTable('boards'),
            offlineDB.getTable('board_activity_standards'),
          ]);

          const groupsById = new Map<string, any>(localGroups.map((g: any) => [String(g.id), g]));
          const boardsById = new Map<string, any>(localBoards.map((b: any) => [String(b.id), b]));
          const standardsByKey = new Map<string, any>(
            localStandards
              .filter((s: any) => s.effective_to === null)
              .map((s: any) => [`${s.board_id}|${s.activity_key}`, s]),
          );

          const filteredPlans = localPlans.filter(
            (p: any) => p.week_start === weekStartISO && ['published', 'in_progress'].includes(p.status),
          );

          return filteredPlans.map((p: any) => {
            const actCounters = new Map<string, number>();
            const items = localItems
              .filter((i: any) => String(i.plan_id) === String(p.id))
              .sort((a: any, b: any) => a.planned_sequence - b.planned_sequence)
              .map((i: any) => {
                const count = actCounters.get(i.activity_key) ?? 0;
                actCounters.set(i.activity_key, count + 1);
                const std = standardsByKey.get(`${p.board_id}|${i.activity_key}`);
                return {
                  ...i,
                  planned_date: i.planned_date || resolvePlannedDate(i, count, p.week_start),
                  standard: std ? { name: std.name, category: std.category, unit: std.unit } : null,
                };
              });

            const g = groupsById.get(String(p.group_id));
            const b = boardsById.get(String(p.board_id));

            return {
              ...p,
              group: g ? { title: g.title, color: g.color } : null,
              board: b ? { name: b.name } : null,
              items,
            };
          }) as PublishedWeekPlan[];
        }
        throw err;
      }
    },
    enabled: !!weekStartISO,
    staleTime: 30_000,
    refetchOnWindowFocus: false,
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// useWeeklyPlanExecutions
//
// Ejecuciones de un item específico, ordenadas por fecha.
// Se usa en la UI de registro de ejecución del líder.
// ─────────────────────────────────────────────────────────────────────────────

export function useWeeklyPlanExecutions(planItemId: string | undefined) {
  return useQuery<WeeklyPlanItemExecution[]>({
    queryKey: weeklyPlanKeys.executions(planItemId!),
    queryFn: async () => {
      try {
        const { data, error } = await supabase
          .from('weekly_plan_item_executions')
          .select('*')
          .eq('plan_item_id', planItemId!)
          .order('execution_date', { ascending: true })
          .order('created_at', { ascending: true });

        if (error) throw error;
        const executions = (data ?? []) as WeeklyPlanItemExecution[];
        if (offlineDB && executions.length > 0) {
          await offlineDB.upsertRecords('weekly_plan_item_executions', executions);
        }
        return executions;
      } catch (err: any) {
        if (isNetworkError(err) && offlineDB) {
          console.log('[Offline] Weekly plan executions query failed due to network. Falling back to IndexedDB.');
          const local = await offlineDB.getTable('weekly_plan_item_executions');
          return local
            .filter((e: any) => String(e.plan_item_id) === String(planItemId))
            .sort((a: any, b: any) => {
              if (a.execution_date !== b.execution_date) return a.execution_date < b.execution_date ? -1 : 1;
              return new Date(a.created_at).getTime() - new Date(b.created_at).getTime();
            }) as WeeklyPlanItemExecution[];
        }
        throw err;
      }
    },
    enabled: !!planItemId,
    staleTime: 15_000,
    refetchOnWindowFocus: false,
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// useWeeklyPlanConfirmationSummary
//
// Superficie de Confirmación (Cronograma): consumidor puro de
// get_weekly_plan_confirmation_summary(plan_id). El conteo por estado y la
// resolución de activity_name viven en SQL (mismo criterio que el Gate 2 de
// confirm_weekly_plan) — este hook no hace joins ni agregaciones, solo pide
// la RPC y expone su única fila de respuesta.
// ─────────────────────────────────────────────────────────────────────────────

export function useWeeklyPlanConfirmationSummary(planId: string | undefined) {
  return useQuery<WeeklyPlanConfirmationSummary>({
    queryKey: weeklyPlanKeys.confirmationSummary(planId!),
    queryFn: async () => {
      const { data, error } = await supabase.rpc('get_weekly_plan_confirmation_summary', {
        p_plan_id: planId!,
      });
      if (error) throw error;
      const row = (data ?? [])[0];
      if (!row) throw new Error('No se pudo calcular el resumen de confirmación del plan.');
      return row as WeeklyPlanConfirmationSummary;
    },
    enabled: !!planId,
    staleTime: 15_000,
    refetchOnWindowFocus: false,
  });
}
