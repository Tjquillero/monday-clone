/**
 * Tests for column reorder logic — the pure ordering invariants that
 * don't require a real Supabase connection.
 *
 * The RPC and optimistic-update integration are covered by e2e tests.
 */

import { arrayMove } from '@dnd-kit/sortable';

// ─── Fixtures ────────────────────────────────────────────────────────────────

const makeCol = (id: string, pos: number, key: string | null = null) => ({
  id,
  key,
  title: `Col ${id}`,
  type: 'text' as const,
  width: 120,
  position: pos,
  options: {},
  required: false,
  editable: true,
  hidden: false,
});

const COL_A = makeCol('col-a', 0,  'status');  // system column
const COL_B = makeCol('col-b', 10, null);       // user column (UUID key)
const COL_C = makeCol('col-c', 20, null);
const COL_D = makeCol('col-d', 30, null);

// ─── Column reorder logic ─────────────────────────────────────────────────────

describe('column reorder — arrayMove invariants', () => {
  it('moves a column from first to last position', () => {
    const cols = [COL_A, COL_B, COL_C, COL_D];
    const result = arrayMove(cols, 0, 3);
    expect(result.map(c => c.id)).toEqual(['col-b', 'col-c', 'col-d', 'col-a']);
  });

  it('moves a column from last to first position', () => {
    const cols = [COL_A, COL_B, COL_C, COL_D];
    const result = arrayMove(cols, 3, 0);
    expect(result.map(c => c.id)).toEqual(['col-d', 'col-a', 'col-b', 'col-c']);
  });

  it('moves adjacent column one step right', () => {
    const cols = [COL_A, COL_B, COL_C, COL_D];
    const result = arrayMove(cols, 0, 1);
    expect(result.map(c => c.id)).toEqual(['col-b', 'col-a', 'col-c', 'col-d']);
  });

  it('no-op when source and destination are the same', () => {
    const cols = [COL_A, COL_B, COL_C, COL_D];
    const result = arrayMove(cols, 2, 2);
    expect(result.map(c => c.id)).toEqual(['col-a', 'col-b', 'col-c', 'col-d']);
  });

  it('preserves column count after move', () => {
    const cols = [COL_A, COL_B, COL_C, COL_D];
    const result = arrayMove(cols, 1, 3);
    expect(result).toHaveLength(4);
  });

  it('produces orderedIds for RPC from reordered array', () => {
    const cols = [COL_A, COL_B, COL_C, COL_D];
    const reordered = arrayMove(cols, 0, 2);
    const orderedIds = reordered.map(c => c.id);
    expect(orderedIds).toEqual(['col-b', 'col-c', 'col-a', 'col-d']);
  });
});

// ─── Optimistic update — cache patch logic ────────────────────────────────────

describe('optimistic update — position assignment', () => {
  it('assigns positions as multiples of 10 after reorder', () => {
    const original = [COL_A, COL_B, COL_C];
    const orderedIds = ['col-c', 'col-a', 'col-b'];
    const byId = new Map(original.map(c => [c.id, c]));
    const patched = orderedIds.map((id, i) => ({ ...byId.get(id)!, position: i * 10 }));
    expect(patched[0].position).toBe(0);
    expect(patched[1].position).toBe(10);
    expect(patched[2].position).toBe(20);
  });

  it('patched result has same column count as input', () => {
    const original = [COL_A, COL_B, COL_C, COL_D];
    const orderedIds = original.map(c => c.id);
    const byId = new Map(original.map(c => [c.id, c]));
    const patched = orderedIds.map((id, i) => ({ ...byId.get(id)!, position: i * 10 }));
    expect(patched).toHaveLength(4);
  });

  it('does not mutate original column objects', () => {
    const original = [COL_A, COL_B];
    const orderedIds = ['col-b', 'col-a'];
    const byId = new Map(original.map(c => [c.id, c]));
    orderedIds.map((id, i) => ({ ...byId.get(id)!, position: i * 10 }));
    expect(COL_A.position).toBe(0);   // original unchanged
    expect(COL_B.position).toBe(10);
  });
});

// ─── Drag identity: column.id vs column.key ───────────────────────────────────

describe('drag identity invariant — id is physical, key is semantic', () => {
  it('system column: drag id is UUID, not semantic key', () => {
    const col = COL_A; // key = 'status', id = 'col-a'
    // Drag must use col.id — never col.key
    expect(col.id).not.toBe(col.key);
    expect(col.id).toBe('col-a');
    expect(col.key).toBe('status');
  });

  it('user column: drag id is UUID; key is null', () => {
    const col = COL_B; // key = null
    expect(col.key).toBeNull();
    expect(col.id).toBe('col-b');
  });

  it('all columns in orderedIds array use id (never key)', () => {
    const cols = [COL_A, COL_B, COL_C];
    const orderedIds = arrayMove(cols, 0, 1).map(c => c.id);
    // None should be the semantic key 'status'
    expect(orderedIds).not.toContain('status');
    // All should be the UUID ids
    expect(orderedIds).toContain('col-a');
    expect(orderedIds).toContain('col-b');
  });

  it('visibleColumns use semantic key (key ?? id), not bare id for system cols', () => {
    const systemCol = COL_A;
    const userCol   = COL_B;
    const visibleKey = (c: typeof COL_A) => c.key ?? c.id;
    expect(visibleKey(systemCol)).toBe('status');  // semantic key
    expect(visibleKey(userCol)).toBe('col-b');      // fallback to UUID
  });
});

// ─── New board columns (positions start at 0 × 10) ───────────────────────────

describe('new board column positioning', () => {
  it('first column gets position 0', () => {
    const existing: typeof COL_A[] = [];
    const nextPos = ((existing[existing.length - 1]?.position ?? -10) + 10);
    expect(nextPos).toBe(0);
  });

  it('second column gets position 10', () => {
    const existing = [{ ...COL_A, position: 0 }];
    const maxPos = existing.reduce((m, c) => Math.max(m, c.position), 0);
    const nextPos = maxPos + 10;
    expect(nextPos).toBe(10);
  });

  it('gap strategy allows future insertion without full reorder', () => {
    const positions = [0, 10, 20, 30];
    // Can insert between 10 and 20 at position 15
    const insertBetween = (positions[1] + positions[2]) / 2;
    expect(insertBetween).toBe(15);
    expect(insertBetween).toBeGreaterThan(positions[1]);
    expect(insertBetween).toBeLessThan(positions[2]);
  });
});
