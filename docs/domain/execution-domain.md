# Definición y Reglas del Dominio: Ejecución (Execution)

**Estado: Propuesto — primera versión, alcance limitado a Jornadas y Estados de ejecución.**

## Introducción
Este documento describe el subdominio de Ejecución de Mantenix. Deriva de la Programación ([`schedule-domain.md`](./schedule-domain.md), Propuesto) y, en última instancia, del dominio contractual del POA ([`poa-domain.md`](./poa-domain.md), Congelado v1), sin modificar ninguno de los dos. Se articula con el ciclo de estados del negocio ya congelado en [`workflow.md`](./workflow.md) (Máquina 2), del cual no duplica las transiciones — las referencia.

## Alcance
De las áreas conceptuales de este subdominio (Jornadas, Evidencias, Estados de ejecución, Incidencias), esta versión cubre únicamente **Jornadas y sus Estados de ejecución**. El resto queda fuera de alcance (ver "Fuera de Alcance"), para no documentar como vigente algo que todavía no forma parte del negocio operativo.

---

## Conceptos Fundamentales

### ¿Qué es la Ejecución?
La Ejecución es el subdominio que certifica, en campo, el trabajo realmente realizado contra una Línea Programada. Se materializa en **Jornadas**.

*   **No es la Programación:** no decide qué debía ejecutarse — eso ya quedó fijado en el Plan Semanal (`schedule-domain.md`). Solo certifica qué se ejecutó.
*   **No es la Facturación:** una Jornada certifica trabajo realizado; no genera por sí sola el derecho a cobro. Eso corresponde al subdominio de Facturación (`billing-domain.md`, pendiente), que se apoya en las Jornadas verificadas.
*   **Es la fuente de retroalimentación del rendimiento:** las observaciones derivadas de Jornadas cerradas alimentan ciclos futuros de Programación, sin alterar los ya generados (Principio de Reproducibilidad Histórica, `poa-domain.md`).

---

## Glosario y Definiciones del Dominio

*   **Jornada:** Evento de ejecución que certifica, para una Línea Programada y una fecha determinada, el trabajo realizado por una cuadrilla en campo.
*   **Cuadrilla:** Agrupación de trabajadores que ejecuta una Jornada bajo la responsabilidad de un líder.
*   **Cantidad Ejecutada:** Cantidad que una Jornada certifica como realizada. Se acumula por Línea Programada, considerando únicamente Jornadas reportadas o verificadas, y alimenta la comparación contra la Cantidad Contratada (`poa-domain.md`).
*   **Jornal Ejecutado:** Medida operativa del esfuerzo invertido en una Jornada (función de la cantidad de trabajadores y la duración). Alimenta la retroalimentación de rendimiento para la Programación futura; no es un término contractual.
*   **Estado de la Jornada:** Ciclo de vida propio de la Jornada, congelado en `workflow.md` (Máquina 2): registro inicial, reporte al supervisor, y verificación o rechazo.
*   **Verificación:** Acto por el cual el supervisor confirma una Jornada reportada.
*   **Rechazo:** Acto por el cual el supervisor observa una Jornada reportada como no conforme, con motivo documentado.
*   **Corrección:** Nueva Jornada registrada para reemplazar una Jornada rechazada. Nunca es una reapertura de la Jornada original.

---

## Principios Rectores

> [!IMPORTANT]
> **Herencia del Desacoplamiento:** la Ejecución certifica lo realizado; no reprograma la Programación ni recontrata el POA. Ante cualquier conflicto aparente entre este documento y `poa-domain.md` o `schedule-domain.md`, prevalecen esos documentos (regla de precedencia, `docs/domain/README.md`).

> [!IMPORTANT]
> **Terminalidad de la Verificación:** una vez verificada o rechazada, una Jornada no vuelve a cambiar de estado. La corrección de una Jornada rechazada siempre se registra como una Jornada nueva, nunca como una reapertura de la anterior — el motivo del rechazo queda documentado y visible para quien corrige.

> [!TIP]
> **El Jornal no es Dinero:** el Jornal Ejecutado mide esfuerzo operativo; no genera, por sí mismo, ningún derecho de cobro.

---

## Reglas de Negocio del Subdominio

Las transiciones de estado de la Jornada están **congeladas en `workflow.md`** y no se repiten aquí. Las siguientes reglas son propias de este subdominio:

### Regla E1: Origen desde la Programación
Toda Jornada debe registrarse contra una Línea Programada vigente de un Plan Semanal. No puede registrarse una Jornada para una actividad que no haya sido programada.

### Regla E2: Ventana de Registro
Una Jornada solo puede registrarse mientras el Plan Semanal que la contiene esté vigente para la ejecución (publicado o en curso, según `workflow.md`). No se registran Jornadas contra planes que aún están en edición ni contra planes ya cerrados.

### Regla E3: Edición Limitada al Creador y al Registro Inicial
Una Jornada solo puede editarse, mientras se encuentre en su estado inicial de registro, y únicamente por quien la creó. Una vez reportada, su corrección sigue la Regla E5 — nunca una edición directa.

### Regla E4: Verificación Obligatoria antes del Avance del Plan
Ninguna Jornada reportada puede quedar sin verificar o rechazar antes de que el Plan Semanal avance a su etapa de confirmación.

### Regla E5: Corrección por Reemplazo, no por Reapertura
Una Jornada rechazada es terminal: no se reabre ni se edita. Su corrección se registra siempre como una Jornada nueva.

### Regla E6: Solo lo Reportado y lo Verificado Cuentan para el Avance
El avance acumulado de una Línea Programada frente a la Cantidad Contratada se calcula únicamente con Jornadas reportadas o verificadas. Los registros iniciales sin reportar y las Jornadas rechazadas no se contabilizan.

### Regla E7: El Jornal es Medida Operativa, no Contractual
El Jornal Ejecutado de una Jornada retroalimenta la planificación futura. No participa en ningún cálculo de precio, frecuencia o facturación.

---

## Fuera de Alcance

Estas áreas pertenecen conceptualmente al subdominio de Ejecución, pero no forman parte del alcance de esta versión:

*   **Evidencias:** este subdominio no define todavía cómo se registran fotografías, firmas u otro soporte de campo asociado a una Jornada.
*   **Incidencias:** el negocio registra novedades del sitio, pero este subdominio no las define todavía como parte del ciclo de la Jornada — hoy se gestionan de forma independiente, a nivel de sitio.

Cuando cualquiera de estas áreas empiece a formar parte del negocio operativo integrado a la Jornada, se incorpora aquí como una nueva sección de reglas — no se diseña por anticipado.

---

## Diagrama de Dominio

```
Plan Semanal
 └── Línea Programada
      └── Jornada
           └── Verificación
```
