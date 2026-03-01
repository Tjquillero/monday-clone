---
trigger: always_on
---

# Senior Developer Rules - Monday Clone

## Stack Tecnológico
- *Frontend:* Next.js (App Router), Tailwind CSS.
- *Backend/Base de Datos:* Supabase (PostgreSQL).
- *Lógica:* TypeScript estricto.

## Reglas de Desarrollo
1. *Prevención de Duplicados:* Al renderizar filas de tareas o barras de Gantt, validar siempre que el id sea único. Nunca usar el índice del array como key.
2. *Arquitectura:* Mantener componentes modulares. La lógica de Supabase debe estar separada de los componentes de UI.
3. *Estilo de Código:* Código limpio y autodocumentado. No explicar conceptos básicos.
4. *Manejo de Errores:* Si hay un conflicto de puertos en la terminal (PowerShell), sugerir el comando para liberar el puerto 3000.
5. *Base de Datos:* Asegurar que las relaciones entre boards, columns y tasks mantengan integridad referencial.