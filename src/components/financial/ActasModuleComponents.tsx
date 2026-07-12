'use client';

import React, { useRef, useEffect } from 'react';

export const EditableCell = ({ value, type, onSave, className = '', step = 'any', align = 'center', renderValue }: any) => {
    const ref = useRef<HTMLInputElement>(null);
    const editing = useRef(false);

    // Sync display value when parent changes and not editing
    useEffect(() => {
        if (!editing.current && ref.current) {
            ref.current.value = renderValue ? renderValue(value) : String(value ?? '');
        }
    }, [value, renderValue]);

    const handleFocus = (e: React.FocusEvent<HTMLInputElement>) => {
        editing.current = true;
        // Show raw value for editing
        const raw = type === 'number' ? (value === 0 ? '' : String(value)) : String(value ?? '');
        e.target.value = raw;
        e.target.select();
    };

    const handleBlur = (e: React.FocusEvent<HTMLInputElement>) => {
        editing.current = false;
        let finalVal: any = e.target.value;
        if (type === 'number') {
            finalVal = e.target.value === '' ? 0 : parseFloat(e.target.value.replace(',', '.')) || 0;
        }
        // Reset display
        e.target.value = renderValue ? renderValue(finalVal) : String(finalVal ?? '');
        // Only save if changed
        const currentVal = type === 'number' ? parseFloat(String(value || 0)) : value;
        if (finalVal !== currentVal) {
            onSave(finalVal);
        }
    };

    return (
        <input
            ref={ref}
            type="text"
            inputMode={type === 'number' ? 'decimal' : 'text'}
            defaultValue={renderValue ? renderValue(value) : String(value ?? '')}
            onFocus={handleFocus}
            onBlur={handleBlur}
            onKeyDown={(e) => {
                if (e.key === 'Enter') (e.target as HTMLInputElement).blur();
                if (e.key === 'Escape') {
                    editing.current = false;
                    (e.target as HTMLInputElement).value = renderValue ? renderValue(value) : String(value ?? '');
                    (e.target as HTMLInputElement).blur();
                }
            }}
            className={`w-full bg-transparent border border-transparent hover:border-blue-300 focus:border-blue-500 focus:bg-white focus:outline-none rounded transition-all py-0.5 px-1 cursor-text text-${align} ${className}`}
        />
    );
};

export function MatrixQtyInput({ defaultValue, onCommit }: { defaultValue: number; onCommit: (v: number) => void }) {
    const ref = useRef<HTMLInputElement>(null);
    const editing = useRef(false);

    const renderValue = (v: number) => v === 0 ? '' : v.toLocaleString('es-CO', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

    useEffect(() => {
        if (!editing.current && ref.current) {
            ref.current.value = renderValue(defaultValue);
        }
    }, [defaultValue]);

    const commit = (input: HTMLInputElement) => {
        editing.current = false;
        const raw = input.value.replace(/\./g, '').replace(',', '.');
        const v = parseFloat(raw) || 0;
        input.value = renderValue(v);
        if (v !== defaultValue) {
            onCommit(v);
        }
    };

    return (
        <input
            ref={ref}
            type="text"
            inputMode="decimal"
            defaultValue={renderValue(defaultValue)}
            placeholder="—"
            onFocus={(e) => {
                editing.current = true;
                e.target.value = defaultValue === 0 ? '' : String(defaultValue).replace('.', ',');
                e.target.select();
            }}
            onBlur={(e) => commit(e.target)}
            onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === 'Tab') {
                    e.preventDefault();
                    commit(e.target as HTMLInputElement);
                    (e.target as HTMLInputElement).blur();
                }
                if (e.key === 'Escape') {
                    editing.current = false;
                    (e.target as HTMLInputElement).value = renderValue(defaultValue);
                    (e.target as HTMLInputElement).blur();
                }
            }}
            className="w-full h-full bg-blue-50/50 hover:bg-blue-100/50 focus:bg-white focus:outline-none text-[8px] font-bold text-blue-800 text-right px-1 transition-colors border-none"
        />
    );
}
