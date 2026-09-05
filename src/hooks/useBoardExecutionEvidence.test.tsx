import { renderHook, waitFor } from '@testing-library/react';
import { useBoardExecutionEvidence } from './useBoardExecutionEvidence';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import React from 'react';

// Mock Supabase Client and Realtime Channel
jest.mock('@/lib/supabaseClient', () => {
  const mockChannel = {
    on: jest.fn().mockReturnThis(),
    subscribe: jest.fn().mockReturnThis(),
  };

  return {
    supabase: {
      from: jest.fn().mockReturnValue({
        select: jest.fn().mockReturnValue({
          eq: jest.fn().mockReturnValue({
            order: jest.fn().mockResolvedValue({
              data: [
                {
                  id: 'att-1',
                  execution_id: 'exec-101',
                  file_name: 'foto_antes_plaza.jpg',
                  file_url: 'https://storage.supabase.co/execution/foto_antes_plaza.jpg',
                  file_type: 'image/jpeg',
                  file_size: 1024500,
                  uploaded_by: 'user-1',
                  phase: 'before',
                  file_hash: 'hash-abc-123',
                  created_at: '2026-09-03T10:00:00Z',
                  weekly_plan_item_executions: {
                    execution_date: '2026-09-03',
                    status: 'reported',
                    crew_name: 'Cuadrilla Norte',
                    weekly_plan_items: {
                      activity_key: 'poda_arboles',
                      poa_activity_zone_id: 'zone-1',
                      weekly_plans: {
                        board_id: 'board-123',
                        group_id: 'group-plaza',
                      },
                    },
                  },
                },
              ],
              error: null,
            }),
          }),
        }),
      }),
      channel: jest.fn().mockReturnValue(mockChannel),
      removeChannel: jest.fn(),
    },
  };
});

// Mock offlineDB
jest.mock('@/lib/offlineDB', () => ({
  offlineDB: {
    getPendingAttachments: jest.fn().mockResolvedValue([]),
  },
}));

describe('useBoardExecutionEvidence — Contrato Realtime de Evidencia Operacional (ADR-0006 Fase 4)', () => {
  let queryClient: QueryClient;

  beforeEach(() => {
    queryClient = new QueryClient({
      defaultOptions: {
        queries: {
          retry: false,
        },
      },
    });
    jest.clearAllMocks();
  });

  const wrapper = ({ children }: { children: React.ReactNode }) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );

  it('1. Fetches synced operational evidence from execution_attachments', async () => {
    const { result } = renderHook(() => useBoardExecutionEvidence('board-123', true), { wrapper });

    await waitFor(() => expect(result.current.isLoading).toBe(false));

    expect(result.current.attachments.length).toBeGreaterThan(0);
    expect(result.current.attachments[0].file_name).toBe('foto_antes_plaza.jpg');
    expect(result.current.attachments[0].phase).toBe('before');
  });

  it('2. Subscribes to Supabase Realtime channel postgres_changes on execution_attachments', async () => {
    const { supabase } = require('@/lib/supabaseClient');
    renderHook(() => useBoardExecutionEvidence('board-123', true), { wrapper });

    expect(supabase.channel).toHaveBeenCalledWith('realtime_execution_attachments_board-123');
  });

  it('3. Invariante de Frontera: Hook es 100% de Solo Lectura (sin useMutation para mutar evidencia)', () => {
    const { result } = renderHook(() => useBoardExecutionEvidence('board-123', true), { wrapper });
    
    // Asserts that no upload/delete mutations exist in this board evidence presentation hook
    expect((result.current as any).uploadAttachment).toBeUndefined();
    expect((result.current as any).deleteAttachment).toBeUndefined();
  });
});
