'use client';

// Componente Nivel 3: Captura de Evidencia Fotográfica (ANTES / DESPUÉS)
// Diseñado para uso ergonómico en campo con celular (touch targets >= 44px).
// Rotulado inequívoco "📷 TOMAR FOTO", previsualización con "✓ Evidencia" y "TOMAR OTRA FOTO".

import React, { useRef } from 'react';
import { Camera, CheckCircle, RefreshCw, X } from 'lucide-react';

export interface LocalEvidenceFile {
  phase: 'before' | 'after';
  file: File;
  previewUrl: string;
}

interface EvidenceCaptureProps {
  beforePhoto: LocalEvidenceFile | null;
  afterPhoto: LocalEvidenceFile | null;
  onBeforePhotoChange: (photo: LocalEvidenceFile | null) => void;
  onAfterPhotoChange: (photo: LocalEvidenceFile | null) => void;
  disabled?: boolean;
}

export const EvidenceCapture: React.FC<EvidenceCaptureProps> = ({
  beforePhoto,
  afterPhoto,
  onBeforePhotoChange,
  onAfterPhotoChange,
  disabled = false,
}) => {
  const beforeInputRef = useRef<HTMLInputElement>(null);
  const afterInputRef = useRef<HTMLInputElement>(null);

  const handleFileSelected = (e: React.ChangeEvent<HTMLInputElement>, phase: 'before' | 'after') => {
    const file = e.target.files?.[0];
    if (!file) return;

    const previewUrl = URL.createObjectURL(file);
    const evidenceItem: LocalEvidenceFile = {
      phase,
      file,
      previewUrl,
    };

    if (phase === 'before') {
      onBeforePhotoChange(evidenceItem);
    } else {
      onAfterPhotoChange(evidenceItem);
    }
  };

  const handleRemove = (phase: 'before' | 'after') => {
    if (phase === 'before') {
      if (beforePhoto) URL.revokeObjectURL(beforePhoto.previewUrl);
      onBeforePhotoChange(null);
      if (beforeInputRef.current) beforeInputRef.current.value = '';
    } else {
      if (afterPhoto) URL.revokeObjectURL(afterPhoto.previewUrl);
      onAfterPhotoChange(null);
      if (afterInputRef.current) afterInputRef.current.value = '';
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <label className="text-xs font-bold text-slate-800 uppercase tracking-wider flex items-center gap-1.5">
          <Camera className="w-4 h-4 text-primary shrink-0" />
          <span>Evidencia Fotográfica de Trabajo</span>
        </label>
        <span className="text-[11px] text-slate-400">Antes y Después</span>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        {/* BLOQUE FOTO ANTES */}
        <div className="p-3.5 bg-slate-50 rounded-2xl border border-slate-200/90 flex flex-col justify-between space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-slate-800 flex items-center gap-1.5">
              <span className="w-2.5 h-2.5 rounded-full bg-blue-500" />
              <span>ANTES (Inicio de labor)</span>
            </span>
            {beforePhoto && (
              <span className="inline-flex items-center px-2 py-0.5 rounded-md text-[10px] font-extrabold bg-emerald-100 text-emerald-800 border border-emerald-200">
                <CheckCircle className="w-3 h-3 mr-1 text-emerald-600 shrink-0" />
                ✓ Evidencia
              </span>
            )}
          </div>

          {beforePhoto ? (
            <div className="space-y-2">
              <div className="relative rounded-xl overflow-hidden border border-slate-300 aspect-video bg-black flex items-center justify-center">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={beforePhoto.previewUrl}
                  alt="Evidencia Foto Antes"
                  className="w-full h-full object-cover"
                />
                <button
                  type="button"
                  onClick={() => handleRemove('before')}
                  disabled={disabled}
                  className="absolute top-2 right-2 p-1.5 bg-slate-900/80 hover:bg-slate-900 text-white rounded-full transition-colors shadow-sm"
                  title="Eliminar foto"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              <button
                type="button"
                onClick={() => !disabled && beforeInputRef.current?.click()}
                disabled={disabled}
                className="w-full min-h-[44px] px-3 py-2 bg-slate-200 hover:bg-slate-300 text-slate-800 rounded-xl text-xs font-bold flex items-center justify-center gap-1.5 transition-colors active:scale-98 touch-manipulation"
              >
                <RefreshCw className="w-4 h-4 text-slate-600" />
                <span>TOMAR OTRA FOTO</span>
              </button>
            </div>
          ) : (
            <button
              type="button"
              onClick={() => !disabled && beforeInputRef.current?.click()}
              disabled={disabled}
              className={`w-full min-h-[120px] p-4 border-2 border-dashed border-slate-300 hover:border-primary rounded-xl flex flex-col items-center justify-center gap-2 bg-white hover:bg-slate-50 transition-all active:scale-98 touch-manipulation ${
                disabled ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'
              }`}
            >
              <div className="p-3 rounded-full bg-primary/10 text-primary">
                <Camera className="w-6 h-6" />
              </div>
              <div className="text-center">
                <span className="text-sm font-extrabold text-slate-800 block">
                  📷 TOMAR FOTO ANTES
                </span>
                <span className="text-[11px] text-slate-400 mt-0.5 block">
                  Toca para abrir cámara o archivos
                </span>
              </div>
            </button>
          )}

          <input
            ref={beforeInputRef}
            type="file"
            accept="image/*"
            capture="environment"
            className="hidden"
            onChange={(e) => handleFileSelected(e, 'before')}
            disabled={disabled}
          />
        </div>

        {/* BLOQUE FOTO DESPUÉS */}
        <div className="p-3.5 bg-slate-50 rounded-2xl border border-slate-200/90 flex flex-col justify-between space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-slate-800 flex items-center gap-1.5">
              <span className="w-2.5 h-2.5 rounded-full bg-emerald-500" />
              <span>DESPUÉS (Fin de labor)</span>
            </span>
            {afterPhoto && (
              <span className="inline-flex items-center px-2 py-0.5 rounded-md text-[10px] font-extrabold bg-emerald-100 text-emerald-800 border border-emerald-200">
                <CheckCircle className="w-3 h-3 mr-1 text-emerald-600 shrink-0" />
                ✓ Evidencia
              </span>
            )}
          </div>

          {afterPhoto ? (
            <div className="space-y-2">
              <div className="relative rounded-xl overflow-hidden border border-slate-300 aspect-video bg-black flex items-center justify-center">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={afterPhoto.previewUrl}
                  alt="Evidencia Foto Después"
                  className="w-full h-full object-cover"
                />
                <button
                  type="button"
                  onClick={() => handleRemove('after')}
                  disabled={disabled}
                  className="absolute top-2 right-2 p-1.5 bg-slate-900/80 hover:bg-slate-900 text-white rounded-full transition-colors shadow-sm"
                  title="Eliminar foto"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              <button
                type="button"
                onClick={() => !disabled && afterInputRef.current?.click()}
                disabled={disabled}
                className="w-full min-h-[44px] px-3 py-2 bg-slate-200 hover:bg-slate-300 text-slate-800 rounded-xl text-xs font-bold flex items-center justify-center gap-1.5 transition-colors active:scale-98 touch-manipulation"
              >
                <RefreshCw className="w-4 h-4 text-slate-600" />
                <span>TOMAR OTRA FOTO</span>
              </button>
            </div>
          ) : (
            <button
              type="button"
              onClick={() => !disabled && afterInputRef.current?.click()}
              disabled={disabled}
              className={`w-full min-h-[120px] p-4 border-2 border-dashed border-slate-300 hover:border-emerald-500 rounded-xl flex flex-col items-center justify-center gap-2 bg-white hover:bg-slate-50 transition-all active:scale-98 touch-manipulation ${
                disabled ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'
              }`}
            >
              <div className="p-3 rounded-full bg-emerald-100 text-emerald-700">
                <Camera className="w-6 h-6" />
              </div>
              <div className="text-center">
                <span className="text-sm font-extrabold text-slate-800 block">
                  📷 TOMAR FOTO DESPUÉS
                </span>
                <span className="text-[11px] text-slate-400 mt-0.5 block">
                  Toca para abrir cámara o archivos
                </span>
              </div>
            </button>
          )}

          <input
            ref={afterInputRef}
            type="file"
            accept="image/*"
            capture="environment"
            className="hidden"
            onChange={(e) => handleFileSelected(e, 'after')}
            disabled={disabled}
          />
        </div>
      </div>
    </div>
  );
};

export default EvidenceCapture;
