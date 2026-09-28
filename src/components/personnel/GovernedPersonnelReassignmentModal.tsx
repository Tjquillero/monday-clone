'use client';

import { useState } from 'react';
import { X, ArrowRightLeft, Calendar, ShieldCheck, AlertCircle } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { useCrewMutations, usePersonnelVersionForDate } from '@/hooks/useCrews';
import { Personnel } from '@/types/monday';
import { PersonnelSiteAssignment } from '@/types/crew';
import { getBogotaTodayISO } from '@/lib/crewService';

interface Props {
  isOpen: boolean;
  onClose: () => void;
  boardId: string;
  sourceVersionId: string;
  assignments: PersonnelSiteAssignment[];
  personnelList: Personnel[];
}

export default function GovernedPersonnelReassignmentModal({
  isOpen,
  onClose,
  boardId,
  sourceVersionId,
  assignments,
  personnelList,
}: Props) {
  const { reassignPersonnel } = useCrewMutations(boardId);
  const [selectedPersonnelId, setSelectedPersonnelId] = useState('');
  const [targetZone, setTargetZone] = useState('ZV');
  const [effectiveFrom, setEffectiveFrom] = useState(() => getBogotaTodayISO());
  const [changeReason, setChangeReason] = useState('');
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  if (!isOpen) return null;

  const currentAssignment = assignments.find(
    (a) => a.personnel_id === selectedPersonnelId
  );

  const handleReassign = async () => {
    setErrorMsg(null);
    if (!selectedPersonnelId) {
      setErrorMsg('Debe seleccionar a una persona para reasignar');
      return;
    }
    if (!changeReason || changeReason.trim().length < 5) {
      setErrorMsg('El motivo de reasignación debe contener al menos 5 caracteres');
      return;
    }

    try {
      await reassignPersonnel.mutateAsync({
        sourceVersionId,
        personnelId: selectedPersonnelId,
        targetZone,
        effectiveFrom,
        changeReason: changeReason.trim(),
      });
      onClose();
      setSelectedPersonnelId('');
      setChangeReason('');
    } catch (err: any) {
      setErrorMsg(err?.message || 'Error al ejecutar la reasignación gobernada');
    }
  };

  return (
    <div className="fixed inset-0 z-[300] bg-black/60 backdrop-blur-xs flex items-center justify-center p-4 animate-in fade-in duration-200">
      <div className="bg-[var(--card-bg)] border border-[var(--border-color)] rounded-[var(--radius-surface)] shadow-[var(--shadow-modal)] max-w-lg w-full overflow-hidden flex flex-col">
        {/* Header */}
        <div className="p-6 border-b border-[var(--border-color)] flex items-center justify-between bg-[var(--bg-secondary)]/50">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-[var(--radius-control)] bg-[var(--color-primary)] text-white flex items-center justify-center shadow-xs">
              <ArrowRightLeft className="w-5 h-5 text-[var(--color-accent)]" />
            </div>
            <div>
              <h3 className="brand-title text-base text-[var(--text-primary)]">
                Reasignación Gobernada de Personal
              </h3>
              <p className="text-xs text-[var(--text-secondary)]">
                Crea un nuevo snapshot inmutable con fecha efectiva
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--color-surface-subtle)] rounded-[var(--radius-control)] transition-all"
            aria-label="Cerrar modal"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content */}
        <div className="p-6 space-y-4">
          {errorMsg && (
            <div className="p-3 bg-[var(--color-danger)]/10 border border-[var(--color-danger)]/20 rounded-[var(--radius-control)] text-xs text-[var(--color-danger)] flex items-start gap-2">
              <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
              <span>{errorMsg}</span>
            </div>
          )}

          {/* Persona selector */}
          <div>
            <label className="text-[11px] font-bold uppercase tracking-wider text-[var(--text-muted)] block mb-1">
              Personal a Reasignar *
            </label>
            <select
              value={selectedPersonnelId}
              onChange={(e) => setSelectedPersonnelId(e.target.value)}
              className="w-full px-3 py-2 border border-[var(--border-color)] rounded-[var(--radius-control)] text-xs bg-[var(--card-bg)] text-[var(--text-primary)] outline-none focus:border-[var(--color-primary)]"
            >
              <option value="">-- Seleccionar Persona --</option>
              {assignments.map((a) => (
                <option key={a.personnel_id} value={a.personnel_id}>
                  {a.personnel_name} ({a.zone} - {a.role_in_site || 'General'})
                </option>
              ))}
            </select>
          </div>

          {/* Current vs Target zone */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-[11px] font-bold uppercase tracking-wider text-[var(--text-muted)] block mb-1">
                Zona Actual
              </label>
              <div className="px-3 py-2 bg-[var(--color-surface-subtle)] border border-[var(--border-color)] rounded-[var(--radius-control)] text-xs font-semibold text-[var(--text-secondary)]">
                {currentAssignment ? currentAssignment.zone : 'Ninguna'}
              </div>
            </div>
            <div>
              <label className="text-[11px] font-bold uppercase tracking-wider text-[var(--text-muted)] block mb-1">
                Zona Destino *
              </label>
              <select
                value={targetZone}
                onChange={(e) => setTargetZone(e.target.value)}
                className="w-full px-3 py-2 border border-[var(--border-color)] rounded-[var(--radius-control)] text-xs bg-[var(--card-bg)] text-[var(--text-primary)] outline-none focus:border-[var(--color-primary)]"
              >
                <option value="ZV">ZV - Zonas Verdes</option>
                <option value="ZD">ZD - Zonas Duras</option>
                <option value="ZP">ZP - Zona Playa</option>
                <option value="GENERAL">GENERAL</option>
              </select>
            </div>
          </div>

          {/* Effective Date */}
          <div>
            <label className="text-[11px] font-bold uppercase tracking-wider text-[var(--text-muted)] block mb-1 flex items-center gap-1.5">
              <Calendar className="w-3.5 h-3.5 text-[var(--color-primary)] dark:text-[var(--color-accent)]" />
              Fecha Efectiva de Traslado *
            </label>
            <input
              type="date"
              value={effectiveFrom}
              onChange={(e) => setEffectiveFrom(e.target.value)}
              className="w-full px-3 py-2 border border-[var(--border-color)] rounded-[var(--radius-control)] text-xs bg-[var(--card-bg)] text-[var(--text-primary)] outline-none focus:border-[var(--color-primary)]"
            />
            <p className="text-[10px] text-[var(--text-muted)] mt-1">
              Las consultas de /my-work anteriores a esta fecha mantendrán la zona anterior.
            </p>
          </div>

          {/* Change Reason */}
          <div>
            <label className="text-[11px] font-bold uppercase tracking-wider text-[var(--text-muted)] block mb-1">
              Motivo del Traslado (Auditoría Gobernada) *
            </label>
            <textarea
              rows={2}
              value={changeReason}
              onChange={(e) => setChangeReason(e.target.value)}
              placeholder="Ej. Rebalanceo operativo por evento especial en Malecón"
              className="w-full px-3 py-2 border border-[var(--border-color)] rounded-[var(--radius-control)] text-xs bg-[var(--card-bg)] text-[var(--text-primary)] outline-none focus:border-[var(--color-primary)] resize-none"
            />
          </div>
        </div>

        {/* Footer */}
        <div className="p-4 border-t border-[var(--border-color)] bg-[var(--bg-secondary)]/30 flex items-center justify-between">
          <div className="flex items-center gap-1.5 text-[10px] font-bold uppercase text-[var(--text-muted)]">
            <ShieldCheck className="w-4 h-4 text-[var(--color-success)]" />
            Transacción Atómica PostgreSQL
          </div>
          <div className="flex gap-2">
            <Button variant="outline" onClick={onClose} className="text-xs">
              Cancelar
            </Button>
            <Button
              onClick={handleReassign}
              disabled={reassignPersonnel.isPending || !selectedPersonnelId}
              className="text-xs font-bold gap-1.5"
            >
              {reassignPersonnel.isPending ? 'Ejecutando...' : 'Confirmar Traslado'}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
