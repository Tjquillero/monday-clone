'use client';

import { useState, useEffect } from 'react';
import { 
  X, Target, Calendar, Globe, Lock, ArrowRight, 
  Save, Trash2, PieChart, TrendingUp, Sparkles, ChevronRight
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { supabase } from '@/lib/supabaseClient';
import { useAuth } from '@/contexts/AuthContext';
import { useQueryClient } from '@tanstack/react-query';

interface OkrModalProps {
  isOpen: boolean;
  onClose: () => void;
  okr?: any; // If provided, we're editing
}

export default function OkrModal({ isOpen, onClose, okr }: OkrModalProps) {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [isSubmitting, setIsSubmitting] = useState(false);
  
  const [formData, setFormData] = useState({
    title: '',
    description: '',
    target_date: new Date().toISOString().split('T')[0],
    icon: '🎯',
    color: '#3b82f6',
    visibility: 'general' as 'personal' | 'general'
  });

  useEffect(() => {
    if (okr) {
      setFormData({
        title: okr.title || '',
        description: okr.description || '',
        target_date: okr.target_date || new Date().toISOString().split('T')[0],
        icon: okr.icon || '🎯',
        color: okr.color || '#3b82f6',
        visibility: okr.visibility || 'general'
      });
    } else {
      setFormData({
        title: '',
        description: '',
        target_date: new Date().toISOString().split('T')[0],
        icon: '🎯',
        color: '#3b82f6',
        visibility: 'general'
      });
    }
  }, [okr, isOpen]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return;
    
    setIsSubmitting(true);
    try {
      if (okr) {
        const { error } = await supabase
          .from('okrs')
          .update({
            ...formData,
            updated_at: new Date().toISOString()
          })
          .eq('id', okr.id);
        if (error) throw error;
      } else {
        const { error } = await supabase
          .from('okrs')
          .insert({
            ...formData,
            owner_id: user.id,
            progress: 0,
            status: 'active'
          });
        if (error) throw error;
      }
      
      queryClient.invalidateQueries({ queryKey: ['okrs'] });
      onClose();
    } catch (error) {
      console.error('Error saving OKR:', error);
      alert('Error al guardar el objetivo');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <AnimatePresence>
      {isOpen && (
        <div className="fixed inset-0 z-[110] flex items-center justify-center p-4 bg-slate-900/40 backdrop-blur-sm animate-in fade-in duration-300">
          <motion.div 
            initial={{ opacity: 0, scale: 0.95, y: 20 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: 20 }}
            className="bg-white w-full max-w-2xl rounded-[2.5rem] shadow-[0_32px_128px_-16px_rgba(0,0,0,0.3)] overflow-hidden border border-white"
          >
            {/* Header */}
            <div className="relative h-32 bg-slate-900 flex items-end p-8 overflow-hidden">
              <div className="absolute inset-0 opacity-20">
                <div className="absolute top-0 left-0 w-64 h-64 bg-primary/40 blur-[100px] -translate-x-1/2 -translate-y-1/2" />
                <div className="absolute bottom-0 right-0 w-64 h-64 bg-blue-500/40 blur-[100px] translate-x-1/2 translate-y-1/2" />
              </div>
              <div className="relative z-10 flex items-center justify-between w-full">
                <div className="flex items-center gap-4">
                  <div className="w-12 h-12 rounded-2xl bg-white/10 backdrop-blur-md flex items-center justify-center border border-white/10">
                    <Target className="text-white w-6 h-6" />
                  </div>
                  <h2 className="text-2xl font-black text-white tracking-tight">
                    {okr ? 'Editar Objetivo' : 'Nuevo Objetivo Estratégico'}
                  </h2>
                </div>
                <button onClick={onClose} className="p-2 hover:bg-white/10 rounded-full text-white/50 hover:text-white transition-colors">
                  <X size={24} />
                </button>
              </div>
            </div>

            <form onSubmit={handleSubmit} className="p-8 space-y-8">
              {/* Title Section */}
              <div className="space-y-4">
                <div className="flex items-center gap-2 text-[10px] font-black text-slate-400 uppercase tracking-widest">
                  <Sparkles size={12} className="text-amber-400" />
                  Nombre del Objetivo
                </div>
                <input
                  autoFocus
                  required
                  value={formData.title}
                  onChange={(e) => setFormData({ ...formData, title: e.target.value })}
                  placeholder="Ej: Aumentar eficiencia operativa en 20%"
                  className="w-full text-2xl font-bold text-slate-800 placeholder:text-slate-200 border-none focus:ring-0 p-0"
                />
              </div>

              {/* Grid 2 Columns */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                {/* Icon & Color */}
                <div className="space-y-4">
                  <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest block">Ícono y Identidad</label>
                  <div className="flex items-center gap-3">
                    <div className="grid grid-cols-4 gap-2 p-2 bg-slate-50 rounded-2xl border-2 border-slate-100">
                      {['🎯', '🚀', '📈', '🏢', '🏗️', '🏖️', '🌿', '💎'].map((emoji) => (
                        <button
                          key={emoji}
                          type="button"
                          onClick={() => setFormData({...formData, icon: emoji})}
                          className={`w-8 h-8 flex items-center justify-center rounded-lg text-lg transition-all ${
                            formData.icon === emoji 
                              ? 'bg-primary text-white scale-110 shadow-sm' 
                              : 'hover:bg-slate-200 grayscale-[0.5] hover:grayscale-0'
                          }`}
                        >
                          {emoji}
                        </button>
                      ))}
                    </div>
                    <input
                      type="color"
                      value={formData.color}
                      onChange={(e) => setFormData({...formData, color: e.target.value})}
                      className="w-12 h-12 rounded-xl border-2 border-slate-100 p-1 cursor-pointer"
                    />
                  </div>
                </div>

                {/* Target Date */}
                <div className="space-y-4">
                  <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest block">Fecha Límite</label>
                  <div className="relative">
                    <Calendar className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
                    <input
                      type="date"
                      value={formData.target_date}
                      onChange={(e) => setFormData({ ...formData, target_date: e.target.value })}
                      className="w-full pl-12 pr-4 py-3 bg-slate-50 border-2 border-slate-100 rounded-2xl font-bold text-slate-700 focus:border-primary transition-colors outline-none"
                    />
                  </div>
                </div>
              </div>

              {/* Description */}
              <div className="space-y-4">
                <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest block">Descripción y Contexto</label>
                <textarea
                  value={formData.description}
                  onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                  placeholder="Describe cómo planeas alcanzar este objetivo y por qué es importante..."
                  rows={3}
                  className="w-full p-5 bg-slate-50 border-2 border-slate-100 rounded-2xl font-medium text-slate-600 focus:border-primary transition-colors outline-none resize-none"
                />
              </div>

              {/* Visibility Choice */}
              <div className="flex bg-slate-100 p-1 rounded-2xl w-fit">
                <button
                  type="button"
                  onClick={() => setFormData({...formData, visibility: 'general'})}
                  className={`px-6 py-2 rounded-xl text-xs font-black uppercase tracking-widest flex items-center gap-2 transition-all ${
                    formData.visibility === 'general' ? 'bg-white shadow-sm text-primary' : 'text-slate-500 hover:text-slate-800'
                  }`}
                >
                  <Globe size={14} /> General
                </button>
                <button
                  type="button"
                  onClick={() => setFormData({...formData, visibility: 'personal'})}
                  className={`px-6 py-2 rounded-xl text-xs font-black uppercase tracking-widest flex items-center gap-2 transition-all ${
                    formData.visibility === 'personal' ? 'bg-white shadow-sm text-primary' : 'text-slate-500 hover:text-slate-800'
                  }`}
                >
                  <Lock size={14} /> Personal
                </button>
              </div>

              {/* Footer Actions */}
              <div className="flex border-t border-slate-100 pt-8 flex items-center justify-end gap-4">
                 <button 
                  type="button"
                  onClick={onClose}
                  className="px-6 py-3 text-sm font-bold text-slate-400 hover:text-slate-600 transition-colors"
                >
                  Cancelar
                </button>
                <button 
                  type="submit"
                  disabled={isSubmitting}
                  className="flex items-center gap-3 bg-primary text-white px-8 py-4 rounded-2xl font-black hover:shadow-2xl hover:shadow-primary/30 transition-all active:scale-95 shadow-xl shadow-primary/20 disabled:opacity-50 group"
                >
                  {isSubmitting ? (
                    <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                  ) : (
                    <>
                      <Save size={20} />
                      <span>{okr ? 'Guardar Cambios' : 'Lanzar Objetivo'}</span>
                    </>
                  )}
                </button>
              </div>
            </form>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
}
