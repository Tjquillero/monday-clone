import {
  getColumnValueKey,
  getColumnLabel,
  getColumnLabelColor,
  getColumnLabelTitle,
} from './columnUtils';

const STATUS_COL = {
  id: 'a1b2c3d4-0000-0000-0000-000000000000',
  key: 'status' as string | null,
  title: 'Estado',
  type: 'status',
  width: 140,
  options: {
    labels: [
      { id: 'Not Started', title: 'Pendiente',  color: '#334155' },
      { id: 'Working on it', title: 'En proceso', color: '#F59E0B' },
      { id: 'Done',          title: 'Completado', color: '#10B981' },
    ],
    default: 'Not Started',
  },
};

const USER_COL = {
  id: 'b2c3d4e5-0000-0000-0000-000000000001',
  key: null as string | null,
  title: 'Zona',
  type: 'text',
  width: 150,
};

describe('getColumnValueKey', () => {
  it('returns key when column has a semantic key', () => {
    expect(getColumnValueKey(STATUS_COL)).toBe('status');
  });

  it('returns id when key is null (user-created column)', () => {
    expect(getColumnValueKey(USER_COL)).toBe('b2c3d4e5-0000-0000-0000-000000000001');
  });

  it('returns id when key is undefined (legacy/unhydrated column)', () => {
    const legacy = { id: 'legacy-uuid', title: 'Old', type: 'text', width: 100 };
    expect(getColumnValueKey(legacy)).toBe('legacy-uuid');
  });

  it('never returns null or undefined', () => {
    expect(getColumnValueKey(STATUS_COL)).toBeTruthy();
    expect(getColumnValueKey(USER_COL)).toBeTruthy();
  });
});

describe('getColumnLabel', () => {
  it('finds a label by its stored id', () => {
    const label = getColumnLabel(STATUS_COL, 'Done');
    expect(label).toEqual({ id: 'Done', title: 'Completado', color: '#10B981' });
  });

  it('returns undefined for unknown value', () => {
    expect(getColumnLabel(STATUS_COL, 'Unknown')).toBeUndefined();
  });

  it('returns undefined for a column without labels', () => {
    expect(getColumnLabel(USER_COL, 'anything')).toBeUndefined();
  });
});

describe('getColumnLabelColor', () => {
  it('returns the label color for a known value', () => {
    expect(getColumnLabelColor(STATUS_COL, 'Working on it')).toBe('#F59E0B');
  });

  it('falls back to neutral gray for unknown value', () => {
    expect(getColumnLabelColor(STATUS_COL, 'Nonexistent')).toBe('#334155');
  });

  it('falls back to neutral gray for a column without labels', () => {
    expect(getColumnLabelColor(USER_COL, 'x')).toBe('#334155');
  });
});

describe('getColumnLabelTitle', () => {
  it('returns the translated title for a known value', () => {
    expect(getColumnLabelTitle(STATUS_COL, 'Not Started')).toBe('Pendiente');
  });

  it('falls back to the raw stored value when label not found', () => {
    expect(getColumnLabelTitle(STATUS_COL, 'CustomValue')).toBe('CustomValue');
  });
});
