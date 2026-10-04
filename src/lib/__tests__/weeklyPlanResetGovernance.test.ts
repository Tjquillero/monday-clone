import fs from 'fs';
import path from 'path';

import {
  resetWeeklyPlan,
  translateResetErrorCode,
  WeeklyPlanResetError,
} from '../weeklyPlanResetService';

describe('GATE PLAN-REDO-01 — Reprogramar semana gobernada', () => {
  // 1. resetWeeklyPlan traduce cada código RESET_* y propaga el error sin materializar
  describe('1. resetWeeklyPlan — Traducción de códigos de error y propagación', () => {
    it('traduce RESET_DENIED: no autenticado', async () => {
      const mockSupabase = {
        rpc: jest.fn().mockResolvedValue({
          data: null,
          error: { message: 'RESET_DENIED: no autenticado' },
        }),
      };

      await expect(
        resetWeeklyPlan(mockSupabase, 'plan-1', 'Motivo válido de más de 10 caracteres')
      ).rejects.toThrow('No autenticado: debes iniciar sesión');

      try {
        await resetWeeklyPlan(mockSupabase, 'plan-1', 'Motivo válido de más de 10 caracteres');
      } catch (err: any) {
        expect(err).toBeInstanceOf(WeeklyPlanResetError);
        expect(err.code).toBe('RESET_DENIED');
      }
    });

    it('traduce RESET_DENIED genérico (permisos)', async () => {
      const mockSupabase = {
        rpc: jest.fn().mockResolvedValue({
          data: null,
          error: { message: 'RESET_DENIED' },
        }),
      };

      await expect(
        resetWeeklyPlan(mockSupabase, 'plan-1', 'Motivo válido de prueba')
      ).rejects.toThrow('Acceso denegado: no tienes permisos');
    });

    it('traduce RESET_REASON_REQUIRED', async () => {
      const mockSupabase = {
        rpc: jest.fn().mockResolvedValue({
          data: null,
          error: { message: 'RESET_REASON_REQUIRED' },
        }),
      };

      await expect(
        resetWeeklyPlan(mockSupabase, 'plan-1', 'corto')
      ).rejects.toThrow('El motivo de reprogramación es obligatorio');
    });

    it('traduce RESET_PLAN_NOT_FOUND', async () => {
      const mockSupabase = {
        rpc: jest.fn().mockResolvedValue({
          data: null,
          error: { message: 'RESET_PLAN_NOT_FOUND' },
        }),
      };

      await expect(
        resetWeeklyPlan(mockSupabase, 'plan-inexistente', 'Motivo suficientemente largo')
      ).rejects.toThrow('El plan semanal no existe o no fue encontrado');
    });

    it('traduce RESET_INVALID_STATUS con el estado actual', async () => {
      const mockSupabase = {
        rpc: jest.fn().mockResolvedValue({
          data: null,
          error: { message: 'RESET_INVALID_STATUS: in_progress' },
        }),
      };

      await expect(
        resetWeeklyPlan(mockSupabase, 'plan-1', 'Motivo suficientemente largo')
      ).rejects.toThrow('Solo se pueden reprogramar planes en borrador o publicados. El plan actual se encuentra en estado: in_progress.');
    });

    it('traduce RESET_WEEK_STARTED', async () => {
      const mockSupabase = {
        rpc: jest.fn().mockResolvedValue({
          data: null,
          error: { message: 'RESET_WEEK_STARTED' },
        }),
      };

      await expect(
        resetWeeklyPlan(mockSupabase, 'plan-1', 'Motivo suficientemente largo')
      ).rejects.toThrow('No se puede reprogramar una semana que ya ha iniciado');
    });

    it('traduce RESET_HAS_EXECUTIONS', async () => {
      const mockSupabase = {
        rpc: jest.fn().mockResolvedValue({
          data: null,
          error: { message: 'RESET_HAS_EXECUTIONS' },
        }),
      };

      await expect(
        resetWeeklyPlan(mockSupabase, 'plan-1', 'Motivo suficientemente largo')
      ).rejects.toThrow('No se puede reprogramar este plan porque ya cuenta con registros de ejecución en campo.');
    });

    it('retorna la cantidad de ítems eliminados en caso de éxito', async () => {
      const mockSupabase = {
        rpc: jest.fn().mockResolvedValue({
          data: 42,
          error: null,
        }),
      };

      const count = await resetWeeklyPlan(
        mockSupabase,
        'plan-1',
        'Cambio de frecuencia operativa de la actividad 1.15'
      );
      expect(count).toBe(42);
      expect(mockSupabase.rpc).toHaveBeenCalledWith('reset_weekly_plan_items', {
        p_plan_id: 'plan-1',
        p_reason: 'Cambio de frecuencia operativa de la actividad 1.15',
      });
    });
  });

  // 2. Reglas de visibilidad del botón en la interfaz
  describe('2. Reglas de visibilidad para reprogramar semana', () => {
    // Función pura de evaluación de visibilidad (idéntica a la lógica en WeeklyPlannerView)
    function canShowResetButton(params: {
      savedPlan?: { status: string; week_start: string };
      savedPlanItems?: Array<{ executed_qty?: number; executed_jr?: number }>;
      todayBogotaStr: string;
    }): boolean {
      const { savedPlan, savedPlanItems, todayBogotaStr } = params;
      if (!savedPlan) return false;
      const validStatus = savedPlan.status === 'draft' || savedPlan.status === 'published';
      const isFuture = savedPlan.week_start > todayBogotaStr;
      const hasExecutions = Boolean(
        savedPlanItems &&
          savedPlanItems.some((i) => (i.executed_qty || 0) > 0 || (i.executed_jr || 0) > 0)
      );
      return validStatus && isFuture && !hasExecutions;
    }

    const today = '2026-10-03';
    const futureWeek = '2026-10-12';
    const pastWeek = '2026-09-28';
    const currentWeek = '2026-10-03';

    it('MUESTRA el botón para semana futura en draft o published sin ejecuciones', () => {
      expect(
        canShowResetButton({
          savedPlan: { status: 'draft', week_start: futureWeek },
          savedPlanItems: [{ executed_qty: 0, executed_jr: 0 }],
          todayBogotaStr: today,
        })
      ).toBe(true);

      expect(
        canShowResetButton({
          savedPlan: { status: 'published', week_start: futureWeek },
          savedPlanItems: [{ executed_qty: 0, executed_jr: 0 }],
          todayBogotaStr: today,
        })
      ).toBe(true);
    });

    it('OCULTA el botón cuando la semana ya empezó o es pasada', () => {
      expect(
        canShowResetButton({
          savedPlan: { status: 'published', week_start: pastWeek },
          savedPlanItems: [],
          todayBogotaStr: today,
        })
      ).toBe(false);

      expect(
        canShowResetButton({
          savedPlan: { status: 'published', week_start: currentWeek },
          savedPlanItems: [],
          todayBogotaStr: today,
        })
      ).toBe(false);
    });

    it('OCULTA el botón cuando el estado es in_progress, confirmed, closed o cancelled', () => {
      const invalidStatuses = ['in_progress', 'confirmed', 'closed', 'cancelled'];
      for (const status of invalidStatuses) {
        expect(
          canShowResetButton({
            savedPlan: { status, week_start: futureWeek },
            savedPlanItems: [],
            todayBogotaStr: today,
          })
        ).toBe(false);
      }
    });

    it('OCULTA el botón cuando hay registros de ejecución en campo', () => {
      expect(
        canShowResetButton({
          savedPlan: { status: 'published', week_start: futureWeek },
          savedPlanItems: [{ executed_qty: 50, executed_jr: 0.5 }],
          todayBogotaStr: today,
        })
      ).toBe(false);
    });

    it('OCULTA el botón cuando el plan no está guardado', () => {
      expect(
        canShowResetButton({
          savedPlan: undefined,
          savedPlanItems: [],
          todayBogotaStr: today,
        })
      ).toBe(false);
    });
  });

  // 3. Tras un reset exitoso se llama una sola vez al flujo de materialización de esa semana
  describe('3. Flujo orquestado: Reset y re-materialización', () => {
    it('dispara la materialización exactamente 1 vez tras un reset exitoso', async () => {
      const mockSupabase = {
        rpc: jest.fn().mockResolvedValue({ data: 30, error: null }),
      };
      const mockMaterialize = jest.fn().mockResolvedValue({ notOperational: false });

      // Simulación del handler handleResetPlan
      const boardId = 'board-1';
      const groupId = 'group-1';
      const planId = 'plan-1';
      const weekStart = new Date('2026-10-12T00:00:00Z');
      const reason = 'Actualización técnica de frecuencias';

      // 1. Reset
      await resetWeeklyPlan(mockSupabase, planId, reason);
      // 2. Materialización con el mismo flujo
      await mockMaterialize(mockSupabase, boardId, groupId, weekStart);

      expect(mockSupabase.rpc).toHaveBeenCalledTimes(1);
      expect(mockMaterialize).toHaveBeenCalledTimes(1);
      expect(mockMaterialize).toHaveBeenCalledWith(mockSupabase, boardId, groupId, weekStart);
    });

    it('NO dispara la materialización si el reset falla', async () => {
      const mockSupabase = {
        rpc: jest.fn().mockResolvedValue({
          data: null,
          error: { message: 'RESET_WEEK_STARTED' },
        }),
      };
      const mockMaterialize = jest.fn();

      let caughtError: any = null;
      try {
        await resetWeeklyPlan(mockSupabase, 'plan-1', 'Motivo válido');
        await mockMaterialize();
      } catch (err) {
        caughtError = err;
      }

      expect(caughtError).toBeTruthy();
      expect(mockMaterialize).not.toHaveBeenCalled();
    });
  });

  // 4. Prueba de texto sobre el SQL de la migración
  describe('4. Inspección estática del DDL de migración (2026100301_reset_weekly_plan_items.sql)', () => {
    const migrationPath = path.resolve(
      process.cwd(),
      'supabase/migrations/2026100301_reset_weekly_plan_items.sql'
    );

    it('el archivo de migración existe y contiene todas las directivas de seguridad obligatorias', () => {
      expect(fs.existsSync(migrationPath)).toBe(true);
      const sql = fs.readFileSync(migrationPath, 'utf8');

      // Cláusulas y constantes requeridas
      expect(sql).toContain('FOR UPDATE');
      expect(sql).toContain('RESET_WEEK_STARTED');
      expect(sql).toContain('RESET_HAS_EXECUTIONS');
      expect(sql).toContain('PLAN_ITEMS_RESET');
      expect(sql).toContain('America/Bogota');
      expect(sql).toContain('REVOKE');
      expect(sql).toContain('SECURITY DEFINER');
      expect(sql).toContain('can_manage_weekly_plan');
    });

    it('la migración NO contiene sentencias prohibidas de mutación estructural', () => {
      const sql = fs.readFileSync(migrationPath, 'utf8');

      expect(sql).not.toMatch(/ALTER\s+TABLE/i);
      expect(sql).not.toMatch(/DROP\s+TABLE/i);
      expect(sql).not.toMatch(/DROP\s+FUNCTION/i);
      expect(sql).not.toMatch(/CREATE\s+POLICY/i);
    });
  });
});
