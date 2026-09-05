# Frontend UX Audit v1 — Mantenix

**Fecha:** 2026-09-05  
**Estado:** Documento de Auditoría, Guardrails y Plan de Certificación UX (Sin modificaciones de código)  
**Compatibilidad:** 100% compatible con Baseline Arquitectónica Certificada 2386465 (ADR-0007 → ADR-0012)

---

## 1. Resumen Ejecutivo y Corrección Metodológica

Mantenix ha alcanzado una solidez backend certificada. No obstante, **“0% de impacto en la Baseline de Base de Datos” NO significa “Riesgo Cero”**. Una modificación exclusivamente frontend puede vulnerar invariantes operativas, romper la matriz de permisos (`usePermissions`), alterar la sincronización offline (`OfflineSyncContext`) o interrumpir secuencias de usuario clave sin tocar una sola tabla o API.

Este documento establece el marco normativo de experiencia de usuario, los **Guardrails UX (Fase 0)**, el mapa de prioridades P0/P1/P2 y la matriz de certificación multi-dispositivo y multi-rol (Fase 4).

### Regla UX Rector Inviolable
> **"La interfaz debe expresar el lenguaje operacional del usuario y ocultar la complejidad técnica del dominio, salvo cuando dicha complejidad sea necesaria para tomar una decisión."**  
> *El usuario no debe necesitar conocer `ExecutionRecord`, `WeeklyPlanItem`, `occurrence_key` ni `ActaItemSource` para operar Mantenix con fluidez y naturalidad.*

---

## 2. Matriz de Priorización Experta (P0, P1, P2)

| Nivel | Prioridad | Hallazgos UX | Enfoque y Justificación |
|---|---|---|---|
| 🔴 **P0** | **Operación Real & Bloqueos** | **UX-02, UX-07, UX-08, UX-09, UX-10** | Resolver primero la fricción crítica del Líder de Campo en `/my-work`, la falta de feedback asíncrono, la incertidumbre en la sincronización offline y las tablas densas inmanejables. |
| 🟠 **P1** | **Comprensión & Supervisión** | **UX-03, UX-05, UX-06, UX-01** | Agilizar la verificación del Supervisor en `/verification`, erradicar la microcopia técnica/inglés y limpiar la navegación provisional en `navigation.ts`. |
| 🟡 **P2** | **Dashboard & Refinamiento** | **UX-04, UX-11, UX-12** | Implementar las KPI Cards ejecutivas limpias en `/dashboard`, estados vacíos contextuales y coherencia responsive completa. |

---

## 3. Plan de Implementación Fasedo (Fase 0 → Fase 4)

### 🛡️ Fase 0: Guardrail UX (Prerrequisito de Seguridad)
Antes de escribir cualquier línea de código de UI:
1. **Inventario de rutas y componentes:** Cartografía exacta de `src/app/` y `src/components/`.
2. **Matriz de roles y permisos:** Mapeo de capacidades por rol (`ADMIN`, `SUPERVISOR`, `LEADER`, `EXECUTIVE`) según `usePermissions.ts`.
3. **Identificación de servicios consumidos:** Asegurar que cada vista consuma estrictamente los servicios certificados (`routineScheduler`, `weeklyPlanService`, `executionService`, `verificationService`, `actaService`).
4. **Criterios de Aceptación UX & Baseline Funcional de Regresión:** Distinguir mediante pruebas que *"la pantalla se ve diferente"* pero **NO** *"la aplicación se comporta diferente"*.

### 🧹 Fase 1: Limpieza de Superficie y Feedback (Mayor Retorno / Bajo Riesgo)
- Reorganizar el menú lateral en `src/config/navigation.ts` (eliminar rutas fantasma como *"Insumos"* $\rightarrow$ `/dashboard`, visibilizar módulos clave).
- Eliminar la exposición de query params innecesarios en la navegación primaria.
- Traducir y estandarizar el 100% de la microcopia al español operacional (`Pendiente`, `En Proceso`, `Completado`, `Bloqueado`).
- Implementar `Skeleton` loaders en operaciones asíncronas y tarjetas de Estado Vacío (*Empty States*).
- Reforzar el indicador flotante de sincronización offline (`SyncToast.tsx` / `OfflineIndicator.tsx`) con conteo de evidencias locales pendientes.

### 👷 Fase 2: Rediseño Operativo (Campo + Supervisor)
- **Líder / Campo (`/my-work`):** Transformar la vista de tabla en un modo **Mobile First** de Tarjetas de Jornada:
  ```
  [Hoy: 8 Actividades | 3 Pendientes | 4 Ejecutadas | 1 Observada]
  └─ [Actividad: Cortar césped · Zona 04 | Cantidad: 1.250 m²]
      └─ Botón Primario: [REGISTRAR AVANCE & EVIDENCIA FOTO]
  ```
- **Supervisor (`/verification`):** Diseñar el **Visor de Inspección Supervisora** con panel dividido (Evidencia Fotográfica + Coordenadas a la izquierda, Métricas Certificables y Aprobación/Observación directa a la derecha).

### 📊 Fase 3: Dashboard Ejecutivo Consolidado
- Implementar la jerarquía ejecutiva en `/dashboard`:
  1. **Estado Contractual:** KPI Cards de Avance Físico Certificado (m²), Avance Financiero ($) y Actas Pendientes.
  2. **Identificación de Desviaciones:** Sitios con alertas de retraso o ejecuciones observadas.
  3. **Detalle Progresivo:** Evitar paredes saturadas de gráficos redundantes.

### 🧪 Fase 4: Matriz de Certificación UX
Cada fase concluirá con una verificación formal sobre la matriz de regresión UX:

```
                  MATRIZ DE CERTIFICACIÓN UX
┌──────────────────────┬─────────┬────────┬────────┬─────────┐
│ Criterio / Rol       │ Líder   │ Super. │ Admin  │ Ejecut. │
├──────────────────────┼─────────┼────────┼────────┼─────────┤
│ Desktop (1440px+)    │   ✓     │   ✓    │   ✓    │    ✓    │
│ Tablet (768px - 1024)│   ✓     │   ✓    │   ✓    │    ✓    │
│ Mobile (375px - 430) │  [P0]   │  [P1]  │   ✓    │    ✓    │
│ Offline / Sync       │  [P0]   │   N/A  │   N/A  │   N/A   │
│ Feedback / Loading   │   ✓     │   ✓    │   ✓    │    ✓    │
│ Permisos & RLS       │   ✓     │   ✓    │   ✓    │    ✓    │
└──────────────────────┴─────────┴────────┴────────┴─────────┘
```

---

## 4. Cadena de Valor del Producto

$$\mathbf{BASELINE\ ARQUITECTÓNICA\ 2386465} \longrightarrow \mathbf{CONTRATO\ PRESERVADO} \longrightarrow \mathbf{FRONTEND\ UX\ INCREMENTADO} \longrightarrow \mathbf{REGRESIÓN\ FUNCIONAL} \longrightarrow \mathbf{CERTIFICACIÓN\ UX}$$
