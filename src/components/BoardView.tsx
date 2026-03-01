'use client';

import { useState, useEffect, useRef } from 'react';
import { ChevronDown, Plus, GripVertical, ChevronRight, CornerDownRight, Trash2 } from 'lucide-react';
import { Item, Group, Column, ActivityTemplate } from '@/types/monday';
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
import { Search } from 'lucide-react';
import ActivitySelector from '@/components/ActivitySelector';
import PersonnelPicker from './PersonnelPicker';

function EditableCell({ value, onSave, type = "text", className = "" }: { value: string | number, onSave: (val: string | number) => void, type?: string, className?: string }) {
  const [localValue, setLocalValue] = useState(value);
  
  // Use a ref to track the last saved value to avoid redundant saves
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
      className={className}
    />
  );
}

interface SortableRowProps {
  item: Item;
  group: Group;
  columns: Column[];
  onUpdateItem: (groupId: string, itemId: number | string, field: string, value: string | number | null) => void;
  onUpdateItemValue: (groupId: string, itemId: number | string, columnId: string, value: string | number | null) => void;
  onOpenItem: (groupId: string, item: Item) => void;
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
  onUpdateSubItemValue,
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

  // Sync local name when item changes from props
  useEffect(() => {
    const now = Date.now();
    if (now > ignorePropUpdatesUntil.current) {
        setLocalName(item.name);
    } else {
        // Protected: Ignoring prop update because local edit is fresh.
    }
  }, [item.name]);

  const handleNameBlur = () => {
    if (localName !== item.name) {
      ignorePropUpdatesUntil.current = Date.now() + 5000; // 5s protection
      onUpdateItem(group.id, item.id, 'name', localName);
    }
  };

  const handleSelectItem = (template: ActivityTemplate) => {
    setLocalName(template.name);
    ignorePropUpdatesUntil.current = Date.now() + 5000; // 5s protection
    onUpdateItem(group.id, item.id, 'name', template.name);
    
    // Batched update for dependent values
    onUpdateItemValues(group.id, item.id, {
      unit: template.unit || '',
      rend: template.rend || 0,
      unit_price: template.unit_price || 0,
      frequency: template.frequency || 25,
      category: template.category || '',
      zone: template.zone || null
    });
  };

  // Helper to get zone value from any column
  const getZoneValue = () => {
    // First try direct 'zone' key
    if (item.values['zone']) return item.values['zone'];
    
    // Then search in all values for any key that might be the zone column
    const zoneColumn = columns.find(col => col.title.toLowerCase().includes('zona'));
    if (zoneColumn && item.values[zoneColumn.id]) {
      return item.values[zoneColumn.id];
    }
    
    return null;
  };

  const getColValue = (col: Column) => {
    const val = item.values[col.id];
    if (val !== undefined && val !== null && val !== '') return val;
    
    // Try normalized keys if dynamic ID fails
    const title = col.title.toLowerCase();
    if (title.includes('rendimiento')) return item.values['rend'];
    if (title.includes('unidad')) return item.values['unit'];
    if (title.includes('cantidad')) return item.values['cant'];
    
    // Automatic calculation for Jornales Requerdios
    if (title.includes('jornal') || title.includes('jor. req')) {
       const rend = Number(item.values['rend'] || 0);
       const cant = Number(item.values['cant'] || 0);
       return (rend > 0 && cant > 0) ? (cant / rend).toFixed(2) : '-';
    }
    
    return val;
  };

  // Check if item is overdue
  const isOverdue = () => {
    const timeline = item.values['timeline'];
    if (!timeline || !timeline.to || item.values['status'] === 'Done') return false;
    const endDate = new Date(timeline.to + 'T23:59:59');
    return endDate < new Date();
  };

