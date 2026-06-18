'use client';

import { Group, Item, Column, Dependency } from '@/types/monday';
import { motion } from 'framer-motion';
import { ChevronRight, ChevronDown, Clock, Link as LinkIcon, Plus, Trash2, Calendar as CalendarIcon, X, GitGraph } from 'lucide-react';
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
  getTaskSegments: (item: Item) => { start: number, duration: number }[];
  calculateProgress: (item: Item) => number;
  isOverdue: (item: Item) => boolean;
  getVal: (item: Item, colName: string) => string | number;
  setHoveredItem: (id: string | null) => void;
  setEditingItem: (val: { groupId: string, item: Item } | null) => void;
  getZoneValue: (item: Item) => any;
  onUpdateItemValue?: (groupId: string, itemId: number | string, columnId: string, value: any) => void;
  onDeleteItem?: (id: number | string) => void;
}

const GanttTaskBar = memo(function GanttTaskBar({ 
  item, 
  idx,
  groups,
  getTaskSegments, 
  calculateProgress, 
  isOverdue, 
  getVal,
  getZoneValue,
  setHoveredItem, 
  setEditingItem, 
  onUpdateItemValue,
  onDeleteItem 
}: GanttTaskBarProps) {
    const segments = getTaskSegments(item);
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
                  const dates = Object.keys(dailyExec).filter(d => (dailyExec[d].val || 0) > 0).sort();
                  if (dates.length > 0) {
                      startDate = new Date(dates[0] + 'T00:00:00');
                      endDate = new Date(dates[dates.length - 1] + 'T00:00:00');
                  } else {
                      setDragOffset(0); return;
                  }
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
  
    if (segments.length === 0) return null;
  
    const colWidth = 1200 / 28;
    const status = (item.values as any)['status'];
    const zone = getZoneValue(item);
    
    // High-fidelity industrial colors
    const zoneColor = zone === 'Zonas Verdes' ? '#10b981' : 
                      zone === 'Zonas Duras' ? '#3B7EF8' : 
                      zone === 'Zona de Playa' ? '#f59e0b' : '#64748b';
  
    const statusGlow = status === 'Done' ? '0 0 15px rgba(16,185,129,0.3)' : 
                       status === 'Working on it' ? '0 0 15px rgba(59,126,248,0.3)' : 
                       status === 'Stuck' ? '0 0 15px rgba(244,63,94,0.3)' : 'none';
  
    return (
      <>
        {/* Segment Connectors */}
        {segments.length > 1 && segments.map((seg, sIdx) => {
          if (sIdx === segments.length - 1) return null;
          const nextSeg = segments[sIdx + 1];
          const x1 = (seg.start + seg.duration - 1) * colWidth;
          const x2 = (nextSeg.start - 1) * colWidth;
          return (
            <div 
              key={`${item.id}-conn-${sIdx}`}
              className="absolute h-[2px] border-t-2 border-dashed border-[#3B7EF8]/30 pointer-events-none"
              style={{ 
                left: `${x1}px`, 
                width: `${x2 - x1}px`,
                top: '22px',
                opacity: 0.4,
                transform: `translate3d(${dragOffset}px, 0, 0)`
              }}
            />
          );
        })}
  
        {segments.map((seg, sIdx) => {
          const isLastSegment = sIdx === segments.length - 1;
          const barWidth = seg.duration * colWidth;
          const showLabelInside = barWidth > 120;
          const progress = calculateProgress(item);
  
          return (
            <div 
              key={`${item.id}-seg-${sIdx}`}
              className="absolute h-8 rounded-xl shadow-lg flex items-center px-4 cursor-grab active:cursor-grabbing hover:brightness-125 transition-all group/bar overflow-visible z-10 border border-[var(--border-color)]"
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
                left: `${(seg.start - 1) * colWidth}px`, 
                width: `${barWidth}px`,
                top: '8px', 
                backgroundColor: `${zoneColor}22`, // Base translucent color
                boxShadow: statusGlow,
                transform: `translate3d(${dragOffset}px, 0, 0)`,
                zIndex: isDragging ? 50 : 10,
                opacity: isDragging ? 0.8 : 1,
                touchAction: 'none'
              }}
            >
               {/* Industrial Background Pattern */}
               <div className="absolute inset-0 opacity-10 pointer-events-none bg-[url('https://www.transparenttextures.com/patterns/carbon-fibre.png')] rounded-xl" />
               
               {/* Progress Fill */}
               <div 
                  className="absolute top-0 left-0 bottom-0 rounded-l-xl transition-all duration-1000 ease-out"
                  style={{ 
                      width: `${progress}%`, 
                      backgroundColor: zoneColor,
                      boxShadow: `inset -10px 0 20px rgba(255,255,255,0.1), ${statusGlow}`
                  }}
               />
  
               <div className="flex items-center space-x-2 font-bold whitespace-nowrap overflow-hidden relative z-10 pointer-events-none w-full">
                  <div className="flex-shrink-0">
                      {status === 'Done' ? (
                        <div className="w-4 h-4 bg-emerald-500 rounded-lg flex items-center justify-center text-[10px] text-white shadow-[0_0_10px_rgba(16,185,129,0.5)]">✓</div>
                      ) : (
                        <Clock className={`w-3.5 h-3.5 text-white ${status === 'Working on it' ? 'animate-pulse' : ''}`} />
                      )}
                  </div>
                  
                  {showLabelInside && (
                    <span className="truncate text-[9px] font-black text-white uppercase tracking-[0.1em] drop-shadow-md">
                      {item.name}
                    </span>
                  )}
  
                  {progress > 0 && showLabelInside && (
                      <span className="ml-auto font-mono text-[8px] text-white/70">{Math.round(progress)}%</span>
                  )}
               </div>
  
               {/* Outbound Label */}
               {!showLabelInside && isLastSegment && (
                  <div className="absolute left-[calc(100%+12px)] whitespace-nowrap pointer-events-none flex items-center gap-2">
                     <div className="w-2 h-[1px] bg-white/20" />
                     <span className="text-[8px] font-black text-slate-400 uppercase tracking-widest px-2 py-1 rounded-lg bg-[var(--bg-secondary)]/80 backdrop-blur-md border border-[var(--border-color)] italic">
                        {item.name}
                     </span>
                  </div>
               )}
  
               {isOverdue(item) && (
                  <div className="absolute -top-1 -right-1 w-3 h-3 bg-rose-500 rounded-full border-2 border-[#161B30] animate-bounce shadow-[0_0_10px_rgba(244,63,94,0.5)]" />
               )}
            </div>
          );
        })}
      </>
    );
});

