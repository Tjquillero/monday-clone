'use client';

import React, { useState } from 'react';
import { Plus, Trash2, Package, Wrench, Truck } from 'lucide-react';
import { OperationalResourceItem } from '@/lib/resourceConsumptionControlService';

interface OperationalResourcePickerProps {
  resources: OperationalResourceItem[];
  onChange: (resources: OperationalResourceItem[]) => void;
  disabled?: boolean;
}

const CATEGORY_ICONS: Record<string, React.ReactNode> = {
  MATERIAL: <Package className="w-3.5 h-3.5 text-blue-500" />,
  EQUIPO_MENOR: <Wrench className="w-3.5 h-3.5 text-amber-500" />,
  EQUIPO_MAYOR: <Truck className="w-3.5 h-3.5 text-purple-500" />,
};

const COMMON_RESOURCES: { key: string; name: string; category: 'MATERIAL' | 'EQUIPO_MENOR' | 'EQUIPO_MAYOR'; defaultUnit: string }[] = [
  { key: 'MAT_CEMENTO', name: 'Cemento Gris', category: 'MATERIAL', defaultUnit: 'saco' },
  { key: 'MAT_ARENA', name: 'Arena de Peña / Río', category: 'MATERIAL', defaultUnit: 'm3' },
  { key: 'MAT_GRAVILLA', name: 'Gravilla Triturada', category: 'MATERIAL', defaultUnit: 'm3' },
  { key: 'MAT_AGUA', name: 'Agua para Mezcla', category: 'MATERIAL', defaultUnit: 'gal' },
  { key: 'MAT_PINTURA', name: 'Pintura Demarcación', category: 'MATERIAL', defaultUnit: 'gal' },
  { key: 'EQM_MEZCLADORA', name: 'Mezcladora Trompo', category: 'EQUIPO_MENOR', defaultUnit: 'hora' },
  { key: 'EQM_COMPACTADORA', name: 'Vibrocompactadora Manual', category: 'EQUIPO_MENOR', defaultUnit: 'hora' },
  { key: 'EQM_CORTADORA', name: 'Cortadora de Pavimento', category: 'EQUIPO_MENOR', defaultUnit: 'hora' },
  { key: 'EQM_GUADANADORA', name: 'Guadañadora Forestal', category: 'EQUIPO_MENOR', defaultUnit: 'hora' },
  { key: 'EQM_MOTOBOMBA', name: 'Motobomba 3 Pulgadas', category: 'EQUIPO_MENOR', defaultUnit: 'hora' },
  { key: 'EQ_VOLQUETA', name: 'Volqueta Sencilla', category: 'EQUIPO_MAYOR', defaultUnit: 'hora' },
  { key: 'EQ_RETRO', name: 'Retroexcavadora Oruga', category: 'EQUIPO_MAYOR', defaultUnit: 'hora' },
];

