'use client';

import { useState } from 'react';
import { Dialog, DialogPanel, DialogTitle, Transition, TransitionChild } from '@headlessui/react';
import { Fragment } from 'react';
import { FileDown, Loader2, X, AlertCircle, Calendar, MapPin, Layers } from 'lucide-react';

interface DownloadScheduleModalProps {
  isOpen: boolean;
  onClose: () => void;
  boardId?: string;
  currentGroupId?: string;
  currentGroupTitle?: string;
  defaultMonth?: string; // 'YYYY-MM'
  availableGroups?: Array<{ id: string; title: string }>;
}

export default function DownloadScheduleModal({
  isOpen,
  onClose,
  boardId,
  currentGroupId,
  currentGroupTitle,
  defaultMonth,
  availableGroups = [],
}: DownloadScheduleModalProps) {
  const initialMonth = defaultMonth || (() => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
  })();

  const [month, setMonth] = useState<string>(initialMonth);
  const [selectedSiteId, setSelectedSiteId] = useState<string>(currentGroupId || 'ALL');
  const [version, setVersion] = useState<'external' | 'full'>('external');
  const [isGenerating, setIsGenerating] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const handleDownload = async () => {
    if (!boardId) {
      setErrorMessage('Identificador de tablero no disponible');
      return;
    }

    setIsGenerating(true);
    setErrorMessage(null);

    try {
      const response = await fetch('/api/reports/schedule-month', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          boardId,
          month,
          groupId: selectedSiteId,
          version,
        }),
      });

      if (!response.ok) {
        const errJson = await response.json().catch(() => ({}));
        throw new Error(errJson.error || errJson.details || `Error ${response.status} al generar el PDF`);
      }

      const blob = await response.blob();
      const disposition = response.headers.get('Content-Disposition');
      let filename = `Cronograma_${month}_${selectedSiteId === 'ALL' ? 'Todos_los_sitios' : 'Sitio'}_${version}.pdf`;

      if (disposition && disposition.includes('filename=')) {
        const match = disposition.match(/filename="?([^";]+)"?/);
        if (match && match[1]) {
          filename = match[1];
        }
      }

      const blobUrl = window.URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = blobUrl;
      link.download = filename;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      window.URL.revokeObjectURL(blobUrl);

      onClose();
    } catch (err: any) {
      console.error('Error al descargar cronograma PDF:', err);
      setErrorMessage(err.message || 'Error inesperado al generar el reporte');
    } finally {
      setIsGenerating(false);
    }
  };

  return (
    <Transition appear show={isOpen} as={Fragment}>
      <Dialog as="div" className="relative z-50" onClose={() => !isGenerating && onClose()}>
        <TransitionChild
          as={Fragment}
          enter="ease-out duration-300"
          enterFrom="opacity-0"
          enterTo="opacity-100"
          leave="ease-in duration-200"
          leaveFrom="opacity-100"
          leaveTo="opacity-0"
        >
          <div className="fixed inset-0 bg-slate-950/70 backdrop-blur-xs" />
        </TransitionChild>

        <div className="fixed inset-0 overflow-y-auto">
          <div className="flex min-h-full items-center justify-center p-4 text-center">
            <TransitionChild
              as={Fragment}
              enter="ease-out duration-300"
              enterFrom="opacity-0 scale-95"
              enterTo="opacity-100 scale-100"
              leave="ease-in duration-200"
              leaveFrom="opacity-100 scale-100"
              leaveTo="opacity-0 scale-95"
            >
              <DialogPanel className="w-full max-w-md transform overflow-hidden rounded-2xl bg-[var(--surface-primary,#ffffff)] dark:bg-slate-900 border border-[var(--border-color,#e2e8f0)] dark:border-slate-800 p-6 text-left align-middle shadow-2xl transition-all">
                <div className="flex items-center justify-between pb-4 border-b border-[var(--border-color,#e2e8f0)] dark:border-slate-800">
                  <div className="flex items-center gap-2.5">
                    <div className="p-2 rounded-lg bg-[var(--color-primary,#0B2A4A)] text-white">
                      <FileDown className="w-5 h-5" />
                    </div>
                    <div>
                      <DialogTitle as="h3" className="text-sm font-brand font-bold uppercase tracking-wider text-[var(--text-primary,#0f172a)] dark:text-white">
                        Descargar Cronograma (PDF)
                      </DialogTitle>
                      <p className="text-xs text-[var(--text-muted,#64748b)]">
                        Generación de informe mensual de operaciones
                      </p>
                    </div>
                  </div>
                  <button
                    onClick={onClose}
                    disabled={isGenerating}
                    className="p-1 rounded-lg text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors disabled:opacity-40"
                  >
                    <X className="w-5 h-5" />
                  </button>
                </div>

                {errorMessage && (
                  <div className="mt-4 p-3 rounded-lg bg-red-500/10 border border-red-500/30 flex items-start gap-2.5 text-xs text-red-600 dark:text-red-400">
                    <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
                    <span>{errorMessage}</span>
                  </div>
                )}

                <div className="mt-5 space-y-4">
                  {/* Selector de Mes */}
                  <div>
                    <label className="block text-[11px] font-bold uppercase tracking-wider text-[var(--text-secondary,#475569)] dark:text-slate-300 mb-1.5 flex items-center gap-1.5">
                      <Calendar className="w-3.5 h-3.5 text-[var(--color-primary,#0B2A4A)] dark:text-[var(--color-accent,#E8792F)]" />
                      Mes a reportar
                    </label>
                    <input
                      type="month"
                      value={month}
                      onChange={(e) => setMonth(e.target.value)}
                      disabled={isGenerating}
                      className="w-full px-3 py-2 text-xs rounded-lg border border-[var(--border-color,#cbd5e1)] dark:border-slate-700 bg-white dark:bg-slate-800 text-[var(--text-primary,#0f172a)] dark:text-white focus:outline-hidden focus:ring-2 focus:ring-[var(--color-primary,#0B2A4A)]"
                    />
                  </div>

                  {/* Selector de Sitio */}
                  <div>
                    <label className="block text-[11px] font-bold uppercase tracking-wider text-[var(--text-secondary,#475569)] dark:text-slate-300 mb-1.5 flex items-center gap-1.5">
                      <MapPin className="w-3.5 h-3.5 text-[var(--color-primary,#0B2A4A)] dark:text-[var(--color-accent,#E8792F)]" />
                      Alcance del sitio
                    </label>
                    <select
                      value={selectedSiteId}
                      onChange={(e) => setSelectedSiteId(e.target.value)}
                      disabled={isGenerating}
                      className="w-full px-3 py-2 text-xs rounded-lg border border-[var(--border-color,#cbd5e1)] dark:border-slate-700 bg-white dark:bg-slate-800 text-[var(--text-primary,#0f172a)] dark:text-white focus:outline-hidden focus:ring-2 focus:ring-[var(--color-primary,#0B2A4A)]"
                    >
                      <option value="ALL">Todos los sitios operativos (Reporte consolidado)</option>
                      {currentGroupId && (
                        <option value={currentGroupId}>
                          Sitio actual ({currentGroupTitle || 'Seleccionado'})
                        </option>
                      )}
                      {availableGroups
                        .filter((g) => g.id !== currentGroupId)
                        .map((g) => (
                          <option key={g.id} value={g.id}>
                            {g.title}
                          </option>
                        ))}
                    </select>
                  </div>

                  {/* Selector de Versión */}
                  <div>
                    <label className="block text-[11px] font-bold uppercase tracking-wider text-[var(--text-secondary,#475569)] dark:text-slate-300 mb-2 flex items-center gap-1.5">
                      <Layers className="w-3.5 h-3.5 text-[var(--color-primary,#0B2A4A)] dark:text-[var(--color-accent,#E8792F)]" />
                      Versión del reporte
                    </label>
                    <div className="grid grid-cols-2 gap-3">
                      <button
                        type="button"
                        onClick={() => setVersion('external')}
                        disabled={isGenerating}
                        className={`p-3 rounded-xl border text-left transition-all ${
                          version === 'external'
                            ? 'border-[var(--color-primary,#0B2A4A)] bg-blue-500/10 dark:bg-blue-500/20 ring-1 ring-[var(--color-primary,#0B2A4A)]'
                            : 'border-slate-200 dark:border-slate-800 hover:border-slate-300 dark:hover:border-slate-700'
                        }`}
                      >
                        <p className="text-xs font-bold text-[var(--text-primary,#0f172a)] dark:text-white">
                          Externa (Interventoría)
                        </p>
                        <p className="text-[10px] text-[var(--text-muted,#64748b)] mt-0.5 leading-snug">
                          Marcas de ejecución limpias, sin cantidades ni desglose de jornales
                        </p>
                      </button>

                      <button
                        type="button"
                        onClick={() => setVersion('full')}
                        disabled={isGenerating}
                        className={`p-3 rounded-xl border text-left transition-all ${
                          version === 'full'
                            ? 'border-[#8a3b12] bg-amber-500/10 dark:bg-amber-500/20 ring-1 ring-[#8a3b12]'
                            : 'border-slate-200 dark:border-slate-800 hover:border-slate-300 dark:hover:border-slate-700'
                        }`}
                      >
                        <p className="text-xs font-bold text-[var(--text-primary,#0f172a)] dark:text-white">
                          Completa (Interna)
                        </p>
                        <p className="text-[10px] text-[var(--text-muted,#64748b)] mt-0.5 leading-snug">
                          Cantidades, jornales, balance de capacidad y métricas operativas
                        </p>
                      </button>
                    </div>
                  </div>
                </div>

                <div className="mt-6 pt-4 border-t border-[var(--border-color,#e2e8f0)] dark:border-slate-800 flex items-center justify-end gap-3">
                  <button
                    type="button"
                    onClick={onClose}
                    disabled={isGenerating}
                    className="px-3.5 py-2 text-xs font-bold uppercase tracking-wider text-[var(--text-secondary,#64748b)] hover:text-[var(--text-primary,#0f172a)] dark:hover:text-white transition-colors disabled:opacity-40"
                  >
                    Cancelar
                  </button>
                  <button
                    type="button"
                    onClick={handleDownload}
                    disabled={isGenerating || !month}
                    className="flex items-center gap-2 px-4 py-2 text-xs font-bold uppercase tracking-wider rounded-xl bg-[var(--color-primary,#0B2A4A)] text-white hover:bg-[var(--color-primary-hover,#123A63)] shadow-md hover:shadow-lg transition-all disabled:opacity-40 disabled:cursor-not-allowed"
                  >
                    {isGenerating ? (
                      <>
                        <Loader2 className="w-4 h-4 animate-spin" />
                        Generando PDF…
                      </>
                    ) : (
                      <>
                        <FileDown className="w-4 h-4" />
                        Descargar PDF
                      </>
                    )}
                  </button>
                </div>
              </DialogPanel>
            </TransitionChild>
          </div>
        </div>
      </Dialog>
    </Transition>
  );
}
