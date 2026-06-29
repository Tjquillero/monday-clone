'use client';

import { Group, Column } from '@/types/monday';
import { 
  Calculator, Users, CheckCircle2, Calendar as CalendarIcon, 
  MapPin, Wand2, TrendingUp, Filter, LayoutDashboard, 
  ChevronRight, Camera, Terminal, AlertTriangle, Clock,
  MoreVertical, Plus, Settings, Search, Info, Activity,
  Maximize2, Eye, ShieldCheck, Gauge, Layers, Info as InfoIcon,
  Table2, DollarSign, GitGraph, Zap, Download, Layout,
  Star, ChevronDown, FileText, FileSpreadsheet,
  Sun, Moon, Scissors, Sprout, Wrench, Shovel, ClipboardList
} from 'lucide-react';
import { useState, useMemo, useEffect, Suspense } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useBoard, useBoardColumns, useBoardGroups } from '@/hooks/useBoardData';
import { useBoardMutations } from '@/hooks/useBoardMutations';
import { useAuth } from '@/contexts/AuthContext';
import { useQueryClient } from '@tanstack/react-query';
import { usePermissions, PERMISSIONS } from '@/hooks/usePermissions';
import { useParams, useRouter, useSearchParams } from 'next/navigation';

import BoardViewContainer from '@/components/views/BoardViewContainer';
import ExecutionViewContainer from '@/components/views/ExecutionViewContainer';
import GanttViewContainer from '@/components/views/GanttViewContainer';
import DashboardViewContainer from '@/components/views/DashboardViewContainer';
import FinancialViewContainer from '@/components/views/FinancialViewContainer';
import KanbanViewContainer from '@/components/views/KanbanViewContainer';
import ReportsViewContainer from '@/components/views/ReportsViewContainer';

import WorkOrdersContainer from '@/components/work-orders/WorkOrdersContainer';
import WeeklyPlannerContainer from '@/components/views/WeeklyPlannerContainer';

import MantenixMap from '@/components/MantenixMap';
import ItemModal from '@/components/modals/ItemModal';
import ConfirmModal from '@/components/modals/ConfirmModal';
import AutomationsModal from '@/components/modals/AutomationsModal';
import NotificationsView from '@/components/views/NotificationsView';

