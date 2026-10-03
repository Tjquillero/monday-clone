'use client';

import { useState } from 'react';
import { RotateCcw, AlertTriangle, X } from 'lucide-react';

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

  if (!isOpen) return null;

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

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs animate-in fade-in duration-150">
      <div className="relative w-full max-w-md rounded-xl border border-[var(--border-color)] bg-[var(--surface-primary)] p-5 shadow-2xl">
        {/* Encabezado */}
        <div className="flex items-center justify-between pb-3 border-b border-[var(--border-color)]">
          <div className="flex items-center gap-2">
            <div className="p-1.5 rounded-md bg-amber-500/10 text-amber-400">
              <RotateCcw className="w-4 h-4" />
            </div>
            <h3 className="text-xs font-brand font-bold uppercase tracking-wider text-[var(--text-primary)]">
              Reprogramar semana
            </h3>
          </div>
          <button
            onClick={handleClose}
            disabled={isSubmitting}
            className="text-[var(--text-muted)] hover:text-[var(--text-primary)] transition-colors disabled:opacity-40"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Explicación */}
        <form onSubmit={handleConfirm} className="mt-4 flex flex-col gap-4">
          <div className="p-3 rounded-lg border border-amber-500/20 bg-amber-500/5 flex items-start gap-2.5">
            <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
            <p className="text-xs text-[var(--text-secondary)] leading-relaxed">
              Se borrarán las <span className="font-bold text-[var(--text-primary)]">{itemCount}</span> actividades de esta semana y se volverán a programar con la configuración actual. Las demás semanas no cambian.
            </p>
          </div>

          {/* Campo de motivo obligatorio */}
          <div className="flex flex-col gap-1.5">
            <label
              htmlFor="reset-reason"
              className="text-[10px] font-bold uppercase tracking-widest text-[var(--text-muted)]"
            >
              Motivo de la reprogramación <span className="text-red-400">*</span>
            </label>
            <textarea
              id="reset-reason"
              rows={3}
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              disabled={isSubmitting}
              placeholder="Describe el motivo de la reprogramación (mínimo 10 caracteres)..."
              className="w-full text-xs p-2.5 rounded-[var(--radius-control)] border border-[var(--border-color)] bg-[var(--surface-secondary)] text-[var(--text-primary)] placeholder-[var(--text-muted)] focus:outline-hidden focus:border-[var(--color-primary)] resize-none"
            />
            <div className="flex items-center justify-between text-[9px] text-[var(--text-muted)]">
              <span>Mínimo 10 caracteres requeridos</span>
              <span className={reason.trim().length >= 10 ? 'text-green-400' : 'text-amber-400'}>
                {reason.trim().length} / 10
              </span>
            </div>
          </div>

          {/* Mensaje de error si falla */}
          {errorMessage && (
            <div className="p-2.5 rounded-md border border-red-500/30 bg-red-500/10 text-xs text-red-400">
              {errorMessage}
            </div>
          )}

          {/* Botones de acción */}
          <div className="flex items-center justify-end gap-2 pt-2 border-t border-[var(--border-color)]">
            <button
              type="button"
              onClick={handleClose}
              disabled={isSubmitting}
              className="px-3 py-1.5 text-[10px] font-bold uppercase tracking-wider rounded-[var(--radius-control)] border border-[var(--border-color)] text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--surface-secondary)] transition-colors disabled:opacity-40"
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={!isReasonValid || isSubmitting}
              className="flex items-center gap-1.5 px-3 py-1.5 text-[10px] font-bold uppercase tracking-wider rounded-[var(--radius-control)] bg-amber-600 hover:bg-amber-500 text-white transition-colors disabled:opacity-40 disabled:cursor-not-allowed shadow-xs"
            >
              <RotateCcw className={`w-3 h-3 ${isSubmitting ? 'animate-spin' : ''}`} />
              {isSubmitting ? 'Reprogramando…' : 'Reprogramar'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
