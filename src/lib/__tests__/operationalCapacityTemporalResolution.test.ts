/**
 * Test: Functional Verification of Temporal Resolution in Operational Capacity
 * Gate C1.4-04: Demonstrates that capacity resolution respects the planned week_start
 * rather than hardcoded today date.
 */

import { resolvePersonnelVersionForDate } from '../crewService';
import { supabase } from '../supabaseClient';

jest.mock('../supabaseClient', () => {
  const mockFrom = jest.fn();
  return {
    supabase: {
      from: mockFrom,
    },
  };
});

describe('GATE-C1.4-04: Operational Capacity Temporal Resolution Test', () => {
  const boardId = 'board-barranquilla-01';

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('resolves V1 when querying for the current/historical week (2026-09-28)', async () => {
    const mockQueryBuilder: any = {
      select: jest.fn().mockReturnThis(),
      eq: jest.fn().mockReturnThis(),
      lte: jest.fn().mockReturnThis(),
      order: jest.fn().mockReturnThis(),
      limit: jest.fn().mockReturnThis(),
      maybeSingle: jest.fn().mockResolvedValue({
        data: {
          id: 'ver-v1-uuid',
          board_id: boardId,
          version_name: 'V1 - Dotación Septiembre',
          status: 'PUBLISHED',
          effective_from: '2026-09-01',
        },
        error: null,
      }),
    };

    (supabase.from as jest.Mock).mockReturnValue(mockQueryBuilder);

    const result = await resolvePersonnelVersionForDate(boardId, '2026-09-28');

    expect(supabase.from).toHaveBeenCalledWith('personnel_versions');
    expect(mockQueryBuilder.eq).toHaveBeenCalledWith('board_id', boardId);
    expect(mockQueryBuilder.eq).toHaveBeenCalledWith('status', 'PUBLISHED');
    expect(mockQueryBuilder.lte).toHaveBeenCalledWith('effective_from', '2026-09-28');
    expect(result).not.toBeNull();
    expect(result?.id).toBe('ver-v1-uuid');
    expect(result?.version_name).toBe('V1 - Dotación Septiembre');
  });

  it('resolves V2 when querying for a planned future week (2026-10-05)', async () => {
    const mockQueryBuilder: any = {
      select: jest.fn().mockReturnThis(),
      eq: jest.fn().mockReturnThis(),
      lte: jest.fn().mockReturnThis(),
      order: jest.fn().mockReturnThis(),
      limit: jest.fn().mockReturnThis(),
      maybeSingle: jest.fn().mockResolvedValue({
        data: {
          id: 'ver-v2-uuid',
          board_id: boardId,
          version_name: 'V2 - Movilidad Octubre',
          status: 'PUBLISHED',
          effective_from: '2026-10-05',
        },
        error: null,
      }),
    };

    (supabase.from as jest.Mock).mockReturnValue(mockQueryBuilder);

    const result = await resolvePersonnelVersionForDate(boardId, '2026-10-05');

    expect(supabase.from).toHaveBeenCalledWith('personnel_versions');
    expect(mockQueryBuilder.eq).toHaveBeenCalledWith('board_id', boardId);
    expect(mockQueryBuilder.eq).toHaveBeenCalledWith('status', 'PUBLISHED');
    expect(mockQueryBuilder.lte).toHaveBeenCalledWith('effective_from', '2026-10-05');
    expect(result).not.toBeNull();
    expect(result?.id).toBe('ver-v2-uuid');
    expect(result?.version_name).toBe('V2 - Movilidad Octubre');
  });
});
