import { useState } from 'react';
import { X, UserPlus, Home, User, Mail, Phone, Calendar, Shield } from 'lucide-react';

export default function OnboardResidentModal({ isOpen, onClose, onSubmit, vacantUnits, preselectedUnit }) {
  const [formData, setFormData] = useState({
    unit_id: preselectedUnit?.unit_id || '',
    name: '',
    email: '',
    phone: '',
    type: 'TENANT',
    area: preselectedUnit?.area || '1000',
    move_in_date: new Date().toISOString().split('T')[0],
    emergency_contact: ''
  });
  const [submitting, setSubmitting] = useState(false);

  if (!isOpen) return null;

  const handleSubmit = async (e) => {
    e.preventDefault();
    setSubmitting(true);
    await onSubmit(formData);
    setSubmitting(false);
  };

  return (
    <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-sm z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg border border-slate-100 overflow-hidden animate-in fade-in zoom-in-95 duration-200">
        
        {/* Modal Header */}
        <div className="flex justify-between items-center px-6 py-5 border-b border-slate-100 bg-slate-50">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-teal-100 text-teal-700 rounded-xl">
              <UserPlus className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-lg font-bold text-slate-800">Onboard New Resident</h2>
              <p className="text-xs text-slate-500">Assign a tenant or owner to a flat</p>
            </div>
          </div>
          <button 
            onClick={onClose} 
            className="p-1.5 text-slate-400 hover:text-slate-600 hover:bg-slate-200 rounded-full transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Modal Form */}
        <form onSubmit={handleSubmit} className="p-6 space-y-4 max-h-[80vh] overflow-y-auto">
          
          {/* Unit Selection & Type */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-bold uppercase tracking-wider text-slate-500 mb-1.5 flex items-center gap-1">
                <Home className="w-3.5 h-3.5 text-slate-400" /> Target Flat *
              </label>
              <select
                required
                value={formData.unit_id}
                onChange={(e) => setFormData({ ...formData, unit_id: e.target.value })}
                className="w-full border border-slate-300 rounded-xl p-2.5 outline-none focus:border-teal-500 focus:ring-1 focus:ring-teal-500 text-sm font-semibold text-slate-800 bg-white"
              >
                <option value="">Select Vacant Flat</option>
                {vacantUnits?.map(u => (
                  <option key={u.unit_id} value={u.unit_id}>
                    Flat {u.number} (Floor {u.floor})
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-xs font-bold uppercase tracking-wider text-slate-500 mb-1.5">
                Occupancy Type *
              </label>
              <select
                value={formData.type}
                onChange={(e) => setFormData({ ...formData, type: e.target.value })}
                className="w-full border border-slate-300 rounded-xl p-2.5 outline-none focus:border-teal-500 focus:ring-1 focus:ring-teal-500 text-sm font-semibold text-slate-800 bg-white"
              >
                <option value="TENANT">Tenant (Rental)</option>
                <option value="OWNER">Owner (Permanent)</option>
              </select>
            </div>
          </div>

          {/* Resident Name & Email */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-bold uppercase tracking-wider text-slate-500 mb-1.5 flex items-center gap-1">
                <User className="w-3.5 h-3.5 text-slate-400" /> Full Name *
              </label>
              <input
                required
                type="text"
                placeholder="e.g. Rahul Sharma"
                value={formData.name}
                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                className="w-full border border-slate-300 rounded-xl p-2.5 outline-none focus:border-teal-500 focus:ring-1 focus:ring-teal-500 text-sm"
              />
            </div>

            <div>
              <label className="block text-xs font-bold uppercase tracking-wider text-slate-500 mb-1.5 flex items-center gap-1">
                <Mail className="w-3.5 h-3.5 text-slate-400" /> Email (Login ID) *
              </label>
              <input
                required
                type="email"
                placeholder="e.g. rahul@example.com"
                value={formData.email}
                onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                className="w-full border border-slate-300 rounded-xl p-2.5 outline-none focus:border-teal-500 focus:ring-1 focus:ring-teal-500 text-sm"
              />
            </div>
          </div>

          {/* Phone Number & Emergency Contact */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-bold uppercase tracking-wider text-slate-500 mb-1.5 flex items-center gap-1">
                <Phone className="w-3.5 h-3.5 text-slate-400" /> Mobile Number
              </label>
              <input
                type="tel"
                placeholder="e.g. +91 98765 43210"
                value={formData.phone}
                onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                className="w-full border border-slate-300 rounded-xl p-2.5 outline-none focus:border-teal-500 focus:ring-1 focus:ring-teal-500 text-sm"
              />
            </div>

            <div>
              <label className="block text-xs font-bold uppercase tracking-wider text-slate-500 mb-1.5 flex items-center gap-1">
                <Shield className="w-3.5 h-3.5 text-slate-400" /> Emergency Contact
              </label>
              <input
                type="text"
                placeholder="e.g. Father: 9811122334"
                value={formData.emergency_contact}
                onChange={(e) => setFormData({ ...formData, emergency_contact: e.target.value })}
                className="w-full border border-slate-300 rounded-xl p-2.5 outline-none focus:border-teal-500 focus:ring-1 focus:ring-teal-500 text-sm"
              />
            </div>
          </div>

          {/* Move-in Date & Area */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-bold uppercase tracking-wider text-slate-500 mb-1.5 flex items-center gap-1">
                <Calendar className="w-3.5 h-3.5 text-slate-400" /> Move-In Date
              </label>
              <input
                type="date"
                value={formData.move_in_date}
                onChange={(e) => setFormData({ ...formData, move_in_date: e.target.value })}
                className="w-full border border-slate-300 rounded-xl p-2.5 outline-none focus:border-teal-500 focus:ring-1 focus:ring-teal-500 text-sm"
              />
            </div>

            <div>
              <label className="block text-xs font-bold uppercase tracking-wider text-slate-500 mb-1.5">
                Area (Sq. Ft)
              </label>
              <input
                type="number"
                placeholder="1000"
                value={formData.area}
                onChange={(e) => setFormData({ ...formData, area: e.target.value })}
                className="w-full border border-slate-300 rounded-xl p-2.5 outline-none focus:border-teal-500 focus:ring-1 focus:ring-teal-500 text-sm"
              />
            </div>
          </div>

          {/* Action Buttons */}
          <div className="pt-4 flex items-center justify-end gap-3 border-t border-slate-100 mt-6">
            <button
              type="button"
              onClick={onClose}
              className="px-5 py-2.5 text-sm font-semibold text-slate-600 bg-slate-100 rounded-xl hover:bg-slate-200 transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={submitting}
              className="px-6 py-2.5 text-sm font-bold text-white bg-teal-600 rounded-xl hover:bg-teal-700 transition-colors shadow-md disabled:opacity-50"
            >
              {submitting ? 'Assigning...' : 'Onboard Resident'}
            </button>
          </div>
        </form>

      </div>
    </div>
  );
}