  // Calculate progress for visual indicator
  const getProgress = () => {
    const dailyExec = item.values['daily_execution'] || {};
    if (Object.keys(dailyExec).length === 0) return 0;
    const totalJor = Object.values(dailyExec).reduce((sum: number, entry: unknown) => {
      const val = typeof entry === 'object' && entry !== null ? (entry as { val?: number }).val || 0 : (parseFloat(String(entry)) || 0);
      return sum + val;
    }, 0);
    if (totalJor === 0) return 0;
    const doneJor = Object.values(dailyExec).reduce((sum: number, entry: unknown) => {
      const isDone = typeof entry === 'object' && entry !== null ? (entry as { done?: boolean }).done : true;
      const val = typeof entry === 'object' && entry !== null ? (entry as { val?: number }).val || 0 : (parseFloat(String(entry)) || 0);
      return sum + (isDone ? val : 0);
    }, 0);
    return Math.min(100, (doneJor / totalJor) * 100);
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

  return (
    <div ref={setNodeRef} style={style} className="contents">
      <div 
        className="group/row grid border-b border-gray-100 hover:bg-gray-50 transition-colors h-[36px] items-center bg-white"
        style={{ 
            gridTemplateColumns: `30px 6px 380px ${columns.map(c => `${c.width}px`).join(' ')} 1fr` 
        }}
      >
         {/* Drag Handle */}
         <div 
           {...attributes} 
           {...listeners} 
           className="flex items-center justify-center cursor-grab active:cursor-grabbing text-gray-300 hover:text-gray-500 opacity-0 group-hover/row:opacity-100 transition-opacity"
         >
            <GripVertical className="w-3 h-3" />
         </div>

         <div className="h-full w-full" style={{ backgroundColor: group.color }}></div>
         
         {/* Name Column */}
         <div className="pl-3 pr-4 border-r border-gray-100 h-full flex items-center">
              <button 
                onClick={() => setIsExpanded(!isExpanded)}
                className="mr-2 hover:bg-gray-100 rounded transition-colors"
                title={isExpanded ? "Contraer sub-ítems" : "Expandir sub-ítems"}
              >
                 {isExpanded ? <ChevronDown className="w-4 h-4 text-primary" /> : <ChevronRight className="w-4 h-4 text-gray-400" />}
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
                className="text-sm truncate w-full bg-transparent focus:outline-none focus:bg-gray-50 px-1 rounded font-medium"
              />
              {/* Zone Badge */}
              {(() => {
                const zoneValue = getZoneValue();
                return zoneValue && (
                  <span 
                    className="text-[9px] px-2 py-0.5 rounded-full font-bold ml-2 flex-shrink-0"
                    style={{
                      backgroundColor: zoneValue === 'Zonas Verdes' ? '#d1fae5' : 
                                     zoneValue === 'Zonas Duras' ? '#e5e7eb' : 
                                     '#fed7aa',
                      color: zoneValue === 'Zonas Verdes' ? '#065f46' : 
                            zoneValue === 'Zonas Duras' ? '#374151' : 
                            '#92400e'
                    }}
                  >
                    {zoneValue === 'Zonas Verdes' ? '🌿' : 
                     zoneValue === 'Zonas Duras' ? '🏗️' : 
                     '🏖️'}
                  </span>
                );
              })()}
              <div className="flex items-center ml-auto flex-shrink-0 space-x-2">
                {/* Progress Ring */}
                {Object.keys(item.values['daily_execution'] || {}).length > 0 && (
                  <div className="relative w-5 h-5">
                    <svg className="w-5 h-5 -rotate-90">
                      <circle cx="10" cy="10" r="8" stroke="#e5e7eb" strokeWidth="2" fill="none" />
                      <circle 
                        cx="10" 
                        cy="10" 
                        r="8" 
                        stroke={getProgress() === 100 ? '#00c875' : 'primary'}
                        strokeWidth="2" 
                        fill="none"
                        strokeDasharray={`${(getProgress() / 100) * 50.27} 50.27`}
                        strokeLinecap="round"
                      />
                    </svg>
                    <div className="absolute inset-0 flex items-center justify-center text-[6px] font-bold text-gray-600">
                      {Math.round(getProgress())}
                    </div>
                  </div>
                )}
                {/* Overdue Badge */}
                {isOverdue() && (
                  <div className="bg-red-500 text-white text-[8px] font-bold px-1.5 py-0.5 rounded-full uppercase tracking-tight">
                    Atrasado
                  </div>
                )}
                <button 
                  onClick={() => onAddSubItem(group.id, item.id)}
                  className="opacity-0 group-hover/row:opacity-100 text-gray-400 hover:text-primary transition-all"
                  title="Añadir sub-ítem"
                >
                   <Plus className="w-3.5 h-3.5" />
                </button>
                <button 
                  onClick={() => onDeleteItem(item.id)}
                  className="opacity-0 group-hover/row:opacity-100 text-gray-300 hover:text-red-500 transition-colors"
                  title="Eliminar"
                >
                   <Trash2 className="w-3.5 h-3.5" />
                </button>
                <button 
                  onClick={() => onOpenItem(group.id, item)}
                  className="opacity-0 group-hover/row:opacity-100 text-gray-400 hover:text-primary"
                >
                   <span className="text-[10px] border border-gray-300 px-1 rounded transition-colors hover:bg-white uppercase font-bold">Abrir</span>
                </button>
              </div>
         </div>
         
         {/* Dynamic Columns Rendering */}
         {columns.map(col => (
           <div key={col.id} className="border-r border-gray-100 h-full flex items-center justify-center">
              {col.type === 'people' && (
                <div className="relative">
                     <div 
                        className="w-6 h-6 rounded-full bg-[#a25ddc] flex items-center justify-center text-white text-[10px] cursor-pointer hover:opacity-80 transition-opacity" 
                        title={String(getColValue(col))}
                        onClick={(e) => {
                            e.stopPropagation();
                            const rect = e.currentTarget.getBoundingClientRect();
                            setActivePicker({ 
                                itemId: item.id, 
                                colId: col.id,
                                position: { top: rect.bottom + 5, left: rect.left }
                            });
                        }}
                     >
                        {String(getColValue(col) || '?').charAt(0)}
                     </div>
                     {activePicker?.itemId === item.id && activePicker?.colId === col.id && (
                        <PersonnelPicker 
                            currentValue={String(getColValue(col))}
                            onSelect={(id, name) => {
                                onUpdateItemValue(group.id, item.id, col.id, name); 
                                setActivePicker(null);
                            }}
                            onClose={() => setActivePicker(null)}
                            position={activePicker.position}
                        />
                     )}
                </div>
              )}

              {col.type === 'status' && (
                <button 
                  onClick={() => onUpdateItemValue(group.id, item.id, col.id, getNextStatus(getColValue(col)))}
                  className={`${getStatusColor(getColValue(col))} w-full h-full text-white text-xs font-medium flex items-center justify-center transition-all hover:opacity-90`}
                >
                   {getColValue(col) === 'Done' ? 'Listo' : 
                    getColValue(col) === 'Working on it' ? 'En proceso' : 
                    getColValue(col) === 'Stuck' ? 'Detenido' : 
                    getColValue(col) === 'Not Started' ? 'Sin iniciar' : getColValue(col)}
                </button>
              )}

              {col.type === 'date' && (
                <span className="text-xs text-gray-500">{getColValue(col)}</span>
              )}

              {col.type === 'priority' && (
                <button 
                  onClick={() => onUpdateItemValue(group.id, item.id, col.id, getNextPriority(getColValue(col)))}
                  className={`${getPriorityColor(getColValue(col))} w-full h-full text-white text-[10px] uppercase font-bold flex items-center justify-center transition-all hover:opacity-90`}
                >
                   {getColValue(col) === 'High' ? 'Alta' : 
                    getColValue(col) === 'Critical' ? 'Crítica' : 
                    getColValue(col) === 'Medium' ? 'Media' : 
                    getColValue(col) === 'Low' ? 'Baja' : getColValue(col)}
                </button>
              )}

              {/* Zone Column - Special handling */}
              {(col.id === 'zone' || col.title.toLowerCase().includes('zona')) && (
                <select
                  value={getColValue(col) || ''}
                  onChange={(e) => onUpdateItemValue(group.id, item.id, col.id, e.target.value || null)}
                  className="w-full h-full bg-transparent text-[10px] font-bold text-center focus:outline-none focus:bg-green-50 rounded cursor-pointer"
                  style={{
                    backgroundColor: getColValue(col) === 'Zonas Verdes' ? '#d1fae5' : 
                                   getColValue(col) === 'Zonas Duras' ? '#e5e7eb' : 
                                   getColValue(col) === 'Zona de Playa' ? '#fed7aa' : 'transparent',
                    color: getColValue(col) === 'Zonas Verdes' ? '#065f46' : 
                          getColValue(col) === 'Zonas Duras' ? '#374151' : 
                          getColValue(col) === 'Zona de Playa' ? '#92400e' : '#6b7280'
                  }}
                >
                  <option value="">Sin zona</option>
                  <option value="Zonas Verdes">🌿 Zonas Verdes</option>
                  <option value="Zonas Duras">🏗️ Zonas Duras</option>
                  <option value="Zona de Playa">🏖️ Zona de Playa</option>
                </select>
              )}

              {/* APU Category Column */}
              {(col.id === 'category' || col.title.toLowerCase().includes('categor')) && (
                <select
                  value={getColValue(col) || ''}
                  onChange={(e) => onUpdateItemValue(group.id, item.id, col.id, e.target.value || null)}
                  className="w-full h-full bg-transparent text-[10px] font-bold text-center focus:outline-none focus:bg-blue-50 rounded cursor-pointer appearance-none hover:bg-gray-50"
                  style={{
                      color: getColValue(col) === 'Nomina' ? '#2563eb' :
                             getColValue(col) === 'Insumos' ? '#d97706' :
                             getColValue(col) === 'Equipos' ? '#7c3aed' :
                             getColValue(col) === 'Transporte' ? '#059669' : '#374151'
                  }}
                >
                  <option value="">Seleccionar...</option>
                  <option value="Nomina">👷 Nómina</option>
                  <option value="Insumos">🧱 Insumos</option>
                  <option value="Equipos">🚜 Equipos</option>
                  <option value="Transporte">🚚 Transporte</option>
                  <option value="Administrativo">📋 Administrativo</option>
                </select>
              )}

              {col.type === 'text' && !(col.id === 'zone' || col.title.toLowerCase().includes('zona')) && (
                <EditableCell 
                  value={getColValue(col) || ''}
                  onSave={(val) => onUpdateItemValue(group.id, item.id, col.id, val)}
                  className="w-full h-full bg-transparent text-xs text-center focus:outline-none focus:bg-green-50 rounded"
                />
              )}

              {(col.type === 'number' || col.type === 'numbers') && (
                <div className="w-full h-full flex items-center justify-center">
                  {(col.title.toLowerCase().includes('jornal') || col.title.toLowerCase().includes('jor. req')) ? (
                    <span className="text-xs font-bold text-primary">{getColValue(col)}</span>
                  ) : (
                    <EditableCell 
                      type="number"
                      value={getColValue(col) || 0}
                      onSave={(val) => onUpdateItemValue(group.id, item.id, col.id, val)}
                      className="w-full h-full bg-transparent text-xs text-center focus:outline-none focus:bg-green-50 rounded"
                    />
                  )}
                </div>
              )}
           </div>
         ))}
         
         <div className="h-full w-full"></div>
      </div>

      {/* Sub-items list */}
      <AnimatePresence>
        {isExpanded && item.subItems && item.subItems.length > 0 && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            className="overflow-visible"
          >
             {item.subItems.map(subItem => (
               <SubItemRow 
                 key={subItem.id}
                 item={subItem}
                 parentItemId={item.id}
                 group={group}
                 columns={columns}
                 onUpdateSubItemValue={onUpdateSubItemValue}
                 getStatusColor={getStatusColor}
                 getNextStatus={getNextStatus}
                 getPriorityColor={getPriorityColor}
                 getNextPriority={getNextPriority}
                 onDeleteItem={onDeleteItem}
               />
             ))}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

interface SubItemRowProps {
  item: Item;
  parentItemId: number | string;
  group: Group;
  columns: Column[];
  onUpdateSubItemValue: (groupId: string, parentId: number | string, subItemId: number | string, columnId: string, value: any) => void;
  getStatusColor: (status: string) => string;
  getNextStatus: (currentStatus: string) => string;
  getPriorityColor: (priority: string) => string;
  getNextPriority: (currentPriority: string) => string;
}

function SubItemRow({ 
  item, 
  parentItemId,
  group, 
  columns, 
  onUpdateSubItemValue,
  getStatusColor,
  getNextStatus,
  getPriorityColor,
  getNextPriority,
  onDeleteItem
}: SubItemRowProps & { onDeleteItem: (id: string | number) => void }) {
  const getColValue = (col: Column) => {
    const val = item.values[col.id];
    if (val !== undefined && val !== null && val !== '') return val;
    
    // Try normalized keys if dynamic ID fails
    const title = col.title.toLowerCase();
    if (title.includes('rendimiento')) return item.values['rend'];
    if (title.includes('unidad')) return item.values['unit'];
    if (title.includes('cantidad')) return item.values['cant'];
    
    // Automatic calculation for Jornales Requerdios
    if (title.includes('jornal') || title.includes('jor. req')) {
       const rend = Number(item.values['rend'] || 0);
       const cant = Number(item.values['cant'] || 0);
       return (rend > 0 && cant > 0) ? (cant / rend).toFixed(2) : '-';
    }
    
    return val;
  };

  return (
    <div 
      className="grid border-b border-gray-100 hover:bg-gray-50 transition-colors h-[32px] items-center bg-white/50 group/subrow"
      style={{ 
          gridTemplateColumns: `30px 6px 30px 350px ${columns.map(c => `${c.width}px`).join(' ')} 1fr` 
      }}
    >
       <div></div>
       <div className="h-full w-full opacity-30" style={{ backgroundColor: group.color }}></div>
       <div className="flex items-center justify-center text-gray-300">
          <CornerDownRight className="w-3 h-3" />
       </div>
       
       {/* Name Column */}
       <div className="pl-3 pr-4 border-r border-gray-100 h-full flex items-center justify-between">
            <span className="text-xs text-gray-700 truncate">{item.name}</span>
            <button 
                onClick={() => {
                    if (confirm(`¿Eliminar sub-ítem "${item.name}"?`)) {
                        onDeleteItem(item.id);
                    }
                }}
                className="opacity-0 group-hover/subrow:opacity-100 text-gray-300 hover:text-red-500 transition-colors"
                title="Eliminar sub-ítem"
            >
                <Trash2 className="w-3 h-3" />
            </button>
       </div>
       
       {/* Dynamic Columns Rendering */}
       {columns.map(col => (
         <div key={col.id} className="border-r border-gray-100 h-full flex items-center justify-center">
            {col.type === 'status' && (
              <button 
                onClick={() => onUpdateSubItemValue(group.id, parentItemId, item.id, col.id, getNextStatus(getColValue(col)))}
                className={`${getStatusColor(getColValue(col))} w-full h-full text-white text-[10px] font-medium flex items-center justify-center transition-all hover:opacity-90`}
              >
                 {getColValue(col) === 'Done' ? 'Listo' : 
                  getColValue(col) === 'Working on it' ? 'En proceso' : 
                  getColValue(col) === 'Stuck' ? 'Detenido' : 
                  getColValue(col) === 'Not Started' ? 'Sin iniciar' : getColValue(col)}
              </button>
            )}

            {col.type === 'priority' && (
              <button 
                onClick={() => onUpdateSubItemValue(group.id, parentItemId, item.id, col.id, getNextPriority(getColValue(col)))}
                className={`${getPriorityColor(getColValue(col))} w-full h-full text-white text-[9px] uppercase font-bold flex items-center justify-center transition-all hover:opacity-90`}
              >
                 {getColValue(col) === 'High' ? 'Alta' : 
                  getColValue(col) === 'Critical' ? 'Crítica' : 
                  getColValue(col) === 'Medium' ? 'Media' : 
                  getColValue(col) === 'Low' ? 'Baja' : getColValue(col)}
              </button>
            )}

            {col.type === 'date' && (
              <span className="text-[10px] text-gray-500">{getColValue(col)}</span>
            )}

            {col.type === 'text' && (
              <span className="text-[10px] text-gray-600 truncate px-2">{getColValue(col)}</span>
            )}
            
            {col.type === 'number' && (
              <span className="text-[10px] text-gray-600 truncate px-2">{getColValue(col)}</span>
            )}
            
            {col.type === 'people' && (
              <div className="w-5 h-5 rounded-full bg-gray-200 flex items-center justify-center text-[8px] text-gray-600">
                 {String(getColValue(col) || '?').charAt(0)}
              </div>
            )}
         </div>
       ))}
       
       <div className="h-full w-full"></div>
    </div>
  );
}

interface BoardViewProps {
  groups: Group[];
  columns: Column[];
  onAddItem: (groupId: string, name: string, templateValues?: { unit?: string, rend?: number }) => void;
  onUpdateItem: (groupId: string, itemId: number | string, field: string, value: string | number | null) => void;
  onUpdateItemValue: (groupId: string, itemId: number | string, columnId: string, value: string | number | null) => void;
  onUpdateItemValues: (groupId: string, itemId: number | string, updates: Record<string, string | number | null>) => void;
  onOpenItem: (groupId: string, item: Item) => void;
  onAddSubItem: (groupId: string, itemId: number | string) => void;
  onUpdateSubItemValue: (groupId: string, parentId: number | string, subItemId: number | string, columnId: string, value: string | number | null) => void;
  onDeleteItem: (itemId: number | string) => void;
  onAddGroup: () => void;
  onUpdateGroup: (groupId: string, field: string, value: string) => void;
  onAddColumn: (type: string) => void;
  activityTemplates: ActivityTemplate[];
  isAdmin?: boolean;
  onCreateTemplate?: (template: Omit<ActivityTemplate, 'id' | 'created_at'>) => Promise<ActivityTemplate | void>;
}

export default function BoardView({ 
  groups, 
  columns, 
  onAddItem, 
  onUpdateItem, 
  onUpdateItemValue, 
  onOpenItem, 
  onAddSubItem,
  onUpdateSubItemValue,
  onDeleteItem,
  onAddGroup, 
  onUpdateGroup,
  onAddColumn,
  activityTemplates,
  isAdmin,
  onCreateTemplate,
  onUpdateItemValues,
}: BoardViewProps) {
  const initialFilteredGroups = groups.filter(g => g.title.toUpperCase() !== 'PRESUPUESTO GENERAL');
  const [localGroups, setLocalGroups] = useState<Group[]>(initialFilteredGroups);
  const [newItemNames, setNewItemNames] = useState<Record<string, string>>({});
  const [editingGroup, setEditingGroup] = useState<string | null>(null);
  const [localGroupTitle, setLocalGroupTitle] = useState('');
  const [collapsedGroups, setCollapsedGroups] = useState<Record<string, boolean>>({});
  const [activeId, setActiveId] = useState<string | number | null>(null);

  useEffect(() => {
    setLocalGroups(groups.filter(g => g.title.toUpperCase() !== 'PRESUPUESTO GENERAL'));
  }, [groups]);

  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: {
        distance: 8,
      },
    }),
    useSensor(KeyboardSensor)
  );

  const toggleGroup = (groupId: string) => {
    setCollapsedGroups(prev => ({ ...prev, [groupId]: !prev[groupId] }));
  };

  const handleDragStart = (event: DragStartEvent) => {
    setActiveId(event.active.id);
  };

  const handleDragOver = (event: DragOverEvent) => {
    const { active, over } = event;
    if (!over) return;

    const activeId = active.id;
    const overId = over.id;

    // Find source and container
    const activeGroup = localGroups.find(g => g.items.some(i => i.id === activeId));
    
    // Find overGroup. 
    // overId could be an item ID or a group ID (if we make group sortable, but we only have SortableContext on items).
    // If overId is a group ID (e.g. dropped on an empty group placeholder), handle that.
    // For now, assuming overId is an item ID.
    const overGroup = localGroups.find(g => g.items.some(i => i.id === overId)) || localGroups.find(g => g.id === overId);

    if (!activeGroup || !overGroup) return;

    if (activeGroup.id === overGroup.id) {
       // Sorting within same group
       // We can optionally implement reordering here for visual feedback
       /*
       const oldIndex = activeGroup.items.findIndex(i => i.id === activeId);
       const newIndex = activeGroup.items.findIndex(i => i.id === overId);
       if (oldIndex !== newIndex) {
          const newItems = arrayMove(activeGroup.items, oldIndex, newIndex);
          const newGroups = localGroups.map(g => g.id === activeGroup.id ? { ...g, items: newItems } : g);
          setLocalGroups(newGroups);
       }
       */
       return;
    }

    // Moving between groups
    const activeItem = activeGroup.items.find(i => i.id === activeId);
    if (!activeItem) return;

    setLocalGroups(prev => {
        const sourceGroupIndex = prev.findIndex(g => g.id === activeGroup.id);
        const destGroupIndex = prev.findIndex(g => g.id === overGroup.id);

        if (sourceGroupIndex === -1 || destGroupIndex === -1) return prev;

        const newSourceItems = prev[sourceGroupIndex].items.filter(i => i.id !== activeId);
        const newDestItems = [...prev[destGroupIndex].items];

        // Insert at the position of overId if it's an item
        const overItemIndex = prev[destGroupIndex].items.findIndex(i => i.id === overId);
        
        let newItem = { ...activeItem, group_id: overGroup.id }; // Optimistic update of group_id

        if (overItemIndex >= 0) {
            newDestItems.splice(overItemIndex, 0, newItem);
        } else {
            newDestItems.push(newItem);
        }

        const newGroups = [...prev];
        newGroups[sourceGroupIndex] = { ...prev[sourceGroupIndex], items: newSourceItems };
        newGroups[destGroupIndex] = { ...prev[destGroupIndex], items: newDestItems };

        return newGroups;
    });
  };

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    setActiveId(null);
    if (!over) {
        setLocalGroups(groups); // Revert if dropped outside
        return;
    }

    const activeId = active.id;
    const overId = over.id;

    // We can rely on localGroups to find where it ended up, OR verify against original 'groups' to see what changed.
    // However, handleDragOver has been mutating localGroups. 
    // The safest way to commit is to find the NEW group of the item in localGroups.
    
    const newGroup = localGroups.find(g => g.items.some(i => i.id === activeId));
    const oldGroup = groups.find(g => g.items.some(i => i.id === activeId));

    if (newGroup && oldGroup && newGroup.id !== oldGroup.id) {
        onUpdateItem(oldGroup.id, activeId, 'group_id', newGroup.id);
    } else {
        // If it's same group, check for reorder if we implement 'position' later.
        // For now, if same group, we might want to revert localGroups to server state to ensure consistency
        // or keep it if we want to visually keep the reorder (but it won't persist on refresh).
        // Let's revert to be safe until 'position' is supported.
        setLocalGroups(groups);
    }
  };

