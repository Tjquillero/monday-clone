'use client';

import React, { useState } from 'react';
import { RotateCcw, AlertTriangle } from 'lucide-react';
import ModalShell from '../ui/ModalShell';

interface Props {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: (reason: string) => Promise<void>;
  itemCount: number;
}

export default function ResetWeeklyPlanModal({
  isOpen,
  onClose,
  onConfirm,
  itemCount,
}: Props) {
  const [reason, setReason] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const isReasonValid = reason.trim().length >= 10;

  const handleClose = () => {
    if (isSubmitting) return;
    setReason('');
    setErrorMessage(null);
    onClose();
  };

  const handleConfirm = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!isReasonValid || isSubmitting) return;

    setIsSubmitting(true);
    setErrorMessage(null);

    try {
      await onConfirm(reason.trim());
      setReason('');
      onClose();
    } catch (err: any) {
      setErrorMessage(err?.message || 'Error al reprogramar el plan semanal.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const footer = (
    <div className="flex flex-col-reverse sm:flex-row sm:items-center sm:justify-end gap-2.5">
      <button
        type="button"
        onClick={handleClose}
        disabled={isSubmitting}
        className="w-full sm:w-auto min-h-[40px] px-4 py-2 text-xs font-bold uppercase tracking-wider rounded-[var(--radius-control)] border border-[var(--border-color)] bg-[var(--card-bg)] text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-primary)] transition-colors disabled:opacity-40"
      >
        Cancelar
      </button>
      <button
        type="button"
        onClick={handleConfirm}
        disabled={!isReasonValid || isSubmitting}
        className="w-full sm:w-auto min-h-[40px] flex items-center justify-center gap-2 px-5 py-2 text-xs font-bold uppercase tracking-wider rounded-[var(--radius-control)] bg-amber-600 hover:bg-amber-500 text-white transition-colors disabled:opacity-40 disabled:cursor-not-allowed shadow-xs"
      >
        <RotateCcw className={`w-3.5 h-3.5 ${isSubmitting ? 'animate-spin' : ''}`} />
        {isSubmitting ? 'Reprogramando…' : 'Reprogramar semana'}
      </button>
    </div>
  );

  return (
    <ModalShell
      open={isOpen}
      onClose={handleClose}
      title="Reprogramar semana"
      icon={
        <div className="p-1.5 rounded-[var(--radius-control)] bg-amber-500/10 text-amber-500 dark:text-amber-400">
          <RotateCcw className="w-4 h-4" />
        </div>
      }
      size="sm"
      footer={footer}
      closeDisabled={isSubmitting}
    >
      <form onSubmit={handleConfirm} className="flex flex-col gap-4">
        {/* Aviso de impacto */}
        <div className="p-3.5 rounded-[var(--radius-control)] border border-amber-500/30 bg-amber-500/10 flex items-start gap-3">
          <AlertTriangle className="w-5 h-5 text-amber-600 dark:text-amber-400 shrink-0 mt-0.5" />
          <p className="text-xs font-medium text-[var(--text-primary)] leading-relaxed">
            Se borrarán las <span className="font-bold text-[var(--text-primary)]">{itemCount}</span> actividades de esta semana y se volverán a programar con la configuración actual. Las demás semanas no cambian.
          </p>
        </div>

        {/* Campo de motivo obligatorio */}
        <div className="flex flex-col gap-1.5">
          <label
            htmlFor="reset-reason"
            className="text-xs font-bold uppercase tracking-wider text-[var(--text-secondary)]"
          >
            Motivo de la reprogramación <span className="text-red-500">*</span>
          </label>
          <textarea
            id="reset-reason"
            rows={3}
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            disabled={isSubmitting}
            placeholder="Describe el motivo de la reprogramación (mínimo 10 caracteres)..."
            className="w-full text-xs p-3 rounded-[var(--radius-control)] border border-[var(--border-color)] bg-[var(--bg-primary)] text-[var(--text-primary)] placeholder-[var(--text-muted)] focus:outline-hidden focus:border-[var(--color-primary)] resize-none"
          />
          <div className="flex items-center justify-between text-xs text-[var(--text-muted)]">
            <span>Mínimo 10 caracteres requeridos</span>
            <span className={reason.trim().length >= 10 ? 'text-green-600 dark:text-green-400 font-bold' : 'text-amber-600 dark:text-amber-400 font-bold'}>
              {reason.trim().length} / 10
            </span>
          </div>
        </div>

        {/* Mensaje de error si falla */}
        {errorMessage && (
          <div className="p-3 rounded-[var(--radius-control)] border border-red-500/30 bg-red-500/10 text-xs text-red-600 dark:text-red-400">
            {errorMessage}
          </div>
        )}
      </form>
    </ModalShell>
  );
}