function DashboardContent() {
  const params = useParams();
  const searchParams = useSearchParams();
  const router = useRouter();
  const { user } = useAuth();
  const { can } = usePermissions();
  
  const rawBoardId = (params as any)?.boardId || (searchParams ? searchParams.get('boardId') : null);
  const boardId = rawBoardId || undefined;

  // 1. ALL STATES FIRST
  const [currentView, setCurrentView] = useState<'board' | 'map' | 'dashboards' | 'execution' | 'financial' | 'gantt' | 'kanban' | 'reports' | 'notifications' | 'work-orders' | 'planner'>('board');
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedGroupId, setSelectedGroupId] = useState<string | null>(null);
  const [isDarkMode, setIsDarkMode] = useState(false);
  const [isExportMenuOpen, setIsExportMenuOpen] = useState(false);
  const [isLocationMenuOpen, setIsLocationMenuOpen] = useState(false);
  const [automationsModalOpen, setAutomationsModalOpen] = useState(false);
  const [activeFilters, setActiveFilters] = useState({ 
    status: [] as string[], 
    priority: [] as string[], 
    person: [] as string[] 
  });
  const [itemModal, setItemModal] = useState<{ isOpen: boolean; selectedItem: any; initialTab?: any }>({
    isOpen: false,
    selectedItem: null
  });
  const [confirmModal, setConfirmModal] = useState<{ isOpen: boolean; title: string; message: string; onConfirm?: () => void }>({
    isOpen: false,
    title: '',
    message: ''
  });

  // 2. DATA HOOKS
  const queryClient = useQueryClient();
  const { data: board, isLoading: boardLoading, error: boardError } = useBoard(boardId);
  const { data: groups } = useBoardGroups(board?.id);
  const { data: columns } = useBoardColumns(board?.id);
  const { addItem, updateItem, deleteItem } = useBoardMutations(board?.id);

  // 3. EFFECTS
  useEffect(() => {
    const isDoodleVisible = !isDarkMode && (currentView === 'execution' || currentView === 'gantt' || currentView === 'map' || currentView === 'board');
    if (isDoodleVisible) {
      document.body.classList.add('doodle-active');
    } else {
      document.body.classList.remove('doodle-active');
    }
    return () => document.body.classList.remove('doodle-active');
  }, [isDarkMode, currentView]);

  useEffect(() => {
    const viewParam = searchParams ? searchParams.get('view') : null;
    if (viewParam && ['board', 'map', 'dashboards', 'execution', 'financial', 'gantt', 'kanban', 'reports', 'notifications', 'planner'].includes(viewParam)) {
      setCurrentView(viewParam as any);
    }
  }, [searchParams]);

  // 4. MEMOS
  const stats = useMemo(() => {
    if (!groups) return { total: 0, completed: 0, inProgress: 0 };
    const allItems = groups.flatMap(g => g.items);
    return {
      total: allItems.length,
      completed: allItems.filter(it => it.values['status'] === 'Done' || it.values['status'] === 'Completado').length,
      inProgress: allItems.filter(it => it.values['status'] === 'Working on it' || it.values['status'] === 'En Proceso').length
    };
  }, [groups]);

  const currentBoardName = board?.name || 'Cargando...';

  // 5. HANDLERS
  const openItemModal = (groupId: string, item: any, tab?: any) => {
    setItemModal({ isOpen: true, selectedItem: { groupId, item }, initialTab: tab });
  };
  const closeItemModal = () => setItemModal({ ...itemModal, isOpen: false });
  const openConfirmModal = (title: string, message: string, onConfirm: () => void) => {
    setConfirmModal({ isOpen: true, title, message, onConfirm });
  };
  const closeConfirmModal = () => setConfirmModal({ ...confirmModal, isOpen: false });
  const handleExportPDF = () => { alert('Generando PDF técnico...'); setIsExportMenuOpen(false); };
  const handleExportExcel = () => { alert('Exportando a Excel...'); setIsExportMenuOpen(false); };

  if (boardLoading) return (
    <div className={`flex h-screen items-center justify-center transition-colors duration-500 ${isDarkMode ? 'bg-[var(--bg-primary)]' : 'bg-[#fefbf6]'}`}>
      <div className="flex flex-col items-center gap-4">
        <div className="w-12 h-12 border-4 border-[#3B7EF8] border-t-transparent rounded-full animate-spin glow-blue" />
        <p className="text-[#3B7EF8] font-bold uppercase tracking-widest text-xs animate-pulse">Iniciando Mantenix...</p>
      </div>
    </div>
  );

  if (boardError) return (
    <div className="flex h-screen items-center justify-center bg-[var(--bg-primary)] p-6 text-center">
      <div className="max-w-md space-y-6">
        <div className="w-20 h-20 bg-red-900/20 rounded-full flex items-center justify-center mx-auto text-red-500 border border-red-900/40">
          <AlertTriangle className="w-10 h-10" />
        </div>
        <h2 className="text-xl font-black text-white uppercase tracking-widest italic">Enlace de Tablero Roto</h2>
        <p className="text-slate-500 text-sm">No se pudo conectar con el tablero seleccionado. Verifique su conexión o identificador.</p>
        <button onClick={() => window.location.href = '/dashboard'} className="bg-[#3B7EF8] text-white px-8 py-3 rounded-2xl font-black shadow-lg shadow-blue-500/20 transition-all active:scale-95">Reintentar Conexión</button>
      </div>
    </div>
  );

  return (
    <div className={`flex h-full flex-col transition-colors duration-500 font-sans overflow-hidden relative bg-transparent text-[var(--text-primary)]`}>
      {/* SINGLE ULTRA-COMPACT COMMAND RIBBON (Combined Header) */}
      <header className="h-[48px] border-b border-[var(--border-color)] bg-[var(--bg-secondary)]/10 flex items-center px-4 gap-4 shrink-0 z-50">
        
        {/* Left: Branding & Selector */}
        <div className="flex items-center gap-3 min-w-max">
           <div className="flex items-center gap-2">
              <Layout size={16} className="text-[#3B7EF8] shrink-0" />
              <h1 className="text-xs font-black tracking-widest uppercase italic text-[var(--text-primary)] min-w-max pr-4">{currentBoardName}</h1>
           </div>
           <Star className="w-3 h-3 text-slate-700 hover:text-amber-400 cursor-pointer" />
           <div className="h-4 w-px bg-slate-500/5" />
        </div>

        {/* Center-Left: Tabs Nav */}
        <nav className="flex bg-black/40 rounded-lg p-0.5 border border-[var(--border-color)] shadow-inner min-w-max">
          {[
            { id: 'board', label: 'Tabla', icon: Table2 },
            { id: 'execution', label: 'Ejecución', icon: Activity },
            { id: 'map', label: 'Mapa', icon: MapPin },
            { id: 'financial', label: 'Costos', icon: DollarSign },
            { id: 'gantt', label: 'Ops', icon: GitGraph },
            { id: 'work-orders', label: 'Ordenes', icon: ClipboardList },
            { id: 'planner', label: 'Planner', icon: CalendarIcon },
          ].map((tab) => {
            const isActive = currentView === tab.id;
            return (
              <button
                key={tab.id}
                onClick={() => setCurrentView(tab.id as any)}
                className={`relative flex items-center gap-2 px-3 py-1.5 rounded-md text-[9px] font-black transition-all uppercase tracking-wider ${isActive ? 'text-white' : 'text-slate-600 hover:text-slate-400'}`}
              >
                {isActive && (
                  <motion.div layoutId="activeTab" className="absolute inset-0 bg-[#3B7EF8] shadow-[0_0_10px_rgba(59,126,248,0.3)] rounded-md" transition={{ type: "spring", bounce: 0, duration: 0.4 }} />
                )}
                <tab.icon className={`w-3.5 h-3.5 relative z-10 ${isActive ? 'scale-110' : ''}`} />
                <span className="relative z-10 hidden xl:inline">{tab.label}</span>
              </button>
            );
          })}
        </nav>

        <div className="h-4 w-px bg-slate-500/5 hidden lg:block" />

        {/* Center: Search Field */}
        <div className="flex-1 max-w-sm relative group hidden md:block">
           <Search className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-slate-700 group-focus-within:text-[#3B7EF8] transition-colors" />
           <input 
             type="text" 
             placeholder="BUSCAR EN FLUJO OPERATIVO..." 
             value={searchQuery} 
             onChange={(e) => setSearchQuery(e.target.value)} 
             className="w-full bg-slate-500/5 border border-[var(--border-color)] rounded-lg pl-9 pr-4 py-1.5 text-[10px] outline-none focus:border-[#3B7EF8]/30 transition-all font-bold placeholder:text-slate-800"
           />
        </div>

        {/* Right Area: Location & Stats */}
        <div className="flex items-center gap-3 ml-auto">
           {/* Location Small */}
           <button onClick={() => setIsLocationMenuOpen(!isLocationMenuOpen)} className="flex items-center gap-2 px-3 py-1.5 bg-slate-500/5 rounded-lg border border-[var(--border-color)] text-[9px] font-black uppercase text-slate-400 hover:text-white transition-all max-w-[140px]">
             <MapPin size={12} className="text-[#3B7EF8] shrink-0" />
             <span className="truncate">{selectedGroupId ? groups?.find(g => g.id === selectedGroupId)?.title : 'Cobertura Global'}</span>
             <ChevronDown size={10} />
           </button>

           <div className="h-4 w-px bg-slate-500/5 hidden sm:block" />

           {/* Metrics Mini */}
           <div className="hidden lg:flex items-center gap-2 text-[9px] font-black uppercase bg-[#10B981]/10 px-3 py-1.5 rounded-lg border border-[#10B981]/20 text-[#10B981]">
              <TrendingUp className="w-3 h-3" />
              <span>{stats.total > 0 ? Math.round((stats.completed / stats.total) * 100) : 0}%</span>
           </div>

           {/* Quick Actions */}
           <div className="flex items-center gap-1">
              <button 
                onClick={() => setIsDarkMode(!isDarkMode)} 
                className={`p-2 rounded-xl transition-all border ${isDarkMode ? 'text-slate-600 hover:text-amber-400 border-transparent' : 'text-slate-400 hover:text-[#3B7EF8] border-slate-200'}`}
                title={isDarkMode ? 'Activar_Modo_Día' : 'Activar_Modo_Noche'}
              >
                {isDarkMode ? <Moon className="w-4 h-4" /> : <Sun className="w-4 h-4" />}
              </button>
              <button onClick={() => setAutomationsModalOpen(true)} className="p-2 text-slate-600 hover:text-amber-400 hover:bg-slate-500/5 rounded-lg transition-all" title="Auto_Ops"><Zap className="w-4 h-4" /></button>
              <div className="relative">
                <button onClick={() => setIsExportMenuOpen(!isExportMenuOpen)} className="p-2 text-slate-600 hover:text-white hover:bg-slate-500/5 rounded-lg transition-all" title="Exportar_Reporte"><Download className="w-4 h-4" /></button>
                <AnimatePresence>
                  {isExportMenuOpen && (
                    <motion.div initial={{ opacity: 0, scale: 0.95, y: 10 }} animate={{ opacity: 1, scale: 1, y: 0 }} exit={{ opacity: 0, scale: 0.95 }} className={`absolute top-10 right-0 shadow-2xl border rounded-xl p-1 w-48 z-[200] ${isDarkMode ? 'bg-[var(--bg-secondary)] border-[var(--border-color)]' : 'bg-white border-slate-200'}`}>
                      <button onClick={handleExportPDF} className="flex items-center gap-3 px-3 py-2 hover:bg-slate-500/5 rounded-lg w-full text-left text-[10px] font-black uppercase tracking-widest transition-all"><FileText size={14} className="text-rose-500" /> Reporte PDF</button>
                      <button onClick={handleExportExcel} className="flex items-center gap-3 px-3 py-2 hover:bg-slate-500/5 rounded-lg w-full text-left text-[10px] font-black uppercase tracking-widest transition-all"><FileSpreadsheet size={14} className="text-emerald-500" /> Datos Excel</button>
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
           </div>
        </div>
      </header>

      {/* Main Content Area */}
      <main className="flex-1 relative overflow-hidden bg-transparent">
        <AnimatePresence mode="wait">
          <motion.div
            key={currentView}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="h-full w-full"
          >
            {currentView === 'financial' && <div className="h-full overflow-auto custom-scrollbar"><FinancialViewContainer /></div>}
            {currentView === 'board' && <div className="h-full overflow-auto p-4 custom-scrollbar"><BoardViewContainer searchQuery={searchQuery} selectedGroupId={selectedGroupId} filters={activeFilters} onOpenItem={openItemModal} /></div>}
            {currentView === 'execution' && <ExecutionViewContainer onOpenItem={openItemModal} searchQuery={searchQuery} selectedGroupId={selectedGroupId} filters={activeFilters} />}
            {currentView === 'gantt' && <GanttViewContainer onOpenItem={openItemModal} searchQuery={searchQuery} selectedGroupId={selectedGroupId} filters={activeFilters} />}
            {currentView === 'map' && (
              <div className="h-full p-4">
                 <div className="industrial-card rounded-2xl overflow-hidden h-full border border-[#3B7EF8]/10 shadow-2xl">
                    <MantenixMap 
                      items={groups?.flatMap((g, gIdx) => g.items.map((it: any, itIdx) => ({
                        id: it.id || `map-item-${gIdx}-${itIdx}`, name: it.name, status: it.values['status'] || 'Unknown', lat: it.values['lat'] || g.lat, lng: it.values['lng'] || g.lat, values: it.values
                      }))) || []} 
                    />
                 </div>
              </div>
            )}
            {currentView === 'dashboards' && <div className="h-full overflow-auto custom-scrollbar"><DashboardViewContainer /></div>}
            {currentView === 'kanban' && <div className="h-full overflow-auto p-8 custom-scrollbar"><KanbanViewContainer searchQuery={searchQuery} selectedGroupId={selectedGroupId} filters={activeFilters} onOpenItem={openItemModal} /></div>}
            {currentView === 'reports' && <div className="h-full overflow-auto custom-scrollbar"><ReportsViewContainer /></div>}
            {currentView === 'notifications' && <div className="h-full overflow-auto custom-scrollbar"><NotificationsView /></div>}
            {currentView === 'work-orders' && <div className="h-full overflow-auto custom-scrollbar"><WorkOrdersContainer /></div>}
            {currentView === 'planner' && <WeeklyPlannerContainer boardId={board?.id} selectedGroupId={selectedGroupId} groups={groups} />}
          </motion.div>
        </AnimatePresence>
      </main>

      {/* Modals */}
      <ItemModal 
        isOpen={itemModal.isOpen} 
        onClose={closeItemModal} 
        item={itemModal.selectedItem?.item || null} 
        boardId={board?.id} 
        initialTab={itemModal.initialTab}
        onUpdateValue={(f,v) => updateItem.mutate({ itemId: itemModal.selectedItem.item.id, updates: { [f]: v }, isValuesUpdate: true })} 
        onUpdateValues={(u) => updateItem.mutate({ itemId: itemModal.selectedItem.item.id, updates: u, isValuesUpdate: true })}
        onUpdateGeneric={(fOrU, v) => {
            const updates = typeof fOrU === 'string' ? { [fOrU]: v } : fOrU;
            updateItem.mutate({ itemId: itemModal.selectedItem.item.id, updates, isValuesUpdate: false });
        }}
        onDeleteItem={(id) => openConfirmModal("Confirmar", "¿Eliminar item?", () => deleteItem.mutate(id))}
      />
      
      <ConfirmModal isOpen={confirmModal.isOpen} onClose={closeConfirmModal} onConfirm={() => { confirmModal.onConfirm?.(); closeConfirmModal(); }} title={confirmModal.title} message={confirmModal.message} />
      <AutomationsModal isOpen={automationsModalOpen} onClose={() => setAutomationsModalOpen(false)} boardId={board?.id} />

      {/* Popovers */}
      <AnimatePresence>
        {isLocationMenuOpen && (
          <motion.div initial={{ opacity: 0, y: 5 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} className="fixed z-[300] bg-[var(--bg-secondary)] border border-[var(--border-color)] shadow-2xl rounded-xl p-1 w-64" style={{ top: '55px', right: '180px' }}>
             <button onClick={() => { setSelectedGroupId(null); setIsLocationMenuOpen(false); }} className="w-full flex items-center gap-3 px-3 py-2 hover:bg-slate-500/5 rounded-lg text-left text-xs font-black uppercase tracking-widest text-[#3B7EF8]">Global Coverage</button>
             <div className="h-px bg-slate-500/5 my-1" />
             {groups?.map((g, locIdx) => (
                <button key={g.id || `loc-site-${locIdx}`} onClick={() => { setSelectedGroupId(g.id); setIsLocationMenuOpen(false); }} className="w-full flex items-center gap-3 px-3 py-2 hover:bg-slate-500/5 rounded-lg text-left text-xs font-medium"><div className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: g.color }} /> {g.title}</button>
             ))}
          </motion.div>
        )}
      </AnimatePresence>
      <style jsx>{`
        :global(:root) {
          --bg-primary: ${isDarkMode ? '#0C0F1A' : '#fefbf6'};
          --bg-secondary: ${isDarkMode ? '#161B30' : '#ffffff'};
          --text-primary: ${isDarkMode ? '#EEF2FF' : '#000000'};
          --text-secondary: ${isDarkMode ? '#64748b' : '#334155'};
          --border-color: ${isDarkMode ? 'rgba(255, 255, 255, 0.05)' : 'rgba(0, 0, 0, 0.05)'};
          --card-bg: ${isDarkMode ? 'linear-gradient(145deg, #161B30 0%, #0C0F1A 100%)' : 'rgba(255, 255, 255, 0.05)'};
          --card-blur: ${isDarkMode ? '0px' : '20px'};
        }

        .custom-scrollbar::-webkit-scrollbar { height: 6px; width: 6px; }
        .custom-scrollbar::-webkit-scrollbar-thumb { background: rgba(59, 126, 248, 0.1); border-radius: 10px; }
        .custom-scrollbar::-webkit-scrollbar-thumb:hover { background: rgba(59, 126, 248, 0.3); }
        .custom-scrollbar::-webkit-scrollbar-track { background: transparent; }
        /* 🧼 ESTÉTICA 'ICE GLASS' (SOBRIEDAD TOTAL) */
        :global(body.doodle-active) {
          background-color: #f1f5f9 !important; 
          background-image: none !important;
        }

        /* 🛡️ TARJETAS DE CRISTAL ESMERILADO (VISIBILIDAD RECUPERADA) */
        :global(body.doodle-active .industrial-card) {
          background-color: rgba(255, 255, 255, 0.95) !important;
          backdrop-filter: blur(4px) !important;
          border: 1px solid rgba(0, 0, 0, 0.05) !important;
          box-shadow: 0 2px 12px -1px rgba(0, 0, 0, 0.04) !important;
        }
        
        /* 🟠 PROTECCIÓN DE ESTADOS */
        :global(body.doodle-active .status-badge) {
          opacity: 1 !important;
          visibility: visible !important;
        }
      `}</style>
    </div>
  );
}

export default function Dashboard() {
  return (
    <Suspense fallback={<div className="flex h-screen items-center justify-center bg-[var(--bg-primary)]"><div className="w-12 h-12 border-4 border-[#3B7EF8] border-t-transparent rounded-full animate-spin" /></div>}>
      <DashboardContent />
    </Suspense>
  );
}