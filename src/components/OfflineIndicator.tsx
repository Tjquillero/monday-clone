// src/components/OfflineIndicator.tsx
'use client';

import React, { useState } from 'react';
import { Wifi, WifiOff, RefreshCw, AlertTriangle, AlertOctagon } from 'lucide-react';
import { useOfflineSync } from '@/hooks/useOfflineSync';
import ConflictTray from '@/components/offline/ConflictTray';

export default function OfflineIndicator() {
  const { isOnline, syncStatus, pendingCount, conflictCount, triggerSync } = useOfflineSync();
  const [trayOpen, setTrayOpen] = useState(false);

  // ConflictTray se monta siempre (controlado solo por trayOpen), independiente
  // de conflictCount: si dependiera de conflictCount, resolver el último
  // conflicto (retry/discard) haría que el conteo bajara a 0 a mitad de la
  // interacción y el modal entero desaparecería de golpe en vez de mostrar
  // "Sin conflictos pendientes" — encontrado verificando este mismo incremento.
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
      className="relative p-3 text-rose-500 hover:bg-rose-500/10 rounded-2xl transition-all"
    >
      <AlertOctagon className="w-5 h-5" />
      <span className="absolute top-1.5 right-1.5 w-4 h-4 bg-rose-500 text-white text-[10px] font-black flex items-center justify-center rounded-full border-2 border-white">
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
  let colorClass = "bg-emerald-500/10 text-emerald-400 border-emerald-500/20";
  let iconClass = "";

  if (!isOnline) {
    Icon = WifiOff;
    text = `Sin conexión · ${pendingCount} guardados`;
    colorClass = "bg-amber-500/10 text-amber-400 border-amber-500/20";
  } else if (syncStatus === 'syncing') {
    Icon = RefreshCw;
    text = "Sincronizando...";
    colorClass = "bg-blue-500/10 text-blue-400 border-blue-500/20";
    iconClass = "animate-spin";
  } else if (syncStatus === 'error') {
    Icon = AlertTriangle;
    text = `Error · ${pendingCount} pendientes`;
    colorClass = "bg-rose-500/10 text-rose-400 border-rose-500/20";
  }

  return (
    <div className="flex items-center gap-2">
      <button
        onClick={isOnline && syncStatus !== 'syncing' ? triggerSync : undefined}
        disabled={!isOnline || syncStatus === 'syncing'}
        className={`flex items-center gap-2.5 px-3 py-1.5 rounded-xl border text-[10px] font-black uppercase tracking-widest transition-all ${colorClass} ${
          isOnline && syncStatus !== 'syncing' ? 'hover:bg-white/5 cursor-pointer' : 'cursor-default'
        }`}
      >
        <Icon className={`w-3.5 h-3.5 ${iconClass}`} />
        <span>{text}</span>
      </button>
      {conflictButton}
      {tray}
    </div>
  );
}
