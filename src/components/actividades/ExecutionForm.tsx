'use client';

import React from 'react';
import { Users, Clock, CheckCircle2, ArrowRight, ShieldCheck, AlertCircle } from 'lucide-react';

interface ExecutionFormProps {
  taskName: string;
  contractualUnit: string;
  plannedQty: number;
  previouslyReportedQty: number;
  previouslyVerifiedQty: number;
  
  executedQty: number;
  onExecutedQtyChange: (qty: number) => void;
  
  workerCount: number;
  onWorkerCountChange: (count: number) => void;
  
  hoursWorked: number;
  onHoursWorkedChange: (hours: number) => void;
  
  continuationDecision: 'CONTINUA_MANANA' | 'TERMINADA_HOY';
  onContinuationDecisionChange: (decision: 'CONTINUA_MANANA' | 'TERMINADA_HOY') => void;
  
  notes: string;
  onNotesChange: (notes: string) => void;
  
  disabled?: boolean;
}

export const ExecutionForm: React.FC<ExecutionFormProps> = ({
  taskName,
  contractualUnit,
  plannedQty,
  previouslyReportedQty,
  previouslyVerifiedQty,
  executedQty,
  onExecutedQtyChange,
  workerCount,
  onWorkerCountChange,
  hoursWorked,
  onHoursWorkedChange,
  continuationDecision,
  onContinuationDecisionChange,
  notes,
  onNotesChange,
  disabled = false,
}) => {
  const remainingReportedQty = Math.max(0, plannedQty - previouslyReportedQty);
  const projectedTotalReported = previouslyReportedQty + (executedQty || 0);
  const jornalesUsed = (workerCount * hoursWorked) / 8.0;

  return (
    <div className="space-y-4 text-[var(--text-primary)]">
      {/* 1. Desglose de Magnitudes Físicas */}
      <div className="bg-[var(--color-surface-subtle)] border border-[var(--border-color)] rounded-[var(--radius-control)] p-3.5 space-y-2">
        <div className="flex items-center justify-between text-xs">
          <span className="font-semibold text-[var(--text-secondary)]">Actividad:</span>
          <span className="font-bold text-[var(--text-primary)] truncate max-w-[240px]">{taskName}</span>
        </div>

        <div className="grid grid-cols-3 gap-2 pt-2 border-t border-[var(--border-color)] text-center">
          <div>
            <div className="text-[10px] text-[var(--text-muted)] uppercase font-semibold">Meta Planificada</div>
            <div className="text-sm font-bold font-mono text-[var(--text-primary)]">
              {plannedQty} <span className="text-xs font-normal text-[var(--text-muted)]">{contractualUnit}</span>
            </div>
          </div>
          <div>
            <div className="text-[10px] text-[var(--text-muted)] uppercase font-semibold">Reportado Previo</div>
            <div className="text-sm font-bold font-mono text-[var(--text-secondary)]">
              {previouslyReportedQty} <span className="text-xs font-normal text-[var(--text-muted)]">{contractualUnit}</span>
            </div>
          </div>
          <div>
            <div className="text-[10px] text-[var(--text-muted)] uppercase font-semibold">Saldo Pendiente</div>
            <div className="text-sm font-bold font-mono text-[var(--color-warning)]">
              {remainingReportedQty} <span className="text-xs font-normal text-[var(--text-muted)]">{contractualUnit}</span>
            </div>
          </div>
        </div>

        {previouslyVerifiedQty > 0 && (
          <div className="pt-2 border-t border-[var(--border-color)] text-[11px] text-[var(--color-success)] flex items-center justify-center font-medium">
            <ShieldCheck className="w-3.5 h-3.5 mr-1" />
            {previouslyVerifiedQty} {contractualUnit} aprobados formalmente por supervisión
          </div>
        )}
      </div>

      {/* 2. Campo de Cantidad Física Ejecutada */}
      <div className="space-y-1.5">
        <label className="text-xs font-semibold text-[var(--text-secondary)] uppercase tracking-wide flex items-center justify-between">
          <span>Avance Físico de Hoy *</span>
          <span className="text-[11px] font-normal text-[var(--text-muted)]">
            Unidad contractual: <strong className="text-[var(--text-primary)]">{contractualUnit}</strong> (solo lectura)
          </span>
        </label>
        <div className="relative">
          <input
            type="number"
            min="0.01"
            step="any"
            value={executedQty === 0 ? '' : executedQty}
            onChange={(e) => onExecutedQtyChange(parseFloat(e.target.value) || 0)}
            placeholder="0.0"
            disabled={disabled}
            className="w-full text-base font-bold font-mono px-3 py-2.5 bg-[var(--card-bg)] border border-[var(--border-color)] rounded-[var(--radius-control)] focus:outline-none focus:ring-2 focus:ring-[var(--color-primary)]/20 focus:border-[var(--color-primary)] text-[var(--text-primary)] pr-16"
          />
          <div className="absolute right-3 top-2.5 text-sm font-semibold text-[var(--text-muted)] select-none">
            {contractualUnit}
          </div>
        </div>
        {executedQty > 0 && (
          <div className="text-[11px] text-[var(--text-muted)] flex items-center justify-between pt-0.5">
            <span>Proyección total con este reporte:</span>
            <span className="font-semibold font-mono text-[var(--text-primary)]">
              {projectedTotalReported} / {plannedQty} {contractualUnit} ({Math.min(100, Math.round((projectedTotalReported / plannedQty) * 100))}%)
            </span>
          </div>
        )}
      </div>

      {/* 3. Personal y Duración (Cálculo de Jornales Equivalentes) */}
      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1.5">
          <label htmlFor="worker-count-input" className="text-xs font-semibold text-[var(--text-secondary)] flex items-center">
            <Users className="w-3.5 h-3.5 mr-1 text-[var(--text-muted)]" />
            N° Trabajadores *
          </label>
          <input
            id="worker-count-input"
            type="number"
            min="1"
            max="50"
            value={workerCount}
            onChange={(e) => onWorkerCountChange(Math.max(1, parseInt(e.target.value, 10) || 1))}
            disabled={disabled}
            className="w-full text-sm font-semibold font-mono px-3 py-2 bg-[var(--card-bg)] border border-[var(--border-color)] rounded-[var(--radius-control)] focus:outline-none focus:ring-1 focus:ring-[var(--color-primary)] text-[var(--text-primary)]"
          />
        </div>

        <div className="space-y-1.5">
          <label htmlFor="hours-worked-input" className="text-xs font-semibold text-[var(--text-secondary)] flex items-center">
            <Clock className="w-3.5 h-3.5 mr-1 text-[var(--text-muted)]" />
            Horas Dedicadas *
          </label>
          <input
            id="hours-worked-input"
            type="number"
            min="0.5"
            max="24"
            step="0.5"
            value={hoursWorked}
            onChange={(e) => onHoursWorkedChange(Math.max(0.5, parseFloat(e.target.value) || 1))}
            disabled={disabled}
            className="w-full text-sm font-semibold font-mono px-3 py-2 bg-[var(--card-bg)] border border-[var(--border-color)] rounded-[var(--radius-control)] focus:outline-none focus:ring-1 focus:ring-[var(--color-primary)] text-[var(--text-primary)]"
          />
        </div>
      </div>

      <div className="text-[11px] text-[var(--text-muted)] bg-[var(--color-surface-subtle)] p-2.5 rounded-[var(--radius-control)] flex items-center justify-between border border-[var(--border-color)]">
        <span>Jornales de turno equivalentes:</span>
        <span className="font-bold font-mono text-[var(--text-primary)]">
          {jornalesUsed.toFixed(2)} JR <span className="text-[10px] font-normal text-[var(--text-muted)]">({workerCount} trab. × {hoursWorked} h / 8h)</span>
        </span>
      </div>

      {/* 4. Decisión de Continuidad Operativa */}
      <div className="space-y-2 pt-2 border-t border-[var(--border-color)]">
        <label className="text-xs font-semibold text-[var(--text-secondary)] uppercase tracking-wide block">
          Decisión de Cierre de Jornada *
        </label>
        <div className="grid grid-cols-2 gap-3">
          <button
            type="button"
            onClick={() => onContinuationDecisionChange('CONTINUA_MANANA')}
            disabled={disabled}
            className={`p-3 rounded-[var(--radius-control)] border text-left transition-all ${
              continuationDecision === 'CONTINUA_MANANA'
                ? 'bg-[var(--color-info-subtle)] border-[var(--color-info)] text-[var(--color-info)] ring-2 ring-[var(--color-info)]/20'
                : 'bg-[var(--card-bg)] border-[var(--border-color)] text-[var(--text-secondary)] hover:bg-[var(--color-surface-subtle)]'
            }`}
          >
            <div className="flex items-center space-x-1.5 text-xs font-bold">
              <ArrowRight className="w-3.5 h-3.5 text-[var(--color-info)]" />
              <span>Continúa Mañana</span>
            </div>
            <div className="text-[10px] text-[var(--text-muted)] mt-1">
              La cuadrilla retomará esta actividad en el siguiente turno.
            </div>
          </button>

          <button
            type="button"
            onClick={() => onContinuationDecisionChange('TERMINADA_HOY')}
            disabled={disabled}
            className={`p-3 rounded-[var(--radius-control)] border text-left transition-all ${
              continuationDecision === 'TERMINADA_HOY'
                ? 'bg-[var(--color-success-subtle)] border-[var(--color-success)] text-[var(--color-success)] ring-2 ring-[var(--color-success)]/20'
                : 'bg-[var(--card-bg)] border-[var(--border-color)] text-[var(--text-secondary)] hover:bg-[var(--color-surface-subtle)]'
            }`}
          >
            <div className="flex items-center space-x-1.5 text-xs font-bold">
              <CheckCircle2 className="w-3.5 h-3.5 text-[var(--color-success)]" />
              <span>Terminada Hoy</span>
            </div>
            <div className="text-[10px] text-[var(--text-muted)] mt-1">
              Actividad concluida físicamente en este turno.
            </div>
          </button>
        </div>
      </div>

      {/* 5. Observaciones de Campo (Opcional) */}
      <div className="space-y-1.5">
        <label className="text-xs font-semibold text-[var(--text-secondary)] block">
          Notas de Campo (Opcional)
        </label>
        <textarea
          rows={2}
          value={notes}
          onChange={(e) => onNotesChange(e.target.value)}
          placeholder="Condiciones climáticas, novedades del terreno..."
          disabled={disabled}
          className="w-full text-xs px-3 py-2 bg-[var(--card-bg)] border border-[var(--border-color)] rounded-[var(--radius-control)] focus:outline-none focus:ring-1 focus:ring-[var(--color-primary)] text-[var(--text-primary)] resize-none"
        />
      </div>
    </div>
  );
};

export default ExecutionForm;
