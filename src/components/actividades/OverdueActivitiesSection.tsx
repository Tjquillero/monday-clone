'use client';

// Componente: Sección y Drawer Desplegable de Actividades Resagadas (UX-01-B)
// Implementa Progressive Disclosure:
// - Estado colapsado: Card de alerta con conteo prioritario y badge llamativo.
// - Estado expandido: Desglose cronológico por fecha de origen con badges de estado y acción de ejecución.

import React, { useState } from 'react';
import {
  AlertTriangle,
  ChevronDown,
  ChevronUp,
  Clock,
  MapPin,
  Calendar,
  Camera,
  AlertCircle,
} from 'lucide-react';
import { OverdueGroupByDate } from '@/lib/myWorkTemporalProjection';
import { PublishedWeekPlan, PublishedWeekPlanItem } from '@/hooks/useWeeklyPlans';
import { FieldReportResult } from '@/lib/fieldWorkflowExecutionService';
import DailyActivityExecutionModal from './DailyActivityExecutionModal';

interface OverdueActivitiesSectionProps {
  overdueGroups: OverdueGroupByDate[];
  totalOverdueCount: number;
  plans?: PublishedWeekPlan[];
  userId?: string;
  onExecutionSuccess?: (result: FieldReportResult) => void;
  onSelectSite?: (groupId: string) => void;
}

