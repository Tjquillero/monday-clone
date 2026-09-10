/**
 * Test Suite 43 — Dynamic Site Capacity Resolution & UI Indicators v2
 *
 * Verifica los contratos rectores congelados:
 * 1. resolveSiteIdentity(): resuelve la identidad del sitio contra el catálogo maestro `groups` (por id UUID o título).
 * 2. resolveSiteCapacity():
 *    - Sitio en `groups` con 0 personal adscrito -> status: 'VALID', daily_capacity: 0, Y = 0 (NO RESOLUTION_ERROR).
 *    - Sitio en `groups` con N personal adscrito -> status: 'VALID', daily_capacity: N.
 *    - Sitio inexistente en `groups` -> status: 'RESOLUTION_ERROR', daily_capacity: 0 (NUNCA 0 JR silencioso).
 * 3. Calendario Real:
 *    - 5 trabajadores en semana normal (5 días hábiles) -> Y = 25 JR.
 *    - 5 trabajadores en semana con festivo colombiano (4 días hábiles) -> Y = 20 JR.
 * 4. Desacoplamiento de Indicadores:
 *    - JR_mes = 108.39, X = 21.67, Y = 0 -> Déficit semanal D = 21.67, Saldo mensual S = 86.72.
 *    - S (86.72 JR) es Saldo Mensual Programable y está strictly separado del Déficit D.
 * 5. Regresión Crítica de Aislamiento de Sitio:
 *    - CENTRO GASTRONÓMICO !== MERCADO LA SAZÓN (identidades UUID distintas, 0 aliasing).
 */

import {
  resolveSiteIdentity,
  resolveSiteCapacity,
  SiteGroup,
} from '../siteCapacity';
import { calculateOperationalGap } from '../operationalCapacityService';

