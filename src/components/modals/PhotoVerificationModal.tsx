'use client';

import React, { useState, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { 
  X, Camera, Trash2, CheckCircle, Plus,
  Image as ImageIcon, Loader2, ShieldCheck, 
  Terminal, Maximize2, Download, Zap
} from 'lucide-react';
import Image from 'next/image';

interface PhotoVerificationModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSave: (photoUrl: string) => void;
  onDelete?: (photoUrl: string) => void;
  itemName: string;
  itemId: string | number;
  initialGallery?: string[];
  // Si se provee, sube el archivo de verdad y devuelve la URL persistente
  // (ej. useExecutionAttachments().uploadAttachment). Si se omite, conserva
  // el comportamiento original (blob local, no persiste) — no rompe a los
  // consumidores existentes que todavía no pasan esta prop.
  onUpload?: (file: File) => Promise<string>;
  // Oculta los controles de captura/agregar — para visores que solo revisan
  // evidencia ya subida (ej. Verificación del supervisor) y no deben crear
  // fotos locales sin persistir.
  readOnly?: boolean;
  // Estado técnico de sincronización por foto (Incremento 4c), keyed por la
  // misma URL de initialGallery. Opcional — los consumidores que no lo pasan
  // (ej. VerificationContainer, que solo muestra evidencia ya sincronizada)
  // simplemente no ven ningún indicador extra.
  galleryStatuses?: Record<string, 'pending' | 'syncing' | 'conflict'>;
}

