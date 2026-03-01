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
    <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-[2px] z-[100] flex items-center justify-center p-4">
      <motion.div 
        initial={{ opacity: 0, scale: 0.95, y: 20 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        className="bg-white rounded-2xl shadow-2xl w-full max-w-md overflow-hidden border border-slate-100"
      >
        <div className="p-6 border-b border-slate-100 flex items-center justify-between bg-slate-50/50">
          <div className="flex items-center space-x-3">
            <div className="w-10 h-10 bg-slate-800 rounded-xl flex items-center justify-center text-white shadow-sm">
              <CalendarIcon className="w-5 h-5" />
            </div>
            <div>
              <h3 className="font-bold text-slate-800">Programar Ejecución</h3>
              <p className="text-xs text-slate-400 font-medium truncate max-w-[200px]">{itemName}</p>
            </div>
          </div>
          <button onClick={onClose} className="p-2 hover:bg-white hover:shadow-sm rounded-lg transition-all text-slate-400">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-8 space-y-6">
          <div className="bg-emerald-50 p-4 rounded-xl border border-emerald-100 shadow-sm shadow-emerald-700/5">
             <p className="text-sm text-emerald-800 font-medium text-center">
               Basado en el rendimiento, se requieren aproximadamente <span className="font-black text-lg text-emerald-900 px-1">{expectedDays.toFixed(1)}</span> jornales.
             </p>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Fecha Inicio</label>
              <input 
                type="date" 
                value={start}
                onChange={(e) => setStart(e.target.value)}
                className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-emerald-500/10 focus:border-emerald-500 font-bold text-sm text-slate-700"
              />
            </div>
            <div className="space-y-2">
              <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Fecha Fin</label>
              <input 
                type="date" 
                value={end}
                onChange={(e) => setEnd(e.target.value)}
                className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-emerald-500/10 focus:border-emerald-500 font-bold text-sm text-slate-700"
              />
            </div>
          </div>
        </div>

        <div className="p-4 bg-slate-50 border-t border-slate-100 flex justify-end space-x-3">
          <button onClick={onClose} className="px-6 py-2.5 text-sm font-bold text-slate-400 hover:text-slate-600 transition-colors">Cancelar</button>
          <button 
            onClick={() => onSave(start, end)}
            className="px-8 py-2.5 bg-slate-800 text-white rounded-xl text-sm font-bold shadow-lg shadow-slate-200 hover:bg-slate-900 active:scale-95 transition-all"
          >
            Confirmar Guardado
          </button>
        </div>
      </motion.div>
    </div>
  );
}
