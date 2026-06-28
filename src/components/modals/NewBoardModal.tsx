'use client';

import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  X, Layout, ChevronRight, Sparkles, Terminal, Zap,
  Cpu, BarChart, FileText, AlertTriangle, Wrench, LucideIcon
} from 'lucide-react';
import { useTemplates } from '@/hooks/useTemplates';

const ICON_MAP: Record<string, LucideIcon> = {
  layout:          Layout,
  tool:            Cpu,
  wrench:          Wrench,
  'file-text':     FileText,
  'alert-triangle': AlertTriangle,
  'bar-chart':     BarChart,
};

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

  const getTemplateIcon = (icon: string) => {
    const Icon = ICON_MAP[icon] ?? Layout;
    return <Icon size={18} />;
  };

  return (
    <AnimatePresence>
      {isOpen && (
        <div className="fixed inset-0 z-[120] flex items-center justify-center p-4">
          <motion.div 
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="absolute inset-0 bg-[var(--bg-primary)]/80 backdrop-blur-md"
            onClick={onClose}
          />
          
          <motion.div 
            initial={{ opacity: 0, scale: 0.95, y: 30 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: 30 }}
            className="relative bg-[var(--bg-primary)] w-full max-w-5xl rounded-[40px] shadow-[0_40px_120px_rgba(0,0,0,0.8)] overflow-hidden border border-[var(--border-color)] flex flex-col md:flex-row h-[650px]"
          >
            {/* Sidebar Technical Info */}
            <div className="md:w-[350px] bg-[var(--bg-secondary)] p-12 text-white flex flex-col relative overflow-hidden border-r border-[var(--border-color)]">
               <div className="absolute top-0 right-0 w-80 h-80 bg-[#3B7EF8]/10 blur-[120px] -translate-y-1/2 translate-x-1/2" />
               <div className="relative z-10 flex-1">
                  <div className="w-14 h-14 bg-[#3B7EF8]/10 rounded-2xl flex items-center justify-center mb-10 border border-[#3B7EF8]/20 shadow-2xl">
                     <Terminal className="text-[#3B7EF8] w-7 h-7" />
                  </div>
                  <span className="text-[10px] font-black uppercase tracking-[0.5em] text-[#3B7EF8] mb-4 block">System Initialize</span>
                  <h2 className="text-4xl font-black mb-8 leading-[1.1] tracking-tighter uppercase italic">Nuevo<br/>Proyecto.</h2>
                  <p className="text-slate-500 text-sm font-medium leading-relaxed max-w-[220px]">
                    Despliegue un nuevo entorno operativo con configuraciones pre-establecidas o arquitectura limpia.
                  </p>
               </div>
               
               <div className="relative z-10 space-y-6">
                  <StepIndicator active={step >= 1} label="Identificación" />
                  <StepIndicator active={step >= 2} label="Arquitectura" />
               </div>
            </div>

            {/* Content area */}
            <div className="flex-1 flex flex-col bg-[var(--bg-primary)] overflow-hidden">
              <div className="flex items-center justify-end p-8">
                <button onClick={onClose} className="p-3 bg-slate-500/5 hover:bg-rose-500/10 rounded-2xl text-slate-600 hover:text-rose-500 border border-[var(--border-color)] transition-all">
                  <X size={24} />
                </button>
              </div>

              <div className="flex-1 overflow-y-auto px-12 pb-12 custom-scrollbar">
                {step === 1 ? (
                  <motion.div 
                    initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }}
                    className="space-y-12"
                  >
                    <div>
                      <h3 className="text-3xl font-black text-white uppercase italic tracking-tight mb-4">¿Nombre del Entorno?</h3>
                      <p className="text-slate-500 font-medium tracking-tight">Especifique el descriptor de su nuevo flujo operativo.</p>
                    </div>
                    
                    <div className="space-y-4">
                       <label className="text-[10px] font-black text-slate-700 uppercase tracking-widest pl-1">Descriptor</label>
                       <input
                        autoFocus
                        value={boardName}
                        onChange={(e) => setBoardName(e.target.value)}
                        onKeyDown={(e) => e.key === 'Enter' && handleNext()}
                        placeholder="Ej: PLAN_MAESTRO_2026"
                        className="w-full text-4xl font-black text-white placeholder:text-slate-900 border-none focus:ring-0 p-0 bg-transparent uppercase italic tracking-tighter"
                      />
                    </div>

                    <button 
                      onClick={handleNext}
                      disabled={!boardName.trim()}
                      className="group flex items-center gap-4 bg-[#3B7EF8] text-white px-10 py-5 rounded-[2rem] text-xs font-black uppercase tracking-widest hover:bg-[#3B7EF8]/90 transition-all active:scale-95 disabled:opacity-30 shadow-2xl shadow-[#3B7EF8]/30 mt-8"
                    >
                      Continuar a Estructura
                      <ChevronRight size={18} className="group-hover:translate-x-2 transition-transform" />
                    </button>
                  </motion.div>
                ) : (
                  <motion.div 
                    initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }}
                    className="space-y-10"
                  >
                    <div>
                      <h3 className="text-3xl font-black text-white uppercase italic tracking-tight mb-4">Seleccione Estructura</h3>
                      <p className="text-slate-500 font-medium tracking-tight">Utilice una receta pre-configurada para una implementación rápida.</p>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                      <TemplateCard 
                         isSelected={!selectedTemplateId} 
                         onClick={() => setSelectedTemplateId(undefined)}
                         icon={<Layout size={20} />}
                         title="CLEAN_BUILD"
                         desc="Tablero desde cero"
                      />

                      {templates.map((template) => (
                        <TemplateCard
                          key={template.id}
                          isSelected={selectedTemplateId === template.id}
                          onClick={() => setSelectedTemplateId(template.id)}
                          icon={getTemplateIcon(template.icon)}
                          iconColor={template.color}
                          title={template.name.toUpperCase().replace(/ /g, '_')}
                          desc={template.description}
                        />
                      ))}
                    </div>

                    <div className="flex items-center justify-between pt-10 border-t border-[var(--border-color)] mt-auto">
                       <button onClick={() => setStep(1)} className="text-xs font-black text-slate-600 hover:text-white uppercase tracking-widest transition-colors">Volver</button>
                       <button 
                        onClick={handleCreate}
                        className="flex items-center gap-4 bg-[#10B981] text-white px-12 py-5 rounded-[2rem] text-xs font-black uppercase tracking-widest hover:bg-emerald-400 hover:shadow-[0_0_30px_rgba(16,185,129,0.4)] transition-all active:scale-95 shadow-xl shadow-emerald-500/20"
                      >
                        Inicializar Tablero
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

function StepIndicator({ active, label }: { active: boolean, label: string }) {
  return (
    <div className="flex items-center gap-4 group">
       <div className={`w-3 h-3 rounded-full border-2 transition-all duration-500 ${active ? 'bg-[#3B7EF8] border-[#3B7EF8] shadow-[0_0_15px_#3B7EF8]' : 'bg-transparent border-slate-800'}`} />
       <span className={`text-[11px] font-black uppercase tracking-[0.2em] transition-colors ${active ? 'text-white' : 'text-slate-700'}`}>{label}</span>
    </div>
  );
}

function TemplateCard({ isSelected, onClick, icon, iconColor, title, desc }: {
  isSelected: boolean;
  onClick: () => void;
  icon: React.ReactNode;
  iconColor?: string;
  title: string;
  desc: string;
}) {
  return (
    <button
      onClick={onClick}
      className={`p-6 rounded-[2rem] text-left transition-all duration-500 border-2 flex flex-col h-full relative group ${
        isSelected
          ? 'bg-[#3B7EF8]/5 border-[#3B7EF8] shadow-[0_0_40px_rgba(59,126,248,0.15)] scale-[1.03]'
          : 'bg-[var(--bg-secondary)]/30 border-[var(--border-color)] hover:border-slate-800'
      }`}
    >
      <div
        className="w-12 h-12 rounded-2xl flex items-center justify-center mb-6 transition-all duration-500 shadow-xl bg-[var(--bg-secondary)] border border-[var(--border-color)]"
        style={{ color: isSelected ? (iconColor ?? '#3B7EF8') : undefined }}
      >
        {icon}
      </div>
      <p className={`font-black text-sm mb-2 uppercase italic tracking-tight ${isSelected ? 'text-white font-mono' : 'text-slate-400'}`}>{title}</p>
      <p className="text-[10px] text-slate-600 font-bold uppercase tracking-widest leading-tight">{desc}</p>
      {isSelected && <div className="absolute top-4 right-4 text-[#3B7EF8] animate-pulse"><Zap size={14} fill="currentColor" /></div>}
    </button>
  );
}
