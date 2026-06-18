'use client';

import React from 'react';
import { motion } from 'framer-motion';
import { 
  Zap, 
  Timer, 
  Users, 
  CheckCircle2, 
  Loader2, 
  Clock, 
  MoreVertical,
  MapPin,
  CheckCircle
} from 'lucide-react';

export type TacticalStatus = 'Done' | 'Working' | 'Deferred';

interface ActivityCardProps {
  name: string;
  site: string;
  jornales: number;
  progress: number;
  status: TacticalStatus;
  timeSlot?: string;
  priority?: 'Alta' | 'Media' | 'Baja';
  onVerify?: () => void;
  hasPhoto?: boolean;
}

export const ActivityCardTactical = ({
  name,
  site,
  jornales,
  progress,
  status,
  timeSlot = "08:00 - 16:00",
  priority = "Media",
  onVerify,
  hasPhoto = false
}: ActivityCardProps) => {

  const statusConfig = {
    Done: { color: 'text-emerald-400', bg: 'bg-emerald-500/10', border: 'border-emerald-500/20', icon: CheckCircle2 },
    Working: { color: 'text-blue-400', bg: 'bg-blue-500/10', border: 'border-blue-500/20', icon: Loader2 },
    Deferred: { color: 'text-amber-400', bg: 'bg-amber-500/10', border: 'border-amber-500/20', icon: Clock },
  };

  const { color, bg, border, icon: StatusIcon } = statusConfig[status];
  const priorityColor = priority === 'Alta' ? 'text-rose-500' : priority === 'Baja' ? 'text-[#3B7EF8]' : 'text-amber-500';

  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.98, y: 10 }}
      animate={{ opacity: 1, scale: 1, y: 0 }}
      whileHover={{ y: -4, transition: { duration: 0.2 } }}
      className={`group relative w-full bg-[#0B0E14]/60 backdrop-blur-2xl border ${border} rounded-[2.5rem] p-6 shadow-[0_20px_50px_rgba(0,0,0,0.5)] transition-all hover:bg-[#0B0E14]/80 overflow-hidden`}
    >
      <div className="absolute top-0 inset-x-0 h-px bg-gradient-to-r from-transparent via-white/10 to-transparent opacity-0 group-hover:opacity-100 transition-opacity" />

      <div className="flex items-start justify-between mb-5">
        <div className="flex items-center gap-5">
          <div className={`w-14 h-14 rounded-2xl ${bg} flex items-center justify-center border ${border} transition-transform group-hover:scale-110 duration-500 shadow-lg`}>
            <Zap className={`w-7 h-7 ${color}`} />
          </div>
          <div className="min-w-0">
            <h3 className="text-lg font-black text-white uppercase tracking-tighter leading-tight truncate">
              {name}
            </h3>
            <div className="flex items-center gap-3 mt-1.5">
               <div className="flex items-center gap-1.5 px-2 py-0.5 bg-white/5 rounded-lg border border-white/5">
                  <MapPin className="w-3 h-3 text-slate-500" />
                  <span className="text-[9px] font-black text-white/50 uppercase tracking-widest">{site}</span>
               </div>
               <div className="h-3 w-px bg-white/10" />
               <div className="flex items-center gap-1.5">
                  <span className="text-[9px] font-bold text-slate-600 uppercase">Prioridad</span>
                  <span className={`text-[9px] font-black uppercase ${priorityColor}`}>{priority}</span>
               </div>
            </div>
          </div>
        </div>
        
        <div className="flex items-center gap-2">
            {hasPhoto && (
                <div className="w-8 h-8 rounded-xl bg-emerald-500/20 border border-emerald-500/30 flex items-center justify-center text-emerald-500 shadow-[0_0_15px_rgba(16,185,129,0.2)]">
                    <CheckCircle className="w-4 h-4" />
                </div>
            )}
            <button className="text-slate-600 hover:text-white p-2 hover:bg-white/5 rounded-xl transition-all">
              <MoreVertical className="w-5 h-5" />
            </button>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4 mb-6">
        <div className="bg-white/5 border border-white/5 rounded-2xl p-3.5 flex items-center gap-3 shadow-inner">
          <Clock className="w-4 h-4 text-slate-500" />
          <span className="text-[10px] font-mono font-black text-slate-400 tracking-tight">{timeSlot}</span>
        </div>
        <div className="bg-white/5 border border-white/5 rounded-2xl p-3.5 flex items-center gap-3 shadow-inner">
          <Users className="w-4 h-4 text-slate-500" />
          <span className="text-[10px] font-black text-white">{jornales.toFixed(1)} <span className="text-slate-600 uppercase font-bold tracking-widest ml-1 text-[8px]">Jor</span></span>
        </div>
      </div>

      <div className="space-y-4">
        <div className="flex justify-between items-end">
          <div className={`flex items-center gap-2 px-4 py-1.5 rounded-full border ${bg} ${border} shadow-lg`}>
             <StatusIcon className={`w-3.5 h-3.5 ${color} ${status === 'Working' ? 'animate-spin' : ''}`} />
             <span className={`text-[10px] font-black uppercase tracking-[0.15em] ${color}`}>{status}</span>
          </div>
          
          <div className="flex items-center gap-4">
            <span className="text-xs font-black text-white tracking-widest">{progress}%</span>
            <button 
                onClick={onVerify}
                className={`w-10 h-10 rounded-xl flex items-center justify-center transition-all ${status === 'Done' ? 'bg-emerald-500 text-white shadow-[#10B981]/30' : 'bg-white/5 text-slate-700 hover:text-blue-400 hover:bg-blue-500/10'} border border-white/10 shadow-xl`}
            >
                <CheckCircle2 className="w-6 h-6" />
            </button>
          </div>
        </div>
        
        <div className="h-2 w-full bg-slate-900 rounded-full overflow-hidden border border-white/5 p-[2px] shadow-inner">
          <motion.div 
            initial={{ width: 0 }}
            animate={{ width: `${progress}%` }}
            transition={{ duration: 1.2, ease: "circOut" }}
            className={`h-full rounded-full transition-all duration-700 ${status === 'Done' ? 'bg-emerald-500 shadow-[0_0_15px_#10B981]' : 'bg-[#3B7EF8] shadow-[0_0_15px_#3B7EF8]'}`} 
          />
        </div>
      </div>
    </motion.div>
  );
};
