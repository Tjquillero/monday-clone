'use client';

import { Item, Group } from '@/types/monday';

interface ChartViewProps {
  groups: Group[];
  columns: any[];
}

export default function ChartView({ groups, columns }: ChartViewProps) {
  const allItems = groups.flatMap(group => group.items);
  
  // Find the status column ID
  const statusCol = columns.find(c => c.type === 'status');
  // If multiple status columns exist, this takes the first one. 
  // In this app, we assume one main status column or we prefer the one typed 'status'.
  
  const statusCounts: Record<string, number> = {
    'Done': 0,
    'Working on it': 0,
    'Stuck': 0,
    'Not Started': 0
  };

  allItems.forEach(item => {
    // Try to get value from the identified status column, fall back to 'status' string key
    let status = 'Not Started';
    
    if (statusCol && item.values[statusCol.id]) {
        status = item.values[statusCol.id];
    } else if (item.values['status']) {
        status = item.values['status'];
    }
    
    // Normalize status string just in case
    if (statusCounts[status] !== undefined) {
      statusCounts[status]++;
    } else {
        // Fallback or dynamic statuses
        statusCounts[status] = (statusCounts[status] || 0) + 1;
    }
  });

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'Done': return '#00c875';
      case 'Working on it': return '#fdab3d';
      case 'Stuck': return '#e2445c';
      case 'Not Started': return '#c4c4c4';
      default: return '#c4c4c4';
    }
  };

  const getStatusLabel = (status: string) => {
    switch (status) {
      case 'Done': return 'Listo';
      case 'Working on it': return 'En proceso';
      case 'Stuck': return 'Detenido';
      case 'Not Started': return 'Sin iniciar';
      default: return status;
    }
  };

  const maxCount = Math.max(...Object.values(statusCounts), 1); // Avoid division by zero

  return (
    <div className="bg-white rounded-lg p-8 shadow-sm border border-gray-200">
      <h2 className="text-lg font-bold text-gray-800 mb-6">Estado de Tareas</h2>
      
      <div className="flex items-end space-x-12 h-64 border-b border-gray-200 pb-2">
        {Object.entries(statusCounts).map(([status, count]) => {
           if (count === 0 && status === 'Not Started') return null; // Optional: hide empty

           const heightPercentage = (count / maxCount) * 100;
           
           return (
             <div key={status} className="flex flex-col items-center flex-1 h-full justify-end group">
                <div className="mb-2 text-sm font-bold text-gray-700 opacity-0 group-hover:opacity-100 transition-opacity">{count} tareas</div>
                <div 
                  className="w-full max-w-[60px] rounded-t-lg transition-all duration-500 ease-out hover:opacity-90"
                  style={{ 
                      height: `${heightPercentage}%`,
                      backgroundColor: getStatusColor(status)
                  }}
                ></div>
             </div>
           );
        })}
      </div>

      <div className="flex items-start space-x-12 mt-4">
         {Object.entries(statusCounts).map(([status, count]) => {
             if (count === 0 && status === 'Not Started') return null;

             return (
                 <div key={status} className="flex-1 text-center">
                    <div className="text-sm font-medium text-gray-600">{getStatusLabel(status)}</div>
                 </div>
             );
         })}
      </div>
    </div>
  );
}