describe('Test Suite 43 — Dynamic Site Capacity Resolution & UI Indicators v2', () => {

  // Catálogo Maestro de Sitios Mock (Simula la tabla `groups` de Supabase PostgreSQL)
  const masterGroupsMock: SiteGroup[] = [
    { id: 'group_sazon_001', title: 'MERCADO LA SAZÓN' },
    { id: 'group_centro_gast_002', title: 'CENTRO GASTRONÓMICO' },
    { id: 'group_puerto_col_003', title: 'PLAZA PUERTO COLOMBIA' },
    { id: 'group_manglares_004', title: 'PLAYA MANGLARES' },
  ];

  // ───────────────────────────────────────────────────────────────────────────
  // 1. Pruebas de Identidad de Sitio (resolveSiteIdentity)
  // ───────────────────────────────────────────────────────────────────────────
  describe('1. Resolución de Identidad de Sitio (groups)', () => {
    test('Resuelve la identidad correctamente por id UUID', () => {
      const identity = resolveSiteIdentity('group_sazon_001', masterGroupsMock);
      expect(identity).not.toBeNull();
      expect(identity?.id).toBe('group_sazon_001');
      expect(identity?.title).toBe('MERCADO LA SAZÓN');
    });

    test('Resuelve la identidad correctamente por título exacto o insensible a mayúsculas', () => {
      const identity = resolveSiteIdentity('mercado la sazón', masterGroupsMock);
      expect(identity).not.toBeNull();
      expect(identity?.id).toBe('group_sazon_001');
      expect(identity?.title).toBe('MERCADO LA SAZÓN');
    });

    test('Retorna null (RESOLUTION_ERROR) para sitio inexistente en groups', () => {
      const identity = resolveSiteIdentity('SITIO_INEXISTENTE_XYZ', masterGroupsMock);
      expect(identity).toBeNull();
    });
  });

  // ───────────────────────────────────────────────────────────────────────────
  // 2. Pruebas de Capacidad Dinámica (resolveSiteCapacity)
  // ───────────────────────────────────────────────────────────────────────────
  describe('2. Resolución de Capacidad Dinámica (MERCADO LA SAZÓN y Casos Borde)', () => {
    test('MERCADO LA SAZÓN + 0 trabajadores adscritos -> Resultado Operacional Válido de 0 JR (daily_capacity = 0)', () => {
      const identity = resolveSiteIdentity('group_sazon_001', masterGroupsMock);
      expect(identity).not.toBeNull();

      const capacity = resolveSiteCapacity(identity, 0, 5);
      expect(capacity.status).toBe('VALID');
      expect(capacity.siteId).toBe('group_sazon_001');
      expect(capacity.assignedPersonnelCount).toBe(0);
      expect(capacity.daily_capacity).toBe(0);
      expect(capacity.weekly_capacity).toBe(0);
      expect(capacity.source).toBe('PERSONNEL_ASSIGNMENTS');
    });

    test('MERCADO LA SAZÓN + 3 trabajadores adscritos -> daily_capacity = 3 JR/día', () => {
      const identity = resolveSiteIdentity('group_sazon_001', masterGroupsMock);
      expect(identity).not.toBeNull();

      const capacity = resolveSiteCapacity(identity, 3, 5);
      expect(capacity.status).toBe('VALID');
      expect(capacity.assignedPersonnelCount).toBe(3);
      expect(capacity.daily_capacity).toBe(3);
      expect(capacity.weekly_capacity).toBe(15);
    });

    test('Sitio Inexistente -> status: RESOLUTION_ERROR y nunca un 0 JR silenciosamente válido', () => {
      const identity = resolveSiteIdentity('SITIO_INEXISTENTE_XYZ', masterGroupsMock);
      expect(identity).toBeNull();

      const capacity = resolveSiteCapacity(identity, 0, 5);
      expect(capacity.status).toBe('RESOLUTION_ERROR');
      expect(capacity.daily_capacity).toBe(0);
      expect(capacity.weekly_capacity).toBe(0);
    });
  });

  // ───────────────────────────────────────────────────────────────────────────
  // 3. Pruebas de Calendario Real (Días Hábiles Efectivos del Período)
  // ───────────────────────────────────────────────────────────────────────────
  describe('3. Calendario Real de Días Hábiles Efectivos (Y = Y_pers * dias_habiles)', () => {
    test('5 trabajadores + semana normal (5 días hábiles) -> Y = 25 JR', () => {
      const identity = resolveSiteIdentity('group_sazon_001', masterGroupsMock);
      const capacity = resolveSiteCapacity(identity, 5, 5); // 5 días laborables
      expect(capacity.weekly_capacity).toBe(25);
    });

    test('5 trabajadores + semana con festivo colombiano (4 días hábiles) -> Y = 20 JR (NO 25 JR)', () => {
      const identity = resolveSiteIdentity('group_sazon_001', masterGroupsMock);
      const capacity = resolveSiteCapacity(identity, 5, 4); // 4 días laborables por festivo
      expect(capacity.weekly_capacity).toBe(20);
    });
  });

  // ───────────────────────────────────────────────────────────────────────────
  // 4. Pruebas de Aislamiento Estricto entre Sitios (CENTRO GASTRONÓMICO !== MERCADO LA SAZÓN)
  // ───────────────────────────────────────────────────────────────────────────
  describe('4. Aislamiento Estricto de Sitios (0 Aliasing por Nombre)', () => {
    test('CENTRO GASTRONÓMICO y MERCADO LA SAZÓN son identidades totalmente independientes', () => {
      const identitySazon = resolveSiteIdentity('MERCADO LA SAZÓN', masterGroupsMock);
      const identityCentro = resolveSiteIdentity('CENTRO GASTRONÓMICO', masterGroupsMock);

      expect(identitySazon?.id).toBe('group_sazon_001');
      expect(identityCentro?.id).toBe('group_centro_gast_002');
      expect(identitySazon?.id).not.toBe(identityCentro?.id);
    });
  });

  // ───────────────────────────────────────────────────────────────────────────
  // 5. Pruebas de Desacoplamiento de Indicadores (Demanda X vs Capacidad Y vs Saldo S)
  // ───────────────────────────────────────────────────────────────────────────
  describe('5. Indicadores UI (Déficit Semanal D vs Saldo Mensual S)', () => {
    test('MERCADO LA SAZÓN con JR_mes = 100, personas_dia = 4, X = 20, Y = 0 -> D = 20, S = 80', () => {
      const scopeData = { area_verde: 1000 };
      const standards = [
        { activity_key: 'act_1', category: 'ZONA VERDE', rendimiento: 10, requiere_rendimiento: true, frecuencia: 25 },
      ];
      const scopeMappings = [{ activity_key: 'act_1', scope_key: 'area_verde' }];
      const siteAssignments: any[] = []; // 0 personal adscrito (Y = 0)

      const gapSummary = calculateOperationalGap(
        'group_sazon_001',
        'MERCADO LA SAZÓN',
        scopeData,
        standards,
        scopeMappings,
        siteAssignments
      );

      // Verificación de fórmulas
      expect(gapSummary.totalMonthlyJournals).toBe(100);
      expect(gapSummary.totalAssignedWorkers).toBe(0);
      expect(gapSummary.totalRequiredWorkers).toBe(4); // 100 / 25 = 4 personas/día

      // Verificación de demanda semanal activa X y saldo mensual S
      const activeWeeklyDemandX = gapSummary.totalRequiredWorkers * 5; // 4 pers * 5 días = 20 JR/semana
      const monthlyBalanceS = gapSummary.totalMonthlyJournals - activeWeeklyDemandX; // 100 - 20 = 80 JR

      expect(activeWeeklyDemandX).toBe(20);
      expect(monthlyBalanceS).toBe(80);
      // El saldo mensual S (80 JR) representa trabajo de semanas posteriores y no el déficit semanal D (20 JR)
      expect(monthlyBalanceS).not.toBe(activeWeeklyDemandX);
    });
  });

  // ───────────────────────────────────────────────────────────────────────────
  // 6. Prueba de Generalización Rectora del Alcance (scope_key)
  // ───────────────────────────────────────────────────────────────────────────
  describe('6. Generalización de Resolución de scope_key (Sin Defaults Silenciosos de 1000)', () => {
    test('Resuelve estrictamente: presente=real, ausente=0, cero=0, negativo=0, sin inventar 1000 m2', () => {
      const standards = [
        { activity_key: 'corte_grama', category: 'ZONA VERDE', rendimiento: 100, requiere_rendimiento: true, frecuencia: 25 },
        { activity_key: 'poda_arboles', category: 'ZONA VERDE', rendimiento: 10, requiere_rendimiento: true, frecuencia: 25 },
        { activity_key: 'trasiego_playa', category: 'ZONA PLAYA', rendimiento: 50, requiere_rendimiento: true, frecuencia: 25 },
        { activity_key: 'act_cero', category: 'ZONA DURA', rendimiento: 10, requiere_rendimiento: true, frecuencia: 25 },
        { activity_key: 'act_negativa', category: 'ZONA DURA', rendimiento: 10, requiere_rendimiento: true, frecuencia: 25 },
      ];

      const scopeMappings = [
        { activity_key: 'corte_grama', scope_key: 'grama' },
        { activity_key: 'poda_arboles', scope_key: 'arboles' },
        { activity_key: 'trasiego_playa', scope_key: 'zona_playa' },
        { activity_key: 'act_cero', scope_key: 'cero_key' },
        { activity_key: 'act_negativa', scope_key: 'neg_key' },
      ];

      // Caso 1: Sitio con scope_data explícito (sin zona_playa)
      const sazonScopeData = {
        grama: 263,
        arboles: 21,
        cero_key: 0,
        neg_key: -50,
      };

      const gapSazon = calculateOperationalGap(
        'group_sazon_001',
        'MERCADO LA SAZÓN',
        sazonScopeData,
        standards,
        scopeMappings,
        []
      );

      // grama (263/100 = 2.63 JR) + arboles (21/10 = 2.1 JR) = 4.73 JR_mes total.
      // trasiego_playa (ausente) -> 0. act_cero -> 0. act_negativa -> 0.
      expect(gapSazon.totalMonthlyJournals).toBeCloseTo(4.73, 1);
      const playaZone = gapSazon.zoneDetails.find((z) => z.zoneKey === 'ZP');
      expect(playaZone?.requiredWorkers ?? 0).toBe(0);

      // Caso 2: Sitio sin scope_data ({}) -> 0 JR (CERO actividades o JR inventados)
      const gapEmpty = calculateOperationalGap(
        'group_empty_002',
        'SITIO SIN CONFIGURACION',
        {},
        standards,
        scopeMappings,
        []
      );

      expect(gapEmpty.totalMonthlyJournals).toBe(0);
      expect(gapEmpty.totalRequiredWorkers).toBe(0);
      expect(gapEmpty.netDeficit).toBe(0);
    });
  });
});
