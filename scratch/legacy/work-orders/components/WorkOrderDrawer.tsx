'use client';

import React, { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { 
  X, Info, CheckSquare, Wrench, Package, MessageSquare, 
  History, Calendar, DollarSign, MapPin, Plus, Trash2, CheckCircle2, UserPlus, FileUp
} from 'lucide-react';
import { useWorkOrder, useUpdateWorkOrder, useDeleteWorkOrder } from '@/hooks/useWorkOrders';
import { supabase } from '@/lib/supabaseClient';
import { generateUUID } from '@/lib/offlineDB';

interface WorkOrderDrawerProps {
  orderId: string;
  onClose: () => void;
}

export default function WorkOrderDrawer({ orderId, onClose }: WorkOrderDrawerProps) {
  const { data: order, isLoading, refetch } = useWorkOrder(orderId);
  const updateOrder = useUpdateWorkOrder();
  const deleteOrder = useDeleteWorkOrder();

  const [activeTab, setActiveTab] = useState<'info' | 'tasks' | 'materials' | 'spare_parts' | 'comments' | 'history'>('info');

  // Catálogos locales
  const [statuses, setStatuses] = useState<any[]>([]);
  const [priorities, setPriorities] = useState<any[]>([]);
  const [types, setTypes] = useState<any[]>([]);
  const [users, setUsers] = useState<any[]>([]);

  // Campos de edición temporal
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [location, setLocation] = useState('');
  const [statusId, setStatusId] = useState('');
  const [priorityId, setPriorityId] = useState('');
  const [typeId, setTypeId] = useState('');
  const [estimatedCost, setEstimatedCost] = useState(0);
  const [actualCost, setActualCost] = useState(0);
  const [plannedStart, setPlannedStart] = useState('');
  const [plannedEnd, setPlannedEnd] = useState('');

  // Tarea Nueva
  const [newTaskText, setNewTaskText] = useState('');
  // Comentario Nuevo
  const [newCommentText, setNewCommentText] = useState('');
  // Material Nuevo
  const [matName, setMatName] = useState('');
  const [matEstQty, setMatEstQty] = useState(0);
  const [matActQty, setMatActQty] = useState(0);
  const [matCost, setMatCost] = useState(0);

  // Cargar catálogos
  useEffect(() => {
    async function loadCatalogs() {
      const [st, pr, ty, us] = await Promise.all([
        supabase.from('work_order_statuses').select('*').order('position'),
        supabase.from('work_order_priorities').select('*').order('position'),
        supabase.from('work_order_types').select('*'),
        supabase.from('user_profiles').select('*').limit(20) // Fallback list
      ]);
      if (st.data) setStatuses(st.data);
      if (pr.data) setPriorities(pr.data);
      if (ty.data) setTypes(ty.data);
      if (us.data) setUsers(us.data);
    }
    loadCatalogs();
  }, []);

  // Sincronizar campos al cargar orden
  useEffect(() => {
    if (order) {
      setTitle(order.title || '');
      setDescription(order.description || '');
      setLocation(order.location || '');
      setStatusId(order.status_id || '');
      setPriorityId(order.priority_id || '');
      setTypeId(order.type_id || '');
      setEstimatedCost(Number(order.estimated_cost) || 0);
      setActualCost(Number(order.actual_cost) || 0);
      setPlannedStart(order.planned_start_at ? new Date(order.planned_start_at).toISOString().slice(0, 16) : '');
      setPlannedEnd(order.planned_end_at ? new Date(order.planned_end_at).toISOString().slice(0, 16) : '');
    }
  }, [order]);

  if (isLoading || !order) {
    return (
      <div className="fixed right-0 top-[48px] bottom-0 w-[550px] bg-[var(--bg-secondary)] border-l border-[var(--border-color)] shadow-2xl z-[200] flex items-center justify-center">
        <div className="w-8 h-8 border-2 border-[#3B7EF8] border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  // Guardar cambios generales de la cabecera
  const handleSaveField = async (fieldName: string, value: any) => {
    try {
      await updateOrder.mutateAsync({
        id: orderId,
        updates: { [fieldName]: value },
        currentVersion: order.version
      });
      refetch();
    } catch (err: any) {
      alert(err.message || 'Error al guardar los cambios.');
    }
  };

  // Checklist: Agregar tarea
  const handleAddTask = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newTaskText.trim()) return;

    const { error } = await supabase.from('work_order_tasks').insert({
      work_order_id: orderId,
      description: newTaskText,
      is_completed: false,
      position: order.tasks ? order.tasks.length : 0
    });

    if (!error) {
      setNewTaskText('');
      refetch();
    }
  };

  // Checklist: Completar/Desmarcar tarea
  const handleToggleTask = async (task: any) => {
    const { error } = await supabase
      .from('work_order_tasks')
      .update({
        is_completed: !task.is_completed,
        completed_at: !task.is_completed ? new Date().toISOString() : null
      })
      .eq('id', task.id);

    if (!error) refetch();
  };

  // Material: Agregar
  const handleAddMaterial = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!matName.trim()) return;

    const { error } = await supabase.from('work_order_materials').insert({
      work_order_id: orderId,
      custom_name: matName,
      estimated_qty: matEstQty,
      actual_qty: matActQty,
      unit_cost: matCost
    });

    if (!error) {
      setMatName('');
      setMatEstQty(0);
      setMatActQty(0);
      setMatCost(0);
      refetch();
    }
  };

  // Comentarios: Agregar
  const handleAddComment = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newCommentText.trim()) return;

    const { error } = await supabase.from('work_order_comments').insert({
      work_order_id: orderId,
      content: newCommentText,
      user_id: (await supabase.auth.getUser()).data.user?.id || '00000000-0000-0000-0000-000000000000'
    });

    if (!error) {
      setNewCommentText('');
      refetch();
    }
  };

  // Eliminar orden
  const handleDeleteOrder = async () => {
    const isConfirmed = window.confirm('¿Está seguro de eliminar esta orden de trabajo? Se marcará como borrado lógico.');
    if (!isConfirmed) return;

    const userId = (await supabase.auth.getUser()).data.user?.id || '';
    await deleteOrder.mutateAsync({ id: orderId, userId });
    onClose();
  };

  return (
    <motion.div 
      initial={{ x: '100%' }}
      animate={{ x: 0 }}
      exit={{ x: '100%' }}
      transition={{ type: 'tween', duration: 0.3 }}
      className="fixed right-0 top-[48px] bottom-0 w-[580px] bg-[var(--bg-secondary)] border-l border-[var(--border-color)] shadow-2xl z-[200] flex flex-col overflow-hidden"
    >
      {/* Header */}
      <div className="p-4 border-b border-[var(--border-color)] flex items-center justify-between shrink-0 bg-slate-500/5">
        <div className="flex items-center gap-3">
          <span className="text-xs font-black text-[#3B7EF8]">{order.display_number}</span>
          <h2 className="text-sm font-black uppercase tracking-wider truncate max-w-[300px]">{order.title}</h2>
        </div>
        <button onClick={onClose} className="p-1 text-slate-500 hover:text-white rounded-lg hover:bg-slate-500/10">
          <X className="w-5 h-5" />
        </button>
      </div>

      {/* Tabs */}
      <div className="flex items-center gap-1 border-b border-[var(--border-color)] bg-slate-500/5 px-2 py-1 shrink-0">
        {[
          { id: 'info', label: 'Info', icon: Info },
          { id: 'tasks', label: 'Checklist', icon: CheckSquare },
          { id: 'materials', label: 'Materiales', icon: Wrench },
          { id: 'comments', label: 'Comentarios', icon: MessageSquare },
          { id: 'history', label: 'Auditoría', icon: History }
        ].map(tab => {
          const isActive = activeTab === tab.id;
          return (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id as any)}
              className={`flex items-center gap-2 px-3 py-1.5 rounded-lg text-[9px] font-black uppercase tracking-wider transition-all ${isActive ? 'bg-[#3B7EF8] text-white shadow-lg shadow-blue-500/15' : 'text-slate-500 hover:text-slate-400'}`}
            >
              <tab.icon className="w-3.5 h-3.5" />
              <span>{tab.label}</span>
            </button>
          );
        })}
      </div>

      {/* Content Area */}
      <div className="flex-1 overflow-auto p-6 custom-scrollbar space-y-6">
        
        {/* TABS CONTROLLER */}
        {activeTab === 'info' && (
          <div className="space-y-6">
            {/* Title / Description */}
            <div className="space-y-3">
              <label className="text-[10px] font-black uppercase tracking-wider text-[#3B7EF8]">Título de la Orden</label>
              <input 
                type="text" 
                value={title} 
                onChange={(e) => setTitle(e.target.value)}
                onBlur={() => handleSaveField('title', title)}
                className="w-full px-3 py-2 bg-slate-500/5 border border-[var(--border-color)] rounded-xl text-xs outline-none focus:border-[#3B7EF8]/30 font-bold"
              />
              <label className="text-[10px] font-black uppercase tracking-wider text-[#3B7EF8] block mt-4">Descripción Detallada</label>
              <textarea 
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                onBlur={() => handleSaveField('description', description)}
                className="w-full h-24 px-3 py-2 bg-slate-500/5 border border-[var(--border-color)] rounded-xl text-xs outline-none focus:border-[#3B7EF8]/30 font-medium"
              />
            </div>

            {/* Catálogos dropdowns */}
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <label className="text-[10px] font-black uppercase tracking-wider text-[#3B7EF8]">Estado</label>
                <select 
                  value={statusId}
                  onChange={(e) => { setStatusId(e.target.value); handleSaveField('status_id', e.target.value); }}
                  className="w-full px-3 py-2 bg-slate-500/5 border border-[var(--border-color)] rounded-xl text-xs outline-none font-bold"
                >
                  {statuses.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
                </select>
              </div>

              <div className="space-y-2">
                <label className="text-[10px] font-black uppercase tracking-wider text-[#3B7EF8]">Prioridad</label>
                <select 
                  value={priorityId}
                  onChange={(e) => { setPriorityId(e.target.value); handleSaveField('priority_id', e.target.value); }}
                  className="w-full px-3 py-2 bg-slate-500/5 border border-[var(--border-color)] rounded-xl text-xs outline-none font-bold"
                >
                  {priorities.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                </select>
              </div>

              <div className="space-y-2">
                <label className="text-[10px] font-black uppercase tracking-wider text-[#3B7EF8]">Tipo de Orden</label>
                <select 
                  value={typeId}
                  onChange={(e) => { setTypeId(e.target.value); handleSaveField('type_id', e.target.value); }}
                  className="w-full px-3 py-2 bg-slate-500/5 border border-[var(--border-color)] rounded-xl text-xs outline-none font-bold"
                >
                  {types.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
                </select>
              </div>

              <div className="space-y-2">
                <label className="text-[10px] font-black uppercase tracking-wider text-[#3B7EF8]">Ubicación física</label>
                <input 
                  type="text" 
                  value={location}
                  onChange={(e) => setLocation(e.target.value)}
                  onBlur={() => handleSaveField('location', location)}
                  className="w-full px-3 py-2 bg-slate-500/5 border border-[var(--border-color)] rounded-xl text-xs outline-none focus:border-[#3B7EF8]/30 font-bold"
                />
              </div>
            </div>

            {/* Costos y Fechas */}
            <div className="grid grid-cols-2 gap-4 p-4 border border-[var(--border-color)] rounded-2xl bg-slate-500/5">
              <div className="space-y-2">
                <label className="text-[10px] font-black uppercase tracking-wider text-[#3B7EF8] flex items-center gap-1.5"><DollarSign className="w-3.5 h-3.5" /> Costo Estimado</label>
                <input 
                  type="number" 
                  value={estimatedCost}
                  onChange={(e) => setEstimatedCost(Number(e.target.value))}
                  onBlur={() => handleSaveField('estimated_cost', estimatedCost)}
                  className="w-full px-3 py-1.5 bg-slate-500/5 border border-[var(--border-color)] rounded-xl text-xs outline-none focus:border-[#3B7EF8]/30 font-bold"
                />
              </div>
              <div className="space-y-2">
                <label className="text-[10px] font-black uppercase tracking-wider text-[#3B7EF8] flex items-center gap-1.5"><DollarSign className="w-3.5 h-3.5" /> Costo Real</label>
                <input 
                  type="number" 
                  value={actualCost}
                  onChange={(e) => setActualCost(Number(e.target.value))}
                  onBlur={() => handleSaveField('actual_cost', actualCost)}
                  className="w-full px-3 py-1.5 bg-slate-500/5 border border-[var(--border-color)] rounded-xl text-xs outline-none focus:border-[#3B7EF8]/30 font-bold"
                />
              </div>

              <div className="space-y-2">
                <label className="text-[10px] font-black uppercase tracking-wider text-[#3B7EF8] flex items-center gap-1.5"><Calendar className="w-3.5 h-3.5" /> Inicio Planificado</label>
                <input 
                  type="datetime-local" 
                  value={plannedStart}
                  onChange={(e) => { setPlannedStart(e.target.value); handleSaveField('planned_start_at', e.target.value ? new Date(e.target.value).toISOString() : null); }}
                  className="w-full px-3 py-1.5 bg-slate-500/5 border border-[var(--border-color)] rounded-xl text-xs outline-none focus:border-[#3B7EF8]/30 font-bold"
                />
              </div>
              <div className="space-y-2">
                <label className="text-[10px] font-black uppercase tracking-wider text-[#3B7EF8] flex items-center gap-1.5"><Calendar className="w-3.5 h-3.5" /> Fin Planificado</label>
                <input 
                  type="datetime-local" 
                  value={plannedEnd}
                  onChange={(e) => { setPlannedEnd(e.target.value); handleSaveField('planned_end_at', e.target.value ? new Date(e.target.value).toISOString() : null); }}
                  className="w-full px-3 py-1.5 bg-slate-500/5 border border-[var(--border-color)] rounded-xl text-xs outline-none focus:border-[#3B7EF8]/30 font-bold"
                />
              </div>
            </div>

            {/* Soft Delete */}
            <div className="flex justify-between items-center pt-4 border-t border-[var(--border-color)]">
              <span className="text-[10px] text-slate-500 font-bold uppercase">Versión optimista: {order.version}</span>
              <button 
                onClick={handleDeleteOrder} 
                className="flex items-center gap-2 px-3 py-1.5 bg-red-600/10 text-red-500 border border-red-500/20 hover:bg-red-600 hover:text-white rounded-xl text-xs font-black uppercase tracking-wider active:scale-95 transition-all"
              >
                <Trash2 className="w-4 h-4" /> Eliminar Orden
              </button>
            </div>
          </div>
        )}

        {/* CHECKLIST TAB */}
        {activeTab === 'tasks' && (
          <div className="space-y-4">
            <h3 className="text-xs font-black uppercase tracking-wider text-[#3B7EF8]">Checklist de Actividades</h3>
            
            {/* Formulario Nueva Tarea */}
            <form onSubmit={handleAddTask} className="flex gap-2">
              <input 
                type="text" 
                placeholder="Nueva tarea de mantenimiento..." 
                value={newTaskText}
                onChange={(e) => setNewTaskText(e.target.value)}
                className="flex-1 px-3 py-2 bg-slate-500/5 border border-[var(--border-color)] rounded-xl text-xs outline-none focus:border-[#3B7EF8]/30 font-bold"
              />
              <button className="px-3 py-2 bg-[#3B7EF8] text-white rounded-xl text-xs font-black uppercase"><Plus className="w-4 h-4" /></button>
            </form>

            {/* Lista */}
            <div className="space-y-2">
              {order.tasks?.map((task: any) => (
                <div 
                  key={task.id} 
                  onClick={() => handleToggleTask(task)}
                  className="flex items-center gap-3 p-3 bg-slate-500/5 border border-[var(--border-color)] rounded-xl hover:bg-slate-500/10 cursor-pointer transition-all"
                >
                  <div className={`w-4 h-4 rounded border flex items-center justify-center shrink-0 ${task.is_completed ? 'bg-[#10B981] border-[#10B981] text-white' : 'border-slate-500'}`}>
                    {task.is_completed && <CheckSquare className="w-3.5 h-3.5" />}
                  </div>
                  <span className={`text-xs font-medium ${task.is_completed ? 'line-through text-slate-500' : ''}`}>{task.description}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* MATERIALES TAB */}
        {activeTab === 'materials' && (
          <div className="space-y-4">
            <h3 className="text-xs font-black uppercase tracking-wider text-[#3B7EF8]">Consumo de Materiales e Insumos</h3>

            {/* Formulario */}
            <form onSubmit={handleAddMaterial} className="p-4 bg-slate-500/5 border border-[var(--border-color)] rounded-2xl space-y-3">
              <input 
                type="text" 
                placeholder="Nombre del material..." 
                value={matName}
                onChange={(e) => setMatName(e.target.value)}
                className="w-full px-3 py-2 bg-slate-500/5 border border-[var(--border-color)] rounded-xl text-xs outline-none font-bold"
              />
              <div className="grid grid-cols-3 gap-2">
                <input 
                  type="number" 
                  placeholder="Est. Cant" 
                  value={matEstQty || ''}
                  onChange={(e) => setMatEstQty(Number(e.target.value))}
                  className="px-3 py-1.5 bg-slate-500/5 border border-[var(--border-color)] rounded-xl text-xs outline-none font-medium"
                />
                <input 
                  type="number" 
                  placeholder="Real Cant" 
                  value={matActQty || ''}
                  onChange={(e) => setMatActQty(Number(e.target.value))}
                  className="px-3 py-1.5 bg-slate-500/5 border border-[var(--border-color)] rounded-xl text-xs outline-none font-medium"
                />
                <input 
                  type="number" 
                  placeholder="Costo Unit" 
                  value={matCost || ''}
                  onChange={(e) => setMatCost(Number(e.target.value))}
                  className="px-3 py-1.5 bg-slate-500/5 border border-[var(--border-color)] rounded-xl text-xs outline-none font-medium"
                />
              </div>
              <button className="w-full py-2 bg-[#3B7EF8] text-white rounded-xl text-xs font-black uppercase tracking-wider flex items-center justify-center gap-2"><Plus className="w-4 h-4" /> Agregar Insumo</button>
            </form>

            {/* Listado */}
            <div className="space-y-2">
              {order.materials?.map((m: any) => (
                <div key={m.id} className="p-3 bg-slate-500/5 border border-[var(--border-color)] rounded-xl flex items-center justify-between">
                  <div>
                    <h4 className="text-xs font-bold">{m.custom_name}</h4>
                    <span className="text-[10px] text-slate-500">Estimado: {m.estimated_qty} {m.unit} | Real: {m.actual_qty} {m.unit}</span>
                  </div>
                  <span className="text-xs font-black text-[#10B981]">${(Number(m.actual_qty) * Number(m.unit_cost)).toFixed(0)}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* COMENTARIOS HILO TAB */}
        {activeTab === 'comments' && (
          <div className="space-y-4">
            <h3 className="text-xs font-black uppercase tracking-wider text-[#3B7EF8]">Hilo de Discusión</h3>
            
            {/* Formulario */}
            <form onSubmit={handleAddComment} className="flex gap-2">
              <input 
                type="text" 
                placeholder="Escribe un comentario o reporte técnico..." 
                value={newCommentText}
                onChange={(e) => setNewCommentText(e.target.value)}
                className="flex-1 px-3 py-2 bg-slate-500/5 border border-[var(--border-color)] rounded-xl text-xs outline-none focus:border-[#3B7EF8]/30 font-bold"
              />
              <button className="px-4 py-2 bg-[#3B7EF8] text-white rounded-xl text-xs font-black uppercase">Enviar</button>
            </form>

            {/* Listado */}
            <div className="space-y-3">
              {order.comments?.map((c: any) => (
                <div key={c.id} className="p-3 bg-slate-500/5 border border-[var(--border-color)] rounded-xl">
                  <div className="flex items-center justify-between mb-1.5">
                    <span className="text-[10px] font-black uppercase tracking-wider text-[#3B7EF8]">Usuario</span>
                    <span className="text-[10px] text-slate-500 font-bold">{new Date(c.created_at).toLocaleString()}</span>
                  </div>
                  <p className="text-xs font-medium text-slate-300">{c.content}</p>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* AUDITORÍA HISTORIAL TAB */}
        {activeTab === 'history' && (
          <div className="space-y-4">
            <h3 className="text-xs font-black uppercase tracking-wider text-[#3B7EF8]">Historial de Auditoría Genérica</h3>
            <div className="relative border-l border-[var(--border-color)] ml-3 pl-4 space-y-4">
              {order.history?.map((h: any) => (
                <div key={h.id} className="relative">
                  {/* Círculo indicador */}
                  <div className="absolute -left-[21px] top-1.5 w-2 h-2 rounded-full bg-[#3B7EF8]" />
                  
                  <span className="text-[10px] text-slate-500 font-bold block">{new Date(h.created_at).toLocaleString()}</span>
                  <div className="p-2 bg-slate-500/5 border border-[var(--border-color)] rounded-xl mt-1 text-xs">
                    <span className="font-bold text-[#3B7EF8]">{h.event_type}</span>: {h.new_value || 'Actualizado'}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

      </div>
    </motion.div>
  );
}
