# Mantenix — Estado Operativo Actual

**Corte de Estado**: 23/09/2026

```text
╔═════════════════════════════════════════════════════════════════════════════╗
║                      MANTENIX OPERATIONAL STATE MATRIX                      ║
╠═════════════════════════════════════════════════════════════════════════════╣
║ H6.2 FRECUENCIAS CONTRACTUALES V2.0                                         ║
║ 🔒 CLOSED / VERIFIED / CERTIFIED / FROZEN                                   ║
║ Baseline: 136 suites / 1.112 tests PASS / TS 0 errores                       ║
╠═════════════════════════════════════════════════════════════════════════════╣
║ scheduleMaterializationService.ts                                           ║
║ 🟢 RESTAURADO AL BASELINE CERTIFICADO                                       ║
║ 🟢 SIN DRIFT DE CÓDIGO                                                      ║
╠═════════════════════════════════════════════════════════════════════════════╣
║ GATES 1..5 HITO 6.3                                                         ║
║ 🟢 CLOSED / FORMALIZED / VERIFIED (Suite Gate 5: 9/9 PASS)                   ║
╠═════════════════════════════════════════════════════════════════════════════╣
║ H6.3 GOBERNANZA DE FUENTES DE ALCANCE EN MATERIALIZACIÓN                    ║
║ 🟡 ARCHITECTURE DEFINED / GATES 1..5 COMPLETED                              ║
║ 📋 IMPLEMENTATION NOT YET AUTHORIZED                                        ║
╚═════════════════════════════════════════════════════════════════════════════╝
```

## Resumen de Fórmulas y Contratos Validados en Gate 5
1. **Fórmula de Alcance Físico (`planned_qty`)**:
   $$planned\_qty = poa\_activity\_zones.cantidad\_contratada$$
2. **Fórmula de Esfuerzo Operacional (`planned_jr`)**:
   Proviene de `calculateTheoreticalJournals(qty, rendimiento, frecuencia, 25)` en `src/lib/schedulerMath.ts`:
   $$planned\_jr = \frac{planned\_qty}{board\_activity\_standards.rendimiento \times \left(\frac{frecuencia}{25}\right)}$$
3. **No Invención de Fórmulas**: Se preserva 100% la librería matemática pura de `schedulerMath.ts` sin crear fórmulas arbitrarias ni alterar el contrato.
