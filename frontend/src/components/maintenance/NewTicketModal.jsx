import { useState, useId } from 'react';
import { X, Home, Building2 } from 'lucide-react';
import useDialog from '../common/useDialog';

const EMPTY = {
  scope: 'COMMON',
  unit_id: '',
  location: '',
  title: '',
  description: '',
  category: 'PLUMBING',
  priority: 'MEDIUM',
  asset_id: ''
};

// Common examples first: the lift, the pump and the hallway lights are what a
// structural ticket system is actually for.
const COMMON_PLACES = ['Lift A', 'Lift B', 'Stairwell', 'Terrace', 'Basement pump room', 'Car park', 'Main gate', 'Overhead tank'];

export default function NewTicketModal({ isOpen, onClose, onSubmit, units, assets = [] }) {
  const { dialogRef, dialogProps, titleId } = useDialog(isOpen, onClose);
  const fieldId = useId();
  const [formData, setFormData] = useState(EMPTY);

  if (!isOpen) return null;

  const isCommon = formData.scope === 'COMMON';

  const handleSubmit = (e) => {
    e.preventDefault();
    onSubmit({
      ...formData,
      unit_id: isCommon ? null : formData.unit_id,
      location: isCommon ? formData.location : null,
      asset_id: formData.asset_id ? Number(formData.asset_id) : undefined
    });
    setFormData(EMPTY);
  };

  return (
    <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-sm z-50 flex items-center justify-center p-4">
      <div ref={dialogRef} {...dialogProps} className="bg-white rounded-xl shadow-2xl w-full max-w-lg border border-slate-100 overflow-hidden">
        <div className="flex justify-between items-center p-6 border-b border-slate-100 bg-slate-50">
          <h2 id={titleId} className="text-lg font-bold text-slate-800">Log Structural Issue</h2>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600 transition-colors">
            <X className="w-5 h-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          <div>
            <span id={`${fieldId}-scope-group`} className="block text-sm font-medium text-slate-700 mb-1.5">What does this affect?</span>
            <div className="grid grid-cols-2 gap-2 mb-3" role="group" aria-labelledby={`${fieldId}-scope-group`}>
              <button
                type="button"
                onClick={() => setFormData({ ...formData, scope: 'COMMON' })}
                className={`flex items-center justify-center px-3 py-2.5 rounded-lg text-sm font-bold border transition-colors ${
                  isCommon ? 'bg-teal-600 text-white border-teal-600' : 'bg-white text-slate-600 border-slate-300 hover:border-teal-400'
                }`}
              >
                <Building2 className="w-4 h-4 mr-2" />
                Common area
              </button>
              <button
                type="button"
                onClick={() => setFormData({ ...formData, scope: 'UNIT' })}
                className={`flex items-center justify-center px-3 py-2.5 rounded-lg text-sm font-bold border transition-colors ${
                  !isCommon ? 'bg-teal-600 text-white border-teal-600' : 'bg-white text-slate-600 border-slate-300 hover:border-teal-400'
                }`}
              >
                <Home className="w-4 h-4 mr-2" />
                One home
              </button>
            </div>

            {isCommon ? (
              <>
                <input
                  required
                  type="text"
                  maxLength={100}
                  list="common-places"
                  placeholder="Where is it? e.g. Lift A"
                  value={formData.location}
                  onChange={(e) => setFormData({...formData, location: e.target.value})}
                  className="w-full border border-slate-300 rounded-lg p-2.5 outline-none focus:border-teal-500 focus:ring-1 focus:ring-teal-500 text-sm"
                />
                <datalist id="common-places">
                  {COMMON_PLACES.map((place) => <option key={place} value={place} />)}
                </datalist>
                <p className="mt-1 text-xs text-slate-500">
                  Lifts, pumps, hallway lights and the terrace belong to the building, not to a home.
                </p>
              </>
            ) : (
              <select
                required
                value={formData.unit_id}
                onChange={(e) => setFormData({...formData, unit_id: e.target.value})}
                className="w-full border border-slate-300 rounded-lg p-2.5 outline-none focus:border-teal-500 focus:ring-1 focus:ring-teal-500 text-sm"
              >
                <option value="">Select Unit</option>
                {units?.map(unit => (
                  <option key={unit.unit_id} value={unit.unit_id}>Home {unit.number}</option>
                ))}
              </select>
            )}
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1" htmlFor={`${fieldId}-issue-title`}>Issue Title</label>
            <input id={`${fieldId}-issue-title`}
              required
              type="text"
              placeholder="e.g. Water leaking from ceiling"
              value={formData.title}
              onChange={(e) => setFormData({...formData, title: e.target.value})}
              className="w-full border border-slate-300 rounded-lg p-2.5 outline-none focus:border-teal-500 focus:ring-1 focus:ring-teal-500 text-sm"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1" htmlFor={`${fieldId}-description`}>Description</label>
            <textarea id={`${fieldId}-description`}
              required
              rows={3}
              placeholder="Provide details about the structural issue..."
              value={formData.description}
              onChange={(e) => setFormData({...formData, description: e.target.value})}
              className="w-full border border-slate-300 rounded-lg p-2.5 outline-none focus:border-teal-500 focus:ring-1 focus:ring-teal-500 text-sm"
            />
          </div>

          {assets.length > 0 && (
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1" htmlFor={`${fieldId}-asset`}>Equipment involved</label>
              <select id={`${fieldId}-asset`}
                value={formData.asset_id}
                onChange={(e) => setFormData({ ...formData, asset_id: e.target.value })}
                className="w-full border border-slate-300 rounded-lg p-2.5 outline-none focus:border-teal-500 focus:ring-1 focus:ring-teal-500 text-sm"
              >
                <option value="">None, or not sure</option>
                {assets.filter((asset) => asset.is_active).map((asset) => (
                  <option key={asset.id} value={asset.id}>{asset.name}{asset.location ? ` (${asset.location})` : ''}</option>
                ))}
              </select>
            </div>
          )}

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1" htmlFor={`${fieldId}-category`}>Category</label>
              <select id={`${fieldId}-category`}
                value={formData.category}
                onChange={(e) => setFormData({...formData, category: e.target.value})}
                className="w-full border border-slate-300 rounded-lg p-2.5 outline-none focus:border-teal-500 focus:ring-1 focus:ring-teal-500 text-sm"
              >
                {/* The API accepts exactly these. The old labels were title case and
                    included two it has never known, so every admin ticket was refused. */}
                <option value="PLUMBING">Plumbing</option>
                <option value="ELECTRICAL">Electrical</option>
                <option value="STRUCTURAL">Structural</option>
                <option value="LIFT">Lift</option>
                <option value="COMMON">Common area</option>
                <option value="OTHER">Other</option>
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1" htmlFor={`${fieldId}-priority-sla`}>Priority (SLA)</label>
              <select id={`${fieldId}-priority-sla`}
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
