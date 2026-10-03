import { SupabaseClient } from '@supabase/supabase-js';
import { getColombianHolidays } from './colombianHolidays';
import { getReportFontFaceStyles } from './reportFontHelper';

export interface MonthlyScheduleReportParams {
  boardId: string;
  month: string; // 'YYYY-MM'
  groupId: string; // group_id or 'ALL'
  version: 'external' | 'full';
}

export interface ActivityMonthCell {
  dateStr: string; // YYYY-MM-DD
  qty: number;
  jr: number;
}

export interface ActivityMonthRow {
  activity_key: string;
  description: string;
  unit: string;
  visits_per_month: number;
  counts_capacity: boolean;
  total_qty: number;
  total_jr: number;
  cells: Map<string, ActivityMonthCell>;
}

export interface CarryoverMonthItem {
  activity_key: string;
  description: string;
  unit: string;
  qty: number;
  jr: number;
}

export interface SiteScheduleReportData {
  siteId: string;
  siteName: string;
  dailyCapacityLimit: number;
  activities: ActivityMonthRow[];
  dailyJournalsCounting: Map<string, number>;
  dailyJournalsMachine: Map<string, number>;
  carryoverStatus: 'NO_DATA' | 'NONE' | 'ITEMS';
  carryoverItems: CarryoverMonthItem[];
  firstPlannedDateStr: string | null;
}

export interface MonthlyScheduleReportData {
  boardName: string;
  contractNumber: string;
  entityName: string;
  poaVersionLabel: string;
  year: number;
  month: number; // 1..12
  monthName: string;
  daysInMonth: number;
  holidays: Array<{ dateStr: string; name: string }>;
  sites: SiteScheduleReportData[];
  version: 'external' | 'full';
}

const MONTH_NAMES = [
  '',
  'ENERO',
  'FEBRERO',
  'MARZO',
  'ABRIL',
  'MAYO',
  'JUNIO',
  'JULIO',
  'AGOSTO',
  'SEPTIEMBRE',
  'OCTUBRE',
  'NOVIEMBRE',
  'DICIEMBRE',
];

const CHAPTER_NAMES: Record<string, string> = {
  '1': 'PLAYAS E INFRAESTRUCTURA COSTERA',
  '2': 'ZONAS VERDES',
  '3': 'ZONAS DURAS Y EQUIPAMIENTO',
};

const DAY_LETTERS = ['D', 'L', 'M', 'X', 'J', 'V', 'S'];

export function parseKeyNum(k: string): [number, number] {
  const parts = k.split('.');
  const a = parseInt(parts[0], 10) || 0;
  const bStr = parts[1] || '0';
  const b = bStr.length === 1 ? parseInt(bStr + '0', 10) : parseInt(bStr, 10);
  return [a, b || 0];
}

export function compareActivityKeys(k1: string, k2: string): number {
  const [a1, b1] = parseKeyNum(k1);
  const [a2, b2] = parseKeyNum(k2);
  if (a1 !== a2) return a1 - a2;
  return b1 - b2;
}

export function formatColombianNumber(x: number, dec?: number): string {
  if (dec === undefined) {
    dec = Math.abs(x) >= 100 ? 0 : Math.abs(x) >= 10 ? 1 : 2;
  }
  const parts = x.toFixed(dec).split('.');
  const intPart = parts[0].replace(/\B(?=(\d{3})+(?!\d))/g, '.');
  if (dec > 0 && parts[1]) {
    return `${intPart},${parts[1]}`;
  }
  return intPart;
}

export function formatCellQuantity(x: number): string {
  if (Math.abs(x) >= 10000) {
    return formatColombianNumber(x / 1000, 1) + 'k';
  }
  return formatColombianNumber(x);
}

export function formatVisitsPerMonth(v: number): string {
  const rounded = Math.round(v * 100) / 100;
  if (Math.abs(rounded - 0.33) < 0.05) return '1/3';
  if (Math.abs(rounded - 0.5) < 0.05) return '1/2';
  if (v === Math.floor(v)) return formatColombianNumber(v, 0);
  return formatColombianNumber(v, 2);
}

export function shortenDescription(desc: string, maxLen = 95): string {
  let d = (desc || '').replace(/\s+/g, ' ').trim();
  const cuts = [', INCLUYE', ' INCLUYE', '. INCLUYE'];
  const upper = d.toUpperCase();
  for (const cut of cuts) {
    const idx = upper.indexOf(cut);
    if (idx > 20) {
      d = d.slice(0, idx).trim();
      break;
    }
  }
  if (d.length <= maxLen) return d;
  return d.slice(0, maxLen - 1).trimEnd() + '…';
}