interface GanttRowProps {
  item: Item & { groupColor: string; level: number };
  index: number;
  style: React.CSSProperties;
  groups: Group[];
  getTaskSegments: (item: Item) => { start: number, duration: number }[];
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
  item, index, style, groups, getTaskSegments, calculateProgress, isOverdue, 
  getZoneValue, getVal, setHoveredItem, setEditingItem, 
  onDeleteItem, onUpdateItemValue, today 
}: GanttRowProps) => {
  
  return (
    <div 
      style={style} 
      className={`flex group/line hover:bg-emerald-50/30 transition-colors border-b border-gray-50 last:border-0 h-14 relative ${index % 2 === 0 ? 'bg-white' : 'bg-slate-50/20'}`}
    >
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
            {Array.from({ length: 28 }).map((_, i) => <div key={`grid-line-${i}`} className="border-r border-gray-400 h-full"></div>) /* Grid Lines */}
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
              item={item} idx={index} groups={groups} getTaskSegments={getTaskSegments} 
              calculateProgress={calculateProgress} isOverdue={isOverdue} getVal={getVal}
              getZoneValue={getZoneValue}
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
  const [collapsedGroups, setCollapsedGroups] = useState<Set<string>>(new Set());
  const [editingItem, setEditingItem] = useState<{ groupId: string, item: Item } | null>(null);
  const [hoveredItem, setHoveredItem] = useState<string | null>(null);
  const parentRef = useRef<HTMLDivElement>(null);
  const headerRef = useRef<HTMLDivElement>(null);
  const { itemModal, automationsModalOpen, confirmModal } = useUI();
  const isAnyModalOpen = itemModal.isOpen || automationsModalOpen || confirmModal.isOpen;

  const toggleGroup = (groupId: string) => {
    setCollapsedGroups(prev => {
      const next = new Set(prev);
      if (next.has(groupId)) next.delete(groupId);
      else next.add(groupId);
      return next;
    });
  };

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

  const getTaskSegments = useCallback((item: Item) => {
    const dailyExec = (item.values as any)['daily_execution'] || {};
    const dates = Object.keys(dailyExec).filter(d => {
        const entry = dailyExec[d];
        const val = typeof entry === 'object' ? entry.val : entry;
        return (parseFloat(val) || 0) > 0;
    }).sort();
    
    let rawSegments: { from: string, to: string }[] = [];

    if (dates.length > 0) {
        // Group into continuous segments (max 2 day gap for weekends)
        let currentStart = dates[0];
        let currentEnd = dates[0];
        
        for (let i = 1; i < dates.length; i++) {
            const prev = new Date(dates[i-1] + 'T00:00:00');
            const curr = new Date(dates[i] + 'T00:00:00');
            const diffDays = (curr.getTime() - prev.getTime()) / (1000 * 60 * 60 * 24);
            
            if (diffDays <= 3) { // 3 days to cover Fri -> Mon
                currentEnd = dates[i];
            } else {
                rawSegments.push({ from: currentStart, to: currentEnd });
                currentStart = dates[i];
                currentEnd = dates[i];
            }
        }
        rawSegments.push({ from: currentStart, to: currentEnd });
    } else {
        const timeline = (item.values as any)['timeline'];
        if (timeline?.from && timeline?.to) {
            rawSegments.push({ from: timeline.from, to: timeline.to });
        } else if ((item.values as any)['date']) {
            const d = (item.values as any)['date'];
            rawSegments.push({ from: d, to: d });
        }
    }

    // Convert dates to grid positions
    return rawSegments.map(seg => {
        const startD = new Date(seg.from + 'T00:00:00');
        const endD = new Date(seg.to + 'T00:00:00');
        const diffStart = Math.floor((startD.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
        const diffEnd = Math.floor((endD.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
        
        const start = Math.max(0, diffStart) + 1;
        const duration = Math.max(1, diffEnd - diffStart + 1);
        
        if (start > 28 || start + duration < 0) return null;
        return { start, duration };
    }).filter(s => s !== null) as { start: number, duration: number }[];
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
    const flat: ( (Item & { groupColor: string; level: number; isHeader?: boolean; groupId: string }) | { isHeader: true, title: string, color: string, id: string, groupId: string })[] = [];
    
    groups.forEach(g => {
      // Add Group Header
      flat.push({ isHeader: true, title: g.title, color: g.color, id: g.id, groupId: g.id });
      
      if (!collapsedGroups.has(g.id)) {
        const process = (items: Item[], groupColor: string, level = 0) => {
          items.forEach(item => {
            flat.push({ ...item, groupColor, level, groupId: g.id });
            if (item.subItems) process(item.subItems, groupColor, level + 1);
          });
        };
        process(g.items, g.color, 0);
      }
    });
    return flat;
  }, [groups, collapsedGroups]);

  const itemOffsets = useMemo(() => {
    let current = 0;
    return allItems.map(item => {
      const start = current;
      const size = (item as any).isHeader ? 40 : 56;
      current += size;
      return { start, size, id: (item as any).id || (item as any).groupId };
    });
  }, [allItems]);

  const rowVirtualizer = useVirtualizer({
    count: allItems.length,
    getScrollElement: () => parentRef.current,
    estimateSize: (index) => (allItems[index] as any).isHeader ? 40 : 56, 
    overscan: 5,
    getItemKey: useCallback((index: number) => {
      const item = allItems[index];
      return (item as any).isHeader ? `header-${(item as any).id}` : `item-${(item as any).id}`;
    }, [allItems]),
  });

  return (
    <div className="flex flex-col h-full bg-[var(--bg-primary)] border border-[var(--border-color)] rounded-3xl overflow-hidden shadow-2xl font-sans">
      {/* Title Header Industrial */}
      <div className="px-8 py-6 border-b border-[var(--border-color)] bg-[var(--bg-secondary)]/50 backdrop-blur-md flex items-center justify-between">
        <div className="flex items-center gap-5">
          <div className="w-12 h-12 bg-gradient-to-br from-[#3B7EF8] to-[#1E2442] rounded-2xl flex items-center justify-center shadow-[0_0_20px_rgba(59,126,248,0.3)] border border-[var(--border-color)]">
            <GitGraph className="w-6 h-6 text-white" />
          </div>
          <div>
            <h2 className="text-xl font-black text-white tracking-tight leading-none">Cronograma de Actividades</h2>
            <p className="text-[10px] text-slate-500 mt-2 font-black uppercase tracking-[0.2em] italic opacity-60">Visualización temporal de actividades y dependencias operativas</p>
          </div>
        </div>
        <div className="flex items-center gap-4">
           <div className="flex items-center px-4 py-2 bg-[#10B981]/10 rounded-xl border border-[#10B981]/20 shadow-[0_0_15px_rgba(16,185,129,0.1)]">
              <div className="w-2 h-2 rounded-full bg-[#10B981] animate-pulse mr-3 shadow-[0_0_8px_#10B981]" />
              <span className="text-[10px] font-black text-[#10B981] uppercase tracking-widest">System Online</span>
           </div>
        </div>
      </div>

      <div className="flex border-b border-[var(--border-color)] bg-[var(--bg-primary)]">
        <div className="w-[300px] flex-shrink-0 p-6 bg-[var(--bg-secondary)] border-r border-[var(--border-color)] flex items-center justify-between shadow-2xl relative z-10">
          <div className="flex flex-col gap-3 w-full">
            <span className="text-[10px] font-black text-slate-600 uppercase tracking-[0.25em]">Componente</span>
            <div className="flex items-center justify-between">
                <div className="flex bg-[var(--bg-primary)] rounded-xl p-1 shadow-inner border border-[var(--border-color)]">
                <button onClick={() => handleShift(-1)} className="p-2 hover:bg-slate-500/5 rounded-lg text-slate-500 hover:text-white transition-all"><ChevronRight className="w-3 h-3 rotate-180" /></button>
                <button onClick={() => setWeekOffset(0)} className="px-3 text-[9px] hover:text-[#3B7EF8] text-slate-500 font-black uppercase tracking-widest">Today</button>
                <button onClick={() => handleShift(1)} className="p-2 hover:bg-slate-500/5 rounded-lg text-slate-500 hover:text-white transition-all"><ChevronRight className="w-3 h-3" /></button>
                </div>
                <button onClick={() => onAddItem && onAddItem(groups[0]?.id, 'Nueva Actividad')} className="p-2.5 bg-[#3B7EF8] hover:bg-[#2563EB] text-white rounded-xl shadow-lg shadow-[#3B7EF8]/20 transition-all active:scale-95"><Plus size={14} /></button>
            </div>
          </div>
        </div>
        <div ref={headerRef} className="flex-1 overflow-hidden pointer-events-none bg-[var(--bg-primary)]">
          <div className="grid grid-cols-4 w-[1200px]">
            {weeks.map(w => (
                <div key={w} className="py-4 text-center text-[10px] font-black text-[#3B7EF8] uppercase tracking-[0.2em] border-r border-[var(--border-color)] last:border-0 bg-[var(--bg-primary)]">
                    {w}
                </div>
            ))}
          </div>
          <div className="grid grid-cols-28 w-[1200px] border-t border-[var(--border-color)]">
             {days.map((d, i) => (
                <div key={`gantt-day-${d.toISOString()}`} className={`h-8 flex items-center justify-center text-[9px] font-mono font-bold border-r border-white/[0.03] last:border-0 ${i % 7 === 0 || i % 7 === 6 ? 'text-slate-700 bg-white/[0.01]' : 'text-slate-500'}`}>
                    {d.getDate()}
                </div>
             ))}
          </div>
        </div>
      </div>

      <div 
        ref={parentRef} 
        onScroll={syncScroll} 
        className="flex-1 overflow-auto custom-scrollbar relative bg-[var(--bg-primary)]"
      >
        <div 
          style={{
            height: `${rowVirtualizer.getTotalSize()}px`,
            width: '1500px', // 300px + 1200px
            position: 'relative'
          }}
        >
          {/* Dependencies SVG Layer with GLOW */}
          <svg 
            className="absolute top-0 left-[300px] w-[1200px] pointer-events-none z-0 overflow-visible" 
            style={{ height: `${rowVirtualizer.getTotalSize()}px` }}
          >
            <filter id="glow">
                <feGaussianBlur stdDeviation="2.5" result="coloredBlur"/>
                <feMerge>
                    <feMergeNode in="coloredBlur"/>
                    <feMergeNode in="SourceGraphic"/>
                </feMerge>
            </filter>
            <defs>
              <marker id="arrowhead" markerWidth="6" markerHeight="4" refX="5" refY="2" orient="auto">
                <polygon points="0 0, 6 2, 0 4" fill="#3B7EF8" opacity="0.6" />
              </marker>
            </defs>
            {dependencies.map(dep => {
              const sIdx = allItems.findIndex(i => !('isHeader' in i) && i.id === dep.source_item_id);
              const tIdx = allItems.findIndex(i => !('isHeader' in i) && i.id === dep.target_item_id);
              if (sIdx === -1 || tIdx === -1) return null;
              
              const sItem = allItems[sIdx] as Item;
              const tItem = allItems[tIdx] as Item;
              const sSegments = getTaskSegments(sItem);
              const tSegments = getTaskSegments(tItem);
              if (sSegments.length === 0 || tSegments.length === 0) return null;

              const sPos = sSegments[sSegments.length - 1]; // Link from last segment
              const tPos = tSegments[0]; // Link to first segment
              
              const colWidth = 1200 / 28;
              
              // Only render if within a reasonable distance?
              const x1 = (Number(sPos.start) + Number(sPos.duration) - 1) * colWidth;
              const x2 = (Number(tPos.start) - 1) * colWidth;
              
              // Use pre-calculated offsets for correct Y positioning
              const y1 = itemOffsets[sIdx].start + (itemOffsets[sIdx].size / 2);
              const y2 = itemOffsets[tIdx].start + (itemOffsets[tIdx].size / 2);

              const isRelatedToHover = hoveredItem === String(dep.source_item_id) || hoveredItem === String(dep.target_item_id);

              return (
                <path 
                  key={dep.id} 
                  d={`M ${x1} ${y1} C ${x1 + 40} ${y1}, ${x2 - 40} ${y2}, ${x2} ${y2}`} 
                  fill="none" 
                  stroke={isRelatedToHover ? '#3B7EF8' : '#3B7EF8'} 
                  strokeWidth={isRelatedToHover ? "2" : "1"} 
                  markerEnd="url(#arrowhead)" 
                  opacity={isRelatedToHover ? "0.8" : "0.1"}
                  filter={isRelatedToHover ? "url(#glow)" : "none"}
                  className="transition-all duration-300"
                />
              );
            })}
          </svg>

          {/* Virtual Items */}
          {rowVirtualizer.getVirtualItems().map((virtualRow) => {
            const data = allItems[virtualRow.index];
            
            if ((data as any).isHeader) {
               const header = data as { title: string, color: string, id: string };
               return (
                 <div 
                   key={virtualRow.key}
                   style={{
                     position: 'absolute',
                     top: 0,
                     left: 0,
                     width: '100%',
                     height: `${virtualRow.size}px`,
                     transform: `translateY(${virtualRow.start}px)`,
                   }}
                   className="flex items-center bg-slate-50/80 backdrop-blur-sm border-b border-slate-200 z-20 sticky left-0 px-4"
                 >
                    <button 
                      onClick={() => toggleGroup(header.id)}
                      className="flex items-center space-x-2 hover:bg-slate-500/50 p-1 rounded transition-colors"
                    >
                      {collapsedGroups.has(header.id) ? <ChevronRight className="w-4 h-4 text-slate-400" /> : <ChevronDown className="w-4 h-4 text-slate-400 rotate-0" />}
                      <div className="w-3 h-3 rounded-full" style={{ backgroundColor: header.color }} />
                      <span className="text-[10px] font-black uppercase tracking-widest text-slate-600">{header.title}</span>
                      <span className="text-[9px] font-bold text-slate-400 bg-slate-200/50 px-1.5 py-0.5 rounded ml-2">
                        {groups.find(g => g.id === header.id)?.items.length} ACTIVIDADES
                      </span>
                    </button>
                    <div className="flex-1 bg-repeat-x opacity-5 h-full pointer-events-none ml-4" style={{ backgroundImage: `linear-gradient(to right, ${header.color} 1px, transparent 1px)`, backgroundSize: '42.85px 100%' }} />
                 </div>
               );
            }

            const item = data as any;
            return (
              <GanttRow 
                key={virtualRow.key}
                item={item}
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
                getTaskSegments={getTaskSegments}
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
            );
          })}
        </div>
      </div>

       {hoveredItem && !isAnyModalOpen && allItems.find(i => !('isHeader' in i) && String(i.id) === hoveredItem) && (() => {
         const item = allItems.find(i => !('isHeader' in i) && String(i.id) === hoveredItem) as Item & { groupColor: string; level: number };
         return (
           <motion.div 
             initial={{ opacity: 0, scale: 0.95 }}
             animate={{ opacity: 1, scale: 1 }}
             className="fixed top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 bg-gray-900/95 backdrop-blur-md text-white p-6 rounded-2xl shadow-2xl z-[80] w-80 pointer-events-none border border-[var(--border-color)]"
           >
             <div className="text-base font-black mb-4 border-b border-[var(--border-color)] pb-3 text-white flex items-center justify-between">
               <span className="truncate">{item.name}</span>
               <div className="w-2 h-2 rounded-full animate-pulse bg-green-500" />
             </div>
             <div className="space-y-3 text-xs">
               <div className="flex justify-between items-center bg-slate-500/5 p-2 rounded-lg">
                 <span className="text-gray-400">📅 Calendario</span>
                 <span className="font-bold text-white uppercase text-[10px]">
                   {(item.values as any)['timeline']?.from || '?'} → {(item.values as any)['timeline']?.to || '?'}
                 </span>
               </div>
               <div className="flex justify-between items-center">
                 <span className="text-gray-400">📈 Avance:</span>
                 <span className="font-bold text-green-400 text-sm">{calculateProgress(item).toFixed(1)}%</span>
               </div>
               <div className="mt-4 pt-3 border-t border-[var(--border-color)] flex items-center space-x-2">
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

      <div className="p-6 bg-[var(--bg-secondary)]/50 border-t border-[var(--border-color)] flex items-center justify-between text-[9px] text-slate-500 font-black uppercase tracking-[0.2em]">
         <div className="flex items-center space-x-8">
            <div className="flex items-center"><div className="w-2 h-2 rounded-full bg-[#10b981] mr-3 shadow-[0_0_8px_#10b981]"></div> Completed</div>
            <div className="flex items-center"><div className="w-2 h-2 rounded-full bg-[#3B7EF8] mr-3 shadow-[0_0_8px_#3B7EF8]"></div> In Progress</div>
            <div className="flex items-center"><div className="w-2 h-2 rounded-full bg-slate-700 mr-3"></div> Pending</div>
         </div>
         <div className="flex items-center gap-3">
            <LinkIcon className="w-3 h-3 text-[#3B7EF8]" />
            <span className="text-slate-400 font-mono">{dependencies.length} RELATIONS ACTIVE</span>
         </div>
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
        .custom-scrollbar::-webkit-scrollbar { width: 6px; height: 6px; }
        .custom-scrollbar::-webkit-scrollbar-track { background: rgba(255,255,255,0.02); }
        .custom-scrollbar::-webkit-scrollbar-thumb { background: rgba(255,255,255,0.1); border-radius: 10px; }
        .custom-scrollbar::-webkit-scrollbar-thumb:hover { background: rgba(59,126,248,0.5); }
        .grid-cols-28 { grid-template-columns: repeat(28, minmax(0, 1fr)); }
      `}} />
    </div>
  );
}
