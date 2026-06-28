'use client';

import { Settings2, GripVertical, Lock } from 'lucide-react';
import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { Column } from '@/types/monday';

interface Props {
  column: Column;
  isAdmin?: boolean;
  isEditing?: boolean;
  onEdit?: (column: Column) => void;
  disabled?: boolean; // true for pinned columns (e.g. Nombre)
}

export function SortableColumnHeader({ column, isAdmin, isEditing, onEdit, disabled }: Props) {
  // Drag identity is column.id (UUID) — NOT column.key.
  // column.key is the semantic identity for items.values; id is the physical one.
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
    isOver,
  } = useSortable({
    id: column.id,
    disabled,
  });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.35 : 1,
    zIndex: isDragging ? 20 : undefined,
    cursor: isDragging ? 'grabbing' : undefined,
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={[
        'relative group/colhdr flex items-center justify-center gap-1 h-full select-none',
        isOver && !isDragging ? 'bg-[#3B7EF8]/8' : '',
        isDragging ? 'rounded-lg ring-1 ring-[#3B7EF8]/30 bg-[#3B7EF8]/5' : '',
      ].join(' ')}
    >
      {/* Drop indicator line — left edge when another column is hovering */}
      {isOver && !isDragging && (
        <div className="absolute left-0 top-1 bottom-1 w-0.5 rounded-full bg-[#3B7EF8] pointer-events-none" />
      )}

      {/* Drag handle */}
      {isAdmin && !disabled && (
        <button
          {...listeners}
          {...attributes}
          className="opacity-0 group-hover/colhdr:opacity-40 hover:!opacity-100 cursor-grab active:cursor-grabbing p-0.5 rounded text-[var(--text-secondary)] transition-all flex-shrink-0"
          title="Arrastrar columna"
          onClick={e => e.stopPropagation()}
        >
          <GripVertical size={11} />
        </button>
      )}

      {/* Lock icon for pinned columns */}
      {disabled && isAdmin && (
        <Lock size={9} className="text-slate-400 flex-shrink-0" />
      )}

      <span className="truncate">{column.title}</span>

      {isAdmin && onEdit && (
        <button
          onClick={() => onEdit(column)}
          className={`opacity-0 group-hover/colhdr:opacity-100 p-0.5 rounded transition-all hover:text-[#3B7EF8] ${isEditing ? 'opacity-100 text-[#3B7EF8]' : ''}`}
          title="Editar columna"
        >
          <Settings2 size={11} />
        </button>
      )}
    </div>
  );
}
