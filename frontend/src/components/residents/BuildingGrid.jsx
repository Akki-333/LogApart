import { useContext } from 'react';
import { AuthContext } from '../../context/AuthContext';
import { Home, User } from 'lucide-react';

export default function BuildingGrid({ data, onUnitClick, searchTerm = '', filterStatus = 'ALL' }) {
  const { user } = useContext(AuthContext);

  if (!data || Object.keys(data).length === 0) {
    return (
      <div className="bg-white rounded-2xl border border-slate-200 p-12 text-center text-slate-400">
        <Home className="w-8 h-8 mx-auto mb-2 text-slate-300" />
        <p className="text-sm font-semibold">No building data available.</p>
      </div>
    );
  }

  // Filter checker
  const isMatch = (unit) => {
    // 1. Status Filter
    if (filterStatus === 'OCCUPIED' && !unit.is_occupied) return false;
    if (filterStatus === 'VACANT' && unit.is_occupied) return false;
    if (filterStatus === 'OWNER' && unit.type !== 'OWNER') return false;
    if (filterStatus === 'TENANT' && unit.type !== 'TENANT') return false;

    // 2. Search Query
    if (searchTerm.trim()) {
      const q = searchTerm.toLowerCase();
      const numMatch = unit.number?.toLowerCase().includes(q);
      const nameMatch = unit.resident_name?.toLowerCase().includes(q);
      const phoneMatch = unit.resident_phone?.toLowerCase().includes(q);
      return numMatch || nameMatch || phoneMatch;
    }

    return true;
  };

  return (
    <div className="space-y-8">
      {Object.values(data).map((block) => (
        <div key={block.block || 'main'} className="bg-white rounded-2xl shadow-sm border border-slate-200 p-6 sm:p-8">
          
          {/* Block Header */}
          <div className="flex items-center justify-between mb-8 pb-4 border-b border-slate-100">
            <div className="flex items-center gap-3">
              <span className="w-10 h-10 rounded-xl bg-teal-100 text-teal-700 flex items-center justify-center shadow-xs">
                <Home className="w-5 h-5" />
              </span>
              <div>
                <h3 className="text-lg font-bold text-slate-900">
                  {block.block ? `Block ${block.block}` : 'Main Residential Complex'}
                </h3>
                <p className="text-xs text-slate-400">4 Residential Levels • 20 Total Units</p>
              </div>
            </div>

            <div className="hidden sm:flex items-center gap-4 text-xs font-semibold">
              <span className="flex items-center gap-1.5 text-teal-700">
                <span className="w-2.5 h-2.5 rounded-full bg-teal-500"></span> Occupied Flat
              </span>
              <span className="flex items-center gap-1.5 text-slate-500">
                <span className="w-2.5 h-2.5 rounded-full bg-slate-300"></span> Vacant Flat
              </span>
            </div>
          </div>

          {/* Floors Hierarchy (4 down to 1) */}
          <div className="space-y-6">
            {Object.entries(block.floors)
              .sort(([a], [b]) => Number(b) - Number(a)) // Top floor (4) on top down to Floor 1
              .map(([floorNum, units]) => (
              <div 
                key={floorNum} 
                className="flex flex-col sm:flex-row sm:items-center gap-4 p-3.5 rounded-xl bg-slate-50/50 border border-slate-100"
              >
                {/* Floor Label */}
                <div className="w-24 shrink-0">
                  <div className="text-xs font-black text-slate-900 uppercase tracking-widest">
                    Floor {floorNum}
                  </div>
                  <div className="text-[11px] font-medium text-slate-400">
                    {units.filter(u => u.is_occupied).length}/{units.length} Occupied
                  </div>
                </div>
                
                {/* Units Row */}
                <div className="flex flex-wrap gap-3.5 flex-1">
                  {units.map((unit) => {
                    const matched = isMatch(unit);
                    return (
                      <button
                        key={unit.unit_id}
                        onClick={() => onUnitClick(unit)}
                        className={`
                          relative group flex flex-col items-center justify-center w-24 h-24 rounded-2xl border transition-all duration-200 shadow-xs
                          ${!matched 
                            ? 'opacity-30 grayscale' 
                            : unit.is_occupied 
                              ? 'bg-teal-50/80 border-teal-200 hover:bg-teal-100/80 hover:border-teal-400 hover:shadow-md hover:-translate-y-0.5' 
                              : 'bg-white border-slate-200 hover:bg-slate-100 hover:border-slate-300 hover:shadow-md hover:-translate-y-0.5'
                          }
                        `}
                      >
                        {/* Flat Number */}
                        <span className={`text-xl font-black ${unit.is_occupied ? 'text-teal-900' : 'text-slate-600'}`}>
                          {unit.number}
                        </span>

                        {/* Status Label */}
                        <span className={`text-[11px] mt-1 font-bold ${
                          unit.is_occupied ? 'text-teal-600' : 'text-slate-400'
                        }`}>
                          {unit.is_occupied ? (unit.type || 'Occupied') : 'Vacant'}
                        </span>
                        
                        {/* Occupied Tooltip */}
                        {unit.is_occupied && user?.role !== 'SECURITY' && (
                          <div className="absolute -top-10 left-1/2 transform -translate-x-1/2 bg-slate-900 text-white text-xs font-semibold py-1 px-2.5 rounded-lg opacity-0 group-hover:opacity-100 transition-all pointer-events-none whitespace-nowrap z-20 shadow-xl border border-slate-700 flex items-center gap-1">
                            <User className="w-3 h-3 text-teal-400" />
                            {unit.resident_name || 'Resident'}
                          </div>
                        )}
                      </button>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}
