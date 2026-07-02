'use client';

import React, { useState, useMemo, useEffect } from 'react';
import { 
  ClipboardList, Plus, Search, Filter, Wrench, ShieldAlert, 
  Clock, MapPin, CheckSquare, DollarSign, UserCheck, AlertTriangle
} from 'lucide-react';
import { useWorkOrders, useCreateWorkOrder } from '@/hooks/useWorkOrders';
import { supabase } from '@/lib/supabaseClient';
import WorkOrderDrawer from '@/components/work-orders/WorkOrderDrawer';

export default function WorkOrdersContainer() {
  const { data: orders, isLoading, refetch } = useWorkOrders();
  const createOrder = useCreateWorkOrder();

  // Estados de catálogo
  const [statuses, setStatuses] = useState<any[]>([]);
  const [priorities, setPriorities] = useState<any[]>([]);
  const [types, setTypes] = useState<any[]>([]);

  // Estados de filtros y UI
  const [search, setSearch] = useState('');
  const [selectedStatusId, setSelectedStatusId] = useState<string>('');
  const [selectedPriorityId, setSelectedPriorityId] = useState<string>('');
  const [selectedTypeId, setSelectedTypeId] = useState<string>('');
  
  // Drawer state
  const [selectedOrderId, setSelectedOrderId] = useState<string | null>(null);
  const [isCreateOpen, setIsCreateOpen] = useState(false);

  // Cargar catálogos
  useEffect(() => {
    async function loadCatalogs() {
      const [st, pr, ty] = await Promise.all([
        supabase.from('work_order_statuses').select('*').order('position'),
        supabase.from('work_order_priorities').select('*').order('position'),
        supabase.from('work_order_types').select('*')
      ]);
      if (st.data) setStatuses(st.data);
      if (pr.data) setPriorities(pr.data);
      if (ty.data) setTypes(ty.data);
    }
    loadCatalogs();
  }, []);

  // Filtrar órdenes
  const filteredOrders = useMemo(() => {
    if (!orders) return [];
    return orders.filter((ot: any) => {
      const matchesSearch = ot.title.toLowerCase().includes(search.toLowerCase()) || 
                            ot.display_number.toLowerCase().includes(search.toLowerCase()) ||
                            (ot.location && ot.location.toLowerCase().includes(search.toLowerCase()));
      const matchesStatus = !selectedStatusId || ot.status_id === selectedStatusId;
      const matchesPriority = !selectedPriorityId || ot.priority_id === selectedPriorityId;
      const matchesType = !selectedTypeId || ot.type_id === selectedTypeId;

      return matchesSearch && matchesStatus && matchesPriority && matchesType;
    });
  }, [orders, search, selectedStatusId, selectedPriorityId, selectedTypeId]);

  // Handler para crear orden rápida
  const handleCreateQuickOrder = async (e: React.FormEvent) => {
    e.preventDefault();
    const defaultStatus = statuses.find(s => s.key === 'draft');
    const defaultPriority = priorities.find(p => p.key === 'medium');
    const defaultType = types.find(t => t.key === 'corrective');

    if (!defaultStatus || !defaultPriority || !defaultType) {
      alert('Error cargando los catálogos por defecto. Intente de nuevo.');
      return;
    }

    try {
      const newOt = await createOrder.mutateAsync({
        title: 'Nueva Orden de Trabajo - ' + new Date().toLocaleDateString(),
        description: 'Detalle de mantenimiento por registrar.',
        status_id: defaultStatus.id,
        priority_id: defaultPriority.id,
        type_id: defaultType.id,
        location: 'Sede Principal',
        estimated_cost: 0.00,
        actual_cost: 0.00
      });
      setSelectedOrderId(newOt.id);
    } catch (err) {
      console.error(err);
      alert('Error al crear la orden de trabajo.');
    }
  };

  return (
    <div className="flex h-full w-full bg-[var(--bg-primary)] text-[var(--text-primary)]">
      {/* Listado principal */}
      <div className="flex-1 flex flex-col p-6 overflow-hidden">
        {/* Encabezado */}
        <div className="flex items-center justify-between mb-6 shrink-0">
          <div className="flex items-center gap-3">
            <ClipboardList className="w-6 h-6 text-[#3B7EF8]" />
            <div>
              <h1 className="text-lg font-black tracking-wider uppercase italic">Gestión de Órdenes de Trabajo (CMMS)</h1>
              <p className="text-xs text-slate-500 font-medium">Cimientos robustos para la gestión y control de mantenimiento de activos</p>
            </div>
          </div>
          <button 
            onClick={handleCreateQuickOrder} 
            className="flex items-center gap-2 px-4 py-2 bg-[#3B7EF8] text-white rounded-xl text-xs font-black uppercase tracking-wider shadow-lg shadow-blue-500/20 active:scale-95 transition-all hover:bg-blue-600"
          >
            <Plus className="w-4 h-4" /> Nueva Orden
          </button>
        </div>

        {/* Ribbon de búsqueda y filtros */}
        <div className="flex flex-wrap items-center gap-3 mb-6 p-4 bg-[var(--bg-secondary)]/30 border border-[var(--border-color)] rounded-xl shrink-0">
          {/* Búsqueda */}
          <div className="flex-1 min-w-[200px] relative">
            <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-700" />
            <input 
              type="text" 
              placeholder="Buscar por código, título o ubicación..." 
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full pl-9 pr-4 py-2 bg-slate-500/5 border border-[var(--border-color)] rounded-lg text-xs outline-none focus:border-[#3B7EF8]/30 transition-all font-bold"
            />
          </div>

          {/* Filtro Estado */}
          <select 
            value={selectedStatusId} 
            onChange={(e) => setSelectedStatusId(e.target.value)}
            className="px-3 py-2 bg-slate-500/5 border border-[var(--border-color)] rounded-lg text-xs outline-none font-bold"
          >
            <option value="">Todos los Estados</option>
            {statuses.map(s => (
              <option key={s.id} value={s.id}>{s.name}</option>
            ))}
          </select>

          {/* Filtro Prioridad */}
          <select 
            value={selectedPriorityId} 
            onChange={(e) => setSelectedPriorityId(e.target.value)}
            className="px-3 py-2 bg-slate-500/5 border border-[var(--border-color)] rounded-lg text-xs outline-none font-bold"
          >
            <option value="">Todas las Prioridades</option>
            {priorities.map(p => (
              <option key={p.id} value={p.id}>{p.name}</option>
            ))}
          </select>

          {/* Filtro Tipo */}
          <select 
            value={selectedTypeId} 
            onChange={(e) => setSelectedTypeId(e.target.value)}
            className="px-3 py-2 bg-slate-500/5 border border-[var(--border-color)] rounded-lg text-xs outline-none font-bold"
          >
            <option value="">Todos los Tipos</option>
            {types.map(t => (
              <option key={t.id} value={t.id}>{t.name}</option>
            ))}
          </select>
        </div>

        {/* Tabla / Grid */}
        <div className="flex-1 overflow-auto custom-scrollbar border border-[var(--border-color)] rounded-xl bg-[var(--bg-secondary)]/10">
          {isLoading ? (
            <div className="flex h-full items-center justify-center p-8">
              <div className="w-8 h-8 border-2 border-[#3B7EF8] border-t-transparent rounded-full animate-spin" />
            </div>
          ) : filteredOrders.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-full p-8 text-slate-500">
              <ClipboardList className="w-12 h-12 text-slate-700 mb-2 animate-pulse" />
              <p className="text-xs font-bold uppercase tracking-wider">No se encontraron órdenes de trabajo</p>
            </div>
          ) : (
            <table className="w-full text-left text-xs border-collapse">
              <thead>
                <tr className="bg-[var(--bg-secondary)]/50 border-b border-[var(--border-color)] text-[10px] font-black uppercase tracking-wider text-slate-500">
                  <th className="p-4 w-28">Código</th>
                  <th className="p-4">Título de la Orden</th>
                  <th className="p-4 w-32">Estado</th>
                  <th className="p-4 w-28">Prioridad</th>
                  <th className="p-4 w-28">Tipo</th>
                  <th className="p-4 w-40">Ubicación</th>
                  <th className="p-4 w-32">Costo (Real/Est)</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[var(--border-color)] font-medium">
                {filteredOrders.map((ot: any) => (
                  <tr 
                    key={ot.id} 
                    onClick={() => setSelectedOrderId(ot.id)}
                    className="hover:bg-slate-500/5 cursor-pointer transition-all active:bg-slate-500/10"
                  >
                    <td className="p-4 font-black text-[#3B7EF8]">{ot.display_number}</td>
                    <td className="p-4 font-bold">{ot.title}</td>
                    <td className="p-4">
                      <span 
                        className="px-2.5 py-1 rounded-full text-[9px] font-black uppercase tracking-wide border"
                        style={{ 
                          backgroundColor: `${ot.status?.color || '#9ca3af'}15`, 
                          borderColor: ot.status?.color || '#9ca3af',
                          color: ot.status?.color || '#9ca3af'
                        }}
                      >
                        {ot.status?.name || 'Desconocido'}
                      </span>
                    </td>
                    <td className="p-4">
                      <span 
                        className="px-2.5 py-1 rounded-lg text-[9px] font-black uppercase tracking-wide border"
                        style={{ 
                          backgroundColor: `${ot.priority?.color || '#9ca3af'}15`, 
                          borderColor: ot.priority?.color || '#9ca3af',
                          color: ot.priority?.color || '#9ca3af'
                        }}
                      >
                        {ot.priority?.name || 'Desconocido'}
                      </span>
                    </td>
                    <td className="p-4 font-bold text-slate-500">{ot.type?.name || 'Correctivo'}</td>
                    <td className="p-4 text-slate-500 truncate max-w-[150px]">{ot.location || 'No especificada'}</td>
                    <td className="p-4 font-black">
                      <span className="text-[#10B981]">${Number(ot.actual_cost).toFixed(0)}</span>
                      <span className="text-slate-500 text-[10px] font-bold"> / ${Number(ot.estimated_cost).toFixed(0)}</span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>

      {/* Drawer lateral deslizable de detalles */}
      {selectedOrderId && (
        <WorkOrderDrawer 
          orderId={selectedOrderId} 
          onClose={() => { setSelectedOrderId(null); refetch(); }} 
        />
      )}
    </div>
  );
}
