import { useState, useContext } from 'react';
import { AuthContext } from '../../context/AuthContext';
import { Home } from 'lucide-react';

export default function BuildingGrid({ data, onUnitClick }) {
  const { user } = useContext(AuthContext);

  if (!data || Object.keys(data).length === 0) {
    return <div className="p-8 text-center text-slate-500">No building data available.</div>;
  }

  return (
    <div className="space-y-12">
      {Object.values(data).map((block) => (
        <div key={block.block} className="bg-white rounded-xl shadow-sm border border-slate-200 p-6">
          <div className="flex items-center justify-between mb-6">
            <h3 className="text-xl font-bold text-slate-800 flex items-center">
              <span className="w-8 h-8 rounded-lg bg-teal-100 text-teal-700 flex items-center justify-center mr-3">
                <Home className="w-4 h-4" />
              </span>
              {block.block ? `Block ${block.block}` : 'Main Building'}
            </h3>
          </div>

          <div className="space-y-4">
            {Object.entries(block.floors)
              .sort(([a], [b]) => Number(b) - Number(a)) // Highest floor on top
              .map(([floorNum, units]) => (
              <div key={floorNum} className="flex flex-col sm:flex-row sm:items-center gap-4 border-b border-slate-50 pb-4 last:border-0 last:pb-0">
                <div className="w-20 text-sm font-bold text-slate-400 uppercase tracking-wider">
                  Floor {floorNum}
                </div>
                
                <div className="flex flex-wrap gap-3 flex-1">
                  {units.map((unit) => (
                    <button
                      key={unit.unit_id}
                      onClick={() => onUnitClick(unit)}
                      className={`
                        relative group flex flex-col items-center justify-center w-24 h-24 rounded-xl border transition-all duration-200
                        ${unit.is_occupied 
                          ? 'bg-teal-50 border-teal-200 hover:bg-teal-100 hover:border-teal-300 hover:shadow-md' 
                          : 'bg-slate-50 border-slate-200 hover:bg-slate-100 hover:border-slate-300 hover:shadow-md'}
                      `}
                    >
                      <span className={`text-lg font-bold ${unit.is_occupied ? 'text-teal-800' : 'text-slate-500'}`}>
                        {unit.number}
                      </span>
                      <span className={`text-xs mt-1 font-medium ${unit.is_occupied ? 'text-teal-600' : 'text-slate-400'}`}>
                        {unit.is_occupied ? 'Occupied' : 'Vacant'}
                      </span>
                      
                      {/* Tooltip on hover */}
                      {unit.is_occupied && user?.role !== 'SECURITY' && (
                        <div className="absolute -top-10 left-1/2 transform -translate-x-1/2 bg-slate-800 text-white text-xs py-1 px-2 rounded opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none whitespace-nowrap z-10 shadow-lg">
                          {unit.resident_name || 'Resident'}
                        </div>
                      )}
                    </button>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}
