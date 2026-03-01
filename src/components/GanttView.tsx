'use client';

import { Group, Item, Column, Dependency } from '@/types/monday';
import { motion } from 'framer-motion';
import { ChevronRight, Clock, Link as LinkIcon, Plus, Trash2, Calendar as CalendarIcon, X } from 'lucide-react';
import { useState, useMemo, useRef, useEffect, useCallback, memo } from 'react';
import { useVirtualizer } from '@tanstack/react-virtual';
import DateRangeModal from './DateRangeModal';
import { useUI } from '@/contexts/UIContext';

interface GanttViewProps {
  groups: Group[];
  onOpenItem?: (groupId: string, item: Item) => void;
  onAddItem?: (groupId: string, name: string) => void;
  onDeleteItem?: (itemId: number | string) => void;
  onUpdateItemValue?: (groupId: string, itemId: number | string, columnId: string, value: any) => void;
  dependencies?: Dependency[];
}

interface GanttTaskBarProps {
  item: Item;
  idx: number;
  groups: Group[];
  getTaskPosition: (item: Item) => { start: number, duration: number };
  calculateProgress: (item: Item) => number;
  isOverdue: (item: Item) => boolean;
  getVal: (item: Item, colName: string) => string | number;
  setHoveredItem: (id: string | null) => void;
  setEditingItem: (val: { groupId: string, item: Item } | null) => void;
  onUpdateItemValue?: (groupId: string, itemId: number | string, columnId: string, value: any) => void;
  onDeleteItem?: (id: number | string) => void;
}

