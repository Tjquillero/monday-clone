'use client';

import { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { X, Calendar as CalendarIcon } from 'lucide-react';

interface DateRangeModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSave: (startDate: string, endDate: string) => void;
  itemName: string;
  expectedDays: number;
  initialStart?: string;
  initialEnd?: string;
}

export default function DateRangeModal({ 
  isOpen, 
  onClose, 
  onSave, 
  itemName, 
  expectedDays,
  initialStart,
  initialEnd
}: DateRangeModalProps) {
  const [start, setStart] = useState(initialStart || new Date().toISOString().split('T')[0]);
  const [end, setEnd] = useState(initialEnd || '');

  useEffect(() => {
    if (isOpen) {
        if (initialStart) setStart(initialStart);
        if (initialEnd) setEnd(initialEnd);
    }
  }, [isOpen, initialStart, initialEnd]);

  useEffect(() => {
    if (start && expectedDays > 0 && !initialEnd) {
      const startDate = new Date(start + 'T00:00:00');
      const endDate = new Date(startDate);
      endDate.setDate(startDate.getDate() + Math.ceil(expectedDays) - 1);
      setEnd(endDate.toISOString().split('T')[0]);
    }
  }, [start, expectedDays, initialEnd]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-[var(--bg-primary)]/80 backdrop-blur-md z-[110] flex items-center justify-center p-4">
      <motion.div 
        initial={{ opacity: 0, scale: 0.95, y: 20 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        className="bg-[var(--bg-secondary)] rounded-[2.5rem] shadow-2xl w-full max-w-md overflow-hidden border border-[var(--border-color)]"
      >
        <div className="p-8 border-b border-[var(--border-color)] flex items-center justify-between bg-[var(--bg-secondary)] relative overflow-hidden">
          <div className="flex items-center space-x-5 relative z-10">
            <div className="w-12 h-12 bg-gradient-to-br from-[#3B7EF8] to-[#1E2442] rounded-2xl flex items-center justify-center text-white shadow-[0_0_20px_rgba(59,126,248,0.3)] border border-[var(--border-color)]">
              <CalendarIcon className="w-6 h-6" />
            </div>
            <div>
              <h3 className="text-xl font-black text-white italic tracking-tighter uppercase italic">Programar Ejecución</h3>
              <p className="text-[10px] text-slate-500 font-black uppercase tracking-[0.2em] truncate max-w-[200px] mt-1">{itemName}</p>
            </div>
          </div>
          <button onClick={onClose} className="p-2 hover:bg-slate-500/5 rounded-full transition-all text-slate-500 relative z-10">
            <X className="w-6 h-6" />
          </button>
          <div className="absolute top-0 right-0 w-32 h-32 bg-[#3B7EF8]/10 blur-[60px] pointer-events-none" />
        </div>

        <div className="p-10 space-y-10">
          <div className="bg-[#3B7EF8]/5 p-6 rounded-[2rem] border border-[#3B7EF8]/10 shadow-[0_0_25px_rgba(59,126,248,0.05)] relative overflow-hidden group">
             <div className="absolute inset-0 bg-[#3B7EF8]/5 opacity-0 group-hover:opacity-100 transition-opacity duration-500" />
             <p className="text-[10px] text-[#3B7EF8] font-black uppercase tracking-[0.3em] text-center mb-4 relative z-10">Requerimiento Estimado</p>
             <div className="flex justify-center items-baseline gap-3 text-white relative z-10">
                <span className="text-5xl font-black italic tracking-tighter drop-shadow-[0_0_10px_rgba(255,255,255,0.2)]">
                    {expectedDays.toFixed(1)}
                </span>
                <span className="text-xs font-black opacity-30 uppercase tracking-widest">Jornales</span>
             </div>
          </div>

          <div className="grid grid-cols-2 gap-8">
            <div className="space-y-3">
              <label className="text-[10px] font-black text-slate-600 uppercase tracking-[0.3em] ml-2">Initial_Date</label>
              <input 
                type="date" 
                value={start}
                onChange={(e) => setStart(e.target.value)}
                className="w-full p-4 bg-[var(--bg-primary)] border border-[var(--border-color)] rounded-2xl focus:outline-none focus:ring-1 focus:ring-[#3B7EF8] focus:border-[#3B7EF8] font-mono font-black text-sm text-white transition-all shadow-inner"
              />
            </div>
            <div className="space-y-3">
              <label className="text-[10px] font-black text-slate-600 uppercase tracking-[0.3em] ml-2">System_Final</label>
              <input 
                type="date" 
                value={end}
                onChange={(e) => setEnd(e.target.value)}
                className="w-full p-4 bg-[var(--bg-primary)] border border-[var(--border-color)] rounded-2xl focus:outline-none focus:ring-1 focus:ring-[#3B7EF8] focus:border-[#3B7EF8] font-mono font-black text-sm text-white transition-all shadow-inner"
              />
            </div>
          </div>
        </div>

        <div className="p-6 bg-[var(--bg-primary)]/50 border-t border-[var(--border-color)] flex gap-4">
          <button 
            onClick={onClose} 
            className="flex-1 py-4 text-[10px] font-black uppercase tracking-[0.3em] text-slate-600 hover:text-white transition-all hover:bg-slate-500/5 rounded-2xl"
          >
            Abort
          </button>
          <button 
            onClick={() => onSave(start, end)}
            className="flex-[2] py-4 bg-[#3B7EF8] text-white rounded-2xl text-[10px] font-black uppercase tracking-[0.2em] shadow-[0_10px_30px_rgba(59,126,248,0.2)] hover:bg-[#2563EB] active:scale-95 transition-all border border-[var(--border-color)]"
          >
            Confirmar Registro
          </button>
        </div>
      </motion.div>
    </div>
  );
}
