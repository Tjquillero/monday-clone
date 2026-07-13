'use client';

import { useState } from 'react';
import { FileText, FileCheck, Loader2, Plus, Send } from 'lucide-react';
import {
  useCertifiedActaDraft,
  useCertifiedActasIssued,
  useCertifiedActaMutations,
} from '@/hooks/useCertifiedActas';
import { MatrixQtyInput } from './ActasModuleComponents';

// Vista del subsistema "Actas certificadas" (Incremento 5, Commit 4).
//
// Este componente NUNCA calcula: no hay AIU, no hay redistribución de
// saldos, no hay numeración. Cada valor mostrado viene ya resuelto desde
// la base (generate_acta_draft/adjust_acta_item_quantity/issue_acta).
// El flujo es siempre: invocar la RPC -> refrescar -> mostrar.
//
// Convive con ActasModule.tsx (histórico, financial_actas) — no lo
// reemplaza. Ver docs/adr/ADR-0003-billing-source.md.

const currencyFormatter = new Intl.NumberFormat('es-CO', {
  style: 'currency',
  currency: 'COP',
  maximumFractionDigits: 0,
});

interface CertifiedActasModuleProps {
  boardId?: string;
}

export default function CertifiedActasModule({ boardId }: CertifiedActasModuleProps) {
  const { data: draft, isLoading: draftLoading } = useCertifiedActaDraft(boardId);
  const { data: issuedActas, isLoading: issuedLoading } = useCertifiedActasIssued(boardId);
  const { generateDraft, adjustQuantity, issueActa } = useCertifiedActaMutations(boardId);

  const [selectedIssuedId, setSelectedIssuedId] = useState<string | null>(null);
  const selectedIssued = issuedActas?.find(a => a.id === selectedIssuedId) || null;

  const displayedActa = selectedIssued || draft;
  const isReadOnly = displayedActa?.estado === 'issued';

  const handleIssue = async () => {
    if (!draft) return;
    if (!window.confirm('¿Emitir esta acta? Una vez emitida queda congelada y no se puede volver a editar.')) return;
    try {
      await issueActa.mutateAsync(draft.id);
      setSelectedIssuedId(null);
    } catch (error: any) {
      alert(`No se pudo emitir el acta: ${error.message}`);
    }
  };

  const handleAdjust = (actaItemId: string, cantidad: number) => {
    adjustQuantity.mutate(
      { actaItemId, cantidad },
      {
        onError: (error: any) => alert(`No se pudo ajustar la cantidad: ${error.message}`),
      }
    );
  };

  if (!boardId) return null;

  return (
    <div className="p-6 bg-white rounded-[2rem] shadow-sm min-h-[600px]">
      <div className="flex items-center justify-between mb-8">
        <div>
          <h2 className="text-2xl font-black text-slate-800">Actas Certificadas</h2>
          <p className="text-slate-500 font-medium">
            Facturación generada a partir de ejecuciones verificadas del POA
          </p>
        </div>
        {!draft && !draftLoading && (
          <button
            onClick={() => generateDraft.mutate()}
            disabled={generateDraft.isPending}
            className="flex items-center gap-2 px-4 py-2 bg-slate-900 text-white rounded-xl font-bold hover:bg-slate-800 transition-colors shadow-lg shadow-slate-900/20 disabled:opacity-50"
          >
            {generateDraft.isPending ? <Loader2 size={18} className="animate-spin" /> : <Plus size={18} />}
            Generar Borrador
          </button>
        )}
      </div>

      <div className="flex gap-6">
        {/* Historial de actas emitidas */}
        <div className="w-64 shrink-0">
          <h3 className="text-xs font-black text-slate-400 uppercase tracking-widest mb-3">Emitidas</h3>
          <div className="flex flex-col gap-2">
            {draft && (
              <button
                onClick={() => setSelectedIssuedId(null)}
                className={`text-left p-3 rounded-xl border transition-colors ${
                  !selectedIssuedId ? 'border-emerald-300 bg-emerald-50' : 'border-slate-100 hover:bg-slate-50'
                }`}
              >
                <div className="flex items-center gap-2 text-sm font-bold text-slate-700">
                  <FileText size={14} /> Borrador actual
                </div>
              </button>
            )}
            {issuedLoading ? (
              <div className="text-slate-400 text-sm py-2">Cargando...</div>
            ) : issuedActas?.length === 0 ? (
              <div className="text-slate-300 text-sm py-2">Sin actas emitidas todavía.</div>
            ) : (
              issuedActas?.map(acta => (
                <button
                  key={acta.id}
                  onClick={() => setSelectedIssuedId(acta.id)}
                  className={`text-left p-3 rounded-xl border transition-colors ${
                    selectedIssuedId === acta.id ? 'border-blue-300 bg-blue-50' : 'border-slate-100 hover:bg-slate-50'
                  }`}
                >
                  <div className="flex items-center gap-2 text-sm font-bold text-slate-700">
                    <FileCheck size={14} /> Acta {acta.numero}
                  </div>
                  <div className="text-xs text-slate-400 mt-1">
                    {acta.issued_at ? new Date(acta.issued_at).toLocaleDateString('es-CO') : ''}
                  </div>
                </button>
              ))
            )}
          </div>
        </div>

        {/* Detalle del acta seleccionada (borrador o emitida) */}
        <div className="flex-1 min-w-0">
          {draftLoading ? (
            <div className="py-12 text-center text-slate-400">Cargando...</div>
          ) : !displayedActa ? (
            <div className="py-12 text-center text-slate-400 border-2 border-dashed border-slate-100 rounded-3xl">
              <FileText size={48} className="mx-auto mb-4 opacity-20" />
              <p>No hay un borrador abierto. Genera uno para empezar.</p>
            </div>
          ) : (
            <>
              <div className="flex items-center justify-between mb-4">
                <div>
                  <h3 className="text-lg font-black text-slate-800">
                    {isReadOnly ? `Acta ${displayedActa.numero}` : 'Borrador (sin emitir)'}
                  </h3>
                  <p className="text-xs text-slate-400">
                    {displayedActa.items.length} línea(s) —{' '}
                    {currencyFormatter.format(
                      displayedActa.items.reduce((sum, i) => sum + (i.valor_total || 0), 0)
                    )}
                  </p>
                </div>
                {!isReadOnly && (
                  <button
                    onClick={handleIssue}
                    disabled={issueActa.isPending || displayedActa.items.length === 0}
                    className="flex items-center gap-2 px-4 py-2 bg-emerald-600 text-white rounded-xl font-bold hover:bg-emerald-700 transition-colors shadow-lg shadow-emerald-900/20 text-xs disabled:opacity-40"
                  >
                    {issueActa.isPending ? <Loader2 size={16} className="animate-spin" /> : <Send size={16} />}
                    Emitir Acta
                  </button>
                )}
              </div>

              <div className="overflow-x-auto border border-slate-200 rounded-2xl">
                <table className="w-full text-sm">
                  <thead className="bg-slate-50 text-slate-500 text-xs uppercase font-bold">
                    <tr>
                      <th className="px-4 py-3 text-left">Actividad</th>
                      <th className="px-4 py-3 text-center">Unidad</th>
                      <th className="px-4 py-3 text-right">Precio Unitario</th>
                      <th className="px-4 py-3 text-right">Cantidad Facturada</th>
                      <th className="px-4 py-3 text-right">Valor Total</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {displayedActa.items.map(item => (
                      <tr key={item.id} className="hover:bg-slate-50">
                        <td className="px-4 py-3 text-slate-700 font-medium">{item.descripcion_snapshot}</td>
                        <td className="px-4 py-3 text-center text-slate-500">{item.unidad_snapshot}</td>
                        <td className="px-4 py-3 text-right text-slate-500">
                          {currencyFormatter.format(item.precio_unitario_snapshot)}
                        </td>
                        <td className="px-4 py-3 text-right w-32">
                          {isReadOnly ? (
                            <span className="font-bold text-slate-800">
                              {item.cantidad_facturada.toLocaleString('es-CO', { maximumFractionDigits: 2 })}
                            </span>
                          ) : (
                            <MatrixQtyInput
                              defaultValue={item.cantidad_facturada}
                              onCommit={v => handleAdjust(item.id, v)}
                            />
                          )}
                        </td>
                        <td className="px-4 py-3 text-right font-bold text-slate-800">
                          {currencyFormatter.format(item.valor_total)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
