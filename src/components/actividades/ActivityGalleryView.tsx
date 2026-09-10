'use client';

import { useState } from 'react';
import { Camera, Calendar, MapPin, Tag, Image as ImageIcon, ShieldCheck } from 'lucide-react';
import PhotoVerificationModal from '@/components/modals/PhotoVerificationModal';

export type NormalizedPhase = 'before' | 'during' | 'after';

export interface GalleryPhotoItem {
  id: string;
  execution_id: string;
  file_url: string;
  file_name: string;
  phase: NormalizedPhase | null;
  captured_at: string;
  is_protected?: boolean;
  status?: 'active' | 'expiring' | 'protected' | 'purged';
}

export interface ExecutionGalleryGroup {
  execution_id: string;
  execution_date: string;
  crew_name?: string | null;
  worker_count: number;
  executed_qty: number;
  unit: string;
  photos: GalleryPhotoItem[];
}

interface ActivityGalleryViewProps {
  activityName: string;
  siteName: string;
  executions: ExecutionGalleryGroup[];
}

const PHASE_BADGE: Record<NormalizedPhase, { text: string; cls: string }> = {
  before: { text: 'Antes', cls: 'bg-amber-500/10 text-amber-600 border-amber-500/20' },
  during: { text: 'Durante', cls: 'bg-blue-500/10 text-blue-600 border-blue-500/20' },
  after: { text: 'Después', cls: 'bg-emerald-500/10 text-emerald-600 border-emerald-500/20' },
};

export default function ActivityGalleryView({ activityName, siteName, executions }: ActivityGalleryViewProps) {
  const [selectedPhotoUrl, setSelectedPhotoUrl] = useState<string | null>(null);

  const totalPhotos = executions.reduce((acc, e) => acc + e.photos.length, 0);

  const allPhotoUrls = executions.flatMap((e) => e.photos.map((p) => p.file_url));

  return (
    <div className="bg-white rounded-2xl border border-slate-200/80 shadow-xs p-6 space-y-6">
      {/* Header de la Galería por Actividad */}
      <header className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-4 border-b border-slate-100">
        <div>
          <div className="flex items-center gap-2 text-xs font-bold text-[#3B7EF8] uppercase tracking-wider mb-1">
            <Tag className="w-3.5 h-3.5" />
            <span>Galería por Actividad</span>
          </div>
          <h3 className="text-xl font-bold text-slate-900 leading-tight">{activityName}</h3>
          <p className="flex items-center gap-1.5 text-xs text-slate-500 mt-1">
            <MapPin className="w-3.5 h-3.5 text-slate-400" />
            <span>{siteName}</span>
          </p>
        </div>

        <div className="flex items-center gap-2 self-start sm:self-auto bg-slate-50 px-3 py-1.5 rounded-xl border border-slate-200/60 text-xs font-bold text-slate-700">
          <Camera className="w-4 h-4 text-[#3B7EF8]" />
          <span>{totalPhotos} evidencias</span>
          <span className="text-slate-300">•</span>
          <span>{executions.length} jornadas</span>
        </div>
      </header>

      {totalPhotos === 0 && (
        <div className="py-12 text-center bg-slate-50/50 rounded-xl border border-dashed border-slate-200">
          <ImageIcon className="w-8 h-8 text-slate-300 mx-auto mb-2" />
          <p className="text-sm font-semibold text-slate-600">Sin evidencias fotográficas para esta actividad</p>
          <p className="text-xs text-slate-400 mt-0.5">Las fotografías registradas por los líderes aparecerán ordenadas por fecha.</p>
        </div>
      )}

      {/* Timeline Cronológico por Fecha de Ejecución */}
      <div className="space-y-6">
        {executions.map((exec) => (
          <section key={exec.execution_id} className="space-y-3">
            <div className="flex items-center justify-between text-xs font-semibold text-slate-700 bg-slate-50/80 px-3.5 py-2 rounded-lg border border-slate-100">
              <div className="flex items-center gap-2">
                <Calendar className="w-4 h-4 text-[#3B7EF8]" />
                <span className="font-bold text-slate-900">{exec.execution_date}</span>
                {exec.crew_name && <span className="text-slate-500">• {exec.crew_name}</span>}
              </div>
              <div className="text-slate-500">
                <span className="font-semibold text-slate-800">{exec.executed_qty}</span> {exec.unit} ejecutados
              </div>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-3">
              {exec.photos.map((photo) => {
                const phase = photo.phase ? PHASE_BADGE[photo.phase] : null;
                return (
                  <div
                    key={photo.id}
                    onClick={() => setSelectedPhotoUrl(photo.file_url)}
                    className="group relative aspect-square rounded-xl overflow-hidden bg-slate-100 border border-slate-200/80 cursor-pointer hover:shadow-md transition-all"
                  >
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={photo.file_url}
                      alt={photo.file_name}
                      className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                    />

                    {phase && (
                      <span className={`absolute top-2 left-2 px-2 py-0.5 rounded-md border text-[10px] font-extrabold uppercase tracking-wide backdrop-blur-xs ${phase.cls}`}>
                        {phase.text}
                      </span>
                    )}

                    {photo.is_protected && (
                      <span className="absolute top-2 right-2 p-1 rounded-md bg-emerald-600 text-white shadow-xs" title="Protegida por Acta Emitida">
                        <ShieldCheck className="w-3.5 h-3.5" />
                      </span>
                    )}

                    <div className="absolute inset-x-0 bottom-0 p-2 bg-gradient-to-t from-slate-950/80 via-slate-950/40 to-transparent opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-between text-[10px] text-white">
                      <span className="truncate">{photo.captured_at?.slice(11, 16) || ''}</span>
                      <span className="font-bold">Ver</span>
                    </div>
                  </div>
                );
              })}
            </div>
          </section>
        ))}
      </div>

      {/* Lightbox / Preview Modal */}
      {selectedPhotoUrl && (
        <PhotoVerificationModal
          isOpen={!!selectedPhotoUrl}
          onClose={() => setSelectedPhotoUrl(null)}
          onSave={() => {}}
          onDelete={() => {}}
          onUpload={async () => ''}
          itemName={activityName}
          itemId={siteName}
          initialGallery={allPhotoUrls}
        />
      )}
    </div>
  );
}
