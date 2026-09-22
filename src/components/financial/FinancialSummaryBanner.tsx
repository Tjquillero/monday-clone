'use client';

import React from 'react';
import { DollarSign, FileCheck, AlertTriangle, TrendingUp } from 'lucide-react';
import { SiteExecutiveVarianceSummary, UndeterminedContractValue, UndeterminedReconciliation } from '@/lib/realCostVarianceService';

interface FinancialSummaryBannerProps {
  summary: SiteExecutiveVarianceSummary | null;
}

export function formatCopCurrency(value: number | UndeterminedContractValue | UndeterminedReconciliation): React.ReactNode {
  if (value === 'UNDETERMINED_CONTRACT_VALUE') {
    return (
      <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-semibold bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-300 border border-gray-300 dark:border-gray-700">
        Sin Precio POA
      </span>
    );
  }
  if (value === 'UNDETERMINED_RECONCILIATION') {
    return (
      <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-semibold bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-300 border border-amber-300 dark:border-amber-700">
        Pendiente Reconciliación
      </span>
    );
  }

  return (
    <span>
      {new Intl.NumberFormat('es-CO', {
        style: 'currency',
        currency: 'COP',
        maximumFractionDigits: 0,
      }).format(value)}
    </span>
  );
}

export const FinancialSummaryBanner: React.FC<FinancialSummaryBannerProps> = ({ summary }) => {
  if (!summary) return null;

  const {
    totalOccurrencesCount,
    scopeComplianceRate,
    totalPlannedValueCOP,
    totalEarnedValueCOP,
    totalContractualValueVarianceCOP,
    totalBilledValueCOP,
  } = summary;

  const isCvvPositive =
    typeof totalContractualValueVarianceCOP === 'number' && totalContractualValueVarianceCOP >= 0;

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
      {/* 1. Valor Planificado (PV) */}
      <div className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-xl p-4 shadow-sm">
        <div className="flex items-center justify-between">
          <span className="text-xs font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-400">
            Valor Planificado (PV)
          </span>
          <div className="p-2 bg-blue-50 dark:bg-blue-950/50 rounded-lg text-blue-600 dark:text-blue-400">
            <DollarSign className="w-5 h-5" />
          </div>
        </div>
        <div className="mt-2 text-2xl font-bold text-gray-900 dark:text-gray-100">
          {formatCopCurrency(totalPlannedValueCOP)}
        </div>
        <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
          {totalOccurrencesCount} actividades programadas
        </p>
      </div>

      {/* 2. Valor Ganado Verificado (EV) */}
      <div className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-xl p-4 shadow-sm">
        <div className="flex items-center justify-between">
          <span className="text-xs font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-400">
            Valor Ganado Verificado (EV)
          </span>
          <div className="p-2 bg-emerald-50 dark:bg-emerald-950/50 rounded-lg text-emerald-600 dark:text-emerald-400">
            <TrendingUp className="w-5 h-5" />
          </div>
        </div>
        <div className="mt-2 text-2xl font-bold text-emerald-600 dark:text-emerald-400">
          {formatCopCurrency(totalEarnedValueCOP)}
        </div>
        <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
          Cumplimiento físico de alcance: <span className="font-semibold">{scopeComplianceRate}%</span>
        </p>
      </div>

      {/* 3. Desviación de Valor Contractual (CVV) */}
      <div className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-xl p-4 shadow-sm">
        <div className="flex items-center justify-between">
          <span className="text-xs font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-400">
            Desviación de Valor (CVV = EV - PV)
          </span>
          <div
            className={`p-2 rounded-lg ${
              isCvvPositive
                ? 'bg-emerald-50 text-emerald-600 dark:bg-emerald-950/50 dark:text-emerald-400'
                : 'bg-rose-50 text-rose-600 dark:bg-rose-950/50 dark:text-rose-400'
            }`}
          >
            <AlertTriangle className="w-5 h-5" />
          </div>
        </div>
        <div
          className={`mt-2 text-2xl font-bold ${
            typeof totalContractualValueVarianceCOP === 'number'
              ? isCvvPositive
                ? 'text-emerald-600 dark:text-emerald-400'
                : 'text-rose-600 dark:text-rose-400'
              : 'text-gray-900 dark:text-gray-100'
          }`}
        >
          {formatCopCurrency(totalContractualValueVarianceCOP)}
        </div>
        <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
          Superávit (+) / Deficiencia (-) contractual
        </p>
      </div>

      {/* 4. Valor En Acta / Certificado Incorporado */}
      <div className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-xl p-4 shadow-sm">
        <div className="flex items-center justify-between">
          <span className="text-xs font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-400">
            Valorizado En Acta
          </span>
          <div className="p-2 bg-purple-50 dark:bg-purple-950/50 rounded-lg text-purple-600 dark:text-purple-400">
            <FileCheck className="w-5 h-5" />
          </div>
        </div>
        <div className="mt-2 text-2xl font-bold text-purple-600 dark:text-purple-400">
          {formatCopCurrency(totalBilledValueCOP)}
        </div>
        <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
          Monto total amparado en Actas de Obra
        </p>
      </div>
    </div>
  );
};
