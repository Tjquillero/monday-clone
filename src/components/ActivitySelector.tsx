'use client';

import { useState, useRef, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { ActivityTemplate } from '@/types/monday';
import { ChevronDown, Search, Plus, X, List, Target, Zap } from 'lucide-react';

interface ActivitySelectorProps {
  value: string;
  templates: ActivityTemplate[];
  onChange: (val: string) => void;
  onSelect: (template: ActivityTemplate) => void;
  isAdmin?: boolean;
  onCreateTemplate?: (template: Omit<ActivityTemplate, 'id' | 'created_at'>) => Promise<ActivityTemplate | void>;
  onEnter?: () => void;
  onBlur?: () => void;
  placeholder?: string;
  className?: string;
}

export default function ActivitySelector({ 
  value, 
  templates, 
  onChange, 
  onSelect,
   isAdmin = false,
   onCreateTemplate,
   onEnter,
   onBlur,
   placeholder = "Search_Database...",
  className = "",
  disabled = false
}: ActivitySelectorProps & { disabled?: boolean }) {
  const [isOpen, setIsOpen] = useState(false);
  const [isCreating, setIsCreating] = useState(false);
  const [newActivity, setNewActivity] = useState<{ name: string; unit: string; rend: number; unit_price: number; frequency: number; category: string; zone: 'Zonas Verdes' | 'Zonas Duras' | 'Zona de Playa' | null }>({ 
    name: '', 
    unit: 'M2', 
    rend: 0, 
    unit_price: 0,
    frequency: 25,
    category: '',
    zone: null
  });
  const containerRef = useRef<HTMLDivElement>(null);

  const filteredTemplates = templates.filter(t => 
    t.name.toLowerCase().includes(value.toLowerCase())
  ).slice(0, 15);

  // Close when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setIsOpen(false);
        setIsCreating(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const handleStartCreate = () => {
    setNewActivity({ ...newActivity, name: value });
    setIsCreating(true);
  };

  const handleCreateSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (onCreateTemplate && newActivity.name) {
      const created = await onCreateTemplate(newActivity);
      setIsCreating(false);
      setIsOpen(false);
      if (created) {
        onSelect(created);
      }
    }
  };

  return (
    <div className={`relative w-full ${isOpen ? 'z-[1000]' : 'z-auto'}`} ref={containerRef}>
      <div className="relative flex items-center h-full group">
        <input 
          type="text" 
          value={value}
          disabled={disabled}
          onChange={(e) => {
            if (disabled) return;
            onChange(e.target.value);
            setIsOpen(true);
            setIsCreating(false);
          }}
          onFocus={(e) => {
            if (disabled) return;
            setIsOpen(true);
            e.target.select();
          }}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              if (filteredTemplates.length > 0 && isOpen && !isCreating) {
                onSelect(filteredTemplates[0]);
                setIsOpen(false);
              } else if (isOpen && !isCreating) {
                setIsOpen(false);
                if (onEnter) onEnter();
              } else if (!isOpen && onEnter) {
                onEnter();
              }
            }
            if (e.key === 'Escape') {
              setIsOpen(false);
              setIsCreating(false);
            }
          }}
          onBlur={() => {
            if (onBlur) onBlur();
          }}
          placeholder={placeholder}
          className={`${className} pr-10 w-full transition-all duration-300 placeholder:text-[var(--text-secondary)] bg-transparent text-[var(--text-primary)] border-none focus:ring-0 font-black uppercase`}
        />
        <button 
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            if (disabled) return;
            setIsOpen(!isOpen);
            setIsCreating(false);
          }}
          className="absolute right-2 text-slate-700 hover:text-[#3B7EF8] p-1 h-full flex items-center transition-colors"
        >
          <ChevronDown className={`w-4 h-4 transition-transform duration-500 ${isOpen ? 'rotate-180 text-[#3B7EF8]' : ''}`} />
        </button>
      </div>

      <AnimatePresence>
        {isOpen && (
          <motion.div 
            key="activity-selector-dropdown"
            initial={{ opacity: 0, y: 10, scale: 0.98, filter: 'blur(5px)' }}
            animate={{ opacity: 1, y: 0, scale: 1, filter: 'blur(0px)' }}
            exit={{ opacity: 0, y: 10, scale: 0.98, filter: 'blur(5px)' }}
            className="absolute z-[1000] left-0 right-0 top-full mt-3 bg-[var(--bg-secondary)] border border-[var(--border-color)] shadow-[0_25px_80px_rgba(0,0,0,0.6)] rounded-[2.5rem] overflow-hidden max-h-[500px] flex flex-col min-w-[380px] backdrop-blur-2xl"
          >
            {isCreating ? (
              <form onSubmit={handleCreateSubmit} className="p-8 space-y-6">
                <div className="flex items-center justify-between border-b border-[var(--border-color)] pb-4 mb-2">
                  <div className="flex items-center gap-3">
                     <div className="w-8 h-8 rounded-lg bg-emerald-500/10 flex items-center justify-center border border-emerald-500/20 shadow-lg shadow-emerald-500/5">
                        <Plus className="w-4 h-4 text-emerald-500" />
                     </div>
                     <span className="text-[10px] font-black text-white hover:text-[#3B7EF8] uppercase tracking-[0.4em] italic leading-none transition-colors">New_Activity_Record</span>
                  </div>
                  <button 
                    type="button" 
                    onClick={() => setIsCreating(false)}
                    className="p-1.5 hover:bg-slate-500/5 rounded-lg transition-all text-slate-600 hover:text-rose-500"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>
                
                <div className="space-y-5">
                  <div className="space-y-2">
                    <label className="text-[9px] font-black text-slate-600 uppercase tracking-[0.3em] ml-2">Nombre_Protocolo</label>
                    <input 
                      autoFocus
                      type="text"
                      className="w-full bg-[var(--bg-primary)] border border-[var(--border-color)] rounded-2xl px-4 py-3 text-sm text-white font-mono font-bold focus:border-[#3B7EF8] focus:ring-1 focus:ring-[#3B7EF8] outline-none shadow-inner transition-all"
                      value={newActivity.name}
                      onChange={e => setNewActivity({...newActivity, name: e.target.value})}
                      required
                    />
                  </div>
                  
                  <div className="grid grid-cols-2 gap-6">
                    <div className="space-y-2">
                      <label className="text-[9px] font-black text-slate-600 uppercase tracking-[0.3em] ml-2">Unidad</label>
                      <input 
                        type="text"
                        className="w-full bg-[var(--bg-primary)] border border-[var(--border-color)] rounded-2xl px-4 py-3 text-sm text-white font-mono font-bold focus:border-[#3B7EF8] outline-none shadow-inner transition-all uppercase"
                        value={newActivity.unit}
                        onChange={e => setNewActivity({...newActivity, unit: e.target.value})}
                        placeholder="M2, ML..."
                      />
                    </div>
                    <div className="space-y-2">
                      <label className="text-[9px] font-black text-slate-600 uppercase tracking-[0.3em] ml-2">Rendimiento</label>
                      <input 
                        type="number"
                        step="any"
                        className="w-full bg-[var(--bg-primary)] border border-[var(--border-color)] rounded-2xl px-4 py-3 text-sm text-white font-mono font-bold focus:border-[#3B7EF8] outline-none shadow-inner transition-all"
                        value={newActivity.rend}
                        onChange={e => setNewActivity({...newActivity, rend: parseFloat(e.target.value) || 0})}
                      />
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-6">
                    <div className="space-y-2">
                       <label className="text-[9px] font-black text-slate-600 uppercase tracking-[0.3em] ml-2">P_Unitario ($)</label>
                       <input 
                         type="number"
                         step="any"
                         className="w-full bg-[var(--bg-primary)] border border-[var(--border-color)] rounded-2xl px-4 py-3 text-sm text-[#10B981] font-mono font-black focus:border-[#3B7EF8] outline-none shadow-inner transition-all"
                         value={newActivity.unit_price}
                         onChange={e => setNewActivity({...newActivity, unit_price: parseFloat(e.target.value) || 0})}
                         placeholder="0.00"
                       />
                    </div>
                    <div className="space-y-2">
                       <label className="text-[9px] font-black text-slate-600 uppercase tracking-[0.3em] ml-2">Freq_(Días)</label>
                       <input 
                         type="number"
                         step="any"
                         className="w-full bg-[var(--bg-primary)] border border-[var(--border-color)] rounded-2xl px-4 py-3 text-sm text-[#A78BFA] font-mono font-black focus:border-[#3B7EF8] outline-none shadow-inner transition-all"
                         value={newActivity.frequency}
                         onChange={e => setNewActivity({...newActivity, frequency: parseFloat(e.target.value) || 25})}
                       />
                    </div>
                  </div>

                  <div className="space-y-2">
                    <label className="text-[9px] font-black text-slate-600 uppercase tracking-[0.3em] ml-2">Zona_Mantenimiento</label>
                    <select
                      className="w-full bg-[var(--bg-primary)] border border-[var(--border-color)] rounded-2xl px-4 py-3 text-sm text-white font-black uppercase tracking-widest focus:border-[#3B7EF8] outline-none shadow-inner transition-all appearance-none cursor-pointer"
                      value={newActivity.zone || ''}
                      onChange={e => setNewActivity({...newActivity, zone: e.target.value as any || null})}
                    >
                      <option value="" className="bg-[var(--bg-secondary)]">No_Global_Zone</option>
                      <option value="Zonas Verdes" className="bg-[var(--bg-secondary)]">🌿 Zonas Verdes</option>
                      <option value="Zonas Duras" className="bg-[var(--bg-secondary)]">🏗️ Zonas Duras</option>
                      <option value="Zona de Playa" className="bg-[var(--bg-secondary)]">🏖️ Zona de Playa</option>
                    </select>
                  </div>
                </div>

                <button 
                  type="submit"
                  className="w-full bg-[#3B7EF8] text-white py-4 rounded-[1.5rem] text-[10px] font-black uppercase tracking-[0.2em] shadow-xl shadow-[#3B7EF8]/20 hover:bg-[#2563EB] active:scale-95 transition-all border border-[var(--border-color)] mt-4"
                >
                  COMMIT_CATALOG_DATA
                </button>
              </form>
            ) : (
              <>
                <div className="p-4 border-b border-[var(--border-color)] flex items-center justify-between bg-[var(--bg-primary)]/50 backdrop-blur-md sticky top-0 z-10">
                  <div className="flex items-center ml-2">
                    <Search className="w-4 h-4 text-[#3B7EF8] mr-3 opacity-50" />
                    <span className="text-[10px] font-black text-slate-600 uppercase tracking-[0.3em]">
                      {value ? 'QUERY_RESULTS' : 'FULL_ARCHIVE'} ({filteredTemplates.length})
                    </span>
                  </div>
                  {isAdmin && (
                    <button 
                      onClick={handleStartCreate}
                      className="text-[9px] bg-[#10B981]/10 text-[#10B981] px-4 py-2 rounded-xl font-black hover:bg-[#10B981]/20 transition-all uppercase tracking-widest border border-[#10B981]/10"
                    >
                      + Register_New
                    </button>
                  )}
                </div>

                <div className="overflow-y-auto flex-1 custom-scrollbar bg-[var(--bg-secondary)]/50 p-2">
                  {filteredTemplates.length > 0 ? (
                    <div className="space-y-1">
                      {filteredTemplates.map((template, idx) => (
                        <button
                          key={`template-${template.id || `idx-${idx}`}`}
                          type="button"
                          onClick={() => {
                            onSelect(template);
                            setIsOpen(false);
                          }}
                          className="w-full text-left p-5 rounded-[1.5rem] hover:bg-white/[0.03] flex flex-col border border-transparent hover:border-[var(--border-color)] transition-all group"
                        >
                          <div className="flex items-start justify-between">
                            <span className="text-sm font-black text-white group-hover:text-[#3B7EF8] line-clamp-2 leading-tight transition-colors">{template.name.toUpperCase()}</span>
                            <div className="w-3 h-3 rounded-full border border-[#10B981] flex items-center justify-center scale-0 group-hover:scale-100 transition-transform">
                              <div className="w-1.5 h-1.5 bg-[#10B981] rounded-full shadow-[0_0_5px_#10b981]" />
                            </div>
                          </div>
                          
                          <div className="flex items-center gap-4 mt-4">
                            <div className="flex items-center gap-2 bg-[var(--bg-primary)] px-3 py-1.5 rounded-lg border border-[var(--border-color)] shadow-inner">
                              <span className="text-[8px] font-black text-slate-700 uppercase tracking-widest">UNIT</span>
                              <span className="text-[10px] text-white font-mono font-bold leading-none">{template.unit}</span>
                            </div>
                            
                            <div className="flex items-center gap-2">
                              <Target className="w-3 h-3 text-[#3B7EF8]/40" />
                              <span className="text-[10px] text-slate-500 font-mono font-bold italic">{template.rend}</span>
                            </div>

                            {template.unit_price !== undefined && (
                               <div className="flex items-center gap-1.5 bg-[#10B981]/5 px-2 py-1 rounded-lg border border-[#10B981]/10">
                                  <span className="text-[10px] text-[#10B981] font-black font-mono leading-none">${template.unit_price}</span>
                               </div>
                            )}

                            <div className="flex items-center gap-2">
                               <Zap className="w-3 h-3 text-[#A78BFA]/40" />
                               <span className="text-[10px] text-[#A78BFA] font-mono font-black italic">{template.frequency || 25}d</span>
                            </div>

                            {template.zone && (
                              <div className="flex items-center ml-auto">
                                <span 
                                  className="text-[8px] px-2 py-1 rounded-lg font-black uppercase tracking-widest border shadow-lg"
                                  style={{
                                    backgroundColor: template.zone === 'Zonas Verdes' ? 'rgba(16, 185, 129, 0.1)' : 
                                                   template.zone === 'Zonas Duras' ? 'rgba(71, 85, 105, 0.1)' : 
                                                   'rgba(59, 126, 248, 0.1)',
                                    borderColor: template.zone === 'Zonas Verdes' ? 'rgba(16, 185, 129, 0.3)' : 
                                               template.zone === 'Zonas Duras' ? 'rgba(71, 85, 105, 0.3)' : 
                                               'rgba(59, 126, 248, 0.3)',
                                    color: template.zone === 'Zonas Verdes' ? '#10B981' : 
                                          template.zone === 'Zonas Duras' ? '#94a3b8' : 
                                          '#3B7EF8'
                                  }}
                                >
                                  {template.zone === 'Zonas Verdes' ? '🌿' : 
                                   template.zone === 'Zonas Duras' ? '🏗' : 
                                   '🏖'} {template.zone.split(' ')[2] || 'Global'}
                                </span>
                              </div>
                            )}
                          </div>
                        </button>
                      ))}
                    </div>
                  ) : (
                    <div className="p-12 text-center">
                      <p className="text-[11px] text-slate-700 font-black uppercase tracking-[0.3em] leading-loose italic">No_System_Match_<br/>Protocol_Unknown</p>
                      {isAdmin ? (
                        <button 
                          onClick={handleStartCreate}
                          className="mt-6 text-[10px] text-[#3B7EF8] font-black uppercase tracking-widest hover:underline"
                        >
                          ¿Register Protocol "{value}"?
                        </button>
                      ) : (
                        <p className="text-[9px] text-slate-800 mt-4 uppercase tracking-[0.2em]">Restricted_Access: Contact_HQ</p>
                      )}
                    </div>
                  )}
                </div>
                
                <div className="p-4 bg-[var(--bg-primary)]/50 border-t border-[var(--border-color)] flex justify-between items-center text-[9px] font-black text-slate-600 uppercase tracking-[0.3em]">
                  <span className="flex items-center"><List className="w-3 h-3 mr-2" /> {templates.length}_TOTAL_ENTRIES</span>
                  <span>{isAdmin ? 'ADMIN_MODE_ACTIVE' : 'READY_FOR_COMMIT'}</span>
                </div>
              </>
            )}
          </motion.div>
        )}
      </AnimatePresence>

      <style jsx>{`
        .custom-scrollbar::-webkit-scrollbar {
            width: 4px;
        }
        .custom-scrollbar::-webkit-scrollbar-thumb {
            background: rgba(255, 255, 255, 0.03);
            border-radius: 10px;
        }
        .custom-scrollbar::-webkit-scrollbar-thumb:hover {
            background: rgba(59, 126, 248, 0.2);
        }
        .custom-scrollbar::-webkit-scrollbar-track {
            background: transparent;
        }
      `}</style>
    </div>
  );
}
