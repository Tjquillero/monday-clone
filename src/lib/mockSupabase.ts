// Helper to check if running in browser
const isBrowser = typeof window !== 'undefined';

// Mock Session Interface
interface MockSession {
  user: {
    id: string;
    email: string;
    user_metadata: {
      role: string;
    };
  };
  expires_at: number;
}

// In-Memory Database State
let dbState: Record<string, any[]> = {
  boards: [],
  groups: [],
  board_columns: [],
  items: [],
  activity_templates: [],
  task_dependencies: [],
  personnel: [],
  comments: [],
  site_incidents: [],
  notifications: []
};

// Seed baseline data
const seedData = async () => {
  if (!isBrowser) return;
  try {
    const seeded = localStorage.getItem('sb_mock_seeded');
    if (seeded) {
      // Load state from localStorage
      Object.keys(dbState).forEach(table => {
        const stored = localStorage.getItem(`sb_mock_${table}`);
        if (stored) {
          dbState[table] = JSON.parse(stored);
        }
      });
      return;
    }

    console.log('Seeding Mock Database from public JSON files...');
    
    // Fetch files from /data/
    const [groupsRes, itemsRes] = await Promise.all([
      fetch('/data/groups.json').then(r => r.json()).catch(() => []),
      fetch('/data/items.json').then(r => r.json()).catch(() => [])
    ]);

    dbState.groups = groupsRes;
    dbState.items = itemsRes;

    // Create a default board if not present
    dbState.boards = [
      {
        id: '3ea0326f-6ff7-409f-848a-1f296e6e3cc8',
        name: 'Sitio Puerto Colombia',
        settings: {},
        owner_id: 'mock-user-id',
        created_at: new Date().toISOString()
      }
    ];

    // Create default columns
    dbState.board_columns = [
      { id: 'status', board_id: '3ea0326f-6ff7-409f-848a-1f296e6e3cc8', title: 'Estado', type: 'status', width: 140, position: 1 },
      { id: 'people', board_id: '3ea0326f-6ff7-409f-848a-1f296e6e3cc8', title: 'Personas', type: 'people', width: 150, position: 2 },
      { id: 'unit_price', board_id: '3ea0326f-6ff7-409f-848a-1f296e6e3cc8', title: 'Precio Unitario', type: 'numbers', width: 140, position: 3 },
      { id: 'cant', board_id: '3ea0326f-6ff7-409f-848a-1f296e6e3cc8', title: 'Cantidad', type: 'numbers', width: 100, position: 4 },
      { id: 'category', board_id: '3ea0326f-6ff7-409f-848a-1f296e6e3cc8', title: 'Categoría', type: 'text', width: 150, position: 5 },
      { id: 'rubro', board_id: '3ea0326f-6ff7-409f-848a-1f296e6e3cc8', title: 'Rubro Mayor', type: 'text', width: 150, position: 6 }
    ];

    // Seed default personnel
    dbState.personnel = [
      { id: 'p1', name: 'Christian Altamar', role: 'Operario' },
      { id: 'p2', name: 'Juan Perez', role: 'Supervisor' },
      { id: 'p3', name: 'Maria Gomez', role: 'Operario' }
    ];

    // Save to localStorage
    Object.keys(dbState).forEach(table => {
      localStorage.setItem(`sb_mock_${table}`, JSON.stringify(dbState[table]));
    });
    localStorage.setItem('sb_mock_seeded', 'true');
    console.log('Mock database seeded successfully.');
  } catch (err) {
    console.error('Failed to seed mock database:', err);
  }
};

// Auto-seed if in browser
if (isBrowser) {
  seedData();
}

const saveTable = (table: string) => {
  if (isBrowser) {
    localStorage.setItem(`sb_mock_${table}`, JSON.stringify(dbState[table] || []));
  }
};

// Fluent Query Builder Implementation
class MockQueryBuilder {
  private table: string;
  private filters: ((row: any) => boolean)[] = [];
  private orderField: string | null = null;
  private orderAscending = true;
  private limitCount: number | null = null;
  private isSingle = false;

  constructor(table: string) {
    this.table = table;
  }

  select(fields?: string) {
    // Simply returns this for chaining
    return this;
  }

