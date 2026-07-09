'use client';

// Bandeja de conflictos — Incremento 4b del soporte offline.
// Deliberadamente sin pulir (eso es 4c): lista simple, dos acciones,
// nada de estados visuales refinados ni animaciones.

import { createPortal } from 'react-dom';
import { useEffect, useState } from 'react';
import { X, RotateCcw, Trash2 } from 'lucide-react';
import { useConflicts, ConflictItem } from '@/hooks/useConflicts';

interface ConflictTrayProps {
  isOpen: boolean;
  onClose: () => void;
  triggerSync: () => Promise<void>;
}

export default function ConflictTray({ isOpen, onClose, triggerSync }: ConflictTrayProps) {
  const { conflicts, isLoading, retry, discard } = useConflicts(triggerSync);
  const [mounted, setMounted] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);

  useEffect(() => setMounted(true), []);
  if (!mounted || !isOpen) return null;

  const handleRetry = async (item: ConflictItem) => {
    setBusyId(item.id);
    try { await retry(item); } finally { setBusyId(null); }
  };

  const handleDiscard = async (item: ConflictItem) => {
    setBusyId(item.id);
    try { await discard(item); } finally { setBusyId(null); }
  };

  return createPortal(
    <div className="fixed inset-0 z-[30000] flex items-start justify-center p-4 sm:p-8">
      <div className="fixed inset-0 bg-black/50" onClick={onClose} />
      <div className="relative w-full max-w-lg bg-white rounded-xl border border-slate-200 shadow-xl mt-16 max-h-[80vh] flex flex-col">
        <div className="flex items-center justify-between px-4 py-3 border-b border-slate-200">
          <h2 className="text-sm font-bold text-slate-800">
            Conflictos de sincronización {conflicts.length > 0 && `(${conflicts.length})`}
          </h2>
          <button onClick={onClose} className="p-1 text-slate-400 hover:text-slate-700">
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-4 space-y-2">
          {isLoading && (
            <p className="text-sm text-slate-400 py-6 text-center">Cargando…</p>
          )}
          {!isLoading && conflicts.length === 0 && (
            <p className="text-sm text-slate-400 py-6 text-center">Sin conflictos pendientes.</p>
          )}
          {conflicts.map((item) => (
            <div key={item.id} className="border border-rose-200 bg-rose-50/50 rounded-lg p-3 space-y-2">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="text-xs font-bold text-slate-800">{item.typeLabel}</p>
                  <p className="text-xs text-slate-600 truncate">{item.entityLabel}</p>
                </div>
              </div>
              <p className="text-xs text-rose-700">{item.detail}</p>
              <div className="flex items-center gap-2 pt-1">
                <button
                  onClick={() => handleRetry(item)}
                  disabled={busyId === item.id}
                  className="flex items-center gap-1 px-2.5 py-1 text-xs font-semibold text-blue-600 border border-blue-200 rounded-lg hover:bg-blue-50 transition-colors disabled:opacity-60"
                >
                  <RotateCcw className="w-3 h-3" /> Reintentar
                </button>
                <button
                  onClick={() => handleDiscard(item)}
                  disabled={busyId === item.id}
                  className="flex items-center gap-1 px-2.5 py-1 text-xs font-semibold text-rose-600 border border-rose-200 rounded-lg hover:bg-rose-50 transition-colors disabled:opacity-60"
                >
                  <Trash2 className="w-3 h-3" /> Descartar
                </button>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>,
    document.body,
  );
}
