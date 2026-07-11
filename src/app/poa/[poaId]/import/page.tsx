'use client';

// Importación del POA. Ruta independiente, deliberadamente NO agregada a
// src/config/navigation.ts (navegación congelada) — mismo criterio que
// /poa/[poaId]/zone-mappings.

import { use } from 'react';
import { UploadCloud, ChevronRight } from 'lucide-react';
import Link from 'next/link';
import PoaImportContainer from '@/components/poa/PoaImportContainer';

export default function PoaImportPage({ params }: { params: Promise<{ poaId: string }> }) {
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
          <span className="text-slate-600">Importar POA</span>
        </div>
        <h1 className="text-2xl md:text-3xl font-bold flex items-center">
          <UploadCloud className="w-8 h-8 mr-3 text-primary" />
          Importar POA
        </h1>
        <p className="text-sm text-slate-500 mt-2">
          Sube el Excel oficial del POA para crear una nueva versión.
        </p>
      </div>

      <PoaImportContainer poaId={poaId} />
    </div>
  );
}
