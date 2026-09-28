'use client';

import React from 'react';
import {
  OccurrenceVarianceAnalysis,
  BillingReconciliationStatus,
  BilledSourceBreakdown,
  UndeterminedReconciliation,
  UndeterminedContractValue,
} from '@/lib/realCostVarianceService';
import { formatCopCurrency } from './FinancialSummaryBanner';
import { Eye, ShieldAlert, CheckCircle2, Clock } from 'lucide-react';

interface FinancialOccurrenceTableProps {
  occurrences: OccurrenceVarianceAnalysis[];
  unitsMap: Map<string, string>;
  onSelectBreakdown: (occurrenceName: string, breakdown: BilledSourceBreakdown[]) => void;
}

export function renderReconciliationBadge(status: BillingReconciliationStatus): React.ReactNode {
  switch (status) {
    case 'BALANCED':
      return (
        <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-[var(--radius-control)] text-xs font-semibold bg-emerald-50 text-emerald-700 dark:bg-emerald-950/60 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800">
          <CheckCircle2 className="w-3 h-3" />
          BALANCED
        </span>
      );
    case 'PENDING_BILLING':
      return (
        <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-[var(--radius-control)] text-xs font-semibold bg-[var(--color-primary-subtle)] text-[var(--color-primary)] border border-[var(--color-primary)]/20">
          <Clock className="w-3 h-3" />
          PENDING_BILLING
        </span>
      );
    case 'OVER_BILLED':
      return (
        <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-[var(--radius-control)] text-xs font-semibold bg-rose-50 text-rose-700 dark:bg-rose-950/60 dark:text-rose-300 border border-rose-200 dark:border-rose-800">
          <ShieldAlert className="w-3 h-3" />
          OVER_BILLED
        </span>
      );
    case 'UNDETERMINED_RECONCILIATION':
    default:
      return (
        <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-[var(--radius-control)] text-xs font-semibold bg-[var(--color-surface-subtle)] text-[var(--text-muted)] border border-[var(--border-color)]">
          UNDETERMINED
        </span>
      );
  }
}

export function formatQuantityOrIndetermined(val: number | UndeterminedReconciliation | UndeterminedContractValue, unit: string): React.ReactNode {
  if (val === 'UNDETERMINED_RECONCILIATION' || val === 'UNDETERMINED_CONTRACT_VALUE') {
    return (
      <span className="text-amber-600 dark:text-amber-400 font-medium italic text-xs">
        Indeterminado
      </span>
    );
  }
  return (
    <span className="font-mono">
      {val.toLocaleString()} <span className="text-[var(--text-muted)] text-[10px]">{unit}</span>
    </span>
  );
}

