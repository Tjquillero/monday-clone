'use client';

import { useSyncExternalStore } from 'react';

export interface CopilotPlannerContext {
  groupId: string | null;
  groupTitle?: string | null;
  weekStart: string | null;
}

export const EMPTY_CONTEXT: Readonly<CopilotPlannerContext> = Object.freeze({
  groupId: null,
  groupTitle: null,
  weekStart: null,
});

let currentContext: CopilotPlannerContext = EMPTY_CONTEXT;

const listeners = new Set<() => void>();

function notify() {
  listeners.forEach((listener) => {
    try {
      listener();
    } catch {
      // Ignorar errores en callbacks de listeners
    }
  });
}

export function setCopilotPlannerContext(ctx: Partial<CopilotPlannerContext>) {
  currentContext = {
    ...currentContext,
    ...ctx,
  };
  notify();
}

export function clearCopilotPlannerContext() {
  currentContext = EMPTY_CONTEXT;
  notify();
}

export function getCopilotPlannerContext(): CopilotPlannerContext {
  return currentContext;
}

export function useCopilotPlannerContext(): CopilotPlannerContext {
  return useSyncExternalStore(
    (onStoreChange) => {
      listeners.add(onStoreChange);
      return () => {
        listeners.delete(onStoreChange);
      };
    },
    () => currentContext,
    () => EMPTY_CONTEXT
  );
}
