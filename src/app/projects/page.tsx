'use client';

import { useState } from 'react';
import PersonnelManagement from '@/components/PersonnelManagement';
import TeamCalendar from '@/components/TeamCalendar';
import WorkloadView from '@/components/WorkloadView';
import { 
  Users, Calendar, BarChart3
} from 'lucide-react';

export default function PlanningPage() {
  const [activeTab, setActiveTab] = useState<'personnel' | 'calendar' | 'workload'>('personnel');

  return (
    <div className="p-4 md:p-8 w-full max-w-[1400px] mx-auto font-sans text-slate-800">
        {/* Header */}
        <div className="mb-8">
          <h1 className="text-3xl font-black mb-2 text-slate-800 tracking-tight">Planificación y Recursos</h1>
          <p className="text-slate-500 text-lg font-medium">Gestiona tu equipo, asignaciones y carga de trabajo en un solo lugar.</p>
        </div>

        {/* Tabs */}
        <div className="flex items-center space-x-1 border-b border-slate-200 mb-8 bg-white/50 backdrop-blur-sm sticky top-0 z-20">
            <button 
                onClick={() => setActiveTab('personnel')}
                className={`flex items-center px-6 py-4 text-sm font-bold border-b-2 transition-all ${activeTab === 'personnel' ? 'border-primary text-primary bg-primary/5' : 'border-transparent text-slate-500 hover:text-slate-800 hover:bg-slate-50'}`}
            >
                <Users className="w-4 h-4 mr-2" />
                Directorio
            </button>
            <button 
                onClick={() => setActiveTab('calendar')}
                className={`flex items-center px-6 py-4 text-sm font-bold border-b-2 transition-all ${activeTab === 'calendar' ? 'border-primary text-primary bg-primary/5' : 'border-transparent text-slate-500 hover:text-slate-800 hover:bg-slate-50'}`}
            >
                <Calendar className="w-4 h-4 mr-2" />
                Calendario de Equipo
            </button>
            <button 
                onClick={() => setActiveTab('workload')}
                className={`flex items-center px-6 py-4 text-sm font-bold border-b-2 transition-all ${activeTab === 'workload' ? 'border-primary text-primary bg-primary/5' : 'border-transparent text-slate-500 hover:text-slate-800 hover:bg-slate-50'}`}
            >
                <BarChart3 className="w-4 h-4 mr-2" />
                Carga de Trabajo
            </button>
        </div>

        {/* Content */}
        <div className="min-h-[600px] pb-20">
            {activeTab === 'personnel' && (
                <div className="animate-in fade-in slide-in-from-left-4 duration-500">
                    <PersonnelManagement />
                </div>
            )}
            
            {activeTab === 'calendar' && (
                <div className="animate-in fade-in slide-in-from-left-4 duration-500">
                    <TeamCalendar />
                </div>
            )}

            {activeTab === 'workload' && (
                <div className="animate-in fade-in slide-in-from-left-4 duration-500">
                    <WorkloadView />
                </div>
            )}
        </div>
    </div>
  );
}
