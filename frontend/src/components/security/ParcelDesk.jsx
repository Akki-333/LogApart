import { useState, useEffect, useCallback } from 'react';
import api from '../../lib/api';
import { Package, PackageCheck, Plus } from 'lucide-react';
import { useFeedback } from '../common/Feedback';

const when = (value) =>
  new Date(value).toLocaleString('en-IN', {
    day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit', hour12: true
  });

/**
 * The shelf behind the desk.
 *
 * Read-only for an admin, exactly as the gate log is: the office can see what
 * is being held without reaching across the desk and handing it over.
 */
export default function ParcelDesk({ units = [], readOnly = false, dark = false }) {
  const { toast, askReason } = useFeedback();
  const [parcels, setParcels] = useState([]);
  const [form, setForm] = useState({ unit_id: '', courier: '', description: '' });
  const [isOpen, setIsOpen] = useState(false);

  const load = useCallback(async () => {
    try {
      const response = await api.get('/api/parcels?waiting=true');
      setParcels(response.data.data);
    } catch (error) {
      console.error('Failed to load parcels', error);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const receive = async (event) => {
    event.preventDefault();

    try {
      const response = await api.post('/api/parcels', {
        unit_id: Number(form.unit_id),
        courier: form.courier || null,
        description: form.description || null
      });
      toast.success(response.data.message);
      setForm({ unit_id: '', courier: '', description: '' });
      setIsOpen(false);
      load();
    } catch (error) {
      toast.error(error.response?.data?.message || 'Could not record that parcel');
    }
  };

  const release = async (parcel) => {
    const name = await askReason({
      title: `Who is collecting the parcel for home ${parcel.unit_number}?`,
      reasonLabel: 'Name of whoever is collecting it',
      confirmLabel: 'Hand it over',
      minLength: 2
    });
    if (name === null) return;

    try {
      await api.put(`/api/parcels/${parcel.id}/release`, { collected_by_name: name.trim() });
      load();
    } catch (error) {
      toast.error(error.response?.data?.message || 'Could not hand that over');
    }
  };

  const shell = dark
    ? 'bg-slate-800 border-slate-700'
    : 'bg-white border-slate-200';
  const heading = dark ? 'text-white' : 'text-slate-800';
  const muted = dark ? 'text-slate-400' : 'text-slate-500';

  return (
    <div className={`rounded-2xl border overflow-hidden ${shell}`}>
      <div className={`px-5 py-3.5 border-b flex flex-wrap items-center gap-3 ${dark ? 'border-slate-700' : 'border-slate-100'}`}>
        <Package className={`w-4 h-4 ${dark ? 'text-teal-400' : 'text-teal-600'}`} />
        <h3 className={`text-sm font-bold ${heading}`}>Parcels held at the gate</h3>
        <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${
          parcels.length > 0 ? 'bg-amber-100 text-amber-800' : 'bg-slate-100 text-slate-500'
        }`}>
          {parcels.length} waiting
        </span>

        {!readOnly && (
          <button
            onClick={() => setIsOpen(!isOpen)}
            className="ml-auto flex items-center px-3 py-1.5 bg-teal-600 hover:bg-teal-700 text-white font-bold rounded-lg text-xs"
          >
            <Plus className="w-3.5 h-3.5 mr-1" /> Take one in
          </button>
        )}
      </div>

      {isOpen && !readOnly && (
        <form onSubmit={receive} className={`px-5 py-3 border-b grid sm:grid-cols-4 gap-2 ${dark ? 'border-slate-700' : 'border-slate-100'}`}>
          <select
            value={form.unit_id}
            onChange={(event) => setForm({ ...form, unit_id: event.target.value })}
            required
            className="px-3 py-2 border border-slate-200 rounded-xl text-sm text-slate-800"
          >
            <option value="">Which home</option>
            {units.map((unit) => (
              <option key={unit.unit_id || unit.id} value={unit.unit_id || unit.id}>
                Home {unit.number}
              </option>
            ))}
          </select>

          <input
            value={form.courier}
            onChange={(event) => setForm({ ...form, courier: event.target.value })}
            placeholder="Courier"
            className="px-3 py-2 border border-slate-200 rounded-xl text-sm text-slate-800"
          />

          <input
            value={form.description}
            onChange={(event) => setForm({ ...form, description: event.target.value })}
            placeholder="What it looks like"
            className="px-3 py-2 border border-slate-200 rounded-xl text-sm text-slate-800"
          />

          <button type="submit" className="px-3 py-2 bg-slate-900 hover:bg-slate-800 text-white font-bold rounded-xl text-sm">
            Hold it
          </button>
        </form>
      )}

      {parcels.length === 0 ? (
        <p className={`px-5 py-8 text-center text-sm ${muted}`}>Nothing on the shelf.</p>
      ) : (
        <ul className={`divide-y ${dark ? 'divide-slate-700' : 'divide-slate-100'}`}>
          {parcels.map((parcel) => (
            <li key={parcel.id} className="px-5 py-3 flex flex-wrap items-center gap-3">
              <div className="flex-1 min-w-[180px]">
                <p className={`text-sm font-bold ${heading}`}>
                  Home {parcel.unit_number} · {parcel.courier || 'delivery'}
                </p>
                <p className={`text-[11px] ${muted}`}>
                  {parcel.description || 'No description'} · in {when(parcel.received_at)}
                </p>
              </div>

              {!readOnly && (
                <button
                  onClick={() => release(parcel)}
                  className="flex items-center gap-1.5 px-3 py-2 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold rounded-lg"
                >
                  <PackageCheck className="w-3.5 h-3.5" /> Hand over
                </button>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
