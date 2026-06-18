import { Item } from '@/types/monday';
import { 
    calculateTotalJornales, 
    isActivityDueToday,
    getSiteCapacity,
    isHolidayOrRestDay
} from './utils';
import { planDailyActivities } from '../../lib/siteCapacity';

describe('Execution Planning Engine', () => {
    const mockItems: Item[] = [
        { 
            id: '1', 
            name: 'Poda de Grama', 
            values: { cant: '100', rend: '10', frec: '1' } // Total 10 JOR, requiere 10 JOR por ocurrencia (mensual)
        },
        { 
            id: '2', 
            name: 'Limpieza Zonas Duras', 
            values: { cant: '50', rend: '5', frec: '25' } // Total 10 JOR, requiere 0.4 JOR hoy (diario)
        }
    ] as any;

    describe('planDailyActivities', () => {
        it('should distribute work according to capacity', () => {
            const capacity = { zv: 1, zd: 1, zp: 1, daily_capacity: 15 };
            const plan = planDailyActivities(mockItems, capacity, 1);
            
            // Total requerido: 10 + 0.4 = 10.4
            expect(plan.totalJornalesRequired).toBe(10.4);
            expect(plan.scheduledToday).toHaveLength(2); // Ambas caben dentro de 15
            expect(plan.deferred).toHaveLength(0);
            expect(plan.overloaded).toBe(false);
        });

        it('should prioritize items correctly', () => {
            const capacity = { zv: 1, zd: 1, zp: 1, daily_capacity: 5 };
            // Capacidad de 5: Cabe Item 2 (0.4), pero Item 1 (10) no cabe
            const plan = planDailyActivities(mockItems, capacity, 1);
            
            expect(plan.totalJornalesRequired).toBe(10.4);
            expect(plan.scheduledToday).toHaveLength(1);
            expect(plan.scheduledToday[0].id).toBe('2'); // Item 2 programado
            expect(plan.deferred).toHaveLength(1);
            expect(plan.deferred[0].id).toBe('1'); // Item 1 diferido
            expect(plan.overloaded).toBe(true);
        });
    });

    describe('isActivityDueToday', () => {
        it('should return true for daily frequency (25)', () => {
            const workday = new Date('2024-03-20T12:00:00'); // Miércoles (no festivo)
            expect(isActivityDueToday(25, workday)).toBe(true);
        });

        it('should return false for monthly frequency (1) on a non-scheduled day', () => {
            const workday = new Date('2024-03-20T12:00:00'); // Miércoles (no festivo)
            // Con frec 1 y sin offset coincidente, no debería tocar hoy
            expect(isActivityDueToday(1, workday, undefined, 'some-item-id')).toBe(false);
        });
    });

    describe('isHolidayOrRestDay (Real World Situations)', () => {
        it('should return true for a Sunday', () => {
            const sunday = new Date('2024-03-24T12:00:00'); // Es domingo
            expect(isHolidayOrRestDay(sunday)).toBe(true);
        });

        it('should return true for a known Colombia Holiday (May 1st)', () => {
            const holiday = new Date('2024-05-01T12:00:00');
            expect(isHolidayOrRestDay(holiday)).toBe(true);
        });

        it('should return false for a regular Wednesday', () => {
            const wednesday = new Date('2024-03-20T12:00:00');
            expect(isHolidayOrRestDay(wednesday)).toBe(false);
        });
    });

    describe('getSiteCapacity with Date', () => {
        it('should return 0 capacity on holidays', () => {
            const holiday = new Date('2024-05-01T12:00:00');
            const cap = getSiteCapacity('ZONAS VERDES', holiday);
            expect(cap.daily_capacity).toBe(0);
            expect((cap as any).is_rest_day).toBe(true);
        });

        it('should return normal capacity on workdays', () => {
            const workday = new Date('2024-03-20T12:00:00');
            const cap = getSiteCapacity('ZONAS VERDES', workday);
            expect(cap.daily_capacity).toBe(10);
        });
    });
});
