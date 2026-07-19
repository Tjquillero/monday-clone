'use client';

import { Briefcase } from 'lucide-react';
import type { UserBoardSummary } from '@/hooks/useUserBoards';

interface Props {
  boards: UserBoardSummary[];
  onSelect: (boardId: string) => void;
}

// Se muestra cuando el usuario pertenece a más de un board y no hay un
// "último usado" recordado (o dejó de ser accesible) — reemplaza el
// fallback silencioso al board más reciente de toda la base.
export default function BoardSelector({ boards, onSelect }: Props) {
  return (
    <div className="flex h-screen items-center justify-center bg-[var(--bg-primary)] p-6">
      <div className="w-full max-w-md space-y-4">
        <div className="text-center space-y-1">
          <h2 className="text-sm font-black uppercase tracking-widest text-white">Selecciona un tablero</h2>
          <p className="text-xs text-slate-500">Perteneces a {boards.length} tableros</p>
        </div>
        <ul className="space-y-2">
          {boards.map((b) => (
            <li key={b.id}>
              <button
                onClick={() => onSelect(b.id)}
                className="w-full flex items-center gap-3 px-4 py-3 rounded-xl border border-[var(--border-color)] bg-slate-500/5 hover:bg-[#3B7EF8]/10 hover:border-[#3B7EF8]/40 transition-colors text-left"
              >
                <Briefcase className="w-4 h-4 text-[#3B7EF8] shrink-0" />
                <span className="text-sm font-semibold text-slate-200">{b.name}</span>
              </button>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
