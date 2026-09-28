'use client';

import React from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { ShieldAlert, FileCheck, Loader2, X, AlertTriangle } from 'lucide-react';
import { CertifiedActa, CertifiedActaTotals } from '@/types/monday';

const currencyFormatter = new Intl.NumberFormat('es-CO', {
  style: 'currency',
  currency: 'COP',
  maximumFractionDigits: 0,
});

interface GovernedActaIssuanceModalProps {
  isOpen: boolean;
  acta: CertifiedActa;
  totals?: CertifiedActaTotals | null;
  isPending: boolean;
  onConfirm: () => Promise<void>;
  onClose: () => void;
}

export const GovernedActaIssuanceModal: React.FC<GovernedActaIssuanceModalProps> = ({
  isOpen,
  acta,
  totals,
  isPending,
  onConfirm,
  onClose,
}) => {
  if (!isOpen) return null;

  return (
    <AnimatePresence>
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm">
        <motion.div
          initial={{ opacity: 0, scale: 0.95, y: 10 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.95, y: 10 }}
          className="bg-white rounded-3xl shadow-2xl border border-slate-200 max-w-2xl w-full overflow-hidden flex flex-col max-h-[90vh]"
          role="dialog"
          aria-modal="true"
          aria-labelledby="issuance-modal-title"
        >
          {/* Header */}
          <div className="px-6 py-5 bg-slate-900 text-white flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-2xl bg-emerald-500/20 border border-emerald-500/40 flex items-center justify-center text-emerald-400">
                <FileCheck className="w-5 h-5" />
              </div>
              <div>
                <h3 id="issuance-modal-title" className="text-lg font-black tracking-tight">
                  Revisión y Emisión de Acta Contractual
                </h3>
                <p className="text-xs text-slate-400">
                  Verificación de liquidación financiera oficial antes de congelar el documento
                </p>
              </div>
            </div>
            <button
              onClick={onClose}
              disabled={isPending}
              className="p-2 text-slate-400 hover:text-white rounded-xl hover:bg-slate-800 transition-colors disabled:opacity-50"
              aria-label="Cerrar modal"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          {/* Body Content */}
          <div className="p-6 overflow-y-auto space-y-6">
            {/* Irreversibility Warning Banner */}
            <div className="p-4 rounded-2xl bg-amber-50 border border-amber-200/80 text-amber-900 flex items-start gap-3">
              <AlertTriangle className="w-5 h-5 text-amber-600 shrink-0 mt-0.5" />
              <div className="text-xs space-y-1">
                <p className="font-bold">Advertencia de Inmutabilidad Contractual (ADR-0003 / ADR-0012)</p>
                <p className="text-amber-800 leading-relaxed">
                  Al emitir el Acta, el sistema asignará el número consecutivo oficial y <strong>congelará permanentemente</strong> los snapshots de precios unitarios, descripciones y cantidades facturadas. Esta acción es <strong>irreversible</strong> y no podrá ser modificada posteriormente.
                </p>
              </div>
            </div>

            {/* Financial Summary Breakdown */}
            <div className="border border-slate-200 rounded-2xl p-5 bg-slate-50 space-y-4">
              <div className="flex items-center justify-between border-b border-slate-200 pb-3">
                <span className="text-xs font-bold uppercase tracking-wider text-slate-500">Líneas Facturables</span>
                <span className="text-sm font-black text-slate-800">{acta.items.length} actividad(es)</span>
              </div>

              {totals ? (
                <div className="space-y-2 text-sm">
                  <div className="flex justify-between text-slate-600">
                    <span>Subtotal (Costos Directos)</span>
                    <span className="font-semibold">{currencyFormatter.format(totals.subtotal)}</span>
                  </div>
                  <div className="flex justify-between text-slate-600">
                    <span>Administración (20%)</span>
                    <span>{currencyFormatter.format(totals.administracion)}</span>
                  </div>
                  <div className="flex justify-between text-slate-600">
                    <span>Imprevistos (5%)</span>
                    <span>{currencyFormatter.format(totals.imprevistos)}</span>
                  </div>
                  <div className="flex justify-between text-slate-600">
                    <span>Utilidad (5%)</span>
                    <span>{currencyFormatter.format(totals.utilidad)}</span>
                  </div>
                  <div className="flex justify-between pt-3 border-t border-slate-200 text-slate-900 font-black text-base">
                    <span>Total Liquidado a Pagar</span>
                    <span className="text-emerald-700">{currencyFormatter.format(totals.total_pagar)}</span>
                  </div>
                </div>
              ) : (
                <div className="py-3 text-center text-slate-400 text-xs">Calculando totales oficiales...</div>
              )}
            </div>

            {/* Quick Item List */}
            <div className="space-y-2">
              <h4 className="text-xs font-bold uppercase tracking-wider text-slate-500">Conceptos a Facturar</h4>
              <div className="border border-slate-200 rounded-2xl overflow-hidden divide-y divide-slate-100 max-h-44 overflow-y-auto">
                {acta.items.map((item) => (
                  <div key={item.id} className="p-3 bg-white flex items-center justify-between text-xs hover:bg-slate-50">
                    <div className="min-w-0 pr-3">
                      <p className="font-bold text-slate-800 truncate">{item.descripcion_snapshot}</p>
                      <p className="text-slate-400 text-[11px]">
                        {item.cantidad_facturada.toLocaleString('es-CO', { maximumFractionDigits: 2 })} {item.unidad_snapshot} × {currencyFormatter.format(item.precio_unitario_snapshot)}
                      </p>
                    </div>
                    <span className="font-black text-slate-800 shrink-0">
                      {currencyFormatter.format(item.valor_total)}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* Footer Actions */}
          <div className="px-6 py-4 bg-slate-50 border-t border-slate-200 flex items-center justify-end gap-3">
            <button
              type="button"
              onClick={onClose}
              disabled={isPending}
              className="px-5 py-2.5 rounded-xl border border-slate-200 font-bold text-xs text-slate-600 hover:bg-slate-100 transition-colors disabled:opacity-50"
            >
              Cancelar
            </button>
            <button
              type="button"
              onClick={onConfirm}
              disabled={isPending || acta.items.length === 0}
              className="flex items-center gap-2 px-6 py-2.5 bg-emerald-600 text-white rounded-xl font-black text-xs hover:bg-emerald-700 transition-colors shadow-lg shadow-emerald-900/20 disabled:opacity-50"
            >
              {isPending ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  Emitiendo Acta...
                </>
              ) : (
                <>
                  <FileCheck className="w-4 h-4" />
                  Confirmar y Emitir Acta
                </>
              )}
            </button>
          </div>
        </motion.div>
      </div>
    </AnimatePresence>
  );
};
