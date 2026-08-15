import { useState } from 'react';
import { X } from 'lucide-react';

export default function NewTicketModal({ isOpen, onClose, onSubmit, units }) {
  const [formData, setFormData] = useState({
    unit_id: '',
    title: '',
    description: '',
    category: 'Plumbing',
    priority: 'MEDIUM'
  });

  if (!isOpen) return null;

  const handleSubmit = (e) => {
    e.preventDefault();
    onSubmit(formData);
    setFormData({ unit_id: '', title: '', description: '', category: 'Plumbing', priority: 'MEDIUM' });
  };

  return (
    <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-sm z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-lg border border-slate-100 overflow-hidden">
        <div className="flex justify-between items-center p-6 border-b border-slate-100 bg-slate-50">
          <h2 className="text-lg font-bold text-slate-800">Log Structural Issue</h2>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600 transition-colors">
            <X className="w-5 h-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Affected Unit / Area</label>
            <select
              required
              value={formData.unit_id}
              onChange={(e) => setFormData({...formData, unit_id: e.target.value})}
              className="w-full border border-slate-300 rounded-lg p-2.5 outline-none focus:border-teal-500 focus:ring-1 focus:ring-teal-500 text-sm"
            >
              <option value="">Select Unit</option>
              {units?.map(unit => (
                <option key={unit.unit_id} value={unit.unit_id}>Flat {unit.number}</option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Issue Title</label>
            <input
              required
              type="text"
              placeholder="e.g. Water leaking from ceiling"
              value={formData.title}
              onChange={(e) => setFormData({...formData, title: e.target.value})}
              className="w-full border border-slate-300 rounded-lg p-2.5 outline-none focus:border-teal-500 focus:ring-1 focus:ring-teal-500 text-sm"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Description</label>
            <textarea
              required
              rows={3}
              placeholder="Provide details about the structural issue..."
              value={formData.description}
              onChange={(e) => setFormData({...formData, description: e.target.value})}
              className="w-full border border-slate-300 rounded-lg p-2.5 outline-none focus:border-teal-500 focus:ring-1 focus:ring-teal-500 text-sm"
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Category</label>
              <select
                value={formData.category}
                onChange={(e) => setFormData({...formData, category: e.target.value})}
                className="w-full border border-slate-300 rounded-lg p-2.5 outline-none focus:border-teal-500 focus:ring-1 focus:ring-teal-500 text-sm"
              >
                <option value="Plumbing">Plumbing</option>
                <option value="Electrical">Electrical</option>
                <option value="Structural">Structural</option>
                <option value="Safety">Safety</option>
                <option value="Elevator">Elevator</option>
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Priority (SLA)</label>
              <select
                value={formData.priority}
                onChange={(e) => setFormData({...formData, priority: e.target.value})}
                className="w-full border border-slate-300 rounded-lg p-2.5 outline-none focus:border-teal-500 focus:ring-1 focus:ring-teal-500 text-sm"
              >
                <option value="LOW">Low (48h)</option>
                <option value="MEDIUM">Medium (48h)</option>
                <option value="HIGH">High (24h)</option>
                <option value="URGENT">Urgent (4h)</option>
              </select>
            </div>
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
              Create Ticket
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
