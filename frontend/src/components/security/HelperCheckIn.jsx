import { useState, useEffect } from 'react';
import api from '../../lib/api';
import { Users, Search, LogIn, LogOut, CircleDot } from 'lucide-react';

/**
 * The gate desk's one-tap panel for daily helpers. These people come every
 * morning, so retyping them into the visitor log each day is the single biggest
 * waste of a guard's time.
 */
export default function HelperCheckIn({ onAction }) {
  const [helpers, setHelpers] = useState([]);
  const [search, setSearch] = useState('');
  const [busy, setBusy] = useState(null);

  const load = () => {
    api
      .get('/api/helpers')
      .then((res) => setHelpers(res.data.data.filter((h) => h.is_active)))
      .catch((err) => console.error('Failed to load helpers', err));
  };

  useEffect(load, []);

  const act = async (helper, direction) => {
    setBusy(helper.id);

    try {
      const res = await api.post(`/api/helpers/${helper.id}/${direction}`);
      onAction(res.data.message);
      load();
    } catch (err) {
      alert(err.response?.data?.message || 'Could not record that.');
    } finally {
      setBusy(null);
    }
  };

  const visible = helpers.filter((helper) => {
    if (!search.trim()) return true;
    const q = search.toLowerCase();
    return (
      helper.name.toLowerCase().includes(q) ||
      helper.unit_numbers.toLowerCase().includes(q) ||
      helper.helper_type.toLowerCase().includes(q)
    );
  });

  const insideCount = helpers.filter((h) => h.is_inside).length;

  if (helpers.length === 0) return null;

  return (
    <div className="bg-slate-800 border border-slate-700 rounded-2xl p-5">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-4">
        <div className="flex items-center gap-2.5">
          <span className="p-2 bg-teal-500/20 text-teal-300 rounded-xl">
            <Users className="w-5 h-5" />
          </span>
          <div>
            <h3 className="text-sm font-bold text-white">Daily helpers</h3>
            <p className="text-xs text-slate-400">
              {insideCount > 0 ? `${insideCount} inside right now` : 'Nobody checked in yet today'}
            </p>
          </div>
        </div>

        <div className="relative">
          <Search className="w-4 h-4 text-slate-500 absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Name or flat"
            className="pl-9 pr-3 py-2 bg-slate-900 border border-slate-700 rounded-xl text-sm font-semibold text-white placeholder-slate-600 outline-none focus:border-teal-500 transition-colors w-full sm:w-52"
          />
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2.5">
        {visible.map((helper) => (
          <button
            key={helper.id}
            onClick={() => act(helper, helper.is_inside ? 'check-out' : 'check-in')}
            disabled={busy === helper.id}
            className={`flex items-center justify-between p-3.5 rounded-xl border-2 text-left transition-colors disabled:opacity-50 ${
              helper.is_inside
                ? 'bg-emerald-500/15 border-emerald-500/50 hover:bg-emerald-500/25'
                : 'bg-slate-900 border-slate-700 hover:border-teal-500'
            }`}
          >
            <div className="min-w-0">
              <div className="text-sm font-bold text-white truncate">{helper.name}</div>
              <div className="text-[11px] text-slate-400 truncate">
                <span className="capitalize">{helper.helper_type.toLowerCase()}</span>
                {' · '}Flat {helper.unit_numbers}
              </div>
              {helper.is_inside && (
                <div className="text-[11px] text-emerald-400 font-semibold flex items-center gap-1 mt-0.5">
                  <CircleDot className="w-3 h-3 animate-pulse" />
                  In since {new Date(helper.current_check_in).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                </div>
              )}
            </div>

            <span className={`p-2 rounded-lg shrink-0 ml-2 ${helper.is_inside ? 'bg-emerald-600 text-white' : 'bg-teal-600 text-white'}`}>
              {helper.is_inside ? <LogOut className="w-4 h-4" /> : <LogIn className="w-4 h-4" />}
            </span>
          </button>
        ))}
      </div>

      {visible.length === 0 && (
        <p className="text-center py-6 text-xs text-slate-500">Nobody on the registry matches that.</p>
      )}
    </div>
  );
}
