
export const generateActaReportHtml = (acta: any, tableData: any[]) => {
    const currencyFormatter = new Intl.NumberFormat('es-CO', { style: 'currency', currency: 'COP', maximumFractionDigits: 0 });
    const periodYear = new Date(new Date(acta.date).getFullYear(), new Date(acta.date).getMonth() - 1, 1).getFullYear();
    const periodMonth = new Date(new Date(acta.date).getFullYear(), new Date(acta.date).getMonth() - 1, 1).toLocaleDateString('es-CO', { month: 'long' });

    // Calculate totals
    const totals = {
        budgetTotal: tableData.reduce((s, r) => s + r.budgetTotal, 0),
        previousValue: tableData.reduce((s, r) => s + r.previousValue, 0),
        currentValue: tableData.reduce((s, r) => s + r.currentValue, 0),
        accumValue: tableData.reduce((s, r) => s + r.accumValue, 0),
        balanceValue: tableData.reduce((s, r) => s + r.balanceValue, 0)
    };

    return `
    <div class="report-wrapper p-8 bg-white text-slate-900">
        <div class="border-2 border-slate-900">
            <!-- Title -->
            <div class="text-center font-black text-xl py-2 border-b-2 border-slate-900 bg-white uppercase">
                ${acta.name} - ${new Date(acta.date).getFullYear()}
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
                        <div class="text-[9px] text-slate-500 uppercase">PERIODO DE PAGO</div>
                        <div class="text-xl font-black text-slate-900">${new Date(acta.date).getFullYear()}</div>
                    </div>
                    <div class="h-1/2 bg-white flex flex-col items-center justify-center p-2 text-center font-medium text-slate-900">
                        <div class="text-[8px] text-slate-500 uppercase mb-1">MES DE EJECUCIÓN</div>
                        <div class="text-lg uppercase font-black">${periodMonth}</div>
                    </div>
                </div>
            </div>
        </div>

        <!-- Table -->
        <div class="border border-slate-900 mt-2">
            <table class="w-full text-[9px] border-collapse bg-white">
                <thead class="text-center font-bold text-slate-900 uppercase">
                    <tr class="bg-gray-200 border-b border-slate-900">
                        <th colspan="2" class="py-1 border-r border-slate-900">CONTRATO</th>
                        <th colspan="4" class="py-1 border-r border-slate-900">CANTIDADES DE OBRA</th>
                        <th colspan="2" class="py-1 border-r border-slate-900">ACTAS ANTERIORES</th>
                        <th colspan="3" class="py-1 border-r border-slate-900 bg-blue-50">${acta.name} - ${new Date(acta.date).getFullYear()}</th>
                        <th colspan="2" class="py-1 border-r border-slate-900">ACUMULADO</th>
                        <th colspan="2" class="py-1">SALDO</th>
                    </tr>
                    <tr class="bg-gray-100 border-b border-slate-900">
                        <th class="w-[30px] border-r border-slate-400 py-1">IT</th>
                        <th class="text-left px-2 border-r border-slate-900 py-1">DESCRIPCION</th>
                        
                        <th class="w-[30px] border-r border-slate-400 bg-white py-1">UNID</th>
                        <th class="w-[60px] border-r border-slate-400 bg-white py-1">CANT.</th>
                        <th class="w-[70px] border-r border-slate-400 bg-white py-1">V/UNIT</th>
                        <th class="w-[80px] border-r border-slate-900 bg-white py-1">V/TOTAL</th>

                        <th class="w-[60px] border-r border-slate-400 py-1">CANT.</th>
                        <th class="w-[80px] border-r border-slate-900 py-1">V/TOTAL</th>

                        <th class="w-[60px] border-r border-slate-400 bg-blue-100 py-1">CANT.</th>
                        <th class="w-[80px] border-r border-slate-400 bg-blue-100 py-1">V/TOTAL</th>
                        <th class="w-[30px] border-r border-slate-900 bg-blue-100 py-1">%</th>

                        <th class="w-[60px] border-r border-slate-400 py-1">CANT.</th>
                        <th class="w-[80px] border-r border-slate-900 py-1">V/TOTAL</th>

                        <th class="w-[60px] border-r border-slate-400 bg-red-50 py-1">CANT.</th>
                        <th class="w-[80px] bg-red-50 py-1">V/TOTAL</th>
                    </tr>
                </thead>
                <tbody class="divide-y divide-slate-300">
                    ${tableData.map((row, idx) => `
                        <tr class="h-6 page-break-inside-avoid">
                            <td class="text-center font-bold bg-gray-50 border-r border-slate-400 py-1">${idx + 1}</td>
                            <td class="px-1 border-r border-slate-900">
                                <span class="font-bold text-slate-800 uppercase block truncate max-w-[200px]">${row.name}</span>
                                <span class="block text-[7px] text-slate-500">${row.groupName}</span>
                            </td>

                            <td class="text-center border-r border-slate-400 py-1">${row.values.unit}</td>
                            <td class="text-right px-1 border-r border-slate-400 py-1">${row.budgetQty.toLocaleString('es-CO')}</td>
                            <td class="text-right px-1 border-r border-slate-400 py-1">${currencyFormatter.format(row.unitPrice)}</td>
                            <td class="text-right px-1 border-r border-slate-900 font-bold py-1">${currencyFormatter.format(row.budgetTotal)}</td>

                            <td class="text-right px-1 border-r border-slate-400 py-1 text-slate-600">${row.previousQty > 0 ? row.previousQty.toLocaleString('es-CO') : '-'}</td>
                            <td class="text-right px-1 border-r border-slate-900 py-1 text-slate-600">${row.previousValue > 0 ? currencyFormatter.format(row.previousValue) : '-'}</td>

                            <td class="text-right px-1 border-r border-slate-400 bg-blue-50 font-bold text-blue-900 py-1">${row.currentQty > 0 ? row.currentQty.toLocaleString('es-CO') : '-'}</td>
                            <td class="text-right px-1 border-r border-slate-400 bg-blue-50 font-bold text-blue-900 py-1">${row.currentValue > 0 ? currencyFormatter.format(row.currentValue) : '-'}</td>
                            <td class="text-center border-r border-slate-900 bg-blue-50 text-blue-900 py-1">${row.currentPct > 0 ? row.currentPct.toFixed(1) : ''}%</td>

                            <td class="text-right px-1 border-r border-slate-400 font-bold py-1 bg-gray-50">${row.accumQty.toLocaleString('es-CO')}</td>
                            <td class="text-right px-1 border-r border-slate-900 font-bold py-1 bg-gray-50">${currencyFormatter.format(row.accumValue)}</td>

                            <td class="text-right px-1 border-r border-slate-400 font-bold py-1 ${row.balanceQty < 0 ? 'text-red-600' : 'text-slate-500'}">${row.balanceQty.toLocaleString('es-CO')}</td>
                            <td class="text-right px-1 font-bold py-1 ${row.balanceValue < 0 ? 'text-red-600' : 'text-slate-500'}">${currencyFormatter.format(row.balanceValue)}</td>
                        </tr>
                    `).join('')}
                </tbody>
                <tfoot class="bg-slate-200 border-t-2 border-slate-900 font-black text-slate-900 text-[9px]">
                    <!-- 1. COSTOS DIRECTOS -->
                    <tr>
                        <td colspan="5" class="px-2 py-1 text-right border-r border-slate-900 bg-white">TOTAL COSTOS DIRECTOS:</td>
                        <td class="px-1 py-1 text-right border-r border-slate-900 bg-white">${currencyFormatter.format(totals.budgetTotal)}</td>
                        <td class="border-r border-slate-400 bg-white"></td>
                        <td class="px-1 py-1 text-right border-r border-slate-900 bg-white">${currencyFormatter.format(totals.previousValue)}</td>
                        <td class="border-r border-slate-400 bg-white"></td>
                        <td class="px-1 py-1 text-right border-r border-slate-400 bg-blue-50 text-blue-900">${currencyFormatter.format(totals.currentValue)}</td>
                        <td class="border-r border-slate-900 bg-blue-50"></td>
                        <td class="border-r border-slate-400 bg-white"></td>
                        <td class="px-1 py-1 text-right border-r border-slate-900 bg-white">${currencyFormatter.format(totals.accumValue)}</td>
                        <td class="border-r border-slate-400 bg-white"></td>
                        <td class="px-1 py-1 text-right bg-white">${currencyFormatter.format(totals.balanceValue)}</td>
                    </tr>
                    
                    <!-- 2. ADMINISTRACION 20% -->
                    <tr>
                        <td colspan="5" class="px-2 py-1 text-right border-r border-slate-900 bg-white">ADMINISTRACION 20%:</td>
                        <td class="border-r border-slate-900 bg-white"></td>
                        <td class="border-r border-slate-400 bg-white"></td>
                        <td class="border-r border-slate-900 bg-white"></td>
                        <td class="border-r border-slate-400 bg-white"></td>
                        <td class="px-1 py-1 text-right border-r border-slate-400 bg-white text-slate-900">${currencyFormatter.format(totals.currentValue * 0.20)}</td>
                        <td class="border-r border-slate-900 bg-white"></td>
                        <td colspan="4" class="bg-white"></td>
                    </tr>

                    <!-- 3. IMPREVISTOS 5% -->
                    <tr>
                        <td colspan="5" class="px-2 py-1 text-right border-r border-slate-900 bg-white">IMPREVISTOS 5%:</td>
                        <td class="border-r border-slate-900 bg-white"></td>
                        <td class="border-r border-slate-400 bg-white"></td>
                        <td class="border-r border-slate-900 bg-white"></td>
                        <td class="border-r border-slate-400 bg-white"></td>
                        <td class="px-1 py-1 text-right border-r border-slate-400 bg-white text-slate-900">${currencyFormatter.format(totals.currentValue * 0.05)}</td>
                        <td class="border-r border-slate-900 bg-white"></td>
                        <td colspan="4" class="bg-white"></td>
                    </tr>

                    <!-- 4. UTILIDAD 5% -->
                    <tr>
                        <td colspan="5" class="px-2 py-1 text-right border-r border-slate-900 bg-white">UTILIDAD 5%:</td>
                        <td class="border-r border-slate-900 bg-white"></td>
                        <td class="border-r border-slate-400 bg-white"></td>
                        <td class="border-r border-slate-900 bg-white"></td>
                        <td class="border-r border-slate-400 bg-white"></td>
                        <td class="px-1 py-1 text-right border-r border-slate-400 bg-white text-slate-900">${currencyFormatter.format(totals.currentValue * 0.05)}</td>
                        <td class="border-r border-slate-900 bg-white"></td>
                        <td colspan="4" class="bg-white"></td>
                    </tr>

                    <!-- 5. TOTAL A PAGAR -->
                    <tr class="border-t-2 border-slate-900">
                        <td colspan="5" class="px-2 py-1 text-right border-r border-slate-900 bg-white font-black text-[10px]">TOTAL A PAGAR ${periodYear}:</td>
                        <td class="border-r border-slate-900 bg-white"></td>
                        <td class="border-r border-slate-400 bg-white"></td>
                        <td class="border-r border-slate-900 bg-white"></td>
                        <td class="border-r border-slate-400 bg-white"></td>
                        <td class="px-1 py-1 text-right border-r border-slate-400 bg-slate-800 text-white font-black text-[10px]">${currencyFormatter.format(totals.currentValue * 1.30)}</td>
                        <td class="border-r border-slate-900 bg-slate-800"></td>
                        <td colspan="4" class="bg-white"></td>
                    </tr>
                </tfoot>
            </table>
        </div>
        
        <!-- Signatures (Placeholder) -->
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
