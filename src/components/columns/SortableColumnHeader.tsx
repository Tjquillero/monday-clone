'use client';

import { Settings2, GripVertical } from 'lucide-react';
import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { Column } from '@/types/monday';

interface Props {
  column: Column;
  isAdmin?: boolean;
  isEditing?: boolean;
  onEdit?: (column: Column) => void;
}

export function SortableColumnHeader({ column, isAdmin, isEditing, onEdit }: Props) {
  // Drag identity is column.id (UUID) — NOT column.key.
  // column.key is the semantic key for reading/writing items.values.
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: column.id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.4 : 1,
    zIndex: isDragging ? 10 : undefined,
    cursor: isDragging ? 'grabbing' : undefined,
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      className="relative group/colhdr flex items-center justify-center gap-1"
    >
      {/* Drag handle — renders on hover, activates drag */}
      {isAdmin && (
        <button
          {...listeners}
          {...attributes}
          className="opacity-0 group-hover/colhdr:opacity-50 hover:!opacity-100 cursor-grab active:cursor-grabbing p-0.5 rounded text-[var(--text-secondary)] transition-all flex-shrink-0"
          title="Arrastrar columna"
          // Prevent click from bubbling to other handlers
          onClick={e => e.stopPropagation()}
        >
          <GripVertical size={11} />
        </button>
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
