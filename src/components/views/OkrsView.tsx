'use client';

import { useState } from 'react';
import { 
  Target, TrendingUp, Calendar, ChevronRight, Plus, 
  Users, Lock, MoreVertical, ExternalLink 
} from 'lucide-react';
import { useOkrs, OKR } from '@/hooks/useOkrs';
import { motion } from 'framer-motion';
import OkrModal from '@/components/modals/OkrModal';
import Link from 'next/link';

export default function OkrsView() {
  const { okrs, isLoading, deleteOkr } = useOkrs();
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingOkr, setEditingOkr] = useState<OKR | null>(null);

  const handleEdit = (okr: OKR) => {
    setEditingOkr(okr);
    setIsModalOpen(true);
  };

  const handleDelete = (id: string) => {
    if (confirm('¿Estás seguro de eliminar este objetivo?')) {
      deleteOkr.mutate(id);
    }
  };

  if (isLoading) return <div className="p-8 text-center text-slate-400 font-medium">Cargando objetivos externos...</div>;

  return (
    <div className="p-4 md:p-8 max-w-7xl mx-auto min-h-screen">
      <div className="flex items-center justify-between mb-10">
        <div>
          <h1 className="text-3xl font-black text-slate-800 tracking-tight flex items-center gap-3">
             <Target className="text-primary w-8 h-8" />
             Objetivos Estratégicos
          </h1>
          <p className="text-slate-500 font-medium mt-1">Conecta tus metas de alto nivel con el trabajo operativo diario.</p>
        </div>
        <button 
          onClick={() => { setEditingOkr(null); setIsModalOpen(true); }}
          className="flex items-center gap-2 bg-primary text-white px-6 py-3 rounded-2xl font-bold hover:shadow-lg hover:shadow-primary/30 transition-all active:scale-95"
        >
          <Plus size={20} />
          Nuevo Objetivo
        </button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {okrs.length === 0 ? (
          <div className="col-span-full py-20 bg-white rounded-[2rem] border-2 border-dashed border-slate-200 flex flex-col items-center justify-center text-center">
             <div className="w-20 h-20 bg-slate-50 rounded-full flex items-center justify-center mb-6">
                <Target className="w-10 h-10 text-slate-200" />
             </div>
             <p className="text-xl font-bold text-slate-400">No hay objetivos creados</p>
             <p className="text-slate-300 max-w-xs mt-2">Crea tu primer OKR para empezar a medir el éxito de tus proyectos.</p>
          </div>
        ) : (
          okrs.map((okr, index) => (
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: index * 0.1 }}
              key={okr.id}
              className="bg-white rounded-[2.5rem] p-6 shadow-sm border border-slate-100 hover:shadow-xl hover:shadow-slate-200/50 transition-all group"
            >
              <div className="flex items-start justify-between mb-6">
                <div className="flex items-center gap-4">
                  <div className="w-12 h-12 rounded-2xl flex items-center justify-center text-2xl shadow-inner bg-slate-50">
                    {okr.icon || '🚀'}
                  </div>
                  <div>
                    <h3 className="font-bold text-slate-800 text-lg leading-tight flex items-center gap-2">
                       {okr.title}
                       {okr.visibility === 'personal' ? (
                          <Lock size={12} className="text-amber-500" />
                       ) : (
                          <Users size={12} className="text-emerald-500" />
                       )}
                    </h3>
                    <p className="text-[10px] font-black text-slate-300 uppercase tracking-widest mt-1">OKR ESTRATÉGICO</p>
                  </div>
                </div>
                <button className="text-slate-300 hover:text-slate-600 p-1">
                   <MoreVertical size={20} />
                </button>
              </div>

              <div className="mb-8">
                <div className="flex items-center justify-between mb-3">
                  <span className="text-sm font-black text-slate-400 uppercase tracking-wider">Progreso</span>
                  <div className="flex items-center gap-2">
                    <span className="text-lg font-black text-primary">{okr.progress}%</span>
                  </div>
                </div>
                <div className="h-3 bg-slate-100 rounded-full overflow-hidden">
                  <motion.div 
                    initial={{ width: 0 }}
                    animate={{ width: `${okr.progress}%` }}
                    transition={{ duration: 1, ease: 'easeOut' }}
                    className="h-full bg-primary"
                    style={{ backgroundColor: okr.color || 'var(--color-primary)' }}
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4 mb-8">
                 <div className="p-3 bg-slate-50 rounded-2xl border border-slate-100">
                    <div className="flex items-center gap-2 text-slate-400 mb-1">
                       <TrendingUp size={12} />
                       <span className="text-[9px] font-black uppercase tracking-widest">Inpacto</span>
                    </div>
                    <p className="text-xs font-bold text-slate-600">Alta Prioridad</p>
                 </div>
                 <div className="p-3 bg-slate-50 rounded-2xl border border-slate-100">
                    <div className="flex items-center gap-2 text-slate-400 mb-1">
                       <Calendar size={12} />
                       <span className="text-[9px] font-black uppercase tracking-widest">Meta</span>
                    </div>
                    <p className="text-xs font-bold text-slate-600">{new Date(okr.target_date).toLocaleDateString()}</p>
                 </div>
              </div>

              <div className="pt-6 border-t border-slate-100 flex items-center justify-between">
                 <div className="flex -space-x-2">
                    <div className="w-8 h-8 rounded-full border-2 border-white bg-indigo-500 text-[10px] text-white flex items-center justify-center font-bold">JD</div>
                    <div className="w-8 h-8 rounded-full border-2 border-white bg-emerald-500 text-[10px] text-white flex items-center justify-center font-bold">MP</div>
                 </div>
                 <button 
                  onClick={() => handleEdit(okr)}
                  className="flex items-center gap-1 text-primary text-sm font-bold hover:underline"
                 >
                    Detalles
                    <ChevronRight size={16} />
                 </button>
              </div>
            </motion.div>
          ))
        )}
      </div>

      <OkrModal 
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        okr={editingOkr}
      />
    </div>
  );
}