  const colors = [
    '#2d7a5e', '#a25ddc', '#e2445c', '#00c875', '#fdab3d', 
    '#579bfc', '#ff3d57', '#9d5334', '#c4c4c4', '#333333'
  ];

  // ... (color and status helper functions remain same)

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'Done': return 'bg-[#00c875] hover:bg-[#00b469]';
      case 'Working on it': return 'bg-[#fdab3d] hover:bg-[#eb9d36]';
      case 'Stuck': return 'bg-[#e2445c] hover:bg-[#cf3d53]';
      case 'Not Started': return 'bg-[#c4c4c4] hover:bg-[#b0b0b0]';
      default: return 'bg-[#c4c4c4]';
    }
  };

  const getNextStatus = (currentStatus: string) => {
    const statuses = ['Not Started', 'Working on it', 'Stuck', 'Done'];
    const currentIndex = statuses.indexOf(currentStatus);
    const nextIndex = (currentIndex + 1) % statuses.length;
    return statuses[nextIndex];
  };

  const getPriorityColor = (priority: string) => {
    switch (priority) {
      case 'High': return 'bg-[#401694]';
      case 'Critical': return 'bg-[#333333]';
      case 'Medium': return 'bg-[#5559df]';
      case 'Low': return 'bg-[#579bfc]';
      default: return 'bg-gray-400';
    }
  };

  const getNextPriority = (currentPriority: string) => {
    const priorities = ['Low', 'Medium', 'High', 'Critical'];
    const currentIndex = priorities.indexOf(currentPriority);
    const nextIndex = (currentIndex + 1) % priorities.length;
    return priorities[nextIndex];
  };

  const handleKeyDown = (e: React.KeyboardEvent, groupId: string) => {
    if (e.key === 'Enter') {
      const name = newItemNames[groupId];
      if (name && name.trim()) {
        onAddItem(groupId, name);
        setNewItemNames(prev => ({ ...prev, [groupId]: '' }));
      }
    }
  };

  const handleSelectItem = (groupId: string, template: ActivityTemplate) => {
    onAddItem(groupId, template.name, { unit: template.unit, rend: template.rend });
    setNewItemNames(prev => ({ ...prev, [groupId]: '' }));
  };

  return (
    <DndContext 
      sensors={sensors}
      collisionDetection={closestCorners}
      onDragStart={handleDragStart}
      onDragOver={handleDragOver}
      onDragEnd={handleDragEnd}
    >
    <div className="space-y-10 pb-20 overflow-x-auto">
       <AnimatePresence>
       {localGroups.map((group) => (
          <motion.div 
            layout
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95 }}
            key={group.id} 
            className="relative min-w-fit"
          >
             {/* Group Header */}
             <div className="flex items-center mb-2 group/header">
                <ChevronDown 
                  onClick={() => toggleGroup(group.id)}
                  className={`w-4 h-4 text-primary mr-2 cursor-pointer transition-transform duration-200 ${collapsedGroups[group.id] ? '-rotate-90' : ''}`} 
                />
                <div className="flex items-center group/title relative">
                   <div className="relative group/picker">
                      <button 
                        className="w-4 h-4 rounded-sm mr-2 transition-transform hover:scale-110" 
                        style={{ backgroundColor: group.color }}
                      />
                      {/* Simple Color Picker Dropdown */}
                      <div className="absolute top-6 left-0 bg-white shadow-xl border border-gray-200 p-2 rounded-lg z-50 hidden group-hover/picker:grid grid-cols-5 gap-1 w-[120px]">
                         {colors.map(c => (
                           <button 
                             key={c} 
                             onClick={() => onUpdateGroup(group.id, 'color', c)}
                             className="w-4 h-4 rounded-sm hover:scale-110 transition-transform"
                             style={{ backgroundColor: c }}
                           />
                         ))}
                      </div>
                   </div>

                   {editingGroup === group.id ? (
                      <input 
                        autoFocus
                        value={localGroupTitle}
                        onChange={(e) => setLocalGroupTitle(e.target.value)}
                        onBlur={() => {
                          if (localGroupTitle !== group.title) {
                            onUpdateGroup(group.id, 'title', localGroupTitle);
                          }
                          setEditingGroup(null);
                        }}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') {
                            if (localGroupTitle !== group.title) {
                              onUpdateGroup(group.id, 'title', localGroupTitle);
                            }
                            setEditingGroup(null);
                          }
                        }}
                        className="text-lg font-bold bg-gray-50 border-none focus:ring-2 focus:ring-primary px-1 rounded transition-all"
                        style={{ color: group.color }}
                      />
                   ) : (
                      <h3 
                        onClick={() => {
                          setLocalGroupTitle(group.title);
                          setEditingGroup(group.id);
                        }}
                        className="text-lg font-bold cursor-pointer hover:bg-gray-100 px-1 rounded transition-colors" 
                        style={{ color: group.color }}
                      >
                         {group.title}
                      </h3>
                   )}
                </div>
                <span className="text-gray-400 text-sm ml-4 font-normal">{group.items.length} elementos</span>
             </div>

             {/* Table structure with dynamic columns */}
             <AnimatePresence initial={false}>
                {!collapsedGroups[group.id] && (
                   <motion.div 
                     initial={{ height: 0, opacity: 0 }}
                     animate={{ height: 'auto', opacity: 1 }}
                     exit={{ height: 0, opacity: 0 }}
                     transition={{ duration: 0.3, ease: 'easeInOut' }}
                      className="inline-block min-w-full !overflow-visible"
                   >
                      {/* Table Header */}
                      <div 
                        className="grid border-b border-gray-200 pb-2 mb-1 sticky top-0 bg-white z-10"
                        style={{ 
                          gridTemplateColumns: `30px 6px 380px ${columns.map(c => `${c.width}px`).join(' ')} 1fr` 
                        }}
                      >
                         <div></div>
                         <div></div>
                         <div className="text-xs text-gray-400 pl-2">Elemento</div>
                         {columns.map(col => (
                           <div key={col.id} className="text-xs text-gray-400 text-center font-semibold">{col.title}</div>
                         ))}
                         <div className="flex items-center justify-center relative group/addcol">
                            <button className="text-gray-400 hover:text-primary hover:bg-gray-100 rounded px-1 transition-colors">
                              <Plus className="w-3 h-3" />
                            </button>
                            {/* Column Type Select */}
                            <div className="absolute top-6 right-0 bg-white shadow-xl border border-gray-200 py-2 rounded-lg z-50 hidden group-hover/addcol:block w-[150px]">
                              <button onClick={() => onAddColumn('text')} className="w-full text-left px-4 py-2 text-sm hover:bg-gray-100 flex items-center">Texto</button>
                              <button onClick={() => onAddColumn('number')} className="w-full text-left px-4 py-2 text-sm hover:bg-gray-100 flex items-center">Número</button>
                              <button onClick={() => onAddColumn('date')} className="w-full text-left px-4 py-2 text-sm hover:bg-gray-100 flex items-center">Fecha</button>
                            </div>
                         </div>
                      </div>

                      {/* Table Rows */}
                      <div className="bg-white shadow-sm border border-gray-200 rounded-lg">
                         <SortableContext items={group.items.map(i => i.id)} strategy={verticalListSortingStrategy}>
                            {group.items.map((item) => (
                              <SortableRow 
                                key={item.id}
                                item={item}
                                group={group}
                                columns={columns}
                                onUpdateItem={onUpdateItem}
                                onUpdateItemValue={onUpdateItemValue}
                                onUpdateItemValues={onUpdateItemValues}
                                onOpenItem={onOpenItem}
                                onAddSubItem={onAddSubItem}
                                onUpdateSubItemValue={onUpdateSubItemValue}
                                getStatusColor={getStatusColor}
                                getNextStatus={getNextStatus}
                                getPriorityColor={getPriorityColor}
                                getNextPriority={getNextPriority}
                                onDeleteItem={onDeleteItem}
                                activityTemplates={activityTemplates}
                                isAdmin={isAdmin}
                                onCreateTemplate={onCreateTemplate}
                              />
                            ))}
                         </SortableContext>
                         
                         {/* Add Item Row */}
                         <div 
                          className="grid grid-cols-[30px_6px_1fr] h-[36px] border-t border-gray-100 items-center"
                         >
                            <div></div>
                            <div className="h-full w-full rounded-bl-lg" style={{ backgroundColor: group.color }}></div>
                            <div className="pl-3 flex items-center h-full">
                                <ActivitySelector 
                                 value={newItemNames[group.id] || ''}
                                 templates={activityTemplates}
                                 isAdmin={isAdmin}
                                 onCreateTemplate={onCreateTemplate}
                                 onChange={(val) => setNewItemNames(prev => ({ ...prev, [group.id]: val }))}
                                 onEnter={() => {
                                   const name = newItemNames[group.id];
                                   if (name && name.trim()) {
                                     onAddItem(group.id, name);
                                     setNewItemNames(prev => ({ ...prev, [group.id]: '' }));
                                   }
                                 }}
                                 onSelect={(template) => handleSelectItem(group.id, template)}
                                 placeholder="+ Añadir Elemento" 
                                 className="text-sm text-gray-400 focus:text-gray-800 placeholder-gray-400 focus:outline-none bg-transparent w-full"
                               />
                            </div>
                         </div>
                      </div>
                   </motion.div>
                )}
             </AnimatePresence>
          </motion.div>
       ))}
       </AnimatePresence>

       {/* Add Group Button */}
       <div className="mt-8">
          <button 
            onClick={onAddGroup}
            className="flex items-center text-gray-500 hover:text-primary hover:bg-gray-100 px-4 py-2 rounded-md transition-all font-medium text-sm group"
          >
             <div className="w-5 h-5 rounded-full border border-dashed border-gray-400 flex items-center justify-center mr-2 group-hover:border-primary transition-colors">
                <Plus className="w-3 h-3" />
             </div>
             + Añadir Nuevo Grupo
          </button>
       </div>

       {/* Drag Overlay */}
       <DragOverlay>
          {activeId ? (
             <div className="bg-white border border-primary shadow-2xl rounded p-2 opacity-90 w-[400px] flex items-center">
                <div className="w-2 h-2 rounded-full mr-2" style={{ backgroundColor: 'var(--color-primary)' }}></div>
                <span className="font-medium text-sm text-gray-800">Moviendo elemento...</span>
             </div>
          ) : null}
       </DragOverlay>
    </div>
    </DndContext>
  );
}
