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
        <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-emerald-100 text-emerald-800 dark:bg-emerald-950/60 dark:text-emerald-300 border border-emerald-300 dark:border-emerald-800">
          <CheckCircle2 className="w-3 h-3" />
          BALANCED
        </span>
      );
    case 'PENDING_BILLING':
      return (
        <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-blue-100 text-blue-800 dark:bg-blue-950/60 dark:text-blue-300 border border-blue-300 dark:border-blue-800">
          <Clock className="w-3 h-3" />
          PENDING_BILLING
        </span>
      );
    case 'OVER_BILLED':
      return (
        <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-rose-100 text-rose-800 dark:bg-rose-950/60 dark:text-rose-300 border border-rose-300 dark:border-rose-800">
          <ShieldAlert className="w-3 h-3" />
          OVER_BILLED
        </span>
      );
    case 'UNDETERMINED_RECONCILIATION':
    default:
      return (
        <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-300 border border-gray-300 dark:border-gray-700">
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
    <span>
      {val.toLocaleString()} <span className="text-gray-400 text-[10px]">{unit}</span>
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
      <div className="p-8 text-center text-gray-500 bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-xl">
        No se encontraron actividades planificadas para reconciliación financiera en este tablero.
      </div>
    );
  }

  return (
    <div className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-xl overflow-hidden shadow-sm">
      <div className="p-4 border-b border-gray-100 dark:border-gray-800 flex justify-between items-center">
        <h3 className="font-bold text-gray-900 dark:text-gray-100 text-sm uppercase tracking-wide">
          Matriz de Reconciliación por Actividad ({occurrences.length} ítems)
        </h3>
        <span className="text-xs text-gray-500 dark:text-gray-400">
          Valores físicos y financieros en tiempo real
        </span>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-left border-collapse text-xs">
          <thead>
            <tr className="bg-gray-50 dark:bg-gray-800/60 text-gray-500 dark:text-gray-400 font-semibold border-b border-gray-200 dark:border-gray-800">
              <th className="p-3">Actividad</th>
              <th className="p-3 text-center">Unid</th>
              <th className="p-3 text-right">Q Programada</th>
              <th className="p-3 text-right">Q Verificada</th>
              <th className="p-3 text-right">Q Certificable</th>
              <th className="p-3 text-right">Q En Acta</th>
              <th className="p-3 text-right text-blue-600 dark:text-blue-400">Saldo Liquidable</th>
              <th className="p-3 text-right">PV (COP)</th>
              <th className="p-3 text-right text-emerald-600 dark:text-emerald-400">EV (COP)</th>
              <th className="p-3 text-right text-purple-600 dark:text-purple-400">Valor En Acta</th>
              <th className="p-3 text-center">Diagnóstico</th>
              <th className="p-3 text-center">Trazabilidad</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
            {occurrences.map((occ) => {
              const unit = (unitsMap.get(occ.planItemId) || 'UND').toUpperCase();
              const hasBreakdown = occ.billedValueBreakdown && occ.billedValueBreakdown.length > 0;

              return (
                <tr
                  key={occ.occurrenceKey || occ.planItemId}
                  className="hover:bg-gray-50/80 dark:hover:bg-gray-800/40 transition-colors"
                >
                  <td className="p-3 font-semibold text-gray-900 dark:text-gray-100 max-w-[220px] truncate" title={occ.activityName}>
                    {occ.activityName}
                  </td>
                  <td className="p-3 text-center uppercase font-medium text-gray-500">
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
                  <td className="p-3 text-right font-medium text-purple-600 dark:text-purple-400">
                    {formatQuantityOrIndetermined(occ.billedQty, unit)}
                  </td>
                  <td className="p-3 text-right font-bold text-blue-600 dark:text-blue-400">
                    {formatQuantityOrIndetermined(occ.pendingBillableQty, unit)}
                  </td>
                  <td className="p-3 text-right font-medium">
                    {formatCopCurrency(occ.plannedValueOccurrenceCOP)}
                  </td>
                  <td className="p-3 text-right font-medium text-emerald-600 dark:text-emerald-400">
                    {formatCopCurrency(occ.earnedValueOccurrenceCOP)}
                  </td>
                  <td className="p-3 text-right font-medium text-purple-600 dark:text-purple-400">
                    {formatCopCurrency(occ.billedValueCOP)}
                  </td>
                  <td className="p-3 text-center whitespace-nowrap">
                    {renderReconciliationBadge(occ.billingReconciliationStatus)}
                  </td>
                  <td className="p-3 text-center">
                    {hasBreakdown ? (
                      <button
                        onClick={() => onSelectBreakdown(occ.activityName, occ.billedValueBreakdown)}
                        className="inline-flex items-center gap-1 text-xs px-2 py-1 rounded bg-purple-50 text-purple-700 hover:bg-purple-100 dark:bg-purple-950/60 dark:text-purple-300 dark:hover:bg-purple-900/80 transition-colors font-medium"
                        title="Ver desglose de fuentes de Acta"
                      >
                        <Eye className="w-3 h-3" />
                        {occ.billedValueBreakdown.length} Fuentes
                      </button>
                    ) : (
                      <span className="text-gray-400 text-[11px] italic">Sin Acta</span>
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
