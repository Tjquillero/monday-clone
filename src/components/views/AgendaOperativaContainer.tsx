'use client';

import { useBoardOperationalAgenda } from '@/hooks/useBoardOperationalAgenda';
import AgendaOperativaView from '@/components/agenda/AgendaOperativaView';

// Container de la Agenda Operativa — Fase 1 (MVP, vista Hoy). Ver ADR-0006 y
// docs/architecture/agenda-operativa-design.md. Sin pestaña propia todavía
// en el ribbon (?view=agenda, deep-link) — se llega desde el banner legacy
// de ExecutionView o por URL directa mientras dure la Fase 1/2.

interface AgendaOperativaContainerProps {
  boardId?: string;
}

export default function AgendaOperativaContainer({ boardId }: AgendaOperativaContainerProps) {
  const { data: agenda, isLoading, isError, error } = useBoardOperationalAgenda(boardId);

  if (!boardId) return null;

  return (
    <AgendaOperativaView
      boardId={boardId}
      agenda={agenda}
      isLoading={isLoading}
      isError={isError}
      error={error as Error | null}
    />
  );
}
