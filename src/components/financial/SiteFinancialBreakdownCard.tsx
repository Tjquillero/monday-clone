'use client';

import React from 'react';
import { MapPin, ShieldCheck, AlertCircle } from 'lucide-react';
import { OccurrenceVarianceAnalysis } from '@/lib/realCostVarianceService';
import { formatCopCurrency } from './FinancialSummaryBanner';

interface SiteFinancialBreakdownCardProps {
  siteTitle: string;
  occurrences: OccurrenceVarianceAnalysis[];
  unitsMap: Map<string, string>; // planItemId -> unit
}

interface UnitPhysicalBreakdown {
  unit: string;
  planned: number;
  verified: number;
  certifiable: number;
  billed: number;
  pending: number;
}

export const SiteFinancialBreakdownCard: React.FC<SiteFinancialBreakdownCardProps> = ({
  siteTitle,
  occurrences,
  unitsMap,
}) => {
  // 1. Agregación Financiera por Sitio (COP es homogéneo)
  let sitePV = 0;
  let hasUndeterminedPV = false;
  let siteEV = 0;
  let hasUndeterminedEV = false;
  let siteBilled = 0;
  let hasUndeterminedBilled = false;

  const statusCounts = {
    BALANCED: 0,
    PENDING_BILLING: 0,
    OVER_BILLED: 0,
    UNDETERMINED_RECONCILIATION: 0,
  };

  // 2. Agregación Física por Unidad (Segregación Estricta - Condición 3)
  const unitBreakdowns = new Map<string, UnitPhysicalBreakdown>();

  for (const occ of occurrences) {
    // Diagnósticos
    if (statusCounts[occ.billingReconciliationStatus] !== undefined) {
      statusCounts[occ.billingReconciliationStatus]++;
    }

    // PV
    if (occ.plannedValueOccurrenceCOP === 'UNDETERMINED_CONTRACT_VALUE') {
      hasUndeterminedPV = true;
    } else {
      sitePV += occ.plannedValueOccurrenceCOP as number;
    }

    // EV
    if (occ.earnedValueOccurrenceCOP === 'UNDETERMINED_CONTRACT_VALUE') {
      hasUndeterminedEV = true;
    } else {
      siteEV += occ.earnedValueOccurrenceCOP as number;
    }

    // Billed COP
    if (
      occ.billedValueCOP === 'UNDETERMINED_CONTRACT_VALUE' ||
      occ.billedValueCOP === 'UNDETERMINED_RECONCILIATION'
    ) {
      hasUndeterminedBilled = true;
    } else {
      siteBilled += occ.billedValueCOP as number;
    }

    // Unidades físicas segregadas por tipo de unidad
    const unit = (unitsMap.get(occ.planItemId) || 'UND').toUpperCase();
    const existing = unitBreakdowns.get(unit) || {
      unit,
      planned: 0,
      verified: 0,
      certifiable: 0,
      billed: 0,
      pending: 0,
    };

    existing.planned += occ.plannedQty;
    existing.verified += occ.executedQtyVerified;
    existing.certifiable += occ.contractualCertifiableQty;
    if (typeof occ.billedQty === 'number') existing.billed += occ.billedQty;
    if (typeof occ.pendingBillableQty === 'number') existing.pending += occ.pendingBillableQty;

    unitBreakdowns.set(unit, existing);
  }

  const roundedPv = hasUndeterminedPV ? 'UNDETERMINED_CONTRACT_VALUE' : Math.round(sitePV);
  const roundedEv = hasUndeterminedEV ? 'UNDETERMINED_CONTRACT_VALUE' : Math.round(siteEV);
  const roundedBilled = hasUndeterminedBilled ? 'UNDETERMINED_CONTRACT_VALUE' : Math.round(siteBilled);

  return (
    <div className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-xl p-5 mb-4 shadow-sm">
      <div className="flex flex-col md:flex-row md:items-center justify-between pb-4 border-b border-gray-100 dark:border-gray-800 gap-3">
        <div className="flex items-center gap-2">
          <MapPin className="w-5 h-5 text-blue-600 dark:text-blue-400" />
          <h3 className="text-lg font-bold text-gray-900 dark:text-gray-100 uppercase tracking-wide">
            {siteTitle || 'SITIO DE TRABAJO GENERAL'}
          </h3>
          <span className="text-xs px-2 py-0.5 rounded-full font-medium bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-300">
            {occurrences.length} actividades
          </span>
        </div>

        {/* Diagnósticos de Reconciliación */}
        <div className="flex flex-wrap items-center gap-2">
          {statusCounts.PENDING_BILLING > 0 && (
            <span className="inline-flex items-center gap-1 text-xs px-2.5 py-1 rounded-full font-medium bg-blue-50 text-blue-700 dark:bg-blue-950/60 dark:text-blue-300 border border-blue-200 dark:border-blue-800">
              <ShieldCheck className="w-3.5 h-3.5" />
              {statusCounts.PENDING_BILLING} Pendientes de Acta
            </span>
          )}
          {statusCounts.OVER_BILLED > 0 && (
            <span className="inline-flex items-center gap-1 text-xs px-2.5 py-1 rounded-full font-medium bg-rose-50 text-rose-700 dark:bg-rose-950/60 dark:text-rose-300 border border-rose-200 dark:border-rose-800">
              <AlertCircle className="w-3.5 h-3.5" />
              {statusCounts.OVER_BILLED} Sobre-facturados
            </span>
          )}
          {statusCounts.BALANCED > 0 && (
            <span className="inline-flex items-center gap-1 text-xs px-2.5 py-1 rounded-full font-medium bg-emerald-50 text-emerald-700 dark:bg-emerald-950/60 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800">
              <ShieldCheck className="w-3.5 h-3.5" />
              {statusCounts.BALANCED} Conciliados
            </span>
          )}
        </div>
      </div>

      {/* Resumen Monetario COP */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 my-4 p-3 bg-gray-50 dark:bg-gray-800/40 rounded-lg">
        <div>
          <span className="text-xs text-gray-500 dark:text-gray-400 block font-medium">Valor Planificado (PV)</span>
          <span className="text-base font-bold text-gray-900 dark:text-gray-100">
            {formatCopCurrency(roundedPv)}
          </span>
        </div>
        <div>
          <span className="text-xs text-gray-500 dark:text-gray-400 block font-medium">Valor Ganado Verificado (EV)</span>
          <span className="text-base font-bold text-emerald-600 dark:text-emerald-400">
            {formatCopCurrency(roundedEv)}
          </span>
        </div>
        <div>
          <span className="text-xs text-gray-500 dark:text-gray-400 block font-medium">Valorizado En Acta</span>
          <span className="text-base font-bold text-purple-600 dark:text-purple-400">
            {formatCopCurrency(roundedBilled)}
          </span>
        </div>
      </div>

      {/* Segregación de Magnitudes Físicas por Unidad Homogénea */}
      <div className="mt-3">
        <h4 className="text-xs font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-400 mb-2">
          Desglose de Avance Físico por Unidad Heterogénea
        </h4>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {Array.from(unitBreakdowns.values()).map((ub) => (
            <div
              key={ub.unit}
              className="p-3 border border-gray-200 dark:border-gray-800 rounded-lg bg-white dark:bg-gray-900 text-xs"
            >
              <div className="font-bold text-gray-800 dark:text-gray-200 mb-1">
                Unidad: <span className="text-blue-600 dark:text-blue-400">{ub.unit}</span>
              </div>
              <div className="flex justify-between py-0.5 text-gray-600 dark:text-gray-400">
                <span>Planificado (Q planned):</span>
                <span className="font-semibold text-gray-900 dark:text-gray-100">{ub.planned.toLocaleString()} {ub.unit}</span>
              </div>
              <div className="flex justify-between py-0.5 text-gray-600 dark:text-gray-400">
                <span>Verificado (Q verified):</span>
                <span className="font-semibold text-emerald-600 dark:text-emerald-400">{ub.verified.toLocaleString()} {ub.unit}</span>
              </div>
              <div className="flex justify-between py-0.5 text-gray-600 dark:text-gray-400">
                <span>En Acta (Q acta):</span>
                <span className="font-semibold text-purple-600 dark:text-purple-400">{ub.billed.toLocaleString()} {ub.unit}</span>
              </div>
              <div className="flex justify-between py-0.5 border-t border-gray-100 dark:border-gray-800 mt-1 pt-1 font-semibold">
                <span>Saldo Liquidable:</span>
                <span className="text-blue-600 dark:text-blue-400">{ub.pending.toLocaleString()} {ub.unit}</span>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};
