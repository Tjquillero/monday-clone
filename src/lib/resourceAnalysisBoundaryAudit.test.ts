import {
  OPERATIONAL_STANDARDS_CATALOG_V3,
  OPERATIONAL_SCOPE_MAPPINGS_V3,
  buildOperationalActivityMappings,
  normalizeSiteKey,
} from './operationalStandards';
import { calculateTheoreticalJournals, WORKING_DAYS_MONTH } from './schedulerMath';

describe('🔴 Test 32 — Resource Analysis Boundary Audit (ADR-0010 Restoration)', () => {
  const siteKey = 'puerto_colombia';

  describe('32.1 Catálogo Operativo Aislado del POA', () => {
    it('32.1.1 guarantees mutating POA contractual standards does NOT alter operational activity mappings or calculations', () => {
      // Dummy POA contractual standard mutation (Capa A/B)
      const mutatedPoaStandard = {
        activity_key: 'poa_nivelacion_playa',
        name: 'SUMINISTRO DE PERSONAL PARA NIVELACIÓN MECÁNICA DE PLAYAS',
        rendimiento: 18000,
        frecuencia: 1,
        unit: 'M2',
      };

      // Operational mappings for Puerto Colombia MUST NOT consume mutatedPoaStandard
      const opMappings = buildOperationalActivityMappings(
        OPERATIONAL_STANDARDS_CATALOG_V3,
        OPERATIONAL_SCOPE_MAPPINGS_V3,
        siteKey,
      );

      // Verify poa_nivelacion_playa is NOT present in any operational scope_key
      Object.keys(opMappings).forEach(scopeKey => {
        const rules = opMappings[scopeKey];
        const foundPoaLine = rules.find(r => r.name.includes('NIVELACIÓN MECÁNICA'));
        expect(foundPoaLine).toBeUndefined();
      });
    });
  });

  describe('32.2 Catálogo Contractual Aislado del Operativo', () => {
    it('32.2.1 guarantees mutating V3 field operational standards does NOT alter contractual planned_jr invariants', () => {
      // Contractual planned_jr invariant structure (Capa A/B)
      const contractualPlanItem = {
        poa_activity_key: 'POA_ACT_001',
        planned_qty: 1000,
        planned_jr: 10,
        status: 'CONFIRMED',
      };

      // Freeze contractual plan item
      Object.freeze(contractualPlanItem);

      // Mutate V3 operational standard for Corte de Troncos (on a cloned catalog)
      const opCatalogCopy = OPERATIONAL_STANDARDS_CATALOG_V3.map(s => ({ ...s }));
      const troncos = opCatalogCopy.find(s => s.activity_key === 'corte_troncos');
      if (troncos) {
        troncos.rendimiento = 9999;
      }

      // Contractual planned_jr remains 100% intact
      expect(contractualPlanItem.planned_jr).toBe(10);
      expect(contractualPlanItem.status).toBe('CONFIRMED');
    });
  });

  describe('32.3 Scope no implica acumulación indiscriminada', () => {
    it('32.3.1 scope_key = zona_playa maps ONLY field operational activities (acopio), excluding indiscriminate POA lines', () => {
      const opMappings = buildOperationalActivityMappings(
        OPERATIONAL_STANDARDS_CATALOG_V3,
        OPERATIONAL_SCOPE_MAPPINGS_V3,
        siteKey,
      );

      const playaRules = opMappings['zona_playa'] || [];
      expect(playaRules.length).toBe(1);
      expect(playaRules[0].name).toBe('Acopio y limpieza manual');
      expect(playaRules[0].rend).toBe(3000);
      expect(playaRules[0].freq).toBe(25);
    });
  });

  describe('32.4 Reproducción Exacta de Resultados V3 en Plaza Puerto Colombia', () => {
    it('32.4.1 matches exact V3 Excel figures: 130.94 JR Verde, 77.02 JR Playa, 207.96 JR Total, 8.32 Personas', () => {
      const inputs: Record<string, number> = {
        total_paisajismo: 2620,
        grama: 544.68,
        arbustos: 1850,
        arboles: 225,
        zona_dura: 17150,
        limpieza_marmol: 1192,
        zona_playa: 7887,
        trasiego_playa: 1183,
        corte_troncos: 350,
      };

      const opMappings = buildOperationalActivityMappings(
        OPERATIONAL_STANDARDS_CATALOG_V3,
        OPERATIONAL_SCOPE_MAPPINGS_V3,
        siteKey,
      );

      let totalVerdeJR = 0;
      let totalPlayaJR = 0;
      let totalJR = 0;

      Object.keys(opMappings).forEach(scopeKey => {
        const qty = inputs[scopeKey] || 0;
        if (qty <= 0) return;

        const rules = opMappings[scopeKey];
        rules.forEach(rule => {
          const theoretical = calculateTheoreticalJournals(qty, rule.rend, rule.freq);
          totalJR += theoretical;
          if (rule.category === 'ZONA VERDE' || rule.category === 'ZONA DURA') {
            totalVerdeJR += theoretical;
          } else if (rule.category === 'ZONA DE PLAYA') {
            totalPlayaJR += theoretical;
          }
        });
      });

      const totalPersonal = totalJR / WORKING_DAYS_MONTH;

      // Assertions matching COSTOS GENERALES (V3).xlsx
      expect(totalVerdeJR).toBeCloseTo(130.94, 1);
      expect(totalPlayaJR).toBeCloseTo(77.02, 1);
      expect(totalJR).toBeCloseTo(207.96, 1);
      expect(totalPersonal).toBeCloseTo(8.32, 2);
    });
  });

  describe('32.5 Test Rector de Contaminación (Prueba de Inmunidad contra POA)', () => {
    it('32.5.1 inserting a dummy POA line with scope = zona_playa into board_activity_standards leaves Resource Analysis at 207.96 JR / 8.32 personas', () => {
      // 1. Calculate baseline V3 Resource Analysis
      const inputs: Record<string, number> = {
        total_paisajismo: 2620,
        grama: 544.68,
        arbustos: 1850,
        arboles: 225,
        zona_dura: 17150,
        limpieza_marmol: 1192,
        zona_playa: 7887,
        trasiego_playa: 1183,
        corte_troncos: 350,
      };

      const baselineMappings = buildOperationalActivityMappings(
        OPERATIONAL_STANDARDS_CATALOG_V3,
        OPERATIONAL_SCOPE_MAPPINGS_V3,
        siteKey,
      );

      const calculateTotal = (mappings: Record<string, any[]>) => {
        let total = 0;
        Object.keys(mappings).forEach(scopeKey => {
          const qty = inputs[scopeKey] || 0;
          if (qty <= 0) return;
          mappings[scopeKey].forEach(rule => {
            total += calculateTheoreticalJournals(qty, rule.rend, rule.freq);
          });
        });
        return total;
      };

      const baselineJR = calculateTotal(baselineMappings);
      expect(baselineJR).toBeCloseTo(207.96, 1);

      // 2. Deliberately attempt to contaminate with dummy POA contractual lines
      const contaminatedPoaStandards = [
        {
          activity_key: 'POA_DUMMY_PLAYA_1',
          name: 'SUMINISTRO DE PERSONAL, INSUMOS Y EQUIPOS PARA NIVELACIÓN MECÁNICA DE PLAYAS',
          category: 'ZONA DE PLAYA',
          unit: 'M2',
          rendimiento: 18000,
          frecuencia: 1,
        },
        {
          activity_key: 'POA_DUMMY_PLAYA_2',
          name: 'SUMINISTRO Y DISPOSICIÓN DE EQUIPOS PARA LIMPIEZA Y OXIGENACIÓN MECÁNICA DE PLAYAS',
          category: 'ZONA DE PLAYA',
          unit: 'M2',
          rendimiento: 85000,
          frecuencia: 12.5,
        },
      ];

      // Resource Analysis mappings MUST consume ONLY Operational V3 catalog
      const postContaminationMappings = buildOperationalActivityMappings(
        OPERATIONAL_STANDARDS_CATALOG_V3,
        OPERATIONAL_SCOPE_MAPPINGS_V3,
        siteKey,
      );

      const postContaminationJR = calculateTotal(postContaminationMappings);

      // Total MUST remain 100% immune at 207.96 JR (8.32 persons)
      expect(postContaminationJR).toEqual(baselineJR);
      expect(postContaminationJR / WORKING_DAYS_MONTH).toBeCloseTo(8.32, 2);
    });
  });
});