function escapeHtml(str: string): string {
  return (str || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

/**
 * Paginador genérico para consultas de Supabase que puedan superar las 1.000 filas.
 */
export async function fetchAllRows<T>(
  queryBuilderFn: (from: number, to: number) => Promise<{ data: T[] | null; error: any }>
): Promise<T[]> {
  const all: T[] = [];
  let from = 0;
  const step = 1000;
  while (true) {
    const { data, error } = await queryBuilderFn(from, from + step - 1);
    if (error) {
      throw error;
    }
    const rows = data || [];
    all.push(...rows);
    if (rows.length < step) {
      break;
    }
    from += step;
  }
  return all;
}

/**
 * Recopila todos los datos requeridos para el reporte mensual del cronograma a partir de la base de datos viva.
 */
export async function buildMonthlyScheduleReportData(
  supabase: SupabaseClient,
  params: MonthlyScheduleReportParams
): Promise<MonthlyScheduleReportData> {
  const [yearStr, monthStr] = params.month.split('-');
  const year = parseInt(yearStr, 10);
  const month = parseInt(monthStr, 10);
  const daysInMonth = new Date(Date.UTC(year, month, 0)).getUTCDate();
  const monthName = MONTH_NAMES[month] || '';
  const monthStartStr = `${yearStr}-${monthStr}-01`;
  const monthEndStr = `${yearStr}-${monthStr}-${String(daysInMonth).padStart(2, '0')}`;

  // 1. Consultar información del tablero
  const { data: board, error: boardErr } = await supabase
    .from('boards')
    .select('id, name')
    .eq('id', params.boardId)
    .single();

  if (boardErr) {
    throw new Error(`SCHEDULE_REPORT_READ_FAILED: boards: ${boardErr.message}`);
  }

  const boardName = board?.name || 'Tablero Principal';
  const contractNumber = '____________________';
  const entityName = '____________________';

  // 2. Consultar versión activa de POA (B1)
  const { data: poaRows, error: poaErr } = await supabase
    .from('poa')
    .select('id')
    .eq('board_id', params.boardId);

  if (poaErr) {
    throw new Error(`SCHEDULE_REPORT_READ_FAILED: poa: ${poaErr.message}`);
  }
  const poaIds = (poaRows || []).map((p: any) => p.id).filter(Boolean);
  if (poaIds.length === 0) {
    throw new Error('SCHEDULE_REPORT_NO_ACTIVE_POA: El tablero no cuenta con registro de POA');
  }

  const { data: versionRows, error: versionErr } = await supabase
    .from('poa_versions')
    .select('id, poa_id, version_number')
    .in('poa_id', poaIds)
    .eq('status', 'active');

  if (versionErr) {
    throw new Error(`SCHEDULE_REPORT_READ_FAILED: poa_versions: ${versionErr.message}`);
  }
  const activeVersions = versionRows || [];
  if (activeVersions.length === 0 || activeVersions.length > 1) {
    throw new Error(
      `SCHEDULE_REPORT_NO_ACTIVE_POA: Se requiere exactamente 1 versión de POA activa, encontradas ${activeVersions.length}`
    );
  }

  const activeVersion = activeVersions[0];
  const poaVersionLabel = `POA V.${activeVersion.version_number || 1}`;

  // Leer poa_activities de la versión activa
  const { data: poaActs, error: actsErr } = await supabase
    .from('poa_activities')
    .select('activity_key, description, unit')
    .eq('poa_version_id', activeVersion.id);

  if (actsErr) {
    throw new Error(`SCHEDULE_REPORT_READ_FAILED: poa_activities: ${actsErr.message}`);
  }

  const activityMetaMap = new Map<string, { description: string; unit: string }>();
  for (const act of poaActs || []) {
    if (act.activity_key) {
      activityMetaMap.set(act.activity_key, {
        description: act.description || act.activity_key,
        unit: act.unit || 'UND',
      });
    }
  }

  // 3. Consultar grupos / sitios
  const { data: allGroups, error: groupsErr } = await supabase
    .from('groups')
    .select('id, title, position')
    .eq('board_id', params.boardId)
    .order('position', { ascending: true });

  if (groupsErr) {
    throw new Error(`SCHEDULE_REPORT_READ_FAILED: groups: ${groupsErr.message}`);
  }

  // 4. Consultar operational_frequencies del tablero
  const { data: opFreqs, error: freqsErr } = await supabase
    .from('operational_frequencies')
    .select('group_id, activity_key, visits_per_month, counts_capacity, source')
    .eq('board_id', params.boardId);

  if (freqsErr) {
    throw new Error(`SCHEDULE_REPORT_READ_FAILED: operational_frequencies: ${freqsErr.message}`);
  }

  const opFreqsByGroup = new Map<
    string,
    Array<{ activity_key: string; visits_per_month: number; counts_capacity?: boolean }>
  >();
  for (const f of opFreqs || []) {
    const list = opFreqsByGroup.get(f.group_id) || [];
    list.push({
      activity_key: f.activity_key,
      visits_per_month: Number(f.visits_per_month || 0),
      counts_capacity: f.counts_capacity !== false,
    });
    opFreqsByGroup.set(f.group_id, list);
  }

  // Filtrar grupos con frecuencias operativas (excluye sitios no operativos como Punta Astilleros)
  let eligibleGroups = (allGroups || []).filter((g) => (opFreqsByGroup.get(g.id) || []).length > 0);

  if (params.groupId !== 'ALL') {
    eligibleGroups = eligibleGroups.filter((g) => g.id === params.groupId);
  } else {
    // "Todos los sitios": orden alfabético por nombre
    eligibleGroups.sort((a, b) => a.title.localeCompare(b.title, 'es', { sensitivity: 'base' }));
  }

  // 5. Consultar capacidades diarias
  const { data: capacities, error: capErr } = await supabase
    .from('site_daily_capacity')
    .select('group_id, jornales_dia')
    .eq('board_id', params.boardId);

  if (capErr) {
    throw new Error(`SCHEDULE_REPORT_READ_FAILED: site_daily_capacity: ${capErr.message}`);
  }

  const capacityMap = new Map<string, number>();
  for (const c of capacities || []) {
    capacityMap.set(c.group_id, Number(c.jornales_dia || 0));
  }

  // 6. Consultar planes semanales del mes (B4)
  const firstDay = new Date(Date.UTC(year, month - 1, 1));
  const minDate = new Date(firstDay.getTime() - 6 * 24 * 60 * 60 * 1000);
  const minWeekStartStr = minDate.toISOString().slice(0, 10);

  const { data: monthPlans, error: plansErr } = await supabase
    .from('weekly_plans')
    .select('id, group_id, week_start, status')
    .eq('board_id', params.boardId)
    .gte('week_start', minWeekStartStr)
    .lte('week_start', monthEndStr)
    .neq('status', 'cancelled');

  if (plansErr) {
    throw new Error(`SCHEDULE_REPORT_READ_FAILED: weekly_plans: ${plansErr.message}`);
  }

  const nonCancelledPlans = monthPlans || [];
  const planIds = nonCancelledPlans.map((p) => p.id);

  // 7. Consultar ítems de planes semanales con paginación (B2)
  let allPlanItems: any[] = [];
  if (planIds.length > 0) {
    const CHUNK_SIZE = 100;
    for (let i = 0; i < planIds.length; i += CHUNK_SIZE) {
      const chunk = planIds.slice(i, i + CHUNK_SIZE);
      const itemsChunk = await fetchAllRows(async (from, to) => {
        const { data, error } = await supabase
          .from('weekly_plan_items')
          .select('id, plan_id, activity_key, planned_date, planned_qty, planned_jr, planned_rendimiento')
          .in('plan_id', chunk)
          .order('id', { ascending: true })
          .range(from, to);

        if (error) {
          throw new Error(`SCHEDULE_REPORT_READ_FAILED: weekly_plan_items: ${error.message}`);
        }
        return { data, error: null };
      });
      allPlanItems.push(...itemsChunk);
    }
  }

  // 8. Consultar eventos de materialización para obtener el arrastre proyectado al mes siguiente (B6, C1, C2)
  const { data: matEvents, error: matErr } = await supabase
    .from('materialization_events')
    .select('group_id, week_start, status, payload, created_at')
    .eq('board_id', params.boardId)
    .eq('event_type', 'SITE_MATERIALIZATION_SUMMARY')
    .neq('status', 'FAILED')
    .gte('week_start', monthStartStr)
    .lte('week_start', monthEndStr)
    .order('week_start', { ascending: false })
    .order('created_at', { ascending: false });

  if (matErr) {
    throw new Error(`SCHEDULE_REPORT_READ_FAILED: materialization_events: ${matErr.message}`);
  }

  const carryoverByGroup = new Map<
    string,
    { status: 'NO_DATA' | 'NONE' | 'ITEMS'; items: CarryoverMonthItem[] }
  >();

  for (const ev of matEvents || []) {
    if (ev.status === 'FAILED') continue;
    if (carryoverByGroup.has(ev.group_id)) continue;

    const payload = ev.payload as any;
    const rawCarry =
      payload?.carryover_next_month_projection ?? payload?.carryover_next_month;

    // Solo considerar si el payload tiene carryover_next_month_projection (o alias) como arreglo (C1)
    if (!Array.isArray(rawCarry)) {
      continue;
    }

    if (rawCarry.length === 0) {
      carryoverByGroup.set(ev.group_id, { status: 'NONE', items: [] });
    } else {
      const items: CarryoverMonthItem[] = rawCarry.map((c: any) => {
        const meta = activityMetaMap.get(c.activity_key) || {
          description: c.activity_key,
          unit: 'UND',
        };
        return {
          activity_key: c.activity_key,
          description: meta.description,
          unit: meta.unit,
          qty: Number(c.qty || 0),
          jr: Number(c.jr || 0),
        };
      });
      carryoverByGroup.set(ev.group_id, { status: 'ITEMS', items });
    }
  }

  // 9. Construir estructura de reporte por cada sitio
  const holidays = getColombianHolidays(year).filter((h) => {
    const hMonth = parseInt(h.dateStr.split('-')[1], 10);
    return hMonth === month;
  });

  const sitesData: SiteScheduleReportData[] = [];

  for (const group of eligibleGroups) {
    const siteOpFreqs = opFreqsByGroup.get(group.id) || [];
    const opFreqMap = new Map<string, { visits_per_month: number; counts_capacity?: boolean }>();
    for (const f of siteOpFreqs) {
      opFreqMap.set(f.activity_key, f);
    }

    const groupPlans = nonCancelledPlans.filter((p) => p.group_id === group.id);
    const groupPlanIds = new Set(groupPlans.map((p) => p.id));
    const groupItems = allPlanItems.filter((i) => groupPlanIds.has(i.plan_id));

    // Filtrar ítems válidos dentro del mes
    const monthGroupItems = groupItems.filter((item) => {
      if (!item.planned_date) return false;
      return item.planned_date >= monthStartStr && item.planned_date <= monthEndStr;
    });

    // B5: firstPlannedDateStr es la primera planned_date del sitio con ítems dentro del mes
    let firstPlannedDateStr: string | null = null;
    if (monthGroupItems.length > 0) {
      const dates = monthGroupItems.map((i) => i.planned_date).sort();
      firstPlannedDateStr = dates[0];
    }

    // Agrupar items por (activity_key, planned_date)
    const activitiesMap = new Map<string, ActivityMonthRow>();
    const dailyJournalsCounting = new Map<string, number>();
    const dailyJournalsMachine = new Map<string, number>();

    // Inicializar actividades basadas en frecuencias operativas
    for (const f of siteOpFreqs) {
      const meta = activityMetaMap.get(f.activity_key) || {
        description: f.activity_key,
        unit: 'UND',
      };
      activitiesMap.set(f.activity_key, {
        activity_key: f.activity_key,
        description: meta.description,
        unit: meta.unit,
        visits_per_month: f.visits_per_month,
        counts_capacity: f.counts_capacity !== false,
        total_qty: 0,
        total_jr: 0,
        cells: new Map(),
      });
    }

    for (const item of monthGroupItems) {
      let actRow = activitiesMap.get(item.activity_key);
      if (!actRow) {
        const meta = activityMetaMap.get(item.activity_key) || {
          description: item.activity_key,
          unit: 'UND',
        };
        const opF = opFreqMap.get(item.activity_key);
        actRow = {
          activity_key: item.activity_key,
          description: meta.description,
          unit: meta.unit,
          visits_per_month: opF?.visits_per_month || 0,
          counts_capacity: opF?.counts_capacity !== false,
          total_qty: 0,
          total_jr: 0,
          cells: new Map(),
        };
        activitiesMap.set(item.activity_key, actRow);
      }

      const q = Number(item.planned_qty || 0);
      const j = Number(item.planned_jr || 0);

      actRow.total_qty = Number((actRow.total_qty + q).toFixed(2));
      actRow.total_jr = Number((actRow.total_jr + j).toFixed(4));

      const existingCell = actRow.cells.get(item.planned_date) || {
        dateStr: item.planned_date,
        qty: 0,
        jr: 0,
      };
      existingCell.qty = Number((existingCell.qty + q).toFixed(2));
      existingCell.jr = Number((existingCell.jr + j).toFixed(4));
      actRow.cells.set(item.planned_date, existingCell);

      if (actRow.counts_capacity) {
        dailyJournalsCounting.set(
          item.planned_date,
          Number(((dailyJournalsCounting.get(item.planned_date) || 0) + j).toFixed(4))
        );
      } else {
        dailyJournalsMachine.set(
          item.planned_date,
          Number(((dailyJournalsMachine.get(item.planned_date) || 0) + j).toFixed(4))
        );
      }
    }

    const sortedActivities = Array.from(activitiesMap.values()).sort((a, b) =>
      compareActivityKeys(a.activity_key, b.activity_key)
    );

    const carryData = carryoverByGroup.get(group.id);
    const carryoverStatus = carryData ? carryData.status : 'NO_DATA';
    const carryoverItems = carryData ? carryData.items : [];
    carryoverItems.sort((a, b) => compareActivityKeys(a.activity_key, b.activity_key));

    sitesData.push({
      siteId: group.id,
      siteName: group.title,
      dailyCapacityLimit: capacityMap.get(group.id) || 0,
      activities: sortedActivities,
      dailyJournalsCounting,
      dailyJournalsMachine,
      carryoverStatus,
      carryoverItems,
      firstPlannedDateStr,
    });
  }

  return {
    boardName,
    contractNumber,
    entityName,
    poaVersionLabel,
    year,
    month,
    monthName,
    daysInMonth,
    holidays,
    sites: sitesData,
    version: params.version,
  };
}

/**
 * Genera el documento HTML completo del cronograma mensual listo para renderizar en Puppeteer.
 */
export function renderMonthlyScheduleReportHtml(data: MonthlyScheduleReportData): string {
  const full = data.version === 'full';
  const holidaySet = new Set(data.holidays.map((h) => h.dateStr));

  const holidayText =
    data.holidays.length > 0
      ? data.holidays
          .map((h) => {
            const parts = h.dateStr.split('-');
            return `festivo ${parseInt(parts[2], 10)}-${MONTH_NAMES[parseInt(parts[1], 10)].slice(0, 3).toLowerCase()}`;
          })
          .join(', ')
      : 'sin festivos';

  // M2: Fecha de generación en zona horaria America/Bogota
  const todayStr = new Intl.DateTimeFormat('es-CO', {
    timeZone: 'America/Bogota',
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  }).format(new Date());

  const monthShort = data.monthName.toLowerCase();
  const nextMonthName = data.month === 12 ? 'enero' : MONTH_NAMES[data.month + 1].toLowerCase();

  // Array de días 1..daysInMonth
  const days: Array<{ dayNum: number; dateStr: string; dow: number }> = [];
  for (let d = 1; d <= data.daysInMonth; d++) {
    const dStr = `${data.year}-${String(data.month).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
    const dt = new Date(Date.UTC(data.year, data.month - 1, d));
    days.push({ dayNum: d, dateStr: dStr, dow: dt.getUTCDay() });
  }

  const siteBlocks: string[] = [];

  for (let sIdx = 0; sIdx < data.sites.length; sIdx++) {
    const site = data.sites[sIdx];
    const firstPlanned = site.firstPlannedDateStr || '9999-12-31';

    const dayClass = (d: { dayNum: number; dateStr: string; dow: number }) => {
      if (d.dow === 0) return 'dom';
      if (holidaySet.has(d.dateStr)) return 'fest';
      if (d.dateStr < firstPlanned) return 'sinp';
      return '';
    };

    const workingDays = days.filter((d) => d.dow >= 1 && d.dow <= 6 && !holidaySet.has(d.dateStr));
    const plannedWorkingDays = workingDays.filter((d) => d.dateStr >= firstPlanned);
    const plannedWorkingDaysCount = plannedWorkingDays.length;

    let totalCountingJournals = 0;
    for (const d of plannedWorkingDays) {
      totalCountingJournals += site.dailyJournalsCounting.get(d.dateStr) || 0;
    }
    totalCountingJournals = Number(totalCountingJournals.toFixed(4));

    const totalCapacity = site.dailyCapacityLimit * plannedWorkingDaysCount;
    const capacityUsagePct = totalCapacity > 0 ? Math.round((100 * totalCountingJournals) / totalCapacity) : 0;
    const carryTotalJr = site.carryoverItems.reduce((sum, c) => sum + c.jr, 0);

    // Table Headers
    const head1 = days.map((d) => `<th class="d ${dayClass(d)}">${d.dayNum}</th>`).join('');
    const head2 = days.map((d) => `<th class="d ${dayClass(d)}">${DAY_LETTERS[d.dow]}</th>`).join('');

    // Table Body
    const bodyRows: string[] = [];
    let currentChapter: string | null = null;
    const totalCols = (full ? 6 : 3) + days.length;

    for (const act of site.activities) {
      const cap = act.activity_key.split('.')[0];
      if (cap !== currentChapter) {
        currentChapter = cap;
        bodyRows.push(
          `<tr class="cap"><td colspan="${totalCols}">${cap}. ${CHAPTER_NAMES[cap] || ''}</td></tr>`
        );
      }

      const cells = days
        .map((d) => {
          const cl = dayClass(d);
          const cellData = act.cells.get(d.dateStr);
          if (cellData && (cellData.qty > 0 || cellData.jr > 0)) {
            let inner = '';
            if (full) {
              inner = `<span class="q">${formatCellQuantity(cellData.qty)}</span><span class="j">${
                cellData.jr > 0 ? formatColombianNumber(cellData.jr, 2) : '–'
              }</span>`;
            } else {
              inner = `<span class="mk"></span>`;
            }
            return `<td class="d on ${cl}">${inner}</td>`;
          }
          return `<td class="d ${cl}"></td>`;
        })
        .join('');

      const maqTag = !act.counts_capacity ? ' <span class="tag">MAQ</span>' : '';
      const unitCol = full ? `<td class="u">${escapeHtml(act.unit)}</td>` : '';
      const qtyCol = full ? `<td class="n">${formatColombianNumber(act.total_qty)}</td>` : '';
      const jrCol = full ? `<td class="n">${act.total_jr > 0 ? formatColombianNumber(act.total_jr, 2) : '–'}</td>` : '';

      bodyRows.push(
        `<tr>` +
          `<td class="k">${act.activity_key}</td>` +
          `<td class="desc">${escapeHtml(shortenDescription(act.description))}${maqTag}</td>` +
          unitCol +
          `<td class="v">${formatVisitsPerMonth(act.visits_per_month)}</td>` +
          qtyCol +
          jrCol +
          cells +
        `</tr>`
      );
    }

    // Table Footers (Full version only)
    let footRows = '';
    if (full) {
      const renderFooterRow = (label: string, getValue: (d: { dateStr: string }) => string, cls = '') => {
        const fCells = days.map((d) => `<td class="d ${dayClass(d)}">${getValue(d)}</td>`).join('');
        return `<tr class="tot ${cls}"><td colspan="6" class="lbl">${label}</td>${fCells}</tr>`;
      };

      const rowCounting = renderFooterRow('Jornales que cuentan (personal)', (d) => {
        const val = site.dailyJournalsCounting.get(d.dateStr);
        return val ? formatColombianNumber(val, 2) : '';
      });

      const rowMachine = renderFooterRow(
        'Jornales de maquinaria (no cuentan)',
        (d) => {
          const val = site.dailyJournalsMachine.get(d.dateStr);
          return val ? formatColombianNumber(val, 2) : '';
        },
        'mq'
      );

      const rowLimit = renderFooterRow(
        `L\u00edmite diario (${formatColombianNumber(site.dailyCapacityLimit, 2)} jr)`,
        (d) => {
          if (d.dateStr >= firstPlanned && plannedWorkingDays.some((w) => w.dateStr === d.dateStr)) {
            return formatColombianNumber(site.dailyCapacityLimit, 2);
          }
          return '';
        },
        'lim'
      );

      const rowPct = renderFooterRow(
        'Uso del l\u00edmite',
        (d) => {
          if (d.dateStr >= firstPlanned && plannedWorkingDays.some((w) => w.dateStr === d.dateStr)) {
            const val = site.dailyJournalsCounting.get(d.dateStr) || 0;
            if (val > 0 && site.dailyCapacityLimit > 0) {
              return `${Math.round((100 * val) / site.dailyCapacityLimit)}%`;
            }
          }
          return '';
        },
        'pct'
      );

      footRows = rowCounting + rowMachine + rowLimit + rowPct;
    }

    // KPIs Block (Full version only)
    let kpisHtml = '';
    if (full) {
      kpisHtml = `
<div class="kpis">
  <div><b>${plannedWorkingDaysCount}</b><span>d\u00edas h\u00e1biles programados</span></div>
  <div><b>${formatColombianNumber(site.dailyCapacityLimit, 2)}</b><span>l\u00edmite jornales / d\u00eda</span></div>
  <div><b>${formatColombianNumber(totalCountingJournals, 1)}</b><span>jornales programados (personal)</span></div>
  <div><b>${capacityUsagePct}%</b><span>uso de capacidad del mes</span></div>
  <div><b>${formatColombianNumber(carryTotalJr, 1)}</b><span>jornales que pasan a ${nextMonthName}</span></div>
</div>`;
    }

    // Carryover Section (B6)
    let carryHtml = '';
    if (site.carryoverStatus === 'NO_DATA') {
      carryHtml = `<h3>Actividades reprogramadas</h3><p class="note">Sin informaci\u00f3n de reprogramaci\u00f3n.</p>`;
    } else if (site.carryoverStatus === 'NONE' || site.carryoverItems.length === 0) {
      carryHtml = `<h3>Actividades reprogramadas</h3><p class="note">Ninguna.</p>`;
    } else {
      const cRows = site.carryoverItems
        .map((c) => {
          const descCol = `<td class="desc">${escapeHtml(shortenDescription(c.description))}</td>`;
          if (full) {
            return (
              `<tr>` +
                `<td class="k">${c.activity_key}</td>` +
                descCol +
                `<td class="u">${escapeHtml(c.unit)}</td>` +
                `<td class="n">${formatColombianNumber(c.qty)}</td>` +
                `<td class="n">${formatColombianNumber(c.jr, 2)}</td>` +
              `</tr>`
            );
          }
          return `<tr><td class="k">${c.activity_key}</td>${descCol}</tr>`;
        })
        .join('');

      const carryTitle = full
        ? `Pendiente por capacidad \u2014 pasa a ${nextMonthName} (se programa primero)`
        : `Actividades reprogramadas para ${nextMonthName} ${data.year}`;

      const carryThead = full
        ? `<thead><tr><th>\u00cdtem</th><th>Actividad</th><th>Unidad</th><th>Cantidad</th><th>Jornales</th></tr></thead>`
        : `<thead><tr><th>\u00cdtem</th><th>Actividad</th></tr></thead>`;

      carryHtml = `<h3>${carryTitle}</h3><table class="carry">${carryThead}<tbody>${cRows}</tbody></table>`;
    }

    const versionTitle = full ? 'VERSI\u00d3N COMPLETA \u2014 USO INTERNO' : 'VERSI\u00d3N PARA ENTIDAD / INTERVENTOR\u00cdA';

    // B5: Cálculo dinámico de leyenda para días sin programación
    let greyLegend = '';
    if (site.firstPlannedDateStr) {
      const firstPlannedDt = new Date(site.firstPlannedDateStr + 'T00:00:00Z');
      const firstPlannedDayNum = firstPlannedDt.getUTCDate();

      const workingDaysBefore: number[] = [];
      for (let d = 1; d < firstPlannedDayNum; d++) {
        const dStr = `${data.year}-${String(data.month).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
        const dt = new Date(Date.UTC(data.year, data.month - 1, d));
        const dow = dt.getUTCDay();
        if (dow >= 1 && dow <= 6 && !holidaySet.has(dStr)) {
          workingDaysBefore.push(d);
        }
      }

      if (workingDaysBefore.length > 0) {
        const d1 = Math.min(...workingDaysBefore);
        const d2 = Math.max(...workingDaysBefore);
        if (d1 === d2) {
          greyLegend = `Gris claro: el ${d1} de ${monthShort}, d\u00eda sin programaci\u00f3n en Mantenix. `;
        } else {
          greyLegend = `Gris claro: del ${d1} al ${d2} de ${monthShort}, d\u00edas sin programaci\u00f3n en Mantenix. `;
        }
      }
    }

    let legendText = full
      ? 'Celda sombreada: d\u00eda programado. N\u00famero superior: cantidad del d\u00eda; n\u00famero inferior: jornales. '
      : 'Celda marcada: d\u00eda en que se ejecuta la actividad. ';

    legendText += `Gris: domingos y festivos (${holidayText}). `;
    if (greyLegend) {
      legendText += greyLegend;
    }
    legendText += 'MAQ: actividad con maquinaria.';
    if (full) {
      legendText += ' k = miles (17,2k = 17.200). Cant. programada = suma de lo programado en el mes.';
    }

    const reviewerTitle = full ? 'Supervisor de campo' : 'Interventor\u00eda';
    const approverTitle = full ? 'Gerencia' : 'Entidad contratante';

    const pageBreakStyle = sIdx < data.sites.length - 1 ? 'page-break-after: always;' : '';

    siteBlocks.push(`
<div class="site-section" style="${pageBreakStyle}">
  <div class="top">
    <div>
      <h1>CRONOGRAMA DE MANTENIMIENTO \u2014 ${data.monthName} ${data.year}</h1>
      <div class="sub">${escapeHtml(site.siteName)}</div>
    </div>
    <div class="ver">${versionTitle}</div>
  </div>

  <div class="meta">
    <div><span>Contrato:</span> ${escapeHtml(data.contractNumber)}</div>
    <div><span>Entidad:</span> ${escapeHtml(data.entityName)}</div>
    <div><span>Base de cantidades:</span> ${escapeHtml(data.poaVersionLabel)}</div>
    <div><span>Periodo:</span> 1 al ${data.daysInMonth} de ${monthShort} de ${data.year}</div>
    <div><span>D\u00edas h\u00e1biles:</span> lunes a s\u00e1bado; ${holidayText}</div>
    <div><span>Fuente:</span> planes semanales publicados en Mantenix</div>
    <div><span>Generado:</span> ${todayStr}</div>
    <div><span>Actividades:</span> ${site.activities.length}</div>
  </div>

  ${kpisHtml}

  <table class="g">
    <thead>
      <tr>
        <th class="k" rowspan="2">\u00cdtem</th>
        <th class="desc" rowspan="2">Actividad</th>
        ${full ? '<th class="u" rowspan="2">Unidad</th>' : ''}
        <th class="v" rowspan="2">Visitas / mes</th>
        ${full ? '<th class="n" rowspan="2">Cant. programada</th><th class="n" rowspan="2">Jornales mes</th>' : ''}
        ${head1}
      </tr>
      <tr>
        ${head2}
      </tr>
    </thead>
    <tbody>
      ${bodyRows.join('')}
      ${footRows}
    </tbody>
  </table>

  <p class="note">${legendText}</p>

  <div class="bottom">
    <div class="cw">${carryHtml}</div>
    <div class="firmas">
      <div>Elabor\u00f3<br><b>Tom\u00e1s Herrera</b><br><span>Director de Operaciones</span></div>
      <div>Revis\u00f3<br><b>&nbsp;</b><br><span>${reviewerTitle}</span></div>
      <div>Aprob\u00f3<br><b>&nbsp;</b><br><span>${approverTitle}</span></div>
    </div>
  </div>
</div>`);
  }

  return `<!doctype html>
<html lang="es">
<head>
<meta charset="utf-8">
<style>
${getReportFontFaceStyles()}
@page { size: 355.6mm 215.9mm; margin: 9mm 8mm 11mm 8mm; }
* { box-sizing: border-box; }
body { font-family: 'IBM Plex Sans', -apple-system, BlinkMacSystemFont, sans-serif; color: #1c2430; font-size: 7pt; margin: 0; }
.site-section { width: 100%; }
.top { display: flex; justify-content: space-between; align-items: flex-end; border-bottom: 2px solid #1f3a5f; padding-bottom: 4px; margin-bottom: 5px; }
.top h1 { font-size: 13pt; margin: 0; color: #1f3a5f; letter-spacing: .3px; }
.top .sub { font-size: 8pt; color: #4a5566; margin-top: 2px; }
.top .ver { font-size: 7.5pt; font-weight: 700; color: ${full ? '#8a3b12' : '#1f3a5f'}; text-align: right; }
.meta { display: grid; grid-template-columns: repeat(4, 1fr); gap: 2px 14px; font-size: 7.2pt; margin-bottom: 5px; }
.meta span { color: #6b7686; }
.kpis { display: flex; gap: 6px; margin: 4px 0 6px; }
.kpis div { flex: 1; border: 1px solid #d5dbe3; border-radius: 3px; padding: 3px 6px; }
.kpis b { display: block; font-size: 11pt; color: #1f3a5f; font-family: 'IBM Plex Mono', monospace; }
.kpis span { font-size: 6.5pt; color: #6b7686; }
table { border-collapse: collapse; width: 100%; table-layout: fixed; }
table.g th, table.g td { border: 0.4px solid #c4ccd6; padding: 1px 2px; vertical-align: middle; }
table.g thead th { background: #1f3a5f; color: #fff; font-weight: 600; font-size: 6.3pt; }
table.g thead tr:nth-child(2) th { background: #2d4f7c; font-weight: 400; }
thead { display: table-header-group; }
tr { page-break-inside: avoid; }
.k { width: 9mm; text-align: center; font-weight: 600; font-family: 'IBM Plex Mono', monospace; }
.desc { width: ${full ? '86' : '128'}mm; font-size: 6.3pt; line-height: 1.15; }
.u { width: 15mm; text-align: center; font-size: 6pt; }
.v { width: 9mm; text-align: center; font-family: 'IBM Plex Mono', monospace; }
.n { width: ${full ? '13' : '15'}mm; text-align: right; font-variant-numeric: tabular-nums; font-family: 'IBM Plex Mono', monospace; }
th.d, td.d { text-align: center; font-size: 5.6pt; font-variant-numeric: tabular-nums; padding: 1px 0; font-family: 'IBM Plex Mono', monospace; }
td.on { background: #dbe7f5; }
td.on .mk { display: block; height: 7px; margin: 1px 2px; background: #2d4f7c; border-radius: 1px; }
td.on .q { display: block; font-weight: 600; color: #1f3a5f; }
td.on .j { display: block; color: #8a3b12; font-size: 5.2pt; }
.dom, .fest { background: #e3e5e8 !important; color: #8a929c; }
thead .dom, thead .fest { background: #5b6676 !important; color: #fff; }
.sinp { background: #eef0f2 !important; }
tr.cap td { background: #eef2f7; font-weight: 700; color: #1f3a5f; font-size: 6.6pt; padding: 2px 4px; }
.tag { font-size: 5pt; background: #8a3b12; color: #fff; padding: 0 2px; border-radius: 2px; }
tr.tot td { background: #f7f8fa; font-weight: 600; }
tr.tot td.lbl { text-align: right; padding-right: 4px; font-size: 6.4pt; }
tr.mq td { color: #6b7686; font-weight: 400; }
tr.lim td { color: #8a3b12; }
tr.pct td { color: #1f3a5f; }
h3 { font-size: 8pt; color: #1f3a5f; margin: 8px 0 3px; }
table.carry { width: auto; }
table.carry th, table.carry td { border: 0.4px solid #c4ccd6; padding: 1px 4px; font-size: 6.5pt; }
table.carry th { background: #eef2f7; }
table.carry .desc { width: 120mm; }
.note { font-size: 6.5pt; color: #4a5566; margin: 3px 0; }
.bottom { display: flex; gap: 10mm; align-items: flex-end; page-break-inside: avoid; }
.bottom > .cw { flex: 0 0 auto; }
.firmas { display: flex; gap: 10mm; flex: 1; padding-top: 12mm; }
.firmas div { flex: 1; border-top: 0.6px solid #1c2430; padding-top: 2px; font-size: 7pt; }
.firmas span { color: #6b7686; }
</style>
</head>
<body>
${siteBlocks.join('\n')}
</body>
</html>`;
}
