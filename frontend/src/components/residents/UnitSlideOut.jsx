import { X, User, Calendar, Phone, Home } from 'lucide-react';

export default function UnitSlideOut({ unit, isOpen, onClose }) {
  if (!isOpen || !unit) return null;

  return (
    <>
      {/* Overlay */}
      <div 
        className="fixed inset-0 bg-slate-900/20 backdrop-blur-sm z-40 transition-opacity"
        onClick={onClose}
      />
      
      {/* Slide Panel */}
      <div className="fixed inset-y-0 right-0 w-full max-w-sm bg-white shadow-2xl z-50 transform transition-transform duration-300 flex flex-col border-l border-slate-200">
        
        {/* Header */}
        <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between bg-slate-50">
          <div className="flex items-center space-x-3">
            <div className={`p-2 rounded-lg ${unit.is_occupied ? 'bg-teal-100 text-teal-700' : 'bg-slate-200 text-slate-500'}`}>
              <Home className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-lg font-bold text-slate-800">Flat {unit.number}</h2>
              <p className="text-xs font-medium text-slate-500">
                {unit.block_name ? `Block ${unit.block_name} • ` : ''}Floor {unit.floor}
              </p>
            </div>
          </div>
          <button 
            onClick={onClose}
            className="p-2 text-slate-400 hover:text-slate-600 hover:bg-slate-200 rounded-full transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-6 space-y-6">
          
          {/* Status Badge */}
          <div>
            <span className={`inline-flex items-center px-2.5 py-1 rounded-full text-xs font-medium ${
              unit.is_occupied 
                ? 'bg-teal-100 text-teal-800 border border-teal-200'
                : 'bg-slate-100 text-slate-600 border border-slate-200'
            }`}>
              <span className={`w-1.5 h-1.5 rounded-full mr-2 ${unit.is_occupied ? 'bg-teal-500' : 'bg-slate-400'}`}></span>
              {unit.is_occupied ? 'Occupied' : 'Vacant'}
            </span>
          </div>

          {/* Unit Details */}
          <div className="bg-slate-50 rounded-xl p-4 border border-slate-100 space-y-3">
            <h3 className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-2">Unit Details</h3>
            <div className="flex justify-between text-sm">
              <span className="text-slate-500">Area (Sq.ft)</span>
              <span className="font-medium text-slate-800">{unit.area}</span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-slate-500">Type</span>
              <span className="font-medium text-slate-800">{unit.type || 'N/A'}</span>
            </div>
          </div>

          {/* Resident Details */}
          {unit.is_occupied ? (
            <div className="space-y-4">
              <h3 className="text-xs font-bold text-slate-400 uppercase tracking-wider">Current Resident</h3>
              
              <div className="flex items-center space-x-3 text-sm">
                <User className="w-4 h-4 text-slate-400" />
                <span className="font-medium text-slate-800">{unit.resident_name || 'Unknown'}</span>
              </div>
              
              <div className="flex items-center space-x-3 text-sm">
                <Phone className="w-4 h-4 text-slate-400" />
                <span className="text-slate-600">{unit.resident_phone || 'Not provided'}</span>
              </div>
              
              <div className="flex items-center space-x-3 text-sm">
                <Calendar className="w-4 h-4 text-slate-400" />
                <span className="text-slate-600">
                  Moved in: {unit.move_in_date ? new Date(unit.move_in_date).toLocaleDateString() : 'Unknown'}
                </span>
              </div>
            </div>
          ) : (
            <div className="text-center py-8">
              <div className="w-12 h-12 bg-slate-100 rounded-full flex items-center justify-center mx-auto mb-3">
                <User className="w-6 h-6 text-slate-300" />
              </div>
              <p className="text-sm text-slate-500">This unit is currently vacant.</p>
              <button className="mt-4 px-4 py-2 bg-teal-600 text-white text-sm font-medium rounded-lg hover:bg-teal-700 transition-colors shadow-sm">
                Assign Resident
              </button>
            </div>
          )}
        </div>

        {/* Footer Actions */}
        {unit.is_occupied && (
          <div className="p-4 border-t border-slate-100 bg-slate-50 flex gap-3">
            <button className="flex-1 px-4 py-2 bg-white border border-slate-200 text-slate-700 text-sm font-medium rounded-lg hover:bg-slate-50 transition-colors shadow-sm">
              View Dues
            </button>
            <button className="flex-1 px-4 py-2 bg-white border border-slate-200 text-rose-600 text-sm font-medium rounded-lg hover:bg-rose-50 transition-colors shadow-sm">
              Generate NOC
            </button>
          </div>
        )}
      </div>
    </>
  );
}
