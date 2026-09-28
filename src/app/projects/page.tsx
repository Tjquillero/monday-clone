'use client';

import { useState, useMemo, useEffect, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useAuth } from '@/contexts/AuthContext';
import { useUserBoards } from '@/hooks/useUserBoards';
import { resolveBoardNavigation } from '@/lib/resolveBoardNavigation';
import BoardSelector from '@/components/BoardSelector';
import PersonnelManagement from '@/components/PersonnelManagement';
import TeamCalendar from '@/components/TeamCalendar';
import WorkloadView from '@/components/WorkloadView';
import { 
  Users, Calendar, BarChart3, AlertTriangle, Briefcase
} from 'lucide-react';

function PlanningPageContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { user } = useAuth();
  const [activeTab, setActiveTab] = useState<'personnel' | 'calendar' | 'workload'>('personnel');

  const rawBoardId = searchParams ? searchParams.get('boardId') : null;

  // Carga de tableros autorizados para el usuario
  const { data: userBoards, isLoading: userBoardsLoading } = useUserBoards(user?.id);
  const [lastUsedBoardId, setLastUsedBoardId] = useState<string | null>(null);

  useEffect(() => {
    if (typeof window !== 'undefined') {
      setLastUsedBoardId(window.localStorage.getItem('mantenix_last_board_id'));
    }
  }, []);

  // Validación estricta de autorización: solo se acepta rawBoardId si está en userBoards
  const isAuthorized = useMemo(() => {
    if (!rawBoardId || !userBoards) return false;
    return userBoards.some((b) => b.id === rawBoardId);
  }, [rawBoardId, userBoards]);

  const effectiveBoardId = isAuthorized ? (rawBoardId as string) : undefined;

  // Resolución canónica cuando no hay boardId válido y autorizado
  const navigationDecision = useMemo(() => {
    if (effectiveBoardId || !userBoards) return null;
    return resolveBoardNavigation(userBoards, lastUsedBoardId);
  }, [effectiveBoardId, userBoards, lastUsedBoardId]);

  useEffect(() => {
    if (navigationDecision?.action !== 'redirect') return;
    const p = new URLSearchParams(searchParams ? searchParams.toString() : '');
    p.set('boardId', navigationDecision.boardId);
    router.replace(`/projects?${p.toString()}`);
  }, [navigationDecision, searchParams, router]);

  useEffect(() => {
    if (effectiveBoardId && typeof window !== 'undefined') {
      window.localStorage.setItem('mantenix_last_board_id', effectiveBoardId);
    }
  }, [effectiveBoardId]);

  const handleSelectBoard = (newBoardId: string) => {
    if (typeof window !== 'undefined') {
      window.localStorage.setItem('mantenix_last_board_id', newBoardId);
    }
    const p = new URLSearchParams(searchParams ? searchParams.toString() : '');
    p.set('boardId', newBoardId);
    router.push(`/projects?${p.toString()}`);
  };

  // 1. Estado de Carga
  if (!effectiveBoardId) {
    if (userBoardsLoading || navigationDecision?.action === 'redirect') {
      return (
        <div className="flex h-[600px] items-center justify-center">
          <div className="flex flex-col items-center gap-4">
            <div className="w-10 h-10 border-4 border-[var(--color-primary)] border-t-transparent rounded-full animate-spin" />
            <p className="text-xs font-bold uppercase tracking-wider text-[var(--text-secondary)] animate-pulse">
              Cargando contexto de planificación...
            </p>
          </div>
        </div>
      );
    }

    // 2. Estado Vacío: Sin tableros autorizados
    if (navigationDecision?.action === 'empty') {
      return (
        <div className="flex h-[600px] items-center justify-center p-6 text-center">
          <div className="max-w-md space-y-4">
            <div className="w-16 h-16 bg-amber-500/10 rounded-full flex items-center justify-center mx-auto text-amber-500 border border-amber-500/20">
              <AlertTriangle className="w-8 h-8" />
            </div>
            <h2 className="text-lg font-bold text-[var(--text-primary)]">No perteneces a ningún tablero</h2>
            <p className="text-xs text-[var(--text-secondary)]">
              Pide al administrador que te asigne a un tablero operativo para gestionar personal, cuadrillas y recursos.
            </p>
          </div>
        </div>
      );
    }

    // 3. Selector Explícito: Múltiples tableros sin selección previa
    if (navigationDecision?.action === 'select') {
      return (
        <BoardSelector
          boards={navigationDecision.boards}
          onSelect={handleSelectBoard}
        />
      );
    }
  }

  const currentBoard = userBoards?.find((b) => b.id === effectiveBoardId);

  return (
    <div className="p-4 md:p-8 w-full max-w-[1400px] mx-auto font-sans text-[var(--text-primary)]">
      {/* Header */}
      <div className="mb-8 flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="brand-title text-2xl md:text-3xl text-[var(--text-primary)] mb-2 tracking-tight">
            Planificación y Recursos
          </h1>
          <p className="text-[var(--text-secondary)] text-sm md:text-base font-normal">
            Gestiona tu equipo, asignaciones y carga de trabajo en un solo lugar.
          </p>
        </div>

        {/* Selector / Indicador de Tablero Activo */}
        {userBoards && userBoards.length > 0 && effectiveBoardId && (
          <div className="flex items-center gap-2 bg-[var(--card-bg)] border border-[var(--border-color)] px-3 py-2 rounded-[var(--radius-control)] shadow-xs">
            <Briefcase className="w-4 h-4 text-[var(--color-primary)] shrink-0" />
            <span className="text-xs font-bold text-[var(--text-muted)] uppercase">Tablero:</span>
            {userBoards.length > 1 ? (
              <select
                value={effectiveBoardId}
                onChange={(e) => handleSelectBoard(e.target.value)}
                className="text-xs font-bold bg-transparent text-[var(--text-primary)] outline-none cursor-pointer pr-2"
                aria-label="Seleccionar tablero operativo"
              >
                {userBoards.map((b) => (
                  <option key={b.id} value={b.id} className="bg-[var(--card-bg)] text-[var(--text-primary)]">
                    {b.name}
                  </option>
                ))}
              </select>
            ) : (
              <span className="text-xs font-bold text-[var(--text-primary)]">
                {currentBoard?.name || 'Tablero Activo'}
              </span>
            )}
          </div>
        )}
      </div>

      {/* Tabs */}
      <div className="flex items-center space-x-1 border-b border-[var(--border-color)] mb-8 bg-[var(--bg-secondary)]/80 backdrop-blur-sm sticky top-0 z-20">
        <button
          onClick={() => setActiveTab('personnel')}
          className={`flex items-center px-6 py-3.5 text-xs md:text-sm font-semibold border-b-2 transition-all ${
            activeTab === 'personnel'
              ? 'border-[var(--color-primary)] text-[var(--color-primary)] dark:text-[var(--text-primary)] bg-[var(--color-primary-subtle)] font-bold'
              : 'border-transparent text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--color-surface-subtle)]'
          }`}
        >
          <Users className="w-4 h-4 mr-2" />
          Directorio y Dotación
        </button>
        <button
          onClick={() => setActiveTab('calendar')}
          className={`flex items-center px-6 py-3.5 text-xs md:text-sm font-semibold border-b-2 transition-all ${
            activeTab === 'calendar'
              ? 'border-[var(--color-primary)] text-[var(--color-primary)] dark:text-[var(--text-primary)] bg-[var(--color-primary-subtle)] font-bold'
              : 'border-transparent text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--color-surface-subtle)]'
          }`}
        >
          <Calendar className="w-4 h-4 mr-2" />
          Calendario de Equipo
        </button>
        <button
          onClick={() => setActiveTab('workload')}
          className={`flex items-center px-6 py-3.5 text-xs md:text-sm font-semibold border-b-2 transition-all ${
            activeTab === 'workload'
              ? 'border-[var(--color-primary)] text-[var(--color-primary)] dark:text-[var(--text-primary)] bg-[var(--color-primary-subtle)] font-bold'
              : 'border-transparent text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--color-surface-subtle)]'
          }`}
        >
          <BarChart3 className="w-4 h-4 mr-2" />
          Carga de Trabajo
        </button>
      </div>

      {/* Content */}
      <div className="min-h-[600px] pb-20">
        {activeTab === 'personnel' && (
          <div className="animate-in fade-in slide-in-from-left-4 duration-500">
            <PersonnelManagement boardId={effectiveBoardId} />
          </div>
        )}

        {activeTab === 'calendar' && (
          <div className="animate-in fade-in slide-in-from-left-4 duration-500">
            <TeamCalendar />
          </div>
        )}

        {activeTab === 'workload' && (
          <div className="animate-in fade-in slide-in-from-left-4 duration-500">
            <WorkloadView />
          </div>
        )}
      </div>
    </div>
  );
}

export default function PlanningPage() {
  return (
    <Suspense fallback={
      <div className="flex h-[600px] items-center justify-center">
        <div className="w-10 h-10 border-4 border-[var(--color-primary)] border-t-transparent rounded-full animate-spin" />
      </div>
    }>
      <PlanningPageContent />
    </Suspense>
  );
}
