'use client';

import { useEffect, useState } from 'react';
import { 
  Search, Bell, Plus, Layout, Users, Megaphone, 
  Home, CheckSquare, ChevronLeft, ChevronRight, Folder, ChevronDown,
  Menu, X as CloseIcon, LogOut, Target, PanelLeft, Briefcase
} from 'lucide-react';
import Link from 'next/link';
import { useRouter, usePathname } from 'next/navigation';
import Image from 'next/image';
import NotificationBell from './NotificationBell';
import NewsModal from '@/components/modals/NewsModal';
import SearchModal from '@/components/modals/SearchModal';
import NewBoardModal from '@/components/modals/NewBoardModal';
import { supabase } from '@/lib/supabaseClient';
import { useUI } from '@/contexts/UIContext';
import { useAuth } from '@/contexts/AuthContext';
import { useTemplates } from '@/hooks/useTemplates';
import { usePermissions, PERMISSIONS } from '@/hooks/usePermissions';

const SIDEBAR_ITEMS = [
  { icon: Home, label: 'Inicio', path: '/dashboard' },
  { icon: Briefcase, label: 'Planificación y Recursos', path: '/projects' },
  { icon: CheckSquare, label: 'Mis tareas', path: '/my-work' },
  { icon: Target, label: 'Objetivos', path: '/okrs' },
];

