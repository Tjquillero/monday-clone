'use client';

import { motion, AnimatePresence } from 'framer-motion';
import { AlertTriangle, X, ShieldAlert } from 'lucide-react';

interface ConfirmModalProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: () => void;
  title: string;
  message: string;
  confirmText?: string;
  cancelText?: string;
  type?: 'danger' | 'warning' | 'info';
}

export default function ConfirmModal({
  isOpen,
  onClose,
  onConfirm,
  title,
  message,
  confirmText = 'Confirmar',
  cancelText = 'Cancelar',
  type = 'danger'
}: ConfirmModalProps) {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[150] flex items-center justify-center p-4">
      <AnimatePresence>
        {isOpen && (
          <>
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={onClose}
              className="absolute inset-0 bg-[var(--bg-primary)]/80 backdrop-blur-md"
            />

            <motion.div
              initial={{ opacity: 0, scale: 0.9, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.9, y: 20 }}
              className="relative w-full max-w-md overflow-hidden rounded-[32px] bg-[var(--bg-secondary)] shadow-[0_20px_60px_rgba(0,0,0,0.6)] border border-[var(--border-color)] z-10"
            >
              <div className="p-8">
                <div className="flex flex-col items-center text-center">
                  <div className={`flex h-16 w-16 mb-6 items-center justify-center rounded-2xl ${
                    type === 'danger' ? 'bg-rose-500/10 text-rose-500 border border-rose-500/20' : 
                    type === 'warning' ? 'bg-amber-500/10 text-amber-500 border border-amber-500/20' : 
                    'bg-[#3B7EF8]/10 text-[#3B7EF8] border border-[#3B7EF8]/20'
                  }`}>
                    {type === 'danger' ? <ShieldAlert size={32} /> : <AlertTriangle size={32} />}
                  </div>
                  
                  <h3 className="text-xl font-black text-white uppercase tracking-tight mb-3">
                    {title}
                  </h3>
                  <p className="text-sm text-slate-400 font-medium leading-relaxed max-w-[280px]">
                    {message}
                  </p>
                </div>
              </div>

              <div className="flex gap-3 px-8 pb-8">
                <button
                  onClick={onClose}
                  className="flex-1 px-6 py-3 rounded-2xl text-[11px] font-black uppercase tracking-[0.2em] text-slate-500 hover:bg-slate-500/5 hover:text-[var(--text-primary)] transition-all border border-[var(--border-color)]"
                >
                  {cancelText}
                </button>
                <button
                  onClick={() => {
                    onConfirm();
                    onClose();
                  }}
                  className={`flex-1 px-6 py-3 rounded-2xl text-[11px] font-black uppercase tracking-[0.2em] text-white shadow-lg transition-all active:scale-95 ${
                    type === 'danger' 
                      ? 'bg-rose-500 hover:bg-rose-600 shadow-rose-500/20' 
                      : 'bg-amber-500 hover:bg-amber-600 shadow-amber-500/20'
                  }`}
                >
                  {confirmText}
                </button>
              </div>
              
              <button 
                onClick={onClose}
                className="absolute top-6 right-6 text-slate-600 hover:text-white transition-colors p-2"
              >
                <X size={20} />
              </button>

              {/* Decorative Tech Detail */}
              <div className="absolute top-0 left-1/2 -translate-x-1/2 w-24 h-1 bg-gradient-to-r from-transparent via-[#3B7EF8]/30 to-transparent" />
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </div>
  );
}
