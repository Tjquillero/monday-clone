'use client';

import React, { useState, useEffect } from 'react';
import dynamic from 'next/dynamic';
import 'leaflet/dist/leaflet.css';

// Componente interno que usa Leaflet (SOLO CLIENTE)
const LeafletMap = dynamic(async () => {
  const { MapContainer, TileLayer, Marker, useMapEvents } = await import('react-leaflet');
  const L = await import('leaflet');

  // Fix para iconos estándar
  delete (L.Icon.Default.prototype as any)._getIconUrl;
  L.Icon.Default.mergeOptions({
    iconRetinaUrl: 'https://unpkg.com/leaflet@1.7.1/dist/images/marker-icon-2x.png',
    iconUrl: 'https://unpkg.com/leaflet@1.7.1/dist/images/marker-icon.png',
    shadowUrl: 'https://unpkg.com/leaflet@1.7.1/dist/images/marker-shadow.png',
  });

  const MapEvents = ({ onClick }: { onClick: (lat: number, lng: number) => void }) => {
    useMapEvents({
      click(e) {
        onClick(e.latlng.lat, e.latlng.lng);
      },
    });
    return null;
  };

  const Component = ({ pos, onSelect }: any) => {
    // Definir el icono personalizado dentro del componente cliente para asegurar que L existe
    const customIcon = L.divIcon({
      className: 'custom-div-icon',
      html: `<div style="background-color: #10b981; width: 14px; height: 14px; border: 2px solid white; border-radius: 50%; box-shadow: 0 0 10px rgba(0,0,0,0.3);"></div>`,
      iconSize: [14, 14],
      iconAnchor: [7, 7]
    });

    return (
      <MapContainer center={[pos.lat, pos.lng]} zoom={13} style={{ height: '100%', width: '100%' }}>
        <TileLayer
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        />
        <Marker position={[pos.lat, pos.lng]} icon={customIcon} />
        <MapEvents onClick={onSelect} />
      </MapContainer>
    );
  };

  return Component;
}, { ssr: false });

export function LocationPicker({ onSelect, initialPos }: { onSelect: (coords: { lat: number, lng: number }) => void, initialPos?: { lat: number, lng: number } }) {
  const [pos, setPos] = useState(initialPos || { lat: 10.9685, lng: -74.7813 });
  const [isMounted, setIsMounted] = useState(false);

  useEffect(() => {
    setIsMounted(true);
  }, []);

  if (!isMounted) return <div className="h-64 w-full bg-slate-50 animate-pulse flex items-center justify-center font-bold text-[var(--text-primary)] uppercase tracking-widest text-[10px]">Iniciando Mapa...</div>;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
         <label className="text-sm font-black text-slate-700 uppercase tracking-widest">Ubicación del reporte</label>
         <div className="text-[10px] bg-emerald-50 text-emerald-600 px-2 py-1 rounded-full font-bold">
            {pos.lat.toFixed(4)}, {pos.lng.toFixed(4)}
         </div>
      </div>
      <div className="h-64 w-full rounded-2xl border border-slate-200 overflow-hidden shadow-sm relative z-0">
        <LeafletMap 
           pos={pos} 
           onSelect={(lat: number, lng: number) => {
              const newPos = { lat, lng };
              setPos(newPos);
              onSelect(newPos);
           }}
        />
      </div>
      <div className="flex items-center gap-2 text-slate-400">
          <div className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
          <p className="text-[11px] font-medium">Haz clic en el mapa para ajustar la posición exacta.</p>
      </div>
    </div>
  );
}
