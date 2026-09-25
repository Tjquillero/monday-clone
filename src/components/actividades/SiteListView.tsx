'use client';

// Componente Puro Nivel 1: Lista de Sitios (/my-work)
// Renderiza las tarjetas de sitios priorizadas por atención (pendientes primero).
// Cero tablas nuevas, cero mutaciones. Cálculo determinista en memoria desde PublishedWeekPlan.

import React from 'react';
import { MapPin, AlertCircle, Clock, CheckCircle2, ChevronRight, ClipboardList } from 'lucide-react';
import { PublishedWeekPlan, PublishedWeekPlanItem } from '@/hooks/useWeeklyPlans';
import { classifyItemTemporalStatus } from '@/lib/myWorkTemporalProjection';

export interface SiteSummary {
  planId: string;
  boardId: string;
  groupId: string;
  siteName: string;
  color: string;
  totalCount: number;
  pendingCount: number;
  inProgressCount: number;
  completedCount: number;
  totalPlannedJr: number;
  items: PublishedWeekPlanItem[];
}

interface SiteListViewProps {
  plans: PublishedWeekPlan[];
  onSelectSite: (groupId: string) => void;
  operationalTodayISO?: string;
  showAllWeek?: boolean;
}

export function computeSiteSummaries(
  plans: PublishedWeekPlan[],
  operationalTodayISO?: string,
  showAllWeek?: boolean
): SiteSummary[] {
  const summaries: SiteSummary[] = [];

  for (const plan of plans) {
    const siteName = plan.group?.title ?? 'Sitio General';
    const color = plan.group?.color ?? 'var(--color-primary)';
    let rawItems = plan.items || [];

    // Si se especifica fecha operativa y no es vista de semana completa, filtrar a HOY
    if (operationalTodayISO && !showAllWeek) {
      rawItems = rawItems.filter(
        (item) => classifyItemTemporalStatus(item, operationalTodayISO) === 'TODAY'
      );
    }

    const items = rawItems;

    let pendingCount = 0;
    let inProgressCount = 0;
    let completedCount = 0;
    let totalPlannedJr = 0;

    for (const item of items) {
      totalPlannedJr += item.planned_jr || 0;
      const plannedQty = item.planned_qty || 0;
      const executedQty = item.executed_qty || 0;

      if (executedQty === 0) {
        pendingCount++;
      } else if (executedQty < plannedQty) {
        inProgressCount++;
      } else {
        completedCount++;
      }
    }

    summaries.push({
      planId: plan.id,
      boardId: plan.board_id,
      groupId: plan.group_id,
      siteName,
      color,
      totalCount: items.length,
      pendingCount,
      inProgressCount,
      completedCount,
      totalPlannedJr,
      items,
    });
  }

  // Prioridad de ordenación UX:
  // 1. Sitios con pendientes (> 0)
  // 2. Sitios con actividades en ejecución (> 0)
  // 3. Sitios con todo completado
  return summaries.sort((a, b) => {
    if (a.pendingCount > 0 && b.pendingCount === 0) return -1;
    if (a.pendingCount === 0 && b.pendingCount > 0) return 1;
    if (a.inProgressCount > 0 && b.inProgressCount === 0) return -1;
    if (a.inProgressCount === 0 && b.inProgressCount > 0) return 1;
    return a.siteName.localeCompare(b.siteName);
  });
}

