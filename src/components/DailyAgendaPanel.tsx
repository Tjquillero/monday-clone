'use client';

import React, { useMemo, useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { 
  X, Users, Calendar, Clock, 
  ChevronRight, 

} from 'lucide-react';
import Image from 'next/image';
import { Group, Item } from '@/types/monday';
import { ActivityCardTactical } from './execution/ActivityCardTactical';

interface DailyAgendaPanelProps {
  isOpen: boolean;
  onClose: () => void;
  date: Date;
  groups: Group[];
  onVerify: (groupId: string, item: Item, dateId: string) => void;
  filterGroupId?: string | null;
}

interface DailyTask {
  item: Item;
  groupId: string;
  groupTitle: string;
  jor: number;
  done: boolean;
  priority: 'Alta' | 'Media' | 'Baja';
  hours: string;
}

const getSpanishDayName = (date: Date) => {
  const days = ['Domingo', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado'];
  return days[date.getDay()];
};

const getSpanishDayShort = (date: Date) => {
  const days = ['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb'];
  return days[date.getDay()];
};

const getSpanishMonthName = (date: Date) => {
  const months = ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'];
  return months[date.getMonth()];
};

const getDaysOfWeek = (currentDate: Date) => {
  const result = [];
  const currentDay = currentDate.getDay();
  const distance = currentDay === 0 ? -6 : 1 - currentDay;
  const monday = new Date(currentDate);
  monday.setDate(currentDate.getDate() + distance);
  
  for (let i = 0; i < 7; i++) {
    const day = new Date(monday);
    day.setDate(monday.getDate() + i);
    result.push(day);
  }
  return result;
};

const getDayStats = (targetDate: Date, groups: Group[], filterGroupId?: string | null) => {
  const dateId = targetDate.toISOString().split('T')[0];
  let totalTasks = 0;
  let doneTasks = 0;
  let totalPlanificado = 0;
  let totalAsignado = 0;
  const tasks: DailyTask[] = [];

  groups.filter(g => !filterGroupId || g.id === filterGroupId).forEach(group => {
    group.items.forEach(item => {
      const execution = item.values['daily_execution'] || {};
      const dayEntry = execution[dateId];
      const frec = parseFloat((item.values as any)['frec']) || 1;
      const meta = parseFloat((item.values as any)['meta']) || 0;
      
      const isScheduled = dayEntry || frec === 1 || (targetDate.getDate() % frec === 0);

      if (isScheduled) {
        const val = typeof dayEntry === 'object' ? (parseFloat(dayEntry.val) || 0) : (parseFloat(dayEntry) || 0);
        const isDone = typeof dayEntry === 'object' ? !!dayEntry.done : false;
        const displayJor = val || meta || 1;

        tasks.push({
          item,
          groupId: group.id,
          groupTitle: group.title,
          jor: displayJor,
          done: isDone,
          priority: (item.values as any)['prioridad'] || 'Media',
          hours: "08:00 - 16:00"
        });
        
        totalTasks++;
        if (isDone) doneTasks++;
        
        totalPlanificado += meta || 1;
        totalAsignado += val || (isScheduled ? meta || 1 : 0);
      }
    });
  });

  const progress = totalPlanificado > 0 ? (totalAsignado / totalPlanificado) * 100 : 0;
  const tasksProgress = totalTasks > 0 ? (doneTasks / totalTasks) * 100 : 0;
  const disponible = Math.max(0, totalPlanificado - totalAsignado);

  return {
    dateId,
    tasks: tasks.sort((a, b) => (a.done === b.done ? 0 : a.done ? 1 : -1)),
    totalTasks,
    doneTasks,
    totalPlanificado,
    totalAsignado,
    disponible,
    progress,
    tasksProgress
  };
};

const MetricItem = ({ icon: Icon, value, label, color = "text-white" }: { icon: any, value: string, label: string, color?: string }) => (
  <div className="flex items-center gap-4 group">
    <div className="w-10 h-10 rounded-xl bg-white/5 border border-white/10 flex items-center justify-center text-slate-400 group-hover:bg-[#10B981]/10 group-hover:text-[#10B981] transition-all">
      <Icon className="w-5 h-5" />
    </div>
    <div>
      <p className={`text-sm font-black ${color} tracking-tight leading-none`}>{value}</p>
      <p className="text-[10px] text-slate-500 font-bold uppercase tracking-wider mt-1">{label}</p>
    </div>
  </div>
);

export default function DailyAgendaPanel({ isOpen, onClose, date, groups, onVerify, filterGroupId }: DailyAgendaPanelProps) {
  const [mounted, setMounted] = useState(false);
  const [viewMode, setViewMode] = useState<'today' | 'week'>('today');
  const [selectedDate, setSelectedDate] = useState<Date>(date);

  useEffect(() => {
    setSelectedDate(date);
  }, [date, isOpen]);

  useEffect(() => { setMounted(true); }, []);

  const daysOfWeek = useMemo(() => getDaysOfWeek(date), [date]);
  const todayStr = useMemo(() => new Date().toISOString().split('T')[0], []);

  const selectedDayStats = useMemo(() => {
    return getDayStats(selectedDate, groups, filterGroupId);
  }, [selectedDate, groups, filterGroupId]);

  if (!mounted) return null;

  const progressPercent = Math.round(selectedDayStats.tasksProgress);
  let progressColor = "#10B981";
  let progressTextClass = "text-[#10B981]";
  
  if (selectedDayStats.totalTasks === 0) {
    progressColor = "rgba(255,255,255,0.1)";
    progressTextClass = "text-slate-500";
  } else if (progressPercent >= 80) {
    progressColor = "#10B981";
    progressTextClass = "text-[#10B981]";
  } else if (progressPercent >= 50) {
    progressColor = "#F59E0B";
    progressTextClass = "text-[#F59E0B]";
  } else {
    progressColor = "#EF4444";
    progressTextClass = "text-[#EF4444]";
  }

  return createPortal(
    <AnimatePresence>
      {isOpen && (
        <div className="fixed inset-0 z-[10000] flex justify-end items-start p-4 md:p-10 pointer-events-none">
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
            className="fixed inset-0 bg-black/40 backdrop-blur-sm pointer-events-auto"
          />

          <motion.div
            initial={{ x: 100, opacity: 0, scale: 0.95 }}
            animate={{ x: 0, opacity: 1, scale: 1 }}
            exit={{ x: 100, opacity: 0, scale: 0.95 }}
            className="w-full max-w-lg bg-slate-950/80 backdrop-blur-3xl border border-white/10 rounded-[3rem] shadow-[0_50px_100px_rgba(0,0,0,0.5)] flex flex-col max-h-[90vh] pointer-events-auto relative overflow-hidden"
          >
            {/* Mapa de Fondo del Sitio */}
            <div className="absolute inset-0 z-0 opacity-20 pointer-events-none scale-110 blur-[2px]">
               <Image 
                 src="https://images.unsplash.com/photo-1500382017468-9049fed747ef?auto=format&fit=crop&q=80&w=2000" 
                 alt="Mapa de Sitio" 
                 fill 
                 className="object-cover"
                 unoptimized
               />
               <div className="absolute inset-0 bg-gradient-to-b from-slate-950/80 via-transparent to-slate-950/90" />
            </div>

            {/* Header */}
            <div className="p-8 flex flex-col gap-4 border-b border-white/5 shrink-0 bg-white/[0.02] relative z-10">
              <div className="flex items-center justify-between">
                <div>
                  <h2 className="text-2xl font-black text-white italic tracking-tighter">Agenda Operativa</h2>
                  <p className="text-xs text-slate-400 font-bold uppercase tracking-wider mt-1">
                    {viewMode === 'today' 
                      ? `${getSpanishDayName(selectedDate)} ${selectedDate.getDate()} de ${getSpanishMonthName(selectedDate)}` 
                      : 'Semáforo de Cumplimiento'
                    }
                  </p>
                </div>
                <div className="flex items-center gap-3">
                  <button onClick={onClose} className="w-10 h-10 bg-white/5 border border-white/10 rounded-xl flex items-center justify-center text-slate-400 hover:text-rose-500 transition-all">
                     <X className="w-5 h-5" />
                  </button>
                </div>
              </div>

              {/* Toggle Hoy / Semana */}
              <div className="flex bg-white/5 p-1 rounded-2xl border border-white/10">
                <button
                  onClick={() => setViewMode('today')}
                  className={`flex-1 py-3 text-[10px] font-black rounded-xl uppercase tracking-widest transition-all ${
                    viewMode === 'today' ? 'bg-white text-slate-950 shadow-lg font-black' : 'text-slate-400 hover:text-white'
                  }`}
                >
                  Hoy
                </button>
                <button
                  onClick={() => setViewMode('week')}
                  className={`flex-1 py-3 text-[10px] font-black rounded-xl uppercase tracking-widest transition-all ${
                    viewMode === 'week' ? 'bg-white text-slate-950 shadow-lg font-black' : 'text-slate-400 hover:text-white'
                  }`}
                >
                  Semana
                </button>
              </div>
            </div>

            {/* Semáforo de navegación superior de 7 días */}
            <div className="px-8 pt-6 shrink-0 relative z-10">
              <div className="flex justify-between items-center bg-black/40 backdrop-blur-xl border border-white/10 rounded-[2rem] p-4">
                {daysOfWeek.map((day) => {
                  const stats = getDayStats(day, groups, filterGroupId);
                  const dId = day.toISOString().split('T')[0];
                  const isFuture = dId > todayStr;
                  const isSelected = dId === selectedDate.toISOString().split('T')[0];
                  
                  let colorClass = "bg-slate-800 border border-white/5 text-slate-400";
                  let shadowClass = "";
                  
                  if (isFuture) {
                    colorClass = "bg-slate-950 border border-dashed border-white/10 text-slate-600";
                  } else if (stats.totalTasks === 0) {
                    colorClass = "bg-slate-900 border border-white/5 text-slate-500";
                  } else if (stats.tasksProgress >= 80) {
                    colorClass = "bg-emerald-500 text-white border-transparent";
                    shadowClass = "shadow-[0_0_12px_rgba(16,185,129,0.5)]";
                  } else if (stats.tasksProgress >= 50) {
                    colorClass = "bg-amber-500 text-slate-950 border-transparent";
                    shadowClass = "shadow-[0_0_12px_rgba(245,158,11,0.5)]";
                  } else {
                    colorClass = "bg-rose-500 text-white border-transparent";
                    shadowClass = "shadow-[0_0_12px_rgba(244,63,94,0.5)]";
                  }

                  return (
                    <button
                      key={`sem-day-${dId}`}
                      onClick={() => {
                        setSelectedDate(day);
                        setViewMode('today');
                      }}
                      className={`flex flex-col items-center gap-1.5 p-1.5 rounded-xl transition-all cursor-pointer ${
                        isSelected ? 'bg-white/10 border border-white/20' : 'border border-transparent hover:bg-white/5'
                      }`}
                    >
                      <span className="text-[8px] font-black uppercase tracking-widest text-slate-500">
                        {getSpanishDayShort(day)}
                      </span>
                      <div className={`w-7 h-7 rounded-full flex items-center justify-center text-[10px] font-black ${colorClass} ${shadowClass}`}>
                        {day.getDate()}
                      </div>
                      {stats.totalTasks > 0 && !isFuture && (
                        <span className="text-[7px] font-mono font-bold text-slate-400">
                          {stats.doneTasks}/{stats.totalTasks}
                        </span>
                      )}
                      {isFuture && stats.totalTasks > 0 && (
                        <span className="text-[7px] font-mono font-bold text-slate-600">
                          ({stats.totalTasks})
                        </span>
                      )}
                      {stats.totalTasks === 0 && (
                        <span className="text-[7px] font-mono font-bold text-slate-600">
                          -
                        </span>
                      )}
                    </button>
                  );
                })}
              </div>
            </div>

            {viewMode === 'today' ? (
              <>
                {/* Dashboard Stats */}
                <div className="p-8 pb-4 shrink-0 relative z-10">
                   <div className="flex items-center gap-8 bg-black/40 backdrop-blur-xl border border-white/10 rounded-[2.5rem] p-6 shadow-inner">
                      {/* Circle Progress */}
                      <div className="relative w-28 h-28 shrink-0">
                        <svg className="w-full h-full rotate-[-90deg]">
                          <circle cx="56" cy="56" r="50" fill="transparent" stroke="rgba(255,255,255,0.03)" strokeWidth="8" />
                          <motion.circle 
                            cx="56" cy="56" r="50" fill="transparent" stroke={progressColor} strokeWidth="8" strokeLinecap="round"
                            strokeDasharray="314.16" initial={{ strokeDashoffset: 314.16 }} animate={{ strokeDashoffset: 314.16 - (314.16 * progressPercent / 100) }}
                            transition={{ duration: 1.2, ease: "easeOut" }}
                          />
                        </svg>
                        <div className="absolute inset-0 flex flex-col items-center justify-center text-center">
                          <span className={`text-2xl font-black leading-none ${progressTextClass}`}>{progressPercent}%</span>
                          <span className="text-[7px] text-slate-500 font-bold uppercase tracking-widest mt-1">Verificado</span>
                          {selectedDayStats.totalTasks > 0 && (
                            <span className="text-[8px] text-slate-400 font-mono mt-1 font-bold">{selectedDayStats.doneTasks} / {selectedDayStats.totalTasks} Act</span>
                          )}
                        </div>
                      </div>

                      <div className="flex flex-col gap-3 justify-center">
                        <MetricItem icon={Calendar} value={`${selectedDayStats.totalPlanificado.toFixed(1)} Jor`} label="Planificado" />
                        <MetricItem icon={Users} value={`${selectedDayStats.totalAsignado.toFixed(1)} Jor`} label="Asignado" color="text-[#10B981]" />
                        <MetricItem icon={Clock} value={`${selectedDayStats.disponible.toFixed(1)} Jor`} label="Disponible" color="text-[#3B7EF8]" />
                      </div>
                   </div>
                </div>

                {/* Tasks Feed */}
                <div className="flex-1 overflow-y-auto px-8 pb-10 space-y-4 pt-4 custom-scrollbar relative z-10">
                  <div className="flex items-center justify-between mb-2">
                    <h3 className="text-xs font-black text-white/40 uppercase tracking-[0.2em] italic">Agenda de Operaciones</h3>
                    <span className="text-[9px] font-black text-[#10B981] bg-[#10B981]/10 px-2 py-0.5 rounded border border-[#10B981]/20 uppercase">
                      {selectedDayStats.doneTasks} / {selectedDayStats.totalTasks} Completadas
                    </span>
                  </div>

                  {selectedDayStats.totalTasks === 0 ? (
                    <div className="flex flex-col items-center justify-center py-16 text-center bg-black/20 border border-white/5 rounded-[2rem] p-6">
                      <div className="w-16 h-16 rounded-full bg-white/5 border border-white/10 flex items-center justify-center text-slate-500 mb-4">
                        <Calendar className="w-8 h-8" />
                      </div>
                      <h3 className="text-sm font-black text-white uppercase tracking-wider">Sin Actividades</h3>
                      <p className="text-xs text-slate-500 mt-2 max-w-[240px]">No hay operaciones programadas para este día.</p>
                    </div>
                  ) : (
                    selectedDayStats.tasks.map((task, i) => (
                      <ActivityCardTactical 
                        key={`agenda-card-${task.item.id}-${i}`}
                        name={task.item.name}
                        site={task.groupTitle}
                        jornales={task.jor}
                        progress={task.done ? 100 : (parseFloat(task.item.values['progress_work']) || 0)}
                        status={task.done ? 'Done' : (task.item.values['daily_execution']?.[selectedDayStats.dateId] ? 'Working' : 'Deferred')}
                        priority={task.priority}
                        onVerify={() => onVerify(task.groupId, task.item, selectedDayStats.dateId)}
                        hasPhoto={!!(task.item.values['daily_execution']?.[selectedDayStats.dateId]?.gallery?.length > 0)}
                      />
                    ))
                  )}
                </div>
              </>
            ) : (
              /* Vista Semana */
              <div className="flex-1 overflow-y-auto px-8 pb-10 space-y-4 pt-6 custom-scrollbar relative z-10">
                <div className="flex items-center justify-between mb-2">
                  <h3 className="text-xs font-black text-white/40 uppercase tracking-[0.2em] italic">Resumen Semanal de Operaciones</h3>
                </div>

                <div className="space-y-3">
                  {daysOfWeek.map((day) => {
                    const stats = getDayStats(day, groups, filterGroupId);
                    const dId = day.toISOString().split('T')[0];
                    const isFuture = dId > todayStr;
                    const isSelected = dId === selectedDate.toISOString().split('T')[0];
                    
                    let statusText = "Sin actividades programadas";
                    let indicatorColor = "bg-slate-700";
                    let rowOpacity = "opacity-100";
                    
                    if (isFuture) {
                      rowOpacity = "opacity-60";
                      statusText = stats.totalTasks > 0 ? `${stats.totalTasks} actividades programadas` : "Sin programar";
                      indicatorColor = "bg-slate-900 border border-dashed border-white/20";
                    } else if (stats.totalTasks > 0) {
                      statusText = `${stats.doneTasks} de ${stats.totalTasks} completadas (${Math.round(stats.tasksProgress)}%)`;
                      if (stats.tasksProgress >= 80) indicatorColor = "bg-emerald-500 shadow-[0_0_10px_rgba(16,185,129,0.4)]";
                      else if (stats.tasksProgress >= 50) indicatorColor = "bg-amber-500 shadow-[0_0_10px_rgba(245,158,11,0.4)]";
                      else indicatorColor = "bg-rose-500 shadow-[0_0_10px_rgba(244,63,94,0.4)]";
                    }

                    return (
                      <button
                        key={`row-day-${dId}`}
                        onClick={() => {
                          setSelectedDate(day);
                          setViewMode('today');
                        }}
                        className={`w-full text-left bg-black/40 backdrop-blur-xl border rounded-[2rem] p-5 flex items-center justify-between hover:bg-[#0B0E14]/80 transition-all ${rowOpacity} ${
                          isSelected ? 'border-white/20 ring-1 ring-white/10' : 'border-white/5'
                        }`}
                      >
                        <div className="flex items-center gap-4">
                          <div className={`w-3.5 h-3.5 rounded-full shrink-0 ${indicatorColor}`} />
                          <div>
                            <h4 className="text-sm font-black text-white uppercase tracking-tight leading-none">
                              {getSpanishDayName(day)} {day.getDate()}
                            </h4>
                            <p className="text-[10px] text-slate-500 font-bold uppercase tracking-wider mt-1.5">
                              {statusText}
                            </p>
                          </div>
                        </div>
                        <div className="flex items-center gap-3">
                          {stats.totalTasks > 0 && !isFuture && (
                            <div className="h-6 px-2.5 bg-white/5 rounded-lg border border-white/5 flex items-center justify-center">
                              <span className="text-[9px] font-mono font-black text-slate-400">
                                {stats.totalAsignado.toFixed(1)} Jor
                              </span>
                            </div>
                          )}
                          <ChevronRight className="w-4 h-4 text-slate-600" />
                        </div>
                      </button>
                    );
                  })}
                </div>
              </div>
            )}

            <style jsx>{`
              .custom-scrollbar::-webkit-scrollbar { width: 4px; }
              .custom-scrollbar::-webkit-scrollbar-track { background: transparent; }
              .custom-scrollbar::-webkit-scrollbar-thumb { background: rgba(255,255,255,0.05); border-radius: 10px; }
              .custom-scrollbar::-webkit-scrollbar-thumb:hover { background: rgba(59,126,248,0.2); }
            `}</style>
          </motion.div>
        </div>
      )}
    </AnimatePresence>,
    document.body
  );
}