  eq(column: string, value: any) {
    this.filters.push(row => {
      if (column === 'board_id' || column === 'id' || column === 'parent_id' || column === 'group_id') {
        return String(row[column]) === String(value);
      }
      return row[column] === value;
    });
    return this;
  }

  in(column: string, values: any[]) {
    const stringValues = values.map(String);
    this.filters.push(row => stringValues.includes(String(row[column])));
    return this;
  }

  ilike(column: string, pattern: string) {
    const searchStr = pattern.replace(/%/g, '').toLowerCase();
    this.filters.push(row => String(row[column] || '').toLowerCase().includes(searchStr));
    return this;
  }

  order(column: string, options?: { ascending?: boolean }) {
    this.orderField = column;
    this.orderAscending = options?.ascending ?? true;
    return this;
  }

  limit(count: number) {
    this.limitCount = count;
    return this;
  }

  single() {
    this.isSingle = true;
    return this;
  }

  abortSignal(signal: any) {
    return this;
  }

  // Promise-like behavior (then/catch)
  async then(onfulfilled?: (value: { data: any; error: any }) => any) {
    try {
      let data = dbState[this.table] || [];

      // Apply filters
      this.filters.forEach(filter => {
        data = data.filter(filter);
      });

      // Apply ordering
      if (this.orderField) {
        const field = this.orderField;
        const asc = this.orderAscending;
        data = [...data].sort((a, b) => {
          const valA = a[field];
          const valB = b[field];
          if (valA < valB) return asc ? -1 : 1;
          if (valA > valB) return asc ? 1 : -1;
          return 0;
        });
      }

      // Populate child associations for groups -> items
      if (this.table === 'groups') {
        data = data.map(group => {
          const items = (dbState.items || []).filter(item => item.group_id === group.id);
          return { ...group, items };
        });
      }

      // Apply limit or single
      let resultData: any = data;
      if (this.isSingle) {
        resultData = data.length > 0 ? data[0] : null;
      } else if (this.limitCount !== null) {
        resultData = data.slice(0, this.limitCount);
      }

      const res = { data: resultData, error: null };
      return onfulfilled ? onfulfilled(res) : res;
    } catch (err: any) {
      const res = { data: null, error: { message: err.message || 'Mock query error' } };
      return onfulfilled ? onfulfilled(res) : res;
    }
  }

  // Mutation operations
  insert(values: any | any[]) {
    const rows = Array.isArray(values) ? values : [values];
    const createdRows = rows.map(r => {
      const id = r.id || Math.random().toString(36).substring(2, 15) + Math.random().toString(36).substring(2, 15);
      const newRow = {
        id,
        created_at: new Date().toISOString(),
        values: {},
        ...r
      };
      dbState[this.table] = dbState[this.table] || [];
      dbState[this.table].push(newRow);
      return newRow;
    });

    saveTable(this.table);

    const result = {
      data: Array.isArray(values) ? createdRows : createdRows[0],
      error: null
    };

    return {
      select: () => ({
        single: () => Promise.resolve(result),
        then: (resolve: any) => resolve(result)
      }),
      then: (resolve: any) => resolve(result)
    };
  }

  update(updates: any) {
    let affectedRows: any[] = [];
    dbState[this.table] = (dbState[this.table] || []).map(row => {
      // Check if row matches current filters
      const matches = this.filters.every(filter => filter(row));
      if (matches) {
        const updatedRow = { ...row };
        
        // Handle values merging specifically if it's items updates
        if (this.table === 'items' && updates.values) {
          updatedRow.values = {
            ...(updatedRow.values || {}),
            ...updates.values
          };
          
          const keys = Object.keys(updates);
          keys.forEach(k => {
            if (k !== 'values') {
              updatedRow[k] = updates[k];
            }
          });
        } else {
          Object.assign(updatedRow, updates);
        }

        affectedRows.push(updatedRow);
        return updatedRow;
      }
      return row;
    });

    saveTable(this.table);

    const result = {
      data: this.isSingle ? (affectedRows.length > 0 ? affectedRows[0] : null) : affectedRows,
      error: null
    };

    return {
      single: () => Promise.resolve(result),
      then: (resolve: any) => resolve(result)
    };
  }

  delete() {
    let deletedCount = 0;
    dbState[this.table] = (dbState[this.table] || []).filter(row => {
      const matches = this.filters.every(filter => filter(row));
      if (matches) {
        deletedCount++;
        return false;
      }
      return true;
    });

    saveTable(this.table);

    const result = { data: { count: deletedCount }, error: null };
    return {
      then: (resolve: any) => resolve(result)
    };
  }
}

