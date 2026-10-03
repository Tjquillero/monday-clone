# Lessons Learned — Mantenix

1. **Integridad de archivos especificados en Gates:** Si un archivo o recurso no coincide exactamente con lo que pide el gate, reportarlo inmediatamente y detenerse en vez de sustituirlo por otro de forma autónoma (ej. caso del logo institucional).
2. **Paridad de esquema en Mocks de pruebas:** Los mocks de base de datos en las pruebas deben reflejar estrictamente las columnas reales existentes en `supabase/migrations/` (ej. caso de `poa_activity_zones.group_id`). Prohibido asumir columnas ficticias en mocks.
3. **Invariante de visitas en reubicación de calendario:** Un cambio de ubicación o agrupación temporal de actividades no debe alterar la cantidad total de visitas configuradas para cada actividad en la semana (ej. caso del paquete del tractor coordinado).
