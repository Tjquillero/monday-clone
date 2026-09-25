'use client';

// Superficie del LÍDER — Nivel 2: Vista del Sitio Seleccionado (/my-work)
// Aislamiento de contexto por sitio. Actividades ordenadas por prioridad de estado:
// 1. 🔴 PENDIENTES  2. 🟠 EN EJECUCIÓN  3. 🟢 COMPLETADAS
// Acción explícita "📷 REGISTRAR EJECUCIÓN" con touch target >= 44px para operarios en campo.

import { useState, useMemo } from 'react';
import {
  ArrowLeft,
  MapPin,
  Camera,
  CheckCircle2,
  Clock,
  AlertCircle,
  ChevronDown,
  Calendar,
  Users,
  RefreshCw,
} from 'lucide-react';
import { PublishedWeekPlan, PublishedWeekPlanItem, calculateOccurrenceDisplayJr } from '@/hooks/useWeeklyPlans';
import { ActivityPriority } from '@/types/scheduler';
import { classifyItemTemporalStatus } from '@/lib/myWorkTemporalProjection';
import ItemExecutions from './ItemExecutions';
import DailyActivityExecutionModal from './DailyActivityExecutionModal';
import { FieldReportResult } from '@/lib/fieldWorkflowExecutionService';
import { SupabaseClient } from '@supabase/supabase-js';

interface Props {
  plans: PublishedWeekPlan[];
  selectedGroupId?: string | null;
  onBackToSites?: () => void;
  userId?: string;
  supabaseClient?: SupabaseClient;
  onExecutionSuccess?: (result: FieldReportResult) => void;
  operationalTodayISO?: string;
  showAllWeek?: boolean;
}

const PRIORITY_LABEL: Record<ActivityPriority, { text: string; cls: string }> = {
  must_execute: { text: 'Obligatoria', cls: 'bg-red-50 text-red-600 border-red-200' },
  preferred: { text: 'Preferente', cls: 'bg-amber-50 text-amber-600 border-amber-200' },
  flexible: { text: 'Flexible', cls: 'bg-slate-50 text-slate-500 border-slate-200' },
};

function formatNumber(n: number): string {
  return Number.isInteger(n) ? String(n) : n.toFixed(1);
}

function formatActivityKey(key?: string): string {
  if (!key) return 'Actividad General';
  return key.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
}

function formatDayName(dateIso?: string): string {
  if (!dateIso || dateIso.length < 10) return 'Sin fecha';
  const parts = dateIso.split('-');
  if (parts.length !== 3) return dateIso;
  const year = parseInt(parts[0], 10);
  const month = parseInt(parts[1], 10) - 1;
  const day = parseInt(parts[2], 10);
  const date = new Date(year, month, day);

  const days = ['DOM', 'LUN', 'MAR', 'MIÉ', 'JUE', 'VIE', 'SÁB'];
  const months = ['ENE', 'FEB', 'MAR', 'ABR', 'MAY', 'JUN', 'JUL', 'AGO', 'SEP', 'OCT', 'NOV', 'DIC'];

  const dayOfWeek = days[date.getDay()] || '';
  const monthStr = months[month] || '';
  return `${dayOfWeek} ${day} ${monthStr}`;
}

