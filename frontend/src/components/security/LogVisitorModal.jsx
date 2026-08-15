import { useState } from 'react';
import { X } from 'lucide-react';

export default function LogVisitorModal({ isOpen, onClose, onSubmit, units }) {
  const [formData, setFormData] = useState({
    unit_id: '',
    visitor_name: '',
    visitor_phone: '',
    purpose: 'GUEST'
  });

  if (!isOpen) return null;

  const handleSubmit = (e) => {
    e.preventDefault();
    onSubmit(formData);
    setFormData({ unit_id: '', visitor_name: '', visitor_phone: '', purpose: 'GUEST' });
  };

  return (
    <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-sm z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-md border border-slate-100 overflow-hidden">
        <div className="flex justify-between items-center p-6 border-b border-slate-100 bg-slate-50">
          <h2 className="text-lg font-bold text-slate-800">New Gate Entry</h2>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600 transition-colors">
            <X className="w-5 h-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Visiting Flat</label>
            <select
              required
              value={formData.unit_id}
              onChange={(e) => setFormData({...formData, unit_id: e.target.value})}
              className="w-full border border-slate-300 rounded-lg p-2.5 outline-none focus:border-teal-500 focus:ring-1 focus:ring-teal-500 text-sm"
            >
              <option value="">Select Flat</option>
              {units?.map(unit => (
                <option key={unit.unit_id} value={unit.unit_id}>Flat {unit.number}</option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Visitor Name</label>
            <input
              required
              type="text"
              placeholder="e.g. John Doe"
              value={formData.visitor_name}
              onChange={(e) => setFormData({...formData, visitor_name: e.target.value})}
              className="w-full border border-slate-300 rounded-lg p-2.5 outline-none focus:border-teal-500 focus:ring-1 focus:ring-teal-500 text-sm"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Phone Number</label>
            <input
              type="tel"
              placeholder="e.g. 9876543210"
              value={formData.visitor_phone}
              onChange={(e) => setFormData({...formData, visitor_phone: e.target.value})}
              className="w-full border border-slate-300 rounded-lg p-2.5 outline-none focus:border-teal-500 focus:ring-1 focus:ring-teal-500 text-sm"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Purpose of Visit</label>
            <select
              value={formData.purpose}
              onChange={(e) => setFormData({...formData, purpose: e.target.value})}
              className="w-full border border-slate-300 rounded-lg p-2.5 outline-none focus:border-teal-500 focus:ring-1 focus:ring-teal-500 text-sm"
            >
              <option value="GUEST">Guest / Relative</option>
              <option value="DELIVERY">Delivery (Amazon, Swiggy)</option>
              <option value="SERVICE">Service (Plumber, AC Repair)</option>
              <option value="MAID">Daily Helper / Maid</option>
              <option value="OTHER">Other</option>
            </select>
          </div>

          <div className="pt-4 flex justify-end gap-3 border-t border-slate-100 mt-6">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-sm font-medium text-slate-600 bg-white border border-slate-300 rounded-lg hover:bg-slate-50 transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              className="px-4 py-2 text-sm font-medium text-white bg-teal-600 rounded-lg hover:bg-teal-700 transition-colors shadow-sm"
            >
              Log Entry
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
