'use client';

import { useState, useRef } from 'react';
import { X, AlertTriangle, Camera, Check } from 'lucide-react';
import Image from 'next/image';
import { motion, AnimatePresence } from 'framer-motion';
import { Incident } from '@/types/monday';

interface IncidentModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSave: (incident: Omit<Incident, 'id' | 'date'>) => void;
  itemName: string;
}

export default function IncidentModal({ isOpen, onClose, onSave, itemName }: IncidentModalProps) {
  const [type, setType] = useState('Quality');
  const [description, setDescription] = useState('');
  const [severity, setSeverity] = useState<'Low' | 'Medium' | 'Critical'>('Low');
  const [photo, setPhoto] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  if (!isOpen) return null;

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onloadend = () => {
        setPhoto(reader.result as string);
      };
      reader.readAsDataURL(file);
    }
  };

  const handleSubmit = () => {
      onSave({ type, description, severity, photo: photo || undefined });
      // Reset
      setDescription('');
      setPhoto(null);
      setType('Quality');
      setSeverity('Low');
  };

  return (
    <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-[110] flex items-center justify-center p-4">
      <motion.div 
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        exit={{ opacity: 0, scale: 0.95 }}
        className="bg-white rounded-2xl shadow-2xl w-full max-w-md overflow-hidden border border-slate-200"
      >
        <div className="p-6 border-b border-slate-100 bg-rose-50/20 flex justify-between items-center">
             <div className="flex items-center gap-3">
                 <div className="w-10 h-10 bg-rose-100 rounded-xl flex items-center justify-center text-rose-500 shadow-sm border border-rose-200">
                     <AlertTriangle size={20} />
                 </div>
                 <div>
                     <h3 className="font-bold text-slate-800">Reportar Incidencia</h3>
                     <p className="text-xs text-slate-400 font-medium truncate max-w-[200px]">{itemName}</p>
                 </div>
             </div>
             <button onClick={onClose} className="p-2 hover:bg-white hover:shadow-sm rounded-lg text-slate-400 transition-all">
                 <X size={20} />
             </button>
        </div>

        <div className="p-6 space-y-4">
            {/* Type & Severity */}
            <div className="grid grid-cols-2 gap-4">
                <div>
                    <label className="text-xs font-bold text-slate-500 mb-1 block">Tipo de Problema</label>
                    <select 
                        value={type} onChange={(e) => setType(e.target.value)}
                        className="w-full text-sm border-slate-200 rounded-lg focus:ring-rose-500 focus:border-rose-500 bg-slate-50/50"
                    >
                        <option value="Quality">Calidad</option>
                        <option value="Delay">Retraso</option>
                        <option value="Safety">Seguridad</option>
                        <option value="Weather">Clima</option>
                        <option value="Other">Otro</option>
                    </select>
                </div>
                <div>
                    <label className="text-xs font-bold text-slate-500 mb-1 block">Severidad</label>
                    <select 
                        value={severity} onChange={(e) => setSeverity(e.target.value as 'Low' | 'Medium' | 'Critical')}
                        className="w-full text-sm border-slate-200 rounded-lg focus:ring-rose-500 focus:border-rose-500 bg-slate-50/50"
                    >
                        <option value="Low">Baja</option>
                        <option value="Medium">Media</option>
                        <option value="Critical">Crítica</option>
                    </select>
                </div>
            </div>

            {/* Description */}
            <div>
                <label className="text-xs font-bold text-slate-500 mb-1 block">Descripción del Evento</label>
                <textarea 
                    value={description} onChange={(e) => setDescription(e.target.value)}
                    rows={3}
                    className="w-full text-sm border-slate-200 rounded-xl focus:ring-rose-500 focus:border-rose-500 p-3 bg-slate-50/50"
                    placeholder="Detalla lo ocurrido..."
                />
            </div>

            {/* Photo Evidence */}
            <div 
                onClick={() => fileInputRef.current?.click()}
                className={`h-32 border-2 border-dashed rounded-xl flex items-center justify-center cursor-pointer transition-all relative overflow-hidden ${photo ? 'border-emerald-400' : 'border-slate-200 hover:border-rose-300 bg-slate-50/30'}`}
            >
                {photo ? (
                    <div className="relative w-full h-full">
                        <Image src={photo} alt="Incident" fill className="object-cover" unoptimized />
                    </div>
                ) : (
                    <div className="flex flex-col items-center text-slate-400">
                        <Camera size={24} />
                        <span className="text-xs font-bold mt-2">Adjuntar Evidencia</span>
                    </div>
                )}
                <input type="file" ref={fileInputRef} onChange={handleFileChange} accept="image/*" className="hidden" />
            </div>
        </div>

        <div className="p-4 bg-slate-50 flex justify-end gap-3 border-t border-slate-100">
            <button onClick={onClose} className="px-4 py-2 text-sm text-slate-500 hover:text-slate-800 font-bold transition-colors">Cancelar</button>
            <button 
                onClick={handleSubmit} 
                disabled={!description}
                className="px-6 py-2 bg-rose-500 hover:bg-rose-600 text-white rounded-lg text-sm font-bold shadow-lg shadow-rose-200 disabled:opacity-50 disabled:cursor-not-allowed transition-all"
            >
                Registrar Incidencia
            </button>
        </div>
      </motion.div>
    </div>
  );
}
