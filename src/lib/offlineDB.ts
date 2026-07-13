// src/lib/offlineDB.ts


const DB_NAME = 'mantenix_offline_db';
const DB_VERSION = 5;

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

// ─────────────────────────────────────────────────────────────────────────────
// Carril 2: comandos de dominio (docs/architecture/offline-certification-design.md,
// Sección 3). Deliberadamente NO comparte cola/tienda con OfflineMutation: un
// comando de dominio no es un insert/update/delete sobre una tabla, es una
// intención de negocio ("reportar esta jornada") que el servidor valida y
// ejecuta — el carril CRUD ya asume que toda escritura es directa a una tabla,
// lo cual no aplica aquí. `status` empieza en 'queued' (encolado, ningún
// intento de red todavía) y solo pasa a 'conflicto' ante un fallo semántico
// del RPC — nunca se reintenta solo, ver Invariantes del diseño.
// ─────────────────────────────────────────────────────────────────────────────

export type DomainCommandType = 'REPORT_EXECUTION' | 'VERIFY_EXECUTION' | 'REJECT_EXECUTION' | 'UPLOAD_ATTACHMENT';
export type DomainCommandStatus = 'queued' | 'pendiente' | 'sincronizando' | 'sincronizado' | 'error' | 'conflicto';

export interface DomainCommandError {
  code?: string;
  message: string;
}

export interface DomainCommand {
  id: string;              // UUID generado en el cliente — idempotencia (ver diseño)
  type: DomainCommandType;
  entity_id: string;       // execution_id, plan_id, etc.
  payload: any;            // argumentos del comando, agnósticos del transporte
  depends_on: string | null;
  status: DomainCommandStatus;
  attempts: number;
  last_error: DomainCommandError | null;
  created_at: number;
}

// ─────────────────────────────────────────────────────────────────────────────
// Carril 3: cola de Blobs (docs/architecture/offline-certification-design.md,
// Sección 4). Una foto no es un objeto de mutación como los demás — el flujo
// es Blob local → Storage → INSERT en execution_attachments, dos pasos que
// pueden fallar por separado. `storage_path` se llena apenas el Storage
// upload tiene éxito (antes de intentar el INSERT) para que un reintento no
// vuelva a subir el mismo archivo con una ruta nueva si solo el INSERT falló
// — sin esto, un fallo parcial repetido dejaría Blobs huérfanos acumulándose
// en Storage cada vez que useOfflineSync reintenta (Invariante 4: un archivo
// no cuenta como sincronizado hasta existir en Storage Y en la tabla).
// ─────────────────────────────────────────────────────────────────────────────

// Ampliado en el Incremento 4c para incluir 'pendiente' y 'sincronizando' —
// mismo vocabulario que DomainCommandStatus, para un solo origen de verdad
// del estado técnico (ver src/hooks/useSyncState.ts).
export type PendingAttachmentStatus = 'queued' | 'pendiente' | 'sincronizando' | 'sincronizado' | 'error' | 'conflicto';

export interface PendingAttachmentError {
  code?: string;
  message: string;
}

export interface PendingAttachment {
  id: string;
  execution_id: string;
  file: Blob;
  file_name: string;
  file_type: string;
  file_size: number;
  uploaded_by: string;
  phase: 'before' | 'after' | null;
  storage_path: string | null;
  status: PendingAttachmentStatus;
  attempts: number;
  last_error: PendingAttachmentError | null;
  created_at: number;
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

        // Ejecución Certificada — lectura offline de Mis Actividades (líder) y
        // Verificación (supervisor). Ver docs/architecture/offline-certification-design.md,
        // Incremento 1: solo caché de lectura, sin cola de comandos todavía.
        if (!db.objectStoreNames.contains('weekly_plans')) db.createObjectStore('weekly_plans', { keyPath: 'id' });
        if (!db.objectStoreNames.contains('weekly_plan_items')) db.createObjectStore('weekly_plan_items', { keyPath: 'id' });
        if (!db.objectStoreNames.contains('weekly_plan_item_executions')) db.createObjectStore('weekly_plan_item_executions', { keyPath: 'id' });
        if (!db.objectStoreNames.contains('board_activity_standards')) db.createObjectStore('board_activity_standards', { keyPath: 'id' });

        // Cola de mutaciones pendientes (carril 1: CRUD)
        if (!db.objectStoreNames.contains('mutations')) {
          db.createObjectStore('mutations', { keyPath: 'id', autoIncrement: true });
        }

        // Cola de comandos de dominio (carril 2) — Incremento 2 de
        // offline-certification-design.md. keyPath 'id' (UUID cliente, no
        // autoIncrement) porque ese mismo id es la clave de idempotencia.
        if (!db.objectStoreNames.contains('domain_commands')) {
          db.createObjectStore('domain_commands', { keyPath: 'id' });
        }

