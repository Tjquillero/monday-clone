'use client';

import { useBoard, useBoardGroups, useBoardColumns } from '@/hooks/useBoardData';
import { CustomizableDashboard } from '@/components/dashboard/CustomizableDashboard';

export default function DashboardViewContainer() {
  const { data: board, isLoading: loadingBoard } = useBoard();
  const { data: groups, isLoading: loadingGroups } = useBoardGroups(board?.id);
  const { data: columns, isLoading: loadingColumns } = useBoardColumns(board?.id);

  if (loadingBoard || loadingGroups || loadingColumns) {
    return (
      <div className="h-full flex items-center justify-center bg-slate-50/50">
        <div className="flex flex-col items-center gap-4">
          <div className="w-10 h-10 border-4 border-primary border-t-transparent rounded-full animate-spin" />
          <p className="text-slate-400 text-sm font-medium animate-pulse">Cargando Panel...</p>
        </div>
      </div>
    );
  }

  if (!board) return null;

  return (
    <div className="h-full flex flex-col">
      <CustomizableDashboard 
        boardId={board.id.toString()} 
        groups={groups || []} 
        columns={columns || []} 
      />
    </div>
  );
}
