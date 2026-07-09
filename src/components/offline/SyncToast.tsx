'use client';

// Mensaje de cierre al terminar triggerSync() — Incremento 4c. Se monta una
// sola vez (no por cada OfflineIndicator) porque lee del Context compartido;
// si cada instancia tuviera su propio estado, reconectar mostraría el mismo
// mensaje duplicado (ver nota en OfflineSyncContext.tsx sobre por qué se
// consolidó el estado).

import { useEffect } from 'react';
import { CheckCircle2, AlertTriangle } from 'lucide-react';
import { useOfflineSyncContext } from '@/contexts/OfflineSyncContext';

export default function SyncToast() {
  const { lastSyncResult, dismissLastSyncResult } = useOfflineSyncContext();

  useEffect(() => {
    if (!lastSyncResult) return;
    const timer = setTimeout(dismissLastSyncResult, 5000);
    return () => clearTimeout(timer);
  }, [lastSyncResult, dismissLastSyncResult]);

  if (!lastSyncResult) return null;

  const { synced, conflicts } = lastSyncResult;
  const parts: string[] = [];
  if (synced > 0) parts.push(`${synced} ${synced === 1 ? 'operación sincronizada' : 'operaciones sincronizadas'}.`);
  if (conflicts > 0) parts.push(`${conflicts} ${conflicts === 1 ? 'operación requiere' : 'operaciones requieren'} intervención.`);
  if (parts.length === 0) return null;
  const hasConflicts = conflicts > 0;

  return (
    <div className="fixed bottom-6 right-6 z-[25000] max-w-sm">
      <div
        role="status"
        onClick={dismissLastSyncResult}
        className={`flex items-start gap-2 px-4 py-3 rounded-xl shadow-lg border text-sm font-medium cursor-pointer ${
          hasConflicts ? 'bg-rose-50 border-rose-200 text-rose-700' : 'bg-emerald-50 border-emerald-200 text-emerald-700'
        }`}
      >
        {hasConflicts ? <AlertTriangle className="w-4 h-4 mt-0.5 shrink-0" /> : <CheckCircle2 className="w-4 h-4 mt-0.5 shrink-0" />}
        <span>{parts.join(' ')}</span>
      </div>
    </div>
  );
}
