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
  before: { text: 'Antes', cls: 'bg-[var(--color-warning-subtle)] text-[var(--color-warning)] border-[var(--color-warning)]/30' },
  during: { text: 'Durante', cls: 'bg-[var(--color-info-subtle)] text-[var(--color-info)] border-[var(--color-info)]/30' },
  after: { text: 'Después', cls: 'bg-[var(--color-success-subtle)] text-[var(--color-success)] border-[var(--color-success)]/30' },
};

export default function ActivityGalleryView({ activityName, siteName, executions }: ActivityGalleryViewProps) {
  const [selectedPhotoUrl, setSelectedPhotoUrl] = useState<string | null>(null);

  const totalPhotos = executions.reduce((acc, e) => acc + e.photos.length, 0);

  const allPhotoUrls = executions.flatMap((e) => e.photos.map((p) => p.file_url));

  return (
    <div className="bg-[var(--card-bg)] rounded-[var(--radius-surface)] border border-[var(--border-color)] shadow-xs p-6 space-y-6 text-[var(--text-primary)]">
      {/* Header de la Galería por Actividad */}
      <header className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-4 border-b border-[var(--border-color)]">
        <div>
          <div className="flex items-center gap-2 text-xs font-bold text-[var(--color-primary)] uppercase tracking-wider mb-1">
            <Tag className="w-3.5 h-3.5" />
            <span>Galería por Actividad</span>
          </div>
          <h3 className="font-brand text-xl font-bold text-[var(--text-primary)] leading-tight">{activityName}</h3>
          <p className="flex items-center gap-1.5 text-xs text-[var(--text-muted)] mt-1">
            <MapPin className="w-3.5 h-3.5 text-[var(--text-muted)]" />
            <span>{siteName}</span>
          </p>
        </div>

        <div className="flex items-center gap-2 self-start sm:self-auto bg-[var(--color-surface-subtle)] px-3 py-1.5 rounded-[var(--radius-control)] border border-[var(--border-color)] text-xs font-bold text-[var(--text-primary)]">
          <Camera className="w-4 h-4 text-[var(--color-primary)]" />
          <span>{totalPhotos} evidencias</span>
          <span className="text-[var(--text-muted)]">•</span>
          <span>{executions.length} jornadas</span>
        </div>
      </header>

      {totalPhotos === 0 && (
        <div className="py-12 text-center bg-[var(--color-surface-subtle)] rounded-[var(--radius-control)] border border-dashed border-[var(--border-color)]">
          <ImageIcon className="w-8 h-8 text-[var(--text-muted)] mx-auto mb-2" />
          <p className="text-sm font-semibold text-[var(--text-primary)]">Sin evidencias fotográficas para esta actividad</p>
          <p className="text-xs text-[var(--text-muted)] mt-0.5">Las fotografías registradas por los líderes aparecerán ordenadas por fecha.</p>
        </div>
      )}

      {/* Timeline Cronológico por Fecha de Ejecución */}
      <div className="space-y-6">
        {executions.map((exec) => (
          <section key={exec.execution_id} className="space-y-3">
            <div className="flex items-center justify-between text-xs font-semibold text-[var(--text-secondary)] bg-[var(--color-surface-subtle)] px-3.5 py-2 rounded-[var(--radius-control)] border border-[var(--border-color)]">
              <div className="flex items-center gap-2">
                <Calendar className="w-4 h-4 text-[var(--color-primary)]" />
                <span className="font-bold font-mono text-[var(--text-primary)]">{exec.execution_date}</span>
                {exec.crew_name && <span className="text-[var(--text-muted)]">• {exec.crew_name}</span>}
              </div>
              <div className="text-[var(--text-muted)]">
                <span className="font-semibold font-mono text-[var(--text-primary)]">{exec.executed_qty}</span> {exec.unit} ejecutados
              </div>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-3">
              {exec.photos.map((photo) => {
                const phase = photo.phase ? PHASE_BADGE[photo.phase] : null;
                return (
                  <div
                    key={photo.id}
                    onClick={() => setSelectedPhotoUrl(photo.file_url)}
                    className="group relative aspect-square rounded-[var(--radius-control)] overflow-hidden bg-[var(--color-surface-subtle)] border border-[var(--border-color)] cursor-pointer hover:shadow-md transition-all"
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
                      <span className="absolute top-2 right-2 p-1 rounded-md bg-[var(--color-success)] text-white shadow-xs" title="Protegida por Acta Emitida">
                        <ShieldCheck className="w-3.5 h-3.5" />
                      </span>
                    )}

                    <div className="absolute inset-x-0 bottom-0 p-2 bg-gradient-to-t from-black/80 via-black/40 to-transparent opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-between text-[10px] text-white">
                      <span className="truncate font-mono">{photo.captured_at?.slice(11, 16) || ''}</span>
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
