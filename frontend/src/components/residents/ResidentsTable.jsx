import { User, Phone, Calendar, Edit3, UserPlus, LogOut, Eye } from 'lucide-react';

export default function ResidentsTable({ 
  units, 
  onUnitClick, 
  onEditClick, 
  onVacateClick, 
  onOnboardClick 
}) {
  if (!units || units.length === 0) {
    return (
      <div className="bg-white rounded-2xl border border-slate-200 p-12 text-center text-slate-400">
        <User className="w-8 h-8 mx-auto mb-2 text-slate-300" />
        <p className="text-sm font-semibold">No flats or residents match your search filter.</p>
      </div>
    );
  }

  return (
    <div className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden">
      <div className="overflow-x-auto">
        <table className="w-full text-left text-sm text-slate-600">
          <thead className="text-xs uppercase bg-slate-50 text-slate-500 font-bold border-b border-slate-200">
            <tr>
              <th className="px-6 py-4">Unit #</th>
              <th className="px-6 py-4">Floor</th>
              <th className="px-6 py-4">Status</th>
              <th className="px-6 py-4">Type</th>
              <th className="px-6 py-4">Resident</th>
              <th className="px-6 py-4">Contact</th>
              <th className="px-6 py-4">Moved In</th>
              <th className="px-6 py-4 text-right">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100 font-medium">
            {units.map((unit) => (
              <tr 
                key={unit.unit_id} 
                className="hover:bg-slate-50/80 transition-colors group cursor-pointer"
                onClick={() => onUnitClick(unit)}
              >
                {/* Flat Number */}
                <td className="px-6 py-4">
                  <span className="font-extrabold text-slate-900 text-base">
                    {unit.number}
                  </span>
                </td>

                {/* Floor */}
                <td className="px-6 py-4 text-slate-500 text-xs">
                  Floor {unit.floor}
                </td>

                {/* Occupancy Status */}
                <td className="px-6 py-4">
                  <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-bold ${
                    unit.is_occupied 
                      ? 'bg-teal-50 text-teal-700 border border-teal-200'
                      : 'bg-slate-100 text-slate-500 border border-slate-200'
                  }`}>
                    <span className={`w-1.5 h-1.5 rounded-full mr-1.5 ${unit.is_occupied ? 'bg-teal-500' : 'bg-slate-400'}`}></span>
                    {unit.is_occupied ? 'Occupied' : 'Vacant'}
                  </span>
                </td>

                {/* Type */}
                <td className="px-6 py-4">
                  {unit.is_occupied ? (
                    <span className={`text-xs font-bold px-2 py-0.5 rounded ${
                      unit.type === 'OWNER' ? 'bg-indigo-50 text-indigo-700' : 'bg-amber-50 text-amber-700'
                    }`}>
                      {unit.type || 'TENANT'}
                    </span>
                  ) : (
                    <span className="text-slate-400 text-xs">—</span>
                  )}
                </td>

                {/* Resident Name & Email */}
                <td className="px-6 py-4">
                  {unit.is_occupied ? (
                    <div>
                      <div className="font-bold text-slate-800">{unit.resident_name || 'Resident'}</div>
                      <div className="text-xs text-slate-400 font-normal">{unit.resident_email || 'No email'}</div>
                    </div>
                  ) : (
                    <span className="text-slate-400 text-xs italic">Unassigned</span>
                  )}
                </td>

                {/* Phone */}
                <td className="px-6 py-4">
                  {unit.is_occupied ? (
                    <span className="text-xs text-slate-600 flex items-center gap-1">
                      <Phone className="w-3 h-3 text-slate-400" />
                      {unit.resident_phone || 'N/A'}
                    </span>
                  ) : (
                    <span className="text-slate-400 text-xs">—</span>
                  )}
                </td>

                {/* Move in date */}
                <td className="px-6 py-4 text-xs text-slate-500">
                  {unit.move_in_date ? new Date(unit.move_in_date).toLocaleDateString() : '—'}
                </td>

                {/* Actions */}
                <td className="px-6 py-4 text-right space-x-1" onClick={(e) => e.stopPropagation()}>
                  {unit.is_occupied ? (
                    <div className="flex items-center justify-end gap-1.5">
                      <button
                        onClick={() => onEditClick(unit)}
                        title="Edit Details"
                        className="p-1.5 text-slate-500 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-colors"
                      >
                        <Edit3 className="w-4 h-4" />
                      </button>
                      <button
                        onClick={() => onVacateClick(unit)}
                        title="Vacate & NOC"
                        className="p-1.5 text-slate-500 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition-colors"
                      >
                        <LogOut className="w-4 h-4" />
                      </button>
                    </div>
                  ) : (
                    <button
                      onClick={() => onOnboardClick(unit)}
                      className="inline-flex items-center px-2.5 py-1 bg-teal-50 hover:bg-teal-100 text-teal-700 text-xs font-bold rounded-lg transition-colors border border-teal-200"
                    >
                      <UserPlus className="w-3.5 h-3.5 mr-1" /> Onboard
                    </button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
