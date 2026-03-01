'use client';

import { useState, useEffect, useRef, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { 
  Search, X, Layout, CheckSquare, ArrowRight, 
  Terminal, Home, PieChart, LogOut, Megaphone, Plus, Users,
  Clock, Sparkles, ChevronRight, Info, AlertCircle, Target
} from 'lucide-react';
import { useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabaseClient';

interface SearchResult {
  id: string | number;
  title: string;
  type: 'board' | 'item' | 'action';
  path?: string;
  action?: () => void;
  category?: string;
  icon?: any;
  description?: string;
  metadata?: any;
}

interface SearchModalProps {
  isOpen: boolean;
  onClose: () => void;
  workspace: any;
}

const RECENT_KEY = 'mantenix_recent_search';

export default function SearchModal({ isOpen, onClose, workspace }: SearchModalProps) {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<SearchResult[]>([]);
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [recentItems, setRecentItems] = useState<SearchResult[]>([]);
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);

  // Quick Actions / Commands
  const QUICK_ACTIONS: SearchResult[] = useMemo(() => [
    { 
      id: 'act-1', title: 'Ir a Inicio', type: 'action', path: '/dashboard', icon: Home, category: 'Navegación',
      description: 'Accede al tablero principal y resumen general de actividades.'
    },
    { 
      id: 'act-okr', title: 'Gestión de OKRs', type: 'action', path: '/okrs', icon: Target, category: 'Estrategia',
      description: 'Define y monitorea objetivos estratégicos vinculados al progreso operativo.'
    },
    { 
      id: 'act-2', title: 'Ver Mis Tareas', type: 'action', path: '/my-work', icon: CheckSquare, category: 'Trabajo',
      description: 'Listado personalizado de todas las tareas asignadas a tu usuario.'
    },
    { 
      id: 'act-3', title: 'Control de Costos', type: 'action', path: '/dashboard?view=financial', icon: PieChart, category: 'Navegación',
      description: 'Análisis financiero detallado, presupuestos y ejecución de rubros.'
    },
    { 
      id: 'act-4', title: 'Reportar Novedad', type: 'action', action: () => { /* Logic in layout triggers this via state/event */ }, icon: Megaphone, category: 'Acciones',
      description: 'Registra incidencias, carga fotos y deja notas sobre el estado del sitio.'
    },
    { 
      id: 'act-5', title: 'Personal y Recursos', type: 'action', path: '/projects', icon: Users, category: 'Administración',
      description: 'Gestiona el equipo de trabajo, roles y asignación de recursos.'
    },
    { 
      id: 'act-6', title: 'Cerrar Sesión', type: 'action', action: async () => { await supabase.auth.signOut(); router.push('/login'); }, icon: LogOut, category: 'Cuenta',
      description: 'Finaliza tu sesión actual de forma segura.'
    },
  ], [router]);

  // Load Recents
  useEffect(() => {
    const saved = localStorage.getItem(RECENT_KEY);
    if (saved) {
      try { setRecentItems(JSON.parse(saved)); } catch (e) { console.error(e); }
    }
  }, []);

  useEffect(() => {
    if (isOpen) {
      setTimeout(() => inputRef.current?.focus(), 100);
      setQuery('');
      setSelectedIndex(0);
    }
  }, [isOpen]);

  // Perform Search
  useEffect(() => {
    const searchAll = async () => {
      const lowerQuery = query.toLowerCase().trim();
      
      if (!lowerQuery) {
        setResults(recentItems.length > 0 ? [...recentItems.map(i => ({ ...i, category: 'Recientes' })), ...QUICK_ACTIONS.slice(0, 3)] : QUICK_ACTIONS);
        return;
      }

      const searchResults: SearchResult[] = [];

      // 1. Search Actions
      QUICK_ACTIONS.forEach(action => {
        if (action.title.toLowerCase().includes(lowerQuery) || action.category?.toLowerCase().includes(lowerQuery)) {
          searchResults.push(action);
        }
      });

      // 2. Search Boards (from workspace)
      workspace.folders.forEach((folder: any) => {
        folder.boards.forEach((board: any) => {
          if (board.name.toLowerCase().includes(lowerQuery)) {
            searchResults.push({
              id: board.id,
              title: board.name,
              type: 'board',
              path: board.path,
              category: 'Tableros',
              description: `Ubicado en la carpeta "${folder.name}".`,
              metadata: { site: folder.name, id: board.id }
            });
          }
        });
      });

      // 3. Global Search Items (Tasks) across all boards in DB
      if (lowerQuery.length >= 3) {
        try {
          const { data: items, error } = await supabase
            .from('items')
            .select(`
              id,
              name,
              item_type,
              groups (
                board_id,
                title,
                boards (name)
              )
            `)
            .ilike('name', `%${lowerQuery}%`)
            .is('parent_id', null) // Only parent items for global search
            .limit(5);

          if (!error && items) {
            items.forEach((item: any) => {
              const boardName = item.groups?.boards?.name || 'Desconocido';
              searchResults.push({
                id: `item-${item.id}`,
                title: item.name,
                type: 'item',
                path: `/dashboard?id=${item.groups?.board_id}&itemId=${item.id}`,
                category: 'Tareas',
                description: `Perteneciente al tablero "${boardName}" > grupo "${item.groups?.title}".`,
                metadata: { boardId: item.groups?.board_id, boardName }
              });
            });
          }
        } catch (e) {
          console.error("Item search error:", e);
        }
      }

      setResults(searchResults.slice(0, 15));
      setSelectedIndex(0);
    };

    const timer = setTimeout(searchAll, 300);
    return () => clearTimeout(timer);
  }, [query, workspace, recentItems, QUICK_ACTIONS]);

  const addToRecent = (item: SearchResult) => {
    const filtered = recentItems.filter(i => i.id !== item.id).slice(0, 4);
    const newRecents = [item, ...filtered];
    setRecentItems(newRecents);
    localStorage.setItem(RECENT_KEY, JSON.stringify(newRecents));
  };

  const handleSelect = (result: SearchResult) => {
    addToRecent(result);
    if (result.action) {
      result.action();
      onClose();
    } else if (result.path && result.path !== '#') {
      router.push(result.path);
      onClose();
    }
  };

  // Keyboard Navigation
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (!isOpen) return;

      if (e.key === 'ArrowDown') {
        e.preventDefault();
        setSelectedIndex(prev => (prev < results.length - 1 ? prev + 1 : prev));
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        setSelectedIndex(prev => (prev > 0 ? prev - 1 : prev));
      } else if (e.key === 'Enter' && results[selectedIndex]) {
        e.preventDefault();
        handleSelect(results[selectedIndex]);
      } else if (e.key === 'Escape') {
        onClose();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, results, selectedIndex, onClose]);

  // Group results by category
  const groupedResults = results.reduce((acc, result) => {
    const category = result.category || 'Otros';
    if (!acc[category]) acc[category] = [];
    acc[category].push(result);
    return acc;
  }, {} as Record<string, SearchResult[]>);

  const [boardStats, setBoardStats] = useState<any>(null);
  const [loadingStats, setLoadingStats] = useState(false);
  const currentSelection = results[selectedIndex];

  // Fetch Board Stats when selected
  useEffect(() => {
    const fetchStats = async () => {
      if (!currentSelection || currentSelection.type !== 'board' || !currentSelection.metadata?.id) {
        setBoardStats(null);
        return;
      }

      setLoadingStats(true);
      try {
        const boardId = currentSelection.metadata.id;
        
        // Get all items for this board
        const { data: groups, error } = await supabase
          .from('groups')
          .select('id, items(id, values)')
          .eq('board_id', boardId);

        if (error) throw error;

        let totalItems = 0;
        let doneItems = 0;

        groups?.forEach(g => {
          g.items?.forEach((item: any) => {
            totalItems++;
            const statusV = item.values?.status || item.values?.Estado;
            if (statusV === 'Done' || statusV === 'Completado' || statusV === 'Listo') {
              doneItems++;
            }
          });
        });

        const progress = totalItems > 0 ? Math.round((doneItems / totalItems) * 100) : 0;

        setBoardStats({
          total: totalItems,
          done: doneItems,
          pending: totalItems - doneItems,
          progress
        });
      } catch (e) {
        console.error("Stats fetch error:", e);
      } finally {
        setLoadingStats(false);
      }
    };

    const timer = setTimeout(fetchStats, 400); // Debounce
    return () => clearTimeout(timer);
  }, [currentSelection]);

  return (
    <AnimatePresence>
      {isOpen && (
        <div className="fixed inset-0 z-[100] flex items-start justify-center pt-20 px-4">
          <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-slate-900/40 backdrop-blur-sm"
            onClick={onClose}
          />

          <motion.div
            initial={{ opacity: 0, scale: 0.98, y: -10 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.98, y: -10 }}
            className="w-full max-w-4xl bg-white/95 backdrop-blur-xl rounded-[2.5rem] shadow-[0_32px_128px_-16px_rgba(0,0,0,0.3)] border border-white/40 overflow-hidden relative z-10 flex h-[600px]"
          >
            {/* Left Column: Search & Results */}
            <div className="flex-1 flex flex-col min-w-0 border-r border-slate-100">
              <div className="p-6 border-b border-slate-100 flex items-center bg-white/50">
                <div className="w-12 h-12 rounded-2xl bg-primary/10 flex items-center justify-center mr-4 shadow-sm border border-primary/5">
                  <Terminal className="w-6 h-6 text-primary" />
                </div>
                <input
                  ref={inputRef}
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder="Escribe un comando o busca..."
                  className="flex-1 bg-transparent border-none outline-none text-xl font-bold text-slate-800 placeholder:text-slate-300"
                />
                {!query && <div className="hidden md:flex items-center gap-2 mr-2">
                   <Sparkles className="w-4 h-4 text-amber-400 animate-pulse" />
                   <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Inteligente</span>
                </div>}
              </div>

              <div className="flex-1 overflow-y-auto p-4 custom-scrollbar">
                {results.length === 0 ? (
                  <div className="h-full flex flex-col items-center justify-center p-8 text-center">
                    <div className="w-20 h-20 bg-slate-50 rounded-full flex items-center justify-center mb-6">
                      <Search className="w-10 h-10 text-slate-200" />
                    </div>
                    <p className="text-lg font-bold text-slate-400">Sin resultados</p>
                    <p className="text-sm text-slate-300">Prueba con otras palabras o busca un tablero.</p>
                  </div>
                ) : (
                  Object.entries(groupedResults).map(([category, items]) => (
                    <div key={category} className="mb-6 last:mb-0">
                      <div className="px-4 py-2 text-[10px] font-black text-slate-400 uppercase tracking-[0.25em] mb-2 flex items-center gap-2">
                         {category === 'Recientes' && <Clock size={12} />}
                         {category}
                      </div>
                      <div className="space-y-1">
                        {items.map((res) => {
                          const globalIndex = results.indexOf(res);
                          const isSelected = globalIndex === selectedIndex;
                          const Icon = res.icon || (res.type === 'board' ? Layout : CheckSquare);

                          return (
                            <button
                              key={res.id}
                              onMouseEnter={() => setSelectedIndex(globalIndex)}
                              onClick={() => handleSelect(res)}
                              className={`w-full text-left px-4 py-3.5 rounded-2xl flex items-center justify-between group transition-all duration-300 relative ${
                                isSelected 
                                  ? 'bg-primary text-white shadow-xl shadow-primary/25 scale-[1.01] z-10' 
                                  : 'hover:bg-slate-50 text-slate-600'
                              }`}
                            >
                              <div className="flex items-center min-w-0">
                                <div className={`w-10 h-10 rounded-xl flex items-center justify-center mr-4 transition-all duration-500 shadow-sm ${
                                  isSelected ? 'bg-white/20' : 'bg-white border border-slate-100 text-slate-400 group-hover:scale-110'
                                }`}>
                                  <Icon size={20} />
                                </div>
                                <div className="truncate">
                                  <p className={`text-sm font-black truncate ${isSelected ? 'text-white' : 'text-slate-800'}`}>{res.title}</p>
                                  <p className={`text-[9px] font-bold uppercase tracking-wider ${isSelected ? 'text-white/70' : 'text-slate-400'}`}>
                                     {res.category === 'Recientes' ? res.type : res.category}
                                  </p>
                                </div>
                              </div>
                              <div className={`flex items-center gap-3 transition-opacity duration-300 flex-shrink-0 ${isSelected ? 'opacity-100' : 'opacity-0'}`}>
                                 <span className="text-[10px] font-bold uppercase tracking-widest hidden sm:inline">Seleccionar</span>
                                 <div className="p-1 bg-white/20 rounded-lg">
                                    <ChevronRight size={14} />
                                 </div>
                              </div>
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>

            {/* Right Column: Preview Panel (Hidden on mobile) */}
            <div className="hidden md:flex w-[320px] bg-slate-50/50 flex-col border-l border-white/50 relative overflow-hidden">
               <AnimatePresence mode="wait">
                   {currentSelection ? (
                    <motion.div 
                      key={currentSelection.id}
                      initial={{ opacity: 0, x: 20 }}
                      animate={{ opacity: 1, x: 0 }}
                      exit={{ opacity: 0, x: -20 }}
                      transition={{ duration: 0.2 }}
                      className="p-8 h-full flex flex-col"
                    >
                       <div className="flex-1 overflow-y-auto custom-scrollbar pr-2">
                          <div className={`w-16 h-16 rounded-[1.5rem] flex items-center justify-center mb-6 shadow-xl transition-all duration-500 ${
                            currentSelection.type === 'action' ? 'bg-indigo-600 text-white shadow-indigo-200' : 
                            currentSelection.type === 'item' ? 'bg-amber-500 text-white shadow-amber-200' :
                            'bg-emerald-500 text-white shadow-emerald-200'
                          }`}>
                             {currentSelection.icon ? <currentSelection.icon size={32} /> : (
                               currentSelection.type === 'board' ? <Layout size={32} /> : 
                               currentSelection.type === 'item' ? <CheckSquare size={32} /> :
                               <Terminal size={32} />
                             )}
                          </div>
                          
                          <h2 className="text-xl font-black text-slate-800 leading-tight mb-2">{currentSelection.title}</h2>
                          <div className="flex items-center gap-2 mb-6">
                             <div className={`px-2 py-0.5 rounded-full text-[9px] font-bold uppercase tracking-widest ${
                               currentSelection.type === 'action' ? 'bg-indigo-50 text-indigo-600' : 
                               currentSelection.type === 'item' ? 'bg-amber-50 text-amber-600' :
                               'bg-emerald-50 text-emerald-600'
                             }`}>
                                {currentSelection.type === 'board' ? 'Tablero' : currentSelection.type === 'item' ? 'Tarea' : 'Acción'}
                             </div>
                             {currentSelection.metadata?.site && (
                                <span className="text-[10px] font-bold text-slate-400">@ {currentSelection.metadata.site}</span>
                             )}
                             {currentSelection.metadata?.boardName && (
                                <span className="text-[10px] font-bold text-slate-400">en {currentSelection.metadata.boardName}</span>
                             )}
                          </div>

                          <div className="space-y-4">
                             <div className="p-4 bg-white/60 rounded-2xl border border-white shadow-sm">
                                <div className="flex items-center gap-2 text-slate-400 mb-2">
                                   <Info size={14} />
                                   <span className="text-[10px] font-black uppercase tracking-widest">Información</span>
                                </div>
                                <p className="text-xs font-medium text-slate-600 leading-relaxed">
                                   {currentSelection.description || 'No hay descripción detallada para este elemento.'}
                                </p>
                             </div>

                             {currentSelection.type === 'board' && boardStats && (
                                <div className="grid grid-cols-2 gap-3">
                                   <div className="p-3 bg-emerald-50/50 rounded-xl border border-emerald-100/50">
                                      <p className="text-[9px] font-bold text-emerald-600 uppercase mb-1">Progreso</p>
                                      <p className="text-xl font-black text-emerald-700">{boardStats.progress}%</p>
                                   </div>
                                   <div className="p-3 bg-slate-100/50 rounded-xl border border-slate-200/50">
                                      <p className="text-[9px] font-bold text-slate-500 uppercase mb-1">Tareas</p>
                                      <p className="text-xl font-black text-slate-700">{boardStats.total}</p>
                                   </div>
                                </div>
                             )}

                             {loadingStats && (
                                <div className="flex items-center justify-center p-4">
                                   <div className="w-5 h-5 border-2 border-primary border-t-transparent rounded-full animate-spin"></div>
                                </div>
                             )}

                             {currentSelection.type === 'item' && (
                                <div className="p-4 bg-amber-50/50 rounded-2xl border border-amber-100/50 shadow-sm">
                                   <div className="flex items-center gap-2 text-amber-600 mb-2">
                                      <Sparkles size={14} />
                                      <span className="text-[10px] font-black uppercase tracking-widest">Navegación Rápida</span>
                                   </div>
                                   <p className="text-[11px] font-bold text-amber-700">Esta acción te llevará directamente al tablero y resaltará la tarea.</p>
                                </div>
                             )}
                          </div>
                       </div>

                       <div className="pt-8 border-t border-slate-100">
                          <p className="text-[10px] font-black text-slate-300 uppercase tracking-widest mb-3">Acciones Disponibles</p>
                          <div className="flex gap-2">
                             <div className="flex-1 py-2 px-3 bg-white rounded-xl border border-slate-100 flex items-center justify-between shadow-sm">
                                <span className="text-[10px] font-bold text-slate-500">Ejecutar</span>
                                <kbd className="text-[9px] font-black px-1.5 py-0.5 bg-slate-50 border rounded text-slate-400">↵</kbd>
                             </div>
                          </div>
                       </div>
                    </motion.div>
                  ) : (
                    <div className="flex flex-col items-center justify-center h-full p-8 text-center opacity-30 grayscale">
                       <Terminal size={48} className="text-slate-200 mb-4" />
                       <p className="text-xs font-bold text-slate-300 uppercase tracking-[0.2em]">Selecciona un elemento para ver detalles</p>
                    </div>
                  )}
               </AnimatePresence>
            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
}
