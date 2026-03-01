'use client';

import { useState, useEffect, useMemo, useCallback } from 'react';
import { 
  ChevronLeft, ChevronRight, Filter, 
  LayoutPanelLeft, Loader2, Users, Search 
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { supabase } from '@/lib/supabaseClient';
import { useUI } from '@/contexts/UIContext';

interface CalendarTask {
  id: string | number;
  name: string;
  person: string;
  board: string;
  groupColor: string;
  status: string;
  timeline?: { from: string; to: string };
  date?: string;
}

export default function TeamCalendar() {
  const [viewDate, setViewDate] = useState(new Date());
  const [tasks, setTasks] = useState<CalendarTask[]>([]);
  const [loading, setLoading] = useState(true);
  const { sidebarOpen, setSidebarOpen } = useUI();
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedPeople, setSelectedPeople] = useState<Set<string>>(new Set());

  const fetchTasks = useCallback(async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('items')
        .select(`
          *,
          group:groups(title, color, board:boards(name))
        `)
        .order('created_at', { ascending: false });

      if (error) throw error;

      if (data) {
        // Filter tasks that have someone assigned
        const teamTasks: CalendarTask[] = data.filter((item: any) => {
          const vals = item.values || {};
          return Object.entries(vals).some(([key, val]) => {
            return typeof val === 'string' && val.length > 0 && 
                   !['Done', 'Working on it', 'Stuck', 'Not Started', 'Alta', 'Media', 'Baja', 'Crítica'].includes(val) &&
                   !['M2', 'Gl', 'Un', 'M3', 'Kg'].includes(val);
          });
        }).map((item: any) => {
          const assignedPerson = Object.entries(item.values || {}).find(([k, v]) => {
             return typeof v === 'string' && v.length > 3 && 
                    !['Done', 'Working on it', 'Stuck', 'Not Started', 'Alta', 'Media', 'Baja', 'Crítica'].includes(v) &&
                    !['M2', 'Gl', 'Un', 'M3', 'Kg'].includes(v);
          })?.[1] || 'Sin asignar';

          return {
            id: item.id,
            name: item.name,
            person: String(assignedPerson),
            board: item.group?.board?.name || 'Tablero',
            groupColor: item.group?.color || '#323338',
            status: item.values?.status || 'Not Started',
            timeline: item.values?.timeline,
            date: item.values?.date,
          };
        });

        setTasks(teamTasks);
        
        // Auto-select all people initially
        const distinctPeople = new Set(teamTasks.map(t => t.person));
        setSelectedPeople(distinctPeople);
      }
    } catch (err) {
      console.error("Error fetching team tasks:", err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchTasks();
  }, [fetchTasks]);

  const daysLabels = ['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb'];

  const calendarData = useMemo(() => {
    const year = viewDate.getFullYear();
    const month = viewDate.getMonth();
    const firstDay = new Date(year, month, 1);
    const daysInMonth = new Date(year, month + 1, 0).getDate();
    const startOffset = firstDay.getDay();

    const grid = [];
    for (let i = 0; i < 42; i++) {
      const dayNum = i - startOffset + 1;
      grid.push(dayNum > 0 && dayNum <= daysInMonth ? dayNum : null);
    }
    return grid.slice(35).every(d => d === null) ? grid.slice(0, 35) : grid;
  }, [viewDate]);

  const getItemsForDay = (day: number) => {
    if (!day) return [];
    const year = viewDate.getFullYear();
    const month = viewDate.getMonth();
    const dateStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
    // Simple date string for comparison with values.date if needed
    const displayDate = new Date(year, month, day).toLocaleDateString('en-US', { month: 'short', day: '2-digit' });

    return tasks.filter(task => {
      if (!selectedPeople.has(task.person)) return false;
      if (searchQuery && !task.name.toLowerCase().includes(searchQuery.toLowerCase())) return false;

      if (task.timeline && task.timeline.from && task.timeline.to) {
        return dateStr >= task.timeline.from && dateStr <= task.timeline.to;
      }
      
      return task.date === displayDate;
    });
  };

  const handleTogglePerson = (person: string) => {
    const newSelected = new Set(selectedPeople);
    if (newSelected.has(person)) newSelected.delete(person);
    else newSelected.add(person);
    setSelectedPeople(newSelected);
  };

  const people = useMemo(() => Array.from(new Set(tasks.map(t => t.person))), [tasks]);
  const monthName = viewDate.toLocaleDateString('es-ES', { month: 'long', year: 'numeric' });

  return (
    <div className="flex bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden h-[750px] animate-in fade-in zoom-in-95 duration-300">
      {/* Sidebar: People Filter */}
      <AnimatePresence initial={false}>
        {sidebarOpen && (
          <motion.div 
            initial={{ width: 0, opacity: 0 }}
            animate={{ width: 260, opacity: 1 }}
            exit={{ width: 0, opacity: 0 }}
            className="border-r border-slate-100 bg-slate-50/50 flex flex-col"
          >
            <div className="p-4 border-b border-slate-100 bg-white flex items-center justify-between">
              <h3 className="font-bold text-slate-700 flex items-center gap-2 text-sm uppercase tracking-wider">
                <Users size={16} className="text-primary" /> Miembros
              </h3>
              <button 
                onClick={() => setSelectedPeople(selectedPeople.size === people.length ? new Set() : new Set(people))}
                className="text-[10px] font-bold text-primary hover:bg-primary/5 px-2 py-1 rounded transition-colors"
              >
                {selectedPeople.size === people.length ? 'QUITAR' : 'TODOS'}
              </button>
            </div>
            
            <div className="p-3">
               <div className="relative">
                 <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400 w-3.5 h-3.5" />
                 <input 
                    type="text"
                    placeholder="Buscar persona..."
                    value={searchQuery}
                    onChange={e => setSearchQuery(e.target.value)}
                    className="w-full pl-8 pr-3 py-1.5 text-xs bg-white border border-slate-200 rounded-lg focus:ring-2 focus:ring-primary/20 outline-none transition-all"
                 />
               </div>
            </div>

            <div className="flex-1 overflow-y-auto p-3 space-y-1">
              {people.map(person => (
                <div 
                  key={person}
                  onClick={() => handleTogglePerson(person)}
                  className={`flex items-center p-2 rounded-lg cursor-pointer transition-all ${
                    selectedPeople.has(person) 
                      ? 'bg-white border border-slate-200 shadow-sm' 
                      : 'border border-transparent opacity-60 grayscale'
                  }`}
                >
                  <div className="w-6 h-6 rounded-full bg-slate-200 text-slate-500 flex items-center justify-center text-[10px] font-bold mr-2 ring-1 ring-slate-100">
                    {person.charAt(0)}
                  </div>
                  <span className="text-xs font-semibold text-slate-700 flex-1 truncate">{person}</span>
                  <div className="text-[10px] font-bold text-slate-400 bg-slate-100 px-1.5 py-0.5 rounded-full">
                    {tasks.filter(t => t.person === person).length}
                  </div>
                </div>
              ))}
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Main Calendar Area */}
      <div className="flex-1 flex flex-col">
        <div className="p-4 border-b border-slate-100 flex items-center justify-between bg-white bg-opacity-70 backdrop-blur-sm sticky top-0 z-10">
          <div className="flex items-center space-x-4">
              <button 
                onClick={() => setSidebarOpen(!sidebarOpen)}
                className={`p-2 rounded-lg transition-all ${sidebarOpen ? 'bg-primary/10 text-primary shadow-inner shadow-primary/5' : 'hover:bg-slate-100 text-slate-400'}`}
              >
                <LayoutPanelLeft size={20} />
              </button>
              <h2 className="text-xl font-bold text-slate-800 capitalize tracking-tight">{monthName}</h2>
              <div className="flex items-center bg-slate-100 rounded-lg p-1 shadow-inner">
                  <button onClick={() => setViewDate(new Date(viewDate.getFullYear(), viewDate.getMonth() - 1, 1))} className="p-1.5 hover:bg-white hover:rounded-md transition-all text-slate-600">
                    <ChevronLeft size={18} />
                  </button>
                  <button onClick={() => setViewDate(new Date())} className="px-3 py-1 text-[10px] font-bold text-slate-500 hover:text-primary transition-colors tracking-widest">HOY</button>
                  <button onClick={() => setViewDate(new Date(viewDate.getFullYear(), viewDate.getMonth() + 1, 1))} className="p-1.5 hover:bg-white hover:rounded-md transition-all text-slate-600">
                    <ChevronRight size={18} />
                  </button>
              </div>
          </div>
          
          {loading && <Loader2 className="w-5 h-5 text-primary animate-spin" />}
        </div>
        
        <div className="grid grid-cols-7 border-b border-slate-50 bg-slate-50/20">
          {daysLabels.map(day => (
              <div key={day} className="py-2 text-center text-[10px] font-bold text-slate-400 uppercase tracking-widest">
                  {day}
              </div>
          ))}
        </div>

        <div className="flex-1 overflow-y-auto grid grid-cols-7 auto-rows-fr">
          {calendarData.map((day, idx) => {
            const dayItems = getItemsForDay(day || 0);
            const visibleItems = dayItems.slice(0, 3);
            const remainingCount = dayItems.length - visibleItems.length;

            return (
              <div 
                key={idx} 
                className={`border-b border-r border-slate-50 p-2 min-h-[110px] transition-colors relative ${!day ? 'bg-slate-50/10' : 'bg-white hover:bg-slate-50/30'}`}
              >
                  {day && (
                      <>
                          <div className={`text-[10px] font-bold mb-2 ${
                              new Date().toDateString() === new Date(viewDate.getFullYear(), viewDate.getMonth(), day).toDateString()
                              ? 'bg-primary text-white w-5 h-5 rounded-full flex items-center justify-center shadow-md'
                              : 'text-slate-400'
                          }`}>
                            {day}
                          </div>
                          <div className="space-y-1">
                              {visibleItems.map((task) => (
                                  <div 
                                    key={task.id} 
                                    title={`${task.name} (${task.person})`}
                                    className={`text-[9px] p-1.5 rounded border border-slate-100 shadow-sm transition-all truncate font-medium text-slate-700 bg-white border-l-4`}
                                    style={{ borderLeftColor: task.groupColor }}
                                  >
                                      <div className="flex items-center gap-1">
                                        <div className={`w-1 h-1 rounded-full ${
                                          task.status === 'Done' ? 'bg-emerald-500' : 
                                          task.status === 'Stuck' ? 'bg-rose-500' : 'bg-amber-500'
                                        }`} />
                                        <span className="truncate">{task.name}</span>
                                      </div>
                                  </div>
                              ))}
                              {remainingCount > 0 && (
                                <div className="text-[8px] font-bold text-slate-400 text-center py-0.5 bg-slate-50 rounded">
                                  + {remainingCount} tareas
                                </div>
                              )}
                          </div>
                      </>
                  )}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
