'use client';

import { Group } from '@/types/monday';
import { motion } from 'framer-motion';
import { 
  TrendingUp, AlertTriangle, CheckCircle2, 
  BarChart2, Zap, Target, Activity
} from 'lucide-react';
import { useMemo } from 'react';

interface AssessmentViewProps {
  groups: Group[];
}

export default function AssessmentView({ groups }: AssessmentViewProps) {
  const allItems = groups.flatMap(g => g.items);
  const totalItems = allItems.length;
  const doneItems = allItems.filter(i => i.values['status'] === 'Done').length;
  const stuckItems = allItems.filter(i => i.values['status'] === 'Stuck').length;
  const progress = totalItems > 0 ? (doneItems / totalItems) * 100 : 0;
  
  // Project Health Logic
  const healthStatus = stuckItems > 1 ? 'En Riesgo' : progress > 50 ? 'Excelente' : 'Estable';
  const healthColor = healthStatus === 'Excelente' ? 'text-[#00c875]' : healthStatus === 'En Riesgo' ? 'text-[#e2445c]' : 'text-[#fdab3d]';

  // Real Matrix Data computed from items
  const matrixPoints = useMemo(() => {
    // We'll take the first 10 items that have some "cant" or priority
    return allItems
      .filter(i => i.values['cant'] || i.values['priority'])
      .slice(0, 10)
      .map(item => {
        const cant = parseFloat(item.values['cant']) || 0;
        const rend = parseFloat(item.values['rend']) || 1;
        const jor = cant / rend;
        
        // Effort (Y) based on Jornales (0-50 range normalized to 0-100)
        const y = Math.min(Math.round((jor / 50) * 100), 95);
        
        // Impact (X) based on Priority
        const priority = item.values['priority'];
        const x = priority === 'Critical' ? 90 : priority === 'High' ? 70 : priority === 'Medium' ? 40 : 20;
        
        return {
          name: item.name,
          x,
          y,
          impact: priority || 'Low',
          effort: jor.toFixed(1),
          color: priority === 'Critical' ? '#e2445c' : 'primary'
        };
      });
  }, [allItems]);

  // Effort Distribution (by Site/Group)
  const groupEfforts = useMemo(() => {
    return groups.map(g => {
        const totalJor = g.items.reduce((sum, item) => {
            const cant = parseFloat(item.values['cant']) || 0;
            const rend = parseFloat(item.values['rend']) || 1;
            return sum + (cant / rend);
        }, 0);
        return { label: g.title, jor: totalJor, color: g.color };
    }).sort((a, b) => b.jor - a.jor).slice(0, 4);
  }, [groups]);

  const maxJor = Math.max(...groupEfforts.map(g => g.jor), 1);

  // Real Prediction Logic
  const prediction = useMemo(() => {
    let totalJor = 0;
    let completedJor = 0;
    let recentCompletedJor = 0;
    
    const sevenDaysAgo = new Date();
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);

    allItems.forEach(item => {
        const cant = parseFloat(item.values['cant']) || 0;
        const rend = parseFloat(item.values['rend']) || 1;
        const itemTotalJor = cant / rend;
        totalJor += itemTotalJor;

        const dailyExec = item.values['daily_execution'] || {};
        Object.entries(dailyExec).forEach(([dateStr, entry]: [string, any]) => {
            const val = typeof entry === 'object' ? (entry.val || 0) : (parseFloat(entry) || 0);
            const isDone = typeof entry === 'object' ? entry.done : true;
            
            if (isDone) {
                completedJor += val;
                const d = new Date(dateStr + 'T00:00:00');
                if (d >= sevenDaysAgo) {
                    recentCompletedJor += val;
                }
            }
        });
    });

    // Velocity (Jornales per day)
    const velocity = recentCompletedJor / 7;
    const remaining = Math.max(0, totalJor - completedJor);
    
    if (velocity <= 0) {
        // Fallback: If no velocity, estimate based on remaining items and 10 days
        const estDate = new Date();
        estDate.setDate(estDate.getDate() + 15);
        return { date: estDate, velocity: 0, confidence: 'Baja (Sin histórico)' };
    }

    const daysToFinish = Math.ceil(remaining / velocity);
    const estDate = new Date();
    estDate.setDate(estDate.getDate() + daysToFinish);

    return { 
        date: estDate, 
        velocity: velocity.toFixed(1), 
        remaining: remaining.toFixed(1),
        confidence: velocity > 2 ? 'Alta' : 'Media'
    };
  }, [allItems]);

  const formatDate = (d: Date) => {
    return d.toLocaleDateString('es-ES', { day: 'numeric', month: 'long' });
  };

  return (
    <div className="p-6 space-y-8 bg-[#f5f6f8] min-h-full">
      {/* KPI Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
        <KPIBox 
          title="Progreso General" 
          value={`${Math.round(progress)}%`} 
          icon={<TrendingUp className="w-5 h-5 text-primary" />}
          detail="Basado en tareas completadas"
        />
        <KPIBox 
          title="Salud del Proyecto" 
          value={healthStatus} 
          icon={<Activity className={`w-5 h-5 ${healthColor}`} />}
          detail={`${stuckItems} cuellos de botella detectados`}
          valueColor={healthColor}
        />
        <KPIBox 
          title="Tareas Críticas" 
          value={allItems.filter(i => i.values['priority'] === 'Critical').length.toString()} 
          icon={<AlertTriangle className="w-5 h-5 text-[#e2445c]" />}
          detail="Requieren atención inmediata"
        />
        <KPIBox 
          title="Valor Generado" 
          value="High" 
          icon={<Zap className="w-5 h-5 text-[#fdab3d]" />}
          detail="Estimación de impacto del sprint"
        />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        {/* Impact vs Effort Matrix */}
        <div className="bg-white p-8 rounded-2xl shadow-sm border border-gray-200">
          <div className="flex items-center justify-between mb-8">
             <h3 className="font-bold text-[#323338] flex items-center">
                <Target className="w-5 h-5 mr-2 text-primary" />
                Matriz de Priorización (Impacto vs Esfuerzo)
             </h3>
             <span className="text-xs text-gray-400 font-medium bg-gray-50 px-3 py-1 rounded-full border border-gray-100 italic">Actualizado en tiempo real</span>
          </div>
          
          <div className="relative aspect-square w-full border-l-2 border-b-2 border-gray-200 ml-4 mb-4">
            {/* Axis Labels */}
            <div className="absolute -left-6 top-1/2 -rotate-90 text-[10px] font-bold text-gray-400 uppercase tracking-widest">Esfuerzo</div>
            <div className="absolute -bottom-6 left-1/2 -translate-x-1/2 text-[10px] font-bold text-gray-400 uppercase tracking-widest">Impacto</div>

            {/* Quadrant Labels */}
             <div className="absolute top-4 right-4 text-[10px] font-bold text-blue-200 uppercase">Grandes Apuestas</div>
             <div className="absolute bottom-4 right-4 text-[10px] font-bold text-green-200 uppercase">Victorias Rápidas</div>
             <div className="absolute bottom-4 left-4 text-[10px] font-bold text-gray-200 uppercase">Tareas Relleno</div>
             <div className="absolute top-4 left-4 text-[10px] font-bold text-red-200 uppercase">Sumideros de Tiempo</div>

            {/* Grid */}
            <div className="absolute inset-0 grid grid-cols-2 grid-rows-2">
                 <div className="border-r border-b border-gray-100 border-dashed"></div>
                 <div className="border-b border-gray-100 border-dashed"></div>
                 <div className="border-r border-gray-100 border-dashed"></div>
                 <div></div>
            </div>

            {/* Matrix Points */}
            {matrixPoints.map((point, idx) => (
              <motion.div
                key={idx}
                initial={{ scale: 0, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                transition={{ delay: idx * 0.1, type: 'spring' }}
                className="absolute w-4 h-4 rounded-full border-2 border-white shadow-md cursor-pointer group"
                style={{ left: `${point.x}%`, bottom: `${point.y}%`, backgroundColor: point.color }}
              >
                <div className="absolute bottom-6 left-1/2 -translate-x-1/2 bg-[#1e1f21] text-white text-[9px] px-2 py-1 rounded whitespace-nowrap opacity-0 group-hover:opacity-100 transition-opacity z-20 font-bold">
                  {point.name} (Impacto: {point.impact}, Jornales: {point.effort})
                </div>
              </motion.div>
            ))}
          </div>
        </div>

        {/* Status Distribution */}
        <div className="bg-white p-8 rounded-2xl shadow-sm border border-gray-200 flex flex-col">
          <div className="flex items-center justify-between mb-8">
             <h3 className="font-bold text-[#323338] flex items-center">
                <BarChart2 className="w-5 h-5 mr-2 text-primary" />
                Distribución de Esfuerzo
             </h3>
          </div>
          
          <div className="flex-1 flex flex-col justify-center space-y-6">
            {groupEfforts.map((ge, idx) => (
               <ProgressBar 
                key={idx} 
                label={ge.label} 
                progress={Math.round((ge.jor / maxJor) * 100)} 
                color={ge.color} 
                detail={`${ge.jor.toFixed(1)} Jor. Req.`} 
               />
            ))}
            
            <div className="mt-10 pt-8 border-t border-gray-100">
                <div className="flex items-center text-sm text-gray-500 mb-2">
                   <CheckCircle2 className="w-4 h-4 mr-2 text-[#00c875]" />
                   <span>Predicción de Finalización: <span className="font-black text-[#323338] ml-1">{formatDate(prediction.date)}</span></span>
                </div>
                <p className="text-xs text-gray-400 italic">
                    Basado en velocidad de {prediction.velocity || '0'} jornales/día. Confianza: <span className="font-bold">{prediction.confidence}</span>.
                </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function KPIBox({ title, value, icon, detail, valueColor = "text-[#323338]" }: any) {
  return (
    <motion.div 
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      className="bg-white p-5 rounded-2xl shadow-sm border border-gray-100 hover:shadow-md transition-shadow"
    >
      <div className="flex items-center justify-between mb-3">
        <span className="text-xs font-bold text-gray-400 uppercase tracking-wider">{title}</span>
        {icon}
      </div>
      <div className={`text-2xl font-black ${valueColor} mb-1`}>{value}</div>
      <div className="text-[10px] text-gray-400 font-medium">{detail}</div>
    </motion.div>
  );
}

function ProgressBar({ label, progress, color, detail }: any) {
  return (
    <div className="space-y-2">
      <div className="flex justify-between text-xs font-bold text-gray-600">
        <div className="flex flex-col">
            <span>{label}</span>
            {detail && <span className="text-[10px] text-gray-400 font-medium">{detail}</span>}
        </div>
        <span>{progress}%</span>
      </div>
      <div className="h-2 w-full bg-gray-100 rounded-full overflow-hidden">
        <motion.div 
          initial={{ width: 0 }}
          animate={{ width: `${progress}%` }}
          transition={{ duration: 0.8, ease: 'easeOut' }}
          className="h-full"
          style={{ backgroundColor: color }}
        />
      </div>
    </div>
  );
}
