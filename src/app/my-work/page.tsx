'use client';

import { 
  CheckCircle2, Clock, Calendar, 
  ChevronRight, Filter, Search, Loader2
} from 'lucide-react';
import { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import { supabase } from '@/lib/supabaseClient';
import { useAuth } from '@/contexts/AuthContext';
import { Item } from '@/types/monday';

export default function MyWorkPage() {
  const { user } = useAuth();
  const [activeTab, setActiveTab] = useState<'todo' | 'done'>('todo');
  const [searchQuery, setSearchQuery] = useState('');
  const [loading, setLoading] = useState(true);
  const [tasks, setTasks] = useState<any[]>([]);

  const userName = user?.user_metadata?.full_name || user?.email?.split('@')[0] || 'Usuario';

  const fetchMyTasks = useCallback(async () => {
    if (!user) return;
    setLoading(true);
    
    try {
      // 1. Get all items with their groups and boards
      const { data, error } = await supabase
        .from('items')
        .select(`
          *,
          group:groups(title, board:boards(name))
        `)
        .order('created_at', { ascending: false });

      if (error) throw error;

      if (data) {
        // 2. Filter items assigned to current user
        // We look for any column in 'values' that has col.type === 'people' 
        // For now, we'll check the 'person' or 'people' key in values as a heuristic
        // matching either current user name or email prefix
        const myTasks = data.filter((item: any) => {
          const vals = item.values || {};
          return Object.entries(vals).some(([key, val]) => {
            // Check if value matches userName (assignment usually stores name)
            return String(val).toLowerCase() === userName.toLowerCase();
          });
        }).map((item: any) => ({
          id: item.id,
          title: item.name,
          board: item.group?.board?.name || 'Tablero',
          group: item.group?.title || 'Grupo',
          status: item.values?.status || 'Not Started',
          priority: item.values?.priority || 'Low',
          date: item.values?.date || 'Sin fecha',
          values: item.values
        }));

        setTasks(myTasks);
      }
    } catch (err) {
      console.error("Error fetching my tasks:", err);
    } finally {
      setLoading(false);
    }
  }, [user, userName]);

  useEffect(() => {
    fetchMyTasks();
  }, [fetchMyTasks]);

  const handleUpdateStatus = async (id: string | number) => {
    const task = tasks.find(t => t.id === id);
    if (!task) return;

    const nextStatus = task.status === 'Done' ? 'Working on it' : 'Done';
    const newValues = { ...task.values, status: nextStatus };

    // Optimistic update
    setTasks(prev => prev.map(t => t.id === id ? { ...t, status: nextStatus, values: newValues } : t));

    try {
      const { error } = await supabase
        .from('items')
        .update({ values: newValues })
        .eq('id', id);
      
      if (error) throw error;
    } catch (err) {
      console.error("Error updating task status:", err);
      // Rollback if needed, but for simplicity we'll just log
      fetchMyTasks();
    }
  };

  const filteredTasks = tasks.filter(task => {
    const matchesTab = activeTab === 'done' ? task.status === 'Done' : task.status !== 'Done';
    const matchesSearch = task.title.toLowerCase().includes(searchQuery.toLowerCase()) || 
                         task.board.toLowerCase().includes(searchQuery.toLowerCase());
    return matchesTab && matchesSearch;
  });

  return (
    <div className="p-4 md:p-8 w-full max-w-[1200px] mx-auto font-sans text-slate-800">
        {/* Header */}
        <div className="mb-6 md:mb-10">
          <div className="flex items-center space-x-2 text-slate-400 text-xs mb-2">
              <Link href="/dashboard" className="hover:text-primary transition-colors">Inicio</Link>
              <ChevronRight className="w-3 h-3" />
              <span className="text-slate-600">Mis tareas</span>
          </div>
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
              <h1 className="text-2xl md:text-3xl font-bold flex items-center">
                  <CheckCircle2 className="w-8 h-8 mr-3 text-primary" />
                  Mis tareas
              </h1>
              <div className="flex flex-col sm:flex-row items-center gap-3">
                  <div className="relative w-full sm:w-64">
                      <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                      <input 
                        type="text" 
                        placeholder="Buscar en mis tareas..."
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                        className="w-full pl-9 pr-4 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary transition-all bg-white shadow-sm"
                      />
                  </div>
                  <button className="w-full sm:w-auto flex items-center justify-center px-4 py-2 text-sm font-medium text-slate-600 border border-slate-200 rounded-lg hover:bg-slate-50 transition-colors bg-white shadow-sm">
                      <Filter className="w-4 h-4 mr-2" />
                      Filtrar
                  </button>
              </div>
          </div>
        </div>

        {/* Tabs */}
        <div className="flex items-center space-x-8 border-b border-slate-200 mb-8">
            <button 
              onClick={() => setActiveTab('todo')}
              className={`pb-3 text-sm font-bold transition-all border-b-2 px-1 ${activeTab === 'todo' ? 'border-primary text-primary' : 'border-transparent text-slate-500 hover:text-slate-800'}`}
            >
              Pendientes ({tasks.filter(t => t.status !== 'Done').length})
            </button>
            <button 
              onClick={() => setActiveTab('done')}
              className={`pb-3 text-sm font-bold transition-all border-b-2 px-1 ${activeTab === 'done' ? 'border-primary text-primary' : 'border-transparent text-slate-500 hover:text-slate-800'}`}
            >
              Completadas ({tasks.filter(t => t.status === 'Done').length})
            </button>
        </div>

        {/* Task List */}
        <div className="space-y-6">
            {loading ? (
              <div className="flex flex-col items-center justify-center py-20 bg-slate-50/50 rounded-2xl border-2 border-dashed border-slate-200">
                <Loader2 className="w-8 h-8 text-primary animate-spin mb-4" />
                <p className="text-slate-500 font-medium">Cargando tus tareas...</p>
              </div>
            ) : filteredTasks.length > 0 ? (
              <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
                  <div className="hidden md:grid grid-cols-[1fr_200px_150px_100px_120px] border-b border-slate-100 bg-slate-50/50 px-6 py-3 text-[10px] font-bold text-slate-500 uppercase tracking-widest">
                      <div>Tarea</div>
                      <div>Ubicación</div>
                      <div>Estado</div>
                      <div className="text-center">Prioridad</div>
                      <div className="text-right">Fecha</div>
                  </div>
                  
                  <div className="divide-y divide-slate-100">
                      {filteredTasks.map(task => (
                          <div key={task.id} className="grid grid-cols-[1fr] md:grid-cols-[1fr_200px_150px_100px_120px] px-4 md:px-6 py-4 items-center hover:bg-slate-50/80 transition-all group gap-4 md:gap-0">
                              <div className="flex items-center">
                                  <button 
                                    onClick={() => handleUpdateStatus(task.id)}
                                    className={`w-5 h-5 rounded border-2 mr-4 transition-all flex items-center justify-center shrink-0 ${task.status === 'Done' ? 'bg-[#00c875] border-[#00c875]' : 'border-slate-300 hover:border-primary bg-white'}`}
                                  >
                                      {task.status === 'Done' && <CheckCircle2 className="w-3 h-3 text-white" />}
                                  </button>
                                  <span className={`font-semibold text-slate-700 transition-colors ${task.status === 'Done' ? 'line-through text-slate-400 font-normal' : 'group-hover:text-primary underline-offset-4'}`}>{task.title}</span>
                              </div>
                              <div className="flex flex-col md:block">
                                 <span className="md:hidden text-[9px] text-slate-400 font-bold uppercase">Ubicación</span>
                                 <div className="text-xs">
                                   <div className="font-bold text-slate-600 truncate">{task.board}</div>
                                   <div className="text-[10px] text-slate-400 font-medium truncate">{task.group}</div>
                                 </div>
                              </div>
                              <div>
                                  <span className="md:hidden text-[9px] text-slate-400 font-bold uppercase block mb-1">Estado</span>
                                  <span className={`text-[10px] px-3 py-1 rounded-full text-white font-bold inline-block w-28 text-center shadow-sm uppercase tracking-wider`} style={{ backgroundColor: task.status === 'Done' ? '#00c875' : task.status === 'Stuck' ? '#e2445c' : task.status === 'Not Started' ? '#c4c4c4' : '#fdab3d' }}>
                                      {task.status === 'Done' ? 'Listo' : 
                                       task.status === 'Working on it' ? 'En proceso' : 
                                       task.status === 'Stuck' ? 'Detenido' : 
                                       task.status === 'Not Started' ? 'Sin iniciar' : task.status}
                                  </span>
                              </div>
                              <div className="flex flex-col md:items-center">
                                  <span className="md:hidden text-[9px] text-slate-400 font-bold uppercase mb-1">Prioridad</span>
                                  <div className={`w-3 h-3 rounded-full shadow-inner ${task.priority === 'Critical' ? 'bg-black' : task.priority === 'High' ? 'bg-[#401694]' : task.priority === 'Medium' ? 'bg-[#5559df]' : 'bg-[#579bfc]'}`} title={task.priority}></div>
                              </div>
                              <div className="text-right flex flex-col md:block">
                                  <span className="md:hidden text-[9px] text-slate-400 font-bold uppercase mb-1 text-right">Fecha</span>
                                  <span className="text-xs font-medium text-slate-500">{task.date}</span>
                              </div>
                          </div>
                      ))}
                  </div>
              </div>
            ) : (
              <div className="text-center py-20 bg-slate-50/50 rounded-2xl border-2 border-dashed border-slate-200">
                  <div className="w-16 h-16 bg-white rounded-full shadow-sm flex items-center justify-center mx-auto mb-4 border border-slate-100">
                      <CheckCircle2 className="w-8 h-8 text-slate-200" />
                  </div>
                  <h3 className="text-slate-600 font-bold text-lg">{searchQuery ? 'Sin resultados' : '¡Todo listo!'}</h3>
                  <p className="text-slate-400 text-sm mt-1 max-w-[280px] mx-auto">
                    {searchQuery ? `No encontramos nada parecido a "${searchQuery}"` : 'No tienes tareas pendientes asignadas en este momento.'}
                  </p>
              </div>
            )}
        </div>
      </div>
    );
}
