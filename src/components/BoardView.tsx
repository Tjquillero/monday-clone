'use client';

import { useState, useEffect, useRef } from 'react';
import { ChevronDown, Plus, GripVertical, ChevronRight, CornerDownRight, Trash2, MapPin, Settings2, Leaf, Umbrella, Layers } from 'lucide-react';
import { Item, Group, Column, ColumnType, ActivityTemplate } from '@/types/monday';
import { getColumnValueKey } from '@/utils/columnUtils';
import { CellRenderer } from '@/components/columns/CellRenderer';
import { ColumnEditorPanel } from '@/components/columns/ColumnEditorPanel';
import { AddColumnButton } from '@/components/columns/AddColumnButton';
import { SortableColumnHeader } from '@/components/columns/SortableColumnHeader';
import { LocationPicker } from '@/components/LocationPicker';
import {
  SortableContext,
  verticalListSortingStrategy,
  horizontalListSortingStrategy,
  useSortable,
  arrayMove
} from '@dnd-kit/sortable';
import {
  DndContext,
  closestCorners,
  closestCenter,
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
    return zoneColumn ? item.values[getColumnValueKey(zoneColumn)] : null;
  };

  const getColValue = (col: Column) => {
    if (!col) return null;
    const val = item.values[getColumnValueKey(col)];
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
             <CellRenderer
               column={col}
               item={item}
               onUpdate={(key, value) => onUpdateItemValue(group.id, item.id, key, value)}
               override={col.type === 'people' ? (
                 <div
                   className="flex items-center gap-2 px-3 py-1 bg-slate-500/5 rounded-xl border border-[var(--border-color)] hover:bg-white/10 transition-all cursor-pointer group/avatar"
                   onClick={(e) => {
                     e.stopPropagation();
                     const rect = e.currentTarget.getBoundingClientRect();
                     setActivePicker({ itemId: item.id, colId: getColumnValueKey(col), position: { top: rect.bottom + 5, left: rect.left } });
                   }}
                 >
                   <div className={`w-6 h-6 rounded-full ${getAvatarColor(responsible)} flex items-center justify-center text-white text-[10px] font-black uppercase border border-white/20 shadow-lg`}>
                     {responsible.charAt(0)}
                   </div>
                   <span className="text-[10px] font-bold text-slate-400 group-hover/avatar:text-[var(--text-primary)] transition-colors hidden xl:inline">{responsible}</span>
                   {activePicker?.itemId === item.id && activePicker?.colId === getColumnValueKey(col) && (
                     <PersonnelPicker
                       currentValue={responsible}
                       onSelect={(id, name) => { onUpdateItemValue(group.id, item.id, getColumnValueKey(col), name); setActivePicker(null); }}
                       onClose={() => setActivePicker(null)}
                       position={activePicker.position}
                     />
                   )}
                 </div>
               ) : undefined}
             />
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
                   {columns.map(c => <div key={c.id} className="text-center text-[10px] text-[var(--text-secondary)]">{(subItem.values as any)[getColumnValueKey(c)] || '-'}</div>)}
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
  onUpdateColumn?: (columnId: string, updates: Partial<Column>) => void;
  onDeleteColumn?: (columnId: string) => void;
  onAddColumn?: (type: ColumnType) => void;
  onReorderColumns?: (orderedIds: string[]) => void;
  activityTemplates: ActivityTemplate[];
  isAdmin?: boolean;
  onCreateTemplate?: (template: Omit<ActivityTemplate, 'id' | 'created_at'>) => Promise<ActivityTemplate | void>;
}

