'use client';

import { useEffect, useState } from 'react';
import { 
  Search, Bell, Plus, Layout, Users, Megaphone, 
  Home, CheckSquare, ChevronLeft, ChevronRight, Folder, ChevronDown,
  Menu, X as CloseIcon, LogOut, Target, PanelLeft, Briefcase, Settings, LucideIcon
} from 'lucide-react';
import Link from 'next/link';
import { useRouter, usePathname } from 'next/navigation';
import Image from 'next/image';
import { motion, AnimatePresence } from 'framer-motion';
import NotificationBell from './NotificationBell';
import OfflineIndicator from './OfflineIndicator';
import { useOfflineSync } from '@/hooks/useOfflineSync';
import NewsModal from '@/components/modals/NewsModal';
import SearchModal from '@/components/modals/SearchModal';
import NewBoardModal from '@/components/modals/NewBoardModal';
import MantenixLogo from '@/components/ui/MantenixLogo';
import { supabase } from '@/lib/supabaseClient';
import { useUI } from '@/contexts/UIContext';
import { useAuth } from '@/contexts/AuthContext';
import { useTemplates } from '@/hooks/useTemplates';
import { usePermissions, PERMISSIONS } from '@/hooks/usePermissions';

interface SidebarItem {
  icon: LucideIcon;
  label: string;
  path: string;
}

const SIDEBAR_ITEMS: SidebarItem[] = [
  { icon: Home, label: 'Inicio', path: '/dashboard' },
  { icon: Briefcase, label: 'Planificación', path: '/projects' },
  { icon: CheckSquare, label: 'Mis tareas', path: '/my-work' },
  { icon: Target, label: 'Objetivos', path: '/okrs' },
  { icon: Layout, label: 'Insumos', path: '/dashboard' },
];

