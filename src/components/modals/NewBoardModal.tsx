'use client';

import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { 
  X, Plus, Layout, Check, ChevronRight, Sparkles, FolderPlus,
  Briefcase, Sun, BarChart
} from 'lucide-react';
import { useTemplates } from '@/hooks/useTemplates';

interface NewBoardModalProps {
  isOpen: boolean;
  onClose: () => void;
  onCreate: (name: string, templateId?: string) => void;
}

export default function NewBoardModal({ isOpen, onClose, onCreate }: NewBoardModalProps) {
  const [step, setStep] = useState(1);
  const [boardName, setBoardName] = useState('');
  const [selectedTemplateId, setSelectedTemplateId] = useState<string | undefined>();
  const { templates, isLoading } = useTemplates();

  const handleNext = () => {
    if (step === 1 && boardName.trim()) setStep(2);
  };

  const handleCreate = () => {
    if (boardName.trim()) {
      onCreate(boardName, selectedTemplateId);
      setBoardName('');
      setSelectedTemplateId(undefined);
      setStep(1);
      onClose();
    }
  };

  const getTemplateEmoji = (name: string) => {
    if (name.includes('Construcción')) return '🏗️';
    if (name.includes('Mantenimiento')) return '🛠️';
    if (name.includes('Playa')) return '🏖️';
    if (name.includes('Financiero')) return '💰';
    return '✨';
  };

  return (
    <AnimatePresence>
      {isOpen && (
        <div className="fixed inset-0 z-[120] flex items-center justify-center p-4 bg-slate-900/40 backdrop-blur-sm animate-in fade-in duration-300">
          <motion.div 
            initial={{ opacity: 0, scale: 0.95, y: 20 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: 20 }}
            className="bg-white w-full max-w-4xl rounded-[3rem] shadow-[0_32px_128px_-16px_rgba(0,0,0,0.3)] overflow-hidden border border-white flex flex-col md:flex-row h-[600px]"
          >
            {/* Sidebar info */}
            <div className="md:w-[320px] bg-slate-900 p-10 text-white flex flex-col relative overflow-hidden">
               <div className="absolute top-0 right-0 w-64 h-64 bg-primary/20 blur-[100px] -translate-y-1/2 translate-x-1/2" />
               <div className="relative z-10 flex-1">
                  <div className="w-12 h-12 bg-white/10 rounded-2xl flex items-center justify-center mb-8 backdrop-blur-md">
                     <Layout className="text-white w-6 h-6" />
                  </div>
                  <h2 className="text-3xl font-black mb-6 leading-tight">Crea tu nuevo espacio de trabajo</h2>
                  <p className="text-slate-400 text-sm font-medium leading-relaxed">
                    Personaliza tu flujo de trabajo desde cero o utiliza una de nuestras plantillas optimizadas para resultados inmediatos.
                  </p>
               </div>
               <div className="relative z-10 space-y-4">
                  <div className="flex items-center gap-3 text-xs font-bold text-slate-500">
                     <div className={`w-2 h-2 rounded-full ${step >= 1 ? 'bg-primary' : 'bg-slate-700'}`} />
                     Nombre del Tablero
                  </div>
                  <div className="flex items-center gap-3 text-xs font-bold text-slate-500">
                     <div className={`w-2 h-2 rounded-full ${step >= 2 ? 'bg-primary' : 'bg-slate-700'}`} />
                     Seleccionar Plantilla
                  </div>
               </div>
            </div>

            {/* Content area */}
            <div className="flex-1 flex flex-col bg-white overflow-hidden">
              <div className="flex items-center justify-end p-6">
                <button onClick={onClose} className="p-2 hover:bg-slate-100 rounded-full text-slate-400 transition-colors">
                  <X size={24} />
                </button>
              </div>

              <div className="flex-1 overflow-y-auto px-10 pb-10 custom-scrollbar">
                {step === 1 ? (
                  <motion.div 
                    initial={{ opacity: 0, x: 20 }}
                    animate={{ opacity: 1, x: 0 }}
                    className="space-y-8"
                  >
                    <div>
                      <h3 className="text-2xl font-black text-slate-800 mb-2">¿Cómo se llamará tu tablero?</h3>
                      <p className="text-slate-400 text-sm font-medium">Puedes cambiar esto más adelante en la configuración.</p>
                    </div>
                    
                    <div className="space-y-4">
                       <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Nombre del Proyecto</label>
                       <input
                        autoFocus
                        value={boardName}
                        onChange={(e) => setBoardName(e.target.value)}
                        onKeyDown={(e) => e.key === 'Enter' && handleNext()}
                        placeholder="Ej: Plan Maestro 2026, Renovación de Playa..."
                        className="w-full text-2xl font-bold text-slate-800 placeholder:text-slate-200 border-none focus:ring-0 p-0"
                      />
                    </div>

                    <button 
                      onClick={handleNext}
                      disabled={!boardName.trim()}
                      className="group flex items-center gap-3 bg-slate-900 text-white px-8 py-4 rounded-2xl font-black hover:bg-slate-800 transition-all active:scale-95 disabled:opacity-50"
                    >
                      Continuar
                      <ChevronRight size={20} className="group-hover:translate-x-1 transition-transform" />
                    </button>
                  </motion.div>
                ) : (
                  <motion.div 
                    initial={{ opacity: 0, x: 20 }}
                    animate={{ opacity: 1, x: 0 }}
                    className="space-y-8"
                  >
                    <div>
                      <h3 className="text-2xl font-black text-slate-800 mb-2">Elige un punto de partida</h3>
                      <p className="text-slate-400 text-sm font-medium">Selecciona una plantilla o empieza desde cero.</p>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                      <button
                        onClick={() => setSelectedTemplateId(undefined)}
                        className={`p-5 rounded-2xl text-left transition-all duration-300 border-2 flex flex-col h-full ${
                          !selectedTemplateId 
                            ? 'bg-primary/5 border-primary shadow-lg shadow-primary/5 scale-[1.02]' 
                            : 'bg-white border-slate-100 hover:border-slate-300'
                        }`}
                      >
                        <div className={`w-10 h-10 rounded-xl flex items-center justify-center mb-4 text-xl ${
                          !selectedTemplateId ? 'bg-primary text-white' : 'bg-slate-100 shadow-inner'
                        }`}>
                          <Layout size={20} />
                        </div>
                        <p className="font-black text-slate-800 text-sm mb-1">Desde cero</p>
                        <p className="text-[10px] text-slate-400 font-bold uppercase leading-tight">Tablero vacío y flexible</p>
                      </button>

                      {templates.map((template) => {
                        const isSelected = selectedTemplateId === template.id;
                        return (
                          <button
                            key={template.id}
                            onClick={() => setSelectedTemplateId(template.id)}
                            className={`p-5 rounded-2xl text-left transition-all duration-300 border-2 flex flex-col h-full ${
                              isSelected 
                                ? 'bg-primary/5 border-primary shadow-lg shadow-primary/5 scale-[1.02]' 
                                : 'bg-white border-slate-100 hover:border-slate-300'
                            }`}
                          >
                            <div className={`w-10 h-10 rounded-xl flex items-center justify-center mb-4 text-xl ${
                              isSelected ? 'bg-primary text-white' : 'bg-slate-100 shadow-inner'
                            }`}>
                              {getTemplateEmoji(template.name)}
                            </div>
                            <p className="font-black text-slate-800 text-sm mb-1">{template.name}</p>
                            <p className="text-[10px] text-slate-400 font-bold uppercase leading-tight truncate w-full">Optimizado para {template.name.split(' ')[0]}</p>
                          </button>
                        );
                      })}
                    </div>

                    <div className="flex items-center justify-between pt-6 border-t border-slate-100">
                       <button onClick={() => setStep(1)} className="text-sm font-black text-slate-400 hover:text-slate-800">Atrás</button>
                       <button 
                        onClick={handleCreate}
                        className="flex items-center gap-3 bg-primary text-white px-10 py-4 rounded-2xl font-black hover:shadow-2xl hover:shadow-primary/30 transition-all active:scale-95 shadow-xl shadow-primary/20"
                      >
                        Crear Tablero
                        <Sparkles size={18} />
                      </button>
                    </div>
                  </motion.div>
                )}
              </div>
            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
}