export const SiteListView: React.FC<SiteListViewProps> = ({
  plans,
  onSelectSite,
  operationalTodayISO,
  showAllWeek = false,
}) => {
  const summaries = computeSiteSummaries(plans, operationalTodayISO, showAllWeek);

  if (summaries.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-16 px-4 bg-[var(--color-surface-subtle)] rounded-[var(--radius-surface)] border-2 border-dashed border-[var(--border-color)] text-center">
        <ClipboardList className="w-10 h-10 text-[var(--text-muted)] mb-3" />
        <p className="text-base font-bold text-[var(--text-primary)]">Sin sitios programados</p>
        <p className="text-xs text-[var(--text-muted)] mt-1 max-w-sm">
          No hay actividades o sitios asignados en el plan de esta semana.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-4 max-w-full overflow-x-hidden">
      <div className="flex items-center justify-between px-1">
        <h2 className="text-xs font-bold uppercase tracking-wider text-[var(--text-muted)]">
          Sitios de Trabajo ({summaries.length})
        </h2>
        <span className="text-[11px] text-[var(--text-muted)] font-medium">
          Selecciona un sitio para ejecutar
        </span>
      </div>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {summaries.map((site) => {
          const hasPending = site.pendingCount > 0;
          const hasInProgress = site.inProgressCount > 0;

          return (
            <div
              key={site.groupId}
              onClick={() => onSelectSite(site.groupId)}
              className={`group relative bg-[var(--card-bg)] rounded-[var(--radius-surface)] border transition-all cursor-pointer select-none overflow-hidden active:scale-[0.99] touch-manipulation shadow-card ${
                hasPending
                  ? 'border-red-500/30 hover:border-red-500 ring-1 ring-red-500/10'
                  : hasInProgress
                  ? 'border-amber-500/30 hover:border-amber-500'
                  : 'border-[var(--border-color)] hover:border-[var(--color-primary)]/40'
              }`}
            >
              {/* Franja de acento superior según color del sitio */}
              <div
                className="h-1.5 w-full"
                style={{ backgroundColor: site.color || 'var(--color-primary)' }}
              />

              <div className="p-4 sm:p-5 flex flex-col justify-between space-y-4 min-h-[140px]">
                {/* Cabecera del Sitio */}
                <div>
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex items-center gap-2 min-w-0">
                      <MapPin
                        className="w-5 h-5 shrink-0"
                        style={{ color: site.color || 'var(--color-primary)' }}
                      />
                      <h3 className="text-base sm:text-lg font-brand font-bold text-[var(--text-primary)] leading-snug break-words line-clamp-2">
                        {site.siteName}
                      </h3>
                    </div>

                    {/* Badge destacado para sitio con urgencia */}
                    {hasPending && (
                      <span className="shrink-0 inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-extrabold bg-red-500/15 text-[var(--color-danger)] border border-red-500/30 uppercase tracking-wide">
                        Atención
                      </span>
                    )}
                  </div>

                  <p className="text-xs text-[var(--text-muted)] mt-1 pl-7">
                    {site.totalCount} {site.totalCount === 1 ? 'actividad' : 'actividades'} ·{' '}
                    <span className="font-semibold text-[var(--text-secondary)] font-mono">
                      {site.totalPlannedJr.toFixed(1)} JR
                    </span>
                  </p>
                </div>

                {/* Badges explicativos de estado (Texto + Número + Ícono) */}
                <div className="flex flex-wrap items-center gap-1.5 pt-2 border-t border-[var(--border-color)]">
                  {site.pendingCount > 0 && (
                    <span className="inline-flex items-center px-2.5 py-1 rounded-[var(--radius-control)] text-xs font-bold bg-red-500/10 text-[var(--color-danger)] border border-red-500/20">
                      <AlertCircle className="w-3.5 h-3.5 mr-1 text-[var(--color-danger)] shrink-0" />
                      <span>{site.pendingCount} {site.pendingCount === 1 ? 'pendiente' : 'pendientes'}</span>
                    </span>
                  )}

                  {site.inProgressCount > 0 && (
                    <span className="inline-flex items-center px-2.5 py-1 rounded-[var(--radius-control)] text-xs font-bold bg-amber-500/10 text-[var(--color-warning)] border border-amber-500/20">
                      <Clock className="w-3.5 h-3.5 mr-1 text-[var(--color-warning)] shrink-0" />
                      <span>{site.inProgressCount} en curso</span>
                    </span>
                  )}

                  {site.completedCount > 0 && (
                    <span className="inline-flex items-center px-2.5 py-1 rounded-[var(--radius-control)] text-xs font-bold bg-emerald-500/10 text-[var(--color-success)] border border-emerald-500/20">
                      <CheckCircle2 className="w-3.5 h-3.5 mr-1 text-[var(--color-success)] shrink-0" />
                      <span>{site.completedCount} completadas</span>
                    </span>
                  )}
                </div>

                {/* Botón de Acción Principal del Sitio (Touch target >= 44px) */}
                <div className="flex items-center justify-between pt-1">
                  <span className="text-xs font-semibold text-[var(--text-muted)]">
                    {hasPending ? 'Pendientes por ejecutar' : 'Ver detalle'}
                  </span>

                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      onSelectSite(site.groupId);
                    }}
                    className={`min-h-[44px] px-4 py-2 rounded-[var(--radius-control)] text-xs font-bold flex items-center gap-1.5 transition-all shadow-2xs group-hover:translate-x-0.5 touch-manipulation ${
                      hasPending
                        ? 'bg-[var(--color-danger)] hover:bg-red-700 text-white shadow-red-600/20'
                        : 'bg-[var(--color-primary)] hover:bg-[var(--color-primary-hover)] text-white'
                    }`}
                  >
                    <span>VER SITIO</span>
                    <ChevronRight className="w-4 h-4" />
                  </button>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};

export default SiteListView;