export default function BoardView({
  groups, columns, onAddItem, onUpdateItem, onUpdateItemValue, onOpenItem, onAddSubItem, onAddGroup,
  activityTemplates, isAdmin, onCreateTemplate, onUpdateItemValues, onDeleteItem, onUpdateSubItemValue,
  onUpdateColumn, onDeleteColumn, onAddColumn, onReorderColumns,
}: BoardViewProps) {
  const [localGroups, setLocalGroups] = useState<Group[]>(groups);
  const [localColumns, setLocalColumns] = useState<Column[]>(columns);
  const [activeId, setActiveId] = useState<any>(null);
  const [colDragActiveId, setColDragActiveId] = useState<string | null>(null);
  const [editingColumn, setEditingColumn] = useState<Column | null>(null);
  const scrollContainerRef = useRef<HTMLDivElement>(null);

  useEffect(() => { setLocalGroups(groups); }, [groups]);
  // Sync localColumns from prop — but NOT while a column drag is in progress
  const colDraggingRef = useRef(false);
  useEffect(() => {
    if (!colDraggingRef.current) setLocalColumns(columns);
  }, [columns]);

  // Sensors for the column DndContext — separate from the outer item/group sensors
  const colSensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
  );

  const handleColumnDragStart = (event: DragStartEvent) => {
    colDraggingRef.current = true;
    setColDragActiveId(String(event.active.id));
  };

  const handleColumnDragEnd = (event: DragEndEvent) => {
    colDraggingRef.current = false;
    setColDragActiveId(null);
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    const oldIndex = localColumns.findIndex(c => c.id === active.id);
    const newIndex = localColumns.findIndex(c => c.id === over.id);
    if (oldIndex === -1 || newIndex === -1) return;
    const reordered = arrayMove(localColumns, oldIndex, newIndex);
    setLocalColumns(reordered);
    onReorderColumns?.(reordered.map(c => c.id));
  };

  const activeColForOverlay = colDragActiveId
    ? localColumns.find(c => c.id === colDragActiveId)
    : null;


  return (
    <div className="relative">
    {/* Column editor side-panel */}
    {editingColumn && onUpdateColumn && (
      <div className="fixed inset-y-0 right-0 w-80 z-50 flex flex-col bg-[var(--bg-primary)] border-l border-[var(--border-color)] shadow-2xl">
        <ColumnEditorPanel
          column={editingColumn}
          onUpdate={(updates) => { onUpdateColumn(editingColumn.id, updates); setEditingColumn(null); }}
          onDelete={() => { onDeleteColumn?.(editingColumn.id); setEditingColumn(null); }}
          onClose={() => setEditingColumn(null)}
        />
      </div>
    )}
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

            <div className="overflow-x-auto custom-scrollbar" ref={scrollContainerRef}>
              {/* Column header row — isolated DndContext so it doesn't conflict
                  with the outer item/group DndContext in BoardViewContainer.
                  'Nombre' column is pinned (disabled drag). */}
              <DndContext
                sensors={colSensors}
                collisionDetection={closestCenter}
                onDragStart={handleColumnDragStart}
                onDragEnd={handleColumnDragEnd}
                autoScroll={{ layoutShiftCompensation: false }}
              >
                <SortableContext
                  items={localColumns.map(c => c.id)}
                  strategy={horizontalListSortingStrategy}
                >
                  <div
                    className="grid h-10 border-b border-[var(--border-color)] bg-transparent text-[10px] items-center font-black uppercase tracking-widest text-[var(--text-secondary)]"
                    style={{ gridTemplateColumns: `30px 6px 550px ${localColumns.map((c: Column) => `${c.width}px`).join(' ')} 1fr` }}
                  >
                    <div />
                    <div />
                    <div className="pl-14">Actividad</div>
                    {localColumns.map((c: Column) => (
                      <SortableColumnHeader
                        key={c.id}
                        column={c}
                        isAdmin={isAdmin}
                        isEditing={editingColumn?.id === c.id}
                        onEdit={onUpdateColumn ? (col) => setEditingColumn(editingColumn?.id === col.id ? null : col) : undefined}
                      />
                    ))}
                    {isAdmin && onAddColumn && (
                      <div className="flex items-center">
                        <AddColumnButton onAdd={onAddColumn} />
                      </div>
                    )}
                  </div>
                </SortableContext>

                {/* Floating ghost column while dragging */}
                <DragOverlay dropAnimation={null}>
                  {activeColForOverlay && (
                    <div
                      className="flex items-center justify-center gap-1 h-10 rounded-lg border border-[#3B7EF8]/40 bg-[#3B7EF8]/10 text-[10px] font-black uppercase tracking-widest text-[#3B7EF8] shadow-xl backdrop-blur-sm px-3"
                      style={{ width: `${activeColForOverlay.width ?? 120}px`, cursor: 'grabbing' }}
                    >
                      <GripVertical size={11} className="opacity-60" />
                      <span className="truncate">{activeColForOverlay.title}</span>
                    </div>
                  )}
                </DragOverlay>
              </DndContext>

              <div className="min-w-max">
                {group.items.map(item => (
                  <SortableRow
                    key={item.id}
                    item={item}
                    group={group}
                    columns={localColumns}
                    onUpdateItem={onUpdateItem}
                    onUpdateItemValue={onUpdateItemValue}
                    onUpdateItemValues={onUpdateItemValues}
                    onOpenItem={onOpenItem}
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
    </div>
  );
}
