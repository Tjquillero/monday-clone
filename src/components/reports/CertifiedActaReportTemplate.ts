import { CertifiedActa, CertifiedActaTotals } from '@/types/monday';

// Plantilla del PDF del Acta certificada (Incremento 5, Commit 6).
//
// SIN cálculos ni reglas de negocio: todos los valores (líneas, subtotal,
// AIU, total a pagar) llegan ya resueltos — items desde acta_items
// (snapshots congelados al emitir) y totales desde compute_acta_totals().
// Esta función solo formatea y dispone.
//
// SIN columnas de histórico/acumulado a propósito — no es un detalle de
// diseño, es conceptual: el acumulado y el saldo pertenecen al POA
// vigente (un documento del contrato), no al acta emitida (un documento
// histórico e inmutable). Si el PDF reconstruyera "cuánto llevaba
// acumulado el contrato" a partir del estado ACTUAL del POA, un acta
// impresa hoy y otra impresa dentro de un año mostrarían números
// distintos para el mismo documento ya emitido — dejaría de ser una
// representación fiel de lo que se emitió. Este PDF representa
// exclusivamente el contenido congelado del acta: qué se facturó, a qué
// precio, y el AIU de ESE acta.

export const generateCertifiedActaReportHtml = (
  acta: CertifiedActa,
  totals: CertifiedActaTotals
) => {
  const currencyFormatter = new Intl.NumberFormat('es-CO', { style: 'currency', currency: 'COP', maximumFractionDigits: 0 });
  const qtyFormatter = new Intl.NumberFormat('es-CO', { maximumFractionDigits: 2 });

  const issuedDate = acta.issued_at ? new Date(acta.issued_at) : null;
  const year = issuedDate ? issuedDate.getFullYear() : '';
  const month = issuedDate ? issuedDate.toLocaleDateString('es-CO', { month: 'long' }) : '';

  return `
  <div class="report-wrapper p-8 bg-white text-slate-900">
      <div class="border-2 border-slate-900">
          <!-- Title -->
          <div class="text-center font-black text-xl py-2 border-b-2 border-slate-900 bg-white uppercase">
              ACTA ${acta.numero} ${year ? '- ' + year : ''}
          </div>

          <!-- Header Grid -->
          <div class="flex divide-x-2 divide-slate-900 h-[180px]">
              <!-- Clients -->
              <div class="w-[350px] flex flex-col text-[10px] font-bold">
                  <div class="flex-1 p-2 border-b border-slate-900 flex flex-col justify-center">
                      <div>CONTRATANTE: PUERTA DE ORO EMPRESA DE DESARROLLO CARIBE S.A.S</div>
                      <div>NIT.: 900.249.143-1</div>
                      <div class="mt-1">N° CONTRATO : 038 - 2023</div>
                  </div>
                  <div class="flex-1 p-2 flex flex-col justify-center bg-white">
                      <div>CONTRATISTA: CONSORCIO CONSERVACIÓN COSTERA</div>
                      <div>NIT.: 901.727.371-7</div>
                      <div class="mt-1 leading-tight text-[8px]">OBJETO: CONSERVACIÓN INTEGRAL Y REVITALIZACIÓN DE LOS PROYECTOS DE INFRAESTRUCTURA TURÍSTICA DEL DEPARTAMENTO DEL ATLÁNTICO, ASÍ COMO SUS ACTIVIDADES RELACIONADAS Y/O CONEXAS</div>
                  </div>
              </div>

              <!-- Logo -->
              <div class="flex-1 flex flex-col items-center justify-center p-4 bg-white">
                  <div style="width: 250px; height: 100px; display: flex; align-items: center; justify-content: center;">
                       <img src="http://localhost:3000/logo-consorcio-hd.png" alt="Logo" style="max-width: 100%; max-height: 100%; object-fit: contain;" />
                  </div>
              </div>

              <!-- Date -->
              <div class="w-[180px] flex flex-col">
                  <div class="h-1/2 border-b-2 border-slate-900 flex flex-col items-center justify-center font-bold bg-slate-100">
                      <div class="text-[9px] text-slate-500 uppercase">ACTA N°</div>
                      <div class="text-xl font-black text-slate-900">${acta.numero}</div>
                  </div>
                  <div class="h-1/2 bg-white flex flex-col items-center justify-center p-2 text-center font-medium text-slate-900">
                      <div class="text-[8px] text-slate-500 uppercase mb-1">FECHA DE EMISIÓN</div>
                      <div class="text-lg uppercase font-black">${month} ${year}</div>
                  </div>
              </div>
          </div>
      </div>

      <!-- Table -->
      <div class="border border-slate-900 mt-2">
          <table class="w-full text-[9px] border-collapse bg-white">
              <thead class="text-center font-bold text-slate-900 uppercase">
                  <tr class="bg-gray-200 border-b border-slate-900">
                      <th class="w-[30px] border-r border-slate-400 py-1">IT</th>
                      <th class="text-left px-2 border-r border-slate-900 py-1">DESCRIPCIÓN</th>
                      <th class="w-[50px] border-r border-slate-400 py-1">UNID</th>
                      <th class="w-[80px] border-r border-slate-400 py-1">CANTIDAD FACTURADA</th>
                      <th class="w-[90px] border-r border-slate-400 py-1">V/UNITARIO</th>
                      <th class="w-[100px] py-1">V/TOTAL</th>
                  </tr>
              </thead>
              <tbody class="divide-y divide-slate-300">
                  ${acta.items.map((item, idx) => `
                      <tr class="h-6 page-break-inside-avoid">
                          <td class="text-center font-bold bg-gray-50 border-r border-slate-400 py-1">${idx + 1}</td>
                          <td class="px-1 border-r border-slate-900">
                              <span class="font-bold text-slate-800 uppercase block">${item.descripcion_snapshot}</span>
                          </td>
                          <td class="text-center border-r border-slate-400 py-1">${item.unidad_snapshot}</td>
                          <td class="text-right px-1 border-r border-slate-400 py-1">${qtyFormatter.format(item.cantidad_facturada)}</td>
                          <td class="text-right px-1 border-r border-slate-400 py-1">${currencyFormatter.format(item.precio_unitario_snapshot)}</td>
                          <td class="text-right px-1 font-bold py-1">${currencyFormatter.format(item.valor_total)}</td>
                      </tr>
                  `).join('')}
              </tbody>
              <tfoot class="bg-slate-200 border-t-2 border-slate-900 font-black text-slate-900 text-[9px]">
                  <tr>
                      <td colspan="5" class="px-2 py-1 text-right border-r border-slate-900 bg-white">TOTAL COSTOS DIRECTOS:</td>
                      <td class="px-1 py-1 text-right bg-white">${currencyFormatter.format(totals.subtotal)}</td>
                  </tr>
                  <tr>
                      <td colspan="5" class="px-2 py-1 text-right border-r border-slate-900 bg-white">ADMINISTRACIÓN 20%:</td>
                      <td class="px-1 py-1 text-right bg-white">${currencyFormatter.format(totals.administracion)}</td>
                  </tr>
                  <tr>
                      <td colspan="5" class="px-2 py-1 text-right border-r border-slate-900 bg-white">IMPREVISTOS 5%:</td>
                      <td class="px-1 py-1 text-right bg-white">${currencyFormatter.format(totals.imprevistos)}</td>
                  </tr>
                  <tr>
                      <td colspan="5" class="px-2 py-1 text-right border-r border-slate-900 bg-white">UTILIDAD 5%:</td>
                      <td class="px-1 py-1 text-right bg-white">${currencyFormatter.format(totals.utilidad)}</td>
                  </tr>
                  <tr class="border-t-2 border-slate-900">
                      <td colspan="5" class="px-2 py-1 text-right border-r border-slate-900 bg-white font-black text-[10px]">TOTAL A PAGAR ${year}:</td>
                      <td class="px-1 py-1 text-right bg-slate-800 text-white font-black text-[10px]">${currencyFormatter.format(totals.total_pagar)}</td>
                  </tr>
              </tfoot>
          </table>
      </div>

      <!-- Signatures -->
      <div class="mt-12 grid grid-cols-2 gap-20 page-break-inside-avoid">
          <div class="border-t border-slate-900 pt-2">
              <div class="font-bold text-xs uppercase">CONTRATANTE</div>
              <div class="text-[10px] mt-8">Firma: __________________________</div>
              <div class="text-[10px] mt-1">Nombre: _________________________</div>
          </div>
          <div class="border-t border-slate-900 pt-2">
              <div class="font-bold text-xs uppercase">CONTRATISTA</div>
              <div class="text-[10px] mt-8">Firma: __________________________</div>
              <div class="text-[10px] mt-1">Nombre: _________________________</div>
          </div>
      </div>
  </div>
  `;
};
