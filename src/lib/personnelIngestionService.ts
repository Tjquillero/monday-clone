/**
 * Service: Ingestión de Personal Operativo y Adscripción por Sitio (v1)
 * Baseline: 2386465 + ADR-0007..ADR-0012 + Módulo 2 & 3 (CLOSED & CERTIFIED) + V6 Endurecido
 *
 * Implementación estricta del Contrato Técnico de Ingestión v1 (personnel_ingestion_contract_v1.md)
 * 1. Identidad Canónica (CC / PPT / PT sin cast destructivo ni alteración de identidad).
 * 2. Catálogo cerrado de resolución de sitio (group_id) sin fuzzy matching.
 * 3. Ingestión idempotente con separación explícita de registros creados vs existentes.
 * 4. Auditoría estructurada sin modificar F3.1 ni V6.
 */

import { SupabaseClient } from '@supabase/supabase-js';
import * as XLSX from 'xlsx';

export interface PersonnelExcelRow {
  num?: number;
  cedula: string;
  nombre: string;
  centroCosto?: string;
  siglas?: string;
  salario?: number;
  sitioExcel: string;
}

export interface PersonnelIngestionAuditReport {
  rowsRead: number;
  normalizedIdentities: number;
  sitesResolvedCount: number;
  unresolvedSitesCount: number;
  personnelCreatedNew: number;
  personnelExisting: number;
  assignmentsCreatedNew: number;
  assignmentsExisting: number;
  unresolvedSitesDetails: string[];
  errors: string[];
  dryRun: boolean;
}

/**
 * Normaliza canónicamente el identificador de documento/cédula.
 * Regla: "Normalizar formato != Alterar identidad"
 */
export function normalizeCedula(raw: string | number | undefined | null): string {
  if (raw === undefined || raw === null) return '';
  const str = String(raw).trim();
  if (!str) return '';

  // PPT (Permiso Protección Temporal)
  if (/^PPT-/i.test(str)) {
    const cleanNum = str.slice(4).replace(/\s+/g, '');
    return `PPT-${cleanNum}`;
  }

  // PT (Variante Permiso)
  if (/^PT-/i.test(str)) {
    const cleanNum = str.slice(3).replace(/\s+/g, '');
    return `PT-${cleanNum}`;
  }

  // Limpieza de espacios internos preservando la cadena original
  return str.replace(/\s+/g, '');
}

/**
 * Catálogo cerrado obligatorio de resolución de sitio (Excel Name -> Group Title).
 * Prohibido el uso de coincidencia difusa (fuzzy matching).
 */
export const EXCEL_SITE_TO_GROUP_TITLE: Record<string, string> = {
  'PLAZA PUERTO COLOMBIA': 'PLAZA PUERTO COLOMBIA',
  'PLAYA MANGLARES': 'MANGLARES',
  'MANGLARES': 'MANGLARES',
  'CENTRO GASTRONOMICO': 'MERCADO LA SAZÓN',
  'MERCADO LA SAZÓN': 'MERCADO LA SAZÓN',
  'PLAYA MIRAMAR': 'MIRAMAR SECTOR EL FARO',
  'MIRAMAR SECTOR EL FARO': 'MIRAMAR SECTOR EL FARO',
  'COUNTRY 1': 'PLAYA DEL COUNTRY',
  'PLAYA DEL COUNTRY': 'PLAYA DEL COUNTRY',
  'COUNTRY 2': 'PLAYA DE SABANILLA 2',
  'PLAYA DE SABANILLA 2': 'PLAYA DE SABANILLA 2',
  'SALINAS REY': 'SALINAS DEL REY',
  'SALINAS DEL REY': 'SALINAS DEL REY',
  'SENDERO SANTA VERONICA': 'SENDERO SANTA VERÓNICA',
  'SENDERO SANTA VERÓNICA': 'SENDERO SANTA VERÓNICA',
  'TRACTOR': 'PRESUPUESTO GENERAL',
  'RAN': 'PRESUPUESTO GENERAL',
  'VOLQUETA': 'PRESUPUESTO GENERAL',
  'SUPERVISOR': 'PRESUPUESTO GENERAL',
  'OFICIAL (ELECTRICO)': 'PRESUPUESTO GENERAL',
};

