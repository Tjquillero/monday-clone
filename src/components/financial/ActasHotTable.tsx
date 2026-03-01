'use client';

import React, { useState, useRef, useCallback, useEffect } from 'react';

export interface ActasTableRow {
  id: string | number;
  groupId: string;
  code: string;
  name: string;
  groupName: string;
  values: { unit?: string };
  unitPrice: number;
  budgetQty: number;
  budgetTotal: number;
  previousQty: number;
  previousValue: number;
  currentQty: number;
  currentValue: number;
  currentPct: number;
  accumQty: number;
  accumValue: number;
  balanceQty: number;
  balanceValue: number;
}

interface ActasHotTableProps {
  tableData: ActasTableRow[];
  isReadOnly: boolean;
  onCellChange: (row: ActasTableRow, field: 'qty' | 'val' | 'pct' | 'prevQty' | 'prevVal' | 'unitPrice' | 'budgetTotal', value: number) => void;
  actaName: string;
  onDelete?: (row: ActasTableRow) => void;
}

// ── Formatters ─────────────────────────────────────────────────────────────────
const cop = new Intl.NumberFormat('es-CO', {
  style: 'currency', currency: 'COP',
  minimumFractionDigits: 0, maximumFractionDigits: 0,
});
const fmt  = (v: number) => (v === 0 ? '—' : cop.format(v));
const fmtN = (v: number) => (v === 0 ? '—' : v.toLocaleString('es-CO', { minimumFractionDigits: 2, maximumFractionDigits: 2 }));
const fmtP = (v: number) => (v === 0 ? '—' : `${v.toFixed(1)}%`);
const rowBg = (code: string) => {
  if (code?.startsWith('1')) return '#eff6ff';
  if (code?.startsWith('2')) return '#f0fdf4';
  if (code?.startsWith('3')) return '#fffbeb';
  return '#ffffff';
};

// ── Inline cell input ─────────────────────────────────────────────────────────
interface CellInputProps {
  value: number;
  align: 'right' | 'center';
  display: (v: number) => string;
  onCommit: (v: number) => void;
}
function CellInput({ value, align, display, onCommit }: CellInputProps) {
  const ref = useRef<HTMLInputElement>(null);
  const editing = useRef(false);

  // Keep display value in sync when parent changes and we're NOT editing
  useEffect(() => {
    if (!editing.current && ref.current) {
      ref.current.value = display(value);
    }
  }, [value, display]);

  const handleFocus = (e: React.FocusEvent<HTMLInputElement>) => {
    editing.current = true;
    // Switch to raw number for editing
    e.target.value = value === 0 ? '' : String(value);
    e.target.select();
    e.target.style.background = '#dbeafe';
    e.target.style.outline = '2px solid #3b82f6';
    e.target.style.color = '#1e40af';
  };

  const commit = (input: HTMLInputElement) => {
    // 1. Replace all thousands separators (dots) with empty strings if it's formatted as es-CO "1.000,50"
    // 2. Replace comma with dot for native JS float parsing
    let rawStr = input.value;
    
    // Check if the user typed something like "60.244,40" (es-CO standard)
    if (rawStr.includes(',') && rawStr.includes('.')) {
        // Assume dots are separators and comma is decimal
        rawStr = rawStr.replace(/\./g, '').replace(',', '.');
    } else if (rawStr.includes(',')) {
        // If there are only commas, assume user typed "60244,40"
        rawStr = rawStr.replace(',', '.');
    }
    
    // Now strip out anything that isn't a digit, minus, or dot
    const cleanStr = rawStr.replace(/[^\d.-]/g, '');
    const v = parseFloat(cleanStr) || 0;
    
    editing.current = false;
    input.value = display(v);
    input.style.background = '#eff6ff';
    input.style.outline = 'none';
    input.style.color = '#1d4ed8';

    // ONLY commit if the parsed numerical value actually changed!
    if (v !== value) {
        onCommit(v);
    }
  };

  return (
    <input
      ref={ref}
      type="text"
      inputMode="decimal"
      defaultValue={display(value)}
      onFocus={handleFocus}
      onBlur={e => commit(e.target)}
      onKeyDown={e => {
        if (e.key === 'Enter' || e.key === 'Tab') {
          e.preventDefault();
          commit(e.target as HTMLInputElement);
          (e.target as HTMLInputElement).blur();
        }
        if (e.key === 'Escape') {
          editing.current = false;
          (e.target as HTMLInputElement).value = display(value);
          (e.target as HTMLInputElement).blur();
        }
      }}
      style={{
        width: '100%',
        height: '28px',
        border: 'none',
        outline: 'none',
        padding: '0 5px',
        textAlign: align,
        fontSize: '11px',
        fontWeight: 700,
        color: '#1d4ed8',
        background: '#eff6ff',
        boxSizing: 'border-box',
        cursor: 'text',
      }}
    />
  );
}

