import React, { useState, useMemo } from 'react';
import { 
    Users, 
    Layers, 
    TrendingUp, 
    LayoutDashboard,
    Maximize2,
    Wand2
} from 'lucide-react';
import { Item } from '@/types/monday';
import { ExecutionViewProps } from './execution/types';
import { ExecutionRow } from './execution/ExecutionRow';
import { HeaderCell } from './execution/CommonCells';
import { 
    getSiteCapacity, 

    calculateTotalJornales,
    calculateVerifiedJornales,

    calculateGroupSchedule
} from './execution/utils';
import PersonnelPicker from './PersonnelPicker';
import PhotoVerificationModal from './modals/PhotoVerificationModal';
import DailyAgendaPanel from './DailyAgendaPanel';
import DateRangeModal from './DateRangeModal';
import AgentControlCenter from './AgentControlCenter';
import MantenixMap from './MantenixMap';

export default function ExecutionView({ 
  groups, columns, onAddItem, onUpdateItem, onUpdateItemValue, 
  onUpdateItemValues, onDeleteItem, isRestricted, onCreateTemplate, activityTemplates 
}: ExecutionViewProps) {
  const [view, setView] = useState<'table' | 'map'>('table');
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [activePrompt, setActivePrompt] = useState<{ groupId: string, item: any } | null>(null);
  const [allExpanded, setAllExpanded] = useState(false);
  const [showTodayOnly, setShowTodayOnly] = useState(true);
  const [isAgendaOpen, setIsAgendaOpen] = useState(false);
  const [selectedGroupId, setSelectedGroupId] = useState<string | null>(null);
  const [isFullScreen, setIsFullScreen] = useState(false);
  const [personnelPicker, setPersonnelPicker] = useState<{ itemId: string | number, currentId: string, top: number, left: number } | null>(null);
  const [activePhotoItem, setActivePhotoItem] = useState<{ item: any, dateId?: string | null } | null>(null);
  const [isPhotoModalOpen, setIsPhotoModalOpen] = useState(false);

  const today = new Date();
  const todayIdStr = today.toISOString().split('T')[0];
  const viewStartDate = today;
  const workingDayOfMonth = today.getDate();

  const days = useMemo(() => {
    return Array.from({ length: 31 }, (_, i) => {
        const d = new Date(viewStartDate);
        d.setDate(viewStartDate.getDate() + i);
        return {
            id: i,
            date: d.toISOString().split('T')[0],
            label: d.toLocaleDateString('es-ES', { weekday: 'short' }).toUpperCase(),
            sub: d.getDate()
        };
    });
  }, [viewStartDate]);

  const schedulesByGroup = useMemo(() => {
    const map: Record<string, Record<string, Record<string, number>>> = {};
    groups.forEach(g => {
        const cap = getSiteCapacity(g.title, today);
        map[g.id] = calculateGroupSchedule(g.items, cap, today, days, g.title);
    });
    return map;
  }, [groups, today, days]);

  const getVal = (item: Item, colId: string) => (item.values as any)[colId] || '';
  const getZoneValue = (item: Item) => (item.values as any)['zona'] || '';

  const handleSavePhoto = (evidence: any) => {
    if (!activePhotoItem) return;
    const { item, dateId } = activePhotoItem;
    const currentValues = item.values['daily_execution'] || {};
    if (dateId) {
        onUpdateItemValue?.('', item.id, 'daily_execution', {
            ...currentValues,
            [dateId]: { ...currentValues[dateId], gallery: [...(currentValues[dateId]?.gallery || []), evidence] }
        });
    } else {
        onUpdateItemValue?.('', item.id, 'verification_gallery', [...(item.values['verification_gallery'] || []), evidence]);
    }
  };

  const handleDeleteEvidence = (photoUrl: string) => {
    if (!activePhotoItem) return;
    const { item, dateId } = activePhotoItem;
    if (dateId) {
        const currentExec = item.values['daily_execution'] || {};
        const dayExec = currentExec[dateId] || {};
        const newGallery = (dayExec.gallery || []).filter((url: string) => url !== photoUrl);
        onUpdateItemValue?.('', item.id, 'daily_execution', { ...currentExec, [dateId]: { ...dayExec, gallery: newGallery } });
    } else {
        const newGallery = (item.values['verification_gallery'] || []).filter((url: string) => url !== photoUrl);
        onUpdateItemValue?.('', item.id, 'verification_gallery', newGallery);
    }
  };

  const handleDailyToggle = (gId: string, item: Item, dateId: string) => {
    const cur = item.values['daily_execution'] || {};
    const dayData = cur[dateId] || { val: 0, done: false };
    const isDone = typeof dayData === 'object' ? dayData.done : !!dayData;
    const val = typeof dayData === 'object' ? dayData.val : dayData;
    onUpdateItemValue?.(gId, item.id, 'daily_execution', { ...cur, [dateId]: { val, done: !isDone } });
  };

  const handleAssignPersonnel = (personId: string) => {
    if (personnelPicker) onUpdateItemValue?.('', personnelPicker.itemId, 'operador', personId);
    setPersonnelPicker(null);
  };

  const handleSaveDates = (startDateStr: string, endDateStr: string) => {
    if (activePrompt) {
        onUpdateItemValues?.('', activePrompt.item.id, { 
            'fecha_inicio': startDateStr, 
            'fecha_fin': endDateStr 
        });
    }
    setIsModalOpen(false);
  };

  const globalCompliance = useMemo(() => {
    let totalVerified = 0;
    let totalTarget = 0;
    groups.forEach(g => {
        g.items.forEach(it => {
            totalVerified += calculateVerifiedJornales(it);
            totalTarget += calculateTotalJornales(it);
        });
    });
    return totalTarget > 0 ? Math.round((totalVerified / totalTarget) * 100) : 0;
  }, [groups]);

  const calculateProgressWork = (item: Item) => {
    const total = calculateTotalJornales(item);
    if (total === 0) return 0;
    return (calculateVerifiedJornales(item) / total) * 100;
  };

  return (
    <div className={`flex flex-col h-full bg-[var(--bg-primary)] overflow-hidden font-sans transition-all duration-500 ${isFullScreen ? 'fixed inset-0 z-[9999] bg-slate-950 p-4' : 'relative'}`}>
      <div className="flex items-center justify-between px-8 py-4 bg-white/5 border-b border-[var(--border-color)] backdrop-blur-xl shrink-0 rounded-t-2xl">
          <div className="flex items-center gap-6">
            <div className="flex bg-slate-500/5 p-1 rounded-xl border border-[var(--border-color)]">
              <button onClick={() => setView('table')} className={`px-4 py-1.5 rounded-lg text-[9px] font-black uppercase tracking-widest transition-all ${view === 'table' ? 'bg-[#3B7EF8] text-white shadow-lg shadow-[#3B7EF8]/20' : 'text-slate-500 hover:text-slate-300'}`}>Grid_Tactico</button>
              <button onClick={() => setView('map')} className={`px-4 py-1.5 rounded-lg text-[9px] font-black uppercase tracking-widest transition-all ${view === 'map' ? 'bg-[#3B7EF8] text-white shadow-lg shadow-[#3B7EF8]/20' : 'text-slate-500 hover:text-slate-300'}`}>Map_Ops</button>
            </div>
            <div className="h-4 w-[1px] bg-white/5 mx-2" />
            <div className="flex bg-slate-500/5 p-1 rounded-xl border border-[var(--border-color)]">
              <button onClick={() => setShowTodayOnly(false)} className={`px-3 py-1 rounded-md text-[8px] font-black uppercase tracking-widest transition-all ${!showTodayOnly ? 'bg-[#10B981]/20 text-[#10B981]' : 'text-slate-700 hover:text-slate-500'}`}>MES_TOTAL</button>
              <button onClick={() => setShowTodayOnly(true)} className={`px-3 py-1 rounded-md text-[8px] font-black uppercase tracking-widest transition-all ${showTodayOnly ? 'bg-[#10B981]/20 text-[#10B981]' : 'text-slate-700 hover:text-slate-500'}`}>TURNO_HOY</button>
            </div>
            <div className="h-4 w-[1px] bg-white/5 mx-2" />
            <div className="flex items-center gap-2 px-3 py-1 bg-[#3B7EF8]/10 border border-[#3B7EF8]/20 rounded-lg">
                <Wand2 className="w-3 h-3 text-[#3B7EF8] animate-pulse" />
                <span className="text-[8px] font-black text-[#3B7EF8] uppercase tracking-widest">Gantt_Prediction_v2</span>
            </div>
          </div>
          <div className="flex items-center gap-3">
             <div className="flex gap-1 p-1 bg-slate-500/5 rounded-xl border border-[var(--border-color)]">
                  <button onClick={() => setAllExpanded(!allExpanded)} className={`p-2 rounded-lg transition-all border ${allExpanded ? 'bg-[#3B7EF8] text-white border-[#3B7EF8] shadow-lg shadow-[#3B7EF8]/20' : 'bg-slate-500/5 text-slate-500 border-transparent hover:border-[#3B7EF8]/30'}`} title={allExpanded ? "Contraer Todo" : "Expandir Todo"}><Layers className="w-4 h-4" /></button>
                  <button onClick={() => setIsFullScreen(!isFullScreen)} className={`p-2 rounded-lg transition-all border ${isFullScreen ? 'bg-[#3B7EF8] text-white border-[#3B7EF8] shadow-lg shadow-[#3B7EF8]/20' : 'bg-slate-500/5 text-slate-500 border-transparent hover:border-[#3B7EF8]/30'}`} title="Pantalla Completa"><Maximize2 className="w-4 h-4" /></button>
              </div>
              <div className="bg-[#10B981]/10 text-[#10B981] px-3 py-1 rounded-lg text-[9px] font-black uppercase tracking-widest flex items-center border border-[#10B981]/10"><TrendingUp className="w-3 h-3 mr-2" /> {globalCompliance}%</div>
              <button 
                onClick={() => { setSelectedGroupId(null); setIsAgendaOpen(true); }} 
                className="flex items-center space-x-2 bg-[#3B7EF8]/10 text-[#3B7EF8] px-3 py-1 rounded-lg text-[8px] font-black border border-[#3B7EF8]/20 hover:bg-[#3B7EF8]/20 transition-all font-mono"
              >
                <LayoutDashboard className="w-3 h-3" />
                <span className="uppercase tracking-[0.2em]">Agenda_Global</span>
              </button>
          </div>
      </div>

      <div className="flex-1 overflow-hidden relative">
        {view === 'table' ? (
          <div className="flex-1 overflow-x-auto overflow-y-auto custom-scrollbar bg-slate-950 exec-grid-scroll rounded-xl border border-white/5 w-full h-full" id="execution-grid-parent">
            <div style={{ minWidth: '4800px' }} className="flex flex-col pb-60 shadow-inner">
              <div 
                className="grid bg-[#1A1F2B] sticky top-0 z-50 border-b border-white/10 shadow-2xl h-[48px] shrink-0 w-full" 
                style={{ gridTemplateColumns: `60px 450px 180px 60px 60px 100px 100px 120px 80px 80px repeat(${days.length}, 110px) 110px 100px 60px` }}
              >
                  <HeaderCell label="ID" /><HeaderCell label="ACTIVIDADES" /><HeaderCell label="OPERADOR" /><HeaderCell label="VERIF" /><HeaderCell label="UN" /><HeaderCell label="CANT" /><HeaderCell label="REND" /><HeaderCell label="JOR.REQ" color="#3B7EF8" /><HeaderCell label="FREC" /><HeaderCell label="META" />
                  {days.map((day: any) => ( 
                    <div key={`header-day-${day.id}`} className="border-r border-white/5 p-1 flex flex-col items-center justify-center bg-white/5 h-full min-w-[110px]">
                      <span className="text-[9px] font-black text-white/90 uppercase leading-none">{day.label}</span>
                      <span className="text-[8px] font-bold text-[#3B7EF8] mt-1 opacity-80">{day.sub}</span>
                    </div> 
                  ))}
                  <HeaderCell label="TOT.EJEC" color="#10B981" /><HeaderCell label="% CUMP" /><HeaderCell label="OPC" />
               </div>

              <div className="bg-transparent divide-y divide-white/5 w-full">
                {groups.map((group) => {
                    const cap = getSiteCapacity(group.title, today);
                    const schedule = schedulesByGroup[group.id];
                    const deferredIds = new Set<string>(); 

                    // CORRECCIÓN TÁCTICA: Formato de fecha local ISO (YYYY-MM-DD) sin desfase UTC
                    const todayIdStr = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
                    const todayProjected = Object.values(schedule[todayIdStr] || {}).reduce((a, b) => a + b, 0);
                    const loadPct = cap ? Math.min(100, Math.round((todayProjected / cap.daily_capacity) * 100)) : 0;
                    const loadColor = loadPct > 90 ? 'bg-rose-500 select-none animate-pulse' : 'bg-emerald-500';
                    const loadTextColor = loadPct > 90 ? 'text-rose-400' : 'text-emerald-400';

                    return (
                        <div key={`group-${group.id}`}>
                            <div className="bg-slate-900/95 border-y border-white/10 flex items-center px-6 py-2 justify-between sticky top-[48px] z-30 backdrop-blur-2xl h-[38px] shadow-lg w-full">
                                <div className="flex items-center space-x-3 truncate">
                                    <div className="w-2.5 h-1.5 rounded-full" style={{ backgroundColor: group.color }}></div>
                                    <span className="text-[11px] font-black text-white uppercase tracking-widest">{group.title}</span>
                                    {cap && (
                                        <div className="flex items-center gap-2 px-3 py-1 bg-[#3B7EF8]/5 rounded-full border border-[#3B7EF8]/20 ml-4">
                                            <Users className="w-3 h-3 text-[#3B7EF8]" />
                                            <span className="text-[9px] font-mono font-black text-white/90">
                                                {cap.base_capacity} PER / {cap.daily_capacity.toFixed(2)} JOR
                                            </span>
                                            <div className="w-10 h-1 bg-slate-800 rounded-full overflow-hidden ml-2">
                                                <div className="h-full bg-[#3B7EF8] shadow-[0_0_8px_rgba(59,126,248,0.5)]" style={{ width: '100%' }} />
                                            </div>
                                        </div>
                                    )}
                                </div>
                                <div className="flex items-center gap-2">
                                    <button 
                                      onClick={() => { setSelectedGroupId(group.id); setIsAgendaOpen(true); }}
                                      className="flex items-center gap-1.5 text-[8px] font-black text-white bg-white/5 hover:bg-white/10 px-2 py-1 rounded-lg border border-white/5 transition-all uppercase tracking-widest"
                                    >
                                        <LayoutDashboard className="w-3 h-3 text-[#3B7EF8]" /> Agenda
                                    </button>
                                    <button onClick={() => onAddItem?.(group.id, 'Nueva Actividad')} className="text-[9px] font-black text-slate-500 hover:text-white uppercase px-2">+ Add</button>
                                </div>
                            </div>
                            <div className="divide-y divide-white/5">
                                {group.items.map((item, iIdx) => (
                                    <ExecutionRow 
                                        key={item.id}
                                        curr={item}
                                        level={0}
                                        indexStr={(iIdx + 1).toString()}
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
                                        projectedSchedule={schedule}
                                    />
                                ))}
                                {/* GROUP FOOTER FOR TOTALS */}
                                <div 
                                  className="grid h-[34px] bg-white/[0.02] border-t border-white/10 items-center font-black"
                                  style={{ gridTemplateColumns: `60px 450px 150px 80px 60px 80px 80px 80px 60px 60px repeat(${days.length}, 110px) 110px 100px 60px` }}
                                >
                                    <div className="col-span-10 flex items-center px-6 justify-end text-[10px] text-[#3B7EF8]/80 uppercase tracking-widest bg-gradient-to-r from-transparent to-[#3B7EF8]/5 h-full border-r border-white/5">
                                        Total Jornales Programados (Balanceados)
                                    </div>
                                    {days.map((d: any) => {
                                        const totalDayProj = Object.values(schedule[d.date] || {}).reduce((a, b) => a + b, 0);

                                        return (
                                            <div key={`total-${group.id}-${d.date}`} className="h-full border-r border-white/5 flex items-center justify-center bg-[#3B7EF8]/5">
                                                <span className="text-[10px] font-mono font-black text-[#3B7EF8]">{totalDayProj > 0 ? totalDayProj.toFixed(1) : ''}</span>
                                            </div>
                                        );
                                    })}
                                    <div className="bg-[#10B981]/10 h-full border-r border-white/5 flex items-center justify-center text-[10px] font-black text-[#10B981]">
                                        {group.items.reduce((acc, it) => acc + calculateProgressWork(it), 0).toFixed(1)}
                                    </div>
                                    <div className="h-full"></div>
                                    <div className="h-full"></div>
                                </div>
                            </div>
                        </div>
                    );
                })}
              </div>
            </div>
          </div>
        ) : (
          <div className="h-full w-full p-4 lg:p-8">
            <MantenixMap items={groups.flatMap(g => g.items.map(it => ({ id: it.id, name: it.name, status: (it.values as any)['status'] || 'SHIFT_ACTIVE', lat: (it as any).lat, lng: (it as any).lng, values: it.values })))} />
          </div>
        )}
      </div>

      <DailyAgendaPanel 
        isOpen={isAgendaOpen} 
        onClose={() => setIsAgendaOpen(false)} 
        date={viewStartDate} 
        groups={groups} 
        onVerify={handleDailyToggle} 
        filterGroupId={selectedGroupId}
      />
      {personnelPicker && <PersonnelPicker currentValue={personnelPicker.currentId} onSelect={handleAssignPersonnel} onClose={() => setPersonnelPicker(null)} position={{ top: personnelPicker.top, left: personnelPicker.left }} />}
      <DateRangeModal isOpen={isModalOpen} onClose={() => setIsModalOpen(false)} onSave={handleSaveDates} itemName={activePrompt?.item.name || ''} expectedDays={0} />
      <AgentControlCenter />
      <PhotoVerificationModal 
            isOpen={isPhotoModalOpen} 
            onClose={() => {setIsPhotoModalOpen(false); setActivePhotoItem(null);}} 
            onSave={handleSavePhoto} 
            onDelete={handleDeleteEvidence} 
            itemName={activePhotoItem?.item.name || ''} 
            itemId={activePhotoItem?.item.id || ''} 
            initialGallery={activePhotoItem ? (activePhotoItem.item.values['verification_gallery'] || []) : []} 
        />
      <style jsx>{`
        .custom-scrollbar::-webkit-scrollbar {
          height: 14px;
          width: 8px;
        }
        .custom-scrollbar::-webkit-scrollbar-track {
          background: rgba(15, 23, 42, 0.4);
          border-radius: 20px;
          margin-bottom: 2px;
        }
        .custom-scrollbar::-webkit-scrollbar-thumb {
          background: linear-gradient(135deg, #3B7EF8 0%, #2563EB 100%);
          border-radius: 20px;
          border: 3px solid #0B0E14;
          box-shadow: 0 0 10px rgba(59, 126, 248, 0.2);
        }
        .custom-scrollbar::-webkit-scrollbar-thumb:hover {
          background: linear-gradient(135deg, #2563EB 0%, #1D4ED8 100%);
        }
        .exec-grid-scroll {
          scrollbar-gutter: always;
        }
      `}</style>
    </div>
  );
}
