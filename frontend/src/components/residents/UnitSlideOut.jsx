import { X, User, Calendar, Phone, Home, Shield, Edit3, LogOut, UserPlus } from 'lucide-react';

export default function UnitSlideOut({ 
  unit, 
  isOpen, 
  onClose,
  onOnboard,
  onEdit,
  onVacate
}) {
  if (!isOpen || !unit) return null;

  return (
    <>
      {/* Overlay */}
      <div 
        className="fixed inset-0 bg-slate-900/30 backdrop-blur-xs z-40 transition-opacity"
        onClick={onClose}
      />
      
      {/* Slide Panel */}
      <div className="fixed inset-y-0 right-0 w-full max-w-sm bg-white shadow-2xl z-50 transform transition-transform duration-300 flex flex-col border-l border-slate-200">
        
        {/* Header */}
        <div className="px-6 py-5 border-b border-slate-100 flex items-center justify-between bg-slate-50">
          <div className="flex items-center space-x-3">
            <div className={`p-2.5 rounded-xl ${unit.is_occupied ? 'bg-teal-100 text-teal-700' : 'bg-slate-200 text-slate-500'}`}>
              <Home className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-xl font-extrabold text-slate-900">Flat {unit.number}</h2>
              <p className="text-xs font-semibold text-slate-500">
                {unit.block_name ? `Block ${unit.block_name} • ` : ''}Floor {unit.floor}
              </p>
            </div>
          </div>
          <button 
            onClick={onClose}
            className="p-1.5 text-slate-400 hover:text-slate-600 hover:bg-slate-200 rounded-full transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-6 space-y-6">
          
          {/* Status & Type Badges */}
          <div className="flex items-center gap-2">
            <span className={`inline-flex items-center px-3 py-1 rounded-full text-xs font-bold ${
              unit.is_occupied 
                ? 'bg-teal-50 text-teal-800 border border-teal-200'
                : 'bg-slate-100 text-slate-600 border border-slate-200'
            }`}>
              <span className={`w-2 h-2 rounded-full mr-2 ${unit.is_occupied ? 'bg-teal-500' : 'bg-slate-400'}`}></span>
              {unit.is_occupied ? 'Occupied' : 'Vacant Flat'}
            </span>

            {unit.is_occupied && (
              <span className={`text-xs font-bold px-2.5 py-1 rounded-full ${
                unit.type === 'OWNER' ? 'bg-indigo-50 text-indigo-700 border border-indigo-200' : 'bg-amber-50 text-amber-700 border border-amber-200'
              }`}>
                {unit.type || 'TENANT'}
              </span>
            )}
          </div>

          {/* Unit Specifications */}
          <div className="bg-slate-50 rounded-2xl p-4 border border-slate-100 space-y-2.5 text-xs">
            <h3 className="font-bold text-slate-400 uppercase tracking-wider mb-2">Flat Specifications</h3>
            <div className="flex justify-between py-1 border-b border-slate-100/80">
              <span className="text-slate-500">Total Carpet Area</span>
              <span className="font-bold text-slate-800">{unit.area || '1000'} Sq. Ft</span>
            </div>
            <div className="flex justify-between py-1 border-b border-slate-100/80">
              <span className="text-slate-500">Floor Level</span>
              <span className="font-bold text-slate-800">Floor {unit.floor}</span>
            </div>
            <div className="flex justify-between py-1">
              <span className="text-slate-500">Maintenance Tier</span>
              <span className="font-bold text-teal-700">Standard Tier A</span>
            </div>
          </div>

          {/* Resident Details */}
          {unit.is_occupied ? (
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <h3 className="text-xs font-bold text-slate-400 uppercase tracking-wider">Primary Resident</h3>
                <button
                  onClick={() => {
                    onClose();
                    onEdit(unit);
                  }}
                  className="text-xs font-bold text-blue-600 hover:text-blue-700 flex items-center gap-1 hover:underline"
                >
                  <Edit3 className="w-3.5 h-3.5" /> Edit Info
                </button>
              </div>
              
              <div className="p-4 bg-white border border-slate-200 rounded-2xl space-y-3 text-xs shadow-xs">
                <div className="flex items-center gap-2.5">
                  <User className="w-4 h-4 text-slate-400 shrink-0" />
                  <div>
                    <span className="text-slate-400 block text-[10px] uppercase">Name</span>
                    <span className="font-bold text-slate-800 text-sm">{unit.resident_name || 'Resident'}</span>
                  </div>
                </div>

                <div className="flex items-center gap-2.5 pt-2 border-t border-slate-100">
                  <Phone className="w-4 h-4 text-slate-400 shrink-0" />
                  <div>
                    <span className="text-slate-400 block text-[10px] uppercase">Phone</span>
                    <span className="font-semibold text-slate-700">{unit.resident_phone || 'Not provided'}</span>
                  </div>
                </div>

                <div className="flex items-center gap-2.5 pt-2 border-t border-slate-100">
                  <Calendar className="w-4 h-4 text-slate-400 shrink-0" />
                  <div>
                    <span className="text-slate-400 block text-[10px] uppercase">Move-In Date</span>
                    <span className="font-semibold text-slate-700">
                      {unit.move_in_date ? new Date(unit.move_in_date).toLocaleDateString() : 'N/A'}
                    </span>
                  </div>
                </div>

                {unit.emergency_contact && (
                  <div className="flex items-center gap-2.5 pt-2 border-t border-slate-100">
                    <Shield className="w-4 h-4 text-slate-400 shrink-0" />
                    <div>
                      <span className="text-slate-400 block text-[10px] uppercase">Emergency Contact</span>
                      <span className="font-semibold text-slate-700">{unit.emergency_contact}</span>
                    </div>
                  </div>
                )}
              </div>
            </div>
          ) : (
            <div className="text-center py-8 bg-slate-50/50 rounded-2xl border-2 border-dashed border-slate-200 p-6">
              <div className="w-12 h-12 bg-slate-100 rounded-full flex items-center justify-center mx-auto mb-3">
                <User className="w-6 h-6 text-slate-400" />
              </div>
              <h4 className="text-sm font-bold text-slate-800">Flat is Currently Vacant</h4>
              <p className="text-xs text-slate-500 mt-1">Assign an owner or tenant to start tracking occupancy.</p>
              
              <button 
                onClick={() => {
                  onClose();
                  onOnboard(unit);
                }}
                className="mt-4 w-full py-2.5 bg-teal-600 text-white text-xs font-bold rounded-xl hover:bg-teal-700 transition-colors shadow-sm flex items-center justify-center gap-1.5"
              >
                <UserPlus className="w-4 h-4" /> Onboard Resident Now
              </button>
            </div>
          )}
        </div>

        {/* Footer Actions */}
        {unit.is_occupied && (
          <div className="p-4 border-t border-slate-100 bg-slate-50 flex gap-2.5">
            <button 
              onClick={() => {
                onClose();
                onEdit(unit);
              }}
              className="flex-1 px-3 py-2.5 bg-white border border-slate-200 text-slate-700 text-xs font-bold rounded-xl hover:bg-slate-100 transition-colors shadow-xs flex items-center justify-center gap-1.5"
            >
              <Edit3 className="w-3.5 h-3.5" /> Edit
            </button>
            
            <button 
              onClick={() => {
                onClose();
                onVacate(unit);
              }}
              className="flex-1 px-3 py-2.5 bg-white border border-rose-200 text-rose-600 text-xs font-bold rounded-xl hover:bg-rose-50 transition-colors shadow-xs flex items-center justify-center gap-1.5"
            >
              <LogOut className="w-3.5 h-3.5" /> Vacate & NOC
            </button>
          </div>
        )}
      </div>
    </>
  );
}