export default function PhotoVerificationModal({
  isOpen,
  onClose,
  onSave,
  onDelete,
  itemName,
  itemId,
  initialGallery = [],
  onUpload,
  readOnly = false,
  galleryStatuses,
}: PhotoVerificationModalProps) {
  const [uploading, setUploading] = useState(false);
  const [selectedPhoto, setSelectedPhoto] = useState<string | null>(null);
  const [location, setLocation] = useState<{ lat: number, lng: number } | null>(null);
  const [timestamp, setTimestamp] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  // Deliberadamente sin `selectedPhoto` en las dependencias: este efecto debe
  // reaccionar a que la galería cambie de verdad (o el modal se abra), no a
  // que selectedPhoto se limpie por otra razón (ej. justo se borró la foto
  // seleccionada). Si `selectedPhoto` estuviera en las deps, un
  // setSelectedPhoto(null) intencional (borrar) dispararía este efecto antes
  // de que `initialGallery` reflejara la baja, reseleccionando la misma foto
  // que se acaba de pedir borrar — encontrado verificando el borrado de
  // evidencia offline (Incremento 3 del soporte offline).
  useEffect(() => {
    if (isOpen && initialGallery.length > 0 && !selectedPhoto) {
      setSelectedPhoto(initialGallery[0]);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen, initialGallery]);

  useEffect(() => {
    if (isOpen) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = '';
    }
    return () => { document.body.style.overflow = ''; };
  }, [isOpen]);

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setUploading(true);
    
    // Capturar Ubicación y Tiempo Real
    if (navigator.geolocation) {
        navigator.geolocation.getCurrentPosition((pos) => {
            setLocation({ lat: pos.coords.latitude, lng: pos.coords.longitude });
        }, (err) => console.log('Ubicación no disponible', err));
    }
    setTimestamp(new Date().toLocaleString('es-CO', { timeZone: 'America/Bogota' }));

    try {
      const url = onUpload ? await onUpload(file) : URL.createObjectURL(file);
      onSave(url);
      setSelectedPhoto(url);
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const handleCapture = () => {
    fileInputRef.current?.click();
  };

  if (!mounted) return null;

  return createPortal(
    <AnimatePresence>
      {isOpen && (
        <div key="photo-verify-modal-portal" className="fixed inset-0 z-[20000] flex items-center justify-center p-4 sm:p-6 overflow-hidden">
          <motion.div
            key="photo-verify-backdrop"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
            className="fixed inset-0 bg-slate-950/90 backdrop-blur-xl z-[20001] cursor-pointer"
          />

          <motion.div
            key="photo-verify-container"
            initial={{ scale: 0.9, opacity: 0, y: 20 }}
            animate={{ scale: 1, opacity: 1, y: 0 }}
            exit={{ scale: 0.9, opacity: 0, y: 20 }}
            className="relative w-full max-w-4xl bg-[#0B0E14] border border-white/10 rounded-[2.5rem] shadow-[0_40px_100px_rgba(0,0,0,0.8)] z-[20002] overflow-hidden flex flex-col max-h-[95vh]"
          >
            <div className="p-4 sm:p-8 border-b border-white/10 bg-white/5 flex items-center justify-between shrink-0">
               <div className="flex items-center space-x-3 sm:space-x-5">
                  <div className="w-12 h-12 sm:w-16 sm:h-16 rounded-xl sm:rounded-2xl bg-[#3B7EF8]/10 border border-[#3B7EF8]/20 flex items-center justify-center text-[#3B7EF8]">
                      <ShieldCheck className="w-6 h-6 sm:w-8 sm:h-8" />
                  </div>
                  <div>
                      <h2 className="text-xl sm:text-3xl font-black text-white italic uppercase tracking-tighter leading-none">Verificación de Foto</h2>
                      <div className="flex items-center gap-2 mt-2">
                         <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
                         <p className="text-[8px] sm:text-[10px] text-slate-500 font-black uppercase tracking-widest">Protocolo de Evidencia de Campo</p>
                      </div>
                  </div>
               </div>
               <button onClick={onClose} className="p-2 sm:p-3 bg-white/5 border border-white/10 rounded-xl text-slate-500 hover:text-white transition-all">
                  <X className="w-5 h-5 sm:w-6 sm:h-6" />
               </button>
            </div>

            <div className="flex-1 overflow-y-auto p-5 sm:p-10 flex flex-col lg:flex-row gap-6 sm:gap-10 custom-scrollbar">
                <div className="flex-1 min-w-0">
                    <div className="aspect-[4/3] rounded-[2rem] bg-slate-900 border border-white/5 relative overflow-hidden group shadow-inner">
                        {selectedPhoto ? (
                             <div key="photo-preview-box" className="relative w-full h-full">
                                <Image src={selectedPhoto} alt="Evidencia" fill className="object-contain p-4" unoptimized />
                                <div className="absolute inset-x-0 bottom-0 bg-black/60 backdrop-blur-md p-4 flex flex-col gap-1 border-t border-white/10">
                                    <div className="flex items-center justify-between">
                                        <div className="flex items-center gap-4">
                                            <button className="p-2 bg-white/10 rounded-lg text-white hover:bg-white/20 transition-all border border-white/10">
                                                <Maximize2 className="w-4 h-4" />
                                            </button>
                                            <div className="flex flex-col">
                                                <span className="text-[10px] font-black text-white uppercase tracking-widest">{timestamp || 'Generando...' }</span>
                                                <span className="text-[8px] font-mono text-emerald-400 font-bold italic">
                                                    {location ? `GPS: ${location.lat.toFixed(6)}, ${location.lng.toFixed(6)}` : 'Sincronizando GPS...'}
                                                </span>
                                            </div>
                                        </div>
                                        <div className="flex items-center gap-2">
                                            {onDelete && (
                                                <button 
                                                    onClick={() => { onDelete(selectedPhoto!); setSelectedPhoto(null); setLocation(null); setTimestamp(null); }}
                                                    className="p-2 bg-rose-500/20 rounded-lg text-rose-500 hover:bg-rose-500 hover:text-white transition-all border border-rose-500/30"
                                                >
                                                    <Trash2 className="w-4 h-4" />
                                                </button>
                                            )}
                                        </div>
                                    </div>
                                </div>
                             </div>
                        ) : (
                            <div key="photo-empty-state" className="absolute inset-0 flex flex-col items-center justify-center text-center p-6 space-y-4">
                                <div className="w-16 h-16 rounded-[1.5rem] bg-white/5 border border-white/10 flex items-center justify-center text-slate-700">
                                    <ImageIcon className="w-8 h-8" />
                                </div>
                                <div>
                                    <p className="text-base font-black text-slate-400 uppercase italic">Sin evidencia</p>
                                    {!readOnly && (
                                        <p className="text-[8px] text-slate-600 font-bold uppercase tracking-widest mt-2">Utilice el sensor de imagen para auditar</p>
                                    )}
                                </div>
                                {!readOnly && (
                                    <button
                                        onClick={handleCapture}
                                        className="px-6 py-3 bg-[#3B7EF8] text-white rounded-xl text-[9px] font-black uppercase tracking-widest hover:bg-[#2563EB] transition-all flex items-center gap-2"
                                    >
                                        <Camera className="w-4 h-4" /> Iniciar Captura
                                    </button>
                                )}
                            </div>
                        )}
                        
                        {uploading && (
                            <div key="photo-upload-overlay" className="absolute inset-0 bg-slate-950/80 backdrop-blur-sm flex flex-col items-center justify-center z-20">
                                <Loader2 className="w-10 h-10 text-[#3B7EF8] animate-spin mb-4" />
                                <p className="text-[9px] font-black text-[#3B7EF8] uppercase tracking-[0.4em]">Sincronizando...</p>
                            </div>
                        )}
                    </div>
                </div>

                <div className="w-full lg:w-80 flex flex-col shrink-0">
                    <div className="flex items-center justify-between mb-4">
                        <p className="text-[9px] font-black text-slate-500 uppercase tracking-widest flex items-center gap-2">
                           <Zap className="w-3 h-3 text-amber-500" /> Historial
                        </p>
                        <span className="text-[8px] font-black text-white px-2 py-0.5 rounded-md bg-white/5 border border-white/10">{initialGallery.length || 0}/12</span>
                    </div>

                    <div className="grid grid-cols-4 lg:grid-cols-2 gap-2 mb-6">
                        {initialGallery.map((url, i) => {
                            const status = galleryStatuses?.[url];
                            return (
                            <button
                                key={`evidence-slot-${i}`}
                                onClick={() => setSelectedPhoto(url)}
                                className={`aspect-square rounded-xl overflow-hidden border-2 transition-all relative ${selectedPhoto === url ? 'border-[#3B7EF8]' : 'border-white/5 hover:border-white/20'}`}
                            >
                                <Image src={url} alt={`Evidencia ${i}`} fill className="object-cover" unoptimized />
                                {status && (
                                    <span
                                        title={status === 'conflict' ? 'Conflicto' : status === 'syncing' ? 'Sincronizando' : 'Pendiente de sincronizar'}
                                        className={`absolute top-1 right-1 w-2.5 h-2.5 rounded-full border border-white/80 ${
                                            status === 'conflict' ? 'bg-rose-500' : status === 'syncing' ? 'bg-blue-400 animate-pulse' : 'bg-amber-400'
                                        }`}
                                    />
                                )}
                            </button>
                            );
                        })}
                        {!readOnly && (
                            <button
                                key="add-evidence-slot"
                                onClick={handleCapture}
                                className="aspect-square rounded-xl bg-white/5 border border-dashed border-white/10 flex flex-col items-center justify-center text-slate-600 hover:text-[#3B7EF8] transition-all"
                            >
                                <Plus className="w-5 h-5 mb-1" />
                                <span className="text-[7px] font-black uppercase truncate px-1 text-center">Añadir</span>
                            </button>
                        )}
                    </div>

                    <div className="mt-auto bg-white/5 p-4 rounded-[1.5rem] border border-white/10 space-y-3">
                        <div className="flex items-center gap-3">
                            <Terminal className="w-3.5 h-3.5 text-slate-600" />
                            <span className="text-[8px] font-black text-slate-500 uppercase">Metadatos</span>
                        </div>
                        <div className="space-y-2">
                            <div>
                                <p className="text-[7px] text-slate-700 uppercase font-black tracking-widest leading-none mb-1">Actividad</p>
                                <p className="text-[11px] font-bold text-white uppercase">{itemName}</p>
                            </div>
                        </div>
                    </div>
                </div>
            </div>

            <div className="p-6 bg-white/5 border-t border-white/10 flex items-center justify-between relative shrink-0">
                <div className="flex items-center space-x-3 opacity-40">
                    {(selectedPhoto || initialGallery.length > 0) && (
                      <>
                        <ShieldCheck className="w-4 h-4 text-emerald-500" />
                        <span className="text-[9px] font-black text-slate-600 uppercase tracking-widest">Auditado</span>
                      </>
                    )}
                </div>
                <div className="flex items-center gap-6">
                    <button onClick={onClose} className="text-[9px] font-black text-slate-700 hover:text-white uppercase transition-colors">
                        {readOnly ? 'Cerrar' : 'Cancelar'}
                    </button>
                    {!readOnly && (
                        <button
                            onClick={() => selectedPhoto && onSave(selectedPhoto)}
                            disabled={!selectedPhoto && initialGallery.length === 0}
                            className="px-6 py-3 bg-[#10B981] text-white rounded-xl text-[9px] font-black uppercase tracking-widest shadow-xl shadow-[#10B981]/20 disabled:opacity-20"
                        >
                            Confirmar
                        </button>
                    )}
                </div>
            </div>

            <input 
                type="file" 
                ref={fileInputRef} 
                onChange={handleFileSelect} 
                className="hidden" 
                accept="image/*"
                capture="environment"
            />
          </motion.div>
        </div>
      )}
    </AnimatePresence>,
    document.body
  );
}
