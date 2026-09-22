import React from 'react';

interface NotificationBellProps {
  unreadCount: number;
  onClick: () => void;
  isOpen?: boolean;
}

export const NotificationBell: React.FC<NotificationBellProps> = ({
  unreadCount,
  onClick,
  isOpen = false,
}) => {
  return (
    <button
      onClick={onClick}
      className={`relative p-2.5 rounded-xl transition-all duration-200 focus:outline-none flex items-center justify-center ${
        isOpen
          ? 'bg-indigo-600/30 text-indigo-300 border border-indigo-500/50 shadow-lg shadow-indigo-500/20'
          : 'bg-slate-900/80 hover:bg-slate-800 text-slate-300 border border-slate-800'
      }`}
      aria-label="Abrir centro de notificaciones"
    >
      {/* Icono de Campana SVG */}
      <svg
        className="w-5 h-5"
        fill="none"
        stroke="currentColor"
        viewBox="0 0 24 24"
        xmlns="http://www.w3.org/2000/svg"
      >
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth="2"
          d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9"
        ></path>
      </svg>

      {/* Insignia de Notificaciones No Leídas */}
      {unreadCount > 0 && (
        <span className="absolute -top-1 -right-1 flex h-5 w-5 items-center justify-center">
          <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-400 opacity-75"></span>
          <span className="relative inline-flex items-center justify-center rounded-full h-5 w-5 bg-red-600 text-[10px] font-extrabold text-white px-1 shadow-md">
            {unreadCount > 99 ? '99+' : unreadCount}
          </span>
        </span>
      )}
    </button>
  );
};
