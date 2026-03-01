'use client';

import { motion, AnimatePresence } from 'framer-motion';
import { AlertTriangle, X } from 'lucide-react';

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
    <div className="fixed inset-0 z-[120] flex items-center justify-center p-4 sm:p-6">
      <AnimatePresence>
        {isOpen && (
          <>
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={onClose}
              className="absolute inset-0 bg-slate-900/40 backdrop-blur-sm transition-opacity"
            />

            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 10 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 10 }}
              className="relative w-full max-w-sm overflow-hidden rounded-2xl bg-white shadow-2xl ring-1 ring-slate-900/5 z-10"
            >
              <div className="p-6">
                <div className="flex items-center gap-4">
                  <div className={`flex h-12 w-12 flex-shrink-0 items-center justify-center rounded-full ${type === 'danger' ? 'bg-red-100 text-red-600' : 'bg-amber-100 text-amber-600'}`}>
                    <AlertTriangle className="h-6 w-6" />
                  </div>
                  <div className="flex-1">
                    <h3 className="text-lg font-black text-slate-800">{title}</h3>
                    <p className="mt-1 text-sm text-slate-500 leading-relaxed">{message}</p>
                  </div>
                </div>
              </div>

              <div className="flex items-center justify-end gap-3 bg-slate-50 px-6 py-4 border-t border-slate-100">
                <button
                  onClick={onClose}
                  className="px-4 py-2 rounded-xl text-sm font-bold text-slate-500 hover:bg-slate-200 hover:text-slate-700 transition-colors"
                >
                  {cancelText}
                </button>
                <button
                  onClick={() => {
                    onConfirm();
                    onClose();
                  }}
                  className={`px-4 py-2 rounded-xl text-sm font-bold text-white shadow-lg transition-all active:scale-95 ${
                    type === 'danger' 
                      ? 'bg-red-500 hover:bg-red-600 shadow-red-500/20' 
                      : 'bg-amber-500 hover:bg-amber-600 shadow-amber-500/20'
                  }`}
                >
                  {confirmText}
                </button>
              </div>
              
              <button 
                onClick={onClose}
                className="absolute top-4 right-4 text-slate-400 hover:text-slate-600 transition-colors"
              >
                <X size={16} />
              </button>
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </div>
  );
}
