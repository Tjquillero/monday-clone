import { Group, Column, Item } from '@/types/monday';

export function generateBoardReportHtml(boardName: string, groups: Group[], columns: Column[]) {
  const dateStr = new Date().toLocaleDateString('es-ES', { 
    weekday: 'long', 
    year: 'numeric', 
    month: 'long', 
    day: 'numeric' 
  });

  const getColValue = (item: Item, col: Column) => {
    const val = item.values[col.id];
    if (val === undefined || val === null) return '-';
    return val;
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'Done': return 'bg-emerald-500 text-white';
      case 'Working on it': return 'bg-amber-500 text-white';
      case 'Stuck': return 'bg-rose-500 text-white';
      case 'Not Started': return 'bg-gray-400 text-white';
      default: return 'bg-gray-200 text-gray-800';
    }
  };

  const getPriorityColor = (priority: string) => {
    switch (priority) {
      case 'High': return 'bg-purple-700 text-white';
      case 'Critical': return 'bg-gray-900 text-white';
      case 'Medium': return 'bg-blue-500 text-white';
      case 'Low': return 'bg-sky-400 text-white';
      default: return 'bg-gray-200 text-gray-800';
    }
  };

  const groupsHtml = groups.map(group => `
    <div class="mb-8 break-inside-avoid">
      <div class="flex items-center mb-4 border-b-2 pb-2" style="border-color: ${group.color}">
        <h3 class="text-xl font-bold" style="color: ${group.color}">${group.title}</h3>
        <span class="ml-4 text-xs font-bold text-slate-400 uppercase tracking-widest">${group.items.length} Tareas</span>
      </div>
      
      <table class="w-full text-left border-collapse">
        <thead>
          <tr class="text-[10px] uppercase text-slate-400 border-b border-slate-200">
            <th class="py-2 pl-2 font-black tracking-widest w-1/3">Tarea</th>
            ${columns.map(col => `<th class="py-2 px-2 font-black tracking-widest text-center">${col.title}</th>`).join('')}
          </tr>
        </thead>
        <tbody>
          ${group.items.map((item, idx) => `
            <tr class="border-b border-slate-50 ${idx % 2 === 0 ? 'bg-white' : 'bg-slate-50/50'} text-xs">
              <td class="py-3 pl-2 font-bold text-slate-700">
                ${item.name}
              </td>
              ${columns.map(col => {
                const val = getColValue(item, col);
                let cellContent = val;
                
                if (col.type === 'status') {
                   cellContent = `<span class="px-2 py-1 rounded text-[10px] font-bold uppercase ${getStatusColor(String(val))}">${val}</span>`;
                } else if (col.type === 'priority') {
                   cellContent = `<span class="px-2 py-1 rounded text-[10px] font-bold uppercase ${getPriorityColor(String(val))}">${val}</span>`;
                }

                return `<td class="py-3 px-2 text-center text-slate-600">${cellContent}</td>`;
              }).join('')}
            </tr>
            ${(item.subItems || []).map(sub => `
              <tr class="border-b border-slate-50 bg-slate-50 text-[10px]">
                 <td class="py-2 pl-6 font-medium text-slate-500 flex items-center">
                    <span class="mr-2">↳</span> ${sub.name}
                 </td>
                 ${columns.map(col => {
                    const val = getColValue(sub, col);
                    let cellContent = val;
                    if (col.type === 'status') {
                       cellContent = `<span class="px-1.5 py-0.5 rounded text-[8px] font-bold uppercase ${getStatusColor(String(val))}">${val}</span>`;
                    }
                    return `<td class="py-2 px-2 text-center text-slate-400">${col.type === 'status' || col.type === 'priority' ? cellContent : val}</td>`;
                 }).join('')}
              </tr>
            `).join('')}
          `).join('')}
        </tbody>
      </table>
    </div>
  `).join('');

  return `
    <div class="p-10 bg-white font-sans text-slate-800" style="width: 210mm; min-height: 297mm">
      <!-- Header -->
      <div class="flex justify-between items-start border-b-4 border-slate-800 pb-6 mb-8">
        <div>
          <h1 class="text-4xl font-black text-slate-900 tracking-tighter">MANTENIX</h1>
          <p class="text-sm font-bold text-emerald-600 mt-1 uppercase tracking-widest">Reporte de Situación de Proyecto</p>
        </div>
        <div class="text-right">
          <p class="text-xs font-bold text-slate-400">FECHA</p>
          <p class="text-sm font-black capitalize">${dateStr}</p>
          <p class="text-[10px] text-slate-300 mt-2 uppercase tracking-wide">${boardName}</p>
        </div>
      </div>

      <!-- Groups & Items -->
      ${groupsHtml}

      <!-- Footer -->
      <div class="mt-12 pt-6 border-t border-slate-100 text-center break-inside-avoid">
        <p className="text-[10px] text-slate-300 font-medium">
          Reporte generado automáticamente por Mantenix Platform.
        </p>
        <p className="text-[10px] text-slate-300 font-medium italic mt-1">
          &copy; ${new Date().getFullYear()} Mantenix.
        </p>
      </div>
    </div>
  `;
}