/**
 * Lee y parsea la hoja 'BASE DE DATA CCC' del libro Excel de personal.
 */
export function parsePersonnelExcel(fileBufferOrPath: Buffer | string): PersonnelExcelRow[] {
  const wb = typeof fileBufferOrPath === 'string'
    ? XLSX.readFile(fileBufferOrPath)
    : XLSX.read(fileBufferOrPath, { type: 'buffer' });

  const sheetName = wb.SheetNames.includes('BASE DE DATA CCC')
    ? 'BASE DE DATA CCC'
    : wb.SheetNames[0];

  const ws = wb.Sheets[sheetName];
  const rows: any[][] = XLSX.utils.sheet_to_json(ws, { header: 1 });

  let currentSite = '';
  const parsed: PersonnelExcelRow[] = [];

  rows.forEach((r, idx) => {
    if (idx < 2) return; // Omitir encabezados del título macro
    const colSite = r[0];
    const num = r[1];
    const cedulaRaw = r[2];
    const nombreRaw = r[3];
    const cc = r[4];
    const siglas = r[5];
    const salario = r[6];

    if (colSite && typeof colSite === 'string' && colSite.trim()) {
      currentSite = colSite.trim();
    }

    if (nombreRaw && typeof nombreRaw === 'string' && cedulaRaw && String(cedulaRaw).trim() !== 'CEDULA') {
      const cedulaNorm = normalizeCedula(cedulaRaw);
      if (cedulaNorm && String(nombreRaw).trim()) {
        parsed.push({
          num: typeof num === 'number' ? num : undefined,
          cedula: cedulaNorm,
          nombre: String(nombreRaw).trim(),
          centroCosto: cc ? String(cc).trim() : undefined,
          siglas: siglas ? String(siglas).trim() : undefined,
          salario: typeof salario === 'number' ? salario : undefined,
          sitioExcel: currentSite,
        });
      }
    }
  });

  return parsed;
}

export interface IngestionOptions {
  dryRun?: boolean;
}

/**
 * Ejecuta la ingestión e adscripción de personal operativo en Supabase.
 */
