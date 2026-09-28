'use client';

import { useMemo } from 'react';
import { useDroppable } from '@dnd-kit/core';
import { 
  SortableContext, 
  verticalListSortingStrategy,
  useSortable 
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { Item, Column } from '@/types/monday';
import { Clock, AlertCircle, CheckCircle2, MoreHorizontal, User, MessageSquare } from 'lucide-react';

interface KanbanViewProps {
  items: Item[];
  statusCol: Column;
  onOpenItem: (groupId: string, item: any) => void;
}

const STATUS_CONFIG: Record<string, { label: string, color: string, icon: any, bgColor: string }> = {
  'Done': { label: 'Completado', color: '#00c875', icon: CheckCircle2, bgColor: '#e6fff4' },
  'Working on it': { label: 'En Proceso', color: '#fdab3d', icon: Clock, bgColor: '#fff7ed' },
  'Stuck': { label: 'Bloqueado', color: '#e2445c', icon: AlertCircle, bgColor: '#fff1f2' },
  'Not Started': { label: 'Pendiente', color: '#c4c4c4', icon: MoreHorizontal, bgColor: '#f8fafc' },
};

function KanbanCard({ item, onOpenItem }: { item: Item, onOpenItem: (groupId: string, item: any) => void }) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging
  } = useSortable({ id: item.id });

  const style = {
    transform: CSS.Translate.toString(transform),
    transition,
    opacity: isDragging ? 0 : 1, // We use the DragOverlay in the container for the actual ghost
  };

  const priority = item.values['priority'] || 'Low';
  const priorityColor = priority === 'High' ? '#ef4444' : priority === 'Medium' ? '#f59e0b' : '#3b82f6';

  return (
    <div
      ref={setNodeRef}
      style={style}
      {...attributes}
      {...listeners}
      onClick={() => onOpenItem(item.group_id as string, item)}
      className="bg-[var(--card-bg)] p-4 rounded-[var(--radius-surface)] border border-[var(--border-color)] shadow-[var(--shadow-card)] hover:border-[var(--color-primary)]/30 transition-all cursor-grab active:cursor-grabbing group mb-3"
    >
      <div className="flex items-start justify-between mb-2">
        <div 
          className="text-[10px] font-bold px-2 py-0.5 rounded-[var(--radius-control)] uppercase tracking-wider text-white"
          style={{ backgroundColor: priorityColor }}
        >
          {priority}
        </div>
        <div className="flex -space-x-1.5 opacity-0 group-hover:opacity-100 transition-opacity">
            <div className="w-6 h-6 rounded-full bg-[var(--color-surface-subtle)] border-2 border-[var(--card-bg)] flex items-center justify-center">
                <User size={12} className="text-[var(--text-muted)]" />
            </div>
        </div>
      </div>
      
      <h4 className="text-sm font-bold text-[var(--text-primary)] line-clamp-2 mb-3 leading-snug">
        {item.name}
      </h4>

      <div className="flex items-center justify-between pt-3 border-t border-[var(--border-color)] text-[var(--text-muted)]">
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-1.5">
            <MessageSquare size={12} />
            <span className="text-[10px] font-bold font-mono">2</span>
          </div>
        </div>
        <div className="text-[10px] font-mono text-[var(--text-muted)] italic">
          #{item.id.toString().slice(-4)}
        </div>
      </div>
    </div>
  );
}

function KanbanColumn({ status, items, statusCol, onOpenItem }: { status: string, items: Item[], statusCol: Column, onOpenItem: (groupId: string, item: any) => void }) {
  const { setNodeRef, isOver } = useDroppable({ id: status });
  const config = STATUS_CONFIG[status] || STATUS_CONFIG['Not Started'];
  const Icon = config.icon;

  return (
    <div className="flex flex-col w-full min-w-[300px] h-full bg-[var(--color-surface-subtle)] rounded-[var(--radius-surface)] border border-[var(--border-color)]">
      <div className="p-4 flex items-center justify-between border-b border-[var(--border-color)]">
        <div className="flex items-center gap-2.5">
          <div className="p-1.5 rounded-[var(--radius-control)]" style={{ backgroundColor: config.bgColor, color: config.color }}>
            <Icon size={16} />
          </div>
          <h3 className="font-bold text-xs uppercase tracking-wider text-[var(--text-primary)]">
            {config.label}
          </h3>
          <span className="text-[10px] bg-[var(--card-bg)] px-2 py-0.5 rounded-[var(--radius-control)] font-bold font-mono text-[var(--text-secondary)] border border-[var(--border-color)] shadow-2xs">
            {items.length}
          </span>
        </div>
      </div>

      <div 
        ref={setNodeRef}
        className={`flex-1 p-3 transition-colors rounded-b-[var(--radius-surface)] overflow-y-auto no-scrollbar ${isOver ? 'bg-[var(--color-primary-subtle)]/40 ring-2 ring-[var(--color-primary)]/30 ring-inset' : ''}`}
        style={{ minHeight: '150px' }}
      >
        <SortableContext items={items.map(i => i.id)} strategy={verticalListSortingStrategy}>
          {items.map(item => (
            <KanbanCard key={item.id} item={item} onOpenItem={onOpenItem} />
          ))}
        </SortableContext>
        
        {items.length === 0 && !isOver && (
          <div className="h-full flex flex-col items-center justify-center py-12 opacity-40 grayscale pointer-events-none">
             <Icon size={32} className="text-[var(--text-muted)] mb-2" />
             <p className="text-[10px] font-bold uppercase tracking-widest text-[var(--text-muted)]">Sin tareas</p>
          </div>
        )}
      </div>
    </div>
  );
}

export default function KanbanView({ items, statusCol, onOpenItem }: KanbanViewProps) {
  const columns = ['Not Started', 'Working on it', 'Stuck', 'Done'];

  const groupedItems = useMemo(() => {
    const groups: Record<string, Item[]> = {
      'Not Started': [],
      'Working on it': [],
      'Stuck': [],
      'Done': [],
    };

    items.forEach(item => {
      const status = item.values[statusCol.id] || 'Not Started';
      if (groups[status]) groups[status].push(item);
      else groups['Not Started'].push(item);
    });

    return groups;
  }, [items, statusCol.id]);

  return (
    <div className="flex gap-6 h-full min-h-[600px] overflow-x-auto pb-6 custom-scrollbar px-2">
      {columns.map(status => (
        <KanbanColumn 
          key={status} 
          status={status} 
          items={groupedItems[status]} 
          statusCol={statusCol}
          onOpenItem={onOpenItem}
        />
      ))}
    </div>
  );
}
