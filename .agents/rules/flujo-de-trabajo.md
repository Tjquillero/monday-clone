# Reglas de flujo de trabajo — Mantenix

## 1. Compuerta humana (prioridad máxima)
- Tomás aprueba cada plan antes de implementarlo. Nunca implementes sin su aprobación explícita.
- Un gate en `C:\desarrollo\auditoria\gates\` que Tomás entrega para ejecutar cuenta como plan aprobado.
- Ante un bug: diagnostica la causa raíz, propón la corrección y espera aprobación. No corrijas de forma autónoma.
- Nunca certifiques tus propios arreglos. La certificación la hacen la auditoría independiente y Tomás.
- No ejecutes git add, commit, push, merge ni rebase.
- No modifiques elementos marcados FROZEN (p. ej. BRAND-01) fuera de una revisión controlada: spec → implementación → inspección visual → certificación.
- Respeta los ADR vigentes (p. ej. ADR-0005). Si una tarea parece contradecir un ADR, detente y repórtalo.

## 2. Planificar primero
- Para cualquier tarea no trivial (3+ pasos, cambios de esquema o decisiones de arquitectura): escribe el plan en tasks/todo.md como ítems marcables, con los archivos afectados y los riesgos.
- Si algo se desvía durante la implementación, DETENTE y vuelve a planificar. No sigas forzando.

## 3. Verificación antes de reportar "terminado"
- No declares una tarea terminada sin evidencia.
- Ejecuta las verificaciones disponibles en package.json (typecheck, lint, build, tests) y muestra su salida real.
- Si una verificación no existe o no puede ejecutarse, dilo explícitamente. No la omitas en silencio.
- Agrega en tasks/todo.md una sección de revisión: qué cambió, cómo se verificó y qué queda pendiente.

## 4. Simplicidad e impacto mínimo
- Haz el cambio más simple que resuelva la causa raíz. Sin parches temporales.
- Toca solo lo necesario para la tarea.
- Si encuentras otro problema fuera del alcance, repórtalo pero no lo corrijas.
- Antes de entregar un cambio no trivial, pregúntate si existe una forma más simple. No sobre-ingenierices los arreglos obvios.

## 5. Ciclo de lecciones
- Después de cada corrección de Tomás o hallazgo de auditoría, registra el patrón en tasks/lessons.md como una regla breve que prevenga repetir el error.
- Lee tasks/lessons.md al iniciar cada tarea.
