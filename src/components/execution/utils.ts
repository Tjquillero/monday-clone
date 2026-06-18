import { Item } from '@/types/monday';

export const isHolidayOrRestDay = (date: Date) => {
    // Domingo es día de descanso legal en Colombia
    if (date.getDay() === 0) return true;
    
    // Festivos Oficiales Colombia 2024 y 2025
    const holidays = [
        // 2024
        '2024-01-01', '2024-01-08', '2024-03-25', '2024-03-28', '2024-03-29',
        '2024-05-01', '2024-05-13', '2024-06-03', '2024-06-10', '2024-07-01',
        '2024-07-20', '2024-08-07', '2024-08-19', '2024-10-14', '2024-11-04',
        '2024-11-11', '2024-12-08', '2024-12-25',
        // 2025
        '2025-01-01', '2025-01-06', '2025-03-24', '2025-04-17', '2025-04-18',
        '2025-05-01', '2025-06-02', '2025-06-23', '2025-06-30', '2025-08-07',
        '2025-08-18', '2025-10-13', '2025-11-03', '2025-11-17', '2025-12-08',
        '2025-12-25'
    ];
    
    // Ajuste de zona horaria local para la comparación (ISO string puede fallar por horas)
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    const dateStr = `${year}-${month}-${day}`;
    
    return holidays.includes(dateStr);
};

export const getSiteCapacity = (siteName: string, date: Date) => {
  const isHoliday = isHolidayOrRestDay(date);
  if (isHoliday) return { daily_capacity: 0, base_capacity: 0, target_efficiency: 0, is_rest_day: true };

  const n = siteName.toUpperCase();
  let baseCapacity = 5;
  let targetEfficiency = 0.90;

  if (n.includes('ZONAS VERDES')) { baseCapacity = 10; targetEfficiency = 0.95; }
  else if (n.includes('ZONAS DURAS')) { baseCapacity = 6; targetEfficiency = 0.90; }
  else if (n.includes('CLUB HOUSE') || n.includes('EDIFICIO')) { baseCapacity = 4; targetEfficiency = 0.98; }

  // REGLA TÁCTICA COLOMBIA: Sábados solo 3 horas (de 8) = factor 0.375
  const dayOfWeek = date.getDay();
  const capacityMultiplier = dayOfWeek === 6 ? 0.375 : 1.0;
  const dailyCapacity = baseCapacity * capacityMultiplier;

  return { 
      daily_capacity: dailyCapacity, 
      base_capacity: baseCapacity,
      target_efficiency: targetEfficiency, 
      is_rest_day: isHoliday 
  };
};

export const getVal = (item: Item, colId: string) => {
    if (!item) return null;
    if (colId === 'name' || colId === 'subItems') return (item as any)[colId];
    return item.values?.[colId] || null;
};

export const getZoneValue = (item: Item) => {
    const zone = getVal(item, 'general_area') || getVal(item, 'zona') || 'GENERAL';
    return Array.isArray(zone) ? zone[0] : zone;
};

export const calculateProgressWork = (item: Item) => {
    const execValues = item.values['daily_execution'] || {};
    return Object.values(execValues).reduce((acc: number, val: any) => {
        const amount = typeof val === 'object' ? parseFloat(val.val) : parseFloat(val);
        return acc + (isNaN(amount) ? 0 : amount);
    }, 0);
};

export const calculateTotalJornales = (item: Item) => {
    const cant = parseFloat(getVal(item, 'cant')) || 0;
    const rend = parseFloat(getVal(item, 'rend')) || 1;
    const frec = getFrecValue(item);
    // Fórmula Maestra Mantenix: (CANT / REND) * (DÍAS_MES / FREC)
    // Esto calcula los jornales necesarios por día de ejecución para cumplir el total mensual
    return (cant / (rend || 1)) * (25 / Math.max(0.1, frec));
};

export const calculateTargetJornales = (item: Item) => calculateTotalJornales(item);

export const calculateVerifiedJornales = (item: Item) => {
    const execValues = item.values['daily_execution'] || {};
    return Object.values(execValues).reduce((acc: number, val: any) => {
        if (typeof val === 'object' && val.done && (val.photo || (val.gallery && val.gallery.length > 0))) {
            return acc + (parseFloat(val.val) || 0);
        }
        return acc;
    }, 0);
};

