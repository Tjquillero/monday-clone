# Especificación de Arquitectura - Board Engine v1 Stable

Este documento establece las especificaciones técnicas, invariantes y responsabilidades del motor de columnas de tableros (Board Engine v1) de Mantenix. Al haber alcanzado su estado **estable**, el motor queda oficialmente congelado y toda modificación sobre su infraestructura básica queda desautorizada.

---

## 1. Conceptos Fundamentales y Atributos de Columnas

El diseño de las columnas en el tablero se rige por la separación de responsabilidades físicas, semánticas y de configuración:

### `Column.id` (Identidad Física)
- **Definición:** Identificador único global (UUID generado por la base de datos Supabase).
- **Responsabilidades:**
  - Utilizado como React `key` único para el renderizado seguro de componentes y prevención de duplicación.
  - Utilizado como identificador de referencia en Drag & Drop (reordenamiento posicional).
  - Utilizado como clave foránea (FK) en relaciones de base de datos.

### `Column.key` (Identidad Semántica)
- **Definición:** Clave lógica e invariable de negocio (ej. `'status'`, `'priority'`).
- **Responsabilidades:**
  - Actúa como la llave de acceso dentro del JSONB `values` en la tabla de ítems (`items`).
  - Utilizado para aplicar filtros rápidos, persistencia y renderizado de reportes ejecutivos.
  - **Resolución:** Si una columna es creada por el usuario y no posee una clave semántica predefinida (`key` es `null`), el motor realiza un fallback utilizando su `Column.id` (UUID) para almacenar el valor. Este comportamiento está encapsulado en `getColumnValueKey(column)`.

### `Column.options` (Configuración de Vista y Datos)
- **Definición:** Objeto JSON con metadatos específicos del tipo de columna.
- **Responsabilidades:**
  - Almacena etiquetas disponibles (ej. estados y colores para columnas tipo `status`).
  - Formato de visualización (formato de moneda, número de decimales, etc.).
  - Configuración de selectores avanzados (fecha límite, asignación de personas).

---

## 2. Flujo de Datos y Mapeo Lógico

El motor separa rigurosamente las tareas operativas genéricas de las transacciones de costos financieros:

```
                  ┌───────────────────────────────┐
                  │       ¿Tipo de Ítem?          │
                  └───────────────┬───────────────┘
                                  │
                  ┌───────────────┴───────────────┐
                  ▼                               ▼
       [isFinancialItem = true]        [isFinancialItem = false]
       Lectura y Escritura             Lectura y Escritura
       bajo llaves fijas:              bajo llave dinámica:
       ┌────────────────────────┐      ┌────────────────────────┐
       │ - cant                 │      │ - getColumnValueKey()  │
       │ - unit_price           │      └────────────────────────┘
       │ - executed_qty         │
       │ - unit / rubro         │
       └────────────────────────┘
```

1. **Ítems de Actividad (Genérico):**
   - Utilizan la función de resolución dinámica `getColumnValueKey(column)` en `columnUtils.ts`.
   - Permiten la creación de tareas con nombres duplicados o posiciones arbitrarias dentro del tablero.
2. **Ítems Financieros (Costos y Presupuesto):**
   - No dependen de la resolución dinámica de nombres o títulos de columnas.
   - Utilizan llaves invariantes y estables de base de datos (`cant`, `unit_price`, `executed_qty`, `unit`, `rubro`, `category`, `sub_category`).
   - La lectura y cálculo se realiza centralizadamente a través de `getFinancialValues(item, columns)`.
   - La inserción es idempotente a nivel de base de datos a través de la mutación específica `createOrGetFinancialItem` y su función RPC de base de datos asociada, previniendo condiciones de carrera.

---

## 3. Guía de Pruebas de Regresión y Aseguramiento (E2E)

Para certificar que el motor de columnas permanece estable tras cualquier modificación operativa, se debe ejecutar manualmente el siguiente escenario encadenado de extremo a extremo:

1. **Creación:** Clonar o crear un nuevo tablero a partir de una plantilla estándar.
2. **Edición Inicial:** Crear un recurso financiero, editar su precio y su cantidad.
3. **Mutación de Columnas:**
   - Renombrar la columna "Precio" por "Precio Unitario COP".
   - Duplicar una columna no relacionada.
   - Ocultar una columna.
   - Reordenar la posición de las columnas usando Drag & Drop.
4. **Persistencia:** Guardar la vista actual.
5. **Recarga y Verificación:** Recargar la pestaña del navegador (reload) y verificar:
   - Que los widgets financieros (`SCurve`, `BudgetExecution`, `FinancialWidget`) y la matriz muestren exactamente los mismos resultados presupuestados/ejecutados.
   - Que los valores sigan almacenados bajo llaves semánticas en `items.values`, sin escrituras bajo IDs UUID ni nombres legibles de columna.

---

## 4. Invariante de Oro del Proyecto

> [!IMPORTANT]
> **Cualquier nuevo módulo de negocio (órdenes de trabajo, cuadrillas, programación, seguimiento, etc.) debe consumir el motor de columnas existente tal como está especificado.**
> Queda estrictamente prohibido modificar o refactorizar las abstracciones core del Board Engine v1 para evitar regresiones de datos o pérdida de estabilidad en el producto.

