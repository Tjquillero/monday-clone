'use client';

import React, { useState, useEffect } from 'react';
import dynamic from 'next/dynamic';
import 'leaflet/dist/leaflet.css';

// Paleta de colores premium para TIPOS DE ACTIVIDAD - MANTENIX DARK INDUSTRIAL
const CATEGORY_COLORS: Record<string, string> = {
  'FERTILIZACION': '#10b981', // Esmeralda
  'PODA': '#3B7EF8',        // Azul Mantenix
  'PLATEO': '#f59e0b',      // Ámbar
  'DESMALEZADO': '#ef4444', // Rojo
  'LIMPIEZA': '#8b5cf6',    // Violeta
  'SIEMBRA': '#14b8a6',     // Turquesa
  'RIEGO': '#0ea5e9',       // Celeste
  'DEFAULT': '#475569'      // Slate 600
};

const getCategoryColor = (name: string) => {
  const upperName = name.toUpperCase();
  for (const [key, color] of Object.entries(CATEGORY_COLORS)) {
    if (upperName.includes(key)) return color;
  }
  return CATEGORY_COLORS.DEFAULT;
};

interface Task {
  id: string | number;
  name: string;
  status: string;
  lat?: number;
  lng?: number;
  values?: any;
}

const LeafletMainMap = dynamic(async () => {
  const { MapContainer, TileLayer, Marker, Popup, Tooltip } = await import('react-leaflet');
  const L = await import('leaflet');

  // Fix for icons
  delete (L.Icon.Default.prototype as any)._getIconUrl;
  L.Icon.Default.mergeOptions({
    iconRetinaUrl: 'https://unpkg.com/leaflet@1.7.1/dist/images/marker-icon-2x.png',
    iconUrl: 'https://unpkg.com/leaflet@1.7.1/dist/images/marker-icon.png',
    shadowUrl: 'https://unpkg.com/leaflet@1.7.1/dist/images/marker-shadow.png',
  });

  const Component = ({ markers }: { markers: Task[] }) => {
    return (
      <MapContainer 
        center={[10.9685, -74.7813]} 
        zoom={11} 
        style={{ height: '100%', width: '100%', background: '#0C0F1A' }}
        zoomControl={false}
      >
        <TileLayer
          attribution='&copy; Google Maps'
          url="https://{s}.google.com/vt/lyrs=s,h&x={x}&y={y}&z={z}"
          subdomains={['mt0', 'mt1', 'mt2', 'mt3']}
        />
        {markers.map(task => {
          const lat = task.lat || parseFloat(task.values?.lat);
          const lng = task.lng || parseFloat(task.values?.lng);
          
          if (isNaN(lat) || isNaN(lng)) return null;

          const categoryColor = getCategoryColor(task.name);

          // Icono definido con el estilo DARK INDUSTRIAL
          const icon = L.divIcon({
            className: 'custom-task-icon',
            html: `
              <div style="
                background-color: ${categoryColor};
                width: 14px;
                height: 14px;
                border: 2px solid #0C0F1A;
                border-radius: 50%;
                box-shadow: 0 0 15px ${categoryColor}80;
                transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
                position: relative;
              " onmouseover="this.style.transform='scale(1.5)'; this.style.boxShadow='0 0 25px ${categoryColor}';" onmouseout="this.style.transform='scale(1)'; this.style.boxShadow='0 0 15px ${categoryColor}80';">
                <div style="position: absolute; inset: -4px; border: 1px solid ${categoryColor}40; border-radius: 50%; animation: pulse 2s infinite;"></div>
              </div>
            `,
            iconSize: [14, 14],
            iconAnchor: [7, 7]
          });

          return (
            <Marker key={task.id} position={[lat, lng]} icon={icon}>
              <Tooltip direction="top" offset={[0, -12]} opacity={1} permanent={false} className="tactical-tooltip">
                 <div className="bg-[var(--bg-primary)] text-[var(--text-primary)] p-3 rounded-2xl border border-[var(--border-color)] shadow-2xl backdrop-blur-md">
                    <p className="text-[10px] font-black uppercase tracking-[0.2em] italic mb-1">{task.name}</p>
                    <div className="flex items-center gap-2">
                        <div className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                        <p className="text-[8px] text-[var(--text-secondary)] font-black uppercase tracking-widest leading-none mt-0.5">{task.status}</p>
                    </div>
                 </div>
              </Tooltip>
              <Popup className="tactical-popup">
                <div className="bg-[var(--bg-primary)] text-[var(--text-primary)] p-5 rounded-[2rem] border border-[var(--border-color)] shadow-2xl min-w-[200px] backdrop-blur-xl">
                  <div className="flex items-center gap-4 mb-4">
                     <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-[#3B7EF8]/20 to-[#1E2442]/50 flex items-center justify-center border border-[var(--border-color)] shadow-lg">
                        <div className="w-4 h-4 rounded-full" style={{ backgroundColor: categoryColor, boxShadow: `0 0 15px ${categoryColor}` }} />
                     </div>
                     <div>
                        <h4 className="font-black text-[11px] uppercase tracking-[0.2em] italic leading-tight">{task.name}</h4>
                        <p className="text-[8px] font-black text-[var(--text-secondary)] uppercase tracking-widest mt-1">OPERATIONAL_FEED</p>
                     </div>
                  </div>
                  <div className="space-y-3 pt-4 border-t border-[var(--border-color)]">
                     <div className="flex justify-between items-center">
                        <span className="text-[9px] text-[var(--text-secondary)] font-black uppercase tracking-widest">Status</span>
                        <span className="text-[9px] font-black px-3 py-1 rounded-lg bg-slate-500/5 text-emerald-500 border border-[var(--border-color)] uppercase tracking-tighter">{task.status}</span>
                     </div>
                     <div className="flex justify-between items-center">
                        <span className="text-[9px] text-[var(--text-secondary)] font-black uppercase tracking-widest">Geo_Coord</span>
                        <span className="text-[9px] font-mono text-[var(--text-secondary)] font-bold">{lat.toFixed(4)}N / {lng.toFixed(4)}W</span>
                     </div>
                  </div>
                  <button className="w-full mt-6 py-3 bg-[#3B7EF8] text-white rounded-xl text-[9px] font-black uppercase tracking-[0.2em] shadow-xl shadow-[#3B7EF8]/20 border border-[var(--border-color)] hover:bg-[#2563EB] transition-all">
                    Access_Full_Log
                  </button>
                </div>
              </Popup>
            </Marker>
          );
        })}
      </MapContainer>
    );
  };

  return Component;
}, { ssr: false });

export default function MantenixMap({ items }: { items: Task[] }) {
  const [isMounted, setIsMounted] = useState(false);

  useEffect(() => {
    setIsMounted(true);
  }, []);

  if (!isMounted) return (
    <div className="h-full w-full bg-[var(--bg-primary)] animate-pulse flex flex-col items-center justify-center gap-4">
        <div className="w-16 h-16 rounded-[1.5rem] border-2 border-[#3B7EF8]/30 border-t-[#3B7EF8] animate-spin" />
        <span className="font-black text-slate-800 uppercase tracking-[0.4em] text-[10px] italic">Loading_Satellite_Matrix...</span>
    </div>
  );

  const markers = items.filter(item => {
    const lat = item.lat || parseFloat(item.values?.lat);
    const lng = item.lng || parseFloat(item.values?.lng);
    return !isNaN(lat) && !isNaN(lng);
  });

  return (
    <div className="h-full w-full rounded-[2.5rem] overflow-hidden border border-[var(--border-color)] shadow-[0_0_50px_rgba(0,0,0,0.5)] relative bg-[var(--bg-primary)]">
      <LeafletMainMap markers={markers} />
      
      {/* Legend / Tactical Guía de Colores */}
      <div className="absolute bottom-6 left-6 z-[1000] bg-[var(--bg-secondary)]/90 backdrop-blur-xl p-8 rounded-[2.5rem] border border-[var(--border-color)] shadow-[0_20px_60px_rgba(0,0,0,0.5)] max-w-[240px]">
         <div className="flex items-center gap-3 mb-6 pb-3 border-b border-[var(--border-color)]">
            <div className="w-2 h-2 rounded-full bg-[#3B7EF8] animate-pulse shadow-[0_0_10px_#3B7EF8]" />
            <p className="text-[10px] font-black text-white italic uppercase tracking-[0.3em] leading-none">Operational_Grid</p>
         </div>
         <div className="space-y-4">
            {Object.entries(CATEGORY_COLORS).map(([name, color]) => (
               name !== 'DEFAULT' && (
                  <div key={name} className="flex items-center gap-4 group cursor-help">
                     <div className="w-2.5 h-2.5 rounded-full shadow-lg group-hover:scale-125 transition-transform" style={{ backgroundColor: color, boxShadow: `0 0 10px ${color}80` }} />
                     <span className="text-[9px] font-black text-slate-500 group-hover:text-white transition-colors uppercase tracking-[0.2em]">{name}</span>
                  </div>
               )
            ))}
         </div>
         <div className="mt-8 pt-4 border-t border-[var(--border-color)]">
            <p className="text-[8px] font-black text-slate-800 uppercase tracking-widest text-center">Satellite_Link_Active</p>
         </div>
      </div>

      <style jsx global>{`
        .tactical-tooltip {
            background: transparent !important;
            border: none !important;
            box-shadow: none !important;
        }
        .tactical-tooltip::before {
            display: none !important;
        }
        .tactical-popup .leaflet-popup-content-wrapper {
            background: transparent !important;
            box-shadow: none !important;
            padding: 0 !important;
        }
        .tactical-popup .leaflet-popup-content {
            margin: 0 !important;
            width: auto !important;
        }
        .tactical-popup .leaflet-popup-tip {
            background: #161B30 !important;
            border: 1px solid rgba(255, 255, 255, 0.1) !important;
        }
        @keyframes pulse {
            0% { transform: scale(0.8); opacity: 0.5; }
            50% { transform: scale(1.1); opacity: 1; }
            100% { transform: scale(0.8); opacity: 0.5; }
        }
      `}</style>
    </div>
  );
}
