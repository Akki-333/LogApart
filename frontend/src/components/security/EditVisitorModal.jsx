import { useState, useEffect, useId } from 'react';
import { X, Edit3, Home, User, Phone, Car } from 'lucide-react';
import useDialog from '../common/useDialog';

export default function EditVisitorModal({ isOpen, onClose, onSubmit, visitor, units }) {
  const { dialogRef, dialogProps, titleId } = useDialog(isOpen, onClose);
  const fieldId = useId();
  const [formData, setFormData] = useState({
    unit_id: '',
    visitor_name: '',
    visitor_phone: '',
    purpose: 'GUEST',
    company: '',
    vehicle_type: 'NONE',
    vehicle_number: ''
  });
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (visitor) {
      setFormData({
        unit_id: visitor.unit_id || '',
        visitor_name: visitor.visitor_name || '',
        visitor_phone: visitor.visitor_phone || '',
        purpose: visitor.purpose || 'GUEST',
        company: visitor.company || '',
        vehicle_type: visitor.vehicle_type || 'NONE',
        vehicle_number: visitor.vehicle_number || ''
      });
    }
  }, [visitor]);

  if (!isOpen || !visitor) return null;

  const handleSubmit = async (e) => {
    e.preventDefault();
    setSubmitting(true);
    await onSubmit(visitor.id, formData);
    setSubmitting(false);
  };

  return (
    <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
      <div ref={dialogRef} {...dialogProps} className="bg-white rounded-2xl shadow-2xl w-full max-w-lg border border-slate-200 overflow-hidden animate-in fade-in zoom-in-95 duration-200">
        
        {/* Header */}
        <div className="flex justify-between items-center px-6 py-5 border-b border-slate-100 bg-slate-50">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-blue-100 text-blue-800 rounded-xl">
              <Edit3 className="w-5 h-5" />
            </div>
            <div>
              <h2 id={titleId} className="text-lg font-bold text-slate-800">Edit Gate Entry</h2>
              <p className="text-xs text-slate-500">Correct visitor information or home details</p>
            </div>
          </div>
          <button 
            onClick={onClose} 
            className="p-1.5 text-slate-400 hover:text-slate-600 hover:bg-slate-200 rounded-full transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-4 max-h-[80vh] overflow-y-auto">
          
          {/* Visiting Home & Purpose */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-bold uppercase tracking-wider text-slate-500 mb-1.5 flex items-center gap-1" htmlFor={`${fieldId}-home-classname-w-3-5-h-3-5-t`}>
                <Home className="w-3.5 h-3.5 text-slate-400" /> Visiting Home *
              </label>
              <select id={`${fieldId}-home-classname-w-3-5-h-3-5-t`}
                required
                value={formData.unit_id}
                onChange={(e) => setFormData({ ...formData, unit_id: e.target.value })}
                className="w-full border border-slate-300 rounded-xl p-2.5 outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 text-sm font-semibold text-slate-800 bg-white"
              >
                <option value="">Select Home</option>
                {units?.map(unit => (
                  <option key={unit.unit_id} value={unit.unit_id}>
                    Home {unit.number} (Floor {unit.floor})
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-xs font-bold uppercase tracking-wider text-slate-500 mb-1.5" htmlFor={`${fieldId}-purpose`}>
                Purpose
              </label>
              <select id={`${fieldId}-purpose`}
                value={formData.purpose}
                onChange={(e) => setFormData({ ...formData, purpose: e.target.value })}
                className="w-full border border-slate-300 rounded-xl p-2.5 outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 text-sm font-semibold text-slate-800 bg-white"
              >
                <option value="GUEST">Guest / Relative</option>
                <option value="DELIVERY">Delivery</option>
                <option value="SERVICE">Service (Plumber / Electrician)</option>
                <option value="MAID">Daily Helper / Maid</option>
                <option value="OTHER">Other</option>
              </select>
            </div>
          </div>

          {/* Visitor Name & Mobile */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-bold uppercase tracking-wider text-slate-500 mb-1.5 flex items-center gap-1" htmlFor={`${fieldId}-user-classname-w-3-5-h-3-5-t`}>
                <User className="w-3.5 h-3.5 text-slate-400" /> Visitor / Driver Name *
              </label>
              <input id={`${fieldId}-user-classname-w-3-5-h-3-5-t`}
                required
                type="text"
                value={formData.visitor_name}
                onChange={(e) => setFormData({ ...formData, visitor_name: e.target.value })}
                className="w-full border border-slate-300 rounded-xl p-2.5 outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 text-sm font-semibold text-slate-800"
              />
            </div>

            <div>
              <label className="block text-xs font-bold uppercase tracking-wider text-slate-500 mb-1.5 flex items-center gap-1" htmlFor={`${fieldId}-phone-classname-w-3-5-h-3-5-`}>
                <Phone className="w-3.5 h-3.5 text-slate-400" /> Mobile Number
              </label>
              <input id={`${fieldId}-phone-classname-w-3-5-h-3-5-`}
                type="tel"
                value={formData.visitor_phone}
                onChange={(e) => setFormData({ ...formData, visitor_phone: e.target.value })}
                className="w-full border border-slate-300 rounded-xl p-2.5 outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 text-sm"
              />
            </div>
          </div>

          {/* Vehicle Type & Number */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 border-t border-slate-100 pt-3">
            <div>
              <label className="block text-xs font-bold uppercase tracking-wider text-slate-500 mb-1.5" htmlFor={`${fieldId}-vehicle-type`}>
                Vehicle Type
              </label>
              <select id={`${fieldId}-vehicle-type`}
                value={formData.vehicle_type}
                onChange={(e) => setFormData({ ...formData, vehicle_type: e.target.value })}
                className="w-full border border-slate-300 rounded-xl p-2.5 outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 text-sm font-semibold text-slate-800 bg-white"
              >
                <option value="NONE">None (Walk-in)</option>
                <option value="BIKE">Two-Wheeler</option>
                <option value="CAR">Car / 4-Wheeler</option>
                <option value="AUTO">Auto Rickshaw</option>
                <option value="VAN">Delivery Van / Truck</option>
              </select>
            </div>

            <div>
              <label className="block text-xs font-bold uppercase tracking-wider text-slate-500 mb-1.5" htmlFor={`${fieldId}-vehicle-plate-number`}>
                Vehicle Plate Number
              </label>
              <input id={`${fieldId}-vehicle-plate-number`}
                type="text"
                value={formData.vehicle_number}
                onChange={(e) => setFormData({ ...formData, vehicle_number: e.target.value.toUpperCase() })}
                className="w-full border border-slate-300 rounded-xl p-2.5 outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 text-sm uppercase"
              />
            </div>
          </div>

          {/* Actions */}
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
              className="px-6 py-2.5 text-sm font-bold text-white bg-blue-600 rounded-xl hover:bg-blue-700 transition-colors shadow-md disabled:opacity-50"
            >
              {submitting ? 'Saving...' : 'Update Entry'}
            </button>
          </div>
        </form>

      </div>
    </div>
  );
}
