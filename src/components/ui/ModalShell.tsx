'use client';

import React, { useEffect, useId, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { X } from 'lucide-react';

export interface ModalShellProps {
  open: boolean;
  onClose: () => void;
  title: React.ReactNode;
  icon?: React.ReactNode;
  size?: 'sm' | 'md' | 'lg';
  children?: React.ReactNode;
  footer?: React.ReactNode;
  closeDisabled?: boolean;
  className?: string;
}

const sizeClasses: Record<'sm' | 'md' | 'lg', string> = {
  sm: 'sm:max-w-md',
  md: 'sm:max-w-lg',
  lg: 'sm:max-w-2xl',
};

export default function ModalShell({
  open,
  onClose,
  title,
  icon,
  size = 'md',
  children,
  footer,
  closeDisabled = false,
  className = '',
}: ModalShellProps) {
  const [mounted, setMounted] = useState(false);
  const generatedId = useId();
  const titleId = `modal-shell-title-${generatedId.replace(/:/g, '')}`;
  const previousActiveElement = useRef<HTMLElement | null>(null);
  const panelRef = useRef<HTMLDivElement>(null);

  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

  const closeDisabledRef = useRef(closeDisabled);
  closeDisabledRef.current = closeDisabled;

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    if (!open) return;

    previousActiveElement.current = document.activeElement as HTMLElement | null;
    const originalOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';

    const timer = setTimeout(() => {
      if (panelRef.current) {
        // Prioridad de foco: 1. Primer campo de formulario (input, select, textarea)
        const formField = panelRef.current.querySelector<HTMLElement>(
          'input:not([disabled]):not([type="hidden"]), select:not([disabled]), textarea:not([disabled])'
        );
        if (formField) {
          formField.focus();
        } else {
          // 2. Primer botón del cuerpo o pie (excluyendo el botón de cierre del encabezado)
          const bodyOrFooterButton = panelRef.current.querySelector<HTMLElement>(
            '[data-modal-body] button:not([disabled]), [data-modal-footer] button:not([disabled]), button:not([data-modal-close]):not([disabled])'
          );
          if (bodyOrFooterButton) {
            bodyOrFooterButton.focus();
          } else {
            panelRef.current.focus();
          }
        }
      }
    }, 50);

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !closeDisabledRef.current) {
        e.preventDefault();
        onCloseRef.current();
      }
    };

    window.addEventListener('keydown', handleKeyDown);

    return () => {
      clearTimeout(timer);
      document.body.style.overflow = originalOverflow;
      window.removeEventListener('keydown', handleKeyDown);
      if (previousActiveElement.current && typeof previousActiveElement.current.focus === 'function') {
        previousActiveElement.current.focus();
      }
    };
  }, [open]);

  if (!mounted || !open) {
    return null;
  }

  const modalContent = (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center p-3 sm:p-6 overflow-y-auto animate-in fade-in duration-150"
      style={{ backgroundColor: 'var(--overlay-bg)' }}
      onClick={(e) => {
        if (e.target === e.currentTarget && !closeDisabledRef.current) {
          onCloseRef.current();
        }
      }}
    >
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        tabIndex={-1}
        className={`w-full ${sizeClasses[size]} max-h-[calc(100dvh-24px)] sm:max-h-[calc(100dvh-48px)] flex flex-col rounded-[var(--radius-surface)] border border-[var(--border-color)] bg-[var(--card-bg)] text-[var(--text-primary)] shadow-[var(--shadow-modal)] outline-hidden ${className}`}
        style={{
          backgroundColor: 'var(--card-bg)',
          borderColor: 'var(--border-color)',
          borderRadius: 'var(--radius-surface)',
          boxShadow: 'var(--shadow-modal)',
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Encabezado fijo */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-[var(--border-color)] shrink-0">
          <div className="flex items-center gap-2.5 min-w-0">
            {icon && <div className="shrink-0">{icon}</div>}
            <h3
              id={titleId}
              className="text-[15px] sm:text-base font-brand font-bold text-[var(--text-primary)] truncate"
            >
              {title}
            </h3>
          </div>
          <button
            type="button"
            data-modal-close
            onClick={() => {
              if (!closeDisabledRef.current) {
                onCloseRef.current();
              }
            }}
            disabled={closeDisabled}
            aria-label="Cerrar modal"
            className="p-1.5 -mr-1 rounded-[var(--radius-control)] text-[var(--text-muted)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-primary)] transition-colors disabled:opacity-40 disabled:pointer-events-none"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Cuerpo con scroll interno */}
        <div
          data-modal-body
          className="p-5 overflow-y-auto custom-scrollbar flex-1 text-sm text-[var(--text-primary)]"
        >
          {children}
        </div>

        {/* Pie fijo */}
        {footer && (
          <div
            data-modal-footer
            className="px-5 py-3.5 border-t border-[var(--border-color)] shrink-0 bg-[var(--card-bg)] rounded-b-[var(--radius-surface)]"
          >
            {footer}
          </div>
        )}
      </div>
    </div>
  );

  return createPortal(modalContent, document.body);
}