export const isActivityDueToday = (frecValue: number, date: Date = new Date(), startDateStr?: string, itemId?: string | number) => {
    if (isHolidayOrRestDay(date)) return false;
    
    if (frecValue >= 25) return true; // Continuous
    
    const interval = 25 / frecValue;
    const today = new Date();
    const firstOfMonth = new Date(today.getFullYear(), today.getMonth(), 1);
    const startDate = startDateStr ? new Date(startDateStr + "T00:00:00") : firstOfMonth;
    
    const diffTime = date.getTime() - startDate.getTime();
    const diffDays = Math.floor(diffTime / (1000 * 60 * 60 * 24));
    
    if (diffDays < 0) return false;
    
    // BALANCE LOGIC: Start tasks at different offsets within their interval to spread weekly load 
    // Using simple hash from itemId for a stable, predictable offset
    const idHash = itemId ? (String(itemId).split('').reduce((a, v) => a + v.charCodeAt(0), 0) % 100) / 100 : 0;
    const offset = Math.floor(idHash * interval);
    
    const cycleIndex = Math.round((diffDays - offset) / interval);
    const expectedDay = (cycleIndex * interval) + offset;
    return Math.abs(diffDays - expectedDay) < 0.5;
};

export const getFrecValue = (item: Item) => {
    const frecStr = String(getVal(item, 'frequency') || getVal(item, 'frec') || getVal(item, 'frecuencia') || '25').replace(',', '.');
    return parseFloat(frecStr) || 25;
};

export const hasPhysicalBacklog = (item: Item) => {
    const verified = calculateVerifiedJornales(item);
    const target = calculateTargetJornales(item);
    return verified > 0 && verified < (target - 0.05);
};

export const calculateGroupSchedule = (items: Item[], capacity: any, today: Date, days: any[], siteName: string) => {
    const schedule: Record<string, Record<string, number>> = {};
    const todayIdStr = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
    const lastDayStr = days[days.length - 1].date;
    
    // Inicializar schedule vacío para todos los días
    days.forEach(d => { schedule[d.date] = {}; });

    // Registro de ocupación diaria global del sitio para no exceder 'daily_capacity'
    const dailySiteLoad: Record<string, number> = {};
    days.forEach(d => { dailySiteLoad[d.date] = 0; });

    items.forEach(it => {
        const totalJor = calculateTotalJornales(it);
        const frec = getFrecValue(it);
        const meta = parseFloat(getVal(it, 'meta')) || 1;
        
        // CÁLCULO DE ESCALONAMIENTO (STAGGERING): Repartir el inicio de tareas en el intervalo
        const idHash = String(it.id).split('').reduce((a, v) => a + v.charCodeAt(0), 0);
        const staggerDays = Math.floor((idHash % 100) / 100 * Math.max(1, frec));
        
        // Fecha de inicio: Si no hay fecha en Monday, aplicamos el escalonamiento automático desde hoy
        const mondayStart = getVal(it, 'fecha_inicio');
        let cycleDate = mondayStart ? new Date(mondayStart + "T00:00:00") : new Date(today.getTime());
        
        if (!mondayStart) {
            cycleDate.setDate(cycleDate.getDate() + staggerDays);
        }
        
        const endMonthDate = new Date(lastDayStr + "T00:00:00");

        // MOTOR DETERMINISTA: Generar eventos según frecuencia
        while (cycleDate <= endMonthDate) {
            let jorToPlan = totalJor;
            let workPointer = new Date(cycleDate);

            // Expandir el bloque de trabajo en días hábiles sucesivos
            while (jorToPlan > 0.01 && workPointer <= endMonthDate) {
                const dateKey = `${workPointer.getFullYear()}-${String(workPointer.getMonth() + 1).padStart(2, '0')}-${String(workPointer.getDate()).padStart(2, '0')}`;
                
                // 1. Verificar si el día es laborable (Salta domingos y festivos)
                const isWorking = !isHolidayOrRestDay(workPointer);
                
                if (isWorking && schedule[dateKey]) {
                    // 2. Obtener capacidad legal del sitio en esa fecha específica (Sábado vs Lunes)
                    const dayCapObj = getSiteCapacity(siteName, workPointer);
                    const currentLoad = dailySiteLoad[dateKey] || 0;
                    const spotAvailable = Math.max(0, dayCapObj.daily_capacity - currentLoad);

                    // 3. Asignación: Mínimo entre (Necesidad, Meta Diaria, Espacio en Sitio)
                    const allocation = Math.min(jorToPlan, meta, spotAvailable);

                    if (allocation > 0.01) {
                        schedule[dateKey][it.id] = (schedule[dateKey][it.id] || 0) + allocation;
                        dailySiteLoad[dateKey] += allocation;
                        jorToPlan -= allocation;
                    }
                }
                
                // Avanzar un día en el calendario para buscar el siguiente espacio del bloque
                workPointer.setDate(workPointer.getDate() + 1);
            }

            // Saltar a la fecha del próximo ciclo según frecuencia
            cycleDate.setDate(cycleDate.getDate() + Math.max(1, frec));
        }
    });

    return schedule;
};

export const planDailyActivities = (items: Item[], capacity: any, day: number) => {
    // Legacy support for DailyAgendaPanel if needed, but we should use the new projection
    return { scheduledToday: [], deferred: [], totalJornalesRequired: 0, overloaded: false };
};
