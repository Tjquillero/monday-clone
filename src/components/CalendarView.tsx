import { useState, useMemo } from 'react';
import { ChevronLeft, ChevronRight, Filter, Check, Eye, EyeOff, LayoutPanelLeft } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';

import { Item, Group } from '@/types/monday';

interface CalendarViewProps {
  groups: Group[];
}

export default function CalendarView({ groups }: CalendarViewProps) {
  const [viewDate, setViewDate] = useState(new Date());
  const [selectedSites, setSelectedSites] = useState<Set<string>>(new Set(groups.map(g => g.id)));
  const [hoveredSite, setHoveredSite] = useState<string | null>(null);
  const [isSidebarOpen, setIsSidebarOpen] = useState(true);

  // Flatten items for easier calendar mapping
  const allItems = useMemo(() => 
    groups.flatMap(group => group.items.map(item => ({ 
      ...item, 
      groupColor: group.color,
      groupId: group.id 
    }))),
    [groups]
  );

  const toggleSite = (groupId: string) => {
    const newSelected = new Set(selectedSites);
    if (newSelected.has(groupId)) {
        newSelected.delete(groupId);
    } else {
        newSelected.add(groupId);
    }
    setSelectedSites(newSelected);
  };

  const daysLabels = ['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb'];

  const calendarData = useMemo(() => {
    const year = viewDate.getFullYear();
    const month = viewDate.getMonth();
    
    // First day of the month
    const firstDay = new Date(year, month, 1);
    // Number of days in the month
    const daysInMonth = new Date(year, month + 1, 0).getDate();
    // Day of the week the month starts on (0-6)
    const startOffset = firstDay.getDay();

    const grid = [];
    for (let i = 0; i < 42; i++) {
      const dayNum = i - startOffset + 1;
      grid.push(dayNum > 0 && dayNum <= daysInMonth ? dayNum : null);
    }
    
    if (grid.slice(35).every(d => d === null)) {
      return grid.slice(0, 35);
    }
    return grid;
  }, [viewDate]);

  const getItemsForDay = (day: number) => {
    if (!day) return [];
    
    const year = viewDate.getFullYear();
    const month = viewDate.getMonth();
    const dateStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;

    return allItems.filter(item => {
        if (!selectedSites.has(item.groupId!)) return false;

        const dailyExec = item.values['daily_execution'] || {};
        const timeline = item.values['timeline'];
        
        if (dailyExec[dateStr]) return true;

        if (timeline && timeline.from && timeline.to) {
          return dateStr >= timeline.from && dateStr <= timeline.to;
        }

        return false;
    });
  };

  const handlePrevMonth = () => {
    setViewDate(new Date(viewDate.getFullYear(), viewDate.getMonth() - 1, 1));
  };

  const handleNextMonth = () => {
    setViewDate(new Date(viewDate.getFullYear(), viewDate.getMonth() + 1, 1));
  };

  const handleToday = () => {
    setViewDate(new Date());
  };

  const monthName = viewDate.toLocaleDateString('es-ES', { month: 'long', year: 'numeric' });

  return (
    <div className="flex bg-white rounded-xl shadow-lg border border-gray-200 overflow-hidden h-[800px]">
      {/* Site Sidebar */}
      <AnimatePresence initial={false}>
        {isSidebarOpen && (
          <motion.div 
            initial={{ width: 0, opacity: 0 }}
            animate={{ width: 280, opacity: 1 }}
            exit={{ width: 0, opacity: 0 }}
            className="border-r border-gray-200 bg-gray-50/50 flex flex-col"
          >
            <div className="p-4 border-b border-gray-200 flex items-center justify-between bg-white">
              <h3 className="font-bold text-gray-700 flex items-center">
                <Filter className="w-4 h-4 mr-2 text-primary" /> Sitios
              </h3>
              <button 
                onClick={() => setSelectedSites(selectedSites.size === groups.length ? new Set() : new Set(groups.map(g => g.id)))}
                className="text-[10px] font-bold text-primary hover:underline"
              >
                {selectedSites.size === groups.length ? 'QUITAR TODO' : 'VER TODO'}
              </button>
            </div>
            <div className="flex-1 overflow-y-auto p-4 space-y-2">
              {groups.map(group => (
                <div 
                  key={group.id}
                  onMouseEnter={() => setHoveredSite(group.id)}
                  onMouseLeave={() => setHoveredSite(null)}
                  onClick={() => toggleSite(group.id)}
                  className={`flex items-center p-2 rounded-lg cursor-pointer transition-all border ${
                    selectedSites.has(group.id) 
                      ? 'bg-white border-gray-200 shadow-sm' 
                      : 'border-transparent opacity-50 grayscale hover:grayscale-0'
                  }`}
                >
                  <div className={`w-3 h-3 rounded-full mr-3 shadow-sm`} style={{ backgroundColor: group.color }} />
                  <span className="text-xs font-bold text-gray-700 flex-1 truncate">{group.title}</span>
                  <div className="text-[10px] font-black text-gray-400 bg-gray-100 px-1.5 py-0.5 rounded-full min-w-[20px] text-center">
                    {group.items.length}
                  </div>
                </div>
              ))}
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Main Calendar Area */}
      <div className="flex-1 flex flex-col">
        <div className="p-4 border-b border-gray-200 flex items-center justify-between bg-white sticky top-0 z-10">
          <div className="flex items-center space-x-6">
              <button 
                onClick={() => setIsSidebarOpen(!isSidebarOpen)}
                className={`p-2 rounded-lg transition-colors ${isSidebarOpen ? 'bg-primary/10 text-primary' : 'hover:bg-gray-100 text-gray-400'}`}
              >
                <LayoutPanelLeft className="w-5 h-5" />
              </button>
              <h2 className="text-xl font-black text-gray-800 capitalize tracking-tight">{monthName}</h2>
              <div className="flex items-center bg-gray-100 rounded-lg p-1">
                  <button onClick={handlePrevMonth} className="p-1.5 hover:bg-white hover:shadow-sm rounded-md transition-all">
                    <ChevronLeft className="w-5 h-5 text-gray-600" />
                  </button>
                  <button onClick={handleToday} className="px-4 py-1.5 text-xs font-black text-gray-600 hover:text-primary transition-colors">HOY</button>
                  <button onClick={handleNextMonth} className="p-1.5 hover:bg-white hover:shadow-sm rounded-md transition-all">
                    <ChevronRight className="w-5 h-5 text-gray-600" />
                  </button>
              </div>
          </div>
          <div className="flex items-center space-x-4">
             <div className="flex items-center space-x-2 text-[10px] font-black text-gray-400 border-r pr-4 border-gray-200">
               <div className="w-2 h-2 rounded-full bg-[#00c875]" /> <span>LISTO</span>
               <div className="w-2 h-2 rounded-full bg-[#fdab3d]" /> <span>EN PROCESO</span>
               <div className="w-2 h-2 rounded-full bg-[#e2445c]" /> <span>DETENIDO</span>
             </div>
             <span className="text-xs font-bold text-gray-400">{selectedSites.size} sitios visibles</span>
          </div>
        </div>
        
        <div className="grid grid-cols-7 border-b border-gray-100 bg-white">
          {daysLabels.map(day => (
              <div key={day} className="py-3 text-center text-[10px] font-black text-gray-400 uppercase tracking-widest border-r border-gray-50 last:border-0">
                  {day}
              </div>
          ))}
        </div>

        <div className="flex-1 overflow-y-auto grid grid-cols-7 auto-rows-fr">
          {calendarData.map((day, idx) => {
            const dayItems = getItemsForDay(day || 0);
            const visibleItems = dayItems.slice(0, 3);
            const remainingCount = dayItems.length - visibleItems.length;

            return (
              <div 
                key={idx} 
                className={`border-b border-r border-gray-50 p-2 min-h-[120px] transition-all group/day ${!day ? 'bg-gray-50/30' : 'bg-white hover:bg-green-50/10'}`}
              >
                  {day && (
                      <>
                          <div className="flex justify-between items-center mb-2">
                             <div className={`text-xs font-black transition-all ${
                                 new Date().toDateString() === new Date(viewDate.getFullYear(), viewDate.getMonth(), day).toDateString()
                                 ? 'bg-primary text-white w-6 h-6 rounded-full flex items-center justify-center shadow-lg shadow-green-900/20'
                                 : 'text-gray-400 group-hover/day:text-primary'
                             }`}>
                               {day}
                             </div>
                          </div>
                          <div className="space-y-1.5">
                              {visibleItems.map((item, i) => (
                                  <motion.div 
                                    layout
                                    key={item.id} 
                                    title={item.name}
                                    className={`text-[9px] p-2 rounded-lg text-white truncate cursor-pointer shadow-sm hover:scale-[1.02] active:scale-95 transition-all font-bold border border-white/20 ${
                                      hoveredSite && item.groupId !== hoveredSite ? 'opacity-20 scale-95' : 'opacity-100'
                                    }`} 
                                    style={{ 
                                      backgroundColor: item.groupColor,
                                      filter: hoveredSite && item.groupId !== hoveredSite ? 'grayscale(0.5)' : 'none'
                                    }}
                                  >
                                      <div className="flex items-center">
                                        <div className={`w-1 h-1 rounded-full mr-1 ${
                                          item.values['status'] === 'Done' ? 'bg-green-400' : 
                                          item.values['status'] === 'Stuck' ? 'bg-red-400' : 'bg-yellow-400'
                                        }`} />
                                        {item.name}
                                      </div>
                                  </motion.div>
                              ))}
                              {remainingCount > 0 && (
                                <button className="w-full text-[9px] font-black text-gray-400 hover:text-primary py-1 border border-dashed border-gray-200 rounded-lg transition-all hover:bg-white hover:border-primary">
                                  + {remainingCount} MÁS
                                </button>
                              )}
                          </div>
                      </>
                  )}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
