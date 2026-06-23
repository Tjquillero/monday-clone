// src/lib/offlineDB.ts
import { supabase } from './supabaseClient';

const DB_NAME = 'mantenix_offline_db';
const DB_VERSION = 2;

export function generateUUID(): string {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) {
    return crypto.randomUUID();
  }
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

export interface OfflineMutation {
  id?: number;
  timestamp: number;
  table: string;
  action: 'insert' | 'update' | 'delete';
  payload: any;
  attempts: number;
}

export class OfflineDB {
  private db: IDBDatabase | null = null;

  async init(): Promise<IDBDatabase> {
    if (this.db) return this.db;
    if (typeof window === 'undefined') {
      throw new Error('IndexedDB is not available on server-side');
    }

    return new Promise((resolve, reject) => {
      const request = indexedDB.open(DB_NAME, DB_VERSION);

      request.onupgradeneeded = (event) => {
        const db = request.result;
        
        // Tablas principales del caché offline
        if (!db.objectStoreNames.contains('boards')) db.createObjectStore('boards', { keyPath: 'id' });
        if (!db.objectStoreNames.contains('groups')) db.createObjectStore('groups', { keyPath: 'id' });
        if (!db.objectStoreNames.contains('items')) db.createObjectStore('items', { keyPath: 'id' });
        if (!db.objectStoreNames.contains('site_incidents')) db.createObjectStore('site_incidents', { keyPath: 'id' });
        
        // Nuevas tablas para el caché offline completo
        if (!db.objectStoreNames.contains('board_columns')) db.createObjectStore('board_columns', { keyPath: 'id' });
        if (!db.objectStoreNames.contains('activity_templates')) db.createObjectStore('activity_templates', { keyPath: 'id' });
        if (!db.objectStoreNames.contains('task_dependencies')) db.createObjectStore('task_dependencies', { keyPath: 'id' });
        
        // Cola de mutaciones pendientes
        if (!db.objectStoreNames.contains('mutations')) {
          db.createObjectStore('mutations', { keyPath: 'id', autoIncrement: true });
        }
      };


      request.onsuccess = () => {
        this.db = request.result;
        resolve(request.result);
      };

      request.onerror = () => {
        reject(request.error);
      };
    });
  }

  // --- Snapshot Caching ---
  async getTable(table: string): Promise<any[]> {
    const db = await this.init();
    return new Promise((resolve, reject) => {
      try {
        const transaction = db.transaction(table, 'readonly');
        const store = transaction.objectStore(table);
        const request = store.getAll();

        request.onsuccess = () => resolve(request.result || []);
        request.onerror = () => reject(request.error);
      } catch (e) {
        reject(e);
      }
    });
  }

  async saveTable(table: string, data: any[]): Promise<void> {
    const db = await this.init();
    return new Promise((resolve, reject) => {
      try {
        const transaction = db.transaction(table, 'readwrite');
        const store = transaction.objectStore(table);
        
        store.clear();

        data.forEach(item => {
          if (item && item.id) {
            store.put(item);
          }
        });

        transaction.oncomplete = () => resolve();
        transaction.onerror = () => reject(transaction.error);
      } catch (e) {
        reject(e);
      }
    });
  }

  async upsertRecords(table: string, data: any[]): Promise<void> {
    const db = await this.init();
    return new Promise((resolve, reject) => {
      try {
        const transaction = db.transaction(table, 'readwrite');
        const store = transaction.objectStore(table);
        
        data.forEach(item => {
          if (item && item.id) {
            store.put(item);
          }
        });

        transaction.oncomplete = () => resolve();
        transaction.onerror = () => reject(transaction.error);
      } catch (e) {
        reject(e);
      }
    });
  }


  // --- Queue for pending mutations ---
  async getMutations(): Promise<OfflineMutation[]> {
    const db = await this.init();
    return new Promise((resolve, reject) => {
      try {
        const transaction = db.transaction('mutations', 'readonly');
        const store = transaction.objectStore('mutations');
        const request = store.getAll();

        request.onsuccess = () => resolve(request.result || []);
        request.onerror = () => reject(request.error);
      } catch (e) {
        reject(e);
      }
    });
  }

  async addMutation(mutation: Omit<OfflineMutation, 'id' | 'timestamp' | 'attempts'>): Promise<number> {
    const db = await this.init();
    return new Promise((resolve, reject) => {
      try {
        const transaction = db.transaction('mutations', 'readwrite');
        const store = transaction.objectStore('mutations');
        
        const newMutation: OfflineMutation = {
          ...mutation,
          timestamp: Date.now(),
          attempts: 0
        };

        const request = store.add(newMutation);
        request.onsuccess = () => resolve(request.result as number);
        request.onerror = () => reject(request.error);
      } catch (e) {
        reject(e);
      }
    });
  }

  async removeMutation(id: number): Promise<void> {
    const db = await this.init();
    return new Promise((resolve, reject) => {
      try {
        const transaction = db.transaction('mutations', 'readwrite');
        const store = transaction.objectStore('mutations');
        const request = store.delete(id);

        request.onsuccess = () => resolve();
        request.onerror = () => reject(request.error);
      } catch (e) {
        reject(e);
      }
    });
  }

