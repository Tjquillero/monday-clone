'use client';

import { useState, useEffect, useMemo, Suspense } from 'react';
import { 
  Search, Layout, Calendar, CheckSquare2, FileText, DollarSign, Zap, Star, Filter, Download, FileSpreadsheet, File, MapPin, ChevronDown, X, Check, Plus,
  Table2, Gauge, Columns2, Activity, AlertTriangle
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { useSearchParams } from 'next/navigation';

// Components & Containers
import BoardViewContainer from '@/components/views/BoardViewContainer';
import GanttViewContainer from '@/components/views/GanttViewContainer';
import ExecutionViewContainer from '@/components/views/ExecutionViewContainer';
import FinancialViewContainer from '@/components/views/FinancialViewContainer';
import CalendarViewContainer from '@/components/views/CalendarViewContainer';
import ChartViewContainer from '@/components/views/ChartViewContainer';
import AssessmentViewContainer from '@/components/views/AssessmentViewContainer';
import ReportsViewContainer from '@/components/views/ReportsViewContainer';
import KanbanViewContainer from '@/components/views/KanbanViewContainer';
import DashboardViewContainer from '@/components/views/DashboardViewContainer';
import NotificationsView from '@/components/views/NotificationsView';
import ItemModal from '@/components/modals/ItemModal';
import AutomationsModal from '@/components/modals/AutomationsModal';
import ConfirmModal from '@/components/modals/ConfirmModal';

// Hooks & Contexts
import { useBoard, useBoardColumns, useBoardGroups, useActivityTemplates } from '@/hooks/useBoardData';
import { useBoardMutations } from '@/hooks/useBoardMutations';
import { usePersonnel } from '@/hooks/usePersonnel';
import { useRealtimeSync } from '@/hooks/useRealtimeSync';
import { useAuth } from '@/contexts/AuthContext';
import { useUI } from '@/contexts/UIContext';
import { useTemplates } from '@/hooks/useTemplates';
import { supabase } from '@/lib/supabaseClient';
import { generateExcelReport } from '@/lib/excelReports';
import { generateBoardPDF } from '@/lib/serverReports';

function DashboardContent() {
  const searchParams = useSearchParams();
  const { user } = useAuth();
  const { 
    searchQuery, setSearchQuery,
    itemModal, openItemModal, closeItemModal,
    automationsModalOpen, setAutomationsModalOpen,
    confirmModal, openConfirmModal, closeConfirmModal
  } = useUI();

  const [currentView, _setCurrentView] = useState<'board' | 'gantt' | 'execution' | 'financial' | 'calendar' | 'charts' | 'assessment' | 'reports' | 'kanban' | 'dashboards' | 'notifications'>('board');

  const setCurrentView = (view: any) => {
    _setCurrentView(view);
    if (typeof window !== 'undefined') localStorage.setItem('mantenix_active_tab', view);
  };

  useEffect(() => {
    if (typeof window !== 'undefined') {
      const saved = localStorage.getItem('mantenix_active_tab');
      if (saved) _setCurrentView(saved as any);
    }
  }, []);
  const [selectedGroupId, setSelectedGroupId] = useState<string | null>(null);
  const [activeFilters, setActiveFilters] = useState({
    status: [] as string[],
    priority: [] as string[],
    person: [] as string[]
  });
  const [isFilterMenuOpen, setIsFilterMenuOpen] = useState(false);
  const [isLocationMenuOpen, setIsLocationMenuOpen] = useState(false);

  const [boardDescription, setBoardDescription] = useState('');
  const [isEditingDescription, setIsEditingDescription] = useState(false);
  const [isExportMenuOpen, setIsExportMenuOpen] = useState(false);

  const { data: board, isLoading: boardLoading, isError: boardError, error: fetchError } = useBoard(searchParams?.get('id') || undefined);
  const { data: groups } = useBoardGroups(board?.id);
  const { data: columns } = useBoardColumns(board?.id);
  const { data: personnel } = usePersonnel();
  const { deleteItem, updateItem } = useBoardMutations(board?.id);

  // Sync real-time changes
  useRealtimeSync(board?.id);

  // Initializing state from URL or Data
  useEffect(() => {
    if (searchParams && groups) {
      const viewParam = searchParams.get('view');
      if (viewParam) setCurrentView(viewParam as any);

      // Handle direct item access via itemId URL parameter
      const itemId = searchParams.get('itemId');
      if (itemId) {
        for (const group of groups) {
          const item = group.items.find(i => String(i.id) === itemId);
          if (item) {
            openItemModal(group.id, item);
            break;
          }
        }
      }
    }
  }, [searchParams, groups, openItemModal]);

  const isAdmin = (user?.user_metadata as any)?.role === 'admin' || user?.email === 'admin@mantenix.com';

  const handleDescriptionSave = async () => {
    if (!board?.id) return;
    await supabase.from('boards').update({ description: boardDescription }).eq('id', board.id);
    setIsEditingDescription(false);
  };

  const handleExportExcel = () => {
    if (!board || !groups || !columns) return;
    generateExcelReport(board.name, groups.flatMap(g => g.items), columns);
    setIsExportMenuOpen(false);
  };

  const handleExportPDF = () => {
    if (!board || !groups || !columns) {
      alert('Espere a que carguen los datos del tablero.');
      return;
    }
    generateBoardPDF(board.name, groups, columns);
    setIsExportMenuOpen(false);
  };

  const { saveTemplate } = useTemplates();

  const handleSaveAsTemplate = async () => {
    if (!board || !groups || !columns) return;
    const templateName = prompt('Nombre de la plantilla:', `${board.name} Template`);
    if (!templateName) return;

    const structure = {
      groups: groups.map(g => ({ title: g.title, color: g.color })),
      columns: columns.map(c => ({ title: c.title, type: c.type, width: c.width, position: c.position }))
    };

    try {
      await saveTemplate.mutateAsync({
        name: templateName,
        description: `Estructura copiada de ${board.name}`,
        structure
      });
      alert('✅ Plantilla guardada correctamente.');
      setIsExportMenuOpen(false);
    } catch (error) {
      console.error(error);
      alert('❌ Error al guardar la plantilla.');
    }
  };

  if (boardLoading) return (
    <div className="flex h-screen items-center justify-center bg-slate-50">
      <div className="flex flex-col items-center gap-4">
        <div className="w-12 h-12 border-4 border-primary border-t-transparent rounded-full animate-spin" />
        <p className="text-gray-500 font-medium">Cargando Mantenix...</p>
      </div>
    </div>
  );

  if (boardError) return (
    <div className="flex h-screen items-center justify-center bg-slate-50 p-6 text-center">
      <div className="max-w-md space-y-6">
        <div className="w-20 h-20 bg-red-100 rounded-full flex items-center justify-center mx-auto text-red-600">
          <AlertTriangle className="w-10 h-10" />
        </div>
        <h2 className="text-2xl font-black text-slate-800">Error de conexión</h2>
        <p className="text-slate-500 font-medium">
          No pudimos conectar con la base de datos. Verifica tu conexión a internet o los permisos de tu cuenta.
        </p>
        <button 
          onClick={() => window.location.reload()}
          className="bg-primary text-white px-8 py-3 rounded-2xl font-black hover:shadow-xl transition-all"
        >
          Reintentar
        </button>
      </div>
    </div>
  );

  if (!board) return (
    <div className="flex h-screen items-center justify-center bg-slate-50 p-6 text-center">
      <div className="max-w-md space-y-6">
        <div className="w-20 h-20 bg-primary/10 rounded-full flex items-center justify-center mx-auto">
          <Layout className="w-10 h-10 text-primary" />
        </div>
        <h2 className="text-2xl font-black text-slate-800">No se encontró ningún tablero</h2>
        <p className="text-slate-500 font-medium">Por favor, selecciona un tablero en el menú lateral o crea uno nuevo para comenzar a trabajar.</p>
      </div>
    </div>
  );

  const currentBoardName = board.name || 'Tablero Principal';

  return (
    <div className="flex h-screen flex-col bg-white">
      {/* Header / Navigation */}
      <div className="flex flex-col border-b border-gray-200 bg-white">
        <div className="flex flex-col md:flex-row md:items-center justify-between px-6 py-4 gap-4">
          <div className="flex items-center gap-4">
            <div className="p-2 bg-primary/10 rounded-lg">
              <Layout className="w-6 h-6 text-primary" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-xl font-bold text-gray-900">{currentBoardName}</h1>
                <button className="p-1 hover:bg-gray-100 rounded text-gray-400">
                  <Star className="w-4 h-4" />
                </button>
              </div>
              <div className="flex items-center gap-2">
                {isEditingDescription ? (
                  <input
                    type="text"
                    value={boardDescription}
                    onChange={(e) => setBoardDescription(e.target.value)}
                    onBlur={handleDescriptionSave}
                    onKeyDown={(e) => e.key === 'Enter' && handleDescriptionSave()}
                    className="text-sm text-gray-500 border-b border-primary outline-none bg-transparent"
                    autoFocus
                  />
                ) : (
                  <button 
                    onClick={() => {
                        setBoardDescription(board.description || '');
                        setIsEditingDescription(true);
                    }}
                    className="text-sm text-gray-500 hover:text-gray-700 mt-1"
                  >
                    {board.description || 'Añadir descripción...'}
                  </button>
                )}
              </div>
            </div>
          </div>

          <div className="flex items-center gap-2 w-full md:w-auto overflow-visible">
            <div className="flex flex-wrap bg-gray-100/80 backdrop-blur-sm rounded-xl p-1 shadow-inner border border-gray-200/50">
              {[
                { id: 'board', label: 'Tabla Principal', icon: Table2 },
                { id: 'dashboards', label: 'Paneles', icon: Gauge },
                { id: 'kanban', label: 'Kanban', icon: Columns2 },
                { id: 'execution', label: 'Seguimiento', icon: Activity },
                { id: 'financial', label: 'Financiero', icon: DollarSign },
                { id: 'gantt', label: 'Cronograma', icon: Calendar },
                { id: 'reports', label: 'Reportes', icon: FileText },
              ].map((tab) => {
                const isActive = currentView === tab.id;
                return (
                  <button
                    key={tab.id}
                    onClick={() => setCurrentView(tab.id as any)}
                    title={tab.label}
                    className={`relative flex items-center gap-2 px-3 py-1.5 rounded-lg text-sm font-bold transition-all duration-300 ${isActive ? 'text-primary' : 'text-gray-500 hover:text-gray-700 hover:bg-gray-200/50'}`}
                  >
                    {isActive && (
                      <motion.div layoutId="activeTab" className="absolute inset-0 bg-white shadow-sm rounded-lg" transition={{ type: "spring", bounce: 0.2, duration: 0.6 }} />
                    )}
                    <tab.icon className={`w-4 h-4 relative z-10 transition-transform ${isActive ? 'scale-110' : ''}`} />
                    <AnimatePresence mode="popLayout" initial={false}>
                      {isActive && (
                        <motion.span initial={{ opacity: 0, x: -10, width: 0 }} animate={{ opacity: 1, x: 0, width: 'auto' }} exit={{ opacity: 0, x: -10, width: 0 }} className="relative z-10 whitespace-nowrap overflow-hidden pr-1">
                          {tab.label}
                        </motion.span>
                      )}
                    </AnimatePresence>
                  </button>
                );
              })}
            </div>

            <button onClick={() => setAutomationsModalOpen(true)} className="p-2 text-gray-400 hover:text-amber-500 hover:bg-amber-50 rounded-xl transition-all duration-300 ml-1 group" title="Automatizaciones">
              <Zap className="w-5 h-5 transition-transform group-hover:scale-110" />
            </button>

            <div className="relative">
              <button onClick={() => setIsExportMenuOpen(!isExportMenuOpen)} className="p-2 text-gray-600 hover:bg-gray-100 rounded-lg transition-colors ml-2" title="Exportar Reporte">
                 <Download className="w-5 h-5 text-gray-500" />
              </button>
              
              <AnimatePresence>
                {isExportMenuOpen && (
                  <motion.div initial={{ opacity: 0, scale: 0.95, y: 10 }} animate={{ opacity: 1, scale: 1, y: 0 }} exit={{ opacity: 0, scale: 0.95 }} className="absolute top-12 right-0 bg-white shadow-xl border border-gray-100 rounded-xl p-2 w-[220px] z-50 flex flex-col gap-1">
                     <div className="text-[10px] font-bold text-gray-400 uppercase tracking-widest px-3 py-2">Exportar Tablero</div>
                     <button onClick={handleExportPDF} className="flex items-center gap-3 px-3 py-2 hover:bg-gray-50 rounded-lg text-sm text-gray-700 transition-colors text-left">
                        <div className="p-1.5 bg-rose-50 rounded text-rose-600"><FileText className="w-4 h-4" /></div>
                        <div><p className="font-semibold">PDF Report</p><p className="text-[10px] text-gray-400">Reporte de Sitio Oficial</p></div>
                     </button>
                     <button onClick={handleExportExcel} className="flex items-center gap-3 px-3 py-2 hover:bg-gray-50 rounded-lg text-sm text-gray-700 transition-colors text-left">
                        <div className="p-1.5 bg-emerald-50 rounded text-emerald-600"><FileSpreadsheet className="w-4 h-4" /></div>
                        <div><p className="font-semibold">Excel Export</p><p className="text-[10px] text-gray-400">Datos y Cálculos</p></div>
                     </button>
                     <button onClick={handleSaveAsTemplate} className="flex items-center gap-3 px-3 py-2 hover:bg-gray-50 rounded-lg text-sm text-gray-700 transition-colors text-left">
                        <div className="p-1.5 bg-primary/10 rounded text-primary"><Plus className="w-4 h-4" /></div>
                        <div><p className="font-semibold">Save as Template</p><p className="text-[10px] text-gray-400">Guardar estructura</p></div>
                     </button>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          </div>
        </div>

        <div className="px-6 py-3 border-t border-gray-100 bg-gray-50/30">
          <div className="flex flex-wrap items-center gap-3">
            <div className="relative">
              <button 
                onClick={() => setIsLocationMenuOpen(!isLocationMenuOpen)}
                className={`flex items-center gap-2 px-3 py-1.5 text-sm font-semibold rounded-lg border transition-all ${selectedGroupId ? 'bg-blue-50 border-blue-200 text-blue-700 shadow-sm' : 'bg-white border-gray-200 text-gray-700 hover:border-gray-300'}`}
              >
                <MapPin className={`w-4 h-4 ${selectedGroupId ? 'text-blue-600' : 'text-gray-400'}`} />
                <span>{selectedGroupId ? groups?.find(g => g.id === selectedGroupId)?.title || 'Todos los Sitios' : 'Todos los Sitios'}</span>
                <ChevronDown className={`w-3 h-3 transition-transform ${isLocationMenuOpen ? 'rotate-180' : ''}`} />
              </button>

              <AnimatePresence>
                {isLocationMenuOpen && (
                  <>
                    <div className="fixed inset-0 z-40" onClick={() => setIsLocationMenuOpen(false)} />
                    <motion.div initial={{ opacity: 0, scale: 0.95, y: 5 }} animate={{ opacity: 1, scale: 1, y: 0 }} exit={{ opacity: 0, scale: 0.95, y: 5 }} className="absolute top-full left-0 mt-2 w-64 bg-white border border-gray-100 shadow-2xl rounded-xl p-1.5 z-50 overflow-hidden origin-top-left">
                      <button onClick={() => { setSelectedGroupId(null); setIsLocationMenuOpen(false); }} className="w-full flex items-center gap-2 px-3 py-2 text-sm hover:bg-gray-50 rounded-lg transition-colors text-left font-semibold text-gray-600">
                        <div className={`w-4 h-4 rounded-full border ${!selectedGroupId ? 'bg-primary border-primary' : 'border-gray-300'}`} /> Todos los Sitios
                      </button>
                      <div className="h-px bg-gray-100 my-1" />
                      <div className="max-h-60 overflow-y-auto custom-scrollbar">
                        {groups?.map(group => (
                          <button key={group.id} onClick={() => { setSelectedGroupId(group.id); setIsLocationMenuOpen(false); }} className={`w-full flex items-center gap-2 px-3 py-2 text-sm rounded-lg transition-colors text-left ${selectedGroupId === group.id ? 'bg-primary/5 text-primary font-bold' : 'hover:bg-gray-50 text-gray-600'}`}>
                            <MapPin className={`w-3.5 h-3.5 ${selectedGroupId === group.id ? 'text-primary' : 'text-gray-400'}`} /> <span className="truncate">{group.title}</span>
                          </button>
                        ))}
                      </div>
                    </motion.div>
                  </>
                )}
              </AnimatePresence>
            </div>

            <div className="h-6 w-px bg-gray-200 mx-1 hidden sm:block" />

            <div className="relative group flex-1 max-w-md">
              <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 group-focus-within:text-primary transition-colors" />
              <input type="text" placeholder="Buscar tareas, responsables..." value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} className="w-full pl-9 pr-10 py-1.5 text-sm bg-white border border-gray-200 rounded-lg outline-none focus:ring-4 focus:ring-primary/10 focus:border-primary transition-all shadow-sm group-hover:bg-gray-50/50 group-focus-within:bg-white" />
              {searchQuery && <button onClick={() => setSearchQuery('')} className="absolute right-2 top-1/2 -translate-y-1/2 p-1 hover:bg-gray-100 rounded-full text-gray-400 transition-colors"><X className="w-3.5 h-3.5" /></button>}
            </div>

            <div className="relative">
              <button onClick={() => setIsFilterMenuOpen(!isFilterMenuOpen)} className={`flex items-center gap-2 px-3 py-1.5 text-sm font-semibold rounded-lg border transition-all ${(activeFilters.status.length > 0 || activeFilters.priority.length > 0 || activeFilters.person.length > 0) ? 'bg-amber-50 border-amber-200 text-amber-700 shadow-sm' : 'bg-white border-gray-200 text-gray-700 hover:border-gray-300'}`}>
                <Filter className={`w-4 h-4 ${(activeFilters.status.length > 0 || activeFilters.priority.length > 0 || activeFilters.person.length > 0) ? 'text-amber-600' : 'text-gray-400'}`} />
                <span>Filtros</span>
                {(activeFilters.status.length > 0 || activeFilters.priority.length > 0 || activeFilters.person.length > 0) && (
                  <span className="flex items-center justify-center min-w-[18px] h-[18px] px-1 bg-amber-600 text-white text-[10px] font-black rounded-full">{activeFilters.status.length + activeFilters.priority.length + activeFilters.person.length}</span>
                )}
              </button>

              <AnimatePresence>
                {isFilterMenuOpen && (
                  <>
                    <div className="fixed inset-0 z-40" onClick={() => setIsFilterMenuOpen(false)} />
                    <motion.div initial={{ opacity: 0, scale: 0.95, y: 10 }} animate={{ opacity: 1, scale: 1, y: 0 }} exit={{ opacity: 0, scale: 0.95, y: 10 }} className="absolute top-full right-0 mt-2 w-72 bg-white border border-gray-100 shadow-2xl rounded-xl p-4 z-50 origin-top-right">
                      <div className="flex items-center justify-between mb-4 pb-2 border-b border-gray-100"><span className="text-xs font-bold text-gray-400 uppercase tracking-widest">Filtros Avanzados</span><button onClick={() => setActiveFilters({ status: [], priority: [], person: [] })} className="text-[10px] font-bold text-primary hover:underline">Limpiar todo</button></div>
                      <div className="mb-6"><div className="text-[11px] font-black text-gray-400 mb-3 uppercase tracking-wider">Estado</div><div className="flex flex-wrap gap-2">{['Listo', 'En proceso', 'Estancado', 'No iniciado'].map(status => { const isSelected = activeFilters.status.includes(status); return (<button key={status} onClick={() => setActiveFilters(prev => ({ ...prev, status: isSelected ? prev.status.filter(s => s !== status) : [...prev.status, status] }))} className={`flex items-center gap-2 px-3 py-1.5 rounded-xl text-[11px] font-bold border transition-all duration-300 ${isSelected ? 'bg-primary text-white border-primary shadow-lg shadow-primary/20 scale-105' : 'bg-white text-gray-600 border-gray-200 hover:border-primary/30 hover:bg-gray-50'}`}>{isSelected && <Check className="w-3 h-3" />}{status}</button>); })}</div></div>
                      <div className="mb-6"><div className="text-[11px] font-black text-gray-400 mb-3 uppercase tracking-wider">Prioridad</div><div className="flex flex-wrap gap-2">{['Alta', 'Media', 'Baja'].map(priority => { const isSelected = activeFilters.priority.includes(priority); return (<button key={priority} onClick={() => setActiveFilters(prev => ({ ...prev, priority: isSelected ? prev.priority.filter(p => p !== priority) : [...prev.priority, priority] }))} className={`flex items-center gap-2 px-3 py-1.5 rounded-xl text-[11px] font-bold border transition-all duration-300 ${isSelected ? 'bg-primary text-white border-primary shadow-lg shadow-primary/20 scale-105' : 'bg-white text-gray-600 border-gray-200 hover:border-primary/30 hover:bg-gray-50'}`}>{isSelected && <Check className="w-3 h-3" />}{priority}</button>); })}</div></div>
                      <div><div className="text-[11px] font-black text-gray-400 mb-3 uppercase tracking-wider">Persona Asignada</div><div className="grid grid-cols-1 gap-2 max-h-48 overflow-y-auto pr-2 custom-scrollbar">{personnel?.map(person => { const isSelected = activeFilters.person.includes(person.id); return (<button key={person.id} onClick={() => setActiveFilters(prev => ({ ...prev, person: isSelected ? prev.person.filter(p => p !== person.id) : [...prev.person, person.id] }))} className={`flex items-center justify-between px-3 py-2 rounded-xl text-[12px] font-bold border transition-all duration-300 ${isSelected ? 'bg-primary/10 text-primary border-primary/20' : 'bg-white text-gray-600 border-gray-100 hover:bg-gray-50'}`}><div className="flex items-center gap-3"><div className={`w-7 h-7 rounded-full flex items-center justify-center text-[10px] font-black uppercase shadow-sm ${isSelected ? 'bg-primary text-white' : 'bg-gray-100 text-gray-400'}`}>{person.name.charAt(0)}</div><span>{person.name}</span></div>{isSelected && <Check className="w-4 h-4" />}</button>); })}{(!personnel || personnel.length === 0) && (<div className="text-[10px] text-gray-400 italic py-4 text-center bg-gray-50 rounded-xl border border-dashed">No hay personal registrado</div>)}</div></div>
                    </motion.div>
                  </>
                )}
              </AnimatePresence>
            </div>
          </div>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto min-h-0 bg-white">
        <AnimatePresence mode="wait">
          {currentView === 'board' && (<motion.div key="board" initial={{ opacity: 0, scale: 0.98 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.98 }} className="p-6"><BoardViewContainer searchQuery={searchQuery} selectedGroupId={selectedGroupId} filters={activeFilters} onOpenItem={openItemModal} /></motion.div>)}
          {currentView === 'dashboards' && (<motion.div key="dashboards" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="h-full"><DashboardViewContainer /></motion.div>)}
          {currentView === 'gantt' && (<motion.div key="gantt" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="h-full"><GanttViewContainer onOpenItem={openItemModal} searchQuery={searchQuery} selectedGroupId={selectedGroupId} filters={activeFilters} /></motion.div>)}
          {currentView === 'kanban' && (<motion.div key="kanban" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="p-6 h-full"><KanbanViewContainer searchQuery={searchQuery} selectedGroupId={selectedGroupId} filters={activeFilters} onOpenItem={openItemModal} /></motion.div>)}
          {currentView === 'execution' && (<motion.div key="execution" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="p-6"><ExecutionViewContainer onOpenItem={openItemModal} searchQuery={searchQuery} selectedGroupId={selectedGroupId} filters={activeFilters} /></motion.div>)}
          {currentView === 'financial' && (<motion.div key="financial" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="p-6"><FinancialViewContainer /></motion.div>)}
          {currentView === 'calendar' && <CalendarViewContainer />}
          {currentView === 'charts' && <ChartViewContainer />}
          {currentView === 'assessment' && <AssessmentViewContainer />}
          {currentView === 'reports' && <ReportsViewContainer />}
          {currentView === 'notifications' && (<motion.div key="notifications" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="h-full"><NotificationsView /></motion.div>)}
        </AnimatePresence>
      </div>

      <ItemModal isOpen={itemModal.isOpen} onClose={closeItemModal} item={itemModal.selectedItem?.item || null} boardId={board.id} onUpdateValue={(field, value) => { if (itemModal.selectedItem) updateItem.mutate({ itemId: itemModal.selectedItem.item.id, updates: { [field]: value }, isValuesUpdate: true }); }} onUpdateGeneric={(field, value) => { if (itemModal.selectedItem) updateItem.mutate({ itemId: itemModal.selectedItem.item.id, updates: { [field]: value }, isValuesUpdate: false }); }} onDeleteItem={(itemId) => { openConfirmModal("Confirmar eliminación", "¿Estás seguro de que deseas eliminar este elemento?", () => deleteItem.mutate(itemId)); }} />
      <AutomationsModal isOpen={automationsModalOpen} onClose={() => setAutomationsModalOpen(false)} boardId={board.id} />
      <ConfirmModal isOpen={confirmModal.isOpen} onClose={closeConfirmModal} onConfirm={() => { if (confirmModal.onConfirm) { confirmModal.onConfirm(); closeConfirmModal(); } }} title={confirmModal.title} message={confirmModal.message} />
    </div>
  );
}

export default function Dashboard() {
  return (
    <Suspense fallback={
      <div className="flex h-screen items-center justify-center bg-slate-50">
        <div className="flex flex-col items-center gap-4">
          <div className="w-12 h-12 border-4 border-primary border-t-transparent rounded-full animate-spin" />
          <p className="text-gray-500 font-medium">Iniciando aplicación...</p>
        </div>
      </div>
    }>
      <DashboardContent />
    </Suspense>
  );
}