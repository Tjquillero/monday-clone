'use client';

import { useState, useMemo } from 'react';
import Image from 'next/image';
import Link from 'next/link';
import { Camera, Filter, CheckCircle2, Clock, MapPin, Layers, X, ExternalLink, ShieldCheck, Tag } from 'lucide-react';
import { useBoardExecutionEvidence, BoardEvidenceItem } from '@/hooks/useBoardExecutionEvidence';
import { PendingAttachment } from '@/lib/offlineDB';
import { EvidencePhase } from '@/hooks/useExecutionAttachments';

interface Props {
  boardId: string;
}

const ITEMS_PER_PAGE = 20;

export default function LiveEvidenceGallery({ boardId }: Props) {
  const { attachments, pendingAttachments, isLoading, isError, error } = useBoardExecutionEvidence(boardId, true);

  const [selectedSite, setSelectedSite] = useState<string>('all');
  const [selectedActivity, setSelectedActivity] = useState<string>('all');
  const [selectedPhase, setSelectedPhase] = useState<string>('all');
  const [selectedImage, setSelectedImage] = useState<BoardEvidenceItem | null>(null);
  const [page, setPage] = useState<number>(1);

  // Combine synced attachments (PostgreSQL) and pending attachments (IndexedDB)
  const allEvidence = useMemo(() => {
    const synced: BoardEvidenceItem[] = attachments.map(a => ({ ...a, is_pending: false }));
    const pending: BoardEvidenceItem[] = pendingAttachments.map(p => ({
      id: p.id,
      execution_id: p.execution_id,
      file_name: p.file_name,
      file_url: p.file ? URL.createObjectURL(p.file) : '',
      file_type: p.file_type,
      file_size: p.file_size,
      uploaded_by: p.uploaded_by,
      phase: p.phase as EvidencePhase | null,
      file_hash: p.file_hash,
      created_at: new Date(p.created_at).toISOString(),
      execution_date: new Date().toISOString().split('T')[0],
      execution_status: 'draft',
      crew_name: 'Cuadrilla Local (Pendiente)',
      activity_key: 'pending',
      activity_name: p.file_name,
      group_id: 'pending_group',
      group_title: 'Dispositivo Local',
      is_pending: true,
    }));

    return [...pending, ...synced];
  }, [attachments, pendingAttachments]);

  // Extract unique site titles & activity names for dropdown filters
  const siteOptions = useMemo(() => {
    const set = new Set<string>();
    allEvidence.forEach(item => {
      if (item.group_title) set.add(item.group_title);
    });
    return Array.from(set);
  }, [allEvidence]);

  const activityOptions = useMemo(() => {
    const set = new Set<string>();
    allEvidence.forEach(item => {
      if (item.activity_name) set.add(item.activity_name);
    });
    return Array.from(set);
  }, [allEvidence]);

  // Filter evidence items
  const filteredEvidence = useMemo(() => {
    return allEvidence.filter(item => {
      if (selectedSite !== 'all' && item.group_title !== selectedSite) return false;
      if (selectedActivity !== 'all' && item.activity_name !== selectedActivity) return false;
      if (selectedPhase !== 'all') {
        if (selectedPhase === 'before' && item.phase !== 'before') return false;
        if (selectedPhase === 'after' && item.phase !== 'after') return false;
        if (selectedPhase === 'general' && item.phase !== null) return false;
      }
      return true;
    });
  }, [allEvidence, selectedSite, selectedActivity, selectedPhase]);

  // Paginated view for performance (volume protection, Test 29 alignment)
  const paginatedEvidence = useMemo(() => {
    return filteredEvidence.slice(0, page * ITEMS_PER_PAGE);
  }, [filteredEvidence, page]);

  if (isLoading) {
    return (
      <div className="p-8 flex flex-col items-center justify-center gap-3">
        <div className="w-8 h-8 border-2 border-[#3B7EF8] border-t-transparent rounded-full animate-spin" />
        <p className="text-[10px] text-slate-500 uppercase tracking-widest">Cargando galería de evidencia operacional...</p>
      </div>
    );
  }

  if (isError) {
    return (
      <div className="p-4 bg-red-500/10 border border-red-500/20 rounded-xl text-red-400 text-xs">
        {error?.message || 'Error al obtener la evidencia fotográfica de campo.'}
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* ── BARRA DE FILTROS ────────────────────────────────────────────── */}
      <div className="industrial-card rounded-xl border border-[var(--border-color)] p-4 flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-2 text-white">
          <Camera className="w-4 h-4 text-[#3B7EF8]" />
          <span className="text-xs font-black uppercase tracking-widest">Evidencia Fotográfica Operacional</span>
          <span className="text-[10px] bg-slate-500/20 px-2 py-0.5 rounded-full font-mono text-slate-400">
            {filteredEvidence.length} foto(s)
          </span>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          {/* Filtro por Sitio */}
          <div className="flex items-center gap-1.5 bg-black/20 px-3 py-1.5 rounded-lg border border-white/5 text-[10px]">
            <MapPin className="w-3.5 h-3.5 text-slate-400" />
            <select
              value={selectedSite}
              onChange={(e) => setSelectedSite(e.target.value)}
              className="bg-transparent text-white font-bold outline-none cursor-pointer"
            >
              <option value="all" className="bg-slate-900">Todos los sitios</option>
              {siteOptions.map(site => (
                <option key={site} value={site} className="bg-slate-900">{site}</option>
              ))}
            </select>
          </div>

          {/* Filtro por Actividad */}
          <div className="flex items-center gap-1.5 bg-black/20 px-3 py-1.5 rounded-lg border border-white/5 text-[10px]">
            <Layers className="w-3.5 h-3.5 text-slate-400" />
            <select
              value={selectedActivity}
              onChange={(e) => setSelectedActivity(e.target.value)}
              className="bg-transparent text-white font-bold outline-none cursor-pointer"
            >
              <option value="all" className="bg-slate-900">Todas las actividades</option>
              {activityOptions.map(act => (
                <option key={act} value={act} className="bg-slate-900">{act}</option>
              ))}
            </select>
          </div>

          {/* Filtro por Fase */}
          <div className="flex items-center gap-1.5 bg-black/20 px-3 py-1.5 rounded-lg border border-white/5 text-[10px]">
            <Tag className="w-3.5 h-3.5 text-slate-400" />
            <select
              value={selectedPhase}
              onChange={(e) => setSelectedPhase(e.target.value)}
              className="bg-transparent text-white font-bold outline-none cursor-pointer"
            >
              <option value="all" className="bg-slate-900">Todas las fases</option>
              <option value="before" className="bg-slate-900">Antes (Previo)</option>
              <option value="after" className="bg-slate-900">Después (Posterior)</option>
              <option value="general" className="bg-slate-900">General</option>
            </select>
          </div>
        </div>
      </div>

      {/* ── REJILLA DE EVIDENCIAS ────────────────────────────────────────── */}
      {filteredEvidence.length === 0 ? (
        <div className="industrial-card rounded-xl border border-[var(--border-color)] p-8 text-center text-slate-500">
          <Camera className="w-8 h-8 mx-auto mb-2 opacity-30" />
          <p className="text-xs">No hay fotografías operacionales registradas para los filtros seleccionados.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
          {paginatedEvidence.map((item) => (
            <div
              key={item.id}
              onClick={() => setSelectedImage(item)}
              className="group cursor-pointer industrial-card rounded-xl border border-[var(--border-color)] overflow-hidden hover:border-[#3B7EF8]/50 transition-all flex flex-col"
            >
              {/* Image Preview Container */}
              <div className="relative aspect-video bg-black/40 overflow-hidden">
                {item.file_url ? (
                  <img
                    src={item.file_url}
                    alt={item.file_name}
                    loading="lazy"
                    className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                  />
                ) : (
                  <div className="w-full h-full flex items-center justify-center text-slate-600 text-xs">
                    Sin vista previa
                  </div>
                )}

                {/* Phase Badge */}
                <div className="absolute top-2 left-2 flex gap-1">
                  {item.phase === 'before' && (
                    <span className="bg-blue-600/90 text-white text-[8px] font-black uppercase tracking-wider px-2 py-0.5 rounded shadow-sm">
                      Antes
                    </span>
                  )}
                  {item.phase === 'after' && (
                    <span className="bg-emerald-600/90 text-white text-[8px] font-black uppercase tracking-wider px-2 py-0.5 rounded shadow-sm">
                      Después
                    </span>
                  )}
                  {!item.phase && (
                    <span className="bg-slate-700/90 text-slate-300 text-[8px] font-black uppercase tracking-wider px-2 py-0.5 rounded shadow-sm">
                      General
                    </span>
                  )}
                </div>

                {/* Sync Badge */}
                <div className="absolute top-2 right-2">
                  {item.is_pending ? (
                    <span className="bg-amber-500/90 text-slate-950 text-[8px] font-black uppercase tracking-wider px-2 py-0.5 rounded shadow-sm flex items-center gap-1">
                      <Clock className="w-2.5 h-2.5" /> Pendiente
                    </span>
                  ) : (
                    <span className="bg-emerald-500/90 text-slate-950 text-[8px] font-black uppercase tracking-wider px-2 py-0.5 rounded shadow-sm flex items-center gap-1">
                      <CheckCircle2 className="w-2.5 h-2.5" /> En vivo
                    </span>
                  )}
                </div>
              </div>

              {/* Card Footer Info */}
              <div className="p-3 flex flex-col gap-1.5 flex-1 justify-between bg-black/10">
                <div>
                  <div className="flex items-center gap-1 text-[9px] font-black text-[#3B7EF8] uppercase tracking-wider">
                    <MapPin className="w-2.5 h-2.5 shrink-0" />
                    <span className="truncate">{item.group_title}</span>
                  </div>
                  <p className="text-xs font-bold text-white leading-snug line-clamp-1 mt-0.5">
                    {item.activity_name}
                  </p>
                </div>

                <div className="flex items-center justify-between text-[9px] text-slate-400 border-t border-white/5 pt-2 mt-1">
                  <span className="font-mono">{item.execution_date}</span>
                  <span className="truncate max-w-[100px] text-slate-500">{item.crew_name}</span>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Pagination Load More Button */}
      {filteredEvidence.length > paginatedEvidence.length && (
        <div className="flex justify-center pt-4">
          <button
            onClick={() => setPage(p => p + 1)}
            className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-white font-black text-[10px] uppercase tracking-widest rounded-xl transition-all border border-white/10"
          >
            Cargar más evidencias ({filteredEvidence.length - paginatedEvidence.length} restantes)
          </button>
        </div>
      )}

      {/* ── LIGHTBOX MODAL DE INSPECCIÓN HD ───────────────────────────── */}
      {selectedImage && (
        <div className="fixed inset-0 z-50 bg-black/90 backdrop-blur-md flex items-center justify-center p-4">
          <div className="relative max-w-4xl w-full bg-slate-900 border border-slate-800 rounded-2xl overflow-hidden shadow-2xl flex flex-col max-h-[90vh]">
            <div className="flex items-center justify-between p-4 border-b border-slate-800">
              <div className="flex items-center gap-3">
                <Camera className="w-4 h-4 text-[#3B7EF8]" />
                <div>
                  <h3 className="text-xs font-black text-white uppercase tracking-wider">{selectedImage.activity_name}</h3>
                  <p className="text-[10px] text-slate-400">{selectedImage.group_title} • {selectedImage.execution_date}</p>
                </div>
              </div>
              <button
                onClick={() => setSelectedImage(null)}
                className="p-1 text-slate-400 hover:text-white rounded-lg transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="flex-1 bg-black overflow-hidden flex items-center justify-center p-4 min-h-[300px]">
              {selectedImage.file_url && (
                <img
                  src={selectedImage.file_url}
                  alt={selectedImage.file_name}
                  className="max-h-[60vh] max-w-full object-contain rounded-lg shadow-lg"
                />
              )}
            </div>

            <div className="p-4 border-t border-slate-800 bg-slate-950 flex flex-wrap items-center justify-between gap-4 text-xs">
              <div className="flex items-center gap-4 text-slate-400 text-[10px]">
                <span>Fase: <strong className="text-white uppercase">{selectedImage.phase || 'General'}</strong></span>
                <span>Cuadrilla: <strong className="text-white">{selectedImage.crew_name}</strong></span>
                <span>Archivo: <strong className="text-white font-mono">{selectedImage.file_name}</strong></span>
              </div>
              <Link
                href="/verification"
                className="flex items-center gap-1 text-[10px] font-black uppercase tracking-widest text-[#3B7EF8] hover:text-[#5B93F9]"
              >
                Ir a Verificación <ExternalLink className="w-3 h-3" />
              </Link>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
