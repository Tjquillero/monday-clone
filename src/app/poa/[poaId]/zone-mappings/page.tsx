'use client';

// Resolución de mapeos de zona del POA (ADR-0004). Ruta independiente,
// deliberadamente NO agregada a src/config/navigation.ts (navegación
// congelada — requiere decisión explícita del propietario del producto
// antes de exponerse en el sidebar/ribbon). Se llega por enlace directo
// mientras no exista un punto de entrada de "Importar POA" en la navegación.

import { use } from 'react';
import { MapPin, ChevronRight } from 'lucide-react';
import Link from 'next/link';
import ZoneMappingsResolver from '@/components/poa/ZoneMappingsResolver';

export default function ZoneMappingsPage({ params }: { params: Promise<{ poaId: string }> }) {
  const { poaId } = use(params);

  if (!poaId) {
    return <div className="p-8 text-center">No se ha especificado un POA.</div>;
  }

  return (
    <div className="p-4 md:p-8 w-full max-w-[900px] mx-auto font-sans text-slate-800">
      <div className="mb-6 md:mb-8">
        <div className="flex items-center space-x-2 text-slate-400 text-xs mb-2">
          <Link href="/dashboard" className="hover:text-primary transition-colors">Inicio</Link>
          <ChevronRight className="w-3 h-3" />
          <span className="text-slate-600">Mapeo de zonas del POA</span>
        </div>
        <h1 className="text-2xl md:text-3xl font-bold flex items-center">
          <MapPin className="w-8 h-8 mr-3 text-primary" />
          Mapeo de zonas del POA
        </h1>
        <p className="text-sm text-slate-500 mt-2">
          Asigna cada zona del Excel del POA a un group real de este board (ADR-0004).
        </p>
      </div>

      <ZoneMappingsResolver poaId={poaId} />
    </div>
  );
}
