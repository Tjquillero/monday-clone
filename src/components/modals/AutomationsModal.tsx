'use client';

import { motion, AnimatePresence } from 'framer-motion';
import { X, Zap, ArrowRight, CheckCircle2, Bell, Move, Plus, Trash2, ToggleLeft, ToggleRight, ShieldAlert } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { useState } from 'react';
import { useAutomations, AutomationRule } from '@/hooks/useAutomations';
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
        trigger_config: {
          column_id: selectedColumn || 'status',
          value: triggerValue
        },
        action_type: selectedAction,
        action_config: {
          message: 'Acción automatizada activada'
        }
      });

      setNewRuleName('');
      setActiveTab('create');
    } catch (err) {
      console.error('[AutomationsModal] Error creating rule:', err);
      alert('Error al crear la automatización. Verifica tu conexión o permisos.');
    }
  };

  const handleUseTemplate = async (template: any) => {
    if (!boardId) return;
    try {
      await createRule.mutateAsync({
        board_id: boardId,
        name: template.title,
        trigger_type: template.rule.trigger_type,
        trigger_config: template.rule.trigger_config,
        action_type: template.rule.action_type,
        action_config: template.rule.action_config
      });
      setActiveTab('create');
    } catch (err: any) {
      alert(`Error al activar la receta: ${err.message || 'Error de permisos o conexión'}`);
    }
  };

  const templates = [
    { 
      title: 'Evidencia Obligatoria: Si el estado es "Listo", verificar archivos', 
      icon: <CheckCircle2 className="w-5 h-5 text-emerald-500" />,
      rule: {
        trigger_type: 'status_change',
        trigger_config: { column_id: 'status', value: 'Done', verify_evidence: true },
        action_type: 'verify_evidence',
        action_config: { message: 'Se requiere evidencia fotográfica' }
      }
    },
    { 
        title: 'Notificación: Si el estado es "Detenido", avisar al responsable', 
        icon: <Bell className="w-5 h-5 text-blue-500" />,
        rule: {
            trigger_type: 'status_change',
            trigger_config: { column_id: 'status', value: 'Stuck' },
            action_type: 'notify',
            action_config: { message: '⚠ Una tarea ha sido marcada como DETENIDA' }
        }
    },
    { 
        title: 'Auto-Prioridad: Si el estado es "Crítico", marcar como Urgente', 
        icon: <Zap className="w-5 h-5 text-yellow-500" />,
        rule: {
            trigger_type: 'status_change',
            trigger_config: { column_id: 'status', value: 'Critical' },
            action_type: 'set_value',
            action_config: { column_id: 'priority', value: 'High' }
        }
    }
  ];

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[110] flex items-center justify-center p-4">
      <motion.div 
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        onClick={onClose}
        className="absolute inset-0 bg-black/40 backdrop-blur-sm"
      />
      
      <motion.div 
        initial={{ scale: 0.95, opacity: 0, y: 20 }}
        animate={{ scale: 1, opacity: 1, y: 0 }}
        exit={{ scale: 0.95, opacity: 0, y: 20 }}
        className="relative bg-white w-full max-w-4xl rounded-3xl shadow-2xl overflow-hidden flex flex-col h-[85vh]"
      >
        {/* Header */}
        <div className="bg-slate-900 p-8 text-white flex items-center justify-between">
           <div className="flex items-center space-x-4">
              <div className="w-12 h-12 bg-amber-400 rounded-2xl flex items-center justify-center shadow-lg shadow-amber-500/20">
                 <Zap className="w-7 h-7 text-black" fill="currentColor" />
              </div>
              <div>
                 <h2 className="text-2xl font-black tracking-tight">Centro de Automatizaciones</h2>
                 <p className="text-slate-400 text-sm font-medium">Automatiza tu flujo de trabajo en Mantenix</p>
              </div>
           </div>
           <button onClick={onClose} className="p-2 hover:bg-white/10 rounded-full transition-colors text-white/50 hover:text-white">
              <X className="w-6 h-6" />
           </button>
        </div>

        {/* Navigation */}
        <div className="flex items-center bg-white border-b border-slate-100 px-8">
           <button 
             onClick={() => setActiveTab('browse')}
             className={`py-5 px-6 text-sm font-black border-b-2 transition-all ${activeTab === 'browse' ? 'border-primary text-primary' : 'border-transparent text-slate-400 hover:text-slate-600'}`}
           >
             EXPLORAR RECETAS
           </button>
           <button 
             onClick={() => setActiveTab('create')}
             className={`py-5 px-6 text-sm font-black border-b-2 transition-all flex items-center gap-2 ${activeTab === 'create' ? 'border-primary text-primary' : 'border-transparent text-slate-400 hover:text-slate-600'}`}
           >
             MIS REGLAS {rules && rules.length > 0 && <span className="bg-slate-100 text-slate-600 px-2 py-0.5 rounded-full text-[10px]">{rules.length}</span>}
           </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-8 custom-scrollbar bg-slate-50/50">
           {activeTab === 'browse' ? (
             <div className="space-y-10">
                <section>
                    <h3 className="text-xs font-black text-slate-400 uppercase tracking-[0.2em] mb-6">Recetas Sugeridas</h3>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        {templates.filter(tpl => !rules?.some(r => r.name === tpl.title)).map((tpl, i) => (
                            <motion.div 
                                key={i}
                                layout
                                initial={{ opacity: 0, scale: 0.9 }}
                                animate={{ opacity: 1, scale: 1 }}
                                whileHover={{ y: -4, scale: 1.01 }}
                                onClick={() => handleUseTemplate(tpl)}
                                className="bg-white border border-slate-100 p-6 rounded-[2rem] hover:border-primary hover:shadow-xl transition-all cursor-pointer group shadow-sm"
                            >
                                <div className="flex items-start justify-between mb-4">
                                    <div className="w-12 h-12 bg-slate-50 rounded-2xl group-hover:bg-primary/5 transition-colors flex items-center justify-center">
                                        {tpl.icon}
                                    </div>
                                    <Plus className="w-5 h-5 text-slate-200 group-hover:text-primary transition-colors" />
                                </div>
                                <p className="text-sm font-bold text-slate-800 leading-relaxed mb-4">
                                    {tpl.title}
                                </p>
                                <div className="flex items-center justify-between mt-auto">
                                    <span className="text-[10px] font-black uppercase text-slate-400 tracking-wider">Ahorra tiempo diario</span>
                                    <Button 
                                        size="sm" 
                                        variant="ghost" 
                                        className="text-primary font-black text-[10px] uppercase"
                                        onClick={(e) => {
                                            e.stopPropagation();
                                            handleUseTemplate(tpl);
                                        }}
                                    >
                                        Usar Receta
                                    </Button>
                                </div>
                            </motion.div>
                        ))}
                    </div>
                </section>

                <section>
                    <h3 className="text-xs font-black text-slate-400 uppercase tracking-[0.2em] mb-6">Constructor de Reglas</h3>
                    <div className="bg-white border border-slate-100 rounded-[2.5rem] p-10 shadow-sm">
                        <div className="grid grid-cols-1 gap-8 mb-10">
                            <div>
                                <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-3">Nombre de la Regla</label>
                                <input 
                                    type="text" 
                                    value={newRuleName}
                                    onChange={(e) => setNewRuleName(e.target.value)}
                                    placeholder="Ej: Validar Evidencia de Obra"
                                    className="w-full bg-slate-50 border-2 border-transparent focus:border-primary focus:bg-white rounded-2xl px-6 py-4 font-bold text-slate-900 outline-none transition-all"
                                />
                            </div>

                            <div className="flex flex-col md:flex-row items-center gap-6">
                                <div className="flex-1 w-full">
                                    <div className="bg-slate-900 text-white px-6 py-3 rounded-2xl mb-4 inline-flex items-center gap-2">
                                        <Zap size={14} className="text-amber-400" />
                                        <span className="text-[10px] font-black uppercase tracking-widest">CUANDO...</span>
                                    </div>
                                    <div className="space-y-4">
                                        <select 
                                            value={selectedTrigger}
                                            onChange={(e) => setSelectedTrigger(e.target.value)}
                                            className="w-full bg-slate-50 rounded-2xl px-6 py-4 font-bold text-slate-900 outline-none border-2 border-transparent focus:border-primary"
                                        >
                                            <option value="status_change">Cambio de Estado</option>
                                            <option value="value_change">Cambio de Valor</option>
                                        </select>
                                        <div className="flex gap-4">
                                            <select 
                                                 value={selectedColumn}
                                                 onChange={(e) => setSelectedColumn(e.target.value)}
                                                 className="flex-1 bg-slate-100 rounded-xl px-4 py-3 font-bold text-slate-600 text-xs border-none"
                                            >
                                                <option value="">Seleccionar Columna</option>
                                                <option value="status">Estado</option>
                                                {columns?.filter(c => c.type === 'status').map(c => (
                                                    <option key={c.id} value={c.id}>{c.title}</option>
                                                ))}
                                            </select>
                                            <select 
                                                 value={triggerValue}
                                                 onChange={(e) => setTriggerValue(e.target.value)}
                                                 className="flex-1 bg-slate-100 rounded-xl px-4 py-3 font-bold text-slate-600 text-xs border-none"
                                            >
                                                <option value="Done">Sea "Listo"</option>
                                                <option value="Working on it">Sea "En proceso"</option>
                                                <option value="ANY">Cualquier valor</option>
                                            </select>
                                        </div>
                                    </div>
                                </div>

                                <ArrowRight className="text-slate-200 hidden md:block" size={32} />

                                <div className="flex-1 w-full">
                                    <div className="bg-primary text-white px-6 py-3 rounded-2xl mb-4 inline-flex items-center gap-2">
                                        <CheckCircle2 size={14} />
                                        <span className="text-[10px] font-black uppercase tracking-widest">ENTONCES...</span>
                                    </div>
                                    <select 
                                        value={selectedAction}
                                        onChange={(e) => setSelectedAction(e.target.value)}
                                        className="w-full bg-slate-50 rounded-2xl px-6 py-4 font-bold text-slate-900 outline-none border-2 border-transparent focus:border-primary"
                                    >
                                        <option value="verify_evidence">Verificar Evidencia (Adjuntos)</option>
                                        <option value="notify">Notificar a este usuario</option>
                                        <option value="set_value">Cambiar el valor de otra celda</option>
                                    </select>
                                </div>
                            </div>
                        </div>

                        <div className="flex justify-center">
                            <Button 
                                onClick={handleCreateRule}
                                disabled={!newRuleName || createRule.isPending}
                                className="px-10 py-6 rounded-[1.5rem] bg-slate-900 text-white font-black text-sm uppercase tracking-widest shadow-2xl shadow-slate-900/40 hover:scale-105 transition-transform"
                            >
                                {createRule.isPending ? 'Creando...' : 'Crear Automatización Personalizada'}
                            </Button>
                        </div>
                    </div>
                </section>
             </div>
           ) : (
             <div className="space-y-6 max-w-3xl mx-auto">
                {isLoading ? (
                    <div className="flex flex-col items-center justify-center py-20">
                        <div className="w-10 h-10 border-4 border-primary border-t-transparent rounded-full animate-spin" />
                    </div>
                ) : rules && rules.length > 0 ? (
                    rules.map((rule) => (
                        <div key={rule.id} className="bg-white border border-slate-100 p-8 rounded-[2.5rem] shadow-sm flex flex-col md:flex-row items-center justify-between gap-6 group">
                            <div className="flex items-center gap-6">
                                <div className={`w-14 h-14 rounded-2xl flex items-center justify-center shadow-lg transition-colors ${rule.is_enabled ? 'bg-amber-50 text-amber-500 shadow-amber-500/10' : 'bg-slate-50 text-slate-300 shadow-none'}`}>
                                    <Zap size={24} fill={rule.is_enabled ? "currentColor" : "none"} />
                                </div>
                                <div>
                                    <h4 className="text-lg font-black text-slate-900">{rule.name}</h4>
                                    <div className="flex items-center gap-3 mt-1">
                                        <span className="px-3 py-1 bg-slate-50 rounded-lg text-[10px] font-black text-slate-400 uppercase tracking-wider">{rule.trigger_type}</span>
                                        <ArrowRight size={12} className="text-slate-200" />
                                        <span className="px-3 py-1 bg-primary/5 rounded-lg text-[10px] font-black text-primary uppercase tracking-wider">{rule.action_type}</span>
                                    </div>
                                </div>
                            </div>
                            
                            <div className="flex items-center gap-4">
                                <button 
                                    onClick={() => toggleRule.mutate({ ruleId: rule.id, isEnabled: !rule.is_enabled })}
                                    className={`flex items-center gap-2 px-4 py-2 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all ${rule.is_enabled ? 'bg-emerald-50 text-emerald-600' : 'bg-slate-50 text-slate-400'}`}
                                >
                                    {rule.is_enabled ? <ToggleRight size={20} /> : <ToggleLeft size={20} />}
                                    {rule.is_enabled ? 'ACTIVO' : 'PAUSADO'}
                                </button>
                                <button 
                                    onClick={() => deleteRule.mutate(rule.id)}
                                    className="p-3 text-slate-200 hover:text-rose-500 hover:bg-rose-50 rounded-xl transition-all"
                                >
                                    <Trash2 size={18} />
                                </button>
                            </div>
                        </div>
                    ))
                ) : (
                    <div className="flex flex-col items-center justify-center py-20 text-center">
                        <div className="w-24 h-24 bg-slate-50 rounded-[2rem] flex items-center justify-center mb-8 border border-slate-100">
                           <Zap className="w-10 h-10 text-slate-200" />
                        </div>
                        <h3 className="text-2xl font-black text-slate-900 mb-2">Aún no tienes reglas activas</h3>
                        <p className="text-slate-400 max-w-xs mx-auto text-sm font-medium">Automatiza tus procesos creando reglas en la pestaña de exploración.</p>
                        <Button 
                            variant="ghost" 
                            onClick={() => setActiveTab('browse')}
                            className="mt-8 text-primary font-black uppercase text-xs tracking-[0.2em]"
                        >
                            Ir al constructor
                        </Button>
                    </div>
                )}
             </div>
           )}
        </div>

        {/* Footer */}
        <div className="p-8 border-t border-slate-100 bg-white flex items-center justify-between">
           <div className="flex items-center text-[10px] font-black uppercase text-slate-400 tracking-widest">
              <ShieldAlert className="w-4 h-4 mr-3 text-emerald-500" />
              <span>Ejecución directa en el motor persistente de Mantenix</span>
           </div>
           <Button variant="ghost" size="sm" className="text-slate-400 font-bold hover:text-primary">Ver Logs de Ejecución</Button>
        </div>
      </motion.div>

      <style jsx>{`
        .custom-scrollbar::-webkit-scrollbar {
          width: 6px;
        }
        .custom-scrollbar::-webkit-scrollbar-thumb {
          background: #e2e8f0;
          border-radius: 10px;
        }
      `}</style>
    </div>
  );
}
