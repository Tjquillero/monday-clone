'use client';

import React, { useState } from 'react';
import {
  FileText,
  FileCheck,
  Loader2,
  Plus,
  Send,
  Download,
  ShieldCheck,
  AlertCircle,
  Clock,
  Layers,
  ChevronDown,
  ChevronUp,
  FileSpreadsheet,
  Camera,
} from 'lucide-react';
import {
  useCertifiedActaDraft,
  useCertifiedActasIssued,
  useCertifiedActaMutations,
  useCertifiedActaTotals,
  usePendingBillableWork,
} from '@/hooks/useCertifiedActas';
import { useBoardHasActivePoa } from '@/hooks/usePoaActivities';
import { GovernedActaIssuanceModal } from './GovernedActaIssuanceModal';
import { GovernedQuantityInput } from './GovernedQuantityInput';
import { CertifiedActaItem } from '@/types/monday';

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
  const { data: pendingWork, isLoading: pendingWorkLoading } = usePendingBillableWork(boardId);
  const { generateDraft, adjustQuantity, issueActa } = useCertifiedActaMutations(boardId);
  const { data: hasActivePoa, isLoading: poaCheckLoading } = useBoardHasActivePoa(boardId);

  const [selectedIssuedId, setSelectedIssuedId] = useState<string | null>(null);
  const [isIssuanceModalOpen, setIsIssuanceModalOpen] = useState(false);
  const [expandedSourcesItemId, setExpandedSourcesItemId] = useState<string | null>(null);
  const [exporting, setExporting] = useState(false);
  const [exportingExecutionReport, setExportingExecutionReport] = useState(false);

  const selectedIssued = issuedActas?.find((a) => a.id === selectedIssuedId) || null;
  const displayedActa = selectedIssued || draft;
  const isReadOnly = displayedActa?.estado === 'issued';
  const { data: totals } = useCertifiedActaTotals(displayedActa?.id);

  // PDF Export 1: Certified Acta Financial Extract
  const handleExportPdf = async () => {
    if (!displayedActa || !totals || displayedActa.estado !== 'issued') return;
    setExporting(true);
    try {
      const response = await fetch('/api/reports/certified-acta', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ acta: displayedActa, totals }),
      });
      if (!response.ok) throw new Error('No se pudo generar el extracto PDF');
      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `Acta_${displayedActa.numero}.pdf`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      window.URL.revokeObjectURL(url);
    } catch (error: any) {
      alert(`Error al exportar el extracto PDF: ${error.message}`);
    } finally {
      setExporting(false);
    }
  };

  // PDF Export 2: Activity Execution Report & Photographic Support
  const handleExportExecutionReport = async () => {
    if (!displayedActa) return;
    setExportingExecutionReport(true);
    try {
      const url = `/api/reports/activity-execution?acta_id=${displayedActa.id}`;
      window.open(url, '_blank', 'noopener,noreferrer');
    } catch (error: any) {
      alert(`Error al abrir el reporte de ejecución: ${error.message}`);
    } finally {
      setExportingExecutionReport(false);
    }
  };

  const handleConfirmIssuance = async () => {
    if (!draft) return;
    try {
      await issueActa.mutateAsync(draft.id);
      setIsIssuanceModalOpen(false);
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
    <div className="p-6 bg-white rounded-[2rem] shadow-sm min-h-[600px] space-y-6">
      {/* Surface Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between pb-6 border-b border-slate-100 gap-4">
        <div>
          <div className="flex items-center gap-2">
            <h2 className="text-2xl font-black text-slate-800 tracking-tight">Actas Certificadas</h2>
            <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-black uppercase tracking-wider bg-purple-50 text-purple-700 border border-purple-200">
              ADR-0012 Soberano
            </span>
          </div>
          <p className="text-slate-500 font-medium text-xs mt-1">
            Certificación contractual y emisión de documentos de cobro a partir de ejecuciones verificadas
          </p>
        </div>

        {/* Global Action when No Draft Open */}
        {!draft && !draftLoading && (
          <button
            onClick={() => generateDraft.mutate()}
            disabled={generateDraft.isPending || !hasActivePoa}
            className="flex items-center gap-2 px-5 py-2.5 bg-slate-900 text-white rounded-xl font-black text-xs hover:bg-slate-800 transition-all shadow-lg shadow-slate-900/20 disabled:opacity-40"
          >
            {generateDraft.isPending ? <Loader2 size={16} className="animate-spin" /> : <Plus size={16} />}
            Generar Borrador de Acta
          </button>
        )}
      </div>

      <div className="flex flex-col lg:flex-row gap-6">
        {/* Left Sidebar: Actas History (Draft & Issued) */}
        <div className="w-full lg:w-64 shrink-0 space-y-4">
          <h3 className="text-xs font-black text-slate-400 uppercase tracking-widest">
            Documentos Contractuales
          </h3>

          <div className="flex flex-col gap-2">
            {draft && (
              <button
                type="button"
                onClick={() => setSelectedIssuedId(null)}
                className={`text-left p-3.5 rounded-2xl border transition-all ${
                  !selectedIssuedId
                    ? 'border-emerald-400 bg-emerald-50/70 shadow-sm'
                    : 'border-slate-100 hover:bg-slate-50 bg-white'
                }`}
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2 text-xs font-black text-slate-800">
                    <FileText size={15} className="text-emerald-600" /> Borrador Actual
                  </div>
                  <span className="px-2 py-0.5 rounded-full text-[9px] font-bold bg-amber-100 text-amber-800">
                    DRAFT
                  </span>
                </div>
                <div className="text-[11px] text-slate-500 mt-1">
                  {draft.items.length} línea(s) en revisión
                </div>
              </button>
            )}

            {issuedLoading ? (
              <div className="text-slate-400 text-xs py-4 text-center">Cargando actas...</div>
            ) : issuedActas?.length === 0 && !draft ? (
              <div className="text-slate-400 text-xs py-3 text-center border border-dashed border-slate-200 rounded-xl">
                Sin actas registradas todavía.
              </div>
            ) : (
              issuedActas?.map((acta) => (
                <button
                  key={acta.id}
                  type="button"
                  onClick={() => setSelectedIssuedId(acta.id)}
                  className={`text-left p-3.5 rounded-2xl border transition-all ${
                    selectedIssuedId === acta.id
                      ? 'border-blue-400 bg-blue-50/70 shadow-sm'
                      : 'border-slate-100 hover:bg-slate-50 bg-white'
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2 text-xs font-black text-slate-800">
                      <FileCheck size={15} className="text-blue-600" /> Acta N.º {acta.numero}
                    </div>
                    <span className="px-2 py-0.5 rounded-full text-[9px] font-bold bg-blue-100 text-blue-800">
                      ISSUED
                    </span>
                  </div>
                  <div className="text-[11px] text-slate-400 mt-1 flex items-center gap-1">
                    <Clock size={11} />
                    {acta.issued_at ? new Date(acta.issued_at).toLocaleDateString('es-CO') : ''}
                  </div>
                </button>
              ))
            )}
          </div>
        </div>

        {/* Right Main Content Area */}
        <div className="flex-1 min-w-0">
          {draftLoading || poaCheckLoading ? (
            <div className="py-16 text-center text-slate-400 flex flex-col items-center justify-center gap-3">
              <Loader2 className="w-8 h-8 animate-spin text-slate-400" />
              <p className="text-sm">Cargando contexto contractual...</p>
            </div>
          ) : !displayedActa ? (
            /* GAP-01: Pre-Draft Eligibility View */
            <div className="space-y-6">
              <div className="p-8 bg-slate-50/80 border border-slate-200/80 rounded-3xl space-y-6">
                <div className="flex items-start justify-between">
                  <div>
                    <span className="text-[10px] font-black uppercase tracking-wider text-purple-700 bg-purple-100/80 px-2.5 py-1 rounded-full">
                      Elegibilidad Contractual Previa (GAP-01)
                    </span>
                    <h3 className="text-xl font-black text-slate-800 mt-2">
                      Trabajo Verificado Pendiente de Facturación
                    </h3>
                    <p className="text-xs text-slate-500 mt-1 max-w-xl">
                      El siguiente balance refleja las ejecuciones físicas verificadas en períodos cerrados que aún no han sido cobradas en un Acta formal.
                    </p>
                  </div>
                </div>

                {/* Eligibility Metric Cards */}
                {pendingWorkLoading ? (
                  <div className="py-6 text-center text-slate-400 text-xs">Evaluando ejecuciones elegibles...</div>
                ) : (
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                    <div className="p-4 bg-white rounded-2xl border border-slate-200/70 shadow-sm">
                      <p className="text-[11px] font-bold uppercase tracking-wider text-slate-400">Actividades con Saldo</p>
                      <p className="text-2xl font-black text-slate-800 mt-1">
                        {pendingWork?.activities ?? 0}
                      </p>
                      <p className="text-[10px] text-slate-400 mt-0.5">Conceptos POA listos para cobro</p>
                    </div>

                    <div className="p-4 bg-white rounded-2xl border border-slate-200/70 shadow-sm">
                      <p className="text-[11px] font-bold uppercase tracking-wider text-slate-400">Ejecuciones Verificadas</p>
                      <p className="text-2xl font-black text-slate-800 mt-1">
                        {pendingWork?.executions ?? 0}
                      </p>
                      <p className="text-[10px] text-slate-400 mt-0.5">Registros físicos con soporte</p>
                    </div>

                    <div className="p-4 bg-white rounded-2xl border border-slate-200/70 shadow-sm">
                      <p className="text-[11px] font-bold uppercase tracking-wider text-slate-400">Valor Estimado Disponible</p>
                      <p className="text-2xl font-black text-emerald-600 mt-1">
                        {currencyFormatter.format(pendingWork?.estimated_value ?? 0)}
                      </p>
                      <p className="text-[10px] text-slate-400 mt-0.5">Cálculo de referencia sin AIU</p>
                    </div>
                  </div>
                )}

                {/* Informational Guidance */}
                <div className="p-4 bg-blue-50/70 border border-blue-200/60 rounded-2xl flex items-start gap-3">
                  <ShieldCheck className="w-5 h-5 text-blue-600 shrink-0 mt-0.5" />
                  <div className="text-xs text-blue-900 space-y-1">
                    <p className="font-bold">Garantía de Inmutabilidad Física</p>
                    <p className="text-blue-800 leading-relaxed text-[11px]">
                      Al generar el borrador, el sistema consolidará el 100% de los saldos facturables en una propuesta editable. <strong>El historial físico de ejecuciones jamás se altera ni se borra.</strong>
                    </p>
                  </div>
                </div>

                {hasActivePoa ? (
                  <div className="pt-2 flex justify-end">
                    <button
                      onClick={() => generateDraft.mutate()}
                      disabled={generateDraft.isPending || (pendingWork?.executions === 0)}
                      className="flex items-center gap-2 px-6 py-3 bg-slate-900 text-white rounded-xl font-black text-xs hover:bg-slate-800 transition-all shadow-lg shadow-slate-900/20 disabled:opacity-40"
                    >
                      {generateDraft.isPending ? <Loader2 size={16} className="animate-spin" /> : <Plus size={16} />}
                      Generar Borrador de Acta con Saldo Disponible
                    </button>
                  </div>
                ) : (
                  <div className="p-4 bg-amber-50 border border-amber-200 rounded-2xl text-xs text-amber-800">
                    Este tablero no cuenta con un POA activo cargado. Debe importar un POA antes de generar actas.
                  </div>
                )}
              </div>
            </div>
          ) : (
            /* GAP-02, GAP-03, GAP-04, GAP-05: Active Document View (Draft or Issued) */
            <div className="space-y-6">
              {/* Document Header & State Banner */}
              <div className="flex flex-col sm:flex-row sm:items-center justify-between pb-4 border-b border-slate-100 gap-4">
                <div>
                  <div className="flex items-center gap-3">
                    <h3 className="text-xl font-black text-slate-800">
                      {isReadOnly ? `Acta Contractual N.º ${displayedActa.numero}` : 'Borrador de Acta (Sin Emitir)'}
                    </h3>
                    <span
                      className={`px-3 py-1 rounded-full text-xs font-black uppercase tracking-wider ${
                        isReadOnly
                          ? 'bg-blue-100 text-blue-800 border border-blue-200'
                          : 'bg-emerald-100 text-emerald-800 border border-emerald-200'
                      }`}
                    >
                      {isReadOnly ? 'Documento Emitido / Inmutable' : 'Borrador Mutable'}
                    </span>
                  </div>
                  <p className="text-xs text-slate-400 mt-1">
                    {displayedActa.items.length} línea(s) contractual(es) —{' '}
                    {currencyFormatter.format(
                      displayedActa.items.reduce((sum, i) => sum + (i.valor_total || 0), 0)
                    )} (Costos Directos)
                  </p>
                </div>

                {/* Actions Toolbar */}
                <div className="flex items-center gap-2">
                  {isReadOnly ? (
                    <>
                      <button
                        onClick={handleExportPdf}
                        disabled={exporting || !totals}
                        className="flex items-center gap-2 px-4 py-2 bg-slate-900 text-white rounded-xl font-bold hover:bg-slate-800 transition-colors shadow-sm text-xs disabled:opacity-40"
                        title="Descargar Extracto Financiero Oficial"
                      >
                        {exporting ? <Loader2 size={15} className="animate-spin" /> : <Download size={15} />}
                        Extracto PDF
                      </button>

                      <button
                        onClick={handleExportExecutionReport}
                        disabled={exportingExecutionReport}
                        className="flex items-center gap-2 px-4 py-2 bg-purple-700 text-white rounded-xl font-bold hover:bg-purple-800 transition-colors shadow-sm text-xs disabled:opacity-40"
                        title="Ver Informe de Ejecución y Soporte Fotográfico (Evidence Layer)"
                      >
                        {exportingExecutionReport ? (
                          <Loader2 size={15} className="animate-spin" />
                        ) : (
                          <Camera size={15} />
                        )}
                        Informe de Soporte
                      </button>
                    </>
                  ) : (
                    <button
                      onClick={() => setIsIssuanceModalOpen(true)}
                      disabled={issueActa.isPending || displayedActa.items.length === 0}
                      className="flex items-center gap-2 px-5 py-2.5 bg-emerald-600 text-white rounded-xl font-black hover:bg-emerald-700 transition-all shadow-lg shadow-emerald-900/20 text-xs disabled:opacity-40"
                    >
                      {issueActa.isPending ? <Loader2 size={16} className="animate-spin" /> : <Send size={16} />}
                      Revisar y Emitir Acta
                    </button>
                  )}
                </div>
              </div>

              {/* Informational Magnitude Separation Notice (Draft only) */}
              {!isReadOnly && (
                <div className="p-3 bg-slate-50 border border-slate-200 rounded-2xl text-[11px] text-slate-600 flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className="font-bold text-slate-800">Regla de Separación Contractual:</span>
                    <span>
                      La cantidad facturada puede ser reducida para cierre contable, pero jamás aumentada por encima del saldo disponible original.
                    </span>
                  </div>
                  <span className="text-[10px] font-bold text-slate-400 shrink-0">LIFO Automático</span>
                </div>
              )}

              {/* GAP-02: Contractual Items Table */}
              <div className="overflow-x-auto border border-slate-200 rounded-2xl shadow-sm">
                <table className="w-full text-sm">
                  <thead className="bg-slate-50 text-slate-500 text-[11px] uppercase font-bold tracking-wider">
                    <tr>
                      <th className="px-4 py-3.5 text-left">Actividad / Concepto</th>
                      <th className="px-3 py-3.5 text-center">Unidad</th>
                      <th className="px-4 py-3.5 text-right">Precio Unitario (Snapshot)</th>
                      <th className="px-4 py-3.5 text-right w-44">Cantidad Facturada</th>
                      <th className="px-4 py-3.5 text-right">Valor Total</th>
                      <th className="px-3 py-3.5 text-center w-24">Trazabilidad</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {displayedActa.items.map((item: CertifiedActaItem) => {
                      const isExpanded = expandedSourcesItemId === item.id;
                      const sourcesCount = item.sources?.length ?? 0;

                      return (
                        <React.Fragment key={item.id}>
                          <tr className="hover:bg-slate-50/70 transition-colors">
                            <td className="px-4 py-3.5 text-slate-800">
                              <p className="font-bold">{item.descripcion_snapshot}</p>
                              {(item.zone_snapshot || item.activity_key_snapshot) && (
                                <p className="text-[11px] text-slate-400 font-medium mt-0.5">
                                  {item.zone_snapshot ? `Zona: ${item.zone_snapshot}` : ''}
                                  {item.activity_key_snapshot ? ` · Código: ${item.activity_key_snapshot}` : ''}
                                </p>
                              )}
                            </td>
                            <td className="px-3 py-3.5 text-center text-slate-600 font-semibold text-xs">
                              {item.unidad_snapshot}
                            </td>
                            <td className="px-4 py-3.5 text-right text-slate-600 font-medium">
                              {currencyFormatter.format(item.precio_unitario_snapshot)}
                            </td>
                            <td className="px-4 py-3.5 text-right">
                              <GovernedQuantityInput
                                value={item.cantidad_facturada}
                                maxAllowed={item.cantidad_facturada}
                                unit={item.unidad_snapshot}
                                isReadOnly={isReadOnly}
                                onCommit={(newQty) => handleAdjust(item.id, newQty)}
                              />
                            </td>
                            <td className="px-4 py-3.5 text-right font-black text-slate-800">
                              {currencyFormatter.format(item.valor_total)}
                            </td>
                            <td className="px-3 py-3.5 text-center">
                              {sourcesCount > 0 ? (
                                <button
                                  type="button"
                                  onClick={() =>
                                    setExpandedSourcesItemId(isExpanded ? null : item.id)
                                  }
                                  className="inline-flex items-center gap-1 px-2 py-1 rounded-lg text-[10px] font-bold bg-slate-100 hover:bg-slate-200 text-slate-700 transition-colors"
                                  title="Ver ejecuciones físicas de origen"
                                >
                                  <Layers size={12} />
                                  <span>{sourcesCount}</span>
                                  {isExpanded ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
                                </button>
                              ) : (
                                <span className="text-[10px] text-slate-300 font-medium">—</span>
                              )}
                            </td>
                          </tr>

                          {/* GAP-03: Expandable Sources Traceability Row */}
                          {isExpanded && item.sources && (
                            <tr className="bg-slate-50/90 border-t border-b border-slate-200/80">
                              <td colSpan={6} className="px-6 py-4">
                                <div className="space-y-2">
                                  <div className="flex items-center justify-between">
                                    <span className="text-[11px] font-bold uppercase tracking-wider text-slate-500">
                                      Fuentes Físicas de Ejecución (acta_item_sources)
                                    </span>
                                    <span className="text-[10px] text-slate-400">
                                      {item.sources.length} ejecución(es) vinculada(s)
                                    </span>
                                  </div>
                                  <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-2">
                                    {item.sources.map((src, idx) => (
                                      <div
                                        key={src.id || idx}
                                        className="p-2.5 bg-white border border-slate-200 rounded-xl text-xs space-y-1 shadow-xs"
                                      >
                                        <div className="flex items-center justify-between text-slate-500 text-[10px]">
                                          <span className="font-mono truncate max-w-[120px]">
                                            Exec: {src.execution_id.slice(0, 8)}...
                                          </span>
                                          <span className="font-bold text-emerald-700 bg-emerald-50 px-1.5 py-0.2 rounded">
                                            {src.cantidad_consumida.toLocaleString('es-CO', { maximumFractionDigits: 2 })} {item.unidad_snapshot}
                                          </span>
                                        </div>
                                      </div>
                                    ))}
                                  </div>
                                </div>
                              </td>
                            </tr>
                          )}
                        </React.Fragment>
                      );
                    })}
                  </tbody>
                </table>
              </div>

              {/* Official AIU Totals Card */}
              {totals && (
                <div className="flex justify-end pt-2">
                  <div className="w-full sm:w-80 border border-slate-200 rounded-2xl overflow-hidden text-xs shadow-sm bg-white">
                    <div className="px-4 py-2.5 bg-slate-50 font-bold uppercase tracking-wider text-slate-500 border-b border-slate-200">
                      Liquidación Financiera Oficial (AIU)
                    </div>
                    <div className="flex justify-between px-4 py-2 text-slate-600">
                      <span>Subtotal (Costos Directos)</span>
                      <span className="font-bold text-slate-800">{currencyFormatter.format(totals.subtotal)}</span>
                    </div>
                    <div className="flex justify-between px-4 py-2 text-slate-600 bg-slate-50/50">
                      <span>Administración (20%)</span>
                      <span className="font-medium text-slate-700">{currencyFormatter.format(totals.administracion)}</span>
                    </div>
                    <div className="flex justify-between px-4 py-2 text-slate-600">
                      <span>Imprevistos (5%)</span>
                      <span className="font-medium text-slate-700">{currencyFormatter.format(totals.imprevistos)}</span>
                    </div>
                    <div className="flex justify-between px-4 py-2 text-slate-600 bg-slate-50/50">
                      <span>Utilidad (5%)</span>
                      <span className="font-medium text-slate-700">{currencyFormatter.format(totals.utilidad)}</span>
                    </div>
                    <div className="flex justify-between px-4 py-3 bg-slate-900 text-white font-black text-sm">
                      <span>Total Liquidado</span>
                      <span className="text-emerald-400">{currencyFormatter.format(totals.total_pagar)}</span>
                    </div>
                  </div>
                </div>
              )}

              {/* Governed Pre-Issuance Modal (GAP-04) */}
              {draft && (
                <GovernedActaIssuanceModal
                  isOpen={isIssuanceModalOpen}
                  acta={draft}
                  totals={totals}
                  isPending={issueActa.isPending}
                  onConfirm={handleConfirmIssuance}
                  onClose={() => setIsIssuanceModalOpen(false)}
                />
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
