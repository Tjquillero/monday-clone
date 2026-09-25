'use client';

import { useEffect, useState } from 'react';
import {
  Search, Users, Megaphone,
  ChevronLeft, ChevronRight, Folder, ChevronDown,
  Menu, X as CloseIcon, LogOut, PanelLeft, Settings
} from 'lucide-react';
import { SIDEBAR_ITEMS } from '@/config/navigation';
import Link from 'next/link';
import { useRouter, usePathname } from 'next/navigation';

import NotificationBell from './NotificationBell';
import OfflineIndicator from './OfflineIndicator';
import SyncToast from './offline/SyncToast';
import { useOfflineSyncContext } from '@/contexts/OfflineSyncContext';
import NewsModal from '@/components/modals/NewsModal';
import SearchModal from '@/components/modals/SearchModal';
import NewBoardModal from '@/components/modals/NewBoardModal';
import MantenixLogo from '@/components/ui/MantenixLogo';
import { supabase } from '@/lib/supabaseClient';
import { useUI } from '@/contexts/UIContext';
import { useAuth } from '@/contexts/AuthContext';
import { useTemplates } from '@/hooks/useTemplates';
import { usePermissions, PERMISSIONS } from '@/hooks/usePermissions';

export default function ProfessionalLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const { sidebarOpen, setSidebarOpen } = useUI();
  const { user, signOut } = useAuth();
  const { can } = usePermissions();

  const { refreshLocalCache, isOnline } = useOfflineSyncContext();

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
        if (template) {
          if (template.columns.length > 0) {
            await supabase.from('board_columns').insert(
              template.columns.map(c => ({
                board_id: newBoard.id,
                title: c.title,
                type: c.type,
                key: c.key,
                width: c.width,
                position: c.position,
                options: c.options,
                required: c.required,
                hidden: c.hidden,
                editable: true,
              }))
            );
          }
          if (template.groups.length > 0) {
            await supabase.from('groups').insert(
              template.groups.map(g => ({
                board_id: newBoard.id,
                title: g.title,
                color: g.color,
                position: g.position,
              }))
            );
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
          <Link href="/dashboard" className="transition-transform hover:scale-105">
            <MantenixLogo size="md" />
          </Link>

          <div className="w-8 h-px bg-[var(--border-color)]" />

          <button 
            onClick={() => setIsSearchModalOpen(true)} 
            className="p-3 text-[var(--text-secondary)] hover:text-[var(--color-primary)] dark:hover:text-[var(--text-primary)] hover:bg-[var(--color-primary-subtle)] rounded-[var(--radius-control)] transition-all relative group" 
            title="Buscar (Ctrl+K)"
          >
            <Search className="w-5 h-5 group-hover:scale-110 transition-transform" />
          </button>

          <NotificationBell />
          <OfflineIndicator />

          <button 
            onClick={() => setSidebarOpen(!sidebarOpen)} 
            className={`p-3 rounded-[var(--radius-control)] transition-all group ${
              sidebarOpen 
                ? 'text-[var(--color-primary)] dark:text-[var(--text-primary)] bg-[var(--color-primary-subtle)] font-bold' 
                : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--color-surface-subtle)]'
            }`}
            title={sidebarOpen ? "Ocultar panel" : "Mostrar panel"}
          >
            <PanelLeft className="w-5 h-5 group-hover:rotate-12 transition-transform" />
          </button>

          <div className="flex-1"></div>

          <button 
            onClick={() => setIsNewsModalOpen(true)} 
            className="p-3 text-[var(--text-secondary)] hover:text-[var(--color-accent)] hover:bg-[var(--color-accent-subtle)] rounded-[var(--radius-control)] transition-all group" 
            title="Reportar Novedad"
          >
            <Megaphone className="w-5 h-5 group-hover:-rotate-12 transition-transform" />
          </button>

          {can(PERMISSIONS.MANAGE_USERS) && (
            <button 
              onClick={() => router.push('/projects')} 
              className="p-3 text-[var(--text-secondary)] hover:text-[var(--color-primary)] dark:hover:text-[var(--text-primary)] hover:bg-[var(--color-primary-subtle)] rounded-[var(--radius-control)] transition-all group" 
              title="Personal y Recursos"
            >
              <Users className="w-5 h-5 group-hover:scale-110" />
            </button>
          )}

          <div className="relative group/user px-2">
            <button 
              onClick={() => setIsUserMenuOpen(!isUserMenuOpen)} 
              className="w-10 h-10 bg-[var(--color-primary)] text-[var(--color-primary-foreground)] rounded-[var(--radius-control)] flex items-center justify-center text-xs font-black shadow-md hover:opacity-90 transition-all border border-[var(--border-color)]"
              title="Perfil de Operador"
            >
              M
            </button>
            {isUserMenuOpen && (
              <div className="absolute left-full bottom-0 mb-2 ml-4 w-64 bg-[var(--card-bg)] rounded-[var(--radius-surface)] shadow-[var(--shadow-floating)] border border-[var(--border-color)] py-3 z-[100] animate-in slide-in-from-left-2 duration-200">
                 <div className="px-5 py-4 border-b border-[var(--border-color)] mb-2">
                    <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-[var(--text-muted)] mb-1">Usuario Activo</p>
                    <p className="text-sm font-bold text-[var(--text-primary)]">Mantenix Operator</p>
                    <p className="text-[11px] text-[var(--text-secondary)] font-medium truncate">{user?.email}</p>
                 </div>
                 <button 
                   onClick={() => router.push('/settings')} 
                   className="w-full text-left px-5 py-2.5 text-xs font-semibold text-[var(--text-secondary)] hover:bg-[var(--color-surface-subtle)] hover:text-[var(--text-primary)] transition-all flex items-center gap-3"
                 >
                    <Settings size={14} /> Ajustes Perfil
                 </button>
                 <button 
                   onClick={handleLogout} 
                   className="w-full text-left px-5 py-2.5 text-xs font-semibold text-[var(--color-danger)] hover:bg-[var(--color-danger)]/10 transition-all flex items-center gap-3 mt-1"
                 >
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
               <span className="text-[10px] font-bold text-[var(--text-muted)] uppercase tracking-[0.18em]">Workspace</span>
               <span className="brand-title text-[var(--text-primary)] text-sm tracking-tight truncate">Corporativo Mantenix</span>
            </div>
            <button 
              onClick={() => setSidebarOpen(false)} 
              className="hidden lg:flex p-2 hover:bg-[var(--color-surface-subtle)] rounded-[var(--radius-control)] text-[var(--text-secondary)] hover:text-[var(--text-primary)] transition-all"
              title="Colapsar panel"
            >
               <ChevronLeft className="w-5 h-5" />
            </button>
            <button 
              onClick={() => setIsMobileSidebarOpen(false)} 
              className="lg:hidden p-2 hover:bg-[var(--color-surface-subtle)] rounded-[var(--radius-control)] text-[var(--text-secondary)]"
            >
               <CloseIcon className="w-6 h-6" />
            </button>
         </div>

         <div className="py-6 overflow-y-auto flex-1 px-4 custom-scrollbar">
            <div className="space-y-1 mb-8">
               {SIDEBAR_ITEMS.map((item) => {
                  const isActive = pathname === item.path && !pathname.includes('view') && !pathname.includes('projects');
                  return (
                    <Link key={item.label} href={item.path} onClick={() => setIsMobileSidebarOpen(false)}>
                      <div className={`group/item flex items-center px-4 py-2.5 rounded-[var(--radius-control)] transition-all relative ${
                        isActive 
                          ? 'bg-[var(--color-primary-subtle)] text-[var(--color-primary)] dark:text-[var(--text-primary)] font-bold shadow-xs' 
                          : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--color-surface-subtle)]'
                      }`}>
                         <item.icon className={`w-5 h-5 mr-3.5 transition-colors ${
                           isActive 
                             ? 'text-[var(--color-primary)] dark:text-[var(--color-accent)]' 
                             : 'text-[var(--text-muted)] group-hover/item:text-[var(--text-secondary)]'
                         }`} />
                         <span className="text-[13px] font-semibold tracking-normal">{item.label}</span>
                         {isActive && (
                           <div className="absolute left-0 w-1 h-5 bg-[var(--color-accent)] rounded-r-full" />
                         )}
                      </div>
                    </Link>
                  );
               })}
            </div>

            <div className="space-y-2">
               <p className="text-[10px] font-bold text-[var(--text-muted)] uppercase tracking-[0.2em] px-4 mb-3 font-mono">Tableros_Explorer</p>
               {workspace.folders.map(folder => (
                  <div key={folder.id} className="mb-3">
                     <button 
                       onClick={() => toggleFolder(folder.id)} 
                       className="w-full flex items-center px-4 py-2 text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--color-surface-subtle)] rounded-[var(--radius-control)] transition-all"
                     >
                        {expandedFolders[folder.id] ? <ChevronDown className="w-4 h-4 mr-2.5 text-[var(--text-muted)]" /> : <ChevronRight className="w-4 h-4 mr-2.5 text-[var(--text-muted)]" />}
                        <Folder className={`w-4 h-4 mr-3 ${expandedFolders[folder.id] ? 'text-[var(--color-accent)]' : 'text-[var(--text-muted)]'}`} />
                        <span className="text-xs font-semibold truncate">{folder.name}</span>
                     </button>
                     {expandedFolders[folder.id] && (
                        <div className="mt-1 space-y-0.5 pl-3 border-l border-[var(--border-color)] ml-6">
                           {folder.boards.map(board => (
                             <Link key={board.id} href={board.path} onClick={() => setIsMobileSidebarOpen(false)}>
                               <div className={`px-3 py-1.5 rounded-[var(--radius-control)] text-xs font-medium transition-all ${
                                 (pathname || '').includes(board.id) 
                                   ? 'text-[var(--color-primary)] dark:text-[var(--text-primary)] bg-[var(--color-primary-subtle)] font-bold' 
                                   : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--color-surface-subtle)]'
                               }`}>
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
              <div className="w-9 h-9 bg-[var(--color-primary)] text-[var(--color-primary-foreground)] rounded-[var(--radius-control)] flex items-center justify-center text-xs font-black shadow-sm border border-[var(--border-color)]">M</div>
              <div className="flex flex-col min-w-0">
                <span className="text-xs font-bold text-[var(--text-primary)] truncate">Mantenix Operator</span>
                <span className="text-[10px] text-[var(--text-muted)] truncate">{user?.email}</span>
              </div>
            </div>
            <button 
              onClick={handleLogout} 
              className="w-full py-2.5 bg-[var(--color-danger)]/10 hover:bg-[var(--color-danger)] text-[var(--color-danger)] hover:text-white rounded-[var(--radius-control)] text-xs font-bold uppercase tracking-wider transition-all flex items-center justify-center gap-2 border border-[var(--color-danger)]/20"
            >
              <LogOut size={14} /> Cerrar Sesión
            </button>
         </div>
      </aside>

      {/* Main Content Wrapper (Corrected Layout Flow) */}
      <div className="flex-1 flex flex-col min-h-0 overflow-hidden relative">
          
          {/* Mobile Header (In flex flow to avoid overlap) */}
          <header className="lg:hidden h-[64px] bg-[var(--bg-secondary)] border-b border-[var(--border-color)] flex items-center justify-between px-6 backdrop-blur-md flex-shrink-0 z-50">
            <div className="flex items-center gap-3">
              <button 
                onClick={() => setIsMobileSidebarOpen(true)} 
                className="p-2 text-[var(--text-secondary)] hover:bg-[var(--color-surface-subtle)] rounded-[var(--radius-control)]"
                title="Abrir menú"
              >
                <Menu className="w-6 h-6" />
              </button>
              <MantenixLogo size="sm" withText={true} />
            </div>
            <div className="flex items-center gap-2">
              <NotificationBell />
              <OfflineIndicator />
            </div>
          </header>

          <main className="flex-1 overflow-y-auto bg-[var(--bg-primary)] custom-scrollbar relative min-h-0">
            {children}
          </main>
      </div>

      {/* Notifications/News Modals (Global) */}
      <NewsModal isOpen={isNewsModalOpen} onClose={() => setIsNewsModalOpen(false)} />
      <SearchModal isOpen={isSearchModalOpen} onClose={() => setIsSearchModalOpen(false)} workspace={workspace} />
      <NewBoardModal isOpen={isNewBoardModalOpen} onClose={() => setIsNewBoardBoardModalOpen(false)} onCreate={handleCreateBoard} />
      <SyncToast />
    </div>
  );
}