export function SingleActivityCard({
  item,
  planId,
  boardId,
  groupId,
  userId,
  supabaseClient,
  onExecutionSuccess,
}: {
  item: PublishedWeekPlanItem;
  planId: string;
  boardId: string;
  groupId: string;
  userId?: string;
  supabaseClient?: SupabaseClient;
  onExecutionSuccess?: (result: FieldReportResult) => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [showCrewMembers, setShowCrewMembers] = useState(false);

  const name = item.standard?.name ?? item.name ?? formatActivityKey(item.activity_key);
  const category = item.standard?.category ?? item.zone;
  const priority = PRIORITY_LABEL[item.priority] ?? PRIORITY_LABEL.flexible;

  const plannedQty = item.planned_qty || 0;
  const executedQty = item.executed_qty || 0;
  const progress = plannedQty > 0 ? Math.min(100, Math.round((executedQty / plannedQty) * 100)) : 0;

  // H6.4 ViewModel Display JR Projection (proyectado soberanamente por el ViewModel sin recalcular en la UI)
  const displayJr = item.displayJr;

  const status: 'pending' | 'in_progress' | 'completed' =
    executedQty === 0 ? 'pending' : executedQty < plannedQty ? 'in_progress' : 'completed';

  const handleModalSuccess = (result: FieldReportResult) => {
    if (onExecutionSuccess) {
      onExecutionSuccess(result);
    }
  };

  return (
    <div className="bg-[var(--card-bg)] rounded-[var(--radius-surface)] border border-[var(--border-color)] shadow-2xs hover:shadow-xs transition-all overflow-hidden">
      <div className="p-4 sm:p-5 space-y-3">
        {/* Cabecera de la Actividad: Título + Badges */}
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0 flex-1">
            <h4 className="text-base sm:text-lg font-bold text-[var(--text-primary)] leading-snug break-words">
              {name}
            </h4>
            {category && (
              <p className="text-xs font-semibold text-[var(--text-muted)] uppercase tracking-wide mt-0.5">
                {category}
              </p>
            )}
          </div>

          <div className="flex items-center gap-1.5 shrink-0">
            <span className={`px-2 py-0.5 rounded-full border text-[10px] font-bold uppercase tracking-wide ${priority.cls}`}>
              {priority.text}
            </span>
          </div>
        </div>

        {/* Proyección Consultiva de Cuadrilla e Integrantes Asignados (H6.4 / H6.6) */}
        {item.crew && (
          <div className="space-y-1.5 text-xs text-[var(--text-secondary)] bg-[var(--color-surface-subtle)] p-2.5 rounded-[var(--radius-control)] border border-[var(--border-color)]">
            <div className="flex flex-wrap items-center justify-between gap-1.5">
              <div className="flex items-center gap-1.5 min-w-0">
                <Users className="w-4 h-4 text-[var(--color-primary)] shrink-0" />
                <span className="font-bold text-[var(--text-primary)]">{item.crew.name}</span>
                {item.crew.leader_name && (
                  <span className="text-[var(--text-muted)]">· Líder: {item.crew.leader_name}</span>
                )}
                {typeof item.crew.members_count === 'number' && (
                  <span className="text-[var(--text-muted)]">({item.crew.members_count} miembros)</span>
                )}
              </div>

              {item.crew.members && item.crew.members.length > 0 && (
                <button
                  type="button"
                  onClick={() => setShowCrewMembers((v) => !v)}
                  className="text-[11px] font-semibold text-[var(--color-primary)] hover:underline flex items-center gap-1 shrink-0 ml-auto select-none"
                  aria-expanded={showCrewMembers}
                >
                  <span>{showCrewMembers ? 'Ocultar integrantes' : 'Ver integrantes'}</span>
                  <ChevronDown className={`w-3 h-3 transition-transform ${showCrewMembers ? 'rotate-180' : ''}`} />
                </button>
              )}
            </div>

            {showCrewMembers && item.crew.members && item.crew.members.length > 0 && (
              <div className="pt-2 border-t border-[var(--border-color)] space-y-1" data-testid="crew-members-list">
                {item.crew.members.map((member) => (
                  <div key={member.id} className="flex items-center justify-between text-[11px] py-0.5">
                    <span className="font-medium text-[var(--text-secondary)]">{member.full_name}</span>
                    <span className="text-[var(--text-muted)] italic">
                      {member.role_in_site && member.role_in_site.trim() ? member.role_in_site : 'Sin rol asignado'}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Insignia Consultiva de Trazabilidad de Reprogramación (H6.5) */}
        {item.isRescheduled && (
          <div className="flex items-center gap-1.5 text-xs font-semibold text-[var(--color-warning)] bg-amber-500/10 border border-amber-500/30 p-2 rounded-[var(--radius-control)] w-fit">
            <RefreshCw className="w-3.5 h-3.5 text-[var(--color-warning)] shrink-0" />
            <span>Reprogramada{item.overrideReasonLabel ? ` · ${item.overrideReasonLabel}` : ''}</span>
          </div>
        )}

        {/* Proyección Consultiva de Contexto Físico de Ejecución y Evidencias Curadas (H6.7) */}
        {item.executionsSummary && (
          <div className="space-y-2 text-xs bg-[var(--color-surface-subtle)] p-2.5 rounded-[var(--radius-control)] border border-[var(--border-color)]" data-testid="execution-summary-block">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <span className="font-semibold text-[var(--text-secondary)]">
                  {item.executionsSummary.totalExecutions} {item.executionsSummary.totalExecutions === 1 ? 'ejecución' : 'ejecuciones'}
                  {item.executionsSummary.lastExecutionDate ? ` · Última: ${item.executionsSummary.lastExecutionDate}` : ''}
                </span>
              </div>

              <span className={`px-2 py-0.5 rounded-full border text-[10px] font-bold uppercase tracking-wide ${
                item.executionsSummary.verificationStatus === 'verified' || item.executionsSummary.verificationStatus === 'confirmed' || item.executionsSummary.verificationStatus === 'closed'
                  ? 'bg-emerald-500/10 text-[var(--color-success)] border-emerald-500/30'
                  : item.executionsSummary.verificationStatus === 'evidence_pending'
                  ? 'bg-amber-500/10 text-[var(--color-warning)] border-amber-500/30'
                  : item.executionsSummary.verificationStatus === 'reported'
                  ? 'bg-blue-500/10 text-[var(--color-info)] border-blue-500/30'
                  : item.executionsSummary.verificationStatus === 'rejected'
                  ? 'bg-red-500/10 text-[var(--color-danger)] border-red-500/30'
                  : 'bg-[var(--color-surface-subtle)] text-[var(--text-muted)] border-[var(--border-color)]'
              }`}>
                {item.executionsSummary.verificationStatus === 'verified' ? 'Verificada'
                  : item.executionsSummary.verificationStatus === 'confirmed' ? 'Confirmada'
                  : item.executionsSummary.verificationStatus === 'closed' ? 'Cerrada'
                  : item.executionsSummary.verificationStatus === 'evidence_pending' ? 'Pendiente de Evidencia'
                  : item.executionsSummary.verificationStatus === 'reported' ? 'Reportada'
                  : item.executionsSummary.verificationStatus === 'rejected' ? 'Rechazada'
                  : item.executionsSummary.verificationStatus === 'draft' ? 'Borrador'
                  : 'Sin ejecuciones'}
              </span>
            </div>

            {/* Previsualización Fotográfica Consultiva ANTES / DESPUÉS (Curadas determinísticamente max 2/fase) */}
            {(item.executionsSummary.evidencePreview.before.length > 0 || item.executionsSummary.evidencePreview.after.length > 0) && (
              <div className="pt-1.5 border-t border-[var(--border-color)] flex flex-wrap gap-3" data-testid="evidence-preview-container">
                {item.executionsSummary.evidencePreview.before.length > 0 && (
                  <div className="space-y-1">
                    <span className="text-[10px] font-extrabold uppercase text-[var(--text-muted)] tracking-wider">Antes ({item.executionsSummary.evidencePreview.before.length})</span>
                    <div className="flex gap-1.5">
                      {item.executionsSummary.evidencePreview.before.map((img) => (
                        <div key={img.id} className="relative w-12 h-12 rounded-[var(--radius-control)] bg-[var(--color-surface-subtle)] border border-[var(--border-color)] overflow-hidden shadow-2xs">
                          <img src={img.storage_path} alt="Antes" className="w-full h-full object-cover" />
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {item.executionsSummary.evidencePreview.after.length > 0 && (
                  <div className="space-y-1">
                    <span className="text-[10px] font-extrabold uppercase text-[var(--text-muted)] tracking-wider">Después ({item.executionsSummary.evidencePreview.after.length})</span>
                    <div className="flex gap-1.5">
                      {item.executionsSummary.evidencePreview.after.map((img) => (
                        <div key={img.id} className="relative w-12 h-12 rounded-[var(--radius-control)] bg-[var(--color-surface-subtle)] border border-[var(--border-color)] overflow-hidden shadow-2xs">
                          <img src={img.storage_path} alt="Después" className="w-full h-full object-cover" />
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        )}

        {/* Banner Consultivo de Observación Supervisora Previa (PO-02) */}
        {item.executionsSummary?.latestRejectionNotes && (
          <div
            className="p-3 bg-red-500/10 border border-red-500/30 rounded-[var(--radius-control)] space-y-1 text-xs"
            data-testid="rejection-observation-banner"
          >
            <div className="flex items-center gap-1.5 font-bold text-[var(--color-danger)]">
              <AlertCircle className="w-4 h-4 shrink-0 text-[var(--color-danger)]" />
              <span>Observación de Supervisión (Ejecución Anterior)</span>
            </div>
            <p className="text-[var(--color-danger)] font-medium pl-5 leading-relaxed">
              {item.executionsSummary.latestRejectionNotes}
            </p>
          </div>
        )}

        {/* Info Operativa: Fecha Programada, displayJr por Ocurrencia & Avance Físico */}
        <div className="flex flex-wrap items-center justify-between text-xs text-[var(--text-secondary)] gap-2 pt-1">
          <div className="flex items-center gap-2 text-[var(--text-muted)] font-medium">
            <div className="flex items-center gap-1.5">
              <Calendar className="w-3.5 h-3.5 text-[var(--text-muted)]" />
              <span className="font-mono">Programada: {formatDayName(item.planned_date)}</span>
            </div>
            {typeof displayJr === 'number' && !isNaN(displayJr) && (
              <span className="font-bold font-mono text-[var(--color-primary)] bg-[var(--color-primary-subtle)] px-2 py-0.5 rounded-[var(--radius-control)] text-[11px]">
                {displayJr.toFixed(2)} JR / ocurrencia
              </span>
            )}
          </div>

          <div className="text-right">
            <span className="font-bold font-mono text-[var(--text-primary)]">{formatNumber(executedQty)}</span> /{' '}
            <span className="font-semibold font-mono text-[var(--text-secondary)]">{formatNumber(plannedQty)}</span>{' '}
            <span className="text-[var(--text-muted)]">{item.unit}</span>
          </div>
        </div>

        {/* Barra de Progreso Físico */}
        <div className="space-y-1">
          <div className="flex items-center justify-between text-[11px] text-[var(--text-muted)]">
            <span>Avance de obra</span>
            <span className="font-bold font-mono text-[var(--text-primary)]">{progress}%</span>
          </div>
          <div className="h-2 bg-[var(--color-surface-subtle)] rounded-full overflow-hidden border border-[var(--border-color)]">
            <div
              className={`h-full rounded-full transition-all ${
                status === 'completed' ? 'bg-[var(--color-success)]' : status === 'in_progress' ? 'bg-[var(--color-warning)]' : 'bg-[var(--color-primary)]'
              }`}
              style={{ width: `${progress}%` }}
            />
          </div>
        </div>

        {/* BOTÓN PRINCIPAL DE ACCIÓN (Touch target >= 44px) */}
        <div className="pt-2 flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-2 border-t border-[var(--border-color)]">
          {status === 'pending' && (
            <button
              type="button"
              onClick={() => setIsModalOpen(true)}
              className="w-full min-h-[48px] px-4 py-3 bg-[var(--color-danger)] hover:bg-red-700 active:bg-red-800 text-white rounded-[var(--radius-control)] text-sm font-bold flex items-center justify-center gap-2 transition-all shadow-sm active:scale-[0.99] touch-manipulation"
            >
              <Camera className="w-5 h-5 shrink-0" />
              <span>{item.executionsSummary?.latestRejectionNotes ? 'CORREGIR Y REGISTRAR' : 'REGISTRAR EJECUCIÓN'}</span>
            </button>
          )}

          {status === 'in_progress' && (
            <button
              type="button"
              onClick={() => setIsModalOpen(true)}
              className="w-full min-h-[48px] px-4 py-3 bg-[var(--color-accent)] hover:bg-[var(--color-accent-hover)] active:bg-[var(--color-accent)] text-white rounded-[var(--radius-control)] text-sm font-bold flex items-center justify-center gap-2 transition-all shadow-sm active:scale-[0.99] touch-manipulation"
            >
              <Camera className="w-5 h-5 shrink-0" />
              <span>{item.executionsSummary?.verificationStatus === 'rejected' ? 'CORREGIR Y REGISTRAR' : 'CONTINUAR REGISTRO'}</span>
            </button>
          )}

          {status === 'completed' && (
            <button
              type="button"
              onClick={() => setIsModalOpen(true)}
              className="w-full min-h-[44px] px-4 py-2.5 bg-[var(--color-surface-subtle)] hover:bg-[var(--border-color)] text-[var(--text-primary)] rounded-[var(--radius-control)] text-xs font-bold flex items-center justify-center gap-2 transition-all active:scale-[0.99] touch-manipulation"
            >
              <CheckCircle2 className="w-4 h-4 text-[var(--color-success)] shrink-0" />
              <span>VER REGISTRO</span>
            </button>
          )}

          {/* Toggle para ver historial secundario */}
          <button
            type="button"
            onClick={() => setExpanded((v) => !v)}
            className="self-center sm:self-auto py-1 px-2 text-xs font-semibold text-[var(--text-muted)] hover:text-[var(--text-secondary)] flex items-center gap-1 select-none"
          >
            <span>{expanded ? 'Ocultar historial' : 'Historial'}</span>
            <ChevronDown className={`w-3.5 h-3.5 transition-transform ${expanded ? 'rotate-180' : ''}`} />
          </button>
        </div>
      </div>

      {/* Historial Plegable de Jornadas Previas */}
      {expanded && (
        <div className="p-4 bg-[var(--color-surface-subtle)] border-t border-[var(--border-color)]">
          <ItemExecutions planId={planId} groupId={groupId} planItemId={item.id} unit={item.unit} />
        </div>
      )}

      {/* Modal de Registro de Ejecución y Evidencia */}
      <DailyActivityExecutionModal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        onSuccess={handleModalSuccess}
        item={item}
        boardId={boardId}
        groupId={groupId}
        userId={userId}
        supabase={supabaseClient}
      />
    </div>
  );
}

interface SiteActivitiesPlanSectionProps {
  plan: PublishedWeekPlan;
  onBackToSites?: () => void;
  userId?: string;
  supabaseClient?: SupabaseClient;
  onExecutionSuccess?: (result: FieldReportResult) => void;
  operationalTodayISO?: string;
  showAllWeek?: boolean;
}

export function SiteActivitiesPlanSection({
  plan,
  onBackToSites,
  userId,
  supabaseClient,
  onExecutionSuccess,
  operationalTodayISO,
  showAllWeek = false,
}: SiteActivitiesPlanSectionProps) {
  const [selectedCrewFilter, setSelectedCrewFilter] = useState<string>('all');
  const siteName = plan.group?.title ?? 'Sitio General';

  let rawItems = plan.items || [];
  if (operationalTodayISO && !showAllWeek) {
    rawItems = rawItems.filter(
      (item) => classifyItemTemporalStatus(item, operationalTodayISO) === 'TODAY'
    );
  }
  const allItems = rawItems;

  // PO-03 / AC-01: Catálogo determinista de cuadrillas del sitio (name ASC, id ASC)
  const crewsList = useMemo(() => {
    const crewsMap = new Map<string, { id: string; name: string; leader_name?: string | null; members_count?: number }>();
    for (const item of allItems) {
      const crewObj = item.crew;
      if (crewObj && crewObj.id) {
        crewsMap.set(crewObj.id, {
          id: crewObj.id,
          name: crewObj.name || 'Sin nombre',
          leader_name: crewObj.leader_name,
          members_count: crewObj.members_count,
        });
      }
    }
    return Array.from(crewsMap.values()).sort((a, b) => {
      const nameCmp = a.name.localeCompare(b.name, 'es', { sensitivity: 'base' });
      if (nameCmp !== 0) return nameCmp;
      return a.id.localeCompare(b.id);
    });
  }, [allItems]);

  // PO-03 / AC-05: Contadores de actividades del sitio antes de aplicar filtros de estado y cuadrilla
  const crewCounts: Record<string, number> = {
    all: allItems.length,
    unassigned: 0,
  };
  for (const item of allItems) {
    const crewId = item.crew?.id || item.crew_id;
    if (crewId) {
      crewCounts[crewId] = (crewCounts[crewId] || 0) + 1;
    } else {
      crewCounts.unassigned = (crewCounts.unassigned || 0) + 1;
    }
  }

  // PO-03 / AC-02 & AC-03: Filtrado consultivo puro por cuadrilla
  const filteredItems = allItems.filter((item) => {
    if (selectedCrewFilter === 'all') return true;
    if (selectedCrewFilter === 'unassigned') {
      return !item.crew_id && !item.crew?.id;
    }
    return item.crew_id === selectedCrewFilter || item.crew?.id === selectedCrewFilter;
  });

  // Agrupar actividades filtradas por estado estricto:
  // 1. Pendientes  2. En ejecución  3. Completadas
  const pendingItems: PublishedWeekPlanItem[] = [];
  const inProgressItems: PublishedWeekPlanItem[] = [];
  const completedItems: PublishedWeekPlanItem[] = [];

  for (const item of filteredItems) {
    const plannedQty = item.planned_qty || 0;
    const executedQty = item.executed_qty || 0;

    if (executedQty === 0) {
      pendingItems.push(item);
    } else if (executedQty < plannedQty) {
      inProgressItems.push(item);
    } else {
      completedItems.push(item);
    }
  }

  return (
    <section className="space-y-5">
      {/* ENCABEZADO DEL NIVEL 2: Volver + Nombre del Sitio */}
      <header className="bg-[var(--card-bg)] rounded-[var(--radius-surface)] border border-[var(--border-color)] shadow-2xs p-4 sm:p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-3 transition-colors">
        <div className="flex items-center gap-3">
          {onBackToSites && (
            <button
              type="button"
              onClick={onBackToSites}
              className="min-h-[44px] px-3.5 py-2.5 rounded-[var(--radius-control)] bg-[var(--color-surface-subtle)] hover:bg-[var(--border-color)] text-[var(--text-primary)] text-xs font-bold flex items-center gap-1.5 transition-all shrink-0 active:scale-95 touch-manipulation"
              aria-label="Volver a lista de sitios"
            >
              <ArrowLeft className="w-4 h-4" />
              <span className="hidden sm:inline">Mis sitios</span>
            </button>
          )}

          <div className="min-w-0">
            <div className="flex items-center gap-1.5 text-xs text-[var(--text-muted)] font-semibold uppercase tracking-wider">
              <MapPin className="w-3.5 h-3.5 text-[var(--color-primary)] shrink-0" />
              <span>Sitio Seleccionado</span>
            </div>
            <h2 className="text-xl sm:text-2xl font-brand font-extrabold text-[var(--text-primary)] leading-tight truncate">
              {siteName}
            </h2>
          </div>
        </div>

        <div className="flex items-center gap-2 self-start sm:self-auto text-xs font-bold text-[var(--text-secondary)] bg-[var(--color-surface-subtle)] px-3 py-1.5 rounded-[var(--radius-control)] border border-[var(--border-color)]">
          <span>{allItems.length} actividades totales</span>
        </div>
      </header>

      {/* PO-03: BARRA DE FILTRADO CONSULTIVO POR CUADRILLA */}
      {allItems.length > 0 && (
        <div className="bg-[var(--card-bg)] rounded-[var(--radius-surface)] border border-[var(--border-color)] p-3 shadow-2xs space-y-2 transition-colors">
          <div className="flex items-center justify-between px-1">
            <div className="flex items-center gap-1.5 text-xs font-bold text-[var(--text-secondary)]">
              <Users className="w-3.5 h-3.5 text-[var(--color-primary)] shrink-0" />
              <span>Filtro por Cuadrilla:</span>
            </div>
            {selectedCrewFilter !== 'all' && (
              <button
                type="button"
                onClick={() => setSelectedCrewFilter('all')}
                className="text-[11px] font-semibold text-[var(--color-primary)] hover:underline transition-colors"
              >
                Ver todas
              </button>
            )}
          </div>

          <div className="flex items-center gap-2 overflow-x-auto pb-1 pt-0.5 no-scrollbar" role="tablist" aria-label="Filtro de cuadrilla">
            {/* Chip: Todas */}
            <button
              type="button"
              role="tab"
              aria-selected={selectedCrewFilter === 'all'}
              onClick={() => setSelectedCrewFilter('all')}
              data-testid="crew-filter-chip-all"
              className={`min-h-[40px] px-3.5 py-1.5 rounded-[var(--radius-control)] text-xs font-bold flex items-center gap-2 transition-all shrink-0 select-none touch-manipulation ${
                selectedCrewFilter === 'all'
                  ? 'bg-[var(--color-primary)] text-white shadow-xs'
                  : 'bg-[var(--color-surface-subtle)] text-[var(--text-secondary)] hover:bg-[var(--border-color)] hover:text-[var(--text-primary)]'
              }`}
            >
              <span>Todas</span>
              <span
                className={`px-1.5 py-0.5 rounded-full text-[10px] font-extrabold font-mono ${
                  selectedCrewFilter === 'all' ? 'bg-white/20 text-white' : 'bg-[var(--border-color)] text-[var(--text-primary)]'
                }`}
              >
                {crewCounts.all}
              </span>
            </button>

            {/* Chips: Cuadrillas del Sitio */}
            {crewsList.map((crew) => {
              const isSelected = selectedCrewFilter === crew.id;
              const count = crewCounts[crew.id] || 0;
              return (
                <button
                  key={crew.id}
                  type="button"
                  role="tab"
                  aria-selected={isSelected}
                  onClick={() => setSelectedCrewFilter(crew.id)}
                  data-testid={`crew-filter-chip-${crew.id}`}
                  className={`min-h-[40px] px-3.5 py-1.5 rounded-[var(--radius-control)] text-xs font-bold flex items-center gap-2 transition-all shrink-0 select-none touch-manipulation ${
                    isSelected
                      ? 'bg-[var(--color-primary)] text-white shadow-xs'
                      : 'bg-[var(--color-surface-subtle)] text-[var(--text-secondary)] hover:bg-[var(--border-color)] hover:text-[var(--text-primary)]'
                  }`}
                >
                  <span className="truncate max-w-[160px]">{crew.name}</span>
                  <span
                    className={`px-1.5 py-0.5 rounded-full text-[10px] font-extrabold font-mono ${
                      isSelected ? 'bg-white/20 text-white' : 'bg-[var(--border-color)] text-[var(--text-primary)]'
                    }`}
                  >
                    {count}
                  </span>
                </button>
              );
            })}

            {/* Chip: Sin Asignar */}
            {crewCounts.unassigned > 0 && (
              <button
                type="button"
                role="tab"
                aria-selected={selectedCrewFilter === 'unassigned'}
                onClick={() => setSelectedCrewFilter('unassigned')}
                data-testid="crew-filter-chip-unassigned"
                className={`min-h-[40px] px-3.5 py-1.5 rounded-[var(--radius-control)] text-xs font-bold flex items-center gap-2 transition-all shrink-0 select-none touch-manipulation ${
                  selectedCrewFilter === 'unassigned'
                    ? 'bg-[var(--text-secondary)] text-white shadow-xs'
                    : 'bg-[var(--color-surface-subtle)] text-[var(--text-muted)] hover:bg-[var(--border-color)] hover:text-[var(--text-primary)]'
                }`}
              >
                <span>Sin asignar</span>
                <span
                  className={`px-1.5 py-0.5 rounded-full text-[10px] font-extrabold font-mono ${
                    selectedCrewFilter === 'unassigned' ? 'bg-white/20 text-white' : 'bg-[var(--border-color)] text-[var(--text-primary)]'
                  }`}
                >
                  {crewCounts.unassigned}
                </span>
              </button>
            )}
          </div>
        </div>
      )}

      {/* SECCIÓN 1: 🔴 PENDIENTES (Primero) */}
      {pendingItems.length > 0 && (
        <div className="space-y-3">
          <div className="flex items-center gap-2 px-1">
            <span className="w-2.5 h-2.5 rounded-full bg-[var(--color-danger)] animate-pulse" />
            <h3 className="text-xs font-extrabold uppercase tracking-wider text-[var(--color-danger)] flex items-center gap-1.5">
              <AlertCircle className="w-4 h-4 text-[var(--color-danger)]" />
              <span>Pendientes ({pendingItems.length})</span>
            </h3>
          </div>

          <div className="space-y-3">
            {pendingItems.map((item) => (
              <SingleActivityCard
                key={item.id}
                item={item}
                planId={plan.id}
                boardId={plan.board_id}
                groupId={plan.group_id}
                userId={userId}
                supabaseClient={supabaseClient}
                onExecutionSuccess={onExecutionSuccess}
              />
            ))}
          </div>
        </div>
      )}

      {/* SECCIÓN 2: 🟠 EN EJECUCIÓN (Segundo) */}
      {inProgressItems.length > 0 && (
        <div className="space-y-3 pt-2">
          <div className="flex items-center gap-2 px-1">
            <span className="w-2.5 h-2.5 rounded-full bg-[var(--color-warning)]" />
            <h3 className="text-xs font-extrabold uppercase tracking-wider text-[var(--color-warning)] flex items-center gap-1.5">
              <Clock className="w-4 h-4 text-[var(--color-warning)]" />
              <span>En Ejecución ({inProgressItems.length})</span>
            </h3>
          </div>

          <div className="space-y-3">
            {inProgressItems.map((item) => (
              <SingleActivityCard
                key={item.id}
                item={item}
                planId={plan.id}
                boardId={plan.board_id}
                groupId={plan.group_id}
                userId={userId}
                supabaseClient={supabaseClient}
                onExecutionSuccess={onExecutionSuccess}
              />
            ))}
          </div>
        </div>
      )}

      {/* SECCIÓN 3: 🟢 COMPLETADAS (Al Final) */}
      {completedItems.length > 0 && (
        <div className="space-y-3 pt-2">
          <div className="flex items-center gap-2 px-1">
            <span className="w-2.5 h-2.5 rounded-full bg-[var(--color-success)]" />
            <h3 className="text-xs font-extrabold uppercase tracking-wider text-[var(--color-success)] flex items-center gap-1.5">
              <CheckCircle2 className="w-4 h-4 text-[var(--color-success)]" />
              <span>Completadas ({completedItems.length})</span>
            </h3>
          </div>

          <div className="space-y-3">
            {completedItems.map((item) => (
              <SingleActivityCard
                key={item.id}
                item={item}
                planId={plan.id}
                boardId={plan.board_id}
                groupId={plan.group_id}
                userId={userId}
                supabaseClient={supabaseClient}
                onExecutionSuccess={onExecutionSuccess}
              />
            ))}
          </div>
        </div>
      )}

      {/* Estado vacío por filtro */}
      {allItems.length > 0 && filteredItems.length === 0 && (
        <div
          className="p-8 text-center bg-[var(--color-surface-subtle)] rounded-[var(--radius-surface)] border border-[var(--border-color)]"
          data-testid="crew-filter-empty-state"
        >
          <p className="text-sm font-semibold text-[var(--text-secondary)]">
            No se encontraron actividades para la cuadrilla seleccionada en este sitio.
          </p>
          <button
            type="button"
            onClick={() => setSelectedCrewFilter('all')}
            className="mt-3 px-4 py-2 bg-[var(--card-bg)] hover:bg-[var(--border-color)] text-[var(--text-primary)] text-xs font-bold rounded-[var(--radius-control)] border border-[var(--border-color)] transition-colors"
          >
            Mostrar todas las actividades
          </button>
        </div>
      )}

      {allItems.length === 0 && (
        <div className="p-8 text-center bg-[var(--color-surface-subtle)] rounded-[var(--radius-surface)] border border-[var(--border-color)]">
          <p className="text-sm font-semibold text-[var(--text-muted)]">Este sitio no tiene actividades en esta semana.</p>
        </div>
      )}
    </section>
  );
}

export default function ActividadesView({
  plans,
  selectedGroupId,
  onBackToSites,
  userId,
  supabaseClient,
  onExecutionSuccess,
  operationalTodayISO,
  showAllWeek,
}: Props) {
  // Filtrar planes al grupo/sitio seleccionado si existe
  const targetPlans = selectedGroupId
    ? plans.filter((p) => p.group_id === selectedGroupId)
    : plans;

  if (targetPlans.length === 0 && selectedGroupId) {
    return (
      <div className="space-y-4">
        {onBackToSites && (
          <button
            type="button"
            onClick={onBackToSites}
            className="min-h-[44px] px-3.5 py-2 rounded-[var(--radius-control)] bg-[var(--color-surface-subtle)] hover:bg-[var(--border-color)] text-[var(--text-primary)] text-xs font-bold flex items-center gap-1.5 transition-colors"
          >
            <ArrowLeft className="w-4 h-4" />
            <span>Mis sitios</span>
          </button>
        )}
        <div className="p-8 text-center bg-[var(--color-surface-subtle)] rounded-[var(--radius-surface)] border border-[var(--border-color)]">
          <p className="text-sm font-semibold text-[var(--text-secondary)]">No se encontraron actividades para este sitio.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6 max-w-full overflow-x-hidden">
      {targetPlans.map((plan) => (
        <SiteActivitiesPlanSection
          key={plan.id}
          plan={plan}
          onBackToSites={onBackToSites}
          userId={userId}
          supabaseClient={supabaseClient}
          onExecutionSuccess={onExecutionSuccess}
          operationalTodayISO={operationalTodayISO}
          showAllWeek={showAllWeek}
        />
      ))}
    </div>
  );
}