  async incrementAttempts(id: number): Promise<void> {
    const db = await this.init();
    return new Promise((resolve, reject) => {
      try {
        const transaction = db.transaction('mutations', 'readwrite');
        const store = transaction.objectStore('mutations');
        
        const getRequest = store.get(id);
        getRequest.onsuccess = () => {
          const mutation = getRequest.result as OfflineMutation;
          if (mutation) {
            mutation.attempts += 1;
            const updateRequest = store.put(mutation);
            updateRequest.onsuccess = () => resolve();
            updateRequest.onerror = () => reject(updateRequest.error);
          } else {
            resolve();
          }
        };
        getRequest.onerror = () => reject(getRequest.error);
      } catch (e) {
        reject(e);
      }
    });
  }
}

export const offlineDB = typeof window !== 'undefined' ? new OfflineDB() : (null as any);

// --- Emulated Query Builder for Offline-First transparent interceptor ---
export class OfflineQueryBuilder {
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
    return this;
  }

  eq(column: string, value: any) {
    this.filters.push((row: any) => {
      if (column === 'board_id' || column === 'id' || column === 'parent_id' || column === 'group_id') {
        return String(row[column]) === String(value);
      }
      return row[column] === value;
    });
    return this;
  }

  in(column: string, values: any[]) {
    const stringValues = values.map(String);
    this.filters.push((row: any) => stringValues.includes(String(row[column])));
    return this;
  }

  ilike(column: string, pattern: string) {
    const searchStr = pattern.replace(/%/g, '').toLowerCase();
    this.filters.push((row: any) => String(row[column] || '').toLowerCase().includes(searchStr));
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

  async then(onfulfilled?: (value: { data: any; error: any }) => any) {
    try {
      let data = await offlineDB.getTable(this.table);

      // Aplicar filtros
      this.filters.forEach((filter: any) => {
        data = data.filter((row: any) => filter(row));
      });

      // Ordenar
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

      // Emular asociación grupos -> ítems
      if (this.table === 'groups') {
        const allItems = await offlineDB.getTable('items');
        data = data.map((group: any) => {
          const items = allItems.filter((item: any) => item.group_id === group.id);
          return { ...group, items };
        });
      }

      let resultData: any = data;
      if (this.isSingle) {
        resultData = data.length > 0 ? data[0] : null;
      } else if (this.limitCount !== null) {
        resultData = data.slice(0, this.limitCount);
      }

      const res = { data: resultData, error: null };
      return onfulfilled ? onfulfilled(res) : res;
    } catch (err: any) {
      const res = { data: null, error: { message: err.message || 'Offline query error' } };
      return onfulfilled ? onfulfilled(res) : res;
    }
  }

  // Mutaciones locales
  insert(values: any | any[]) {
    const rows = Array.isArray(values) ? values : [values];
    
    const execute = async () => {
      const createdRows = [];
      const tableData = await offlineDB.getTable(this.table);
      for (const r of rows) {
        const id = r.id || generateUUID();
        const newRow = {
          id,
          created_at: new Date().toISOString(),
          values: {},
          ...r
        };
        tableData.push(newRow);
        createdRows.push(newRow);

        // Agregar a la cola de sincronización pendiente
        await offlineDB.addMutation({
          table: this.table,
          action: 'insert',
          payload: newRow
        });
      }

      await offlineDB.saveTable(this.table, tableData);

      const result = {
        data: Array.isArray(values) ? createdRows : createdRows[0],
        error: null
      };
      return result;
    };

    const thenable = {
      select: () => ({
        single: () => execute().then(res => ({ data: res.data ? (Array.isArray(res.data) ? res.data[0] : res.data) : null, error: null })),
        then: (resolve: any) => execute().then(resolve)
      }),
      then: (resolve: any) => execute().then(resolve)
    };

    return thenable;
  }

  update(updates: any) {
    const execute = async () => {
      const tableData = await offlineDB.getTable(this.table);
      const affectedRows: any[] = [];

      const updatedTableData = tableData.map((row: any) => {
        const matches = this.filters.every((filter: any) => filter(row));
        if (matches) {
          const updatedRow = { ...row };
          
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

      await offlineDB.saveTable(this.table, updatedTableData);

      for (const row of affectedRows) {
        await offlineDB.addMutation({
          table: this.table,
          action: 'update',
          payload: row
        });
      }

      const result = {
        data: this.isSingle ? (affectedRows.length > 0 ? affectedRows[0] : null) : affectedRows,
        error: null
      };
      return result;
    };

    const thenable = {
      single: () => execute().then(res => ({ data: res.data ? (Array.isArray(res.data) ? res.data[0] : res.data) : null, error: null })),
      then: (resolve: any) => execute().then(resolve)
    };

    return thenable;
  }

  delete() {
    const execute = async () => {
      const tableData = await offlineDB.getTable(this.table);
      const remainingRows: any[] = [];
      const deletedRows: any[] = [];

      tableData.forEach((row: any) => {
        const matches = this.filters.every((filter: any) => filter(row));
        if (matches) {
          deletedRows.push(row);
        } else {
          remainingRows.push(row);
        }
      });

      await offlineDB.saveTable(this.table, remainingRows);

      for (const row of deletedRows) {
        await offlineDB.addMutation({
          table: this.table,
          action: 'delete',
          payload: { id: row.id }
        });
      }

      const result = { data: { count: deletedRows.length }, error: null };
      return result;
    };

    const thenable = {
      then: (resolve: any) => execute().then(resolve)
    };

    return thenable;
  }
}
