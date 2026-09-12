import { useState, useEffect } from 'react';
import api from '../../lib/api';
import { formatDay } from '../../lib/money';
import { Users, Plus, X, Pencil, Clock, CircleDot } from 'lucide-react';

const TYPES = [
  { value: 'MAID', label: 'Maid' },
  { value: 'COOK', label: 'Cook' },
  { value: 'DRIVER', label: 'Driver' },
  { value: 'MILKMAN', label: 'Milkman' },
  { value: 'NEWSPAPER', label: 'Newspaper' },
  { value: 'NANNY', label: 'Nanny' },
  { value: 'GARDENER', label: 'Gardener' },
  { value: 'OTHER', label: 'Other' }
];

const EMPTY = {
  name: '', phone: '', helper_type: 'MAID',
  id_proof_type: '', id_proof_number: '', unit_ids: [], is_active: true
};

export default function HelpersTab({ onAction }) {
  const [helpers, setHelpers] = useState([]);
  const [units, setUnits] = useState([]);
  const [loading, setLoading] = useState(true);
  const [isOpen, setIsOpen] = useState(false);
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState(EMPTY);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const load = () => {
    setLoading(true);
    Promise.all([api.get('/api/helpers'), api.get('/api/units')])
      .then(([h, u]) => {
        setHelpers(h.data.data);
        setUnits((u.data.homeList || []).filter((unit) => unit.is_occupied));
      })
      .catch((err) => console.error('Failed to load helpers', err))
      .finally(() => setLoading(false));
  };

  useEffect(load, []);

  const openNew = () => {
    setEditing(null);
    setForm(EMPTY);
    setError('');
    setIsOpen(true);
  };

  const openEdit = (helper) => {
    setEditing(helper);
    setForm({
      name: helper.name,
      phone: helper.phone || '',
      helper_type: helper.helper_type,
      id_proof_type: helper.id_proof_type || '',
      id_proof_number: helper.id_proof_number || '',
      unit_ids: helper.unit_ids,
      is_active: Boolean(helper.is_active)
    });
    setError('');
    setIsOpen(true);
  };

  const toggleUnit = (unitId) => {
    setForm((prev) => ({
      ...prev,
      unit_ids: prev.unit_ids.includes(unitId)
        ? prev.unit_ids.filter((id) => id !== unitId)
        : [...prev.unit_ids, unitId]
    }));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setSaving(true);

    try {
      const res = editing
        ? await api.put(`/api/helpers/${editing.id}`, form)
        : await api.post('/api/helpers', form);
      onAction(res.data.message);
      setIsOpen(false);
      load();
    } catch (err) {
      setError(err.response?.data?.message || 'Could not save this helper.');
    } finally {
      setSaving(false);
    }
  };

  const field =
    'mt-1 w-full px-3 py-2 bg-white border border-slate-300 rounded-lg text-sm outline-none focus:border-teal-500 focus:ring-1 focus:ring-teal-500 transition-colors';
  const label = 'block text-xs font-bold uppercase tracking-wider text-slate-500';

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-xs text-slate-500">
          Registered once, then checked in at the gate with one tap. Every home they
          work for is told they have arrived.
        </p>
        <button
          onClick={openNew}
          className="flex items-center px-4 py-2.5 bg-teal-600 hover:bg-teal-700 text-white text-sm font-bold rounded-xl transition-colors shadow-sm shrink-0 ml-4"
        >
          <Plus className="w-4 h-4 mr-2" />
          Add helper
        </button>
      </div>

      {loading ? (
        <div className="flex justify-center py-16">
          <div className="animate-spin rounded-full h-7 w-7 border-b-2 border-teal-600"></div>
        </div>
      ) : helpers.length === 0 ? (
        <div className="bg-white rounded-2xl border border-slate-200 p-12 text-center">
          <Users className="w-8 h-8 mx-auto mb-3 text-slate-300" />
          <p className="text-sm font-semibold text-slate-500">No helpers registered yet.</p>
          <p className="text-xs text-slate-400 mt-1 max-w-sm mx-auto leading-relaxed">
            Add the maids, cooks and drivers who come daily so the guard can wave them
            through without writing them into the visitor log each morning.
          </p>
        </div>
      ) : (
        <div className="bg-white rounded-2xl border border-slate-200 shadow-xs overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 border-b border-slate-200">
              <tr className="text-left text-[10px] uppercase tracking-wider text-slate-500">
                <th className="px-5 py-3 font-bold">Name</th>
                <th className="px-5 py-3 font-bold">Type</th>
                <th className="px-5 py-3 font-bold">Works for</th>
                <th className="px-5 py-3 font-bold">Phone</th>
                <th className="px-5 py-3 font-bold">Right now</th>
                <th className="px-5 py-3 font-bold text-right">Edit</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {helpers.map((helper) => (
                <tr key={helper.id} className={`hover:bg-slate-50 transition-colors ${helper.is_active ? '' : 'opacity-50'}`}>
                  <td className="px-5 py-3">
                    <div className="font-bold text-slate-800">{helper.name}</div>
                    {helper.id_proof_number && (
                      <div className="text-[11px] text-slate-400">
                        {helper.id_proof_type} {helper.id_proof_number}
                      </div>
                    )}
                  </td>
                  <td className="px-5 py-3">
                    <span className="text-[10px] font-bold px-2 py-0.5 rounded border uppercase tracking-wider bg-slate-100 text-slate-600 border-slate-200">
                      {helper.helper_type}
                    </span>
                  </td>
                  <td className="px-5 py-3 text-xs font-semibold text-slate-700">{helper.unit_numbers || 'None'}</td>
                  <td className="px-5 py-3 text-xs text-slate-500">{helper.phone || 'Not recorded'}</td>
                  <td className="px-5 py-3">
                    {!helper.is_active ? (
                      <span className="text-[11px] font-semibold text-slate-400">Off the registry</span>
                    ) : helper.is_inside ? (
                      <span className="inline-flex items-center text-[11px] font-bold text-emerald-700">
                        <CircleDot className="w-3 h-3 mr-1 animate-pulse" />
                        Inside since{' '}
                        {new Date(helper.current_check_in).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                      </span>
                    ) : (
                      <span className="text-[11px] text-slate-400 flex items-center gap-1">
                        <Clock className="w-3 h-3" /> Not in today
                      </span>
                    )}
                  </td>
                  <td className="px-5 py-3 text-right">
                    <button
                      onClick={() => openEdit(helper)}
                      className="p-2 text-slate-400 hover:text-teal-700 hover:bg-teal-50 rounded-lg transition-colors"
                    >
                      <Pencil className="w-4 h-4" />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {isOpen && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg border border-slate-200 overflow-hidden flex flex-col max-h-[92vh]">
            <div className="flex justify-between items-center px-6 py-5 border-b border-slate-100 bg-slate-50 shrink-0">
              <div className="flex items-center gap-3">
                <div className="p-2 bg-teal-100 text-teal-800 rounded-xl">
                  <Users className="w-5 h-5" />
                </div>
                <div>
                  <h2 className="text-lg font-bold text-slate-800">{editing ? 'Edit helper' : 'Add a helper'}</h2>
                  <p className="text-xs text-slate-500">Link them to every home they work for</p>
                </div>
              </div>
              <button onClick={() => setIsOpen(false)} className="p-1.5 text-slate-400 hover:text-slate-600 hover:bg-slate-200 rounded-full transition-colors">
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSubmit} className="p-6 space-y-4 overflow-y-auto">
              {error && (
                <div className="bg-rose-50 border-l-4 border-rose-500 p-3 rounded-r-md">
                  <p className="text-sm text-rose-700">{error}</p>
                </div>
              )}

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className={label}>Name</label>
                  <input type="text" required maxLength={255} value={form.name}
                    onChange={(e) => setForm({ ...form, name: e.target.value })} className={field} />
                </div>
                <div>
                  <label className={label}>They are a</label>
                  <select value={form.helper_type} onChange={(e) => setForm({ ...form, helper_type: e.target.value })} className={field}>
                    {TYPES.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-3 gap-4">
                <div>
                  <label className={label}>Phone</label>
                  <input type="tel" maxLength={20} value={form.phone}
                    onChange={(e) => setForm({ ...form, phone: e.target.value })} className={field} />
                </div>
                <div>
                  <label className={label}>ID type</label>
                  <input type="text" maxLength={50} placeholder="Aadhaar" value={form.id_proof_type}
                    onChange={(e) => setForm({ ...form, id_proof_type: e.target.value })} className={field} />
                </div>
                <div>
                  <label className={label}>ID number</label>
                  <input type="text" maxLength={50} value={form.id_proof_number}
                    onChange={(e) => setForm({ ...form, id_proof_number: e.target.value })} className={field} />
                </div>
              </div>

              <div>
                <label className={label}>Homes they work for</label>
                <div className="mt-2 flex flex-wrap gap-1.5 max-h-40 overflow-y-auto p-2 border border-slate-200 rounded-xl bg-slate-50">
                  {units.map((unit) => (
                    <button
                      key={unit.unit_id}
                      type="button"
                      onClick={() => toggleUnit(unit.unit_id)}
                      className={`px-3 py-1.5 rounded-lg text-xs font-bold border transition-colors ${
                        form.unit_ids.includes(unit.unit_id)
                          ? 'bg-teal-600 text-white border-teal-600'
                          : 'bg-white text-slate-600 border-slate-200 hover:border-teal-400'
                      }`}
                    >
                      {unit.number}
                    </button>
                  ))}
                </div>
                <p className="mt-1 text-[11px] text-slate-500">
                  {form.unit_ids.length} selected. One helper often works for several homes.
                </p>
              </div>

              {editing && (
                <label className="flex items-center gap-2.5 text-xs text-slate-700">
                  <input type="checkbox" checked={form.is_active}
                    onChange={(e) => setForm({ ...form, is_active: e.target.checked })} className="accent-teal-600" />
                  On the registry. Uncheck when they stop working here.
                </label>
              )}

              <div className="flex justify-end gap-3 pt-2">
                <button type="button" onClick={() => setIsOpen(false)} className="px-4 py-2.5 text-sm font-bold text-slate-600 hover:text-slate-800 transition-colors">
                  Cancel
                </button>
                <button type="submit" disabled={saving}
                  className="px-5 py-2.5 bg-teal-600 hover:bg-teal-700 disabled:bg-slate-300 text-white text-sm font-bold rounded-xl transition-colors">
                  {saving ? 'Saving...' : editing ? 'Save changes' : 'Add helper'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