export const OperationalResourcePicker: React.FC<OperationalResourcePickerProps> = ({
  resources,
  onChange,
  disabled = false,
}) => {
  const [selectedPresetKey, setSelectedPresetKey] = useState<string>('');
  const [customName, setCustomName] = useState<string>('');
  const [customCategory, setCustomCategory] = useState<'MATERIAL' | 'EQUIPO_MENOR' | 'EQUIPO_MAYOR'>('MATERIAL');
  const [customUnit, setCustomUnit] = useState<string>('und');
  const [customQty, setCustomQty] = useState<number>(1);
  const [isAddingCustom, setIsAddingCustom] = useState<boolean>(false);

  const handleAddPreset = () => {
    if (!selectedPresetKey) return;
    const preset = COMMON_RESOURCES.find((r) => r.key === selectedPresetKey);
    if (!preset) return;

    // Check if already added
    const existingIndex = resources.findIndex((r) => r.resourceKey === preset.key);
    if (existingIndex >= 0) {
      // Increment quantity
      const updated = [...resources];
      updated[existingIndex].quantity += 1;
      onChange(updated);
    } else {
      const newItem: OperationalResourceItem = {
        resourceKey: preset.key,
        resourceName: preset.name,
        category: preset.category,
        unit: preset.defaultUnit,
        quantity: 1,
      };
      onChange([...resources, newItem]);
    }
    setSelectedPresetKey('');
  };

  const handleAddCustom = () => {
    if (!customName.trim() || customQty <= 0) return;
    const key = `RES_CUSTOM_${Date.now()}_${Math.random().toString(36).substring(2, 6).toUpperCase()}`;
    const newItem: OperationalResourceItem = {
      resourceKey: key,
      resourceName: customName.trim(),
      category: customCategory,
      unit: customUnit.trim() || 'und',
      quantity: Number(customQty),
    };
    onChange([...resources, newItem]);
    setCustomName('');
    setCustomQty(1);
    setIsAddingCustom(false);
  };

  const handleUpdateQty = (index: number, qty: number) => {
    if (qty <= 0) return;
    const updated = [...resources];
    updated[index].quantity = qty;
    onChange(updated);
  };

  const handleRemove = (index: number) => {
    const updated = resources.filter((_, i) => i !== index);
    onChange(updated);
  };

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <label className="text-xs font-semibold text-slate-700 uppercase tracking-wide flex items-center">
          <Wrench className="w-3.5 h-3.5 mr-1.5 text-primary" />
          Insumos y Equipos Observados (Opcional)
        </label>
        {!isAddingCustom && (
          <button
            type="button"
            onClick={() => setIsAddingCustom(true)}
            disabled={disabled}
            className="text-[11px] text-primary hover:underline font-medium"
          >
            + Otro recurso
          </button>
        )}
      </div>

      {/* Selector de Recursos Frecuentes */}
      {!isAddingCustom && (
        <div className="flex items-center gap-2">
          <select
            value={selectedPresetKey}
            onChange={(e) => setSelectedPresetKey(e.target.value)}
            disabled={disabled}
            className="flex-1 text-xs px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg focus:outline-none focus:ring-1 focus:ring-primary text-slate-700"
          >
            <option value="">-- Seleccionar insumo / equipo frecuente --</option>
            <optgroup label="Materiales">
              {COMMON_RESOURCES.filter((r) => r.category === 'MATERIAL').map((r) => (
                <option key={r.key} value={r.key}>
                  {r.name} ({r.defaultUnit})
                </option>
              ))}
            </optgroup>
            <optgroup label="Equipo Menor">
              {COMMON_RESOURCES.filter((r) => r.category === 'EQUIPO_MENOR').map((r) => (
                <option key={r.key} value={r.key}>
                  {r.name} ({r.defaultUnit})
                </option>
              ))}
            </optgroup>
            <optgroup label="Equipo Mayor / Maquinaria">
              {COMMON_RESOURCES.filter((r) => r.category === 'EQUIPO_MAYOR').map((r) => (
                <option key={r.key} value={r.key}>
                  {r.name} ({r.defaultUnit})
                </option>
              ))}
            </optgroup>
          </select>

          <button
            type="button"
            onClick={handleAddPreset}
            disabled={disabled || !selectedPresetKey}
            className="px-3 py-2 bg-slate-100 hover:bg-slate-200 disabled:opacity-50 text-slate-700 text-xs font-semibold rounded-lg flex items-center gap-1 transition-colors"
          >
            <Plus className="w-3.5 h-3.5" />
            Agregar
          </button>
        </div>
      )}

      {/* Formulario de Recurso Personalizado */}
      {isAddingCustom && (
        <div className="p-3 bg-slate-50 rounded-xl border border-slate-200/80 space-y-2.5 animate-fadeIn">
          <div className="text-[11px] font-semibold text-slate-600">Registrar recurso específico:</div>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
            <input
              type="text"
              placeholder="Nombre del insumo / equipo"
              value={customName}
              onChange={(e) => setCustomName(e.target.value)}
              className="text-xs px-2.5 py-1.5 bg-white border border-slate-200 rounded-lg sm:col-span-2 text-slate-800"
            />
            <select
              value={customCategory}
              onChange={(e) => setCustomCategory(e.target.value as any)}
              className="text-xs px-2 py-1.5 bg-white border border-slate-200 rounded-lg text-slate-700"
            >
              <option value="MATERIAL">Material</option>
              <option value="EQUIPO_MENOR">Equipo Menor</option>
              <option value="EQUIPO_MAYOR">Equipo Mayor</option>
            </select>
          </div>
          <div className="flex items-center gap-2">
            <div className="flex-1 flex items-center gap-1">
              <span className="text-[11px] text-slate-500">Cantidad:</span>
              <input
                type="number"
                min="0.1"
                step="any"
                value={customQty}
                onChange={(e) => setCustomQty(parseFloat(e.target.value) || 0)}
                className="w-20 text-xs px-2 py-1 bg-white border border-slate-200 rounded-lg text-slate-800"
              />
            </div>
            <div className="flex-1 flex items-center gap-1">
              <span className="text-[11px] text-slate-500">Unidad:</span>
              <input
                type="text"
                placeholder="und, m3, hora..."
                value={customUnit}
                onChange={(e) => setCustomUnit(e.target.value)}
                className="w-24 text-xs px-2 py-1 bg-white border border-slate-200 rounded-lg text-slate-800"
              />
            </div>
            <button
              type="button"
              onClick={handleAddCustom}
              disabled={!customName.trim() || customQty <= 0}
              className="px-3 py-1 bg-primary text-white text-xs font-semibold rounded-lg disabled:opacity-50"
            >
              Guardar
            </button>
            <button
              type="button"
              onClick={() => setIsAddingCustom(false)}
              className="px-2 py-1 text-slate-400 hover:text-slate-600 text-xs"
            >
              Cancelar
            </button>
          </div>
        </div>
      )}

      {/* Lista de Recursos Agregados */}
      {resources.length > 0 ? (
        <div className="space-y-1.5 mt-2">
          {resources.map((res, idx) => (
            <div
              key={`${res.resourceKey}-${idx}`}
              className="flex items-center justify-between p-2.5 bg-slate-50/70 border border-slate-200/60 rounded-xl text-xs"
            >
              <div className="flex items-center space-x-2 min-w-0 pr-2">
                {CATEGORY_ICONS[res.category] || <Package className="w-3.5 h-3.5 text-slate-400" />}
                <span className="font-semibold text-slate-800 truncate">{res.resourceName}</span>
                <span className="text-[10px] text-slate-400 uppercase bg-white px-1.5 py-0.5 rounded border border-slate-100">
                  {res.category.replace('_', ' ')}
                </span>
              </div>

              <div className="flex items-center space-x-2 shrink-0">
                <input
                  type="number"
                  min="0.1"
                  step="any"
                  value={res.quantity}
                  onChange={(e) => handleUpdateQty(idx, parseFloat(e.target.value) || 1)}
                  disabled={disabled}
                  className="w-16 text-center text-xs py-1 px-1.5 bg-white border border-slate-200 rounded-lg font-semibold text-slate-800"
                />
                <span className="text-slate-500 text-[11px] w-8">{res.unit}</span>
                <button
                  type="button"
                  onClick={() => handleRemove(idx)}
                  disabled={disabled}
                  aria-label="Eliminar recurso"
                  data-testid={`remove-resource-${idx}`}
                  className="p-1 text-slate-400 hover:text-red-500 transition-colors"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>
          ))}
        </div>
      ) : (
        <p className="text-[11px] text-slate-400 italic">
          No se han registrado insumos ni equipos para esta jornada.
        </p>
      )}
    </div>
  );
};

export default OperationalResourcePicker;
