'use client';

import { useState, useEffect, useRef } from 'react';
import { ChevronDown, Plus, GripVertical, ChevronRight, CornerDownRight, Trash2, MapPin, Map, User, Check, Clock, AlertTriangle, Leaf, Umbrella, Layers } from 'lucide-react';
import { Item, Group, Column, ActivityTemplate } from '@/types/monday';
import { LocationPicker } from '@/components/LocationPicker';
import {
  SortableContext,
  verticalListSortingStrategy,
  useSortable,
  arrayMove
} from '@dnd-kit/sortable';
import { 
  DndContext, 
  closestCorners, 
  KeyboardSensor, 
  PointerSensor, 
  useSensor, 
  useSensors,
  DragOverlay,
  defaultDropAnimationSideEffects,
  DragStartEvent,
  DragOverEvent,
  DragEndEvent
} from '@dnd-kit/core';
import { CSS } from '@dnd-kit/utilities';
import { motion, AnimatePresence } from 'framer-motion';
import ActivitySelector from '@/components/ActivitySelector';
import PersonnelPicker from './PersonnelPicker';

// Paleta de colores para AVATARES únicos
const AVATAR_COLORS = [
  'bg-blue-500', 'bg-emerald-500', 'bg-rose-500', 'bg-amber-500', 
  'bg-violet-500', 'bg-indigo-500', 'bg-cyan-500', 'bg-fuchsia-500'
];

const getAvatarColor = (name: string) => {
  const hash = name.split('').reduce((acc, char) => acc + char.charCodeAt(0), 0);
  return AVATAR_COLORS[hash % AVATAR_COLORS.length];
};

function EditableCell({ value, onSave, type = "text", className = "" }: { value: string | number, onSave: (val: string | number) => void, type?: string, className?: string }) {
  const [localValue, setLocalValue] = useState(value);
  const lastSavedValue = useRef(value);

  useEffect(() => {
    setLocalValue(value);
    lastSavedValue.current = value;
  }, [value]);

  const handleBlur = () => {
    if (String(localValue) !== String(lastSavedValue.current)) {
      onSave(localValue);
      lastSavedValue.current = localValue;
    }
  };

  return (
    <input 
      type={type}
      value={localValue || ''}
      onChange={(e) => setLocalValue(e.target.value)}
      onBlur={handleBlur}
      onKeyDown={(e) => e.key === 'Enter' && e.currentTarget.blur()}
      className={`${className} border-none outline-none focus:ring-0`}
    />
  );
}

interface SortableRowProps {
  item: Item;
  group: Group;
  columns: Column[];
  onUpdateItem: (groupId: string, itemId: number | string, field: string, value: string | number | null) => void;
  onUpdateItemValue: (groupId: string, itemId: number | string, columnId: string, value: string | number | null) => void;
  onOpenItem: (groupId: string, item: Item, tab?: 'updates' | 'details' | 'evidence' | 'attachments' | 'execution' | 'dependencies' | 'location') => void;
  getStatusColor: (status: string) => string;
  getNextStatus: (currentStatus: string) => string;
  getPriorityColor: (priority: string) => string;
  getNextPriority: (currentPriority: string) => string;
  onDeleteItem: (itemId: number | string) => void;
  activityTemplates: ActivityTemplate[];
  isAdmin?: boolean;
  onCreateTemplate?: (template: Omit<ActivityTemplate, 'id' | 'created_at'>) => Promise<ActivityTemplate | void>;
  onUpdateItemValues: (groupId: string, itemId: number | string, updates: Record<string, string | number | null>) => void;
  onAddSubItem: (groupId: string, itemId: number | string) => void;
  onUpdateSubItemValue: (groupId: string, parentId: number | string, subItemId: number | string, columnId: string, value: string | number | null) => void;
}

