'use client';

// Mis actividades — superficie del LÍDER (ver src/config/navigation.ts).
// Reemplaza el antiguo listado heurístico "Mis tareas" (filtraba items por
// coincidencia de nombre) por la vista de dominio: actividades del plan
// semanal publicado, listas para registrar jornadas.

import { ClipboardList, ChevronRight } from 'lucide-react';
import Link from 'next/link';
import ActividadesContainer from '@/components/actividades/ActividadesContainer';

export default function MyWorkPage() {
  return (
    <div className="p-4 md:p-8 w-full max-w-[1200px] mx-auto font-sans text-slate-800">
      <div className="mb-6 md:mb-8">
        <div className="flex items-center space-x-2 text-slate-400 text-xs mb-2">
          <Link href="/dashboard" className="hover:text-primary transition-colors">Inicio</Link>
          <ChevronRight className="w-3 h-3" />
          <span className="text-slate-600">Mis actividades</span>
        </div>
        <h1 className="text-2xl md:text-3xl font-bold flex items-center">
          <ClipboardList className="w-8 h-8 mr-3 text-primary" />
          Mis actividades
        </h1>
      </div>

      <ActividadesContainer />
    </div>
  );
}
