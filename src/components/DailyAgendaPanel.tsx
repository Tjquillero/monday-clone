'use client';

import { Group, Item } from '@/types/monday';
import { motion, AnimatePresence } from 'framer-motion';
import { 
  X, Users, CheckCircle2, Calendar, Target, Clock, 
  ChevronRight, Camera, Droplets, Scissors, Sparkles, 
  Sprout, Leaf, Biohazard, Activity, Zap, Info, Plus, 
  Filter, MapPin, Gauge, Layers, Trash2, Shovel, 
  Brush, HardHat, Construction
} from 'lucide-react';
import { useMemo, useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import Image from 'next/image';

interface DailyAgendaPanelProps {
  isOpen: boolean;
  onClose: () => void;
  date: Date;
  groups: Group[];
  onVerify: (groupId: string, item: Item, dateId: string) => void;
}

// Helper to map activity names to icons
const getActivityIcon = (name: string) => {
  const n = name.toLowerCase();
  
  // Specific Mappings
  if (n.includes('acopio')) return Layers; 
  if (n.includes('poda')) return Scissors;
  if (n.includes('riego') || n.includes('agua') || n.includes('hidrat')) return Droplets;
  if (n.includes('limpieza manual') || n.includes('desyerbe')) return Sparkles;
  if (n.includes('limpieza general') || n.includes('zonas duras')) return Brush;
  if (n.includes('vías') || n.includes('calles')) return Construction;
  if (n.includes('fumiga') || n.includes('aplic') || n.includes('fertiliz')) return Biohazard;
  if (n.includes('cosech') || n.includes('recolec')) return Leaf;
  if (n.includes('siembra') || n.includes('plant') || n.includes('vivero')) return Sprout;
  if (n.includes('mantenimiento') || n.includes('repar') || n.includes('arregl')) return Zap;
  if (n.includes('obra') || n.includes('construc')) return HardHat;
  if (n.includes('basura') || n.includes('residuo')) return Trash2;
  if (n.includes('excav') || n.includes('tierra')) return Shovel;
  
  return Activity;
};

// Circular Progress Component
const CircularProgress = ({ progress, size = 120, strokeWidth = 10, label }: { progress: number, size?: number, strokeWidth?: number, label: string }) => {
  const radius = (size - strokeWidth) / 2;
  const circumference = radius * 2 * Math.PI;
  const offset = circumference - (progress / 100) * circumference;

  return (
    <div className="relative flex items-center justify-center" style={{ width: size, height: size }}>
      <svg width={size} height={size} className="rotate-[-90deg]">
        {/* Background circle */}
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="transparent"
          stroke="rgba(255, 255, 255, 0.05)"
          strokeWidth={strokeWidth}
        />
        {/* Progress circle */}
        <motion.circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="transparent"
          stroke="url(#progress-gradient)"
          strokeWidth={strokeWidth}
          strokeDasharray={circumference}
          initial={{ strokeDashoffset: circumference }}
          animate={{ strokeDashoffset: offset }}
          transition={{ duration: 1, ease: "easeOut" }}
          strokeLinecap="round"
        />
        <defs>
          <linearGradient id="progress-gradient" x1="0%" y1="0%" x2="100%" y2="0%">
            <stop offset="0%" stopColor="#10b981" />
            <stop offset="100%" stopColor="#3b82f6" />
          </linearGradient>
        </defs>
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center text-center">
        <span className="text-2xl font-black text-white">{Math.round(progress)}%</span>
        <span className="text-[10px] font-bold text-white/40 uppercase tracking-tighter">{label}</span>
      </div>
    </div>
  );
};

export default function DailyAgendaPanel({ isOpen, onClose, date, groups, onVerify }: DailyAgendaPanelProps) {
  const dateId = date.toISOString().split('T')[0];
  const dateDisplay = date.toLocaleDateString('es-ES', { weekday: 'long', day: 'numeric', month: 'long' });

  const handleClose = (e?: React.MouseEvent | React.TouchEvent) => {
    if (e) {
      if ('stopPropagation' in e) e.stopPropagation();
      if ('preventDefault' in e) e.preventDefault();
    }
    onClose();
  };

  const dailyData = useMemo(() => {
    const tasks: { item: Item; groupId: string; groupTitle: string; groupColor: string; jor: number; done: boolean; photo?: string }[] = [];
    let totalJornales = 0;
    let completedJornales = 0;

    groups.forEach(group => {
      group.items.forEach(item => {
        const execution = item.values['daily_execution'] || {};
        const dayEntry = execution[dateId];
        
        if (dayEntry) {
          const val = typeof dayEntry === 'object' ? (parseFloat(dayEntry.val) || 0) : (parseFloat(dayEntry) || 0);
          const isDone = typeof dayEntry === 'object' ? !!dayEntry.done : false;
          const photo = typeof dayEntry === 'object' ? dayEntry.photo : null;

          if (val > 0) {
            tasks.push({
              item,
              groupId: group.id,
              groupTitle: group.title,
              groupColor: group.color,
              jor: val,
              done: isDone,
              photo
            });
            totalJornales += val;
            if (isDone) completedJornales += val;
          }
        }
      });
    });

    return {
      tasks: tasks.sort((a, b) => (a.done === b.done ? 0 : a.done ? 1 : -1)),
      totalJornales,
      completedJornales,
      progress: totalJornales > 0 ? (completedJornales / totalJornales) * 100 : 0
    };
  }, [groups, dateId]);

  const content = (
    <AnimatePresence mode="wait">
      {isOpen && (
        <div 
          className="fixed inset-0 z-[10000] flex justify-end p-4 sm:p-6"
          onPointerDown={(e) => e.stopPropagation()}
          onClick={(e) => e.stopPropagation()}
        >
          {/* Backdrop */}
          <motion.div
            key="agenda-backdrop"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={handleClose}
            className="fixed inset-0 bg-slate-950/40 backdrop-blur-md z-[10001] cursor-pointer"
          />

          {/* Panel */}
          <motion.div
            key="agenda-sidebar-panel"
            initial={{ x: '100%', opacity: 0, scale: 0.95 }}
            animate={{ x: 0, opacity: 1, scale: 1 }}
            exit={{ x: '100%', opacity: 0, scale: 0.95 }}
            transition={{ type: 'spring', damping: 25, stiffness: 200 }}
            className="relative w-full max-w-lg bg-slate-900/80 backdrop-blur-2xl shadow-[0_0_50px_rgba(0,0,0,0.5)] z-[10002] flex flex-col border border-white/10 rounded-[2.5rem] overflow-hidden"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Header Area */}
            <div className="p-8 pb-4 shrink-0">
               <div className="flex justify-between items-center mb-8">
                  <div className="flex items-center space-x-3">
                    <div className="w-10 h-10 rounded-2xl bg-white/5 border border-white/10 flex items-center justify-center text-emerald-400">
                        <Calendar className="w-5 h-5" />
                    </div>
                    <div>
                        <h2 className="text-xl font-black text-white tracking-tight">Actividades Diarias</h2>
                        <p className="text-[10px] font-bold text-white/40 uppercase tracking-widest">{dateDisplay}</p>
                    </div>
                  </div>
                  <div className="flex items-center space-x-2">
                      <button className="flex items-center space-x-2 px-4 py-2 bg-white/5 border border-white/10 rounded-xl text-[10px] font-black text-white/70 hover:bg-white/10 transition-all">
                          <Plus className="w-3.5 h-3.5" />
                          <span>Crear Actividad</span>
                      </button>
                      <button onClick={handleClose} className="p-2 bg-white/5 border border-white/10 rounded-xl text-white/50 hover:text-white hover:bg-rose-500/20 hover:border-rose-500/30 transition-all">
                        <X className="w-5 h-5" />
                      </button>
                  </div>
               </div>

               {/* Stats Hero Section */}
               <div className="flex items-center justify-between bg-white/[0.03] border border-white/5 rounded-[2rem] p-6 mb-4">
                  <CircularProgress progress={dailyData.progress} label="Completado" />
                  
                  <div className="flex-1 ml-8 space-y-4">
                      <div className="flex items-start justify-between">
                          <div className="flex items-center space-x-3 text-white/60">
                              <div className="p-2 rounded-xl bg-white/5 border border-white/10">
                                  <Calendar className="w-3.5 h-3.5" />
                              </div>
                              <div>
                                  <p className="text-[9px] font-black uppercase tracking-wider text-white/30">Planificado</p>
                                  <p className="text-sm font-black text-white/90">{(dailyData.totalJornales + 1.5).toFixed(1)} Jor</p>
                              </div>
                          </div>
                          <Info className="w-3.5 h-3.5 text-white/20" />
                      </div>

                      <div className="flex items-start justify-between">
                          <div className="flex items-center space-x-3 text-white/60">
                              <div className="p-2 rounded-xl bg-emerald-500/10 border border-emerald-500/20 text-emerald-400">
                                  <Users className="w-3.5 h-3.5" />
                              </div>
                              <div>
                                  <p className="text-[9px] font-black uppercase tracking-wider text-white/30">Asignado</p>
                                  <p className="text-sm font-black text-white/90">{dailyData.totalJornales.toFixed(1)} Jor</p>
                              </div>
                          </div>
                      </div>

                      <div className="flex items-start justify-between">
                          <div className="flex items-center space-x-3 text-white/60">
                              <div className="p-2 rounded-xl bg-blue-500/10 border border-blue-500/20 text-blue-400">
                                  <Clock className="w-3.5 h-3.5" />
                              </div>
                              <div>
                                  <p className="text-[9px] font-black uppercase tracking-wider text-white/30">Disponible</p>
                                  <p className="text-sm font-black text-white/90">1.5 Jor</p>
                              </div>
                          </div>
                      </div>
                  </div>
               </div>

               <div className="flex items-center justify-between px-2">
                  <h3 className="text-[11px] font-black text-white/30 uppercase tracking-[0.2em]">Listado de Actividades</h3>
                  <button className="text-[10px] font-bold text-white/40 hover:text-emerald-400 transition-colors">Ver Todo</button>
               </div>
            </div>

            {/* Content Area */}
            <div className="flex-1 overflow-y-auto px-8 pb-8 space-y-4 custom-scrollbar">
                <AnimatePresence>
                {dailyData.tasks.length > 0 ? (
                  dailyData.tasks.map((task, idx) => {
                    const ActivityIcon = getActivityIcon(task.item.name);
                    return (
                      <motion.div 
                        key={`agenda-task-${task.item.id || `idx-${idx}`}`}
                        initial={{ opacity: 0, y: 20 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, scale: 0.95 }}
                        transition={{ delay: idx * 0.05, type: "spring", damping: 20 }}
                        className={`group relative bg-white/[0.03] hover:bg-white/[0.06] p-5 rounded-[2rem] border transition-all ${task.done ? 'border-emerald-500/20' : 'border-white/5 hover:border-white/10'}`}
                      >
                          <div className="flex items-start space-x-4">
                              {/* Icon Wrapper */}
                              <div className="shrink-0 w-14 h-14 rounded-2xl flex items-center justify-center text-emerald-400 bg-emerald-500/10 border border-emerald-500/20 group-hover:bg-emerald-500/20 group-hover:text-emerald-300 transition-all shadow-lg">
                                  <ActivityIcon className="w-7 h-7" strokeWidth={2.5} />
                              </div>
                              
                              <div className="flex-1 min-w-0">
                                  <div className="flex justify-between items-start mb-1">
                                      <div>
                                          <h3 className="font-black text-white text-[15px] truncate pr-4">{task.item.name}</h3>
                                          <div className="flex items-center space-x-2 mt-0.5">
                                              <MapPin className="w-3 h-3 text-white/20" />
                                              <span className="text-[10px] font-bold text-white/30 uppercase tracking-tight truncate">Lote: {task.groupTitle}</span>
                                          </div>
                                      </div>
                                      <div className="shrink-0 flex items-center space-x-2">
                                          <Clock className="w-3.5 h-3.5 text-white/20" />
                                          <span className="text-[10px] font-black text-white/40 uppercase tracking-tighter">08:00 - 16:00</span>
                                      </div>
                                  </div>
                                  
                                  <div className="flex items-center space-x-3 mt-4">
                                      <div className="flex items-center space-x-1">
                                          <div className="w-1.5 h-1.5 rounded-full bg-rose-500" />
                                          <span className="text-[10px] font-bold text-white/30 uppercase mr-1">Prioridad</span>
                                          <span className="text-[10px] font-black text-rose-400 uppercase">Alta</span>
                                      </div>
                                      <div className="h-3 w-px bg-white/5" />
                                      <div className="flex items-center space-x-2 flex-1">
                                          <div className="w-6 h-6 rounded-full bg-slate-700 border border-white/10 flex items-center justify-center text-[8px] font-black text-white/50 overflow-hidden">
                                              {task.item.personnel ? (
                                                  <span className="truncate">{task.item.personnel.name.charAt(0)}</span>
                                              ) : (
                                                  <Users className="w-3 h-3" />
                                              )}
                                          </div>
                                          <div className="flex-1">
                                              <div className="flex justify-between items-center mb-1">
                                                  <span className="text-[10px] font-black text-white/60">{task.jor.toFixed(1)} jor</span>
                                              </div>
                                              <div className="w-full h-1 bg-white/5 rounded-full overflow-hidden">
                                                  <motion.div 
                                                    initial={{ width: 0 }}
                                                    animate={{ width: task.done ? '100%' : '65%' }}
                                                    className={`h-full rounded-full ${task.done ? 'bg-emerald-500' : 'bg-emerald-500/40'}`}
                                                  />
                                              </div>
                                          </div>
                                      </div>
                                      
                                      <div className="flex items-center space-x-2">
                                          {task.photo ? (
                                              <div className="relative w-10 h-10 rounded-2xl overflow-hidden border border-emerald-500/40 shadow-lg">
                                                  <Image src={task.photo} alt="Verification" fill className="object-cover" unoptimized />
                                              </div>
                                          ) : (
                                              <button 
                                                  onClick={() => onVerify(task.groupId, task.item, dateId)}
                                                  className="w-10 h-10 rounded-2xl bg-white/10 border border-white/10 flex items-center justify-center text-white/60 hover:text-emerald-400 hover:bg-emerald-500/20 hover:border-emerald-500/30 transition-all"
                                              >
                                                  <Camera className="w-5 h-5" />
                                              </button>
                                          )}
                                          <button 
                                              onClick={() => onVerify(task.groupId, task.item, dateId)}
                                              className={`w-10 h-10 rounded-2xl flex items-center justify-center transition-all ${task.done ? 'bg-emerald-500 text-white border-emerald-400' : 'bg-white/10 text-white/50 border-white/5 hover:border-emerald-500/40'} border`}
                                          >
                                              <CheckCircle2 className="w-5 h-5" />
                                          </button>
                                      </div>
                                  </div>
                              </div>
                          </div>
                      </motion.div>
                    );
                  })
                ) : (
                  <div className="h-64 flex flex-col items-center justify-center text-center space-y-4">
                      <div className="w-24 h-24 bg-white/5 rounded-[2rem] flex items-center justify-center shadow-inner border border-white/5">
                        <Calendar className="w-10 h-10 text-white/10" />
                      </div>
                      <div>
                        <p className="font-black text-white/80">No hay actividades</p>
                        <p className="text-xs text-white/30 font-bold uppercase tracking-widest mt-1">Nada proyectado para este día</p>
                      </div>
                  </div>
                )}
                </AnimatePresence>
            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );

  const [mounted, setMounted] = useState(false);
  useEffect(() => {
    setMounted(true);
    return () => setMounted(false);
  }, []);

  useEffect(() => {
    if (isOpen) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = '';
    }
    return () => {
      document.body.style.overflow = '';
    };
  }, [isOpen]);

  if (!mounted) return null;

  return createPortal(
    <>
      {content}
      <style jsx>{`
        .custom-scrollbar::-webkit-scrollbar {
          width: 6px;
        }
        .custom-scrollbar::-webkit-scrollbar-thumb {
          background: rgba(255, 255, 255, 0.1);
          border-radius: 20px;
        }
        .custom-scrollbar::-webkit-scrollbar-track {
          background: transparent;
        }
      `}</style>
    </>,
    document.body
  );
}