export default function ProfessionalLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const { sidebarOpen, setSidebarOpen } = useUI();
  const { user } = useAuth();
  const { can } = usePermissions();
  
  const [isMobileSidebarOpen, setIsMobileSidebarOpen] = useState(false);
  const [isUserMenuOpen, setIsUserMenuOpen] = useState(false);
  const [isNewsModalOpen, setIsNewsModalOpen] = useState(false);
  const [isSearchModalOpen, setIsSearchModalOpen] = useState(false);
  const [isNewBoardModalOpen, setIsNewBoardBoardModalOpen] = useState(false);
  const [selectedFolderForNewBoard, setSelectedFolderForNewBoard] = useState<string | null>(null);
  const [expandedFolders, setExpandedFolders] = useState<Record<string, boolean>>({ 'main': true });
  
  const handleLogout = async () => {
    await supabase.auth.signOut();
    router.push('/login');
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
      const { data: newBoard, error: boardError } = await supabase
        .from('boards')
        .insert({ name, owner_id: user.id })
        .select()
        .single();

      if (boardError) throw boardError;

      if (templateId) {
        const template = templates.find(t => t.id === templateId);
        if (template && template.structure) {
          const { groups: templateGroups, columns: templateColumns } = template.structure as any;
          if (templateColumns && templateColumns.length > 0) {
            await supabase.from('board_columns').insert(
              templateColumns.map((c: any, index: number) => ({
                board_id: newBoard.id,
                title: c.title,
                type: c.type,
                width: c.width || 150,
                position: index
              }))
            );
          }
          if (templateGroups && templateGroups.length > 0) {
            await supabase.from('groups').insert(
              templateGroups.map((g: any, index: number) => ({
                board_id: newBoard.id,
                title: g.title,
                color: g.color || '#c4c4c4',
                position: index
              }))
            );
          }
        }
      } else {
        await supabase.from('board_columns').insert([
          { board_id: newBoard.id, title: 'Estado', type: 'status', position: 0 },
          { board_id: newBoard.id, title: 'Responsable', type: 'people', position: 1 },
          { board_id: newBoard.id, title: 'Fecha', type: 'date', position: 2 }
        ]);
        await supabase.from('groups').insert({ board_id: newBoard.id, title: 'Grupo 1', position: 0 });
      }

      setWorkspace(prev => ({
        ...prev,
        folders: prev.folders.map(f => f.id === selectedFolderForNewBoard ? {
          ...f,
          boards: [...f.boards, { 
            id: newBoard.id, 
            name: newBoard.name, 
            path: `/dashboard?id=${newBoard.id}`,
            active: false 
          }]
        } : f)
      }));

      router.push(`/dashboard?id=${newBoard.id}`);
      
    } catch (error) {
      console.error('Error creating board:', error);
      alert('Error al crear el tablero. Por favor intente de nuevo.');
    }
  };

  return (
    <div className="flex h-screen bg-[#f5f6f8] overflow-hidden font-sans">
      <div className="lg:hidden fixed top-0 left-0 right-0 h-[64px] bg-white border-b border-gray-200 z-[60] flex items-center justify-between px-4">
        <div className="flex items-center space-x-2">
          <button onClick={() => setIsMobileSidebarOpen(true)} className="p-2 -ml-2 text-gray-500 hover:bg-gray-100 rounded-lg">
            <Menu className="w-6 h-6" />
          </button>
          <Image src="/logo-new.png" alt="Logo" width={32} height={32} className="object-contain" />
          <span className="font-bold text-gray-800">Mantenix</span>
        </div>
        <div className="flex items-center space-x-2">
          <button onClick={() => setIsSearchModalOpen(true)} className="p-2 text-gray-400 hover:bg-gray-100 rounded-lg">
            <Search className="w-5 h-5" />
          </button>
          <button onClick={() => setIsNewsModalOpen(true)} className="p-2 text-gray-400 hover:bg-gray-100 rounded-lg">
            <Megaphone className="w-5 h-5" />
          </button>
          <div className="relative">
             <button onClick={() => setIsUserMenuOpen(!isUserMenuOpen)} className="w-8 h-8 bg-purple-500 rounded-full flex items-center justify-center text-white text-xs shadow-sm">P</button>
            {isUserMenuOpen && (
              <div className="absolute right-0 top-full mt-2 w-48 bg-white rounded-xl shadow-xl border border-gray-100 py-2 z-[100] animate-in fade-in zoom-in-95 duration-200">
                 <button onClick={handleLogout} className="w-full text-left px-4 py-2 text-sm text-red-600 hover:bg-red-50 font-bold flex items-center transition-colors">
                   <LogOut className="w-4 h-4 mr-2" /> Cerrar Sesión
                 </button>
              </div>
            )}
          </div>
        </div>
      </div>

      {isMobileSidebarOpen && (
        <div className="fixed inset-0 bg-black/50 z-[70] lg:hidden" onClick={() => setIsMobileSidebarOpen(false)} />
      )}

      <div className="hidden lg:flex w-[64px] bg-[#1e1f21] flex-col items-center py-4 space-y-4 flex-shrink-0 z-50">
          <Link href="/dashboard" className="w-10 h-10 shadow-lg transform hover:scale-105 transition-transform">
            <Image src="/logo-new.png" alt="Logo" width={40} height={40} className="object-contain" />
          </Link>
          <button onClick={() => setIsSearchModalOpen(true)} className="p-2 text-gray-400 hover:text-white transition-colors" title="Buscar">
            <Search className="w-5 h-5" />
          </button>
          <NotificationBell />
          <button onClick={() => setSidebarOpen(!sidebarOpen)} className="p-2 text-gray-400 hover:text-white transition-colors" title="Mostrar/Ocultar Menú">
            <PanelLeft className="w-5 h-5" />
          </button>
          <div className="flex-1"></div>
          <button onClick={() => setIsNewsModalOpen(true)} className="p-2 text-gray-400 hover:text-white transition-colors relative group" title="Reportar Novedad">
            <Megaphone className="w-5 h-5" />
          </button>
          {can(PERMISSIONS.EDIT_BOARD_SETTINGS) && (
            <button onClick={() => openNewBoardModal('main')} className="p-2 text-gray-400 hover:text-white transition-colors" title="Nuevo Tablero">
              <Plus className="w-5 h-5" />
            </button>
          )}
          {can(PERMISSIONS.MANAGE_USERS) && (
            <button onClick={() => router.push('/projects')} className="p-2 text-gray-400 hover:text-white transition-colors" title="Personal y Recursos">
              <Users className="w-5 h-5" />
            </button>
          )}
          <div className="relative group/user">
            <button onClick={() => setIsUserMenuOpen(!isUserMenuOpen)} className="w-8 h-8 bg-purple-500 rounded-full flex items-center justify-center text-white text-xs hover:ring-2 hover:ring-purple-200 transition-all cursor-pointer shadow-sm">P</button>
            {isUserMenuOpen && (
              <div className="absolute left-full bottom-0 ml-2 w-56 bg-white rounded-xl shadow-2xl border border-gray-100 py-2 z-[100] animate-in fade-in zoom-in-95 duration-200">
                 <div className="px-4 py-3 border-b border-gray-50 mb-1">
                    <p className="text-sm font-bold text-gray-800">Cuenta</p>
                    <p className="text-[10px] text-gray-400 font-medium">usuario@mantenix.com</p>
                 </div>
                 <button onClick={handleLogout} className="w-full text-left px-4 py-2.5 text-sm text-red-600 hover:bg-red-50 font-bold flex items-center transition-colors">
                   <LogOut className="w-4 h-4 mr-2" /> Cerrar Sesión
                 </button>
              </div>
            )}
          </div>
      </div>

      <div className={`
        fixed inset-y-0 left-0 w-[280px] z-[80] bg-white transform transition-transform duration-300 lg:relative lg:translate-x-0 lg:z-30
        ${isMobileSidebarOpen ? 'translate-x-0' : '-translate-x-full lg:translate-x-0'}
        ${sidebarOpen ? 'lg:w-[260px]' : 'lg:w-0'}
        border-r border-gray-200 flex flex-col group
      `}>
         <div className="p-4 flex items-center justify-between border-b border-gray-100 h-[64px] overflow-hidden flex-shrink-0">
            <span className="font-bold text-[#323338] truncate whitespace-nowrap">Mantenix Workspace</span>
            <div className="flex items-center">
              <button onClick={() => setSidebarOpen(false)} className="hidden lg:block p-1 hover:bg-gray-100 rounded text-gray-400 opacity-0 group-hover:opacity-100 transition-opacity">
                 <ChevronLeft className="w-4 h-4" />
              </button>
              <button onClick={() => setIsMobileSidebarOpen(false)} className="lg:hidden p-1 hover:bg-gray-100 rounded text-gray-400">
                 <CloseIcon className="w-5 h-5" />
              </button>
            </div>
         </div>
         <div className="py-4 overflow-y-auto flex-1">
            <div className="px-2 space-y-1 mb-6">
               {SIDEBAR_ITEMS.map((item, idx) => {
                  const isActive = pathname === item.path;
                  return (
                    <Link key={idx} href={item.path} onClick={() => setIsMobileSidebarOpen(false)}>
                      <div className={`flex items-center px-2 py-2 rounded transition-colors ${isActive ? 'bg-primary/10 text-primary' : 'text-[#323338] hover:bg-gray-100'}`}>
                         <item.icon className={`w-4 h-4 mr-3 ${isActive ? 'text-primary' : 'text-gray-500'}`} />
                         <span className="text-sm font-medium">{item.label}</span>
                      </div>
                    </Link>
                  );
               })}
            </div>
            <div className="px-2">
               <div className="flex items-center justify-between px-2 mb-2">
                  <span className="text-[11px] font-bold text-gray-400 uppercase tracking-wider">Tableros</span>
                  {can(PERMISSIONS.EDIT_BOARD_SETTINGS) && (
                    <button className="p-1 hover:bg-gray-100 rounded text-gray-400">
                       <Plus className="w-3 h-3" />
                    </button>
                  )}
               </div>
               {workspace.folders.map(folder => (
                  <div key={folder.id} className="mb-2">
                     <button onClick={() => toggleFolder(folder.id)} className="w-full flex items-center px-2 py-1.5 text-gray-600 hover:bg-gray-50 rounded group/folder overflow-hidden">
                        <div className="flex items-center min-w-0 flex-1">
                          {expandedFolders[folder.id] ? <ChevronDown className="w-3 h-3 mr-2 flex-shrink-0" /> : <ChevronRight className="w-3 h-3 mr-2 flex-shrink-0" />}
                          <Folder className="w-4 h-4 mr-3 text-gray-400 flex-shrink-0" />
                          <span className="text-sm font-medium truncate">{folder.name}</span>
                        </div>
                        {can(PERMISSIONS.EDIT_BOARD_SETTINGS) && (
                          <Plus className="w-3 h-3 opacity-0 group-hover/folder:opacity-100 transition-opacity hover:text-primary flex-shrink-0 ml-2" onClick={(e) => { e.stopPropagation(); openNewBoardModal(folder.id); }} />
                        )}
                     </button>
                     {expandedFolders[folder.id] && (
                        <div className="ml-6 mt-1 space-y-1">
                           {folder.boards.map(board => {
                              const isBoardActive = pathname === board.path && board.active;
                              return (
                                <Link href={board.path} key={board.id} onClick={() => setIsMobileSidebarOpen(false)}>
                                  <div className={`flex items-center px-2 py-1.5 rounded cursor-pointer transition-colors ${isBoardActive ? 'bg-primary/10 text-primary' : 'text-gray-500 hover:bg-gray-100'}`}>
                                     <div className="w-3 h-3 rounded-sm mr-4 flex-shrink-0" style={{ backgroundColor: isBoardActive ? 'var(--color-primary)' : '#c4c4c4' }}></div>
                                     <span className="text-sm truncate">{board.name}</span>
                                  </div>
                                </Link>
                              );
                           })}
                        </div>
                     )}
                  </div>
               ))}
            </div>
         </div>
      </div>

      {!sidebarOpen && (
        <button onClick={() => setSidebarOpen(true)} className="hidden lg:flex fixed left-[64px] top-1/2 -translate-y-1/2 bg-white border border-gray-200 border-l-0 rounded-r-full p-1 shadow-md hover:bg-gray-50 z-40 transition-all hover:pl-2">
          <ChevronRight className="w-4 h-4 text-primary" />
        </button>
      )}

      <div className="flex-1 flex flex-col overflow-hidden relative pt-[64px] lg:pt-0">
        <main className="flex-1 overflow-y-auto">
          {children}
        </main>
      </div>
      <NewsModal isOpen={isNewsModalOpen} onClose={() => setIsNewsModalOpen(false)} />
      <SearchModal isOpen={isSearchModalOpen} onClose={() => setIsSearchModalOpen(false)} workspace={workspace} />
      <NewBoardModal isOpen={isNewBoardModalOpen} onClose={() => setIsNewBoardBoardModalOpen(false)} onCreate={handleCreateBoard} />
    </div>
  );
}