// ── Column definitions ─────────────────────────────────────────────────────────
const COL_WIDTHS = {
  code: 42,
  name: 350,
  unit: 55,
  budgetQty: 78,
  unitPrice: 108,
  budgetTotal: 118,
  prevQty: 78,
  prevVal: 118,
  curQty: 80,
  curVal: 118,
  curPct: 52,
  accQty: 78,
  accVal: 118,
  actions: 36,
};

// ─────────────────────────────────────────────────────────────────────────────
const ActasHotTable: React.FC<ActasHotTableProps> = ({
  tableData, isReadOnly, onCellChange, actaName, onDelete,
}) => {
  const [rows, setRows] = useState<ActasTableRow[]>(tableData);
  const [saveStatus, setSaveStatus] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle');

  useEffect(() => { setRows(tableData); }, [tableData]);

  const commit = useCallback(
    (rowIndex: number, row: ActasTableRow, field: 'qty' | 'val' | 'pct' | 'prevQty' | 'prevVal' | 'unitPrice' | 'budgetTotal', value: number) => {
      // Optimistic recalculation
      const r = { ...row };
      if (field === 'qty') {
        r.currentQty   = value;
        r.currentValue = value * r.unitPrice;
        r.currentPct   = r.budgetQty > 0 ? (value / r.budgetQty) * 100 : 0;
      } else if (field === 'val') {
        r.currentValue = value;
        r.currentQty   = r.unitPrice > 0 ? value / r.unitPrice : 0;
        r.currentPct   = r.budgetQty > 0 ? (r.currentQty / r.budgetQty) * 100 : 0;
      } else if (field === 'pct') {
        r.currentPct   = value;
        r.currentQty   = (value / 100) * r.budgetQty;
        r.currentValue = r.currentQty * r.unitPrice;
      } else if (field === 'prevQty') {
        r.previousQty   = value;
        r.previousValue = value * r.unitPrice;
      } else if (field === 'prevVal') {
        r.previousValue = value;
        r.previousQty   = r.unitPrice > 0 ? value / r.unitPrice : 0;
      } else if (field === 'unitPrice') {
        r.unitPrice = value;
        r.budgetTotal = r.budgetQty * value;
        // Also recalculate current value based on updated unit price and current qty
        r.currentValue = r.currentQty * value;
        r.previousValue = r.previousQty * value;
      } else if (field === 'budgetTotal') {
        r.budgetTotal = value;
        // If we have a quantity, adjust unit price. If no qty but we have unit price, adjust qty.
        if (r.budgetQty > 0) {
            r.unitPrice = value / r.budgetQty;
        } else if (r.unitPrice > 0) {
            r.budgetQty = value / r.unitPrice;
        } else {
            // Default: keep qty 1 and set unit price to total
            r.budgetQty = 1;
            r.unitPrice = value;
        }
        // Recalculate percent and values based on new budget
        r.currentPct   = r.budgetQty > 0 ? (r.currentQty / r.budgetQty) * 100 : 0;
      }
      r.accumQty    = r.previousQty + r.currentQty;
      r.accumValue  = r.previousValue + r.currentValue;

      setRows(prev => { const n = [...prev]; n[rowIndex] = r; return n; });
      setSaveStatus('saving');
      
      try {
          onCellChange(row, field, value);
          setTimeout(() => setSaveStatus('saved'), 1000);
          setTimeout(() => setSaveStatus('idle'), 3000);
      } catch (err) {
          setSaveStatus('error');
          console.error("Error trigger onCellChange", err);
      }
    },
    [onCellChange]
  );

  // Total row widths for group header
  const total = Object.values(COL_WIDTHS).reduce((a, b) => a + b, 0);

  const thStyle = (w: number, extra?: React.CSSProperties): React.CSSProperties => ({
    width: w, minWidth: w, maxWidth: w,
    padding: '3px 4px', fontSize: '10px',
    fontWeight: 700, textTransform: 'uppercase',
    textAlign: 'center', verticalAlign: 'middle',
    borderRight: '1px solid #cbd5e1',
    borderBottom: '1px solid #94a3b8',
    whiteSpace: 'nowrap', boxSizing: 'border-box',
    ...extra,
  });

  const tdStyle = (w: number, extra?: React.CSSProperties): React.CSSProperties => ({
    width: w, minWidth: w, maxWidth: w,
    height: 28, padding: 0, margin: 0,
    borderRight: '1px solid #e2e8f0',
    borderBottom: '1px solid #e2e8f0',
    overflow: 'hidden',
    boxSizing: 'border-box',
    ...extra,
  });

  const readCell = (
    content: React.ReactNode,
    w: number,
    bg: string,
    align: 'right' | 'center' | 'left' = 'right',
    extra?: React.CSSProperties
  ) => (
    <td style={tdStyle(w, { background: bg })}>
      <div style={{
        width:'100%', height:28, display:'flex', alignItems:'center',
        justifyContent: align === 'right' ? 'flex-end' : align === 'center' ? 'center' : 'flex-start',
        paddingRight: align === 'right' ? 5 : 0,
        paddingLeft: align === 'left' ? 6 : 0,
        fontSize: '11px', color: '#475569', overflow: 'hidden',
        ...extra,
      }}>
        {content}
      </div>
    </td>
  );

  return (
    <div style={{ width: '100%', height: '100%', display: 'flex', flexDirection: 'column', fontFamily: "Inter,'system-ui',sans-serif", overflow: 'hidden', position: 'relative' }}>
      
      {/* Toast Notification para Guardado */}
      <div style={{
          position: 'absolute', top: 10, right: 10, zIndex: 9999, transition: 'all 0.3s ease',
          opacity: saveStatus !== 'idle' ? 1 : 0, transform: saveStatus !== 'idle' ? 'translateY(0)' : 'translateY(-20px)',
          pointerEvents: 'none'
      }}>
          {saveStatus === 'saving' && <div style={{ background: '#3b82f6', color: 'white', padding: '6px 16px', borderRadius: '20px', fontSize: '11px', fontWeight: 'bold', boxShadow: '0 4px 6px -1px rgba(0,0,0,0.1)' }}>Guardando cambios...</div>}
          {saveStatus === 'saved' && <div style={{ background: '#10b981', color: 'white', padding: '6px 16px', borderRadius: '20px', fontSize: '11px', fontWeight: 'bold', boxShadow: '0 4px 6px -1px rgba(0,0,0,0.1)' }}>✓ Guardado en base de datos</div>}
          {saveStatus === 'error' && <div style={{ background: '#ef4444', color: 'white', padding: '6px 16px', borderRadius: '20px', fontSize: '11px', fontWeight: 'bold', boxShadow: '0 4px 6px -1px rgba(0,0,0,0.1)' }}>✕ Error al guardar</div>}
      </div>

      <div style={{ flex: 1, overflowX: 'auto', overflowY: 'auto' }}>
        <table style={{ borderCollapse: 'collapse', tableLayout: 'fixed', width: total }}>
          <colgroup>
            {Object.values(COL_WIDTHS).map((w, i) => <col key={i} style={{ width: w }} />)}
          </colgroup>

          <thead style={{ position: 'sticky', top: 0, zIndex: 20 }}>
            {/* GROUP HEADER ROW */}
            <tr style={{ background: '#f1f5f9' }}>
              <th colSpan={2} style={thStyle(COL_WIDTHS.code + COL_WIDTHS.name, { background: '#e2e8f0', textAlign: 'center', position: 'sticky', left: 0, zIndex: 30 })}>
                CONTRATO BASE
              </th>
              <th colSpan={4} style={thStyle(COL_WIDTHS.unit + COL_WIDTHS.budgetQty + COL_WIDTHS.unitPrice + COL_WIDTHS.budgetTotal, { background: '#f1f5f9' })}>
                CANTIDADES DE OBRA
              </th>
              <th colSpan={2} style={thStyle(COL_WIDTHS.prevQty + COL_WIDTHS.prevVal, { background: '#f1f5f9' })}>
                ACTAS ANTERIORES
              </th>
              <th colSpan={3} style={thStyle(COL_WIDTHS.curQty + COL_WIDTHS.curVal + COL_WIDTHS.curPct, { background: '#dbeafe', color: '#1d4ed8', fontWeight: 900 })}>
                {actaName.toUpperCase()} (ACTUAL)
              </th>
              <th colSpan={2} style={thStyle(COL_WIDTHS.accQty + COL_WIDTHS.accVal, { background: '#f8fafc' })}>
                ACUMULADO
              </th>

              {onDelete && <th style={thStyle(COL_WIDTHS.actions, { background: '#f1f5f9', borderRight: 'none' })}></th>}
            </tr>

            {/* COLUMN HEADER ROW */}
            <tr style={{ background: '#f1f5f9' }}>
              <th style={thStyle(COL_WIDTHS.code,       { background: '#e2e8f0', position: 'sticky', left: 0, zIndex: 30 })}>IT</th>
              <th style={thStyle(COL_WIDTHS.name,       { background: '#e2e8f0', textAlign: 'left', paddingLeft: 8, position: 'sticky', left: COL_WIDTHS.code, zIndex: 30 })}>DESCRIPCIÓN</th>
              <th style={thStyle(COL_WIDTHS.unit,       { background: '#f1f5f9' })}>UNID</th>
              <th style={thStyle(COL_WIDTHS.budgetQty,  { background: '#f1f5f9' })}>CANT.</th>
              <th style={thStyle(COL_WIDTHS.unitPrice,  { background: '#f1f5f9' })}>V/UNIT</th>
              <th style={thStyle(COL_WIDTHS.budgetTotal,{ background: '#f1f5f9' })}>V/TOTAL</th>
              <th style={thStyle(COL_WIDTHS.prevQty,    { background: '#f1f5f9' })}>CANT.</th>
              <th style={thStyle(COL_WIDTHS.prevVal,    { background: '#f1f5f9' })}>V/TOTAL</th>
              <th style={thStyle(COL_WIDTHS.curQty,     { background: '#dbeafe', color: '#1d4ed8', fontWeight: 900 })}>CANT.</th>
              <th style={thStyle(COL_WIDTHS.curVal,     { background: '#dbeafe', color: '#1d4ed8', fontWeight: 900 })}>V/TOTAL</th>
              <th style={thStyle(COL_WIDTHS.curPct,     { background: '#dbeafe', color: '#1d4ed8', fontWeight: 900 })}>%</th>
              <th style={thStyle(COL_WIDTHS.accQty,     { background: '#f8fafc' })}>CANT.</th>
              <th style={thStyle(COL_WIDTHS.accVal,     { background: '#f8fafc' })}>V/TOTAL</th>

              {onDelete && <th style={thStyle(COL_WIDTHS.actions, { background: '#fef2f2', borderRight: 'none' })}></th>}
            </tr>
          </thead>

          <tbody>
            {rows.map((row, idx) => {
              const bg = rowBg(row.code);
              return (
                <tr
                  key={`${row.id}-${row.groupId}-${idx}`}
                  style={{ background: bg }}
                >
                  {/* IT */}
                  <td style={tdStyle(COL_WIDTHS.code, { background: '#f8fafc', position: 'sticky', left: 0, zIndex: 10 })}>
                    <div style={{ width:'100%',height:28,display:'flex',alignItems:'center',justifyContent:'center',fontSize:'11px',fontWeight:700,color:'#334155' }}>
                      {row.code}
                    </div>
                  </td>

                  {/* DESCRIPCIÓN */}
                  <td style={tdStyle(COL_WIDTHS.name, { background: bg, position: 'sticky', left: COL_WIDTHS.code, zIndex: 10 })}>
                    <div style={{ padding:'2px 6px',display:'flex',flexDirection:'column',justifyContent:'center',height:28,overflow:'hidden' }}>
                      <span style={{ fontWeight:700,fontSize:'11px',textTransform:'uppercase',color:'#0f172a',whiteSpace:'nowrap',overflow:'hidden',textOverflow:'ellipsis' }}>
                        {row.name}
                      </span>
                      {row.groupName && row.groupName !== 'PRESUPUESTO GENERAL' && (
                        <span style={{ fontSize:'9px',color:'#94a3b8',fontStyle:'italic',lineHeight:1 }}>{row.groupName}</span>
                      )}
                    </div>
                  </td>

                  {/* UNID */}
                  {readCell(row.values?.unit ?? '', COL_WIDTHS.unit, bg, 'center')}
                  {/* CANT. PRESUPUESTO */}
                  {readCell(fmtN(row.budgetQty),   COL_WIDTHS.budgetQty,   bg)}
                  {/* V/UNIT — EDITABLE */}
                  <td style={tdStyle(COL_WIDTHS.unitPrice, { background: bg })}>
                    {isReadOnly
                      ? <div style={{ display:'flex',alignItems:'center',justifyContent:'flex-end',paddingRight:5,height:28,fontSize:'11px',color:'#475569' }}>{fmt(row.unitPrice)}</div>
                      : <CellInput value={row.unitPrice} align="right" display={fmt} onCommit={v => commit(idx, row, 'unitPrice', v)} />}
                  </td>
                  {/* V/TOTAL PRESUPUESTO — EDITABLE */}
                  <td style={tdStyle(COL_WIDTHS.budgetTotal, { background: bg })}>
                    {isReadOnly
                      ? <div style={{ display:'flex',alignItems:'center',justifyContent:'flex-end',paddingRight:5,height:28,fontSize:'11px',fontWeight:600,color:'#475569' }}>{fmt(row.budgetTotal)}</div>
                      : <CellInput value={row.budgetTotal} align="right" display={fmt} onCommit={v => commit(idx, row, 'budgetTotal', v)} />}
                  </td>

                  {/* ANTERIORES — EDITABLE */}
                  <td style={tdStyle(COL_WIDTHS.prevQty, { background: '#fefce8' })}>
                    {isReadOnly
                      ? <div style={{ display:'flex',alignItems:'center',justifyContent:'flex-end',paddingRight:5,height:28,fontSize:'11px',color:'#78716c' }}>{fmtN(row.previousQty)}</div>
                      : <CellInput value={row.previousQty}   align="right" display={fmtN} onCommit={v => commit(idx, row, 'prevQty', v)} />}
                  </td>
                  <td style={tdStyle(COL_WIDTHS.prevVal, { background: '#fefce8' })}>
                    {isReadOnly
                      ? <div style={{ display:'flex',alignItems:'center',justifyContent:'flex-end',paddingRight:5,height:28,fontSize:'11px',color:'#78716c' }}>{fmt(row.previousValue)}</div>
                      : <CellInput value={row.previousValue} align="right" display={fmt}  onCommit={v => commit(idx, row, 'prevVal', v)} />}
                  </td>

                  {/* ACTUAL — EDITABLE */}
                  <td style={tdStyle(COL_WIDTHS.curQty, { background: '#eff6ff' })}>
                    {isReadOnly
                      ? <div style={{ display:'flex',alignItems:'center',justifyContent:'flex-end',paddingRight:5,height:28,fontSize:'11px',fontWeight:700,color:'#1d4ed8',background:'#eff6ff' }}>{fmtN(row.currentQty)}</div>
                      : <CellInput value={row.currentQty}   align="right"  display={fmtN} onCommit={v => commit(idx, row, 'qty', v)} />}
                  </td>
                  <td style={tdStyle(COL_WIDTHS.curVal, { background: '#eff6ff' })}>
                    {isReadOnly
                      ? <div style={{ display:'flex',alignItems:'center',justifyContent:'flex-end',paddingRight:5,height:28,fontSize:'11px',fontWeight:700,color:'#1d4ed8',background:'#eff6ff' }}>{fmt(row.currentValue)}</div>
                      : <CellInput value={row.currentValue} align="right"  display={fmt}  onCommit={v => commit(idx, row, 'val', v)} />}
                  </td>
                  <td style={tdStyle(COL_WIDTHS.curPct, { background: '#eff6ff' })}>
                    {isReadOnly
                      ? <div style={{ display:'flex',alignItems:'center',justifyContent:'center',height:28,fontSize:'11px',fontWeight:700,color:'#1d4ed8',background:'#eff6ff' }}>{fmtP(row.currentPct)}</div>
                      : <CellInput value={row.currentPct}  align="center" display={fmtP} onCommit={v => commit(idx, row, 'pct', v)} />}
                  </td>

                  {/* ACUMULADO */}
                  {readCell(fmtN(row.accumQty),  COL_WIDTHS.accQty, '#f8fafc', 'right', { fontWeight:700, color:'#334155' })}
                  {readCell(fmt(row.accumValue),  COL_WIDTHS.accVal, '#f8fafc', 'right', { fontWeight:700, color:'#334155' })}


                  {/* DELETE ACTION */}
                  {onDelete && (
                    <td style={tdStyle(COL_WIDTHS.actions, { background: '#fff5f5', borderRight: 'none' })}>
                      <div style={{ display:'flex',alignItems:'center',justifyContent:'center',height:28 }}>
                        <button
                          title="Eliminar ítem"
                          onClick={() => {
                            if (window.confirm(`¿Eliminar "${row.name}"?`)) onDelete(row);
                          }}
                          style={{
                            border: 'none', background: 'transparent', cursor: 'pointer',
                            color: '#ef4444', padding: '2px 4px', borderRadius: 4,
                            display: 'flex', alignItems: 'center', justifyContent: 'center',
                          }}
                          onMouseEnter={e => (e.currentTarget.style.background = '#fee2e2')}
                          onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
                        >
                          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                            <polyline points="3 6 5 6 21 6"/>
                            <path d="M19 6l-1 14a2 2 0 01-2 2H8a2 2 0 01-2-2L5 6"/>
                            <path d="M10 11v6M14 11v6"/>
                            <path d="M9 6V4a1 1 0 011-1h4a1 1 0 011 1v2"/>
                          </svg>
                        </button>
                      </div>
                    </td>
                  )}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
};

export default ActasHotTable;
