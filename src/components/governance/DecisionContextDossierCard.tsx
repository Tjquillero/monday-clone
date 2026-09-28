'use client';

import React from 'react';
import {
  DecisionContextDossierCardProps,
  ACTION_TYPE_LABEL_MAP,
  HISTORICAL_FEEDBACK_STATUS_LABEL_MAP,
} from '@/types/decisionSurface';

/**
 * Mantenix - Hito 7.11 Governed Human Decision Surface v1.0
 * Componente Consultivo de Presentación de Expediente de Decisión (Read-Only)
 *
 * Invariantes Constitucionales:
 * 1. 0 Mutaciones / 0 I/O / 0 Callbacks de Acción.
 * 2. 0 Evaluación Normativa: Presentación descriptiva neutral sin juicios de valor.
 * 3. Nulabilidad Estricta: null jamás se renderiza como 0, 0% o 0.0x.
 * 4. Advertencia de No-Autorización: Rótulo legal explícito e incondicional.
 */
export const DecisionContextDossierCard: React.FC<DecisionContextDossierCardProps> = ({
  dossier,
  proposal,
  className = '',
  testId = 'decision-context-dossier-card',
}) => {
  // 1. Resolución de campos de Intervención Propuesta
  const resolvedActionType = proposal?.actionType || dossier.actionType;
  const actionLabel = resolvedActionType
    ? ACTION_TYPE_LABEL_MAP[resolvedActionType] || resolvedActionType
    : 'Acción No Especificada';

  const targetEntity = proposal?.targetEntityId || dossier.targetEntityId || 'No especificada';
  const targetMetric = proposal?.expectedOutcome?.targetMetric || dossier.targetMetric || 'No especificada';
  const metricDirection = proposal?.expectedOutcome?.metricDirection || dossier.metricDirection;
  const directionLabel = metricDirection === 'INCREASE'
    ? 'INCREMENTAR'
    : metricDirection === 'DECREASE'
    ? 'DISMINUIR'
    : 'No especificada';

  const projectedDelta = proposal?.expectedOutcome?.projectedDelta ?? dossier.projectedDelta;
  const projectedDeltaDisplay = projectedDelta !== null && projectedDelta !== undefined
    ? `${projectedDelta > 0 ? '+' : ''}${projectedDelta}`
    : 'No cuantificado';

  // 2. Resolución de campos de Contexto Empírico Histórico
  const statusLabel =
    HISTORICAL_FEEDBACK_STATUS_LABEL_MAP[dossier.historicalFeedbackStatus] ||
    dossier.historicalFeedbackStatus;

  const empiricalSuccessRateDisplay =
    dossier.empiricalSuccessRate !== null && dossier.empiricalSuccessRate !== undefined
      ? `${(dossier.empiricalSuccessRate * 100).toFixed(1)}%`
      : 'Sin datos empíricos';

  const averageAchievementRatioDisplay =
    dossier.averageAchievementRatio !== null && dossier.averageAchievementRatio !== undefined
      ? `${dossier.averageAchievementRatio.toFixed(2)}x`
      : 'No aplicable';

  const evaluatedAtDisplay = dossier.evaluatedAt ? dossier.evaluatedAt : 'No registrada';

  return (
    <div
      data-testid={testId}
      className={`bg-slate-900 border border-slate-800 rounded-xl p-6 text-slate-100 shadow-lg space-y-6 ${className}`}
    >
      {/* Header y Banner de No-Autorización (Invariante de Gobernanza) */}
      <div
        data-testid="governance-disclaimer-banner"
        className="bg-amber-950/40 border border-amber-500/40 rounded-lg p-4 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2 text-amber-200"
      >
        <div className="flex items-center space-x-2">
          <span className="text-amber-400 font-bold text-lg">⚠</span>
          <span className="text-xs font-semibold uppercase tracking-wider">
            CONTEXTO CONSULTIVO — NO CONSTITUYE AUTORIZACIÓN DE ACCIÓN
          </span>
        </div>
        <div className="text-xs text-amber-300/80 bg-amber-950/80 px-2.5 py-1 rounded border border-amber-600/30">
          {dossier.requiresHumanReview ? 'Requiere Decisión Humana Soberana' : 'Revisión Requerida'}
        </div>
      </div>

      {/* Sección A: Intervención Propuesta */}
      <div data-testid="section-proposed-intervention" className="space-y-3">
        <h4 className="text-xs font-semibold text-slate-400 uppercase tracking-wider border-b border-slate-800 pb-2">
          1. Intervención Propuesta
        </h4>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 text-sm">
          <div className="bg-slate-800/60 p-3 rounded-lg border border-slate-700/50">
            <span className="text-xs text-slate-400 block mb-1">Acción Propuesta</span>
            <span data-testid="field-action-type" className="font-medium text-slate-200">
              {actionLabel}
            </span>
          </div>

          <div className="bg-slate-800/60 p-3 rounded-lg border border-slate-700/50">
            <span className="text-xs text-slate-400 block mb-1">Entidad Destino</span>
            <span data-testid="field-target-entity" className="font-mono text-xs text-slate-300">
              {targetEntity}
            </span>
          </div>

          <div className="bg-slate-800/60 p-3 rounded-lg border border-slate-700/50">
            <span className="text-xs text-slate-400 block mb-1">Métrica y Dirección</span>
            <div className="flex items-center space-x-2">
              <span data-testid="field-target-metric" className="font-medium text-slate-200">
                {targetMetric}
              </span>
              <span
                data-testid="field-metric-direction"
                className="text-xs px-2 py-0.5 rounded bg-slate-700 text-slate-300 font-mono"
              >
                {directionLabel}
              </span>
            </div>
          </div>

          <div className="bg-slate-800/60 p-3 rounded-lg border border-slate-700/50">
            <span className="text-xs text-slate-400 block mb-1">Delta Proyectado</span>
            <span data-testid="field-projected-delta" className="font-mono font-medium text-slate-200">
              {projectedDeltaDisplay}
            </span>
          </div>
        </div>
      </div>

      {/* Sección B: Contexto Empírico Histórico */}
      <div data-testid="section-historical-context" className="space-y-3">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-slate-800 pb-2">
          <h4 className="text-xs font-semibold text-slate-400 uppercase tracking-wider">
            2. Contexto Empírico Histórico
          </h4>
          <span
            data-testid="field-historical-status"
            className="text-xs font-medium px-2.5 py-1 rounded bg-slate-800 border border-slate-700 text-slate-300 w-fit"
          >
            {statusLabel}
          </span>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3 text-sm">
          <div className="bg-slate-800/40 p-3 rounded-lg border border-slate-700/30">
            <span className="text-xs text-slate-400 block mb-1">Total Registros</span>
            <span data-testid="field-total-evaluations" className="text-lg font-semibold text-slate-200">
              {dossier.totalEvaluations}
            </span>
          </div>

          <div className="bg-slate-800/40 p-3 rounded-lg border border-slate-700/30">
            <span className="text-xs text-slate-400 block mb-1">Válidas</span>
            <span data-testid="field-evaluated-count" className="text-lg font-semibold text-slate-200">
              {dossier.evaluatedCount}
            </span>
          </div>

          <div className="bg-slate-800/40 p-3 rounded-lg border border-slate-700/30">
            <span className="text-xs text-slate-400 block mb-1">Logradas</span>
            <span data-testid="field-achieved-count" className="text-lg font-semibold text-slate-200">
              {dossier.achievedCount}
            </span>
          </div>

          <div className="bg-slate-800/40 p-3 rounded-lg border border-slate-700/30">
            <span className="text-xs text-slate-400 block mb-1">No Logradas</span>
            <span data-testid="field-not-achieved-count" className="text-lg font-semibold text-slate-200">
              {dossier.notAchievedCount}
            </span>
          </div>

          <div className="bg-slate-800/40 p-3 rounded-lg border border-slate-700/30">
            <span className="text-xs text-slate-400 block mb-1">Indeterminadas</span>
            <span data-testid="field-indeterminate-count" className="text-lg font-semibold text-slate-200">
              {dossier.indeterminateCount}
            </span>
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 pt-1 text-sm">
          <div className="bg-slate-800/70 p-3.5 rounded-lg border border-slate-700/60">
            <span className="text-xs text-slate-400 block mb-1">Tasa Empírica Histórica</span>
            <span data-testid="field-empirical-success-rate" className="text-base font-semibold text-slate-100">
              {empiricalSuccessRateDisplay}
            </span>
          </div>

          <div className="bg-slate-800/70 p-3.5 rounded-lg border border-slate-700/60">
            <span className="text-xs text-slate-400 block mb-1">Ratio Promedio de Logro</span>
            <span data-testid="field-average-achievement-ratio" className="text-base font-semibold text-slate-100">
              {averageAchievementRatioDisplay}
            </span>
          </div>

          <div className="bg-slate-800/70 p-3.5 rounded-lg border border-slate-700/60">
            <span className="text-xs text-slate-400 block mb-1">Evaluado En</span>
            <span data-testid="field-evaluated-at" className="text-xs font-mono text-slate-300 block truncate">
              {evaluatedAtDisplay}
            </span>
          </div>
        </div>
      </div>

      {/* Sección C: Trazabilidad y Procedencia */}
      <div data-testid="section-traceability-provenance" className="space-y-3">
        <h4 className="text-xs font-semibold text-slate-400 uppercase tracking-wider border-b border-slate-800 pb-2">
          3. Trazabilidad y Procedencia
        </h4>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3 text-xs">
          <div className="bg-slate-950/60 p-3 rounded-lg border border-slate-800/80">
            <span className="text-slate-500 block mb-1 font-semibold">ID Propuesta</span>
            <span data-testid="field-provenance-proposal-id" className="font-mono text-slate-300 break-all">
              {dossier.contextProvenance?.proposalId || dossier.proposalId}
            </span>
          </div>

          <div className="bg-slate-950/60 p-3 rounded-lg border border-slate-800/80">
            <span className="text-slate-500 block mb-1 font-semibold">ID Plan</span>
            <span data-testid="field-provenance-plan-id" className="font-mono text-slate-300 break-all">
              {dossier.contextProvenance?.planId || dossier.planId}
            </span>
          </div>

          <div className="bg-slate-950/60 p-3 rounded-lg border border-slate-800/80">
            <span className="text-slate-500 block mb-1 font-semibold">Clave de Cohorte</span>
            <span data-testid="field-provenance-cohort-key" className="font-mono text-slate-300 break-all">
              {dossier.contextProvenance?.cohortKey || dossier.cohortKey}
            </span>
          </div>
        </div>
      </div>
    </div>
  );
};
