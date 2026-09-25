# Sistema de Iconografía Mantenix v1.0

## 1. Gramática y Reglas de Diseño
* **Grid Base:** 24 × 24 px
* **Grosor de Trazo (Stroke):** 2px constante (`strokeWidth={2}`)
* **Terminaciones y Vértices:** Redondeadas (`strokeLinecap="round"`, `strokeLinejoin="round"`)
* **Relleno:** Sin relleno en reposo (`fill="none"`); relleno suave (`fill="currentColor" opacity="0.15"`) únicamente en estado activo.
* **Proporción icono:texto:** 1:1 en altura visual.
* **Biblioteca Base:** Lucide React (no se recrean iconos genéricos; se define el catálogo unívoco).

---

## 2. Catálogo Canónico por Módulo

| Módulo / Dominio | Icono Lucide Base | Concepto Visual | Variante Activa |
|---|---|---|---|
| **Navegación / Inicio** | `Home` | Casa con trazo continuo | `Home` + Primary subtle |
| **Navegación / Sitios** | `MapPin` | Pin de geolocalización | `MapPin` con punto interno |
| **Navegación / Actividades** | `CheckSquare` / `ListTodo` | Cuadrado de verificación | Borde primario |
| **Navegación / Calendario** | `Calendar` | Calendario con grid | Días marcados |
| **Navegación / Planificación** | `SlidersHorizontal` / `Layers` | Niveles de ajuste | Puntos activos |
| **Navegación / Personal** | `Users` / `User` | Cuadrillas y operarios | Relleno acento |
| **Navegación / Maquinaria** | `Truck` / `Wrench` | Equipos pesados y menores | Línea acentuada |
| **Navegación / Reportes** | `BarChart3` | Columnas métricas | Columna activa |
| **Navegación / Configuración** | `Settings` | Ajustes de sistema | Rotación / Acabado |

---

## 3. Estados Operativos (Regla: Color + Forma + Icono + Texto)

| Estado | Icono Canónico | Color | Semántica |
|---|---|---|---|
| **Planificado** | `Clock` / `CircleDashed` | Neutral / `#8A94A0` | Espera de fecha |
| **En progreso** | `PlayCircle` / `Loader2` | Azul / `#2563EB` | Ejecución activa |
| **Reportado** | `FileText` / `Send` | Violeta / `#7C3AED` | Enviado por cuadrilla |
| **Pendiente de evidencia** | `CameraOff` / `AlertCircle` | Ámbar / `#D97706` | Falta foto causal |
| **Verificado** | `ShieldCheck` | Verde / `#16A34A` | Aprobado por supervisor |
| **Confirmado** | `CheckCircle2` | Verde / `#15803D` | Validado con acta |
| **Cerrado** | `Archive` / `SquareCheck` | Pizarra / `#475569` | Finalizado documental |
| **Rechazado** | `XCircle` | Rojo / `#DC2626` | Devuelto con nota |
| **Resagado** | `AlertTriangle` / `Clock4` | Naranja / `#E8792F` | Vencido no completado |
| **Futuro** | `CalendarClock` | Pizarra tenue / `#94A3B8` | Fecha posterior a hoy |

---

## 4. Estados Offline & Sincronización

* **Offline:** `WifiOff` (Gris neutro)
* **Online:** `Wifi` / `Circle` (Verde discreto)
* **Sincronizando:** `RefreshCw` (Azul tenue girando)
* **Sincronizado:** `Check` (Verde discreto)
* **Pendiente de sync:** `CloudUpload` (Ámbar)
* **Error de sync:** `AlertOctagon` (Rojo peligro — exclusivo para fallo real)