const GanttTaskBar = memo(function GanttTaskBar({ 
  item, 
  idx,
  groups,
  getTaskPosition, 
  calculateProgress, 
  isOverdue, 
  getVal,
  setHoveredItem, 
  setEditingItem, 
  onUpdateItemValue,
  onDeleteItem 
}: GanttTaskBarProps) {
  const { start, duration } = getTaskPosition(item);
  const [isDragging, setIsDragging] = useState(false);
  const [dragOffset, setDragOffset] = useState(0);
  const startXRef = useRef(0);
  const currentXRef = useRef(0);
  
  useEffect(() => {
    const handlePointerMove = (e: PointerEvent) => {
      if (!isDragging) return;
      const delta = e.clientX - startXRef.current;
      setDragOffset(delta);
      currentXRef.current = delta;
    };

    const handlePointerUp = (e: PointerEvent) => {
      if (!isDragging) return;
      setIsDragging(false);
      (e.target as Element).releasePointerCapture(e.pointerId);
      
      const pxPerDay = 1200 / 28;
      const daysShift = Math.round(currentXRef.current / pxPerDay);
      
      if (daysShift !== 0 && onUpdateItemValue) {
         const groupId = groups.find(g => g.items.some(i => i.id === item.id) || g.items.some(i => i.subItems?.some(s => s.id === item.id)))?.id;
         if (groupId) {
             const timeline = (item.values as any)['timeline'];
             const dailyExec = (item.values as any)['daily_execution'] || {};
             const legacyDate = (item.values as any)['date'];

             let startDate: Date;
             let endDate: Date;

             if (timeline && timeline.from && timeline.to) {
                startDate = new Date(timeline.from + 'T00:00:00');
                endDate = new Date(timeline.to + 'T00:00:00');
             } else if (Object.keys(dailyExec).length > 0) {
                const dates = Object.keys(dailyExec).sort();
                startDate = new Date(dates[0] + 'T00:00:00');
                endDate = new Date(dates[dates.length - 1] + 'T00:00:00');
             } else if (legacyDate) {
                startDate = new Date(legacyDate);
                endDate = new Date(startDate);
                endDate.setDate(startDate.getDate() + 2);
             } else {
                setDragOffset(0);
                return;
             }

             const newStart = new Date(startDate);
             newStart.setDate(startDate.getDate() + daysShift);
             
             const newEnd = new Date(endDate);
             newEnd.setDate(endDate.getDate() + daysShift);

             onUpdateItemValue(groupId, item.id, 'timeline', {
                from: newStart.toISOString().split('T')[0],
                to: newEnd.toISOString().split('T')[0]
             });
         }
      }
      setDragOffset(0);
    };

    if (isDragging) {
      document.addEventListener('pointermove', handlePointerMove);
      document.addEventListener('pointerup', handlePointerUp);
    }

    return () => {
      document.removeEventListener('pointermove', handlePointerMove);
      document.removeEventListener('pointerup', handlePointerUp);
    };
  }, [isDragging, groups, item, onUpdateItemValue]);

  const handlePointerDown = (e: React.PointerEvent) => {
    e.preventDefault();
    e.stopPropagation();
    (e.target as Element).setPointerCapture(e.pointerId);
    setIsDragging(true);
    startXRef.current = e.clientX;
    currentXRef.current = 0;
  };

  return (
    <div 
      className="absolute h-7 rounded-lg shadow-sm flex items-center px-3 cursor-grab active:cursor-grabbing hover:brightness-110 transition-colors group/bar overflow-visible z-10"
      onMouseEnter={() => setHoveredItem(String(item.id))}
      onMouseLeave={() => setHoveredItem(null)}
      onPointerDown={handlePointerDown}
      onClick={(e) => {
        if (Math.abs(dragOffset) > 5) return;
        const groupId = groups.find(g => g.items.some(i => i.id === item.id))?.id;
        if (groupId) {
          setEditingItem({ groupId, item });
        }
      }}
      style={{ 
        left: `${(start - 1) * (1200/28)}px`, 
        width: `${duration * (1200/28)}px`,
        top: '8px', 
        backgroundColor: (item.values as any)['status'] === 'Done' ? '#00c875' : 
                         (item.values as any)['status'] === 'Working on it' ? '#fdab3d' : 
                         (item.values as any)['status'] === 'Stuck' ? '#e2445c' : '#c4c4c4',
        border: isOverdue(item) ? '2px solid #e2445c' : 'none',
        boxShadow: (item.values as any)['status'] === 'Done' ? '0 0 10px rgba(0,200,117,0.4)' : undefined,
        transform: `translate3d(${dragOffset}px, 0, 0)`,
        zIndex: isDragging ? 50 : 10,
        opacity: isDragging ? 0.8 : 1,
        touchAction: 'none'
      }}
    >
       <div className="flex items-center space-x-1.5 font-bold whitespace-nowrap overflow-hidden relative z-10 pointer-events-none">
          {(item.values as any)['status'] === 'Done' ? (
            <span className="text-sm">✅</span>
          ) : (
            <Clock className="w-3.5 h-3.5 flex-shrink-0 text-white drop-shadow-[0_2px_4px_rgba(0,0,0,0.9)]" />
          )}
          {duration * (1200/28) > 80 && (
            <span 
              className="truncate text-xs font-bold text-white"
              style={{ textShadow: '0 1px 3px rgba(0,0,0,0.9), 0 0 10px rgba(0,0,0,0.7), 1px 1px 2px rgba(0,0,0,1)' }}
            >
              {item.name}
            </span>
          )}
       </div>
       <div className="absolute top-0 left-0 bottom-0 bg-black/20 pointer-events-none rounded-l-lg" style={{ width: `${calculateProgress(item)}%` }} />
    </div>
  );
});

interface GanttRowProps {
  item: Item & { groupColor: string; level: number };
  index: number;
  style: React.CSSProperties;
  groups: Group[];
  getTaskPosition: (item: Item) => { start: number, duration: number };
  calculateProgress: (item: Item) => number;
  isOverdue: (item: Item) => boolean;
  getVal: (item: Item, colName: string) => string | number;
  getZoneValue: (item: Item) => any;
  setHoveredItem: (id: string | null) => void;
  setEditingItem: (val: { groupId: string, item: Item } | null) => void;
  onDeleteItem?: (id: number | string) => void;
  onUpdateItemValue?: (groupId: string, itemId: number | string, columnId: string, value: any) => void;
  today: Date;
}

