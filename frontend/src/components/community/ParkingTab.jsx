import { useState, useEffect, useId } from 'react';
import api from '../../lib/api';
import { formatDay } from '../../lib/money';
import { Car, Plus, X, Trash2, AlertTriangle, Check, Repeat } from 'lucide-react';
import { useFeedback } from '../common/Feedback';
import useDialog from '../common/useDialog';


export default function ParkingTab({ onAction }) {
  const fieldId = useId();
  const { toast, confirm } = useFeedback();
  const [bays, setBays] = useState([]);
  const [violations, setViolations] = useState([]);
  const [units, setUnits] = useState([]);
  const [loading, setLoading] = useState(true);
  const [view, setView] = useState('BAYS');
  const [isOpen, setIsOpen] = useState(false);
  const { dialogRef, dialogProps, titleId } = useDialog(isOpen, () => setIsOpen(false));
  const [form, setForm] = useState({ bay_number: '', level: 'Ground', unit_id: '', vehicle_number: '', notes: '' });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const load = () => {
    setLoading(true);
    Promise.all([api.get('/api/parking/bays'), api.get('/api/parking/violations'), api.get('/api/units')])
      .then(([b, v, u]) => {
        setBays(b.data.data);
        setViolations(v.data.data);
        setUnits((u.data.homeList || []).filter((unit) => unit.is_occupied));
      })
      .catch((err) => console.error('Failed to load parking', err))
      .finally(() => setLoading(false));
  };

  useEffect(load, []);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setSaving(true);

    try {
      const res = await api.post('/api/parking/bays', { ...form, unit_id: form.unit_id || null });
      onAction(res.data.message);
      setIsOpen(false);
      setForm({ bay_number: '', level: 'Ground', unit_id: '', vehicle_number: '', notes: '' });
      load();
    } catch (err) {
      setError(err.response?.data?.message || 'Could not add this bay.');
    } finally {
      setSaving(false);
    }
  };

  const allot = async (bay, unitId) => {
    try {
      await api.put(`/api/parking/bays/${bay.id}`, {
        unit_id: unitId || null,
        vehicle_number: bay.vehicle_number,
        notes: bay.notes
      });
      load();
    } catch (err) {
      toast.error(err.response?.data?.message || 'Could not update that bay.');
    }
  };

  const removeBay = async (bay) => {
    const go = await confirm({
      title: `Remove bay ${bay.bay_number}?`,
      message: 'Its violation history goes with it.',
      confirmLabel: 'Remove the bay',
      tone: 'danger'
    });
    if (!go) return;

    try {
      const res = await api.delete(`/api/parking/bays/${bay.id}`);
      onAction(res.data.message);
      load();
    } catch (err) {
      toast.error(err.response?.data?.message || 'Could not remove that bay.');
    }
  };

  const closeViolation = async (violation, status) => {
    try {
      await api.put(`/api/parking/violations/${violation.id}`, { status });
      onAction(status === 'WAIVED' ? 'Violation waived.' : 'Violation closed.');
      load();
    } catch (err) {
      toast.error(err.response?.data?.message || 'Could not update that violation.');
    }
  };

  const openCount = violations.filter((v) => v.status === 'OPEN').length;
  const field =
    'mt-1 w-full px-3 py-2 bg-white border border-slate-300 rounded-lg text-sm outline-none focus:border-teal-500 focus:ring-1 focus:ring-teal-500 transition-colors';
  const label = 'block text-xs font-bold uppercase tracking-wider text-slate-500';

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-4">
        <div className="flex items-center bg-slate-100 p-1 rounded-xl border border-slate-200">
          {[['BAYS', `Bays (${bays.length})`], ['VIOLATIONS', `Violations (${openCount} open)`]].map(([key, text]) => (
            <button
              key={key}
              onClick={() => setView(key)}
              className={`px-3.5 py-1.5 rounded-lg text-xs font-bold transition-colors ${
                view === key ? 'bg-white text-teal-700 shadow-xs' : 'text-slate-500 hover:text-slate-800'
              }`}
            >
              {text}
            </button>
          ))}
        </div>

        {view === 'BAYS' && (
          <button
            onClick={() => setIsOpen(true)}
            className="flex items-center px-4 py-2.5 bg-teal-600 hover:bg-teal-700 text-white text-sm font-bold rounded-xl transition-colors shadow-sm"
          >
            <Plus className="w-4 h-4 mr-2" />
            Add bay
          </button>
        )}
      </div>

      {loading ? (
        <div className="flex justify-center py-16">
          <div className="animate-spin rounded-full h-7 w-7 border-b-2 border-teal-600"></div>
        </div>
      ) : view === 'BAYS' ? (
        bays.length === 0 ? (
          <div className="bg-white rounded-2xl border border-slate-200 p-12 text-center">
            <Car className="w-8 h-8 mx-auto mb-3 text-slate-300" />
            <p className="text-sm font-semibold text-slate-500">No parking bays recorded yet.</p>
            <p className="text-xs text-slate-400 mt-1">Add the bays and allot them to homes so the guard knows which car belongs where.</p>
          </div>
        ) : (
          <div className="bg-white rounded-2xl border border-slate-200 shadow-xs overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-slate-50 border-b border-slate-200">
                  <tr className="text-left text-[10px] uppercase tracking-wider text-slate-500">
                    <th className="px-5 py-3 font-bold">Bay</th>
                    <th className="px-5 py-3 font-bold">Level</th>
                    <th className="px-5 py-3 font-bold">Allotted to</th>
                    <th className="px-5 py-3 font-bold">Registered vehicle</th>
                    <th className="px-5 py-3 font-bold">Violations</th>
                    <th className="px-5 py-3 font-bold text-right">Remove</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {bays.map((bay) => (
                    <tr key={bay.id} className="hover:bg-slate-50 transition-colors">
                      <td className="px-5 py-3 font-black text-slate-800">{bay.bay_number}</td>
                      <td className="px-5 py-3 text-xs text-slate-500">{bay.level}</td>
                      <td className="px-5 py-3">
                        <select
                          value={bay.unit_id || ''}
                          onChange={(e) => allot(bay, e.target.value)}
                          className="text-xs font-semibold bg-slate-100 text-slate-700 border-0 rounded px-2 py-1 cursor-pointer hover:bg-slate-200 outline-none"
                        >
                          <option value="">Unallotted</option>
                          {units.map((unit) => (
                            <option key={unit.unit_id} value={unit.unit_id}>Home {unit.number}</option>
                          ))}
                        </select>
                        {bay.resident_name && <div className="text-[11px] text-slate-400 mt-0.5">{bay.resident_name}</div>}
                      </td>
                      <td className="px-5 py-3 text-xs font-mono font-semibold text-slate-700">
                        {bay.vehicle_number || <span className="font-sans text-slate-400">Not recorded</span>}
                      </td>
                      <td className="px-5 py-3">
                        {bay.open_violations > 0 ? (
                          <span className="inline-flex items-center text-[11px] font-bold text-rose-700 bg-rose-50 border border-rose-200 px-2 py-0.5 rounded">
                            <AlertTriangle className="w-3 h-3 mr-1" />
                            {bay.open_violations} open
                          </span>
                        ) : (
                          <span className="text-[11px] text-slate-400">Clear</span>
                        )}
                      </td>
                      <td className="px-5 py-3 text-right">
                        <button onClick={() => removeBay(bay)} className="p-2 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition-colors">
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )
      ) : violations.length === 0 ? (
        <div className="bg-white rounded-2xl border border-slate-200 p-12 text-center">
          <AlertTriangle className="w-8 h-8 mx-auto mb-3 text-slate-300" />
          <p className="text-sm font-semibold text-slate-500">No parking violations logged.</p>
        </div>
      ) : (
        <div className="bg-white rounded-2xl border border-slate-200 shadow-xs divide-y divide-slate-100">
          {violations.map((violation) => (
            <div key={violation.id} className="flex items-center justify-between px-5 py-3.5">
              <div className="flex items-center gap-4">
                <span className="font-mono text-sm font-black text-slate-800 bg-slate-100 border border-slate-200 px-2.5 py-1.5 rounded-lg">
                  {violation.vehicle_number}
                </span>
                <div>
                  <div className="text-xs font-bold text-slate-800">
                    Bay {violation.bay_number}
                    {violation.unit_number ? `, allotted to Home ${violation.unit_number}` : ', unallotted'}
                  </div>
                  <div className="text-[11px] text-slate-400">
                    {formatDay(violation.occurred_at)} · logged by {violation.reported_by}
                    {violation.note ? ` · ${violation.note}` : ''}
                  </div>
                </div>
                {violation.repeat_count > 1 && (
                  <span className="inline-flex items-center text-[10px] font-bold text-rose-700 bg-rose-50 border border-rose-200 px-2 py-0.5 rounded uppercase tracking-wider">
                    <Repeat className="w-3 h-3 mr-1" />
                    {violation.repeat_count} times
                  </span>
                )}
              </div>

              {violation.status === 'OPEN' ? (
                <div className="flex items-center gap-2">
                  <button onClick={() => closeViolation(violation, 'WAIVED')}
                    className="px-3 py-1.5 text-xs font-bold text-slate-600 hover:text-slate-800 hover:bg-slate-100 rounded-lg transition-colors">
                    Let it go
                  </button>
                  <button onClick={() => closeViolation(violation, 'RESOLVED')}
                    className="inline-flex items-center px-3 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold rounded-lg transition-colors">
                    <Check className="w-3 h-3 mr-1" />
                    Settled
                  </button>
                </div>
              ) : (
                <span className="text-[10px] font-bold px-2 py-0.5 rounded border uppercase tracking-wider bg-slate-100 text-slate-500 border-slate-200">
                  {violation.status}
                </span>
              )}
            </div>
          ))}
        </div>
      )}

      {isOpen && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div ref={dialogRef} {...dialogProps} className="bg-white rounded-2xl shadow-2xl w-full max-w-md border border-slate-200 overflow-hidden">
            <div className="flex justify-between items-center px-6 py-5 border-b border-slate-100 bg-slate-50">
              <div className="flex items-center gap-3">
                <div className="p-2 bg-teal-100 text-teal-800 rounded-xl">
                  <Car className="w-5 h-5" />
                </div>
                <h2 id={titleId} className="text-lg font-bold text-slate-800">Add a parking bay</h2>
              </div>
              <button onClick={() => setIsOpen(false)} className="p-1.5 text-slate-400 hover:text-slate-600 hover:bg-slate-200 rounded-full transition-colors">
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSubmit} className="p-6 space-y-4">
              {error && (
                <div className="bg-rose-50 border-l-4 border-rose-500 p-3 rounded-r-md">
                  <p className="text-sm text-rose-700">{error}</p>
                </div>
              )}

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className={label} htmlFor={`${fieldId}-bay-number`}>Bay number</label>
                  <input id={`${fieldId}-bay-number`} type="text" required maxLength={20} placeholder="P-14" value={form.bay_number}
                    onChange={(e) => setForm({ ...form, bay_number: e.target.value.toUpperCase() })} className={field} />
                </div>
                <div>
                  <label className={label} htmlFor={`${fieldId}-level`}>Level</label>
                  <input id={`${fieldId}-level`} type="text" maxLength={20} placeholder="Ground" value={form.level}
                    onChange={(e) => setForm({ ...form, level: e.target.value })} className={field} />
                </div>
              </div>

              <div>
                <label className={label} htmlFor={`${fieldId}-allot-to`}>Allot to</label>
                <select id={`${fieldId}-allot-to`} value={form.unit_id} onChange={(e) => setForm({ ...form, unit_id: e.target.value })} className={field}>
                  <option value="">Leave unallotted</option>
                  {units.map((unit) => (
                    <option key={unit.unit_id} value={unit.unit_id}>Home {unit.number}</option>
                  ))}
                </select>
              </div>

              <div>
                <label className={label} htmlFor={`${fieldId}-registered-vehicle`}>Registered vehicle</label>
                <input id={`${fieldId}-registered-vehicle`} type="text" maxLength={50} placeholder="TN 09 AB 1234" value={form.vehicle_number}
                  onChange={(e) => setForm({ ...form, vehicle_number: e.target.value.toUpperCase() })} className={field} />
                <p className="mt-1 text-[11px] text-slate-500">Any other plate in this bay counts as a violation.</p>
              </div>

              <div className="flex justify-end gap-3 pt-2">
                <button type="button" onClick={() => setIsOpen(false)} className="px-4 py-2.5 text-sm font-bold text-slate-600 hover:text-slate-800 transition-colors">
                  Cancel
                </button>
                <button type="submit" disabled={saving}
                  className="px-5 py-2.5 bg-teal-600 hover:bg-teal-700 disabled:bg-slate-300 text-white text-sm font-bold rounded-xl transition-colors">
                  {saving ? 'Adding...' : 'Add bay'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
