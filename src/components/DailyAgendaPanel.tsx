'use client';

import React, { useMemo, useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { 
  X, Users, CheckCircle2, Calendar, Clock, 
  ChevronRight, Camera, Droplets, Scissors, Sparkles, 
  Sprout, Leaf, Biohazard, Activity, Zap, Plus, 
  Filter, MapPin, Trash2, Shovel, Brush, HardHat, 
  Construction, Terminal, Gauge
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

const getActivityIcon = (name: string) => {
  const n = name.toLowerCase();
  if (n.includes('poda')) return Scissors;
  if (n.includes('riego') || n.includes('agua')) return Droplets;
  if (n.includes('fertiliz') || n.includes('npk')) return Biohazard;
  if (n.includes('limpieza') || n.includes('desyerbe')) return Sparkles;
  if (n.includes('cosech')) return Leaf;
  if (n.includes('siembra')) return Sprout;
  if (n.includes('vías') || n.includes('calles')) return Construction;
  if (n.includes('obra')) return HardHat;
  return Activity;
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
  const dateId = date.toISOString().split('T')[0];

  useEffect(() => { setMounted(true); }, []);

  const dailyData = useMemo(() => {
    const tasks: any[] = [];
    let totalPlanificado = 0;
    let totalAsignado = 0;

    groups.filter(g => !filterGroupId || g.id === filterGroupId).forEach(group => {
      group.items.forEach(item => {
        const execution = item.values['daily_execution'] || {};
        const dayEntry = execution[dateId];
        const frec = parseFloat((item.values as any)['frec']) || 1;
        const meta = parseFloat((item.values as any)['meta']) || 0;
        
        const isScheduled = dayEntry || frec === 1 || (date.getDate() % frec === 0);

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
          
          totalPlanificado += meta || 1;
          totalAsignado += val || (isScheduled ? meta || 1 : 0);
        }
      });
    });

    return {
      tasks: tasks.sort((a,b) => (a.done === b.done ? 0 : a.done ? 1 : -1)),
      totalPlanificado,
      totalAsignado,
      disponible: Math.max(0, totalPlanificado - totalAsignado),
      progress: totalPlanificado > 0 ? (totalAsignado / totalPlanificado) * 100 : 0
    };
  }, [groups, dateId, date, filterGroupId]);

  if (!mounted) return null;

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
            <div className="p-8 flex items-center justify-between border-b border-white/5 shrink-0 bg-white/[0.02] relative z-10">
              <h2 className="text-2xl font-black text-white italic tracking-tighter">Actividades Diarias</h2>
              <div className="flex items-center gap-3">
                <button className="h-10 px-4 bg-white/5 border border-white/10 rounded-xl text-[10px] font-black text-white uppercase tracking-widest flex items-center gap-2 hover:bg-white/10 transition-all">
                  <Plus className="w-4 h-4" /> Crear Actividad
                </button>
                <button className="w-10 h-10 bg-white/5 border border-white/10 rounded-xl flex items-center justify-center text-slate-400 hover:text-white transition-all">
                  <Filter className="w-4 h-4" />
                </button>
                <button onClick={onClose} className="w-10 h-10 bg-white/5 border border-white/10 rounded-xl flex items-center justify-center text-slate-400 hover:text-rose-500 transition-all">
                   <X className="w-5 h-5" />
                </button>
              </div>
            </div>

            {/* Dashboard Stats */}
            <div className="p-8 bg-gradient-to-b from-white/[0.03] to-transparent shrink-0 relative z-10">
               <div className="flex items-center gap-10 bg-black/40 backdrop-blur-xl border border-white/10 rounded-[2.5rem] p-8 shadow-inner">
                  {/* Circle Progress */}
                  <div className="relative w-32 h-32 shrink-0">
                    <svg className="w-full h-full rotate-[-90deg]">
                      <circle cx="64" cy="64" r="58" fill="transparent" stroke="rgba(255,255,255,0.03)" strokeWidth="10" />
                      <motion.circle 
                        cx="64" cy="64" r="58" fill="transparent" stroke="#10B981" strokeWidth="10" strokeLinecap="round"
                        strokeDasharray="364.4" initial={{ strokeDashoffset: 364.4 }} animate={{ strokeDashoffset: 364.4 - (364.4 * dailyData.progress / 100) }}
                        transition={{ duration: 1.5, ease: "easeOut" }}
                      />
                    </svg>
                    <div className="absolute inset-0 flex flex-col items-center justify-center text-center">
                      <span className="text-3xl font-black text-white leading-none">{Math.round(dailyData.progress)}%</span>
                      <span className="text-[8px] text-slate-500 font-bold uppercase tracking-widest mt-1">Completado</span>
                      <span className="text-[7px] text-slate-400 font-mono mt-1">{dailyData.totalAsignado.toFixed(1)} / {dailyData.totalPlanificado.toFixed(1)} Jor</span>
                    </div>
                  </div>

                  <div className="flex flex-col gap-5 justify-center">
                    <MetricItem icon={Calendar} value={`${dailyData.totalPlanificado.toFixed(1)} Jor`} label="Planificado" />
                    <MetricItem icon={Users} value={`${dailyData.totalAsignado.toFixed(1)} Jor`} label="Asignado" color="text-[#10B981]" />
                    <MetricItem icon={Clock} value={`${dailyData.disponible.toFixed(1)} Jor`} label="Disponible" color="text-[#3B7EF8]" />
                  </div>
               </div>
            </div>

            {/* Tasks Feed */}
            <div className="flex-1 overflow-y-auto px-8 pb-10 space-y-4 pt-4 custom-scrollbar relative z-10">
              <div className="flex items-center justify-between mb-2">
                <h3 className="text-xs font-black text-white/40 uppercase tracking-[0.2em] italic">Seguimiento de Operaciones</h3>
                <button className="text-[9px] font-black text-[#10B981] uppercase hover:underline">Ver Todo</button>
              </div>

              {dailyData.tasks.map((task, i) => (
                  <ActivityCardTactical 
                    key={`agenda-card-${task.item.id}-${i}`}
                    name={task.item.name}
                    site={task.groupTitle}
                    jornales={task.jor}
                    progress={task.done ? 100 : (parseFloat(task.item.values['progress_work']) || 0)}
                    status={task.done ? 'Done' : (task.item.values['daily_execution']?.[dateId] ? 'Working' : 'Deferred')}
                    priority={task.priority}
                    onVerify={() => onVerify(task.groupId, task.item, dateId)}
                    hasPhoto={!!task.photo}
                  />
              ))}
            </div>

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