const GanttRow = memo(({ 
  item, index, style, groups, getTaskPosition, calculateProgress, isOverdue, 
  getZoneValue, getVal, setHoveredItem, setEditingItem, 
  onDeleteItem, onUpdateItemValue, today 
}: GanttRowProps) => {
  const { start, duration } = getTaskPosition(item);
  
  return (
    <div style={style} className="flex group/line hover:bg-gray-50/50 transition-colors border-b border-gray-50 last:border-0 h-14 relative bg-white">
      <div className="w-[300px] flex-shrink-0 p-3 flex items-center border-r border-gray-200 bg-white z-10 sticky left-0 shadow-[2px_0_5px_rgba(0,0,0,0.02)]">
        <div className={`w-2 h-2 rounded-full mr-3 ${item.level > 0 ? 'opacity-30 scale-75' : ''}`} style={{ backgroundColor: item.groupColor }}></div>
        <button
          onClick={() => {
            const groupId = groups.find(g => g.items.some(i => i.id === item.id) || g.items.some(i => i.subItems?.some(s => s.id === item.id)))?.id;
            if (groupId) setEditingItem({ groupId, item });
          }}
          className={`text-sm text-gray-700 truncate font-medium hover:text-primary hover:underline cursor-pointer text-left flex-1 ${item.level > 0 ? 'pl-4 text-xs text-gray-500' : ''}`}
        >
          {item.level > 0 && <span className="mr-1 text-gray-300">↳</span>}
          {item.name}
          {!(item.values as any)['timeline']?.from && (
            <span className="ml-2 text-xs text-orange-500 font-bold">📅 Sin programar</span>
          )}
        </button>
        {(() => {
          const zoneValue = getZoneValue(item);
          return zoneValue && (
            <span className="text-[8px] px-1.5 py-0.5 rounded-full font-bold ml-2 flex-shrink-0" style={{
              backgroundColor: zoneValue === 'Zonas Verdes' ? '#d1fae5' : zoneValue === 'Zonas Duras' ? '#e5e7eb' : '#fed7aa',
              color: zoneValue === 'Zonas Verdes' ? '#065f46' : zoneValue === 'Zonas Duras' ? '#374151' : '#92400e'
            }}>
              {zoneValue === 'Zonas Verdes' ? '🌿' : zoneValue === 'Zonas Duras' ? '🏗️' : '🏖️'}
            </span>
          );
        })()}
        <div className="flex items-center ml-auto space-x-1 opacity-0 group-hover/line:opacity-100 transition-opacity">
          <button onClick={() => onDeleteItem && onDeleteItem(item.id)} className="p-1 hover:bg-red-50 text-gray-300 hover:text-red-500 rounded"><Trash2 className="w-3.5 h-3.5" /></button>
          <ChevronRight className="w-3 h-3 text-gray-300 group-hover/line:text-primary transition-colors" />
        </div>
      </div>

      <div className="flex-1 relative bg-[url('https://www.transparenttextures.com/patterns/graphy-very-light.png')] bg-repeat overflow-visible w-[1200px]">
         <div className="grid grid-cols-28 w-[1200px] h-full absolute inset-0 pointer-events-none opacity-5">
            {Array.from({ length: 28 }).map((_, i) => <div key={i} className="border-r border-gray-400 h-full"></div>) /* Grid Lines */}
         </div>

         <div className="py-2 w-[1200px] relative h-[44px] overflow-visible">
            {(() => {
              const realToday = new Date();
              realToday.setHours(0,0,0,0);
              const diffToday = Math.floor((realToday.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
              if (diffToday >= 0 && diffToday < 28) {
                return (
                  <div className="absolute top-0 bottom-0 w-0.5 bg-blue-500 z-10 pointer-events-none" style={{ left: `${diffToday * (1200/28)}px` }}>
                    <div className="absolute -top-1 -left-1 w-2 h-2 bg-blue-500 rounded-full" />
                    <div className="absolute -top-6 -left-8 text-[9px] font-bold text-blue-500 uppercase">Hoy</div>
                  </div>
                );
              }
              return null;
            })()}

            <GanttTaskBar 
              item={item} idx={index} groups={groups} getTaskPosition={getTaskPosition} 
              calculateProgress={calculateProgress} isOverdue={isOverdue} getVal={getVal}
              setHoveredItem={setHoveredItem} setEditingItem={setEditingItem}
              onDeleteItem={onDeleteItem} onUpdateItemValue={onUpdateItemValue}
            />

         </div>
      </div>
    </div>
  );
});

export default function GanttView({ groups, onOpenItem, onAddItem, onDeleteItem, onUpdateItemValue, dependencies = [] }: GanttViewProps) {
  const [weekOffset, setWeekOffset] = useState(0);
  const [editingItem, setEditingItem] = useState<{ groupId: string, item: Item } | null>(null);
  const [hoveredItem, setHoveredItem] = useState<string | null>(null);
  const parentRef = useRef<HTMLDivElement>(null);
  const headerRef = useRef<HTMLDivElement>(null);
  const { itemModal, automationsModalOpen, confirmModal } = useUI();
  const isAnyModalOpen = itemModal.isOpen || automationsModalOpen || confirmModal.isOpen;

  const syncScroll = useCallback((e: React.UIEvent<HTMLDivElement>) => {
    if (headerRef.current) {
      headerRef.current.scrollLeft = (e.target as HTMLDivElement).scrollLeft;
    }
  }, []);

  const getVal = useCallback((item: Item, colName: string): string | number => {
    if (item.values[colName] !== undefined) return (item.values as any)[colName];
    const normalizedKey = colName.toLowerCase().replace(/\s+/g, '_');
    if (item.values[normalizedKey] !== undefined) return (item.values as any)[normalizedKey];
    return '';
  }, []);

  const isOverdue = useCallback((item: Item) => {
    const timeline = (item.values as any)['timeline'];
    if (!timeline || !timeline.to || (item.values as any)['status'] === 'Done') return false;
    const endDate = new Date(timeline.to + 'T23:59:59');
    return endDate < new Date();
  }, []);

  const getZoneValue = useCallback((item: Item) => {
    if ((item.values as any)['zone']) return (item.values as any)['zone'];
    for (const key in item.values) {
      const value = (item.values as any)[key];
      if (value === 'Zonas Verdes' || value === 'Zonas Duras' || value === 'Zona de Playa') return value;
    }
    return null;
  }, []);

  const today = useMemo(() => {
    const d = new Date();
    d.setHours(0,0,0,0);
    d.setDate(d.getDate() + (weekOffset * 7));
    return d;
  }, [weekOffset]);

  const days = Array.from({ length: 28 }, (_, i) => {
    const d = new Date(today);
    d.setDate(today.getDate() + i);
    return d;
  });

  const weeks = Array.from({ length: 4 }, (_, i) => {
    const d = new Date(today);
    d.setDate(today.getDate() + (i * 7));
    return `S. ${d.getDate()}/${d.getMonth() + 1}`;
  });

  const handleShift = (weeks: number) => setWeekOffset((prev) => prev + weeks);

  const getTaskPosition = useCallback((item: Item) => {
    const timeline = (item.values as any)['timeline'];
    const dailyExec = (item.values as any)['daily_execution'] || {};
    const legacyDate = (item.values as any)['date'];
    let startDate: Date | null = null;
    let endDate: Date | null = null;
    if (timeline && timeline.from && timeline.to) {
      startDate = new Date(timeline.from + 'T00:00:00');
      endDate = new Date(timeline.to + 'T00:00:00');
    } else if (Object.keys(dailyExec).length > 0) {
      const dates = Object.keys(dailyExec).sort();
      startDate = new Date(dates[0] + 'T00:00:00');
      endDate = new Date(dates[dates.length - 1] + 'T00:00:00');
    } else if (legacyDate) {
      startDate = new Date(legacyDate);
      endDate = new Date(startDate);
      endDate.setDate(startDate.getDate() + 2);
    }
    if (!startDate || isNaN(startDate.getTime())) return { start: -1, duration: 0 };
    const diffStart = Math.floor((startDate.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
    const diffEnd = Math.floor((endDate!.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
    const start = Math.max(0, diffStart) + 1;
    const duration = Math.max(1, diffEnd - diffStart + 1);
    return start > 28 ? { start: -1, duration: 0 } : { start, duration };
  }, [today]);

  const calculateProgress = useCallback((item: Item) => {
    const itemDays = (item.values as any)['daily_execution'] || {};
    if (Object.keys(itemDays).length === 0) return 0;
    const totalJornales = (Object.values(itemDays) as any[]).reduce((sum: number, entry: any) => {
      const val = parseFloat(String(entry.val)) || 0;
      return sum + val;
    }, 0);
    if (totalJornales === 0) return 0;
    const executedJornales = (Object.values(itemDays) as any[]).reduce((sum: number, entry: any) => {
      const isDone = !!entry.done;
      const val = parseFloat(String(entry.val)) || 0;
      return sum + (isDone ? val : 0);
    }, 0);
    return Math.min(100, (executedJornales / totalJornales) * 100);
  }, []);

  const allItems = useMemo(() => {
    const flat: (Item & { groupColor: string; level: number })[] = [];
    const process = (items: Item[], groupColor: string, level = 0) => {
      items.forEach(item => {
        flat.push({ ...item, groupColor, level });
        if (item.subItems) process(item.subItems, groupColor, level + 1);
      });
    };
    groups.forEach(g => process(g.items, g.color, 0));
    return flat;
  }, [groups]);

  const rowVirtualizer = useVirtualizer({
    count: allItems.length,
    getScrollElement: () => parentRef.current,
    estimateSize: () => 56, // row height = 14 * 4 = 56px
    overscan: 5,
  });

  return (
    <div className="flex flex-col h-full bg-white border border-gray-200 rounded-xl overflow-hidden shadow-sm">
      {/* Title Header */}
      <div className="px-6 py-4 border-b border-gray-100 bg-white flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="p-2 bg-primary/10 rounded-lg">
            <CalendarIcon className="w-5 h-5 text-primary" />
          </div>
          <div>
            <h2 className="text-lg font-bold text-gray-900 leading-none">Cronograma de Actividades</h2>
            <p className="text-xs text-gray-500 mt-1 font-medium italic">Visualización temporal de actividades y dependencias</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
           <div className="flex items-center px-3 py-1 bg-green-50 rounded-full border border-green-100">
              <div className="w-1.5 h-1.5 rounded-full bg-green-500 animate-pulse mr-2" />
              <span className="text-[10px] font-bold text-green-700 uppercase tracking-wider">Vista en vivo</span>
           </div>
        </div>
      </div>

      <div className="flex border-b border-gray-100 bg-gray-50/50">
        <div className="w-[300px] flex-shrink-0 p-4 font-bold text-sm text-[#323338] border-r border-gray-200 bg-white flex items-center justify-between">
          <div className="flex items-center space-x-2">
            <span>Elemento</span>
            <div className="flex bg-gray-100 rounded-lg p-0.5 ml-2">
               <button onClick={() => handleShift(-1)} className="p-1 hover:bg-white rounded text-gray-500 transition-all"><ChevronRight className="w-3 h-3 rotate-180" /></button>
               <button onClick={() => setWeekOffset(0)} className="px-1.5 text-[9px] hover:bg-white rounded text-gray-500 font-bold uppercase">Hoy</button>
               <button onClick={() => handleShift(1)} className="p-1 hover:bg-white rounded text-gray-500 transition-all"><ChevronRight className="w-3 h-3" /></button>
            </div>
          </div>
          <button onClick={() => onAddItem && onAddItem(groups[0]?.id, 'Nueva Actividad')} className="p-1 hover:bg-gray-100 rounded text-primary"><Plus className="w-4 h-4" /></button>
        </div>
        <div ref={headerRef} className="flex-1 overflow-hidden pointer-events-none">
          <div className="grid grid-cols-4 w-[1200px]">
            {weeks.map(w => <div key={w} className="p-2 text-center text-[10px] font-bold text-green-700 uppercase border-r border-gray-100 last:border-0 bg-white/50">{w}</div>)}
          </div>
          <div className="grid grid-cols-28 w-[1200px] border-t border-gray-100">
             {days.map((d, i) => <div key={i} className="h-6 flex items-center justify-center text-[9px] text-gray-300 border-r border-gray-50 last:border-0">{d.getDate()}</div>)}
          </div>
        </div>
      </div>

      <div 
        ref={parentRef} 
        onScroll={syncScroll} 
        className="flex-1 overflow-auto custom-scrollbar relative"
      >
        <div 
          style={{
            height: `${rowVirtualizer.getTotalSize()}px`,
            width: '1500px', // 300px + 1200px
            position: 'relative'
          }}
        >
          {/* Dependencies SVG Layer */}
          <svg 
            className="absolute top-0 left-[300px] w-[1200px] pointer-events-none z-0 overflow-visible" 
            style={{ height: `${rowVirtualizer.getTotalSize()}px` }}
          >
            <defs>
              <marker id="arrowhead" markerWidth="6" markerHeight="4" refX="5" refY="2" orient="auto">
                <polygon points="0 0, 6 2, 0 4" fill="#94a3b8" />
              </marker>
            </defs>
            {dependencies.map(dep => {
              const sIdx = allItems.findIndex(i => i.id === dep.source_item_id);
              const tIdx = allItems.findIndex(i => i.id === dep.target_item_id);
              if (sIdx === -1 || tIdx === -1) return null;
              
              const sPos = getTaskPosition(allItems[sIdx]);
              const tPos = getTaskPosition(allItems[tIdx]);
              const colWidth = 1200 / 28;
              
              // Only render if within a reasonable distance?
              const x1 = (Number(sPos.start) + Number(sPos.duration) - 1) * colWidth;
              const x2 = (Number(tPos.start) - 1) * colWidth;
              const y1 = (Number(sIdx) * 56) + 28; // 56 is row height
              const y2 = (Number(tIdx) * 56) + 28;

              return (
                <path 
                  key={dep.id} 
                  d={`M ${x1} ${y1} C ${x1 + 30} ${y1}, ${x2 - 30} ${y2}, ${x2} ${y2}`} 
                  fill="none" 
                  stroke="#94a3b8" 
                  strokeWidth="2" 
                  markerEnd="url(#arrowhead)" 
                  opacity="0.4"
                  className="transition-opacity hover:opacity-100"
                />
              );
            })}
          </svg>

          {/* Virtual Items */}
          {rowVirtualizer.getVirtualItems().map((virtualRow) => (
            <GanttRow 
              key={virtualRow.key}
              item={allItems[virtualRow.index]}
              index={virtualRow.index}
              style={{
                position: 'absolute',
                top: 0,
                left: 0,
                width: '100%',
                height: `${virtualRow.size}px`,
                transform: `translateY(${virtualRow.start}px)`,
              }}
              groups={groups}
              getTaskPosition={getTaskPosition}
              calculateProgress={calculateProgress}
              isOverdue={isOverdue}
              getVal={getVal}
              getZoneValue={getZoneValue}
              setHoveredItem={setHoveredItem}
              setEditingItem={setEditingItem}
              onDeleteItem={onDeleteItem}
              onUpdateItemValue={onUpdateItemValue}
              today={today}
            />
          ))}
        </div>
      </div>

       {hoveredItem && !isAnyModalOpen && allItems.find(i => String(i.id) === hoveredItem) && (() => {
         const item = allItems.find(i => String(i.id) === hoveredItem)!;
         return (
           <motion.div 
             initial={{ opacity: 0, scale: 0.95 }}
             animate={{ opacity: 1, scale: 1 }}
             className="fixed top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 bg-gray-900/95 backdrop-blur-md text-white p-6 rounded-2xl shadow-2xl z-[80] w-80 pointer-events-none border border-white/10"
           >
             <div className="text-base font-black mb-4 border-b border-white/10 pb-3 text-white flex items-center justify-between">
               <span className="truncate">{item.name}</span>
               <div className="w-2 h-2 rounded-full animate-pulse bg-green-500" />
             </div>
             <div className="space-y-3 text-xs">
               <div className="flex justify-between items-center bg-white/5 p-2 rounded-lg">
                 <span className="text-gray-400">📅 Calendario</span>
                 <span className="font-bold text-white uppercase text-[10px]">
                   {(item.values as any)['timeline']?.from || '?'} → {(item.values as any)['timeline']?.to || '?'}
                 </span>
               </div>
               <div className="flex justify-between items-center">
                 <span className="text-gray-400">📈 Avance:</span>
                 <span className="font-bold text-green-400 text-sm">{calculateProgress(item).toFixed(1)}%</span>
               </div>
               <div className="mt-4 pt-3 border-t border-white/5 flex items-center space-x-2">
                 <div className={`w-2 h-2 rounded-full ${
                   (item.values as any)['status'] === 'Done' ? 'bg-green-500' :
                   (item.values as any)['status'] === 'Working on it' ? 'bg-orange-500' : 'bg-gray-500'
                 }`} />
                 <span className="font-bold text-[10px] uppercase tracking-wider text-gray-300">
                   {(item.values as any)['status'] || 'Pendiente'}
                 </span>
               </div>
             </div>
           </motion.div>
         );
       })()}

      <div className="p-4 bg-gray-50 border-t border-gray-100 flex items-center justify-between text-[11px] text-gray-400 font-medium">
         <div className="flex items-center space-x-6">
            <div className="flex items-center"><div className="w-2 h-2 rounded-full bg-[#00c875] mr-2"></div> Terminado</div>
            <div className="flex items-center"><div className="w-2 h-2 rounded-full bg-[#fdab3d] mr-2"></div> En proceso</div>
            <div className="flex items-center"><div className="w-2 h-2 rounded-full bg-[#c4c4c4] mr-2"></div> Pendiente</div>
         </div>
         <div className="flex items-center"><LinkIcon className="w-3 h-3 mr-1" /><span>{dependencies.length} dependencias activas</span></div>
      </div>

      {editingItem && (
        <DateRangeModal 
          isOpen={true} onClose={() => setEditingItem(null)} itemName={editingItem.item.name}
          expectedDays={parseFloat(String(getVal(editingItem.item, 'cant'))) / (parseFloat(String(getVal(editingItem.item, 'rend'))) || 1) || 3}
          initialStart={(editingItem.item.values as any)['timeline']?.from} initialEnd={(editingItem.item.values as any)['timeline']?.to}
          onSave={(start, end) => {
            if (onUpdateItemValue) {
                onUpdateItemValue(editingItem.groupId, editingItem.item.id, 'timeline', { from: start, to: end });
                const currentExec = (editingItem.item.values as any)['daily_execution'] || {};
                if (Object.keys(currentExec).length === 0) {
                    const cant = parseFloat(String(getVal(editingItem.item, 'cant'))) || 0;
                    const rend = parseFloat(String(getVal(editingItem.item, 'rend'))) || 1;
                    const totalJor = cant / rend;
                    if (totalJor > 0) {
                        const startDate = new Date(start + 'T00:00:00');
                        const endDate = new Date(end + 'T00:00:00');
                        const daysDiff = Math.max(1, Math.ceil((endDate.getTime() - startDate.getTime()) / (1000 * 60 * 60 * 24)) + 1);
                        const jorPerDay = totalJor / daysDiff;
                        const newExec: any = {};
                        for (let i = 0; i < daysDiff; i++) {
                            const d = new Date(startDate);
                            d.setDate(startDate.getDate() + i);
                            newExec[d.toISOString().split('T')[0]] = { val: jorPerDay, done: false };
                        }
                        onUpdateItemValue(editingItem.groupId, editingItem.item.id, 'daily_execution', newExec);
                    }
                }
            }
            setEditingItem(null);
          }}
        />
      )}
      <style dangerouslySetInnerHTML={{ __html: `
        .custom-scrollbar::-webkit-scrollbar { width: 8px; height: 8px; }
        .custom-scrollbar::-webkit-scrollbar-track { background: #f1f1f1; }
        .custom-scrollbar::-webkit-scrollbar-thumb { background: #d1d5db; border-radius: 4px; }
        .custom-scrollbar::-webkit-scrollbar-thumb:hover { background: #9ca3af; }
        .grid-cols-28 { grid-template-columns: repeat(28, minmax(0, 1fr)); }
      `}} />
    </div>
  );
}
