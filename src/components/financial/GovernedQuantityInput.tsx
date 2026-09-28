'use client';

import React, { useState, useRef, useEffect } from 'react';
import { AlertCircle, Check, Edit2 } from 'lucide-react';

interface GovernedQuantityInputProps {
  value: number;
  maxAllowed: number;
  unit?: string;
  isReadOnly?: boolean;
  onCommit: (newQty: number) => void;
}

export const GovernedQuantityInput: React.FC<GovernedQuantityInputProps> = ({
  value,
  maxAllowed,
  unit = '',
  isReadOnly = false,
  onCommit,
}) => {
  const [isEditing, setIsEditing] = useState(false);
  const [inputValue, setInputValue] = useState<string>(String(value));
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    setInputValue(String(value));
  }, [value]);

  useEffect(() => {
    if (isEditing && inputRef.current) {
      inputRef.current.focus();
      inputRef.current.select();
    }
  }, [isEditing]);

  const handleStartEdit = () => {
    if (isReadOnly) return;
    setInputValue(String(value));
    setErrorMessage(null);
    setIsEditing(true);
  };

  const handleValidateAndCommit = () => {
    const parsed = parseFloat(inputValue.replace(',', '.'));
    if (isNaN(parsed) || parsed < 0) {
      setErrorMessage('La cantidad debe ser un número positivo (≥ 0).');
      return;
    }
    if (parsed > maxAllowed) {
      setErrorMessage(`Solo reducción: el tope máximo es ${maxAllowed.toLocaleString('es-CO', { maximumFractionDigits: 2 })}.`);
      return;
    }

    setErrorMessage(null);
    setIsEditing(false);
    if (parsed !== value) {
      onCommit(parsed);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      handleValidateAndCommit();
    } else if (e.key === 'Escape') {
      e.preventDefault();
      setInputValue(String(value));
      setErrorMessage(null);
      setIsEditing(false);
    }
  };

  if (isReadOnly) {
    return (
      <span className="font-bold text-slate-800">
        {value.toLocaleString('es-CO', { maximumFractionDigits: 2 })}
      </span>
    );
  }

  const isReduced = value < maxAllowed;

  return (
    <div className="relative flex flex-col items-end">
      {!isEditing ? (
        <button
          type="button"
          onClick={handleStartEdit}
          className="group flex items-center gap-1.5 px-2.5 py-1 rounded-lg border border-slate-200 hover:border-blue-400 bg-white hover:bg-blue-50/50 transition-all text-right"
          title="Haga clic para ajustar la cantidad (solo reducción permitida)"
        >
          <span className="font-bold text-slate-800 text-xs">
            {value.toLocaleString('es-CO', { maximumFractionDigits: 2 })}
          </span>
          <Edit2 className="w-3 h-3 text-slate-400 group-hover:text-blue-600 transition-colors" />
        </button>
      ) : (
        <div className="flex flex-col items-end gap-1">
          <div className="flex items-center gap-1">
            <input
              ref={inputRef}
              type="text"
              inputMode="decimal"
              value={inputValue}
              onChange={(e) => {
                setInputValue(e.target.value);
                setErrorMessage(null);
              }}
              onBlur={handleValidateAndCommit}
              onKeyDown={handleKeyDown}
              className={`w-24 px-2 py-1 text-right text-xs font-bold rounded-lg border focus:outline-none transition-all ${
                errorMessage
                  ? 'border-rose-400 focus:ring-2 focus:ring-rose-200 bg-rose-50/40 text-rose-900'
                  : 'border-blue-400 focus:ring-2 focus:ring-blue-200 bg-white text-slate-900'
              }`}
            />
            <button
              type="button"
              onMouseDown={(e) => {
                e.preventDefault();
                handleValidateAndCommit();
              }}
              className="p-1 rounded-lg bg-emerald-600 text-white hover:bg-emerald-700 transition-colors"
              title="Guardar ajuste"
            >
              <Check className="w-3.5 h-3.5" />
            </button>
          </div>
          {errorMessage && (
            <div className="flex items-center gap-1 text-[10px] text-rose-600 font-medium whitespace-nowrap">
              <AlertCircle className="w-3 h-3 shrink-0" />
              <span>{errorMessage}</span>
            </div>
          )}
        </div>
      )}

      {isReduced && !isEditing && (
        <span className="text-[10px] font-semibold text-amber-700 bg-amber-50 border border-amber-200/60 px-1.5 py-0.2 rounded mt-0.5">
          Reducido (Tope: {maxAllowed.toLocaleString('es-CO', { maximumFractionDigits: 2 })})
        </span>
      )}
    </div>
  );
};
