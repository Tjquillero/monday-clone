'use client';

import { useState, useRef, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { ActivityTemplate } from '@/types/monday';
import { ChevronDown, Search } from 'lucide-react';

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
   placeholder = "Buscar actividad...",
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
      <div className="relative flex items-center h-full">
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
          className={`${className} pr-8 w-full`}
        />
        <button 
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            if (disabled) return;
            setIsOpen(!isOpen);
            setIsCreating(false);
          }}
          className="absolute right-2 text-gray-400 hover:text-primary p-1 h-full flex items-center"
        >
          <ChevronDown className={`w-4 h-4 transition-transform ${isOpen ? 'rotate-180' : ''}`} />
        </button>
      </div>

      <AnimatePresence>
        {isOpen && (
          <motion.div 
            initial={{ opacity: 0, y: 5 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 5 }}
            className="absolute z-[1000] left-0 right-0 top-full mt-1 bg-white border border-gray-200 shadow-2xl rounded-xl overflow-hidden max-h-[450px] flex flex-col min-w-[320px]"
          >
            {isCreating ? (
              <form onSubmit={handleCreateSubmit} className="p-4 space-y-4">
                <div className="flex items-center justify-between border-b border-gray-100 pb-2 mb-2">
                  <span className="text-xs font-black text-primary uppercase tracking-widest">Nueva Actividad</span>
                  <button 
                    type="button" 
                    onClick={() => setIsCreating(false)}
                    className="text-[10px] text-gray-400 hover:text-red-500 font-bold uppercase"
                  >
                    Cancelar
                  </button>
                </div>
                
                <div className="space-y-3">
                  <div>
                    <label className="text-[10px] font-bold text-gray-400 uppercase mb-1 block">Nombre</label>
                    <input 
                      autoFocus
                      type="text"
                      className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:border-primary focus:ring-1 focus:ring-primary outline-none"
                      value={newActivity.name}
                      onChange={e => setNewActivity({...newActivity, name: e.target.value})}
                      required
                    />
                  </div>
                  
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="text-[10px] font-bold text-gray-400 uppercase mb-1 block">Unidad</label>
                      <input 
                        type="text"
                        className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:border-primary focus:ring-1 focus:ring-primary outline-none"
                        value={newActivity.unit}
                        onChange={e => setNewActivity({...newActivity, unit: e.target.value})}
                        placeholder="M2, PZ..."
                      />
                    </div>
                    <div>
                      <label className="text-[10px] font-bold text-gray-400 uppercase mb-1 block">Rendimiento</label>
                      <input 
                        type="number"
                        step="any"
                        className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:border-primary focus:ring-1 focus:ring-primary outline-none"
                        value={newActivity.rend}
                        onChange={e => setNewActivity({...newActivity, rend: parseFloat(e.target.value) || 0})}
                      />
                    </div>
                  </div>

                  <div>
                     <label className="text-[10px] font-bold text-gray-400 uppercase mb-1 block">Precio Unitario ($)</label>
                     <input 
                       type="number"
                       step="any"
                       className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:border-primary focus:ring-1 focus:ring-primary outline-none"
                       value={newActivity.unit_price}
                       onChange={e => setNewActivity({...newActivity, unit_price: parseFloat(e.target.value) || 0})}
                       placeholder="0.00"
                     />
                  </div>

                  <div>
                     <label className="text-[10px] font-bold text-gray-400 uppercase mb-1 block">Frecuencia (Días)</label>
                     <input 
                       type="number"
                       step="any"
                       className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:border-primary focus:ring-1 focus:ring-primary outline-none"
                       value={newActivity.frequency}
                       onChange={e => setNewActivity({...newActivity, frequency: parseFloat(e.target.value) || 25})}
                       placeholder="25 (Mensual)"
                     />
                     <div className="text-[9px] text-gray-400 mt-1 space-x-2">
                        <span onClick={() => setNewActivity({...newActivity, frequency: 25})} className="cursor-pointer hover:text-primary underline">Mensual (25)</span>
                        <span onClick={() => setNewActivity({...newActivity, frequency: 12.5})} className="cursor-pointer hover:text-primary underline">Quincenal (12.5)</span>
                     </div>
                  </div>

                  <div>
                    <label className="text-[10px] font-bold text-gray-400 uppercase mb-1 block">Categoría</label>
                    <input 
                      type="text"
                      className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:border-primary focus:ring-1 focus:ring-primary outline-none"
                      value={newActivity.category}
                      onChange={e => setNewActivity({...newActivity, category: e.target.value})}
                      placeholder="Cimentación, Acabados..."
                    />
                  </div>

                  <div>
                    <label className="text-[10px] font-bold text-gray-400 uppercase mb-1 block">Zona de Mantenimiento</label>
                    <select
                      className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:border-primary focus:ring-1 focus:ring-primary outline-none"
                      value={newActivity.zone || ''}
                      onChange={e => setNewActivity({...newActivity, zone: e.target.value as any || null})}
                    >
                      <option value="">Sin zona específica</option>
                      <option value="Zonas Verdes">🌿 Zonas Verdes</option>
                      <option value="Zonas Duras">🏗️ Zonas Duras</option>
                      <option value="Zona de Playa">🏖️ Zona de Playa</option>
                    </select>
                  </div>
                </div>

                <button 
                  type="submit"
                  className="w-full bg-primary text-white py-2.5 rounded-xl text-sm font-bold shadow-md hover:bg-[#235e48] transition-colors mt-2"
                >
                  Guardar en Catálogo
                </button>
              </form>
            ) : (
              <>
                <div className="p-2 border-b border-gray-50 flex items-center justify-between bg-gray-50/30">
                  <div className="flex items-center">
                    <Search className="w-3 h-3 text-gray-400 mr-2" />
                    <span className="text-[10px] font-bold text-gray-400 uppercase tracking-wider">
                      {value ? 'Resultados' : 'Todas las Actividades'} ({filteredTemplates.length})
                    </span>
                  </div>
                  {isAdmin && (
                    <button 
                      onClick={handleStartCreate}
                      className="text-[10px] bg-primary/10 text-primary px-2 py-1 rounded font-black hover:bg-primary/20 transition-colors uppercase tracking-tight"
                    >
                      + Nueva Actividad
                    </button>
                  )}
                </div>

                <div className="overflow-y-auto flex-1 custom-scrollbar">
                  {filteredTemplates.length > 0 ? (
                    filteredTemplates.map(template => (
                      <button
                        key={template.id}
                        type="button"
                        onClick={() => {
                          onSelect(template);
                          setIsOpen(false);
                        }}
                        className="w-full text-left px-4 py-3 hover:bg-green-50 flex flex-col border-b border-gray-50 last:border-0 transition-colors group"
                      >
                        <span className="text-sm font-bold text-gray-700 group-hover:text-primary line-clamp-2">{template.name}</span>
                        <div className="flex items-center space-x-3 mt-1.5">
                          <div className="flex items-center space-x-1">
                            <span className="text-[9px] font-black text-gray-400 uppercase tracking-tight">Unidad:</span>
                            <span className="text-[10px] bg-gray-100 text-gray-600 px-1.5 py-0.5 rounded font-bold">{template.unit}</span>
                          </div>
                          <div className="flex items-center space-x-1">
                            <span className="text-[9px] font-black text-gray-400 uppercase tracking-tight">Rend:</span>
                            <span className="text-[10px] text-gray-500 font-medium">{template.rend}</span>
                          </div>
                          {template.unit_price !== undefined && (
                             <div className="flex items-center space-x-1">
                                <span className="text-[9px] font-black text-gray-400 uppercase tracking-tight">$:</span>
                                <span className="text-[10px] text-green-600 font-bold">${template.unit_price}</span>
                             </div>
                          )}
                          <div className="flex items-center space-x-1">
                             <span className="text-[9px] font-black text-gray-400 uppercase tracking-tight">Freq:</span>
                             <span className="text-[10px] text-gray-500 font-medium">{template.frequency || 25}d</span>
                          </div>
                          {template.category && (
                            <div className="flex items-center space-x-1 border-l pl-3 border-gray-100">
                              <span className="text-[10px] text-primary font-black uppercase tracking-tighter">{template.category}</span>
                            </div>
                          )}
                          {template.zone && (
                            <div className="flex items-center space-x-1 border-l pl-3 border-gray-100">
                              <span 
                                className="text-[10px] px-2 py-0.5 rounded-full font-bold"
                                style={{
                                  backgroundColor: template.zone === 'Zonas Verdes' ? '#d1fae5' : 
                                                 template.zone === 'Zonas Duras' ? '#e5e7eb' : 
                                                 '#fed7aa',
                                  color: template.zone === 'Zonas Verdes' ? '#065f46' : 
                                        template.zone === 'Zonas Duras' ? '#374151' : 
                                        '#92400e'
                                }}
                              >
                                {template.zone === 'Zonas Verdes' ? '🌿' : 
                                 template.zone === 'Zonas Duras' ? '🏗️' : 
                                 '🏖️'} {template.zone}
                              </span>
                            </div>
                          )}
                        </div>
                      </button>
                    ))
                  ) : (
                    <div className="p-8 text-center">
                      <p className="text-sm text-gray-500 font-medium">No se encontraron actividades</p>
                      {isAdmin ? (
                        <button 
                          onClick={handleStartCreate}
                          className="mt-3 text-sm text-primary font-bold hover:underline"
                        >
                          ¿Quieres crear "{value}"?
                        </button>
                      ) : (
                        <p className="text-xs text-gray-400 mt-1">Intenta con otros términos</p>
                      )}
                    </div>
                  )}
                </div>
                
                <div className="p-3 bg-gray-50 border-t border-gray-100 flex justify-between items-center text-[9px] font-bold text-gray-400 uppercase">
                  <span>{templates.length} en total</span>
                  <span>{isAdmin ? 'Admins pueden crear' : 'Usa Enter para seleccionar'}</span>
                </div>
              </>
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