function SortableRow({ 
  item, 
  group, 
  columns, 
  onUpdateItem, 
  onUpdateItemValue, 
  onOpenItem,
  onAddSubItem,
  getStatusColor,
  getNextStatus,
  getPriorityColor,
  getNextPriority,
  onDeleteItem,
  activityTemplates,
  isAdmin,
  onCreateTemplate,
  onUpdateItemValues,
}: SortableRowProps) {
  const [isExpanded, setIsExpanded] = useState(false);
  const [activePicker, setActivePicker] = useState<{ itemId: string | number, colId: string, position?: { top: number, left: number } } | null>(null);
  const [localName, setLocalName] = useState(item.name);
  const ignorePropUpdatesUntil = useRef(0);

  useEffect(() => {
    if (Date.now() > ignorePropUpdatesUntil.current) {
        setLocalName(item.name);
    }
  }, [item.name]);

  const handleNameBlur = () => {
    if (localName !== item.name) {
      ignorePropUpdatesUntil.current = Date.now() + 5000;
      onUpdateItem(group.id, item.id, 'name', localName);
    }
  };

  const handleSelectItem = (template: ActivityTemplate) => {
    setLocalName(template.name);
    ignorePropUpdatesUntil.current = Date.now() + 5000;
    onUpdateItem(group.id, item.id, 'name', template.name);
    onUpdateItemValues(group.id, item.id, {
      unit: template.unit || '',
      rend: template.rend || 0,
      unit_price: template.unit_price || 0,
      frequency: template.frequency || 25,
      category: template.category || '',
      zone: template.zone || null
    });
  };

  const getZoneValue = () => {
    if (item.values['zone']) return item.values['zone'];
    const zoneColumn = columns.find(col => col.title?.toLowerCase().includes('zona'));
    return zoneColumn ? item.values[zoneColumn.id] : null;
  };

  const getColValue = (col: Column) => {
    if (!col) return null;
    const val = item.values[col.id];
    if (val !== undefined && val !== null && val !== '') return val;
    const title = (col.title || '').toLowerCase();
    if (title.includes('rendimiento')) return item.values['rend'];
    if (title.includes('unidad')) return item.values['unit'];
    if (title.includes('cantidad')) return item.values['cant'];
    if (title.includes('jornal') || title.includes('jor. req')) {
       const rend = Number(item.values['rend'] || 0);
       const cant = Number(item.values['cant'] || 0);
       return (rend > 0 && cant > 0) ? (cant / rend).toFixed(2) : '-';
    }
    return val;
  };

  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: item.id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
    zIndex: isDragging ? 1000 : 'auto',
  };

  const status = String(getColValue(columns.find(c => c.type === 'status') || { id: 'status' } as any) || 'Not Started');
  const priority = String(getColValue(columns.find(c => c.type === 'priority') || { id: 'priority' } as any) || 'Low');
  const responsible = String(getColValue(columns.find(c => c.type === 'people') || { id: 'person' } as any) || 'S/A');

  return (
    <div ref={setNodeRef} style={style} className="contents">
      <div 
        className="group/row grid border-b border-[var(--border-color)] bg-transparent hover:bg-[#3B7EF8]/5 transition-all h-[44px] items-center text-sm"
        style={{ gridTemplateColumns: `30px 6px 550px ${columns.map(c => `${c.width}px`).join(' ')} 1fr` }}
      >
         {/* Drag Handle */}
         <div {...attributes} {...listeners} className="flex items-center justify-center cursor-grab active:cursor-grabbing text-slate-600 hover:text-slate-400 opacity-0 group-hover/row:opacity-100 transition-opacity">
            <GripVertical className="w-3 h-3" />
         </div>

         <div className="h-full w-full" style={{ backgroundColor: group.color }}></div>
         
         <div className="pl-4 pr-4 border-r border-[var(--border-color)] h-full flex items-center gap-3">
              <button onClick={() => setIsExpanded(!isExpanded)} className={`p-1 rounded transition-colors ${isExpanded ? 'bg-[#3B7EF8]/10 text-[#3B7EF8]' : 'hover:bg-slate-500/5 text-slate-500'}`}>
                 {isExpanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
              </button>
              
              <button 
                onClick={(e) => { e.stopPropagation(); onOpenItem(group.id, item, 'location'); }}
                className={`p-1.5 rounded-lg transition-all ${item.lat || (item.values as any)?.lat ? 'bg-emerald-500/10 text-emerald-500 border border-emerald-500/20 glow-green' : 'text-slate-600 hover:text-[#3B7EF8] hover:bg-slate-500/5'}`}
              >
                <MapPin size={14} />
              </button>

              <ActivitySelector 
                value={localName}
                templates={activityTemplates}
                isAdmin={isAdmin}
                onCreateTemplate={onCreateTemplate}
                onChange={setLocalName}
                onBlur={handleNameBlur}
                onEnter={handleNameBlur}
                onSelect={handleSelectItem}
                className="text-[var(--text-primary)] font-medium truncate flex-1 bg-transparent focus:outline-none"
              />

              {/* Zone Badge Industrial - REINCORPORATED ICONS */}
              {(() => {
                const zoneValue = getZoneValue();
                if (!zoneValue) return null;
                const config = zoneValue === 'Zonas Verdes' ? { color: '#10B981', bg: 'bg-emerald-500/10', label: 'Verdes', Icon: Leaf } : 
                              zoneValue === 'Zonas Duras' ? { color: '#64748B', bg: 'bg-slate-500/10', label: 'Duras', Icon: Layers } : 
                              { color: '#F59E0B', bg: 'bg-amber-500/10', label: 'Playa', Icon: Umbrella };
                
                const { Icon } = config;
                
                return (
                  <span className={`flex items-center gap-1.5 px-2.5 py-1 rounded-full border border-[var(--border-color)] ${config.bg} text-[10px] font-black uppercase tracking-tighter flex-shrink-0 shadow-sm transition-all hover:scale-105`}>
                    <div className="w-5 h-5 flex items-center justify-center rounded-full bg-white shadow-sm" style={{ color: config.color }}>
                       <Icon size={12} strokeWidth={3} />
                    </div>
                    <span style={{ color: config.color }}>{config.label}</span>
                  </span>
                );
              })()}

              <div className="flex items-center ml-auto gap-2 opacity-0 group-hover/row:opacity-100 transition-opacity pr-2">
                <button onClick={() => onOpenItem(group.id, item)} className="p-1 px-2 border border-[var(--border-color)] rounded-lg text-[10px] uppercase font-black tracking-widest text-[var(--text-secondary)] hover:bg-[var(--bg-secondary)]/20 hover:text-[var(--text-primary)] transition-all">Detalles</button>
                <button onClick={() => onDeleteItem(item.id)} className="p-1.5 text-[var(--text-secondary)] hover:text-rose-500 transition-colors"><Trash2 size={13} /></button>
              </div>
         </div>
         
         {columns.map(col => (
           <div key={col.id} className="border-r border-[var(--border-color)] h-full flex items-center justify-center relative">
              {col.type === 'people' && (
                <div 
                  className="flex items-center gap-2 px-3 py-1 bg-slate-500/5 rounded-xl border border-[var(--border-color)] hover:bg-white/10 transition-all cursor-pointer group/avatar"
                  onClick={(e) => {
                      e.stopPropagation();
                      const rect = e.currentTarget.getBoundingClientRect();
                      setActivePicker({ itemId: item.id, colId: col.id, position: { top: rect.bottom + 5, left: rect.left } });
                  }}
                >
                  <div className={`w-6 h-6 rounded-full ${getAvatarColor(responsible)} flex items-center justify-center text-white text-[10px] font-black uppercase border border-white/20 shadow-lg`}>
                    {responsible.charAt(0)}
                  </div>
                  <span className="text-[10px] font-bold text-slate-400 group-hover/avatar:text-[var(--text-primary)] transition-colors hidden xl:inline">{responsible}</span>
                  
                  {activePicker?.itemId === item.id && activePicker?.colId === col.id && (
                    <PersonnelPicker 
                      currentValue={responsible}
                      onSelect={(id, name) => { onUpdateItemValue(group.id, item.id, col.id, name); setActivePicker(null); }}
                      onClose={() => setActivePicker(null)}
                      position={activePicker.position}
                    />
                  )}
                </div>
              )}

              {col.type === 'status' && (
                 <button 
                  onClick={() => onUpdateItemValue(group.id, item.id, col.id, getNextStatus(status))}
                  className={`group/status relative overflow-hidden w-full h-[32px] mx-2 rounded-lg text-[10px] font-black uppercase tracking-widest transition-all duration-300 ${getStatusColor(status)} ${status === 'Working on it' ? 'animate-pulse-orange shadow-[0_0_15px_#f59e0b40]' : ''}`}
                >
                   <span className="relative z-10">{status === 'Done' ? 'Completado' : status === 'Working on it' ? 'En Proceso' : status === 'Stuck' ? 'Bloqueado' : 'Pendiente'}</span>
                   {status === 'Working on it' && <div className="absolute inset-x-0 bottom-0 h-[2px] bg-white/20 animate-progress-indeterminate" />}
                </button>
              )}

              {col.type === 'priority' && (
                 <button 
                  onClick={() => onUpdateItemValue(group.id, item.id, col.id, getNextPriority(priority))}
                  className={`w-full h-[28px] mx-4 rounded-lg text-[9px] font-black uppercase tracking-[0.15em] transition-all duration-300 flex items-center justify-center gap-2 border border-[var(--border-color)] ${getPriorityColor(priority)}`}
                >
                   <div className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: priority === 'High' ? '#ef4444' : priority === 'Medium' ? '#fbbf24' : '#10b981', boxShadow: '0 0 6px currentColor' }} />
                   {priority === 'High' ? 'Alta' : priority === 'Medium' ? 'Media' : 'Baja'}
                </button>
              )}

              {col.type === 'text' && (
                <>
                  {col.title.toUpperCase().includes('ZONA') ? (
                    <select 
                      value={getColValue(col) || ''}
                      onChange={(e) => onUpdateItemValue(group.id, item.id, col.id, e.target.value)}
                      className="w-full h-[28px] mx-2 bg-slate-500/5 border border-[var(--border-color)] rounded-lg text-[10px] font-black uppercase tracking-widest text-[#334155] focus:ring-1 focus:ring-[#3B7EF8] outline-none cursor-pointer appearance-none text-center"
                    >
                      <option value="">Seleccionar...</option>
                      <option value="Zonas Verdes">Verdes</option>
                      <option value="Playa">Playa</option>
                      <option value="Zonas Duras">Duras</option>
                    </select>
                  ) : (
                    <EditableCell 
                      value={getColValue(col) || ''}
                      onSave={(val) => onUpdateItemValue(group.id, item.id, col.id, val)}
                      className="w-full text-center bg-transparent text-[11px] font-medium text-slate-400 focus:text-[#3B7EF8]"
                    />
                  )}
                </>
              )}

              {(col.type === 'number' || col.type === 'numbers') && (
                <EditableCell 
                  type="number"
                  value={getColValue(col) || 0}
                  onSave={(val) => onUpdateItemValue(group.id, item.id, col.id, val)}
                  className="w-full font-mono font-bold text-center bg-transparent text-xs text-[var(--text-primary)] focus:text-[#3B7EF8]"
                />
              )}
           </div>
         ))}
         
         <div className="h-full w-full"></div>
      </div>

      <AnimatePresence>
        {isExpanded && item.subItems && item.subItems.length > 0 && (
          <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }} className="pl-12 bg-slate-500/5 border-l-2 border-[#3B7EF8]/20 ml-8 my-1 rounded-bl-2xl">
              {item.subItems.map(subItem => (
                <div key={subItem.id} className="grid h-[36px] items-center border-b border-[var(--border-color)] hover:bg-slate-500/10" style={{ gridTemplateColumns: `30px 420px ${columns.map(c => `${c.width}px`).join(' ')} 1fr` }}>
                   <CornerDownRight className="w-3 h-3 text-[var(--text-secondary)] ml-3" />
                   <span className="text-[11px] font-medium text-[var(--text-secondary)] pl-2">{subItem.name}</span>
                   {columns.map(c => <div key={c.id} className="text-center text-[10px] text-[var(--text-secondary)]">{(subItem.values as any)[c.id] || '-'}</div>)}
                </div>
              ))}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

