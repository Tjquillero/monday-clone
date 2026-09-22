'use client';

// Componente Puro Nivel 1: Lista de Sitios (/my-work)
// Renderiza las tarjetas de sitios priorizadas por atención (pendientes primero).
// Cero tablas nuevas, cero mutaciones. Cálculo determinista en memoria desde PublishedWeekPlan.

import React from 'react';
import { MapPin, AlertCircle, Clock, CheckCircle2, ChevronRight, ClipboardList } from 'lucide-react';
import { PublishedWeekPlan, PublishedWeekPlanItem } from '@/hooks/useWeeklyPlans';

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
}

export function computeSiteSummaries(plans: PublishedWeekPlan[]): SiteSummary[] {
  const summaries: SiteSummary[] = [];

  for (const plan of plans) {
    const siteName = plan.group?.title ?? 'Sitio General';
    const color = plan.group?.color ?? '#3B7EF8';
    const items = plan.items || [];

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

export const SiteListView: React.FC<SiteListViewProps> = ({ plans, onSelectSite }) => {
  const summaries = computeSiteSummaries(plans);

  if (summaries.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-16 px-4 bg-slate-50/50 rounded-2xl border-2 border-dashed border-slate-200 text-center">
        <ClipboardList className="w-10 h-10 text-slate-300 mb-3" />
        <p className="text-base font-bold text-slate-700">Sin sitios programados</p>
        <p className="text-xs text-slate-400 mt-1 max-w-sm">
          No hay actividades o sitios asignados en el plan de esta semana.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-4 max-w-full overflow-x-hidden">
      <div className="flex items-center justify-between px-1">
        <h2 className="text-xs font-bold uppercase tracking-wider text-slate-500">
          Sitios de Trabajo ({summaries.length})
        </h2>
        <span className="text-[11px] text-slate-400 font-medium">
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
              className={`group relative bg-white rounded-2xl border transition-all cursor-pointer select-none overflow-hidden active:scale-[0.99] touch-manipulation ${
                hasPending
                  ? 'border-red-200/90 shadow-sm hover:border-red-400 hover:shadow-md ring-1 ring-red-500/10'
                  : hasInProgress
                  ? 'border-amber-200 shadow-sm hover:border-amber-400'
                  : 'border-slate-200/80 hover:border-slate-300'
              }`}
            >
              {/* Franja de acento superior según color del sitio */}
              <div
                className="h-1.5 w-full"
                style={{ backgroundColor: site.color || '#3B7EF8' }}
              />

              <div className="p-4 sm:p-5 flex flex-col justify-between space-y-4 min-h-[140px]">
                {/* Cabecera del Sitio */}
                <div>
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex items-center gap-2 min-w-0">
                      <MapPin
                        className="w-5 h-5 shrink-0"
                        style={{ color: site.color || '#3B7EF8' }}
                      />
                      <h3 className="text-base sm:text-lg font-bold text-slate-900 leading-snug break-words line-clamp-2">
                        {site.siteName}
                      </h3>
                    </div>

                    {/* Badge destacado para sitio con urgencia */}
                    {hasPending && (
                      <span className="shrink-0 inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-extrabold bg-red-100 text-red-700 border border-red-200 uppercase tracking-wide">
                        Atención
                      </span>
                    )}
                  </div>

                  <p className="text-xs text-slate-500 mt-1 pl-7">
                    {site.totalCount} {site.totalCount === 1 ? 'actividad' : 'actividades'} ·{' '}
                    <span className="font-semibold text-slate-700">
                      {site.totalPlannedJr.toFixed(1)} JR
                    </span>
                  </p>
                </div>

                {/* Badges explicativos de estado (Texto + Número + Ícono) */}
                <div className="flex flex-wrap items-center gap-1.5 pt-2 border-t border-slate-100">
                  {site.pendingCount > 0 && (
                    <span className="inline-flex items-center px-2.5 py-1 rounded-lg text-xs font-bold bg-red-50 text-red-700 border border-red-200">
                      <AlertCircle className="w-3.5 h-3.5 mr-1 text-red-600 shrink-0" />
                      <span>{site.pendingCount} {site.pendingCount === 1 ? 'pendiente' : 'pendientes'}</span>
                    </span>
                  )}

                  {site.inProgressCount > 0 && (
                    <span className="inline-flex items-center px-2.5 py-1 rounded-lg text-xs font-bold bg-amber-50 text-amber-700 border border-amber-200">
                      <Clock className="w-3.5 h-3.5 mr-1 text-amber-600 shrink-0" />
                      <span>{site.inProgressCount} en curso</span>
                    </span>
                  )}

                  {site.completedCount > 0 && (
                    <span className="inline-flex items-center px-2.5 py-1 rounded-lg text-xs font-bold bg-emerald-50 text-emerald-700 border border-emerald-200">
                      <CheckCircle2 className="w-3.5 h-3.5 mr-1 text-emerald-600 shrink-0" />
                      <span>{site.completedCount} completadas</span>
                    </span>
                  )}
                </div>

                {/* Botón de Acción Principal del Sitio (Touch target >= 44px) */}
                <div className="flex items-center justify-between pt-1">
                  <span className="text-xs font-semibold text-slate-400">
                    {hasPending ? 'Pendientes por ejecutar' : 'Ver detalle'}
                  </span>

                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      onSelectSite(site.groupId);
                    }}
                    className={`min-h-[44px] px-4 py-2 rounded-xl text-xs font-bold flex items-center gap-1.5 transition-all shadow-2xs group-hover:translate-x-0.5 ${
                      hasPending
                        ? 'bg-red-600 hover:bg-red-700 text-white shadow-red-600/20'
                        : 'bg-primary hover:bg-primary/90 text-white'
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
