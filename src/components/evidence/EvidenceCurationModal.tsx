'use client';

import React, { useState } from 'react';
import { createPortal } from 'react-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { X, ShieldCheck, CheckCircle2, Sparkles, AlertCircle, FileText, Lock } from 'lucide-react';
import Image from 'next/image';
import {
  curateActivityAttachments,
  selectActivityEvidence,
  ExecutionAttachmentItem,
  ScoredAttachment,
  ActaCuratedSelection,
} from '@/lib/evidenceCuration';

interface EvidenceCurationModalProps {
  isOpen: boolean;
  onClose: () => void;
  actaId: string;
  executionId: string;
  activityName: string;
  operationalAttachments: ExecutionAttachmentItem[];
  currentSelection?: string[];
  isIssuedActa?: boolean;
  onSaveSelection?: (selection: ActaCuratedSelection) => void;
}

export default function EvidenceCurationModal({
  isOpen,
  onClose,
  actaId,
  executionId,
  activityName,
  operationalAttachments = [],
  currentSelection = [],
  isIssuedActa = false,
  onSaveSelection,
}: EvidenceCurationModalProps) {
  // Compute deterministic recommendations
  const curationResult = curateActivityAttachments(executionId, operationalAttachments, 5);

  const [selectedIds, setSelectedIds] = useState<string[]>(() => {
    if (currentSelection && currentSelection.length > 0) {
      return currentSelection;
    }
    return curationResult.recommended_ids.slice(0, 3);
  });

  const [activePhoto, setActivePhoto] = useState<ExecutionAttachmentItem | null>(
    operationalAttachments[0] || null
  );

  if (!isOpen) return null;

  const toggleSelection = (photoId: string) => {
    if (isIssuedActa) return;
    setSelectedIds((prev) =>
      prev.includes(photoId) ? prev.filter((id) => id !== photoId) : [...prev, photoId]
    );
  };

  const handleApplyRecommendation = () => {
    if (isIssuedActa) return;
    setSelectedIds(curationResult.recommended_ids.slice(0, 3));
  };

  const handleConfirm = () => {
    if (isIssuedActa) {
      onClose();
      return;
    }
    const selection = selectActivityEvidence(
      actaId,
      executionId,
      operationalAttachments,
      selectedIds
    );
    if (onSaveSelection) {
      onSaveSelection(selection);
    }
    onClose();
  };

  return createPortal(
    <AnimatePresence>
      <div className="fixed inset-0 z-[20000] flex items-center justify-center p-4 sm:p-6 overflow-hidden">
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          onClick={onClose}
          className="fixed inset-0 bg-slate-950/90 backdrop-blur-xl z-[20001] cursor-pointer"
        />

        <motion.div
          initial={{ scale: 0.9, opacity: 0, y: 20 }}
          animate={{ scale: 1, opacity: 1, y: 0 }}
          exit={{ scale: 0.9, opacity: 0, y: 20 }}
          className="relative w-full max-w-5xl bg-[#0B0E14] border border-white/10 rounded-[2.5rem] shadow-[0_40px_100px_rgba(0,0,0,0.8)] z-[20002] overflow-hidden flex flex-col max-h-[92vh]"
        >
          {/* Header */}
          <div className="p-6 border-b border-white/10 bg-white/5 flex items-center justify-between shrink-0">
            <div className="flex items-center space-x-4">
              <div className="w-12 h-12 rounded-2xl bg-indigo-500/10 border border-indigo-500/20 flex items-center justify-center text-indigo-400">
                <Sparkles className="w-6 h-6" />
              </div>
              <div>
                <h2 className="text-2xl font-black text-white italic uppercase tracking-tighter leading-none">
                  Curaduría de Evidencia Documental
                </h2>
                <div className="flex items-center gap-3 mt-1.5">
                  <span className="text-[9px] font-black text-indigo-400 uppercase tracking-widest bg-indigo-500/10 px-2.5 py-0.5 rounded-md border border-indigo-500/20">
                    Motor: {curationResult.engine_version}
                  </span>
                  <span className="text-[9px] text-slate-400 font-bold uppercase tracking-widest">
                    Actividad: {activityName}
                  </span>
                </div>
              </div>
            </div>
            <button
              onClick={onClose}
              className="p-2.5 bg-white/5 border border-white/10 rounded-xl text-slate-400 hover:text-white transition-all"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          {/* Banner for ISSUED state */}
          {isIssuedActa && (
            <div className="bg-amber-500/10 border-b border-amber-500/20 px-6 py-2.5 flex items-center justify-between text-amber-200 text-xs font-semibold">
              <div className="flex items-center gap-2">
                <Lock className="w-4 h-4 text-amber-400" />
                <span>Acta en estado ISSUED: La selección documental está congelada inmutablemente.</span>
              </div>
            </div>
          )}

          {/* Body */}
          <div className="flex-1 overflow-y-auto p-6 flex flex-col lg:flex-row gap-8">
            {/* Left: Active Photo & Scoring Details */}
            <div className="flex-1 min-w-0 flex flex-col">
              <div className="aspect-[4/3] rounded-[2rem] bg-slate-900 border border-white/10 relative overflow-hidden flex items-center justify-center">
                {activePhoto ? (
                  <Image
                    src={activePhoto.storage_path}
                    alt="Evidencia"
                    fill
                    className="object-contain p-2"
                    unoptimized
                  />
                ) : (
                  <div className="text-slate-500 text-sm font-bold">Sin evidencia seleccionada</div>
                )}
                {activePhoto && (
                  <div className="absolute top-4 left-4 bg-slate-950/80 backdrop-blur-md px-3 py-1.5 rounded-xl border border-white/10 flex items-center gap-2">
                    <span
                      className={`w-2 h-2 rounded-full ${
                        activePhoto.phase === 'before' ? 'bg-blue-400' : 'bg-emerald-400'
                      }`}
                    />
                    <span className="text-[10px] font-black uppercase text-white tracking-widest">
                      Fase: {activePhoto.phase}
                    </span>
                  </div>
                )}
              </div>

              {/* Score Rationale for active photo */}
              {activePhoto && (() => {
                const itemScored = curationResult.items.find((i) => i.attachment.id === activePhoto.id);
                if (!itemScored) return null;
                return (
                  <div className="mt-4 p-4 rounded-2xl bg-white/5 border border-white/10">
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-xs font-black text-white uppercase tracking-wider flex items-center gap-2">
                        <ShieldCheck className="w-4 h-4 text-indigo-400" /> Score Determinístico: {itemScored.score}/100 pts
                      </span>
                      {itemScored.recommended && (
                        <span className="text-[9px] font-black bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 px-2 py-0.5 rounded-md">
                          Recomendado por Motor
                        </span>
                      )}
                    </div>
                    <ul className="space-y-1">
                      {itemScored.reasons.map((r, idx) => (
                        <li key={idx} className="text-[11px] text-slate-300 flex items-center gap-2">
                          <span className="w-1.5 h-1.5 rounded-full bg-indigo-400" />
                          {r}
                        </li>
                      ))}
                    </ul>
                  </div>
                );
              })()}
            </div>

            {/* Right: Operational Gallery & Selection Controls */}
            <div className="w-full lg:w-96 flex flex-col shrink-0">
              <div className="flex items-center justify-between mb-3">
                <span className="text-xs font-black text-slate-400 uppercase tracking-wider">
                  Evidencia Operacional ({operationalAttachments.length})
                </span>
                {!isIssuedActa && (
                  <button
                    onClick={handleApplyRecommendation}
                    className="text-[10px] font-black text-indigo-400 hover:text-indigo-300 uppercase tracking-widest flex items-center gap-1 bg-indigo-500/10 px-2.5 py-1 rounded-lg border border-indigo-500/20"
                  >
                    <Sparkles className="w-3.5 h-3.5" /> Usar Recomendación
                  </button>
                )}
              </div>

              <div className="grid grid-cols-3 gap-2.5 max-h-[350px] overflow-y-auto pr-1">
                {curationResult.items.map((scoredItem: ScoredAttachment) => {
                  const att = scoredItem.attachment;
                  const isSelected = selectedIds.includes(att.id);

                  return (
                    <div
                      key={att.id}
                      onClick={() => {
                        setActivePhoto(att);
                        toggleSelection(att.id);
                      }}
                      className={`relative aspect-square rounded-xl overflow-hidden border-2 cursor-pointer transition-all ${
                        isSelected
                          ? 'border-emerald-500 ring-2 ring-emerald-500/30'
                          : 'border-white/10 hover:border-white/30'
                      }`}
                    >
                      <Image
                        src={att.storage_path}
                        alt="Foto op"
                        fill
                        className="object-cover"
                        unoptimized
                      />
                      {scoredItem.recommended && (
                        <div className="absolute top-1 left-1 bg-indigo-600/90 text-[7px] font-black uppercase text-white px-1.5 py-0.5 rounded shadow">
                          Top
                        </div>
                      )}
                      {isSelected && (
                        <div className="absolute top-1 right-1 bg-emerald-500 text-slate-950 p-0.5 rounded-full shadow">
                          <CheckCircle2 className="w-3.5 h-3.5" />
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>

              {/* Selection summary */}
              <div className="mt-auto pt-4 border-t border-white/10 flex flex-col gap-2">
                <div className="flex items-center justify-between text-xs font-bold text-slate-300">
                  <span>Seleccionadas para Acta:</span>
                  <span className="text-emerald-400 font-mono font-black">{selectedIds.length} fotos</span>
                </div>
                <p className="text-[10px] text-slate-500 leading-tight">
                  Las fotografías no seleccionadas continúan almacenadas al 100% en la tabla de evidencia operacional.
                </p>
              </div>
            </div>
          </div>

          {/* Footer */}
          <div className="p-5 bg-white/5 border-t border-white/10 flex items-center justify-between shrink-0">
            <div className="flex items-center gap-2 text-slate-500 text-[10px] font-bold uppercase">
              <FileText className="w-4 h-4 text-indigo-400" />
              <span>Curation Contract v1 · Per-Activity Isolation Guaranteed</span>
            </div>
            <div className="flex items-center gap-3">
              <button
                onClick={onClose}
                className="px-5 py-2.5 bg-white/5 border border-white/10 text-slate-400 hover:text-white rounded-xl text-xs font-black uppercase tracking-wider transition-all"
              >
                {isIssuedActa ? 'Cerrar' : 'Cancelar'}
              </button>
              {!isIssuedActa && (
                <button
                  onClick={handleConfirm}
                  className="px-6 py-2.5 bg-emerald-500 text-slate-950 hover:bg-emerald-400 rounded-xl text-xs font-black uppercase tracking-wider shadow-lg transition-all"
                >
                  Guardar Selección
                </button>
              )}
            </div>
          </div>
        </motion.div>
      </div>
    </AnimatePresence>,
    document.body
  );
}
