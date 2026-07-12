'use client';

import { useState, useEffect, useRef, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { 
  CheckSquare, 
  Terminal, Home, PieChart, 
  ChevronRight, Target, Activity, Cpu, Box
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

const RECENT_KEY = 'mantenix_recent_search_v2';

export default function SearchModal({ isOpen, onClose, workspace }: SearchModalProps) {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<SearchResult[]>([]);
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [recentItems, setRecentItems] = useState<SearchResult[]>([]);
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);

  // Quick Actions / Commands
  const QUICK_ACTIONS: SearchResult[] = useMemo(() => [
    { id: 'act-1', title: 'Dashboard Principal', type: 'action', path: '/dashboard', icon: Home, category: 'Navegación', description: 'Acceso a métricas globales de operación.' },
    { id: 'act-okr', title: 'Objetivos Estratégicos (OKR)', type: 'action', path: '/okrs', icon: Target, category: 'Estrategia', description: 'Monitoreo de metas a largo plazo.' },
    { id: 'act-2', title: 'Mis Tareas de Campo', type: 'action', path: '/my-work', icon: CheckSquare, category: 'Trabajo', description: 'Listado específico de mis asignaciones.' },
    { id: 'act-3', title: 'Consola Financiera', type: 'action', path: '/dashboard?view=financial', icon: PieChart, category: 'Navegación', description: 'Control de ejecución presupuestaria.' }
  ], []);

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

  // Perform Search Logic (debounced)
  useEffect(() => {
    const searchAll = async () => {
      const lowerQuery = query.toLowerCase().trim();
      if (!lowerQuery) {
        setResults(recentItems.length > 0 ? [...recentItems.map(i => ({ ...i, category: 'Recientes' })), ...QUICK_ACTIONS] : QUICK_ACTIONS);
        return;
      }

      const searchResults: SearchResult[] = [];

      // Filter Actions
      QUICK_ACTIONS.forEach(action => {
        if (action.title.toLowerCase().includes(lowerQuery)) searchResults.push(action);
      });

      // Search Boards
      workspace.folders.forEach((folder: any) => {
        folder.boards.forEach((board: any) => {
          if (board.name.toLowerCase().includes(lowerQuery)) {
            searchResults.push({
              id: board.id, title: board.name, type: 'board', path: board.path, category: 'Tableros',
              description: `Carpeta: ${folder.name}`, metadata: { site: folder.name, id: board.id }
            });
          }
        });
      });

      // Search Items (Database)
      if (lowerQuery.length >= 3) {
        const { data } = await supabase.from('items').select('id, name, groups(board_id, boards(name))').ilike('name', `%${lowerQuery}%`).limit(5);
        data?.forEach((item: any) => {
          searchResults.push({
            id: `item-${item.id}`, title: item.name, type: 'item', path: `/dashboard?id=${item.groups?.board_id}&itemId=${item.id}`,
            category: 'Tareas', description: `En tablero: ${item.groups?.boards?.name}`
          });
        });
      }

      setResults(searchResults.slice(0, 15));
      setSelectedIndex(0);
    };

    const timer = setTimeout(searchAll, 300);
    return () => clearTimeout(timer);
  }, [query, workspace, recentItems, QUICK_ACTIONS]);

  const handleSelect = (result: SearchResult) => {
    if (result.category !== 'Recientes') {
       const filtered = recentItems.filter(i => i.id !== result.id).slice(0, 4);
       const newRecents = [result, ...filtered];
       setRecentItems(newRecents);
       localStorage.setItem(RECENT_KEY, JSON.stringify(newRecents));
    }
    if (result.action) result.action();
    else if (result.path) router.push(result.path);
    onClose();
  };

  // Keyboard navigation
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (!isOpen) return;
      if (e.key === 'ArrowDown') { e.preventDefault(); setSelectedIndex(prev => (prev < results.length - 1 ? prev + 1 : prev)); }
      else if (e.key === 'ArrowUp') { e.preventDefault(); setSelectedIndex(prev => (prev > 0 ? prev - 1 : prev)); }
      else if (e.key === 'Enter' && results[selectedIndex]) { e.preventDefault(); handleSelect(results[selectedIndex]); }
      else if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, results, selectedIndex, onClose]);

  const groupedResults = results.reduce((acc, result) => {
    const category = result.category || 'Otros';
    if (!acc[category]) acc[category] = [];
    acc[category].push(result);
    return acc;
  }, {} as Record<string, SearchResult[]>);

  const currentSelection = results[selectedIndex];

  return (
    <AnimatePresence>
      {isOpen && (
        <div className="fixed inset-0 z-[120] flex items-start justify-center pt-24 px-4 overflow-hidden">
          <motion.div 
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="fixed inset-0 bg-[var(--bg-primary)]/90 backdrop-blur-md"
            onClick={onClose}
          />

          <motion.div
            initial={{ opacity: 0, scale: 0.98, y: -20 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.98, y: -20 }}
            className="w-full max-w-5xl bg-[var(--bg-primary)] rounded-[40px] shadow-[0_40px_150px_rgba(0,0,0,0.9)] border border-[var(--border-color)] overflow-hidden relative z-10 flex h-[620px]"
          >
            {/* Search Input & Results */}
            <div className="flex-1 flex flex-col border-r border-[var(--border-color)] bg-gradient-to-br from-[#161B30] to-[#0C0F1A]">
              <div className="p-10 border-b border-[var(--border-color)] flex items-center relative overflow-hidden">
                <div className="absolute top-0 right-0 w-64 h-x64 bg-[#3B7EF8]/10 blur-[100px] pointer-events-none" />
                <div className="w-16 h-16 rounded-2xl bg-[#3B7EF8]/10 flex items-center justify-center mr-6 border border-[#3B7EF8]/20 shadow-2xl">
                  <Terminal className="text-[#3B7EF8] w-8 h-8" />
                </div>
                <div className="flex flex-col flex-1">
                   <span className="text-[10px] font-black uppercase tracking-[0.5em] text-[#3B7EF8] mb-2">Search Input Ready</span>
                   <input
                     ref={inputRef}
                     value={query}
                     onChange={(e) => setQuery(e.target.value)}
                     placeholder="EXECUTE SEARCH COMMAND..."
                     className="bg-transparent border-none outline-none text-2xl font-black text-white italic tracking-tighter placeholder:text-slate-800 w-full"
                   />
                </div>
              </div>

              <div className="flex-1 overflow-y-auto p-10 space-y-10 custom-scrollbar">
                {results.length === 0 ? (
                  <div className="flex flex-col items-center justify-center h-full opacity-20">
                    <Activity size={80} className="text-slate-500 mb-6 animate-pulse" />
                    <p className="text-xs font-black uppercase tracking-[0.5em]">No Data Cached</p>
                  </div>
                ) : (
                  Object.entries(groupedResults).map(([category, items]) => (
                    <div key={category}>
                      <div className="px-4 text-[10px] font-black text-slate-600 uppercase tracking-[0.3em] mb-6 flex items-center justify-between">
                         <div className="flex items-center gap-3">
                            <div className="w-1 h-3 bg-[#3B7EF8] rounded-full" />
                            {category}
                         </div>
                         <span className="text-[9px] font-mono text-slate-800">{items.length} RESULTS</span>
                      </div>
                      <div className="space-y-2">
                        {items.map((res) => {
                          const globalIndex = results.indexOf(res);
                          const isSelected = globalIndex === selectedIndex;
                          const Icon = res.icon || (res.type === 'board' ? Box : CheckSquare);

                          return (
                            <button
                              key={res.id}
                              onMouseEnter={() => setSelectedIndex(globalIndex)}
                              onClick={() => handleSelect(res)}
                              className={`w-full text-left px-6 py-4 rounded-2xl flex items-center justify-between transition-all duration-300 relative group ${
                                isSelected ? 'bg-[#3B7EF8] text-white shadow-[0_0_30px_rgba(59,126,248,0.4)] scale-[1.02] z-10' : 'bg-slate-500/5 hover:bg-white/10 text-slate-400'
                              }`}
                            >
                              <div className="flex items-center gap-6">
                                <Icon size={20} className={isSelected ? 'text-white' : 'text-slate-600'} />
                                <div className="flex flex-col">
                                   <p className={`text-sm font-black uppercase tracking-tight ${isSelected ? 'text-white italic' : 'text-[var(--text-primary)]'}`}>{res.title}</p>
                                   <p className={`text-[10px] font-bold tracking-widest uppercase opacity-60`}>{res.type}</p>
                                </div>
                              </div>
                              {isSelected && <ChevronRight size={18} className="animate-bounce-x" />}
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>

            {/* Right Preview Detail (Industrial Panel) */}
            <div className="hidden md:flex w-[380px] bg-[var(--bg-secondary)]/50 flex-col relative overflow-hidden p-10">
               <AnimatePresence mode="wait">
                  {currentSelection ? (
                    <motion.div 
                      key={currentSelection.id} initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -20 }}
                      className="flex flex-col h-full"
                    >
                       <div className="w-20 h-20 rounded-3xl bg-[#3B7EF8]/10 flex items-center justify-center mb-10 border border-[#3B7EF8]/20 relative group overflow-hidden">
                          <div className="absolute inset-x-0 top-0 h-1 bg-[#3B7EF8]/50 blur-sm" />
                          {currentSelection.icon ? <currentSelection.icon size={36} className="text-[#3B7EF8]" /> : <Box size={36} className="text-[#3B7EF8]" />}
                       </div>
                       
                       <div className="mb-10">
                          <span className="text-[10px] font-black uppercase tracking-[0.5em] text-[#3B7EF8] mb-2 block">Data Detail</span>
                          <h2 className="text-2xl font-black text-white leading-none uppercase italic tracking-tighter">{currentSelection.title}</h2>
                       </div>

                       <div className="industrial-card p-6 rounded-3xl space-y-6">
                          <div className="flex flex-col">
                             <span className="text-[9px] font-black text-slate-600 uppercase tracking-widest mb-2">Meta Descriptor</span>
                             <p className="text-xs font-bold text-slate-400 leading-relaxed italic">{currentSelection.description || 'System generated identifier.'}</p>
                          </div>
                          
                          {currentSelection.type === 'board' && (
                            <div className="flex flex-col gap-4">
                               <div className="h-1 bg-slate-500/5 rounded-full overflow-hidden">
                                  <motion.div initial={{ width: 0 }} animate={{ width: '65%' }} className="h-full bg-[#3B7EF8]" />
                               </div>
                               <div className="flex justify-between items-center text-[10px] font-black uppercase tracking-widest text-slate-500">
                                  <span>Progreso</span>
                                  <span className="text-white">65% EST</span>
                               </div>
                            </div>
                          )}
                       </div>

                       <div className="mt-auto flex flex-col gap-4">
                          <div className="p-4 bg-emerald-500/10 rounded-2xl border border-emerald-500/20 flex items-center justify-between">
                             <div className="flex items-center gap-3">
                                <Activity size={14} className="text-emerald-500" />
                                <span className="text-[10px] font-black text-emerald-500 uppercase tracking-widest">Live Connect</span>
                             </div>
                             <div className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse outline outline-offset-2 outline-emerald-500/30" />
                          </div>
                          <button onClick={() => handleSelect(currentSelection)} className="w-full py-5 bg-[#3B7EF8] text-white rounded-2xl text-xs font-black uppercase tracking-[0.5em] transition-all hover:scale-[1.02] shadow-[0_15px_30px_rgba(59,126,248,0.3)]">
                             EJECUTAR
                          </button>
                       </div>
                    </motion.div>
                  ) : (
                    <div className="flex flex-col items-center justify-center h-full opacity-10">
                       <Cpu size={120} className="text-slate-500 mb-6" />
                       <span className="text-xs font-black uppercase tracking-[1em]">NO_INPUT</span>
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
