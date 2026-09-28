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
          <h2 className="text-sm font-brand font-bold uppercase tracking-widest text-[var(--text-primary)]">Selecciona un tablero</h2>
          <p className="text-xs text-[var(--text-muted)]">Perteneces a {boards.length} tableros</p>
        </div>
        <ul className="space-y-2">
          {boards.map((b) => (
            <li key={b.id}>
              <button
                onClick={() => onSelect(b.id)}
                className="w-full flex items-center gap-3 px-4 py-3 rounded-[var(--radius-control)] border border-[var(--border-color)] bg-[var(--card-bg)] hover:bg-[var(--color-surface-subtle)] hover:border-[var(--color-primary)]/40 transition-all text-left shadow-[var(--shadow-card)]"
              >
                <Briefcase className="w-4 h-4 text-[var(--color-primary)] dark:text-[var(--color-accent)] shrink-0" />
                <span className="text-sm font-semibold text-[var(--text-primary)]">{b.name}</span>
              </button>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