        // Cola de Blobs (carril 3) — Incremento 3. IndexedDB soporta Blob
        // nativamente (structured clone), no hace falta base64.
        if (!db.objectStoreNames.contains('pending_attachments')) {
          db.createObjectStore('pending_attachments', { keyPath: 'id' });
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

  // --- Carril 2: cola de comandos de dominio ---
  async getCommands(): Promise<DomainCommand[]> {
    const db = await this.init();
    return new Promise((resolve, reject) => {
      try {
        const transaction = db.transaction('domain_commands', 'readonly');
        const store = transaction.objectStore('domain_commands');
        const request = store.getAll();

        request.onsuccess = () => resolve(request.result || []);
        request.onerror = () => reject(request.error);
      } catch (e) {
        reject(e);
      }
    });
  }

  async addCommand(cmd: { id?: string; type: DomainCommandType; entity_id: string; payload: any; depends_on?: string | null }): Promise<DomainCommand> {
    const db = await this.init();
    const command: DomainCommand = {
      // Permite reutilizar un id ya generado (ej. el mismo command_id que se
      // intentó enviar online antes de caer al carril offline) en vez de uno
      // nuevo — necesario para que la idempotencia del servidor (command_id)
      // funcione de punta a punta, no solo dentro de la cola.
      id: cmd.id ?? generateUUID(),
      type: cmd.type,
      entity_id: cmd.entity_id,
      payload: cmd.payload,
      depends_on: cmd.depends_on ?? null,
      status: 'queued',
      attempts: 0,
      last_error: null,
      created_at: Date.now(),
    };
    return new Promise((resolve, reject) => {
      try {
        const transaction = db.transaction('domain_commands', 'readwrite');
        const request = transaction.objectStore('domain_commands').add(command);
        request.onsuccess = () => resolve(command);
        request.onerror = () => reject(request.error);
      } catch (e) {
        reject(e);
      }
    });
  }

  async updateCommand(id: string, patch: Partial<Omit<DomainCommand, 'id'>>): Promise<void> {
    const db = await this.init();
    return new Promise((resolve, reject) => {
      try {
        const transaction = db.transaction('domain_commands', 'readwrite');
        const store = transaction.objectStore('domain_commands');
        const getRequest = store.get(id);
        getRequest.onsuccess = () => {
          const command = getRequest.result as DomainCommand;
          if (!command) { resolve(); return; }
          const updateRequest = store.put({ ...command, ...patch });
          updateRequest.onsuccess = () => resolve();
          updateRequest.onerror = () => reject(updateRequest.error);
        };
        getRequest.onerror = () => reject(getRequest.error);
      } catch (e) {
        reject(e);
      }
    });
  }

  async removeCommand(id: string): Promise<void> {
    const db = await this.init();
    return new Promise((resolve, reject) => {
      try {
        const transaction = db.transaction('domain_commands', 'readwrite');
        const request = transaction.objectStore('domain_commands').delete(id);
        request.onsuccess = () => resolve();
        request.onerror = () => reject(request.error);
      } catch (e) {
        reject(e);
      }
    });
  }

  // --- Carril 3: cola de Blobs ---
  async getPendingAttachments(): Promise<PendingAttachment[]> {
    const db = await this.init();
    return new Promise((resolve, reject) => {
      try {
        const transaction = db.transaction('pending_attachments', 'readonly');
        const request = transaction.objectStore('pending_attachments').getAll();
        request.onsuccess = () => resolve(request.result || []);
        request.onerror = () => reject(request.error);
      } catch (e) {
        reject(e);
      }
    });
  }

  async addPendingAttachment(att: { execution_id: string; file: Blob; file_name: string; file_type: string; file_size: number; uploaded_by: string; phase?: 'before' | 'after' | null }): Promise<PendingAttachment> {
    const db = await this.init();
    const pending: PendingAttachment = {
      id: generateUUID(),
      execution_id: att.execution_id,
      file: att.file,
      file_name: att.file_name,
      file_type: att.file_type,
      file_size: att.file_size,
      uploaded_by: att.uploaded_by,
      phase: att.phase ?? null,
      storage_path: null,
      status: 'queued',
      attempts: 0,
      last_error: null,
      created_at: Date.now(),
    };
    return new Promise((resolve, reject) => {
      try {
        const transaction = db.transaction('pending_attachments', 'readwrite');
        const request = transaction.objectStore('pending_attachments').add(pending);
        request.onsuccess = () => resolve(pending);
        request.onerror = () => reject(request.error);
      } catch (e) {
        reject(e);
      }
    });
  }

  async updatePendingAttachment(id: string, patch: Partial<Omit<PendingAttachment, 'id'>>): Promise<void> {
    const db = await this.init();
    return new Promise((resolve, reject) => {
      try {
        const transaction = db.transaction('pending_attachments', 'readwrite');
        const store = transaction.objectStore('pending_attachments');
        const getRequest = store.get(id);
        getRequest.onsuccess = () => {
          const pending = getRequest.result as PendingAttachment;
          if (!pending) { resolve(); return; }
          const updateRequest = store.put({ ...pending, ...patch });
          updateRequest.onsuccess = () => resolve();
          updateRequest.onerror = () => reject(updateRequest.error);
        };
        getRequest.onerror = () => reject(getRequest.error);
      } catch (e) {
        reject(e);
      }
    });
  }

  async removePendingAttachment(id: string): Promise<void> {
    const db = await this.init();
    return new Promise((resolve, reject) => {
      try {
        const transaction = db.transaction('pending_attachments', 'readwrite');
        const request = transaction.objectStore('pending_attachments').delete(id);
        request.onsuccess = () => resolve();
        request.onerror = () => reject(request.error);
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