export const FinancialOccurrenceTable: React.FC<FinancialOccurrenceTableProps> = ({
  occurrences,
  unitsMap,
  onSelectBreakdown,
}) => {
  if (occurrences.length === 0) {
    return (
      <div className="p-8 text-center text-[var(--text-muted)] bg-[var(--card-bg)] border border-[var(--border-color)] rounded-[var(--radius-surface)]">
        No se encontraron actividades planificadas para reconciliación financiera en este tablero.
      </div>
    );
  }

  return (
    <div className="bg-[var(--card-bg)] border border-[var(--border-color)] rounded-[var(--radius-surface)] overflow-hidden shadow-[var(--shadow-card)]">
      <div className="p-4 border-b border-[var(--border-color)] flex justify-between items-center">
        <h3 className="font-brand font-bold text-[var(--text-primary)] text-sm uppercase tracking-wide">
          Matriz de Reconciliación por Actividad ({occurrences.length} ítems)
        </h3>
        <span className="text-xs text-[var(--text-muted)]">
          Valores físicos y financieros en tiempo real
        </span>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-left border-collapse text-xs">
          <thead>
            <tr className="bg-[var(--color-surface-subtle)] text-[var(--text-secondary)] font-semibold border-b border-[var(--border-color)]">
              <th className="p-3">Actividad</th>
              <th className="p-3 text-center">Unid</th>
              <th className="p-3 text-right">Q Programada</th>
              <th className="p-3 text-right">Q Verificada</th>
              <th className="p-3 text-right">Q Certificable</th>
              <th className="p-3 text-right">Q En Acta</th>
              <th className="p-3 text-right text-[var(--color-primary)] dark:text-[var(--text-primary)]">Saldo Liquidable</th>
              <th className="p-3 text-right">PV (COP)</th>
              <th className="p-3 text-right text-emerald-600 dark:text-emerald-400">EV (COP)</th>
              <th className="p-3 text-right text-[var(--text-primary)]">Valor En Acta</th>
              <th className="p-3 text-center">Diagnóstico</th>
              <th className="p-3 text-center">Trazabilidad</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-[var(--border-color)]">
            {occurrences.map((occ) => {
              const unit = (unitsMap.get(occ.planItemId) || 'UND').toUpperCase();
              const hasBreakdown = occ.billedValueBreakdown && occ.billedValueBreakdown.length > 0;

              return (
                <tr
                  key={occ.occurrenceKey || occ.planItemId}
                  className="hover:bg-[var(--color-surface-subtle)] transition-colors"
                >
                  <td className="p-3 font-medium text-[var(--text-primary)] max-w-[220px] truncate" title={occ.activityName}>
                    {occ.activityName}
                  </td>
                  <td className="p-3 text-center uppercase font-mono font-medium text-[var(--text-muted)]">
                    {unit}
                  </td>
                  <td className="p-3 text-right font-medium">
                    {formatQuantityOrIndetermined(occ.plannedQty, unit)}
                  </td>
                  <td className="p-3 text-right font-medium text-emerald-600 dark:text-emerald-400">
                    {formatQuantityOrIndetermined(occ.executedQtyVerified, unit)}
                  </td>
                  <td className="p-3 text-right font-medium text-emerald-700 dark:text-emerald-300">
                    {formatQuantityOrIndetermined(occ.contractualCertifiableQty, unit)}
                  </td>
                  <td className="p-3 text-right font-medium text-[var(--color-accent)] font-mono">
                    {formatQuantityOrIndetermined(occ.billedQty, unit)}
                  </td>
                  <td className="p-3 text-right font-bold font-mono text-[var(--color-primary)] dark:text-[var(--text-primary)]">
                    {formatQuantityOrIndetermined(occ.pendingBillableQty, unit)}
                  </td>
                  <td className="p-3 text-right font-medium font-mono text-[var(--text-primary)]">
                    {formatCopCurrency(occ.plannedValueOccurrenceCOP)}
                  </td>
                  <td className="p-3 text-right font-medium font-mono text-emerald-600 dark:text-emerald-400">
                    {formatCopCurrency(occ.earnedValueOccurrenceCOP)}
                  </td>
                  <td className="p-3 text-right font-medium font-mono text-[var(--text-primary)]">
                    {formatCopCurrency(occ.billedValueCOP)}
                  </td>
                  <td className="p-3 text-center whitespace-nowrap">
                    {renderReconciliationBadge(occ.billingReconciliationStatus)}
                  </td>
                  <td className="p-3 text-center">
                    {hasBreakdown ? (
                      <button
                        onClick={() => onSelectBreakdown(occ.activityName, occ.billedValueBreakdown)}
                        className="inline-flex items-center gap-1 text-xs px-2.5 py-1 rounded-[var(--radius-control)] bg-[var(--color-primary-subtle)] text-[var(--color-primary)] hover:bg-[var(--color-primary)] hover:text-[var(--color-primary-foreground)] transition-colors font-medium"
                        title="Ver desglose de fuentes de Acta"
                      >
                        <Eye className="w-3 h-3" />
                        {occ.billedValueBreakdown.length} Fuentes
                      </button>
                    ) : (
                      <span className="text-[var(--text-muted)] text-[11px] italic">Sin Acta</span>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
};
