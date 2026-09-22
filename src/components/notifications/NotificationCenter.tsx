import React from 'react';
import { UserNotification } from '@/types/notification';

interface NotificationCenterProps {
  notifications: UserNotification[];
  unreadCount: number;
  isLoading: boolean;
  onMarkAsRead: (notificationId: string) => void;
  onClose?: () => void;
}

export const NotificationCenter: React.FC<NotificationCenterProps> = ({
  notifications,
  unreadCount,
  isLoading,
  onMarkAsRead,
  onClose,
}) => {
  const getSeverityStyle = (severity: string) => {
    switch (severity) {
      case 'CRITICAL':
        return 'border-l-4 border-l-red-500 bg-red-950/20 text-red-300';
      case 'HIGH':
        return 'border-l-4 border-l-amber-500 bg-amber-950/20 text-amber-300';
      case 'MEDIUM':
        return 'border-l-4 border-l-blue-500 bg-blue-950/20 text-blue-300';
      default:
        return 'border-l-4 border-l-slate-500 bg-slate-900/40 text-slate-300';
    }
  };

  return (
    <div className="w-full max-w-md bg-slate-950 text-slate-100 rounded-2xl border border-slate-800 shadow-2xl overflow-hidden flex flex-col max-h-[550px]">
      {/* Header del Centro de Notificaciones */}
      <div className="p-4 bg-slate-900/90 border-b border-slate-800 flex items-center justify-between">
        <div className="flex items-center space-x-2">
          <span className="w-2.5 h-2.5 rounded-full bg-indigo-400 animate-pulse"></span>
          <h3 className="text-base font-bold text-white tracking-tight">Centro de Notificaciones Operacionales</h3>
        </div>
        {unreadCount > 0 && (
          <span className="px-2.5 py-0.5 text-xs font-semibold rounded-full bg-indigo-500/20 text-indigo-300 border border-indigo-500/30 font-mono">
            {unreadCount} no leídas
          </span>
        )}
      </div>

      {/* Contenido / Lista de Notificaciones */}
      <div className="flex-1 overflow-y-auto p-4 space-y-3">
        {isLoading ? (
          <div className="p-8 text-center text-slate-400 flex items-center justify-center space-x-2">
            <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-indigo-400"></div>
            <span className="text-sm">Cargando avisos operacionales...</span>
          </div>
        ) : notifications.length === 0 ? (
          <div className="p-8 text-center text-slate-400 bg-slate-900/40 rounded-xl border border-slate-800/80">
            <p className="text-sm font-medium">🟢 No tienes notificaciones operacionales pendientes.</p>
            <p className="text-xs text-slate-400 mt-1">
              Las alertas operacionales de capacidad y consumo aparecerán aquí automáticamente.
            </p>
          </div>
        ) : (
          notifications.map((notif) => (
            <div
              key={notif.id}
              className={`p-3.5 rounded-xl border border-slate-800 flex flex-col justify-between space-y-2 transition-all ${getSeverityStyle(
                notif.severity
              )} ${notif.is_read ? 'opacity-60' : 'opacity-100 shadow-sm'}`}
            >
              <div className="flex items-start justify-between gap-2">
                <div>
                  <div className="flex items-center space-x-2">
                    <span className="text-xs font-mono font-bold px-1.5 py-0.5 rounded bg-slate-900/80 border border-slate-700">
                      {notif.alert_code}
                    </span>
                    <span className="text-xs text-slate-400 font-mono">[{notif.severity}]</span>
                  </div>
                  <h4 className="text-sm font-semibold text-slate-100 mt-1">{notif.title}</h4>
                </div>

                {!notif.is_read && (
                  <button
                    onClick={() => onMarkAsRead(notif.id)}
                    className="shrink-0 px-2 py-1 text-[11px] font-medium rounded-lg bg-indigo-600/30 hover:bg-indigo-600/50 text-indigo-200 border border-indigo-500/40 transition-colors"
                  >
                    Marcar leída
                  </button>
                )}
              </div>

              <p className="text-xs text-slate-300 leading-relaxed">{notif.message}</p>

              <div className="flex items-center justify-between text-[10px] text-slate-400 font-mono pt-1 border-t border-slate-800/40">
                <span>Entity: {notif.entity_id}</span>
                <span>{new Date(notif.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
              </div>
            </div>
          ))
        )}
      </div>

      {/* Footer Informatorio */}
      <div className="p-3 bg-slate-900/90 border-t border-slate-800 text-[11px] text-slate-400 flex items-center justify-between font-mono">
        <span>Fase 4 · Módulo 5 (Realtime Inbox)</span>
        <span>UNDETERMINED_MONETARY_COST</span>
      </div>
    </div>
  );
};
