// src/components/OfflineIndicator.tsx
'use client';

import React from 'react';
import { Wifi, WifiOff, RefreshCw, AlertTriangle } from 'lucide-react';
import { useOfflineSync } from '@/hooks/useOfflineSync';

export default function OfflineIndicator() {
  const { isOnline, syncStatus, pendingCount, triggerSync } = useOfflineSync();

  if (isOnline && syncStatus === 'synced' && pendingCount === 0) {
    return null;
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
  );
}
