'use client';

import { useState } from 'react';
import { useBoardOperationalAgenda, useBoardOperationalAgendaWeek } from '@/hooks/useBoardOperationalAgenda';
import AgendaOperativaView, { AgendaTab } from '@/components/agenda/AgendaOperativaView';

// Container de la Agenda Operativa — Fase 1 (Hoy) + Fase 2 (Semana). Ver
// ADR-0006 y docs/architecture/agenda-operativa-design.md. Sin pestaña propia
// todavía en el ribbon (?view=agenda, deep-link) — se llega desde el banner
// legacy de ExecutionView o por URL directa mientras dure la Fase 1/2.
//
// El toggle Hoy/Semana vive aquí (no en la vista) porque condiciona qué hook
// se activa: useBoardOperationalAgendaWeek solo se pide cuando el usuario
// abre la pestaña Semana.

interface AgendaOperativaContainerProps {
  boardId?: string;
}

export default function AgendaOperativaContainer({ boardId }: AgendaOperativaContainerProps) {
  const [activeTab, setActiveTab] = useState<AgendaTab>('hoy');
  const { data: agenda, isLoading, isError, error } = useBoardOperationalAgenda(boardId);
  const { data: weekAgenda, isLoading: weekIsLoading, isError: weekIsError, error: weekError } =
    useBoardOperationalAgendaWeek(boardId, activeTab === 'semana');

  if (!boardId) return null;

  return (
    <AgendaOperativaView
      boardId={boardId}
      agenda={agenda}
      isLoading={isLoading}
      isError={isError}
      error={error as Error | null}
      activeTab={activeTab}
      onTabChange={setActiveTab}
      weekAgenda={weekAgenda}
      weekIsLoading={weekIsLoading}
      weekIsError={weekIsError}
      weekError={weekError as Error | null}
    />
  );
}
