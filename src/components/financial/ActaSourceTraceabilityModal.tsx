'use client';

import React from 'react';
import { X, FileText, CheckCircle } from 'lucide-react';
import { BilledSourceBreakdown } from '@/lib/realCostVarianceService';
import { formatCopCurrency } from './FinancialSummaryBanner';

interface ActaSourceTraceabilityModalProps {
  isOpen: boolean;
  activityName: string;
  breakdown: BilledSourceBreakdown[];
  onClose: () => void;
}

export const ActaSourceTraceabilityModal: React.FC<ActaSourceTraceabilityModalProps> = ({
  isOpen,
  activityName,
  breakdown,
  onClose,
}) => {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm animate-in fade-in duration-200">
      <div className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-xl shadow-xl w-full max-w-2xl overflow-hidden">
        {/* Modal Header */}
        <div className="flex items-center justify-between p-4 border-b border-gray-100 dark:border-gray-800 bg-gray-50/50 dark:bg-gray-800/50">
          <div className="flex items-center gap-2">
            <FileText className="w-5 h-5 text-purple-600 dark:text-purple-400" />
            <div>
              <h3 className="font-bold text-gray-900 dark:text-gray-100 text-sm uppercase tracking-wide">
                Trazabilidad de Fuentes de Acta
              </h3>
              <p className="text-xs text-gray-500 dark:text-gray-400 font-medium">
                {activityName}
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1 rounded-lg text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Modal Content */}
        <div className="p-4 max-h-[60vh] overflow-y-auto">
          {breakdown.length === 0 ? (
            <p className="text-center py-6 text-xs text-gray-500">
              No hay fuentes de Acta registradas para esta actividad.
            </p>
          ) : (
            <table className="w-full text-left border-collapse text-xs">
              <thead>
                <tr className="bg-gray-50 dark:bg-gray-800/60 text-gray-500 dark:text-gray-400 font-semibold border-b border-gray-200 dark:border-gray-800">
                  <th className="p-2.5">Acta N° / ID</th>
                  <th className="p-2.5">ID Ejecución Física</th>
                  <th className="p-2.5 text-right">Cant. Consumida</th>
                  <th className="p-2.5 text-right">Precio Snapshot</th>
                  <th className="p-2.5 text-right">Valorizado COP</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
                {breakdown.map((item, idx) => (
                  <tr key={item.actaItemSourceId || idx} className="hover:bg-gray-50/50 dark:hover:bg-gray-800/30">
                    <td className="p-2.5 font-semibold text-purple-700 dark:text-purple-300">
                      {item.actaNumero ? `Acta #${item.actaNumero}` : item.actaId.slice(0, 8)}
                    </td>
                    <td className="p-2.5 font-mono text-[11px] text-gray-600 dark:text-gray-400">
                      {item.executionId.slice(0, 8)}...
                    </td>
                    <td className="p-2.5 text-right font-medium">
                      {item.quantityConsumed.toLocaleString()}
                    </td>
                    <td className="p-2.5 text-right font-medium">
                      {formatCopCurrency(item.unitPriceSnapshot)}
                    </td>
                    <td className="p-2.5 text-right font-bold text-purple-600 dark:text-purple-400">
                      {formatCopCurrency(item.billedValueCOP)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>

        {/* Modal Footer */}
        <div className="p-3 border-t border-gray-100 dark:border-gray-800 bg-gray-50/50 dark:bg-gray-800/50 flex justify-end">
          <button
            onClick={onClose}
            className="px-4 py-1.5 text-xs font-semibold rounded-lg bg-gray-900 text-white hover:bg-gray-800 dark:bg-gray-100 dark:text-gray-900 dark:hover:bg-gray-200 transition-colors"
          >
            Cerrar Inspector
          </button>
        </div>
      </div>
    </div>
  );
};
