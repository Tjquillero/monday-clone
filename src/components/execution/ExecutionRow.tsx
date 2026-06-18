import React, { useState, useEffect } from 'react';
import { 
    ChevronDown, 
    ChevronRight, 
    Trash2,
    Camera,
    CheckCircle2,
    Zap
} from 'lucide-react';
import { motion } from 'framer-motion';
import { ExecutionRowProps } from './types';
import { Cell, EditableCell } from './CommonCells';
import { Item } from '@/types/monday';
import { getVal, getFrecValue, calculateVerifiedJornales } from './utils';

export const ExecutionRow = ({ 
    curr, level, indexStr, allExpanded, deferredIds, today, group, columns, 
    showTodayOnly, isRestricted, onUpdateItemValue, onDeleteItem, 
    setPersonnelPicker, setActivePhotoItem, setIsPhotoModalOpen,
    calculateProgressWork, calculateTotalJornales, calculateVerifiedJornales,
    handleDailyToggle, getVal, getZoneValue, days, suggestedJornales,
    projectedSchedule
}: ExecutionRowProps) => {
    const [localExpanded, setLocalExpanded] = useState(allExpanded);
    
    useEffect(() => {
        setLocalExpanded(allExpanded);
    }, [allExpanded]);

    const rowExpanded = localExpanded;

    const progT = calculateProgressWork(curr);
    const hasUnverifiedExec = Object.values(curr.values['daily_execution'] || {}).some((v: any) => 
        (typeof v === 'object' ? !v.done : !v)
    );

    const frecValue = getFrecValue(curr);
    const totalJorReq = calculateTotalJornales(curr);

    const isDeferred = deferredIds.has(curr.id);
    const todayIdStr = today.toISOString().split('T')[0];

    return (
      <div className={`flex flex-col group/row ${level > 0 ? 'bg-white/[0.01]' : ''}`}>
        <div 
          className={`grid h-[34px] border-b border-white/[0.04] items-center hover:bg-white/[0.04] transition-all relative ${isDeferred ? 'bg-amber-500/5' : ''}`}
          style={{ gridTemplateColumns: `60px 450px 180px 60px 60px 100px 100px 120px 80px 80px repeat(${days.length}, 110px) 110px 100px 60px` }}
        >
            <div className="h-full flex items-center justify-center border-r border-white/5 text-[9px] font-mono text-slate-500">{indexStr}</div>
            
            <div className={`flex items-center px-4 h-full border-r border-white/5 overflow-hidden gap-2 ${level > 0 ? 'pl-8' : ''}`}>
               {curr.subItems && curr.subItems.length > 0 && (
                   <button 
                     onClick={(e) => { e.stopPropagation(); setLocalExpanded(!localExpanded); }}
                     className="p-1 hover:bg-white/10 rounded-md transition-all text-[#3B7EF8]"
                   >
                       {rowExpanded ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
                   </button>
               )}
               <span className="text-[10px] font-bold text-white/90 truncate flex-1 uppercase tracking-tight">{curr.name}</span>
               {isDeferred && (
                   <div className="bg-amber-500/10 text-amber-500 px-2 py-0.5 rounded-full border border-amber-500/20 flex items-center">
                       <span className="text-[8px] font-black">DIF</span>
                   </div>
               )}
            </div>

            <div className="h-full px-2 border-r border-white/5 flex items-center overflow-hidden">
                <button onClick={(e) => setPersonnelPicker({ itemId: curr.id, currentId: getVal(curr, 'operador'), top: e.clientY, left: e.clientX })} className="text-[9px] font-bold text-[#3B7EF8] hover:underline truncate uppercase">
                    {getVal(curr, 'operador') || 'SIN ASIGNAR'}
                </button>
            </div>

            <div className="h-full flex items-center justify-center border-r border-white/5">
                <button onClick={() => { setActivePhotoItem({ item: curr, dateId: null }); setIsPhotoModalOpen(true); }} className={`p-1.5 rounded-lg transition-all ${hasUnverifiedExec ? 'bg-amber-500/10 text-amber-500 animate-pulse' : 'bg-[#3B7EF8]/10 text-[#3B7EF8]'}`}>
                    <Camera className="w-3.5 h-3.5" />
                </button>
            </div>

            <Cell text={getVal(curr, 'unidad') || getVal(curr, 'unidad_de_medida') || getVal(curr, 'unid') || getVal(curr, 'un') || 'GL'} color="slate-400" />
            <EditableCell value={getVal(curr, 'cant') || 0} type="number" onSave={(v) => onUpdateItemValue?.('', curr.id, 'cant', v)} color="#3B7EF8" weight="800" />
            <EditableCell value={getVal(curr, 'rend') || 1} type="number" onSave={(v) => onUpdateItemValue?.('', curr.id, 'rend', v)} color="#3B7EF8" />
            <Cell text={totalJorReq.toFixed(1)} color="#3B7EF8" weight="900" />
            <EditableCell value={frecValue} type="number" onSave={(v) => onUpdateItemValue?.('', curr.id, 'frequency', v)} color="#3B7EF8" />
            <EditableCell value={getVal(curr, 'meta') || 1} type="number" onSave={(v) => onUpdateItemValue?.('', curr.id, 'meta', v)} color="#3B7EF8" weight="800" bg="rgba(59, 126, 248, 0.05)" />

            {days.map((d: any, dIdx: number) => {
                const exec = curr.values['daily_execution'] || {};
                const dayE = exec[d.date];
                const isDone = typeof dayE === 'object' ? !!dayE.done : !!dayE;
                const val = typeof dayE === 'object' ? dayE.val : dayE;

                // PERFORMANCE-BASED GANTT PROJECTION
                const cant = parseFloat(getVal(curr, 'cant')) || 0;
                const rend = parseFloat(getVal(curr, 'rend')) || 1;
                const meta = parseFloat(getVal(curr, 'meta')) || 1;
                const totalJorNeeded = Math.ceil(cant / (rend || 1));
                const verifiedJor = calculateVerifiedJornales(curr);
                const remainingJor = Math.max(0, totalJorNeeded - verifiedJor);
                
                const todayIdStr = today.toISOString().split('T')[0];
                const currentDate = new Date(d.date + "T00:00:00");
                const isPast = currentDate < new Date(todayIdStr);
                const isToday = d.date === todayIdStr;

                // Balanced Projection Logic
                let isProjected = false;
                let valFromSchedule = 0;

                if (projectedSchedule && projectedSchedule[d.date] && projectedSchedule[d.date][curr.id]) {
                    isProjected = true;
                    valFromSchedule = projectedSchedule[d.date][curr.id];
                }

                return (
                    <div 
                      key={`exec-${curr.id}-${d.date}`} 
                      className={`border-r border-white/5 h-full flex items-center justify-center transition-all hover:bg-white/5 group/cell relative ${isProjected ? 'bg-[#3B7EF8]/10 shadow-[inset_0_0_15px_rgba(59,126,248,0.05)]' : ''}`}
                    >
                        {isToday && (
                            <div className="absolute inset-0 bg-white/5 pointer-events-none z-0 border-x border-[#3B7EF8]/20" />
                        )}

                        <button 
                          onClick={() => handleDailyToggle(group.id, curr, d.date)}
                          className={`w-full h-full flex flex-col items-center justify-center gap-0.5 transition-all z-20 ${isDone ? 'bg-emerald-500/10' : ''}`}
                        >
                            {val ? (
                                <span className={`text-[10px] font-mono font-black ${isDone ? 'text-emerald-500 shadow-sm' : 'text-[#3B7EF8]'}`}>
                                    {parseFloat(val).toFixed(1)}
                                </span>
                            ) : isProjected && !isPast ? (
                                <div className="flex flex-col items-center">
                                    <span className="text-[10px] font-mono font-black text-[#3B7EF8]/60 italic">
                                        {valFromSchedule.toFixed(1)}
                                    </span>
                                    {isToday && <Zap className="w-2.5 h-2.5 text-amber-500 animate-bounce mt-0.5" />}
                                </div>
                            ) : null}
                            {isDone && <CheckCircle2 className="w-3 h-3 text-emerald-500" />}
                        </button>
                    </div>
                );
            })}

            <div className="h-full flex items-center justify-center border-r border-white/5 text-[10px] font-black text-[#10B981] bg-emerald-500/5">{progT.toFixed(1)}</div>
            
            <div className="h-full px-3 border-r border-white/5 flex flex-col justify-center gap-1 min-w-[100px]">
                <div className="flex justify-between items-center h-2">
                    {hasUnverifiedExec && progT <= 0 ? (
                        <span className="text-[7px] font-black bg-rose-500/10 text-rose-600 px-1.5 py-0.5 rounded border border-rose-500/20 animate-pulse whitespace-nowrap">
                            FALTA FOTO
                        </span>
                    ) : (
                        <span className={`text-[11px] font-mono font-black ${progT >= 100 ? "text-emerald-500" : progT > 50 ? "text-[#3B7EF8]" : "text-amber-600"}`}>
                            {Math.round(progT)}%
                        </span>
                    )}
                </div>
                <div className="h-1 bg-slate-800 rounded-full overflow-hidden border border-white/5">
                    <div className={`h-full transition-all duration-700 ${progT >= 100 ? 'bg-emerald-500' : progT > 50 ? 'bg-[#3B7EF8]' : 'bg-amber-600'}`} style={{ width: `${Math.min(100, progT)}%` }} />
                </div>
            </div>

            <div className="h-full flex items-center justify-center px-4">
                <button onClick={(e) => { e.stopPropagation(); onDeleteItem?.(curr.id); }} className="p-1.5 rounded-lg bg-rose-500/5 text-slate-800 hover:text-rose-500 hover:bg-rose-500/10 transition-all">
                    <Trash2 className="w-3.5 h-3.5" />
                </button>
            </div>
        </div>
        {rowExpanded && curr.subItems && curr.subItems.map((sub: Item, sIdx: number) => (
            <ExecutionRow 
              key={`sub-${sub.id}`}
              curr={sub} 
              level={level + 1} 
              indexStr={`${indexStr}.${sIdx + 1}`}
              allExpanded={allExpanded}
              deferredIds={deferredIds}
              today={today}
              group={group}
              columns={columns}
              showTodayOnly={showTodayOnly}
              isRestricted={isRestricted}
              onUpdateItemValue={onUpdateItemValue}
              onDeleteItem={onDeleteItem}
              setPersonnelPicker={setPersonnelPicker}
              setActivePhotoItem={setActivePhotoItem}
              setIsPhotoModalOpen={setIsPhotoModalOpen}
              calculateProgressWork={calculateProgressWork}
              calculateTotalJornales={calculateTotalJornales}
              calculateVerifiedJornales={calculateVerifiedJornales}
              handleDailyToggle={handleDailyToggle}
              getVal={getVal}
              getZoneValue={getZoneValue}
              days={days}
              suggestedJornales={undefined}
              projectedSchedule={projectedSchedule}
            />
        ))}
      </div>
    );
};
