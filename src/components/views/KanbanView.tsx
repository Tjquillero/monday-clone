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
  'Done': { label: 'Listo', color: '#00c875', icon: CheckCircle2, bgColor: '#e6fff4' },
  'Working on it': { label: 'En proceso', color: '#fdab3d', icon: Clock, bgColor: '#fff7ed' },
  'Stuck': { label: 'Detenido', color: '#e2445c', icon: AlertCircle, bgColor: '#fff1f2' },
  'Not Started': { label: 'Sin iniciar', color: '#c4c4c4', icon: MoreHorizontal, bgColor: '#f8fafc' },
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
      className="bg-white p-4 rounded-xl border border-gray-200 shadow-sm hover:shadow-md transition-all cursor-grab active:cursor-grabbing group mb-3"
    >
      <div className="flex items-start justify-between mb-2">
        <div 
          className="text-[10px] font-black px-2 py-0.5 rounded-full uppercase tracking-wider text-white"
          style={{ backgroundColor: priorityColor }}
        >
          {priority}
        </div>
        <div className="flex -space-x-1.5 opacity-0 group-hover:opacity-100 transition-opacity">
            <div className="w-6 h-6 rounded-full bg-slate-100 border-2 border-white flex items-center justify-center">
                <User size={12} className="text-slate-400" />
            </div>
        </div>
      </div>
      
      <h4 className="text-sm font-bold text-gray-800 line-clamp-2 mb-3 leading-snug">
        {item.name}
      </h4>

      <div className="flex items-center justify-between pt-3 border-t border-gray-50 text-gray-400">
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-1.5">
            <MessageSquare size={12} />
            <span className="text-[10px] font-bold">2</span>
          </div>
        </div>
        <div className="text-[10px] font-medium italic">
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
    <div className="flex flex-col w-full min-w-[300px] h-full bg-slate-50/50 rounded-2xl border border-slate-100/50">
      <div className="p-4 flex items-center justify-between border-b border-white">
        <div className="flex items-center gap-2.5">
          <div className="p-1.5 rounded-lg" style={{ backgroundColor: config.bgColor, color: config.color }}>
            <Icon size={16} />
          </div>
          <h3 className="font-black text-xs uppercase tracking-widest text-slate-700">
            {config.label}
          </h3>
          <span className="text-[10px] bg-white px-2 py-0.5 rounded-full font-bold text-slate-400 shadow-sm ring-1 ring-slate-100">
            {items.length}
          </span>
        </div>
      </div>

      <div 
        ref={setNodeRef}
        className={`flex-1 p-3 transition-colors rounded-b-2xl overflow-y-auto no-scrollbar ${isOver ? 'bg-primary/5 ring-2 ring-primary/20 ring-inset' : ''}`}
        style={{ minHeight: '150px' }}
      >
        <SortableContext items={items.map(i => i.id)} strategy={verticalListSortingStrategy}>
          {items.map(item => (
            <KanbanCard key={item.id} item={item} onOpenItem={onOpenItem} />
          ))}
        </SortableContext>
        
        {items.length === 0 && !isOver && (
          <div className="h-full flex flex-col items-center justify-center py-12 opacity-30 grayscale pointer-events-none">
             <Icon size={32} className="text-slate-300 mb-2" />
             <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400">Sin tareas</p>
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
