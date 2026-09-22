'use client';

import React, { useState } from 'react';
import { DailyActivityCard } from '@/lib/dailyOperationalBriefService';
import PhotoVerificationModal from '@/components/modals/PhotoVerificationModal';
import { Camera, Clock, Users, Maximize2, ShieldCheck } from 'lucide-react';
import { resolveActivityDescriptiveName } from '@/lib/activityCatalogResolver';

interface DailyOperationCardProps {
  activity: DailyActivityCard;
  siteName?: string;
  crewName?: string;
}

export const DailyOperationCard: React.FC<DailyOperationCardProps> = ({
  activity,
  siteName = 'Sitio Operativo',
  crewName,
}) => {
  const [modalOpen, setModalOpen] = useState(false);
  const [selectedPhoto, setSelectedPhoto] = useState<string | null>(null);

  console.debug('[H1-DEBUG-CARD]', {
    activityKey: activity.activityKey,
    taskName: activity.taskName,
    siteName
  });

  const getStatusBadge = () => {
    switch (activity.dailyStatus) {
      case 'TERMINADA_HOY':
        return 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30';
      case 'CONTINUA_MANANA':
        return 'bg-blue-500/10 text-blue-400 border-blue-500/30';
      case 'EN_CURSO':
        return 'bg-amber-500/10 text-amber-400 border-amber-500/30';
      case 'NO_EJECUTADA':
        return 'bg-red-500/10 text-red-400 border-red-500/30';
      default:
        return 'bg-slate-500/10 text-slate-400 border-slate-500/30';
    }
  };

  const getStatusLabel = () => {
    switch (activity.dailyStatus) {
      case 'TERMINADA_HOY':
        return 'Terminada Hoy';
      case 'CONTINUA_MANANA':
        return 'Continúa Mañana';
      case 'EN_CURSO':
        return 'En Curso';
      case 'NO_EJECUTADA':
        return 'No Ejecutada';
      default:
        return 'Pendiente';
    }
  };

  const hasAnyPhoto = !!(activity.beforePhotoUrl || activity.afterPhotoUrl);
  const galleryPhotos = [activity.beforePhotoUrl, activity.afterPhotoUrl].filter(Boolean) as string[];

  const openPhoto = (url: string) => {
    setSelectedPhoto(url);
    setModalOpen(true);
  };

  return (
    <div className="bg-slate-900/90 border border-slate-800 rounded-2xl p-5 shadow-xl flex flex-col justify-between hover:border-slate-700 transition-all group">
      <div>
        {/* Cabecera de la Actividad */}
        <div className="flex items-start justify-between gap-3 mb-3">
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2 mb-1 flex-wrap">
              <span className="text-[10px] font-bold uppercase tracking-wider text-indigo-400">
                {siteName}
              </span>
              {activity.activityKey && (
                <span className="px-1.5 py-0.5 rounded bg-slate-800 border border-slate-700 font-mono text-[10px] font-bold text-indigo-300">
                  Ítem {activity.activityKey}
                </span>
              )}
            </div>
            <h3 className="text-sm font-bold text-white group-hover:text-indigo-300 transition-colors leading-snug">
              {activity.taskName || 'Actividad Operativa'}
            </h3>
          </div>
          <span
            className={`px-2.5 py-1 text-[10px] font-extrabold uppercase tracking-wider rounded-lg border ${getStatusBadge()} shrink-0`}
          >
            {getStatusLabel()}
          </span>
        </div>

        {/* Metadatos de Cuadrilla y Avance del Día */}
        <div className="grid grid-cols-2 gap-2 bg-slate-950/60 p-3 rounded-xl border border-slate-800/80 text-xs mb-4">
          <div>
            <span className="text-slate-500 text-[10px] uppercase font-bold block mb-0.5">Ejecutado Hoy</span>
            <span className="font-extrabold text-white text-sm">
              {activity.dailyExecutedQty}{' '}
              <span className="text-slate-400 text-xs font-normal">{activity.unit}</span>
            </span>
          </div>
          <div>
            <span className="text-slate-500 text-[10px] uppercase font-bold block mb-0.5">Meta Planificada</span>
            <span className="font-bold text-slate-300 text-sm">
              {activity.plannedQty}{' '}
              <span className="text-slate-400 text-xs font-normal">{activity.unit}</span>
            </span>
          </div>
          <div className="col-span-2 pt-1 border-t border-slate-800/60 flex items-center justify-between text-slate-400 text-[11px]">
            <span className="flex items-center gap-1">
              <Users className="w-3.5 h-3.5 text-slate-500" />
              {crewName || 'Cuadrilla de Campo'}
            </span>
            <span className="flex items-center gap-1 font-mono text-[10px] text-indigo-400">
              {activity.dayProgressLabel}
            </span>
          </div>
        </div>

        {/* Galería Visual de Evidencia (Protagonista: ANTES / DESPUÉS) */}
        <div className="space-y-1.5 mb-2">
          <div className="flex items-center justify-between text-[11px] font-bold text-slate-400 uppercase tracking-wider">
            <span className="flex items-center gap-1.5">
              <Camera className="w-3.5 h-3.5 text-indigo-400" />
              Evidencia Fotográfica
            </span>
            {hasAnyPhoto && (
              <span className="text-[10px] text-slate-500 font-mono">
                {galleryPhotos.length} foto(s)
              </span>
            )}
          </div>

          <div className="grid grid-cols-2 gap-2">
            {/* Panel ANTES */}
            <div className="relative h-28 rounded-xl overflow-hidden border border-slate-800 bg-slate-950 flex flex-col justify-end">
              {activity.beforePhotoUrl ? (
                <button
                  type="button"
                  onClick={() => openPhoto(activity.beforePhotoUrl!)}
                  className="w-full h-full relative group/img cursor-pointer"
                >
                  <img
                    src={activity.beforePhotoUrl}
                    alt="Evidencia Antes"
                    className="w-full h-full object-cover group-hover/img:scale-105 transition-transform duration-300"
                  />
                  <div className="absolute inset-0 bg-black/30 opacity-0 group-hover/img:opacity-100 transition-opacity flex items-center justify-center">
                    <Maximize2 className="w-5 h-5 text-white drop-shadow" />
                  </div>
                  <span className="absolute top-1.5 left-1.5 px-1.5 py-0.5 rounded bg-black/70 backdrop-blur-xs text-[9px] font-extrabold text-amber-300 uppercase tracking-wider">
                    Antes
                  </span>
                </button>
              ) : (
                <div className="w-full h-full flex flex-col items-center justify-center p-2 text-center text-slate-600">
                  <Camera className="w-5 h-5 mb-1 opacity-40" />
                  <span className="text-[9px] uppercase font-bold tracking-wider">Sin foto Antes</span>
                </div>
              )}
            </div>

            {/* Panel DESPUÉS */}
            <div className="relative h-28 rounded-xl overflow-hidden border border-slate-800 bg-slate-950 flex flex-col justify-end">
              {activity.afterPhotoUrl ? (
                <button
                  type="button"
                  onClick={() => openPhoto(activity.afterPhotoUrl!)}
                  className="w-full h-full relative group/img cursor-pointer"
                >
                  <img
                    src={activity.afterPhotoUrl}
                    alt="Evidencia Después"
                    className="w-full h-full object-cover group-hover/img:scale-105 transition-transform duration-300"
                  />
                  <div className="absolute inset-0 bg-black/30 opacity-0 group-hover/img:opacity-100 transition-opacity flex items-center justify-center">
                    <Maximize2 className="w-5 h-5 text-white drop-shadow" />
                  </div>
                  <span className="absolute top-1.5 left-1.5 px-1.5 py-0.5 rounded bg-black/70 backdrop-blur-xs text-[9px] font-extrabold text-emerald-300 uppercase tracking-wider">
                    Después
                  </span>
                </button>
              ) : (
                <div className="w-full h-full flex flex-col items-center justify-center p-2 text-center text-slate-600">
                  <Camera className="w-5 h-5 mb-1 opacity-40" />
                  <span className="text-[9px] uppercase font-bold tracking-wider">Sin foto Después</span>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Footer con Estado de Verificación */}
      <div className="pt-3 border-t border-slate-800/80 flex items-center justify-between text-xs">
        <div className="flex items-center gap-1.5">
          {activity.verifiedQty > 0 ? (
            <span className="flex items-center gap-1 text-emerald-400 font-semibold text-[11px]">
              <ShieldCheck className="w-4 h-4" />
              Verificado: {activity.verifiedQty} {activity.unit}
            </span>
          ) : activity.dailyExecutedQty > 0 ? (
            <span className="flex items-center gap-1 text-amber-400 font-medium text-[11px]">
              <Clock className="w-3.5 h-3.5" />
              Reporte pendiente de verificación
            </span>
          ) : (
            <span className="text-slate-500 text-[11px]">Sin reporte de jornada</span>
          )}
        </div>

        {activity.dailyResources && activity.dailyResources.length > 0 && (
          <span className="text-[10px] font-mono text-slate-400 bg-slate-800/60 px-2 py-0.5 rounded-md">
            {activity.dailyResources.length} recurso(s)
          </span>
        )}
      </div>

      {/* Modal de Visor de Foto Read-Only */}
      {modalOpen && (
        <PhotoVerificationModal
          isOpen={modalOpen}
          onClose={() => {
            setModalOpen(false);
            setSelectedPhoto(null);
          }}
          onSave={() => {}}
          readOnly
          itemName={activity.taskName}
          itemId={activity.weeklyPlanItemId}
          initialGallery={galleryPhotos}
        />
      )}
    </div>
  );
};
