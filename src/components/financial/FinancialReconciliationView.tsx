'use client';

import React, { useState, useMemo } from 'react';
import { useSiteFinancialVariance } from '@/hooks/useSiteFinancialVariance';
import { FinancialSummaryBanner } from './FinancialSummaryBanner';
import { SiteFinancialBreakdownCard } from './SiteFinancialBreakdownCard';
import { FinancialOccurrenceTable } from './FinancialOccurrenceTable';
import { ActaSourceTraceabilityModal } from './ActaSourceTraceabilityModal';
import { BilledSourceBreakdown, OccurrenceVarianceAnalysis } from '@/lib/realCostVarianceService';
import { RefreshCw, DollarSign, ShieldCheck } from 'lucide-react';

interface FinancialReconciliationViewProps {
  boardId?: string;
}

export const FinancialReconciliationView: React.FC<FinancialReconciliationViewProps> = ({ boardId }) => {
  const { summary, planItems, isLoading, error } = useSiteFinancialVariance({ boardId });

  const [modalState, setModalState] = useState<{
    isOpen: boolean;
    activityName: string;
    breakdown: BilledSourceBreakdown[];
  }>({
    isOpen: false,
    activityName: '',
    breakdown: [],
  });

  // Mapeos auxiliares
  const unitsMap = useMemo(() => {
    const map = new Map<string, string>();
    (planItems || []).forEach((item) => {
      map.set(item.id, item.unit || 'UND');
    });
    return map;
  }, [planItems]);

  const occurrencesBySite = useMemo(() => {
    if (!summary?.occurrences) return new Map<string, OccurrenceVarianceAnalysis[]>();
    const map = new Map<string, OccurrenceVarianceAnalysis[]>();

    summary.occurrences.forEach((occ) => {
      const planItem = planItems.find((p) => p.id === occ.planItemId);
      const siteName = planItem?.zone || 'SITIO GENERAL';

      const existing = map.get(siteName) || [];
      existing.push(occ);
      map.set(siteName, existing);
    });

    return map;
  }, [summary, planItems]);

  if (isLoading) {
    return (
      <div className="flex flex-col items-center justify-center p-12 bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800">
        <RefreshCw className="w-8 h-8 text-blue-600 dark:text-blue-400 animate-spin mb-3" />
        <p className="text-sm font-semibold text-gray-700 dark:text-gray-300">
          Cargando Reconciliación Financiera y Control de Actas...
        </p>
        <p className="text-xs text-gray-400 mt-1">
          Evaluando certidumbre de ejecuciones físicas y fuentes de Actas (ADR-0012)
        </p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="p-6 bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-800 rounded-xl text-rose-800 dark:text-rose-200">
        <h4 className="font-bold text-sm">Error en Reconciliación Financiera</h4>
        <p className="text-xs mt-1">{error.message}</p>
      </div>
    );
  }

  return (
    <div className="w-full space-y-6">
      {/* Header de la Superficie Consultiva */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between pb-4 border-b border-gray-200 dark:border-gray-800 gap-4">
        <div>
          <div className="flex items-center gap-2">
            <DollarSign className="w-6 h-6 text-purple-600 dark:text-purple-400" />
            <h2 className="text-xl font-extrabold text-gray-900 dark:text-gray-100 tracking-tight">
              Reconciliación Financiera y Control de Actas
            </h2>
          </div>
          <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
            Superficie consultiva pura · Cruzamiento de Avance Verificado vs. Valorización POA y Actas de Obra (ADR-0012)
          </p>
        </div>

        <div className="flex items-center gap-2">
          <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold bg-purple-50 text-purple-700 dark:bg-purple-950/60 dark:text-purple-300 border border-purple-200 dark:border-purple-800">
            <ShieldCheck className="w-4 h-4" />
            Solo Lectura (0 Mutaciones)
          </span>
        </div>
      </div>

      {/* 1. Banner Consolidado Ejecutivo */}
      <FinancialSummaryBanner summary={summary} />

      {/* 2. Desglose Financiero y Físico por Sitio */}
      <div className="space-y-4">
        <h3 className="text-xs font-bold uppercase tracking-wider text-gray-500 dark:text-gray-400">
          Resumen Gerencial por Sitio de Trabajo
        </h3>
        {Array.from(occurrencesBySite.entries()).map(([siteTitle, occurrences]) => (
          <SiteFinancialBreakdownCard
            key={siteTitle}
            siteTitle={siteTitle}
            occurrences={occurrences}
            unitsMap={unitsMap}
          />
        ))}
      </div>

      {/* 3. Matriz Detallada de Ocurrencias */}
      <FinancialOccurrenceTable
        occurrences={summary?.occurrences || []}
        unitsMap={unitsMap}
        onSelectBreakdown={(activityName, breakdown) => {
          setModalState({
            isOpen: true,
            activityName,
            breakdown,
          });
        }}
      />

      {/* 4. Modal Inspector de Fuentes de Acta */}
      <ActaSourceTraceabilityModal
        isOpen={modalState.isOpen}
        activityName={modalState.activityName}
        breakdown={modalState.breakdown}
        onClose={() => setModalState((prev) => ({ ...prev, isOpen: false }))}
      />
    </div>
  );
};