export async function executePersonnelIngestion(
  supabase: SupabaseClient,
  boardId: string,
  rows: PersonnelExcelRow[],
  options: IngestionOptions = {}
): Promise<PersonnelIngestionAuditReport> {
  const isDryRun = options.dryRun ?? false;

  const report: PersonnelIngestionAuditReport = {
    rowsRead: rows.length,
    normalizedIdentities: 0,
    sitesResolvedCount: 0,
    unresolvedSitesCount: 0,
    personnelCreatedNew: 0,
    personnelExisting: 0,
    assignmentsCreatedNew: 0,
    assignmentsExisting: 0,
    unresolvedSitesDetails: [],
    errors: [],
    dryRun: isDryRun,
  };

  // 1. Resolver los grupos (sitios) del tablero principal en la base de datos
  const { data: dbGroups, error: gErr } = await supabase
    .from('groups')
    .select('id, title')
    .eq('board_id', boardId);

  if (gErr) {
    report.errors.push(`Error al consultar grupos del tablero: ${gErr.message}`);
    return report;
  }

  const groupMapByTitle = new Map<string, string>();
  for (const g of dbGroups || []) {
    groupMapByTitle.set(g.title.toUpperCase().trim(), g.id);
  }

  // 2. Resolver o crear versión activa de personal en Módulo 2
  let versionId = '';
  if (!isDryRun) {
    const { data: activeVer } = await supabase
      .from('personnel_versions')
      .select('id')
      .eq('board_id', boardId)
      .eq('is_active', true)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (activeVer) {
      versionId = activeVer.id;
    } else {
      const { data: newVer, error: vErr } = await supabase
        .from('personnel_versions')
        .insert([{
          board_id: boardId,
          version_name: 'V1 - Ingestión Excel Operativa',
          is_active: true,
          effective_from: new Date().toISOString().split('T')[0],
        }])
        .select()
        .single();

      if (vErr) {
        report.errors.push(`Error al crear personnel_version: ${vErr.message}`);
        return report;
      }
      versionId = newVer.id;
    }
  }

  // 3. Procesar cada fila de operario
  for (const r of rows) {
    if (r.cedula) report.normalizedIdentities++;

    // Resolución estricta por diccionario cerrado
    const targetGroupTitle = EXCEL_SITE_TO_GROUP_TITLE[r.sitioExcel.toUpperCase().trim()];
    if (!targetGroupTitle) {
      report.unresolvedSitesCount++;
      report.unresolvedSitesDetails.push(`Sub-Centro Excel '${r.sitioExcel}' no registrado en el catálogo cerrado.`);
      continue;
    }

    const groupId = groupMapByTitle.get(targetGroupTitle.toUpperCase().trim());
    if (!groupId) {
      report.unresolvedSitesCount++;
      report.unresolvedSitesDetails.push(`Sitio '${targetGroupTitle}' no encontrado en grupos del tablero.`);
      continue;
    }

    report.sitesResolvedCount++;

    if (isDryRun) continue;

    // A. Buscar existencia previa por document_id (cédula canónica) o por nombre
    let existingPerson: { id: string; document_id?: string | null; name?: string | null } | null = null;
    if (r.cedula) {
      const { data: byDoc } = await supabase
        .from('personnel')
        .select('id, document_id, name')
        .eq('document_id', r.cedula)
        .maybeSingle();
      existingPerson = byDoc;
    }
    if (!existingPerson && r.nombre) {
      const { data: byName } = await supabase
        .from('personnel')
        .select('id, document_id, name')
        .ilike('name', r.nombre)
        .maybeSingle();
      existingPerson = byName;
    }

    let personId = '';

    if (existingPerson) {
      report.personnelExisting++;
      personId = existingPerson.id;

      // Actualizar document_id si estaba nulo o actualizar campos
      if (!existingPerson.document_id) {
        await supabase
          .from('personnel')
          .update({
            document_id: r.cedula,
            role: r.siglas || 'Operador',
            default_rate: r.salario || 1750905,
          })
          .eq('id', personId);
      }
    } else {
      // Crear nuevo registro en personnel
      const { data: newPerson, error: pInsErr } = await supabase
        .from('personnel')
        .insert([{
          document_id: r.cedula,
          name: r.nombre,
          role: r.siglas || 'Operador',
          default_rate: r.salario || 1750905,
        }])
        .select()
        .single();

      if (pInsErr) {
        report.errors.push(`Error al insertar personnel (${r.nombre} / ${r.cedula}): ${pInsErr.message}`);
        continue;
      }

      report.personnelCreatedNew++;
      personId = newPerson.id;
    }

    // B. Inserción/Verificación idempotente de asignación al sitio (personnel_site_assignments)
    const { data: existingAssign } = await supabase
      .from('personnel_site_assignments')
      .select('id')
      .eq('version_id', versionId)
      .eq('personnel_id', personId)
      .maybeSingle();

    if (existingAssign) {
      report.assignmentsExisting++;
    } else {
      const { error: aInsErr } = await supabase
        .from('personnel_site_assignments')
        .insert([{
          version_id: versionId,
          personnel_id: personId,
          role_in_site: r.siglas || 'Operador',
          zone: r.siglas?.includes('ZV') ? 'ZV' : r.siglas?.includes('ZD') ? 'ZD' : r.siglas?.includes('ZP') ? 'ZP' : 'GENERAL',
          dedication_percentage: 100,
        }]);

      if (aInsErr) {
        report.errors.push(`Error al crear asignación para ${r.nombre}: ${aInsErr.message}`);
      } else {
        report.assignmentsCreatedNew++;
      }
    }
  }

  return report;
}
