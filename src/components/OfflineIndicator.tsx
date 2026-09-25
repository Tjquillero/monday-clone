// src/components/OfflineIndicator.tsx
'use client';

import React, { useState } from 'react';
import { Wifi, WifiOff, RefreshCw, AlertTriangle, AlertOctagon } from 'lucide-react';
import { useOfflineSyncContext } from '@/contexts/OfflineSyncContext';
import ConflictTray from '@/components/offline/ConflictTray';

export default function OfflineIndicator() {
  const { isOnline, syncStatus, pendingCount, conflictCount, syncProgress, triggerSync } = useOfflineSyncContext();
  const [trayOpen, setTrayOpen] = useState(false);

  // ConflictTray se monta siempre (controlado solo por trayOpen), independiente
  // de conflictCount: si dependiera de conflictCount, resolver el último
  // conflicto (retry/discard) haría que el conteo bajara a 0 a mitad de la
  // interacción y el modal entero desaparecería de golpe en vez de mostrar
  // "Sin conflictos pendientes" — encontrado verificando el Incremento 4b.
  const tray = <ConflictTray isOpen={trayOpen} onClose={() => setTrayOpen(false)} triggerSync={triggerSync} />;

  // El botón para abrirla sí depende de conflictCount: un conflicto nunca se
  // resuelve solo (Sección 5 del diseño offline), así que debe seguir visible
  // aunque el resto del indicador se oculte por estar "sincronizado". Icono +
  // badge (mismo patrón que NotificationBell) en vez de una píldora con
  // texto: OfflineIndicator se renderiza también dentro del riel angosto de
  // 68px (ProfessionalLayout), donde una píldora ancha con texto se sale del
  // contenedor y se superpone con el resto de la navegación.
  const conflictButton = conflictCount > 0 && (
    <button
      onClick={() => setTrayOpen(true)}
      title={`${conflictCount} ${conflictCount === 1 ? 'conflicto' : 'conflictos'} de sincronización`}
      className="relative p-3 text-[var(--color-danger)] hover:bg-[var(--color-danger)]/10 rounded-[var(--radius-control)] transition-all"
    >
      <AlertOctagon className="w-5 h-5" />
      <span className="absolute top-1.5 right-1.5 w-4 h-4 bg-[var(--color-danger)] text-white text-[10px] font-black flex items-center justify-center rounded-full border-2 border-[var(--card-bg)]">
        {conflictCount}
      </span>
    </button>
  );

  if (isOnline && syncStatus === 'synced' && pendingCount === 0) {
    return (
      <>
        {conflictButton}
        {tray}
      </>
    );
  }

  let Icon = Wifi;
  let text = "Sincronizado";
  let colorClass = "bg-[var(--color-success)]/10 text-[var(--color-success)] border-[var(--color-success)]/30";
  let iconClass = "";

  if (!isOnline) {
    Icon = WifiOff;
    text = pendingCount === 0 ? "Sin conexión · Sin pendientes" : `Sin conexión · ${pendingCount} pendientes por sincronizar`;
    colorClass = "bg-[var(--color-warning)]/10 text-[var(--color-warning)] border-[var(--color-warning)]/30";
  } else if (syncStatus === 'syncing') {
    Icon = RefreshCw;
    // Progreso real (Incremento 4c) derivado exclusivamente de IndexedDB vía OfflineSyncContext
    text = syncProgress ? `Sincronizando ${syncProgress.done}/${syncProgress.total}...` : "Sincronizando...";
    colorClass = "bg-[var(--color-info)]/10 text-[var(--color-info)] border-[var(--color-info)]/30";
    iconClass = "animate-spin";
  } else if (syncStatus === 'error') {
    Icon = AlertTriangle;
    text = `Error al sincronizar · ${pendingCount} pendientes`;
    colorClass = "bg-[var(--color-danger)]/10 text-[var(--color-danger)] border-[var(--color-danger)]/30";
  }

  return (
    <div className="flex items-center gap-2">
      <button
        onClick={isOnline && syncStatus !== 'syncing' ? triggerSync : undefined}
        disabled={!isOnline || syncStatus === 'syncing'}
        className={`flex items-center gap-2 px-2.5 py-1.5 rounded-[var(--radius-control)] border text-[10px] font-bold uppercase tracking-wider transition-all ${colorClass} ${
          isOnline && syncStatus !== 'syncing' ? 'hover:opacity-80 cursor-pointer' : 'cursor-default'
        }`}
      >
        <Icon className={`w-3.5 h-3.5 ${iconClass}`} />
        <span className="truncate max-w-[160px]">{text}</span>
      </button>
      {syncProgress && (
        <div className="hidden sm:block w-16 h-1 bg-[var(--border-color)] rounded-full overflow-hidden">
          <div
            className="h-full bg-[var(--color-info)] transition-all"
            style={{ width: `${Math.round((syncProgress.done / Math.max(syncProgress.total, 1)) * 100)}%` }}
          />
        </div>
      )}
      {conflictButton}
      {tray}
    </div>
  );
}