export default function ProfessionalLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const { sidebarOpen, setSidebarOpen } = useUI();
  const { user, signOut } = useAuth();
  const { can } = usePermissions();

  const { refreshLocalCache, isOnline } = useOfflineSync();

  // Registrar Service Worker para soporte offline
  useEffect(() => {
    if (typeof window !== 'undefined' && 'serviceWorker' in navigator) {
      navigator.serviceWorker.register('/sw.js').then(
        (reg) => console.log('[PWA] Service Worker registrado:', reg.scope),
        (err) => console.error('[PWA] Error al registrar Service Worker:', err)
      );
    }
  }, []);

  // Sincronizar instantánea IndexedDB al iniciar o volver a estar online
  useEffect(() => {
    if (isOnline) {
      refreshLocalCache();
    }
  }, [isOnline, refreshLocalCache]);
  
  const [isMobileSidebarOpen, setIsMobileSidebarOpen] = useState(false);
  const [isUserMenuOpen, setIsUserMenuOpen] = useState(false);
  const [isNewsModalOpen, setIsNewsModalOpen] = useState(false);
  const [isSearchModalOpen, setIsSearchModalOpen] = useState(false);
  const [isNewBoardModalOpen, setIsNewBoardBoardModalOpen] = useState(false);
  const [selectedFolderForNewBoard, setSelectedFolderForNewBoard] = useState<string | null>(null);
  const [expandedFolders, setExpandedFolders] = useState<Record<string, boolean>>({ 'main': true });
  
  const handleLogout = async () => {
    await signOut();
    router.push('/login?signedout=true');
    router.refresh();
  };

  const [workspace, setWorkspace] = useState({
    folders: [
      { id: 'main', name: 'Proyectos Principales', boards: [
        { id: 'b1', name: 'Control de Costos', path: '/dashboard?view=financial', active: true },
        { id: 'b2', name: 'Mantenimiento General', path: '/dashboard?view=execution', active: false },
      ]},
    ]
  });

  const toggleFolder = (id: string) => {
    setExpandedFolders(prev => ({ ...prev, [id]: !prev[id] }));
  };

  useEffect(() => {
    if (typeof window !== 'undefined') {
      const handleKeyDown = (e: KeyboardEvent) => {
        if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
          e.preventDefault();
          setIsSearchModalOpen(true);
        }
      };
      window.addEventListener('keydown', handleKeyDown);
      return () => window.removeEventListener('keydown', handleKeyDown);
    }
  }, []);

  const openNewBoardModal = (folderId: string) => {
    setSelectedFolderForNewBoard(folderId);
    setIsNewBoardBoardModalOpen(true);
  };

  const { templates } = useTemplates();

  const handleCreateBoard = async (name: string, templateId?: string) => {
    if (!user) return;
    try {
      const { data: newBoard, error: boardError } = await supabase.from('boards').insert({ name, owner_id: user.id }).select().single();
      if (boardError) throw boardError;

      if (templateId) {
        const template = templates.find(t => t.id === templateId);
        if (template && template.structure) {
          const { groups: templateGroups, columns: templateColumns } = template.structure as any;
          if (templateColumns && templateColumns.length > 0) {
            await supabase.from('board_columns').insert(templateColumns.map((c: any, index: number) => ({ board_id: newBoard.id, title: c.title, type: c.type, width: c.width || 150, position: index })));
          }
          if (templateGroups && templateGroups.length > 0) {
            await supabase.from('groups').insert(templateGroups.map((g: any, index: number) => ({ board_id: newBoard.id, title: g.title, color: g.color || '#c4c4c4', position: index })));
          }
        }
      } else {
        await supabase.from('board_columns').insert([
          { board_id: newBoard.id, title: 'Estado',      type: 'status',   key: 'status',   position: 0, required: true,
            options: { labels: [{ id: 'Not Started', title: 'Pendiente', color: '#334155' }, { id: 'Working on it', title: 'En proceso', color: '#F59E0B' }, { id: 'Done', title: 'Completado', color: '#10B981' }, { id: 'Stuck', title: 'Bloqueado', color: '#EF4444' }], default: 'Not Started' } },
          { board_id: newBoard.id, title: 'Prioridad',   type: 'priority', key: 'priority', position: 1,
            options: { labels: [{ id: 'Low', title: 'Baja', color: '#3B7EF8' }, { id: 'Medium', title: 'Media', color: '#F59E0B' }, { id: 'High', title: 'Alta', color: '#EF4444' }], default: 'Low' } },
          { board_id: newBoard.id, title: 'Responsable', type: 'people',   key: 'people',   position: 2, options: { multiple: true } },
          { board_id: newBoard.id, title: 'Fecha',       type: 'date',     key: 'date',     position: 3, options: { includeTime: false } },
        ]);
        await supabase.from('groups').insert({ board_id: newBoard.id, title: 'Grupo 1', position: 0 });
      }

      setWorkspace(prev => ({
        ...prev,
        folders: prev.folders.map(f => f.id === selectedFolderForNewBoard ? {
          ...f,
          boards: [...f.boards, { id: newBoard.id, name: newBoard.name, path: `/dashboard?id=${newBoard.id}`, active: false }]
        } : f)
      }));
      router.push(`/dashboard?id=${newBoard.id}`);
    } catch (error) {
      console.error('Error creating board:', error);
    }
  };

  return (
    <div className="flex h-screen bg-[var(--bg-primary)] overflow-hidden font-sans text-[var(--text-primary)]">
      
      {/* Primary Slim Navbar (Hidden on screen < 1024px) */}
      <aside className="hidden lg:flex w-[68px] bg-[var(--bg-primary)] flex-col items-center py-6 space-y-6 border-r border-[var(--border-color)] z-50 flex-shrink-0">
          <Link href="/dashboard">
            <MantenixLogo size="md" />
          </Link>

          <div className="w-8 h-px bg-slate-500/5" />

          <button onClick={() => setIsSearchModalOpen(true)} className="p-3 text-slate-500 hover:text-[#3B7EF8] hover:bg-[#3B7EF8]/10 rounded-2xl transition-all relative group" title="Buscar (Ctrl+K)">
            <Search className="w-5 h-5 group-hover:scale-110 transition-transform" />
          </button>

          <NotificationBell />
          <OfflineIndicator />

          <button onClick={() => setSidebarOpen(!sidebarOpen)} className={`p-3 rounded-2xl transition-all group ${sidebarOpen ? 'text-[#3B7EF8] bg-[#3B7EF8]/10' : 'text-slate-500 hover:text-white hover:bg-slate-500/5'}`}>
            <PanelLeft className="w-5 h-5 group-hover:rotate-12 transition-transform" />
          </button>

          <div className="flex-1"></div>

          <button onClick={() => setIsNewsModalOpen(true)} className="p-3 text-slate-500 hover:text-amber-400 hover:bg-amber-400/10 rounded-2xl transition-all group" title="Reportar Novedad">
            <Megaphone className="w-5 h-5 group-hover:-rotate-12 transition-transform" />
          </button>

          {can(PERMISSIONS.MANAGE_USERS) && (
            <button onClick={() => router.push('/projects')} className="p-3 text-slate-500 hover:text-emerald-400 hover:bg-emerald-400/10 rounded-2xl transition-all group" title="Personal y Recursos">
              <Users className="w-5 h-5 group-hover:scale-110" />
            </button>
          )}

          <div className="relative group/user px-2">
            <button onClick={() => setIsUserMenuOpen(!isUserMenuOpen)} className="w-10 h-10 bg-gradient-to-tr from-[#3B7EF8] to-emerald-500 rounded-2xl flex items-center justify-center text-white text-xs font-black shadow-lg hover:shadow-[#3B7EF8]/20 transition-all border border-white/20">M</button>
            {isUserMenuOpen && (
              <div className="absolute left-full bottom-0 mb-2 ml-4 w-64 bg-[var(--bg-secondary)] rounded-2xl shadow-[0_10px_40px_rgba(0,0,0,0.5)] border border-[var(--border-color)] py-3 z-[100] animate-in slide-in-from-left-2 duration-200">
                 <div className="px-5 py-4 border-b border-[var(--border-color)] mb-2">
                    <p className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-500 mb-1">Usuario Activo</p>
                    <p className="text-sm font-bold text-white">Mantenix Operator</p>
                    <p className="text-[10px] text-slate-400 font-medium">{user?.email}</p>
                 </div>
                 <button onClick={() => router.push('/settings')} className="w-full text-left px-5 py-3 text-xs font-black uppercase tracking-widest text-slate-400 hover:bg-slate-500/5 hover:text-white transition-all flex items-center gap-3">
                    <Settings size={14} /> Ajustes Perfil
                 </button>
                 <button onClick={handleLogout} className="w-full text-left px-5 py-3 text-xs font-black uppercase tracking-widest text-rose-500 hover:bg-rose-500/10 transition-all flex items-center gap-3 mt-1">
                   <LogOut size={14} /> Cerrar Sesión
                 </button>
              </div>
            )}
          </div>
      </aside>

      {/* Workspace Explorer (Collapsible Main Sidebar) */}
      <aside className={`
        fixed lg:relative inset-y-0 left-0 w-[280px] bg-[var(--bg-secondary)] border-r border-[var(--border-color)] z-40 transition-all duration-300 ease-out
        ${isMobileSidebarOpen ? 'translate-x-0' : '-translate-x-full lg:translate-x-0'}
        ${sidebarOpen ? 'w-[280px] opacity-100 visible' : 'lg:w-0 lg:opacity-0 lg:invisible'}
        flex flex-col flex-shrink-0
      `}>
         <div className="p-6 flex items-center justify-between border-b border-[var(--border-color)] h-[84px] overflow-hidden">
            <div className="flex flex-col min-w-0">
               <span className="text-[10px] font-black text-slate-500 uppercase tracking-[0.2em]">Workspace</span>
               <span className="font-black text-[var(--text-primary)] text-sm tracking-tight truncate">Corporativo Mantenix</span>
            </div>
            <button onClick={() => setSidebarOpen(false)} className="hidden lg:flex p-2 hover:bg-slate-500/5 rounded-xl text-slate-500 hover:text-white transition-all">
               <ChevronLeft className="w-5 h-5" />
            </button>
            <button onClick={() => setIsMobileSidebarOpen(false)} className="lg:hidden p-2 hover:bg-slate-500/5 rounded-xl text-slate-500">
               <CloseIcon className="w-6 h-6" />
            </button>
         </div>

         <div className="py-6 overflow-y-auto flex-1 px-4 custom-scrollbar">
            <div className="space-y-1 mb-10">
               {SIDEBAR_ITEMS.map((item) => {
                  const isActive = pathname === item.path && !pathname.includes('view') && !pathname.includes('projects');
                  return (
                    <Link key={item.label} href={item.path} onClick={() => setIsMobileSidebarOpen(false)}>
                      <div className={`group/item flex items-center px-4 py-3 rounded-2xl transition-all relative ${isActive ? 'bg-[#3B7EF8]/10 text-white shadow-inner' : 'text-slate-400 hover:text-slate-100 hover:bg-slate-500/5'}`}>
                         <item.icon className={`w-5 h-5 mr-4 transition-all ${isActive ? 'text-[#3B7EF8]' : 'text-slate-500'}`} />
                         <span className={`text-[13px] font-black uppercase tracking-wider`}>{item.label}</span>
                         {isActive && <div className="absolute left-0 w-1 h-6 bg-[#3B7EF8] rounded-r-full" />}
                      </div>
                    </Link>
                  );
               })}
            </div>

            <div className="space-y-2">
               <p className="text-[10px] font-black text-slate-600 uppercase tracking-[0.25em] px-4 mb-4 font-mono underline decoration-white/10 underline-offset-8">Tableros_Explorer</p>
               {workspace.folders.map(folder => (
                  <div key={folder.id} className="mb-4">
                     <button onClick={() => toggleFolder(folder.id)} className="w-full flex items-center px-4 py-3 text-slate-400 hover:bg-slate-500/5 rounded-2xl transition-all">
                        {expandedFolders[folder.id] ? <ChevronDown className="w-4 h-4 mr-3 text-slate-600" /> : <ChevronRight className="w-4 h-4 mr-3 text-slate-600" />}
                        <Folder className={`w-4 h-4 mr-4 ${expandedFolders[folder.id] ? 'text-[#3B7EF8]' : 'text-slate-600'}`} />
                        <span className="text-sm font-bold truncate">{folder.name}</span>
                     </button>
                     {expandedFolders[folder.id] && (
                        <div className="mt-2 space-y-1 pl-4 border-l border-[var(--border-color)] ml-6">
                           {folder.boards.map(board => (
                             <Link key={board.id} href={board.path} onClick={() => setIsMobileSidebarOpen(false)}>
                               <div className={`px-4 py-2 rounded-xl text-xs font-medium transition-all ${(pathname || '').includes(board.id) ? 'text-[#3B7EF8] bg-[#3B7EF8]/5 font-black' : 'text-slate-500 hover:text-[var(--text-primary)] hover:bg-slate-500/5'}`}>
                                  # {board.name}
                               </div>
                             </Link>
                           ))}
                        </div>
                     )}
                  </div>
               ))}
            </div>
         </div>
         
         {/* Sección de perfil y logout en móvil */}
         <div className="lg:hidden p-4 border-t border-[var(--border-color)] bg-[var(--bg-secondary)] flex flex-col gap-3">
            <div className="flex items-center gap-3 px-2 py-1">
              <div className="w-9 h-9 bg-gradient-to-tr from-[#3B7EF8] to-emerald-500 rounded-xl flex items-center justify-center text-white text-xs font-black shadow-md border border-white/10">M</div>
              <div className="flex flex-col min-w-0">
                <span className="text-xs font-bold text-white truncate">Mantenix Operator</span>
                <span className="text-[10px] text-slate-500 truncate">{user?.email}</span>
              </div>
            </div>
            <button 
              onClick={handleLogout} 
              className="w-full py-2.5 bg-rose-500/10 hover:bg-rose-500 text-rose-500 hover:text-white rounded-xl text-xs font-black uppercase tracking-wider transition-all flex items-center justify-center gap-2 border border-rose-500/20"
            >
              <LogOut size={14} /> Cerrar Sesión
            </button>
         </div>
      </aside>

      {/* Main Content Wrapper (Corrected Layout Flow) */}
      <div className="flex-1 flex flex-col min-h-0 overflow-hidden relative">
          
          {/* Mobile Header (In flex flow to avoid overlap) */}
          <header className="lg:hidden h-[64px] bg-[var(--bg-secondary)] border-b border-[var(--border-color)] flex items-center justify-between px-6 backdrop-blur-md flex-shrink-0 z-50">
            <div className="flex items-center gap-4">
              <button onClick={() => setIsMobileSidebarOpen(true)} className="p-2 text-slate-400 hover:bg-slate-500/5 rounded-xl">
                <Menu className="w-6 h-6" />
              </button>
              <div className="scale-90 origin-left">
                <MantenixLogo size="sm" withText={true} />
              </div>
            </div>
            <NotificationBell />
            <OfflineIndicator />
          </header>

          <main className="flex-1 overflow-y-auto bg-[var(--bg-primary)] custom-scrollbar relative min-h-0">
            {children}
          </main>
      </div>

      {/* Notifications/News Modals (Global) */}
      <NewsModal isOpen={isNewsModalOpen} onClose={() => setIsNewsModalOpen(false)} />
      <SearchModal isOpen={isSearchModalOpen} onClose={() => setIsSearchModalOpen(false)} workspace={workspace} />
      <NewBoardModal isOpen={isNewBoardModalOpen} onClose={() => setIsNewBoardBoardModalOpen(false)} onCreate={handleCreateBoard} />

      <style jsx global>{`
        .custom-scrollbar::-webkit-scrollbar { width: 6px; }
        .custom-scrollbar::-webkit-scrollbar-thumb { background: rgba(255, 255, 255, 0.05); border-radius: 10px; }
        .custom-scrollbar::-webkit-scrollbar-track { background: transparent; }
      `}</style>
    </div>
  );
}