// Authentication Controller
class MockAuth {
  private listeners: ((event: string, session: any) => void)[] = [];

  constructor() {
    if (isBrowser) {
      window.addEventListener('storage', (e) => {
        if (e.key === 'sb_mock_session') {
          this.triggerAuthStateChange();
        }
      });
    }
  }

  private triggerAuthStateChange() {
    const session = this.getLocalSession();
    this.listeners.forEach(listener => {
      listener(session ? 'SIGNED_IN' : 'SIGNED_OUT', session);
    });
  }

  private getLocalSession(): MockSession | null {
    if (!isBrowser) return null;
    let stored = localStorage.getItem('sb_mock_session');
    if (!stored) {
      const cookieValue = document.cookie
        .split('; ')
        .find(row => row.startsWith('sb-mock-session='))
        ?.split('=')[1];
      if (cookieValue) {
        try {
          const decoded = decodeURIComponent(cookieValue);
          localStorage.setItem('sb_mock_session', decoded);
          localStorage.setItem('use_mock_db', 'true');
          stored = decoded;
        } catch (e) {
          console.error('Error parsing session cookie in mock client:', e);
        }
      }
    }
    if (stored) {
      try {
        return JSON.parse(stored);
      } catch (e) {
        return null;
      }
    }
    return null;
  }

  async getSession() {
    const session = this.getLocalSession();
    return { data: { session }, error: null };
  }

  async getUser() {
    const session = this.getLocalSession();
    return { data: { user: session?.user || null }, error: null };
  }

  onAuthStateChange(callback: (event: string, session: any) => void) {
    this.listeners.push(callback);
    const session = this.getLocalSession();
    callback(session ? 'INITIAL_SESSION' : 'SIGNED_OUT', session);
    
    return {
      data: {
        subscription: {
          unsubscribe: () => {
            this.listeners = this.listeners.filter(l => l !== callback);
          }
        }
      }
    };
  }

  async signInWithPassword({ email }: { email: string }) {
    const role = email.includes('admin') ? 'admin' : 'operator';
    const session: MockSession = {
      user: {
        id: 'mock-user-id-' + Math.random().toString(36).substring(2, 9),
        email,
        user_metadata: { role }
      },
      expires_at: Math.floor(Date.now() / 1000) + 3600 * 24
    };

    if (isBrowser) {
      localStorage.setItem('sb_mock_session', JSON.stringify(session));
      // Also write cookie for middleware access
      document.cookie = `sb-mock-session=${encodeURIComponent(JSON.stringify(session))}; path=/; max-age=86400;`;
    }

    this.triggerAuthStateChange();
    return { data: { session, user: session.user }, error: null };
  }

  async signUp({ email }: { email: string }) {
    const role = email.includes('admin') ? 'admin' : 'operator';
    const session: MockSession = {
      user: {
        id: 'mock-user-id-' + Math.random().toString(36).substring(2, 9),
        email,
        user_metadata: { role }
      },
      expires_at: Math.floor(Date.now() / 1000) + 3600 * 24
    };

    if (isBrowser) {
      localStorage.setItem('sb_mock_session', JSON.stringify(session));
      document.cookie = `sb-mock-session=${encodeURIComponent(JSON.stringify(session))}; path=/; max-age=86400;`;
    }

    this.triggerAuthStateChange();
    return { data: { session, user: session.user }, error: null };
  }

  async signOut() {
    if (isBrowser) {
      localStorage.removeItem('sb_mock_session');
      localStorage.removeItem('use_mock_db');
      document.cookie = 'sb-mock-session=; path=/; expires=Thu, 01 Jan 1970 00:00:00 GMT;';
    }
    this.triggerAuthStateChange();
    return { error: null };
  }
}

// Client Export Class
export class MockSupabaseClient {
  auth = new MockAuth();

  from(table: string) {
    return new MockQueryBuilder(table);
  }

  channel(name: string) {
    const mockChannel = {
      on: (event: string, filter: any, callback: any) => {
        return mockChannel;
      },
      subscribe: () => {
        return mockChannel;
      }
    };
    return mockChannel;
  }

  removeChannel(channel: any) {
    // No-op
  }
}
