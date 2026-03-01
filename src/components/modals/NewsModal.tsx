'use client';

import { useState, useEffect, useRef } from 'react';
import { X, Camera, MapPin, UploadCloud, ChevronDown, Check } from 'lucide-react';
import Image from 'next/image';
import { motion, AnimatePresence } from 'framer-motion';
import { supabase } from '@/lib/supabaseClient';

interface NewsModalProps {
  isOpen: boolean;
  onClose: () => void;
}

interface Board {
  id: string;
  name: string;
}

interface Group {
  id: string;
  title: string;
  board_id: string;
}

export default function NewsModal({ isOpen, onClose }: NewsModalProps) {
  const [boards, setBoards] = useState<Board[]>([]);
  const [groups, setGroups] = useState<Group[]>([]);
  
  const [selectedBoardId, setSelectedBoardId] = useState<string>('');
  const [selectedGroupId, setSelectedGroupId] = useState<string>('');
  const [severity, setSeverity] = useState<string>('Low');
  const [type, setType] = useState<string>('General');
  const [observation, setObservation] = useState('');
  const [photos, setPhotos] = useState<File[]>([]);
  const [previews, setPreviews] = useState<string[]>([]);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Fetch Boards on mount
  useEffect(() => {
    if (isOpen) {
      const fetchBoards = async () => {
        const { data } = await supabase.from('boards').select('id, name').order('created_at');
        if (data) {
          setBoards(data);
          // Auto-select first if available
          if (data.length > 0 && !selectedBoardId) setSelectedBoardId(data[0].id);
        }
      };
      fetchBoards();
    }
  }, [isOpen]);

  // Fetch Groups when Board changes
  useEffect(() => {
    if (selectedBoardId) {
      const fetchGroups = async () => {
        const { data } = await supabase
          .from('groups')
          .select('id, title, board_id')
          .eq('board_id', selectedBoardId)
          .order('position');
        
        if (data) {
          setGroups(data);
          setSelectedGroupId(''); // Reset site selection
        }
      };
      fetchGroups();
    } else {
        setGroups([]);
    }
  }, [selectedBoardId]);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files) {
      const newFiles = Array.from(e.target.files);
      setPhotos(prev => [...prev, ...newFiles]);
      
      // Generate previews
      const newPreviews = newFiles.map(file => URL.createObjectURL(file));
      setPreviews(prev => [...prev, ...newPreviews]);
    }
  };

  const removePhoto = (index: number) => {
    setPhotos(prev => prev.filter((_, i) => i !== index));
    setPreviews(prev => prev.filter((_, i) => i !== index));
  };

  const handleSubmit = async () => {
    if (!selectedGroupId || !observation) return;
    
    setIsSubmitting(true);
    try {
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) throw new Error("No user logged in");

        const uploadedUrls: string[] = [];

        // Upload Photos
        for (const file of photos) {
            const fileExt = file.name.split('.').pop();
            const fileName = `${Date.now()}-${Math.random().toString(36).substring(2)}.${fileExt}`;
            const filePath = `incidents/${fileName}`;

            const { error: uploadError } = await supabase.storage
                .from('evidence') 
                .upload(filePath, file);

            if (uploadError) {
                console.error("Upload error:", uploadError);
            } else {
                 const { data: { publicUrl } } = supabase.storage.from('evidence').getPublicUrl(filePath);
                 uploadedUrls.push(publicUrl);
            }
        }

        // Insert Incident
        const { error } = await supabase.from('site_incidents').insert({
            board_id: selectedBoardId,
            group_id: selectedGroupId,
            user_id: user.id,
            description: observation,
            photos: uploadedUrls,
            severity,
            type,
            status: 'Open'
        });

        if (error) throw error;

        // Reset and Close
        onClose();
        setObservation('');
        setPhotos([]);
        setPreviews([]);
        setSeverity('Low');
        setType('General');
    } catch (err) {
        console.error("Error submitting news:", err);
        alert("Error al guardar la novedad. Verifica tu conexión o permisos.");
    } finally {
        setIsSubmitting(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-[110] flex items-center justify-center p-4">
      <motion.div 
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        exit={{ opacity: 0, scale: 0.95 }}
        className="bg-white rounded-2xl shadow-2xl w-full max-w-lg overflow-hidden border border-slate-200 flex flex-col max-h-[90vh]"
      >
        <div className="p-5 border-b border-slate-100 bg-slate-50/50 flex justify-between items-center">
             <h3 className="font-black text-slate-800 text-lg flex items-center gap-2">
                 <Camera className="text-primary" /> Reportar Novedad de Obra
             </h3>
             <button onClick={onClose} className="p-2 hover:bg-slate-200/50 rounded-full text-slate-400 transition-all">
                 <X size={20} />
             </button>
        </div>

        <div className="p-6 space-y-5 overflow-y-auto custom-scrollbar flex-1">
            {/* Project/Board Selection */}
            <div>
                <label className="text-xs font-bold text-slate-500 mb-1.5 block uppercase tracking-wider">Proyecto</label>
                <div className="relative">
                    <select 
                        value={selectedBoardId} 
                        onChange={(e) => setSelectedBoardId(e.target.value)}
                        className="w-full text-sm border-slate-200 rounded-xl focus:ring-primary focus:border-primary bg-slate-50/50 appearance-none p-3 font-medium text-slate-700"
                    >
                        {boards.map(b => <option key={b.id} value={b.id}>{b.name}</option>)}
                    </select>
                    <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none w-4 h-4" />
                </div>
            </div>

            {/* Site/Group Selection */}
            <div>
                <label className="text-xs font-bold text-slate-500 mb-1.5 block uppercase tracking-wider flex items-center gap-1">
                    <MapPin className="w-3 h-3" /> Sitio / Frente de Obra
                </label>
                <div className="relative">
                    <select 
                        value={selectedGroupId} 
                        onChange={(e) => setSelectedGroupId(e.target.value)}
                        disabled={!selectedBoardId}
                        className="w-full text-sm border-slate-200 rounded-xl focus:ring-primary focus:border-primary bg-slate-50/50 appearance-none p-3 font-medium text-slate-700 disabled:opacity-50"
                    >
                        <option value="">Seleccionar Sitio...</option>
                        {groups.map(g => <option key={g.id} value={g.id}>{g.title}</option>)}
                    </select>
                     <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none w-4 h-4" />
                </div>
            </div>

            {/* Severity and Type Selection Row */}
            <div className="grid grid-cols-2 gap-4">
                <div>
                    <label className="text-xs font-bold text-slate-500 mb-1.5 block uppercase tracking-wider">Severidad</label>
                    <div className="relative">
                        <select 
                            value={severity} 
                            onChange={(e) => setSeverity(e.target.value)}
                            className="w-full text-sm border-slate-200 rounded-xl focus:ring-primary focus:border-primary bg-slate-50/50 appearance-none p-3 font-medium text-slate-700"
                        >
                            <option value="Low">Baja</option>
                            <option value="Medium">Media</option>
                            <option value="Critical">Crítica</option>
                        </select>
                        <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none w-4 h-4" />
                    </div>
                </div>
                <div>
                    <label className="text-xs font-bold text-slate-500 mb-1.5 block uppercase tracking-wider">Tipo</label>
                    <div className="relative">
                        <select 
                            value={type} 
                            onChange={(e) => setType(e.target.value)}
                            className="w-full text-sm border-slate-200 rounded-xl focus:ring-primary focus:border-primary bg-slate-50/50 appearance-none p-3 font-medium text-slate-700"
                        >
                            <option value="General">General</option>
                            <option value="Safety">Seguridad (HSE)</option>
                            <option value="Quality">Calidad</option>
                            <option value="Delay">Retraso</option>
                            <option value="Environment">Ambiental</option>
                        </select>
                        <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none w-4 h-4" />
                    </div>
                </div>
            </div>

            {/* Photos */}
            <div>
                 <label className="text-xs font-bold text-slate-500 mb-1.5 block uppercase tracking-wider">Evidencia Fotográfica</label>
                 <div className="grid grid-cols-3 gap-3 mb-3">
                    {previews.map((src, idx) => (
                        <div key={idx} className="relative aspect-square rounded-lg overflow-hidden border border-slate-200 group">
                            <Image src={src} alt="Preview" fill className="object-cover" />
                            <button 
                                onClick={() => removePhoto(idx)}
                                className="absolute top-1 right-1 bg-black/50 hover:bg-red-500 text-white p-1 rounded-full opacity-0 group-hover:opacity-100 transition-all"
                            >
                                <X size={12} />
                            </button>
                        </div>
                    ))}
                    <label className="aspect-square border-2 border-dashed border-slate-300 hover:border-primary hover:bg-primary/5 rounded-lg flex flex-col items-center justify-center cursor-pointer transition-all text-slate-400 hover:text-primary">
                        <UploadCloud className="w-6 h-6 mb-1" />
                        <span className="text-[10px] font-bold">Subir</span>
                        <input type="file" multiple accept="image/*" onChange={handleFileChange} className="hidden" />
                    </label>
                 </div>
            </div>

            {/* Observation */}
            <div>
                <label className="text-xs font-bold text-slate-500 mb-1.5 block uppercase tracking-wider">Observación Detallada</label>
                <textarea 
                    value={observation} 
                    onChange={(e) => setObservation(e.target.value)}
                    rows={4}
                    className="w-full text-sm border-slate-200 rounded-xl focus:ring-primary focus:border-primary p-3 bg-slate-50/50 font-medium text-slate-700 placeholder:text-slate-400"
                    placeholder="Describe la situación, personal involucrado y acciones tomadas..."
                />
            </div>
        </div>

        <div className="p-5 bg-slate-50 flex justify-end gap-3 border-t border-slate-100">
            <button onClick={onClose} className="px-4 py-2 text-sm text-slate-500 hover:text-slate-800 font-bold transition-colors">Cancelar</button>
            <button 
                onClick={handleSubmit} 
                disabled={!selectedGroupId || !observation || isSubmitting}
                className="px-6 py-2 bg-primary hover:bg-[#23634c] text-white rounded-lg text-sm font-bold shadow-lg shadow-emerald-200 disabled:opacity-50 disabled:cursor-not-allowed transition-all flex items-center gap-2"
            >
                {isSubmitting ? 'Guardando...' : <><Check size={16} /> Entregar Reporte</>}
            </button>
        </div>

      </motion.div>
    </div>
  );
}