interface BoardViewProps {
  groups: Group[];
  columns: Column[];
  onAddItem: (groupId: string, name: string, templateValues?: any) => void;
  onUpdateItem: (groupId: string, itemId: number | string, field: string, value: any) => void;
  onUpdateItemValue: (groupId: string, itemId: number | string, columnId: string, value: any) => void;
  onUpdateItemValues: (groupId: string, itemId: number | string, updates: Record<string, any>) => void;
  onOpenItem: (groupId: string, item: Item, tab?: any) => void;
  onAddSubItem: (groupId: string, itemId: number | string) => void;
  onUpdateSubItemValue: (groupId: string, parentId: number | string, subItemId: number | string, columnId: string, value: any) => void;
  onDeleteItem: (itemId: number | string) => void;
  onAddGroup: () => void;
  onUpdateGroup?: (groupId: string, updates: Record<string, any>) => void;
  onAddColumn?: (type: string) => void;
  activityTemplates: ActivityTemplate[];
  isAdmin?: boolean;
  onCreateTemplate?: (template: Omit<ActivityTemplate, 'id' | 'created_at'>) => Promise<ActivityTemplate | void>;
}

export default function BoardView({ 
  groups, columns, onAddItem, onUpdateItem, onUpdateItemValue, onOpenItem, onAddSubItem, onAddGroup, 
  activityTemplates, isAdmin, onCreateTemplate, onUpdateItemValues, onDeleteItem, onUpdateSubItemValue
}: BoardViewProps) {
  const [localGroups, setLocalGroups] = useState<Group[]>(groups);
  const [activeId, setActiveId] = useState<any>(null);

  useEffect(() => { setLocalGroups(groups); }, [groups]);

  const getStatusColor = (status: string) => {
    const s = status?.toLowerCase() || '';
    if (s.includes('done') || s.includes('terminado') || s.includes('completado')) {
      return 'status-badge bg-[#10B981] text-white font-black shadow-sm';
    }
    if (s.includes('working') || s.includes('proceso') || s.includes('ejecución')) {
      return 'status-badge bg-[#F59E0B] text-white font-black shadow-md border-2 border-white/20 scale-105';
    }
    if (s.includes('stuck') || s.includes('atascado') || s.includes('problema')) {
      return 'status-badge bg-[#EF4444] text-white font-black shadow-sm';
    }
    return 'status-badge bg-[#334155] text-white font-black opacity-90'; // Pending / Default
  };

  const getPriorityColor = (priority: string) => {
    const p = priority?.toLowerCase() || '';
    if (p.includes('high') || p.includes('alta') || p.includes('urgente')) return 'status-badge bg-[#EF4444] text-white font-black';
    if (p.includes('medium') || p.includes('media')) return 'status-badge bg-[#F59E0B] text-white font-black';
    return 'status-badge bg-[#3B7EF8] text-white font-black';
  };

  const getNextStatus = (curr: string) => {
     const flow = ['Not Started', 'Working on it', 'Done', 'Stuck'];
     return flow[(flow.indexOf(curr) + 1) % flow.length];
  };

  const getNextPriority = (curr: string) => {
     const flow = ['Low', 'Medium', 'High'];
     return flow[(flow.indexOf(curr) + 1) % flow.length];
  };

  return (
    <div className="space-y-12 pb-32">
       {localGroups.map((group, idx) => (
         <motion.div 
           key={group.id} 
           initial={{ opacity: 0, x: -20 }} 
           animate={{ opacity: 1, x: 0 }} 
           transition={{ delay: idx * 0.1 }}
           className="industrial-card rounded-3xl overflow-hidden"
          >
            <div className="px-6 py-4 flex items-center justify-between border-b border-[var(--border-color)] bg-gradient-to-r from-[#1E3A8A]/10 to-transparent backdrop-blur-sm">
               <div className="flex items-center gap-4">
                  <div className="w-1.5 h-6 rounded-full shadow-[0_0_10px_rgba(30,58,138,0.3)]" style={{ backgroundColor: group.color }} />
                  <h3 className="text-lg font-black tracking-tight uppercase text-[#334155] drop-shadow-sm">{group.title}</h3>
                  <span className="text-[10px] font-mono font-bold text-white bg-[#1E3A8A] px-2 py-0.5 rounded-full uppercase tracking-widest shadow-md">{group.items.length} Actividades</span>
               </div>
               <button onClick={() => onAddItem(group.id, 'Nueva Actividad')} className="flex items-center gap-2 px-4 py-1.5 bg-[#3B7EF8]/10 hover:bg-[#3B7EF8] text-[#3B7EF8] hover:text-white rounded-xl text-xs font-black uppercase tracking-widest transition-all border border-[#3B7EF8]/20">
                  <Plus size={14} /> Nueva Tarea
               </button>
            </div>

            <div className="overflow-x-auto custom-scrollbar">
              <div 
                className="grid h-10 border-b border-[var(--border-color)] bg-transparent text-[10px] items-center font-black uppercase tracking-widest text-[var(--text-secondary)]"
                style={{ gridTemplateColumns: `30px 6px 550px ${columns.map((c: Column) => `${c.width}px`).join(' ')} 1fr` }}
              >
                 <div />
                 <div />
                 <div className="pl-14">Actividad</div>
                 {columns.map((c: Column) => <div key={c.id} className="text-center">{c.title}</div>)}
              </div>

              <div className="min-w-max">
                {group.items.map(item => (
                  <SortableRow 
                    key={item.id} 
                    item={item} 
                    group={group} 
                    columns={columns}
                    onUpdateItem={onUpdateItem}
                    onUpdateItemValue={onUpdateItemValue}
                    onUpdateItemValues={onUpdateItemValues}
                    onOpenItem={onOpenItem}
                    getStatusColor={getStatusColor}
                    getPriorityColor={getPriorityColor}
                    getNextStatus={getNextStatus}
                    getNextPriority={getNextPriority}
                    activityTemplates={activityTemplates}
                    onAddSubItem={onAddSubItem}
                    onUpdateSubItemValue={onUpdateSubItemValue}
                    onDeleteItem={onDeleteItem}
                  />
                ))}
              </div>
            </div>
         </motion.div>
       ))}

       {isAdmin && (
         <button 
           onClick={onAddGroup}
           className="w-full py-8 rounded-3xl border-2 border-dashed border-[var(--border-color)] text-slate-600 hover:border-[#3B7EF8]/20 hover:text-[#3B7EF8] hover:bg-[#3B7EF8]/5 transition-all font-black uppercase tracking-[0.2em] text-xs"
         >
            + Añadir Nuevo Grupo de Sitio
         </button>
       )}
    </div>
  );
}
