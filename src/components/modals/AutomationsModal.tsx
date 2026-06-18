'use client';

import { motion, AnimatePresence } from 'framer-motion';
import { X, Zap, ArrowRight, CheckCircle2, Bell, Plus, Trash2, ToggleLeft, ToggleRight, ShieldAlert, Settings, Package, Cpu } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { useState } from 'react';
import { useAutomations } from '@/hooks/useAutomations';
import { useBoardColumns } from '@/hooks/useBoardData';

interface AutomationsModalProps {
  isOpen: boolean;
  onClose: () => void;
  boardId?: string;
}

export default function AutomationsModal({ isOpen, onClose, boardId }: AutomationsModalProps) {
  const [activeTab, setActiveTab] = useState<'browse' | 'create'>('browse');
  const { rules, isLoading, createRule, deleteRule, toggleRule } = useAutomations(boardId);
  const { data: columns } = useBoardColumns(boardId);

  // Builder State
  const [newRuleName, setNewRuleName] = useState('');
  const [selectedTrigger, setSelectedTrigger] = useState('status_change');
  const [selectedColumn, setSelectedColumn] = useState('');
  const [triggerValue, setTriggerValue] = useState('Done');
  const [selectedAction, setSelectedAction] = useState('verify_evidence');

  const handleCreateRule = async () => {
    if (!boardId || !newRuleName) return;
    try {
      await createRule.mutateAsync({
        board_id: boardId,
        name: newRuleName,
        trigger_type: selectedTrigger,
        trigger_config: { column_id: selectedColumn || 'status', value: triggerValue },
        action_type: selectedAction,
        action_config: { message: 'Automatización Ejecutada' }
      });
      setNewRuleName('');
      setActiveTab('create');
    } catch (err) {
      console.error('[AutomationsModal] Error creating rule:', err);
    }
  };

  const templates = [
    { 
      title: 'Evidencia Obligatoria: Si el estado es "Listo", verificar archivos', 
      icon: <CheckCircle2 className="w-5 h-5 text-emerald-500 shadow-[0_0_10px_#10b981]" />,
      rule: { trigger_type: 'status_change', trigger_config: { column_id: 'status', value: 'Done', verify_evidence: true }, action_type: 'verify_evidence', action_config: { message: 'Se requiere evidencia fotográfica' } }
    },
    { 
      title: 'Notificación: Si el estado es "Detenido", avisar al responsable', 
      icon: <Bell className="w-5 h-5 text-[#3B7EF8]" />,
      rule: { trigger_type: 'status_change', trigger_config: { column_id: 'status', value: 'Stuck' }, action_type: 'notify', action_config: { message: '⚠ Una tarea ha sido marcada como DETENIDA' } }
    }
  ];

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[110] flex items-center justify-center p-4">
      <motion.div 
        initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
        onClick={onClose} className="absolute inset-0 bg-[var(--bg-primary)]/80 backdrop-blur-md"
      />
      
      <motion.div 
        initial={{ scale: 0.95, opacity: 0, y: 30 }} animate={{ scale: 1, opacity: 1, y: 0 }} exit={{ scale: 0.95, opacity: 0, y: 30 }}
        className="relative bg-[var(--bg-primary)] w-full max-w-5xl rounded-[40px] shadow-[0_30px_100px_rgba(0,0,0,0.8)] overflow-hidden flex flex-col h-[85vh] border border-[var(--border-color)]"
      >
        {/* Header Industrial */}
        <header className="bg-gradient-to-r from-[#161B30] to-[#0C0F1A] p-10 text-white flex items-center justify-between border-b border-[var(--border-color)]">
           <div className="flex items-center space-x-6">
              <div className="w-16 h-16 bg-[#3B7EF8]/10 rounded-2xl flex items-center justify-center shadow-2xl border border-[#3B7EF8]/20 relative overflow-hidden group">
                 <Cpu className="w-8 h-8 text-[#3B7EF8] relative z-10 transition-transform group-hover:rotate-90 duration-700" />
                 <div className="absolute inset-0 bg-[#3B7EF8]/20 blur-xl animate-pulse" />
              </div>
              <div className="flex flex-col">
                 <span className="text-[10px] font-black uppercase tracking-[0.4em] text-[#3B7EF8] mb-1">Logic Center</span>
                 <h2 className="text-3xl font-black tracking-tighter uppercase italic">Automatizaciones</h2>
              </div>
           </div>
           <button onClick={onClose} className="p-3 bg-slate-500/5 hover:bg-rose-500/10 rounded-2xl transition-all text-slate-500 hover:text-rose-500 border border-[var(--border-color)]">
              <X className="w-6 h-6" />
           </button>
        </header>

        {/* Navigation Tabs */}
        <nav className="flex items-center bg-[var(--bg-secondary)]/50 border-b border-[var(--border-color)] px-10">
           {[
             { id: 'browse', label: 'Explorar Recetas', icon: Package },
             { id: 'create', label: 'Mis Procesos', icon: Settings }
           ].map(tab => (
             <button 
               key={tab.id}
               onClick={() => setActiveTab(tab.id as any)}
               className={`py-6 px-8 text-xs font-black uppercase tracking-[0.3em] border-b-2 flex items-center gap-3 transition-all relative ${activeTab === tab.id ? 'border-[#3B7EF8] text-white' : 'border-transparent text-slate-600 hover:text-slate-400'}`}
             >
               <tab.icon size={14} className={activeTab === tab.id ? 'text-[#3B7EF8]' : ''} />
               {tab.label}
               {activeTab === tab.id && <div className="absolute inset-x-0 bottom-0 h-10 bg-[#3B7EF8] opacity-5 blur-xl pointer-events-none" />}
             </button>
           ))}
        </nav>

        {/* Content Body */}
        <div className="flex-1 overflow-y-auto p-10 custom-scrollbar bg-[var(--bg-primary)]">
           {activeTab === 'browse' ? (
             <div className="space-y-12">
                <section>
                    <h3 className="text-[10px] font-black text-slate-600 uppercase tracking-[0.3em] mb-8">Recetas de Alta Eficiencia</h3>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                        {templates.map((tpl, i) => (
                            <motion.div 
                                key={i} layout initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.1 }}
                                className="industrial-card p-8 rounded-3xl hover:border-[#3B7EF8]/30 transition-all cursor-pointer group relative flex flex-col"
                            >
                                <div className="flex items-start justify-between mb-6">
                                    <div className="w-14 h-14 bg-[var(--bg-secondary)] rounded-2xl flex items-center justify-center border border-[var(--border-color)] group-hover:bg-[#3B7EF8]/5 transition-colors">
                                        {tpl.icon}
                                    </div>
                                    <Plus className="w-5 h-5 text-slate-700 group-hover:text-[#3B7EF8] transition-colors" />
                                </div>
                                <p className="text-base font-black text-[var(--text-primary)] leading-tight mb-8 max-w-[280px]">
                                    {tpl.title}
                                </p>
                                <button className="mt-auto w-full py-3 bg-slate-500/5 hover:bg-[#3B7EF8] text-slate-400 hover:text-white rounded-xl text-[10px] font-black uppercase tracking-widest transition-all">
                                    Activar Motor de Regla
                                </button>
                            </motion.div>
                        ))}
                    </div>
                </section>

                <section className="industrial-card p-10 rounded-[40px] border-[var(--border-color)]">
                    <div className="flex items-center gap-4 mb-10">
                       <div className="w-2 h-6 bg-[#3B7EF8] rounded-full shadow-[0_0_10px_#3B7EF8]" />
                       <h3 className="text-xl font-black text-white uppercase tracking-tight">Constructor de Lógica</h3>
                    </div>
                    
                    <div className="grid grid-cols-1 gap-12">
                        <div className="space-y-4">
                           <label className="text-[10px] font-black text-slate-600 uppercase tracking-widest">Descriptor de Automatización</label>
                           <input 
                             type="text" value={newRuleName} onChange={(e) => setNewRuleName(e.target.value)}
                             placeholder="Ej: Verificación_Campo_Activa"
                             className="w-full bg-[var(--bg-secondary)]/50 border border-[var(--border-color)] focus:border-[#3B7EF8]/50 rounded-2xl px-6 py-4 font-mono font-bold text-[#3B7EF8] outline-none transition-all placeholder-slate-700"
                           />
                        </div>

                        <div className="grid grid-cols-1 md:grid-cols-[1fr_auto_1fr] items-center gap-8">
                            <div className="space-y-4">
                               <div className="bg-[var(--bg-secondary)] border border-[#3B7EF8]/20 text-[#3B7EF8] px-5 py-3 rounded-xl inline-flex items-center gap-3 text-[10px] font-black uppercase tracking-widest">
                                  <Zap size={14} fill="currentColor" /> Trigger
                               </div>
                               <select className="w-full bg-[var(--bg-secondary)] rounded-2xl px-6 py-4 font-black text-slate-400 outline-none border border-[var(--border-color)] focus:border-[#3B7EF8]/30">
                                   <option>Cambio de Estado</option>
                                   <option>Detección de Foto</option>
                               </select>
                            </div>

                            <ArrowRight className="text-slate-800 rotate-90 md:rotate-0" size={32} />

                            <div className="space-y-4">
                               <div className="bg-[#10B981]/10 border border-[#10B981]/20 text-[#10B981] px-5 py-3 rounded-xl inline-flex items-center gap-3 text-[10px] font-black uppercase tracking-widest">
                                  <CheckCircle2 size={14} /> Action
                               </div>
                               <select className="w-full bg-[var(--bg-secondary)] rounded-2xl px-6 py-4 font-black text-slate-400 outline-none border border-[var(--border-color)] focus:border-[#3B7EF8]/30">
                                   <option>Verificar Evidencia</option>
                                   <option>Notificar Unidad</option>
                               </select>
                            </div>
                        </div>
                    </div>

                    <div className="flex justify-center mt-16">
                        <button 
                          onClick={handleCreateRule}
                          className="px-12 py-5 rounded-2xl bg-[#3B7EF8] hover:bg-[#3B7EF8]/90 text-white font-black text-xs uppercase tracking-[0.3em] shadow-2xl shadow-[#3B7EF8]/30 transition-all hover:scale-105"
                        >
                           Compilar y Ejecutar
                        </button>
                    </div>
                </section>
             </div>
           ) : (
             <div className="space-y-6 max-w-4xl mx-auto">
                {rules?.map((rule) => (
                    <motion.div 
                       key={rule.id} initial={{ x: -20, opacity: 0 }} animate={{ x: 0, opacity: 1 }}
                       className="industrial-card p-10 rounded-[32px] flex items-center justify-between group overflow-hidden relative"
                    >
                        <div className="flex items-center gap-8 relative z-10">
                           <div className={`w-16 h-16 rounded-2xl flex items-center justify-center transition-all ${rule.is_enabled ? 'bg-[#3B7EF8]/10 border border-[#3B7EF8]/30 text-[#3B7EF8]' : 'bg-slate-500/5 text-slate-700'}`}>
                               <Zap size={28} fill={rule.is_enabled ? "currentColor" : "none"} />
                           </div>
                           <div className="flex flex-col">
                              <h4 className="text-xl font-black text-white uppercase tracking-tight">{rule.name}</h4>
                              <div className="flex items-center gap-4 mt-2">
                                 <span className="text-[9px] font-mono font-bold text-slate-600 uppercase tracking-widest">{rule.trigger_type}</span>
                                 <div className="w-1 h-1 rounded-full bg-slate-800" />
                                 <span className="text-[9px] font-mono font-bold text-[#3B7EF8] uppercase tracking-widest">{rule.action_type}</span>
                              </div>
                           </div>
                        </div>
                        
                        <div className="flex items-center gap-3 relative z-10">
                            <button 
                                onClick={() => toggleRule.mutate({ ruleId: rule.id, isEnabled: !rule.is_enabled })}
                                className={`flex items-center gap-3 px-6 py-3 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all ${rule.is_enabled ? 'bg-emerald-500/10 text-emerald-500 border border-emerald-500/20' : 'bg-slate-500/5 text-slate-600 border border-[var(--border-color)]'}`}
                            >
                                {rule.is_enabled ? <ToggleRight size={24} /> : <ToggleLeft size={24} />}
                                {rule.is_enabled ? 'Active_Engine' : 'Standby'}
                            </button>
                            <button 
                                onClick={() => deleteRule.mutate(rule.id)}
                                className="p-4 text-slate-800 hover:text-rose-500 hover:bg-rose-500/10 rounded-2xl transition-all"
                            >
                                <Trash2 size={20} />
                            </button>
                        </div>
                        <div className="absolute top-0 right-0 w-32 h-32 bg-[#3B7EF8] opacity-5 blur-[100px] -mr-16 -mt-16" />
                    </motion.div>
                ))}
             </div>
           )}
        </div>

        {/* Footer Technical */}
        <footer className="p-10 border-t border-[var(--border-color)] bg-[var(--bg-secondary)] flex items-center justify-between">
           <div className="flex items-center text-[10px] font-black uppercase text-slate-500 tracking-[0.3em]">
              <ShieldAlert className="w-5 h-5 mr-4 text-emerald-500 animate-pulse" />
              <span>Sincronización Persistente con el Motor de Automatización Mantenix</span>
           </div>
        </footer>
      </motion.div>
    </div>
  );
}
