'use client';

import AgendaOperativaContainer from '@/components/views/AgendaOperativaContainer';
import { useBoard } from '@/hooks/useBoardData';

interface ExecutionViewContainerProps {
  boardId?: string;
  searchQuery?: string;
  selectedGroupId?: string | null;
  filters?: {
    status: string[];
    priority: string[];
    person: string[];
  };
  onOpenItem?: (groupId: string, item: any) => void;
}

export default function ExecutionViewContainer({ boardId }: ExecutionViewContainerProps) {
  const { data: board } = useBoard(boardId);
  const targetBoardId = boardId || board?.id;

  return <AgendaOperativaContainer boardId={targetBoardId} />;
}

