# Lessons Learned — Mantenix

1. **Integridad de archivos especificados en Gates:** Si un archivo o recurso no coincide exactamente con lo que pide el gate, reportarlo inmediatamente y detenerse en vez de sustituirlo por otro de forma autónoma (ej. caso del logo institucional).
2. **Paridad de esquema en Mocks de pruebas:** Los mocks de base de datos en las pruebas deben reflejar estrictamente las columnas reales existentes en `supabase/migrations/` (ej. caso de `poa_activity_zones.group_id`). Prohibido asumir columnas ficticias en mocks.
3. **Invariante de visitas en reubicación de calendario:** Un cambio de ubicación o agrupación temporal de actividades no debe alterar la cantidad total de visitas configuradas para cada actividad en la semana (ej. caso del paquete del tractor coordinado).
4. **Nunca modificar `node_modules`, la caché de npm/npx ni paquetes instalados**, ni crear paquetes falsos, enlaces o copias para que algo arranque. Si el entorno de pruebas falla, se reporta el error textual y se detiene.
5. **No cambiar pruebas existentes para que pasen.** Si una prueba anterior falla, se reporta con su salida. No se simula la función que esa prueba verifica.
6. **El runner del proyecto es jest** (`npx jest <archivos>`). No se usa vitest de npx para componentes con DOM.
