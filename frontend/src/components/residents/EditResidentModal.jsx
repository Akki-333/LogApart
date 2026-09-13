import { useState, useEffect, useId } from 'react';
import { X, Edit3, User, Phone, Shield } from 'lucide-react';
import useDialog from '../common/useDialog';

export default function EditResidentModal({ isOpen, onClose, onSubmit, unit }) {
  const { dialogRef, dialogProps, titleId } = useDialog(isOpen, onClose);
  const fieldId = useId();
  const [formData, setFormData] = useState({
    name: '',
    phone: '',
    emergency_contact: '',
    type: 'TENANT',
    area: ''
  });
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (unit) {
      setFormData({
        name: unit.resident_name || '',
        phone: unit.resident_phone || '',
        emergency_contact: unit.emergency_contact || '',
        type: unit.type || 'TENANT',
        area: unit.area || '1000'
      });
    }
  }, [unit]);

  if (!isOpen || !unit) return null;

  const handleSubmit = async (e) => {
    e.preventDefault();
    setSubmitting(true);
    await onSubmit(unit.unit_id, formData);
    setSubmitting(false);
  };

  return (
    <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-sm z-50 flex items-center justify-center p-4">
      <div ref={dialogRef} {...dialogProps} className="bg-white rounded-2xl shadow-2xl w-full max-w-md border border-slate-100 overflow-hidden animate-in fade-in zoom-in-95 duration-200">
        
        {/* Modal Header */}
        <div className="flex justify-between items-center px-6 py-5 border-b border-slate-100 bg-slate-50">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-blue-100 text-blue-700 rounded-xl">
              <Edit3 className="w-5 h-5" />
            </div>
            <div>
              <h2 id={titleId} className="text-lg font-bold text-slate-800">Edit Resident Info</h2>
              <p className="text-xs text-slate-500">Updating details for Home {unit.number}</p>
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
        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          
          <div>
            <label className="block text-xs font-bold uppercase tracking-wider text-slate-500 mb-1.5 flex items-center gap-1" htmlFor={`${fieldId}-user-classname-w-3-5-h-3-5-t`}>
              <User className="w-3.5 h-3.5 text-slate-400" /> Resident Full Name
            </label>
            <input id={`${fieldId}-user-classname-w-3-5-h-3-5-t`}
              required
              type="text"
              value={formData.name}
              onChange={(e) => setFormData({ ...formData, name: e.target.value })}
              className="w-full border border-slate-300 rounded-xl p-2.5 outline-none focus:border-teal-500 focus:ring-1 focus:ring-teal-500 text-sm font-semibold text-slate-800"
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-bold uppercase tracking-wider text-slate-500 mb-1.5 flex items-center gap-1" htmlFor={`${fieldId}-phone-classname-w-3-5-h-3-5-`}>
                <Phone className="w-3.5 h-3.5 text-slate-400" /> Phone
              </label>
              <input id={`${fieldId}-phone-classname-w-3-5-h-3-5-`}
                type="tel"
                value={formData.phone}
                onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                className="w-full border border-slate-300 rounded-xl p-2.5 outline-none focus:border-teal-500 focus:ring-1 focus:ring-teal-500 text-sm"
              />
            </div>

            <div>
              <label className="block text-xs font-bold uppercase tracking-wider text-slate-500 mb-1.5" htmlFor={`${fieldId}-occupancy-type`}>
                Occupancy Type
              </label>
              <select id={`${fieldId}-occupancy-type`}
                value={formData.type}
                onChange={(e) => setFormData({ ...formData, type: e.target.value })}
                className="w-full border border-slate-300 rounded-xl p-2.5 outline-none focus:border-teal-500 focus:ring-1 focus:ring-teal-500 text-sm font-semibold text-slate-800 bg-white"
              >
                <option value="TENANT">Tenant</option>
                <option value="OWNER">Owner</option>
              </select>
            </div>
          </div>

          <div>
            <label className="block text-xs font-bold uppercase tracking-wider text-slate-500 mb-1.5 flex items-center gap-1" htmlFor={`${fieldId}-shield-classname-w-3-5-h-3-5`}>
              <Shield className="w-3.5 h-3.5 text-slate-400" /> Emergency Contact
            </label>
            <input id={`${fieldId}-shield-classname-w-3-5-h-3-5`}
              type="text"
              value={formData.emergency_contact}
              onChange={(e) => setFormData({ ...formData, emergency_contact: e.target.value })}
              className="w-full border border-slate-300 rounded-xl p-2.5 outline-none focus:border-teal-500 focus:ring-1 focus:ring-teal-500 text-sm"
            />
          </div>

          <div>
            <label className="block text-xs font-bold uppercase tracking-wider text-slate-500 mb-1.5" htmlFor={`${fieldId}-area-sq-ft`}>
              Area (Sq. Ft)
            </label>
            <input id={`${fieldId}-area-sq-ft`}
              type="number"
              value={formData.area}
              onChange={(e) => setFormData({ ...formData, area: e.target.value })}
              className="w-full border border-slate-300 rounded-xl p-2.5 outline-none focus:border-teal-500 focus:ring-1 focus:ring-teal-500 text-sm"
            />
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
              className="px-6 py-2.5 text-sm font-bold text-white bg-blue-600 rounded-xl hover:bg-blue-700 transition-colors shadow-md disabled:opacity-50"
            >
              {submitting ? 'Saving...' : 'Save Changes'}
            </button>
          </div>
        </form>

      </div>
    </div>
  );
}
