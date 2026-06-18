import React from 'react';

export function HeaderCell({ label, color = "var(--text-secondary)" }: { label: string, color?: string }) {
  return (
    <div className="border-r border-[var(--border-color)] p-2 flex items-center justify-center bg-[var(--bg-secondary)]/50 h-full">
       <span className="text-[8px] font-black uppercase tracking-[0.1em] text-center" style={{ color }}>{label}</span>
    </div>
  );
}

export function Cell({ text, weight = "normal", color = "var(--text-secondary)", gray = false, bg = "transparent" }: { text: string, weight?: string, color?: string, gray?: boolean, bg?: string }) {
  return (
    <div className="h-full border-r border-white/5 p-1 flex items-center justify-center shrink-0" style={{ backgroundColor: bg }}>
       <span className={`text-[9px] truncate px-1 font-mono ${gray ? 'opacity-30' : ''}`} style={{ fontWeight: weight, color }}>{text}</span>
    </div>
  );
}

export function EditableCell({ value, onSave, type = "text", className = "", color = "white", weight = "800", bg = "transparent" }: { value: string | number, onSave: (val: string | number) => void, type?: string, className?: string, color?: string, weight?: string, bg?: string }) {
  const [localValue, setLocalValue] = React.useState(value);

  React.useEffect(() => {
    setLocalValue(value);
  }, [value]);

  return (
    <div className="h-full border-r border-white/5 p-1 flex items-center justify-center shrink-0 group/edit" style={{ backgroundColor: bg }}>
      <input 
        type={type}
        value={localValue !== undefined && localValue !== null ? localValue : ''}
        onChange={(e) => setLocalValue(e.target.value)}
        onBlur={() => localValue !== value && onSave(localValue)}
        onKeyDown={(e) => e.key === 'Enter' && e.currentTarget.blur()}
        className={`w-full bg-transparent border-none outline-none text-center text-[10px] font-mono group-hover/edit:bg-white/5 rounded transition-all focus:bg-white/10`}
        style={{ fontWeight: weight, color }}
      />
    </div>
  );
}
