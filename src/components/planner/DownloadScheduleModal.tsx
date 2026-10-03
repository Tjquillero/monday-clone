'use client';

import React, { useState } from 'react';
import { FileDown, Loader2, AlertCircle, Calendar, MapPin, Layers } from 'lucide-react';
import ModalShell from '../ui/ModalShell';

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

  const footer = (
    <div className="flex flex-col-reverse sm:flex-row sm:items-center sm:justify-end gap-2.5">
      <button
        type="button"
        onClick={onClose}
        disabled={isGenerating}
        className="w-full sm:w-auto min-h-[40px] px-4 py-2 text-xs font-bold uppercase tracking-wider rounded-[var(--radius-control)] border border-[var(--border-color)] bg-[var(--bg-secondary)] text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-primary)] transition-colors disabled:opacity-40"
      >
        Cancelar
      </button>
      <button
        type="button"
        onClick={handleDownload}
        disabled={isGenerating || !month}
        className="w-full sm:w-auto min-h-[40px] flex items-center justify-center gap-2 px-5 py-2 text-xs font-bold uppercase tracking-wider rounded-[var(--radius-control)] bg-[var(--color-primary)] text-white hover:bg-[var(--color-primary-hover)] transition-colors disabled:opacity-40 disabled:cursor-not-allowed shadow-xs"
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
  );

  return (
    <ModalShell
      open={isOpen}
      onClose={onClose}
      title="Descargar Cronograma (PDF)"
      icon={
        <div className="p-1.5 rounded-[var(--radius-control)] bg-[var(--color-primary-subtle)] text-[var(--color-primary)]">
          <FileDown className="w-4 h-4" />
        </div>
      }
      size="md"
      footer={footer}
      closeDisabled={isGenerating}
    >
      <div className="space-y-4">
        {errorMessage && (
          <div className="p-3 rounded-[var(--radius-control)] bg-red-500/10 border border-red-500/30 flex items-start gap-2.5 text-xs text-red-600 dark:text-red-400">
            <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
            <span>{errorMessage}</span>
          </div>
        )}

        {/* Selector de Mes */}
        <div className="flex flex-col gap-1.5">
          <label className="text-xs font-bold uppercase tracking-wider text-[var(--text-secondary)] flex items-center gap-1.5">
            <Calendar className="w-3.5 h-3.5 text-[var(--color-accent)]" />
            Mes a reportar
          </label>
          <input
            type="month"
            value={month}
            onChange={(e) => setMonth(e.target.value)}
            disabled={isGenerating}
            className="w-full px-3 py-2 text-xs rounded-[var(--radius-control)] border border-[var(--border-color)] bg-[var(--bg-primary)] text-[var(--text-primary)] focus:outline-hidden focus:border-[var(--color-primary)]"
          />
        </div>

        {/* Selector de Sitio */}
        <div className="flex flex-col gap-1.5">
          <label className="text-xs font-bold uppercase tracking-wider text-[var(--text-secondary)] flex items-center gap-1.5">
            <MapPin className="w-3.5 h-3.5 text-[var(--color-accent)]" />
            Alcance del sitio
          </label>
          <select
            value={selectedSiteId}
            onChange={(e) => setSelectedSiteId(e.target.value)}
            disabled={isGenerating}
            className="w-full px-3 py-2 text-xs rounded-[var(--radius-control)] border border-[var(--border-color)] bg-[var(--bg-primary)] text-[var(--text-primary)] focus:outline-hidden focus:border-[var(--color-primary)]"
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
        <div className="flex flex-col gap-1.5">
          <label className="text-xs font-bold uppercase tracking-wider text-[var(--text-secondary)] flex items-center gap-1.5">
            <Layers className="w-3.5 h-3.5 text-[var(--color-accent)]" />
            Versión del reporte
          </label>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
            <button
              type="button"
              onClick={() => setVersion('external')}
              disabled={isGenerating}
              className={`p-3.5 rounded-[var(--radius-control)] border text-left transition-all ${
                version === 'external'
                  ? 'border-[var(--color-primary)] bg-[var(--color-primary-subtle)]/50 ring-1 ring-[var(--color-primary)]'
                  : 'border-[var(--border-color)] bg-[var(--bg-primary)] hover:border-[var(--color-primary)]'
              }`}
            >
              <p className="text-xs font-bold text-[var(--text-primary)]">
                Externa (Interventoría)
              </p>
              <p className="text-xs text-[var(--text-muted)] mt-1 leading-relaxed">
                Marcas de ejecución limpias, sin cantidades ni desglose de jornales
              </p>
            </button>

            <button
              type="button"
              onClick={() => setVersion('full')}
              disabled={isGenerating}
              className={`p-3.5 rounded-[var(--radius-control)] border text-left transition-all ${
                version === 'full'
                  ? 'border-[var(--color-accent)] bg-[var(--color-accent-subtle)]/50 ring-1 ring-[var(--color-accent)]'
                  : 'border-[var(--border-color)] bg-[var(--bg-primary)] hover:border-[var(--color-accent)]'
              }`}
            >
              <p className="text-xs font-bold text-[var(--text-primary)]">
                Completa (Interna)
              </p>
              <p className="text-xs text-[var(--text-muted)] mt-1 leading-relaxed">
                Cantidades, jornales, balance de capacidad y métricas operativas
              </p>
            </button>
          </div>
        </div>
      </div>
    </ModalShell>
  );
}
