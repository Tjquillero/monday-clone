'use client';

// Documentos — Biblioteca Documental de Mantenix (Fase 1, ver docs/operacion/README.md).
// Resolución de board idéntica a /dashboard: nunca un fallback arbitrario
// ("board más reciente"), siempre vía membresía real (resolveBoardNavigation) —
// ver [[feedback_hook_no_implicit_fallback]] / project_boardid_propagation_bug.

import { useEffect, useMemo, useState } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import { ChevronRight, FileText, AlertTriangle } from 'lucide-react';
import Link from 'next/link';
import { useAuth } from '@/contexts/AuthContext';
import { useUserBoards } from '@/hooks/useUserBoards';
import { resolveBoardNavigation } from '@/lib/resolveBoardNavigation';
import BoardSelector from '@/components/BoardSelector';
import OperationalDocumentsContainer from '@/components/views/OperationalDocumentsContainer';

export default function DocumentosPage() {
  const { user } = useAuth();
  const searchParams = useSearchParams();
  const router = useRouter();

  const boardIdParam = searchParams ? searchParams.get('boardId') : null;
  const [boardId, setBoardId] = useState<string | null>(boardIdParam);

  const { data: userBoards, isLoading: userBoardsLoading } = useUserBoards(!boardId ? user?.id : undefined);

  const navigationDecision = useMemo(
    () => (!boardId && userBoards ? resolveBoardNavigation(userBoards, null) : null),
    [boardId, userBoards],
  );

  useEffect(() => {
    if (!boardId && navigationDecision?.action === 'redirect') {
      setBoardId(navigationDecision.boardId);
    }
  }, [boardId, navigationDecision]);

  if (!boardId) {
    if (userBoardsLoading || navigationDecision?.action === 'redirect') {
      return (
        <div className="flex h-[60vh] items-center justify-center">
          <div className="w-10 h-10 border-4 border-[#3B7EF8] border-t-transparent rounded-full animate-spin" />
        </div>
      );
    }

    if (navigationDecision?.action === 'empty') {
      return (
        <div className="flex h-[60vh] items-center justify-center p-6 text-center">
          <div className="max-w-md space-y-4">
            <div className="w-16 h-16 bg-slate-100 rounded-full flex items-center justify-center mx-auto text-slate-400">
              <AlertTriangle className="w-8 h-8" />
            </div>
            <h2 className="text-lg font-bold text-slate-800">No perteneces a ningún tablero</h2>
            <p className="text-slate-500 text-sm">Pide al administrador que te agregue como miembro de un tablero.</p>
          </div>
        </div>
      );
    }

    if (navigationDecision?.action === 'select') {
      return (
        <BoardSelector
          boards={navigationDecision.boards}
          onSelect={(id) => {
            setBoardId(id);
            const p = new URLSearchParams(searchParams ? searchParams.toString() : '');
            p.set('boardId', id);
            router.push(`/documentos?${p.toString()}`);
          }}
        />
      );
    }

    return null;
  }

  return (
    <div className="p-4 md:p-8 w-full max-w-[1200px] mx-auto font-sans text-slate-800">
      <div className="mb-6 md:mb-8">
        <div className="flex items-center space-x-2 text-slate-400 text-xs mb-2">
          <Link href="/dashboard" className="hover:text-primary transition-colors">Inicio</Link>
          <ChevronRight className="w-3 h-3" />
          <span className="text-slate-600">Documentos</span>
        </div>
        <h1 className="text-2xl md:text-3xl font-bold flex items-center">
          <FileText className="w-8 h-8 mr-3 text-primary" />
          Documentos
        </h1>
        <p className="text-sm text-slate-500 mt-1">
          Biblioteca de documentos operativos — POA, Resource Analysis, Salarios y más, versionados por tipo.
        </p>
      </div>

      <OperationalDocumentsContainer boardId={boardId} />
    </div>
  );
}
