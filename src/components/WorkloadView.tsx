'use client';

import { useState, useEffect, useMemo, useCallback } from 'react';
import { 
  Users, BarChart3, AlertCircle, 
  CheckCircle2, Clock, Loader2, Info
} from 'lucide-react';
import { supabase } from '@/lib/supabaseClient';
import { isActivityItem } from '@/utils/itemUtils';

interface PersonStats {
  name: string;
  total: number;
  done: number;
  working: number;
  stuck: number;
  pending: number;
}

interface ItemWithValues {
  name: string;
  values: Record<string, string | number | any>;
}

export default function WorkloadView() {
  const [stats, setStats] = useState<PersonStats[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchStats = useCallback(async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('items')
        .select('*');

      if (error) throw error;

      if (data) {
        const counts: Record<string, PersonStats> = {};

        (data as any[]).forEach((item) => {
          if (!isActivityItem(item)) return;
          
          const vals = item.values || {};
          // Find the assigned person
          const person = Object.entries(vals).find(([k, v]) => {
             return typeof v === 'string' && v.length > 3 && 
                    !['Done', 'Working on it', 'Stuck', 'Not Started', 'Alta', 'Media', 'Baja', 'Crítica'].includes(v) &&
                    !['M2', 'Gl', 'Un', 'M3', 'Kg'].includes(v);
          })?.[1] as string || 'Sin asignar';

          if (!counts[person]) {
            counts[person] = { name: person, total: 0, done: 0, working: 0, stuck: 0, pending: 0 };
          }

          const status = (vals.status as string) || 'Not Started';
          counts[person].total++;
          if (status === 'Done') counts[person].done++;
          else if (status === 'Working on it') counts[person].working++;
          else if (status === 'Stuck') counts[person].stuck++;
          else counts[person].pending++;
        });

        const sortedStats = Object.values(counts).sort((a, b) => b.total - a.total);
        setStats(sortedStats);
      }
    } catch (err) {
      console.error("Error fetching workload stats:", err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchStats();
  }, [fetchStats]);

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center py-20 bg-slate-50/50 rounded-2xl border-2 border-dashed border-slate-200">
        <Loader2 className="w-8 h-8 text-primary animate-spin mb-4" />
        <p className="text-slate-500 font-medium">Analizando carga de trabajo...</p>
      </div>
    );
  }

  return (
    <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <div className="bg-white p-6 rounded-2xl border border-slate-100 shadow-sm flex items-center gap-4">
          <div className="w-12 h-12 bg-indigo-50 rounded-xl flex items-center justify-center text-indigo-600">
            <Users size={24} />
          </div>
          <div>
            <p className="text-xs font-bold text-slate-400 uppercase tracking-wider">Total Equipo</p>
            <p className="text-2xl font-black text-slate-800">{stats.length}</p>
          </div>
        </div>
        
        <div className="bg-white p-6 rounded-2xl border border-slate-100 shadow-sm flex items-center gap-4">
          <div className="w-12 h-12 bg-emerald-50 rounded-xl flex items-center justify-center text-emerald-600">
            <CheckCircle2 size={24} />
          </div>
          <div>
            <p className="text-xs font-bold text-slate-400 uppercase tracking-wider">Tareas Listas</p>
            <p className="text-2xl font-black text-slate-800">{stats.reduce((acc, s) => acc + s.done, 0)}</p>
          </div>
        </div>

        <div className="bg-white p-6 rounded-2xl border border-slate-100 shadow-sm flex items-center gap-4">
          <div className="w-12 h-12 bg-rose-50 rounded-xl flex items-center justify-center text-rose-600">
            <AlertCircle size={24} />
          </div>
          <div>
            <p className="text-xs font-bold text-slate-400 uppercase tracking-wider">Tareas Bloqueadas</p>
            <p className="text-2xl font-black text-slate-800">{stats.reduce((acc, s) => acc + s.stuck, 0)}</p>
          </div>
        </div>
      </div>

      <div className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden">
        <div className="p-6 border-b border-slate-50 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <BarChart3 className="text-primary" size={20} />
            <h3 className="font-bold text-slate-800">Distribución por Persona</h3>
          </div>
          <div className="flex items-center gap-4 text-[10px] font-bold text-slate-400 uppercase">
             <div className="flex items-center gap-1.5"><div className="w-2 h-2 rounded-full bg-emerald-500" /> Listo</div>
             <div className="flex items-center gap-1.5"><div className="w-2 h-2 rounded-full bg-amber-500" /> Proceso</div>
             <div className="flex items-center gap-1.5"><div className="w-2 h-2 rounded-full bg-rose-500" /> Detenido</div>
             <div className="flex items-center gap-1.5"><div className="w-2 h-2 rounded-full bg-slate-200" /> Inicio</div>
          </div>
        </div>

        <div className="p-6 space-y-8">
          {stats.map((person) => {
            const doneWidth = (person.done / person.total) * 100;
            const workingWidth = (person.working / person.total) * 100;
            const stuckWidth = (person.stuck / person.total) * 100;
            const pendingWidth = (person.pending / person.total) * 100;

            return (
              <div key={person.name} className="space-y-3 group">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className="w-8 h-8 rounded-full bg-slate-100 flex items-center justify-center text-[10px] font-black text-slate-500 ring-2 ring-white shadow-sm transition-all group-hover:scale-110 group-hover:shadow-md">
                      {person.name.charAt(0)}
                    </div>
                    <div>
                      <p className="text-sm font-bold text-slate-700 tracking-tight">{person.name}</p>
                      <p className="text-[10px] text-slate-400 font-medium">{person.total} tareas asignadas en total</p>
                    </div>
                  </div>
                  <div className="text-right">
                    <p className="text-xs font-black text-slate-800">{Math.round((person.done / person.total) * 100)}%</p>
                    <p className="text-[9px] text-slate-400 font-bold uppercase">Completado</p>
                  </div>
                </div>

                <div className="h-3 w-full bg-slate-100 rounded-full overflow-hidden flex shadow-inner">
                  <div 
                    title={`${person.done} Listas`}
                    className="h-full bg-emerald-500 transition-all duration-1000 ease-out hover:brightness-110" 
                    style={{ width: `${doneWidth}%` }} 
                  />
                  <div 
                    title={`${person.working} En proceso`}
                    className="h-full bg-amber-500 transition-all duration-1000 ease-out hover:brightness-110 delay-100" 
                    style={{ width: `${workingWidth}%` }} 
                  />
                  <div 
                    title={`${person.stuck} Detenidas`}
                    className="h-full bg-rose-500 transition-all duration-1000 ease-out hover:brightness-110 delay-200" 
                    style={{ width: `${stuckWidth}%` }} 
                  />
                  <div 
                    title={`${person.pending} Sin iniciar`}
                    className="h-full bg-slate-200 transition-all duration-1000 ease-out hover:brightness-110 delay-300" 
                    style={{ width: `${pendingWidth}%` }} 
                  />
                </div>
                
                <div className="flex gap-4 pt-1">
                  <div className="flex items-center gap-1">
                    <Clock size={12} className="text-slate-300" />
                    <span className="text-[10px] font-bold text-slate-500">{person.working + person.stuck + person.pending} Pendientes</span>
                  </div>
                  {person.stuck > 0 && (
                     <div className="flex items-center gap-1 text-rose-500">
                       <AlertCircle size={12} />
                       <span className="text-[10px] font-bold uppercase">{person.stuck} Alertas</span>
                     </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
        
        <div className="p-4 bg-slate-50/50 border-t border-slate-50 flex items-center gap-2">
            <Info size={14} className="text-slate-400" />
            <p className="text-[10px] font-medium text-slate-400 italic">Los datos se calculan automáticamente basándose en las asignaciones de todos los tableros activos.</p>
        </div>
      </div>
    </div>
  );
}