export const OverdueActivitiesSection: React.FC<OverdueActivitiesSectionProps> = ({
  overdueGroups,
  totalOverdueCount,
  plans,
  userId,
  onExecutionSuccess,
  onSelectSite,
}) => {
  const [isExpanded, setIsExpanded] = useState<boolean>(false);
  const [activeModalItem, setActiveModalItem] = useState<PublishedWeekPlanItem | null>(null);

  if (totalOverdueCount === 0 || overdueGroups.length === 0) {
    return null;
  }

  const handleOpenExecution = (item: PublishedWeekPlanItem) => {
    setActiveModalItem(item);
  };

  const handleModalClose = () => {
    setActiveModalItem(null);
  };

  const handleExecutionSuccessCallback = (result: FieldReportResult) => {
    setActiveModalItem(null);
    if (onExecutionSuccess) {
      onExecutionSuccess(result);
    }
  };

  return (
    <div className="bg-[var(--color-accent-subtle)] border border-[var(--color-accent)]/30 rounded-[var(--radius-surface)] overflow-hidden transition-all shadow-xs">
      {/* 1. Header / Resumen Principal (Clickeable para colapsar/expandir) */}
      <button
        type="button"
        onClick={() => setIsExpanded(!isExpanded)}
        aria-expanded={isExpanded}
        className="w-full p-4 sm:p-5 flex items-center justify-between gap-3 text-left hover:bg-[var(--color-accent)]/10 transition-colors focus:outline-hidden focus-visible:ring-2 focus-visible:ring-[var(--color-accent)] touch-manipulation"
      >
        <div className="flex items-center gap-3 min-w-0">
          <div className="w-10 h-10 rounded-[var(--radius-control)] bg-[var(--color-accent)]/20 text-[var(--color-accent)] flex items-center justify-center shrink-0">
            <AlertTriangle className="w-5 h-5" />
          </div>
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <span className="text-xs font-black uppercase tracking-wider text-[var(--text-primary)]">
                Actividades Resagadas
              </span>
              <span className="px-2 py-0.5 rounded-full text-xs font-black font-mono bg-[var(--color-accent)] text-white shadow-2xs">
                {totalOverdueCount}
              </span>
            </div>
            <p className="text-xs font-semibold text-[var(--text-secondary)] mt-0.5 truncate">
              {totalOverdueCount === 1
                ? '1 actividad de días anteriores requiere atención'
                : `${totalOverdueCount} actividades de días anteriores requieren atención`}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          <span className="text-xs font-bold text-[var(--color-accent)] hidden sm:inline">
            {isExpanded ? 'Ocultar resagadas' : 'Ver resagadas'}
          </span>
          <div className="w-8 h-8 rounded-[var(--radius-control)] bg-[var(--color-accent)]/20 text-[var(--color-accent)] flex items-center justify-center">
            {isExpanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
          </div>
        </div>
      </button>

      {/* 2. Cuerpo Expandido: Desglose por fecha y actividad */}
      {isExpanded && (
        <div className="p-4 sm:p-5 pt-0 space-y-4 border-t border-[var(--color-accent)]/20">
          <p className="text-xs text-[var(--text-secondary)] font-medium pt-3">
            Estas actividades tenían fecha programada anterior y no han sido finalizadas. Puedes registrar su ejecución directamente aquí:
          </p>

          <div className="space-y-4">
            {overdueGroups.map((group) => (
              <div key={group.dateIso} className="space-y-2.5">
                {/* Etiqueta de la Fecha de Origen */}
                <div className="flex items-center gap-2 px-1">
                  <Calendar className="w-3.5 h-3.5 text-[var(--color-accent)]" />
                  <span className="text-xs font-bold text-[var(--text-primary)] font-mono">
                    {group.formattedDate}
                  </span>
                  <span className="text-[11px] font-medium text-[var(--text-muted)]">
                    ({group.daysAgo === 1 ? 'Ayer' : `Hace ${group.daysAgo} días`})
                  </span>
                </div>

                {/* Tarjetas de Actividades de ese día */}
                <div className="space-y-2">
                  {group.items.map((item) => {
                    const name = item.standard?.name ?? item.name ?? item.activity_key;
                    const zone = item.standard?.category ?? item.zone ?? 'Zona General';
                    const plannedQty = item.planned_qty || 0;
                    const executedQty = item.executed_qty || 0;
                    const unit = item.unit || 'und';

                    const isRejected = (item.executionsSummary?.verificationStatus || '').toLowerCase() === 'rejected';
                    const isInProgress = executedQty > 0 && executedQty < plannedQty;

                    return (
                      <div
                        key={item.id}
                        className="bg-[var(--card-bg)] rounded-[var(--radius-control)] border border-[var(--border-color)] p-3.5 sm:p-4 shadow-2xs hover:shadow-xs transition-all flex flex-col sm:flex-row sm:items-center justify-between gap-3"
                      >
                        <div className="min-w-0 flex-1 space-y-1">
                          <div className="flex items-center gap-2 flex-wrap">
                            <h4 className="text-sm font-bold text-[var(--text-primary)] truncate max-w-full">
                              {name}
                            </h4>
                            {isRejected && (
                              <span className="px-2 py-0.5 rounded-full text-[10px] font-extrabold bg-red-500/10 text-[var(--color-danger)] border border-red-500/30">
                                ⚠ Rechazada
                              </span>
                            )}
                            {isInProgress && !isRejected && (
                              <span className="px-2 py-0.5 rounded-full text-[10px] font-extrabold bg-amber-500/10 text-[var(--color-warning)] border border-amber-500/30">
                                En progreso
                              </span>
                            )}
                            {!isInProgress && !isRejected && (
                              <span className="px-2 py-0.5 rounded-full text-[10px] font-extrabold bg-[var(--color-surface-subtle)] text-[var(--text-muted)] border border-[var(--border-color)]">
                                Pendiente
                              </span>
                            )}
                          </div>

                          <div className="flex items-center gap-3 text-xs text-[var(--text-muted)] font-medium flex-wrap">
                            <span className="flex items-center gap-1">
                              <MapPin className="w-3 h-3 text-[var(--text-muted)]" />
                              {zone}
                            </span>
                            <span>•</span>
                            <span>
                              Meta: <strong className="text-[var(--text-primary)] font-mono">{plannedQty} {unit}</strong>
                            </span>
                            <span>•</span>
                            <span>
                              Ejecutado: <strong className="text-[var(--text-primary)] font-mono">{executedQty} {unit}</strong>
                            </span>
                          </div>

                          {isRejected && item.executionsSummary?.latestRejectionNotes && (
                            <p className="text-xs text-[var(--color-danger)] font-semibold bg-red-500/10 p-2 rounded-[var(--radius-control)] border border-red-500/20 mt-1">
                              Nota de rechazo: {item.executionsSummary.latestRejectionNotes}
                            </p>
                          )}
                        </div>

                        <div className="flex items-center gap-2 self-end sm:self-auto shrink-0">
                          {onSelectSite && (
                            <button
                              type="button"
                              onClick={() => {
                                const parentPlan = plans?.find((p) => p.items?.some((it: PublishedWeekPlanItem) => it.id === item.id) || p.id === item.plan_id);
                                if (parentPlan?.group_id) {
                                  onSelectSite(parentPlan.group_id);
                                }
                              }}
                              className="px-3 py-2 text-xs font-bold text-[var(--text-secondary)] hover:text-[var(--text-primary)] bg-[var(--color-surface-subtle)] hover:bg-[var(--border-color)] rounded-[var(--radius-control)] transition-colors min-h-[44px] flex items-center justify-center touch-manipulation"
                            >
                              Ver sitio
                            </button>
                          )}

                          <button
                            type="button"
                            onClick={() => handleOpenExecution(item)}
                            className="min-h-[44px] px-3.5 py-2 bg-[var(--color-primary)] hover:bg-[var(--color-primary-hover)] active:bg-[var(--color-primary-active)] text-white rounded-[var(--radius-control)] text-xs font-bold flex items-center gap-1.5 shadow-xs hover:shadow-sm active:scale-95 transition-all touch-manipulation"
                          >
                            <Camera className="w-3.5 h-3.5" />
                            <span>Registrar</span>
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Modal de Registro de Ejecución para Actividades Resagadas */}
      {activeModalItem && (
        (() => {
          const parentPlan = plans?.find((p) => p.items?.some((it: PublishedWeekPlanItem) => it.id === activeModalItem.id) || p.id === activeModalItem.plan_id);
          const boardId = parentPlan?.board_id || 'default-board';
          const groupId = parentPlan?.group_id;

          return (
            <DailyActivityExecutionModal
              isOpen={true}
              onClose={handleModalClose}
              item={activeModalItem}
              boardId={boardId}
              groupId={groupId}
              userId={userId}
              onSuccess={handleExecutionSuccessCallback}
            />
          );
        })()
      )}
    </div>
  );
};

export default OverdueActivitiesSection;
