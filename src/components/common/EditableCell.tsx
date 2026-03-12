
import React, { useState, useEffect } from 'react';

interface EditableCellProps {
    value: any;
    type: 'text' | 'number';
    onSave: (val: any) => void;
    className?: string;
    align?: 'left' | 'center' | 'right';
    readonly?: boolean;
    step?: string;
}

export const EditableCell = ({ 
    value, 
    type, 
    onSave, 
    className = '', 
    align = 'center', 
    readonly = false,
    step = 'any'
}: EditableCellProps) => {
    const [localValue, setLocalValue] = useState<string>(String(value ?? ''));
    const [isFocused, setIsFocused] = useState(false);

    useEffect(() => {
        if (!isFocused) setLocalValue(String(value ?? ''));
    }, [value, isFocused]);

    const handleBlur = () => {
        setIsFocused(false);
        if (readonly) return;

        let finalVal: any = localValue;
        if (type === 'number') {
            finalVal = localValue === '' ? 0 : parseFloat(localValue);
            if (isNaN(finalVal)) finalVal = 0;
        }
        
        const currentVal = type === 'number' ? parseFloat(String(value || 0)) : value;
        if (finalVal !== currentVal) {
            onSave(finalVal);
        }
    };

    if (readonly) {
        return (
            <div className={`w-full py-1 px-1 text-${align} ${className}`}>
                {type === 'number' ? Number(value).toLocaleString('es-CO') : value}
            </div>
        );
    }

    return (
        <div className="w-full h-full relative flex items-center justify-center">
            <input 
                type={type === 'number' ? 'text' : 'text'} // Use text for numbers to handle better locally if needed, but let's stick to standard for now
                inputMode={type === 'number' ? 'decimal' : 'text'}
                step={step}
                value={(localValue === '0' || localValue === '0.00' || localValue === '0.0') && isFocused ? '' : localValue}
                onChange={(e) => setLocalValue(e.target.value)}
                onFocus={(e) => {
                    setIsFocused(true);
                    e.target.select();
                }}
                onBlur={handleBlur}
                onKeyDown={(e) => e.key === 'Enter' && (e.target as any).blur()}
                className={`w-full bg-transparent border border-transparent hover:border-blue-400/50 focus:border-blue-500 rounded transition-all py-1 px-1 cursor-text z-10 text-${align} ${className}`}
                style={{ outline: 'none' }}
            />
        </div>
    );
};
