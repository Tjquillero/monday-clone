# Scope: Data & Database Migrations (Supabase & PostgreSQL Governance)

> **Ámbito:** Diseño, creación y validación de migraciones SQL, funciones RPC, políticas RLS, índices, triggers y constraints en Supabase/PostgreSQL.
> **Directiva de Aislamiento:** El estado `APPLIED` de una migración NO demuestra por sí mismo equivalencia arquitectónica ni corrección del esquema físico. Paridad física obligatoria `LOCAL = REMOTE`.

---

## 1. Perímetro Autorizado de Archivos

* `supabase/migrations/**` (Archivos de migración versionados)
* `supabase/tests/**` (Pruebas pgTAP de seguridad y RLS)
* `supabase/test-hooks/**` (Scripts de setup y teardown de pruebas DB)

---

## 2. Directiva Permanente de Base de Datos (Invariantes)

### A. Nomenclatura y Versionamiento Único (Gate 3)
* Formato obligatorio: `YYYYMMDDNN_description.sql` (ej. `2026092701_cronograma_contract.sql`).
* Prohibida la colisión de versiones.

### B. Inmutabilidad de Migraciones (Gate 2)
* Una migración aplicada a cualquier entorno compartido se considera **FROZEN**.
* Prohibido editar migraciones pasadas. Toda corrección se hace mediante una nueva migración encadenada:
  ```text
  M1 → M2 → M3 → CORRECTION_M4
  ```

### C. No Assumed Columns (Gate 6)
* Prohibido crear índices, triggers o policies sobre columnas cuya existencia no haya sido verificada físicamente en el esquema remoto.

---

## 3. Protocolo Preflight y Postflight

### Reporte Preflight Obligatorio (Antes de escribir SQL)
1. Esquema remoto actual y objetos afectados.
2. Migraciones locales relevantes.
3. Objetos canónicos (tabla, columna, relación, RPC).
4. Políticas/Triggers/Índices existentes.
5. Consumidores de aplicación (`src/lib/`, `src/hooks/`).
6. Pruebas requeridas.
7. Stop conditions (si aplica).

### Reporte Postflight Obligatorio (Después de aplicar migración)
1. Migraciones aplicadas y paridad física local/remota.
2. Verificación de objetos físicos (tablas, columnas, constraints, RLS, grants).
3. Pruebas de seguridad pgTAP (`npm run test:db`).
4. Pruebas de aplicación TypeScript y regresión Jest.

---

## 4. Stop Conditions Inmediatas

Detener inmediatamente la ejecución ante:
```text
LOCAL ≠ REMOTE
Migración referencia columna o relación obsoleta/inexistente
RLS o firma RPC difiere del contrato esperado
Colisión de versiones de migración
Se requiere SQL manual fuera de la cadena de migraciones
```
