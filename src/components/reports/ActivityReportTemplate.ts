import { Item, Column } from '@/types/monday';

export function generateReportHtml(item: Item, columns: Column[], evidence: any[]) {
  const status = item.values['status'] || 'N/A';
  const person = item.values['person'] || 'Desconocido';
  const date = item.values['date'] || 'N/A';
  const category = item.values['category'] || 'N/A';

  const evidenceHtml = evidence.length > 0 ? `
    <div class="mt-12">
      <h3 class="text-xs font-black text-emerald-700 uppercase tracking-widest mb-6 border-l-2 border-emerald-600 pl-3">Evidencia Fotográfica</h3>
      <div class="grid grid-cols-2 gap-6">
        ${evidence.map((ev, index) => `
          <div class="break-inside-avoid">
            <div class="aspect-video bg-slate-100 rounded-2xl overflow-hidden border border-slate-200 mb-2">
              <img src="${ev.url}" alt="Evidencia" class="w-full h-full object-cover" />
            </div>
            <p class="text-[10px] text-slate-400 font-bold italic">
              Registrado: ${new Date(ev.timestamp).toLocaleString()}
            </p>
          </div>
        `).join('')}
      </div>
    </div>
  ` : '';

  return `
    <div class="p-10 bg-white font-sans text-slate-800" style="width: 210mm; min-height: 297mm">
      <!-- Header -->
      <div class="flex justify-between items-start border-b-4 border-emerald-600 pb-6 mb-8">
        <div>
          <h1 class="text-4xl font-black text-emerald-800 tracking-tighter">MANTENIX</h1>
          <p class="text-sm font-bold text-emerald-600 mt-1 uppercase tracking-widest">Reporte de Actividad de Campo</p>
        </div>
        <div class="text-right">
          <p class="text-xs font-bold text-slate-400">FECHA DE EMISIÓN</p>
          <p class="text-sm font-black">${new Date().toLocaleDateString()}</p>
          <p class="text-[10px] text-slate-300 mt-2">ID REPORTE: ${String(item.id).slice(0, 12)}</p>
        </div>
      </div>

      <!-- Title -->
      <div class="mb-10">
        <h2 class="text-2xl font-black text-slate-900 leading-tight">${item.name}</h2>
      </div>

      <!-- Metadata Grid -->
      <div class="grid grid-cols-2 gap-4 mb-10">
        <div class="bg-slate-50 p-4 rounded-2xl border border-slate-100">
          <p class="text-[10px] font-black text-slate-400 uppercase mb-1">Estado Actual</p>
          <p class="text-sm font-bold">${status}</p>
        </div>
        <div class="bg-slate-50 p-4 rounded-2xl border border-slate-100">
          <p class="text-[10px] font-black text-slate-400 uppercase mb-1">Responsable</p>
          <p class="text-sm font-bold">${person}</p>
        </div>
        <div class="bg-slate-50 p-4 rounded-2xl border border-slate-100">
          <p class="text-[10px] font-black text-slate-400 uppercase mb-1">Fecha Programada</p>
          <p class="text-sm font-bold">${date}</p>
        </div>
        <div class="bg-slate-50 p-4 rounded-2xl border border-slate-100">
          <p class="text-[10px] font-black text-slate-400 uppercase mb-1">Categoría</p>
          <p class="text-sm font-bold">${category}</p>
        </div>
      </div>

      <!-- Description -->
      <div class="mb-12">
        <h3 class="text-xs font-black text-emerald-700 uppercase tracking-widest mb-3 border-l-2 border-emerald-600 pl-3">Descripción de la Actividad</h3>
        <p class="text-sm text-slate-600 leading-relaxed whitespace-pre-wrap">
          ${item.description || 'No se ha registrado una descripción detallada para esta actividad.'}
        </p>
      </div>

      <!-- Evidence Gallery -->
      ${evidenceHtml}

      <!-- Footer -->
      <div class="mt-auto pt-10 border-t border-slate-100 text-center">
        <p class="text-[10px] text-slate-300 font-medium">
          Este documento es un reporte automático generado por la plataforma Mantenix.
        </p>
        <p class="text-[10px] text-slate-300 font-medium italic mt-1">
          &copy; ${new Date().getFullYear()} Mantenix Project Management. Todos los derechos reservados.
        </p>
      </div>
    </div>
  `;
}
