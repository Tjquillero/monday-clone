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
    <div className="space-y-4">
      {/* 1. Desglose de Magnitudes Físicas */}
      <div className="bg-slate-50/70 border border-slate-200/80 rounded-xl p-3.5 space-y-2">
        <div className="flex items-center justify-between text-xs">
          <span className="font-semibold text-slate-700">Actividad:</span>
          <span className="font-bold text-slate-800 truncate max-w-[240px]">{taskName}</span>
        </div>

        <div className="grid grid-cols-3 gap-2 pt-2 border-t border-slate-200/60 text-center">
          <div>
            <div className="text-[10px] text-slate-400 uppercase font-semibold">Meta Planificada</div>
            <div className="text-sm font-bold text-slate-800">
              {plannedQty} <span className="text-xs font-normal text-slate-500">{contractualUnit}</span>
            </div>
          </div>
          <div>
            <div className="text-[10px] text-slate-400 uppercase font-semibold">Reportado Previo</div>
            <div className="text-sm font-bold text-slate-700">
              {previouslyReportedQty} <span className="text-xs font-normal text-slate-500">{contractualUnit}</span>
            </div>
          </div>
          <div>
            <div className="text-[10px] text-slate-400 uppercase font-semibold">Saldo Pendiente</div>
            <div className="text-sm font-bold text-amber-700">
              {remainingReportedQty} <span className="text-xs font-normal text-slate-500">{contractualUnit}</span>
            </div>
          </div>
        </div>

        {previouslyVerifiedQty > 0 && (
          <div className="pt-2 border-t border-slate-200/60 text-[11px] text-emerald-700 flex items-center justify-center font-medium">
            <ShieldCheck className="w-3.5 h-3.5 mr-1" />
            {previouslyVerifiedQty} {contractualUnit} aprobados formalmente por supervisión
          </div>
        )}
      </div>

      {/* 2. Campo de Cantidad Física Ejecutada */}
      <div className="space-y-1.5">
        <label className="text-xs font-semibold text-slate-700 uppercase tracking-wide flex items-center justify-between">
          <span>Avance Físico de Hoy *</span>
          <span className="text-[11px] font-normal text-slate-400">
            Unidad contractual: <strong className="text-slate-700">{contractualUnit}</strong> (solo lectura)
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
            className="w-full text-base font-bold px-3 py-2.5 bg-white border border-slate-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary text-slate-800 pr-16"
          />
          <div className="absolute right-3 top-2.5 text-sm font-semibold text-slate-400 select-none">
            {contractualUnit}
          </div>
        </div>
        {executedQty > 0 && (
          <div className="text-[11px] text-slate-500 flex items-center justify-between pt-0.5">
            <span>Proyección total con este reporte:</span>
            <span className="font-semibold text-slate-700">
              {projectedTotalReported} / {plannedQty} {contractualUnit} ({Math.min(100, Math.round((projectedTotalReported / plannedQty) * 100))}%)
            </span>
          </div>
        )}
      </div>

      {/* 3. Personal y Duración (Cálculo de Jornales Equivalentes) */}
      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1.5">
          <label className="text-xs font-semibold text-slate-700 flex items-center">
            <Users className="w-3.5 h-3.5 mr-1 text-slate-500" />
            N° Trabajadores *
          </label>
          <input
            type="number"
            min="1"
            max="50"
            value={workerCount}
            onChange={(e) => onWorkerCountChange(Math.max(1, parseInt(e.target.value, 10) || 1))}
            disabled={disabled}
            className="w-full text-sm font-semibold px-3 py-2 bg-white border border-slate-300 rounded-xl focus:outline-none focus:ring-1 focus:ring-primary text-slate-800"
          />
        </div>

        <div className="space-y-1.5">
          <label className="text-xs font-semibold text-slate-700 flex items-center">
            <Clock className="w-3.5 h-3.5 mr-1 text-slate-500" />
            Horas Dedicadas *
          </label>
          <input
            type="number"
            min="0.5"
            max="24"
            step="0.5"
            value={hoursWorked}
            onChange={(e) => onHoursWorkedChange(Math.max(0.5, parseFloat(e.target.value) || 1))}
            disabled={disabled}
            className="w-full text-sm font-semibold px-3 py-2 bg-white border border-slate-300 rounded-xl focus:outline-none focus:ring-1 focus:ring-primary text-slate-800"
          />
        </div>
      </div>

      <div className="text-[11px] text-slate-500 bg-slate-50 p-2.5 rounded-lg flex items-center justify-between border border-slate-100">
        <span>Jornales de turno equivalentes:</span>
        <span className="font-bold text-slate-800">
          {jornalesUsed.toFixed(2)} JR <span className="text-[10px] font-normal text-slate-400">({workerCount} trab. × {hoursWorked} h / 8h)</span>
        </span>
      </div>

      {/* 4. Decisión de Continuidad Operativa */}
      <div className="space-y-2 pt-2 border-t border-slate-100">
        <label className="text-xs font-semibold text-slate-700 uppercase tracking-wide block">
          Decisión de Cierre de Jornada *
        </label>
        <div className="grid grid-cols-2 gap-3">
          <button
            type="button"
            onClick={() => onContinuationDecisionChange('CONTINUA_MANANA')}
            disabled={disabled}
            className={`p-3 rounded-xl border text-left transition-all ${
              continuationDecision === 'CONTINUA_MANANA'
                ? 'bg-blue-50 border-blue-400 text-blue-900 ring-2 ring-blue-400/20'
                : 'bg-white border-slate-200 text-slate-700 hover:bg-slate-50'
            }`}
          >
            <div className="flex items-center space-x-1.5 text-xs font-bold">
              <ArrowRight className="w-3.5 h-3.5 text-blue-600" />
              <span>Continúa Mañana</span>
            </div>
            <div className="text-[10px] text-slate-500 mt-1">
              La cuadrilla retomará esta actividad en el siguiente turno.
            </div>
          </button>

          <button
            type="button"
            onClick={() => onContinuationDecisionChange('TERMINADA_HOY')}
            disabled={disabled}
            className={`p-3 rounded-xl border text-left transition-all ${
              continuationDecision === 'TERMINADA_HOY'
                ? 'bg-emerald-50 border-emerald-400 text-emerald-900 ring-2 ring-emerald-400/20'
                : 'bg-white border-slate-200 text-slate-700 hover:bg-slate-50'
            }`}
          >
            <div className="flex items-center space-x-1.5 text-xs font-bold">
              <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
              <span>Terminada Hoy</span>
            </div>
            <div className="text-[10px] text-slate-500 mt-1">
              Actividad concluida físicamente en este turno.
            </div>
          </button>
        </div>
      </div>

      {/* 5. Observaciones de Campo (Opcional) */}
      <div className="space-y-1.5">
        <label className="text-xs font-semibold text-slate-700 block">
          Notas de Campo (Opcional)
        </label>
        <textarea
          rows={2}
          value={notes}
          onChange={(e) => onNotesChange(e.target.value)}
          placeholder="Condiciones climáticas, novedades del terreno..."
          disabled={disabled}
          className="w-full text-xs px-3 py-2 bg-white border border-slate-200 rounded-xl focus:outline-none focus:ring-1 focus:ring-primary text-slate-800 resize-none"
        />
      </div>
    </div>
  );
};

export default ExecutionForm;
