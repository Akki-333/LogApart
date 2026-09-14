import { useState, useEffect, useCallback, useId } from 'react';
import api from '../../lib/api';
import { formatRupees, formatDay } from '../../lib/money';
import { useFeedback } from '../common/Feedback';
import { SkeletonList } from '../common/Skeleton';
import { Wrench, Plus } from 'lucide-react';

const LABELS = {
  LIFT: 'Lift', PUMP: 'Pump', DG_SET: 'DG set', WATER_TANK: 'Water tank', STP: 'STP',
  FIRE_SAFETY: 'Fire safety', ELECTRICAL: 'Electrical', OTHER: 'Other'
};

const EMPTY = { name: '', category: 'LIFT', location: '', installed_on: '' };

/**
 * The building's equipment and what it has cost. A history is never typed in:
 * it is the tickets raised and the bills paid against the asset, read back.
 */
export default function AssetsTab({ onAction }) {
  const fieldId = useId();
  const { toast } = useFeedback();
  const [assets, setAssets] = useState([]);
  const [loading, setLoading] = useState(true);
  const [form, setForm] = useState(EMPTY);
  const [saving, setSaving] = useState(false);
  const [openId, setOpenId] = useState(null);
  const [history, setHistory] = useState(null);

  const load = useCallback(async () => {
    try {
      const response = await api.get('/api/assets');
      setAssets(response.data.data);
    } catch (error) {
      console.error('Failed to load assets', error);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const register = async (event) => {
    event.preventDefault();
    setSaving(true);
    try {
      const response = await api.post('/api/assets', {
        name: form.name.trim(),
        category: form.category,
        location: form.location.trim() || undefined,
        installed_on: form.installed_on || undefined
      });
      onAction(response.data.message);
      setForm(EMPTY);
      load();
    } catch (error) {
      toast.error(error.response?.data?.message || 'Could not register that asset.');
    } finally {
      setSaving(false);
    }
  };

  const toggle = async (asset) => {
    if (openId === asset.id) {
      setOpenId(null);
      return;
    }
    setOpenId(asset.id);
    setHistory(null);
    try {
      const response = await api.get(`/api/assets/${asset.id}/history`);
      setHistory(response.data.data);
    } catch (error) {
      toast.error(error.response?.data?.message || 'Could not read the history.');
    }
  };

  const setInService = async (asset) => {
    try {
      await api.put(`/api/assets/${asset.id}`, { is_active: !asset.is_active });
      onAction(asset.is_active ? `${asset.name} taken out of service.` : `${asset.name} back in service.`);
      load();
    } catch (error) {
      toast.error(error.response?.data?.message || 'Could not update that asset.');
    }
  };

  const field = 'mt-1 w-full px-3 py-2 bg-white border border-slate-300 rounded-lg text-sm outline-none focus:border-teal-500 focus:ring-1 focus:ring-teal-500';
  const label = 'block text-xs font-bold uppercase tracking-wider text-slate-500';

  return (
    <div className="space-y-4">
      <form onSubmit={register} className="bg-white rounded-2xl border border-slate-200 p-5 grid gap-3 sm:grid-cols-[1.4fr_1fr_1fr_1fr_auto] sm:items-end">
        <div>
          <label htmlFor={`${fieldId}-name`} className={label}>Asset</label>
          <input id={`${fieldId}-name`} required minLength={2} maxLength={120} placeholder="Lift A" value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} className={field} />
        </div>
        <div>
          <label htmlFor={`${fieldId}-category`} className={label}>Kind</label>
          <select id={`${fieldId}-category`} value={form.category} onChange={(event) => setForm({ ...form, category: event.target.value })} className={field}>
            {Object.entries(LABELS).map(([value, text]) => <option key={value} value={value}>{text}</option>)}
          </select>
        </div>
        <div>
          <label htmlFor={`${fieldId}-location`} className={label}>Where</label>
          <input id={`${fieldId}-location`} maxLength={120} placeholder="Block A" value={form.location} onChange={(event) => setForm({ ...form, location: event.target.value })} className={field} />
        </div>
        <div>
          <label htmlFor={`${fieldId}-installed`} className={label}>Installed</label>
          <input id={`${fieldId}-installed`} type="date" value={form.installed_on} onChange={(event) => setForm({ ...form, installed_on: event.target.value })} className={field} />
        </div>
        <button type="submit" disabled={saving} className="flex items-center justify-center px-4 py-2 bg-teal-600 hover:bg-teal-700 text-white text-sm font-bold rounded-xl disabled:opacity-60">
          <Plus className="w-4 h-4 mr-1.5" aria-hidden="true" /> Register
        </button>
      </form>

      <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden">
        {loading ? (
          <div className="p-5"><SkeletonList rows={4} label="Loading the asset register" /></div>
        ) : assets.length === 0 ? (
          <div className="p-12 text-center">
            <Wrench className="w-8 h-8 mx-auto mb-3 text-slate-300" aria-hidden="true" />
            <p className="text-sm font-semibold text-slate-500">No assets registered.</p>
            <p className="text-xs text-slate-400 mt-1">Add the lifts, pumps and DG set, then raise tickets and record bills against them.</p>
          </div>
        ) : (
          <ul className="divide-y divide-slate-100">
            {assets.map((asset) => (
              <li key={asset.id} className={asset.is_active ? '' : 'opacity-60'}>
                <div className="px-5 py-3 flex flex-wrap items-center gap-3">
                  <button
                    type="button"
                    onClick={() => toggle(asset)}
                    aria-expanded={openId === asset.id}
                    className="flex-1 min-w-[220px] text-left"
                  >
                    <p className="text-sm font-bold text-slate-900">{asset.name}</p>
                    <p className="text-xs text-slate-500">
                      {LABELS[asset.category]}{asset.location ? ` · ${asset.location}` : ''}
                      {asset.last_serviced ? ` · last serviced ${formatDay(asset.last_serviced)}` : ' · no service on record'}
                    </p>
                  </button>
                  <span className={`text-xs font-bold ${asset.open_tickets > 0 ? 'text-rose-700' : 'text-slate-400'}`}>
                    {asset.open_tickets} open ticket{asset.open_tickets === 1 ? '' : 's'}
                  </span>
                  <span className="text-sm font-bold text-slate-800 w-28 text-right">{formatRupees(asset.spent)}</span>
                  <button type="button" onClick={() => setInService(asset)} className="text-xs font-semibold text-slate-500 hover:text-slate-800">
                    {asset.is_active ? 'Retire' : 'Restore'}
                  </button>
                </div>

                {openId === asset.id && (
                  <div className="px-5 pb-4">
                    {!history ? (
                      <SkeletonList rows={2} label="Loading history" />
                    ) : history.timeline.length === 0 ? (
                      <p className="text-xs text-slate-400">Nothing yet. Tickets and expenses tagged with this asset appear here.</p>
                    ) : (
                      <>
                        <p className="text-xs text-slate-500 mb-2">
                          {history.totals.tickets} ticket{history.totals.tickets === 1 ? '' : 's'}, {history.totals.breaches} past their SLA, {formatRupees(history.totals.spent)} spent
                        </p>
                        <ol className="border-l-2 border-slate-200 pl-4 space-y-2">
                          {history.timeline.map((entry) => (
                            <li key={`${entry.kind}-${entry.id}`} className="text-xs">
                              <span className="font-mono text-slate-400 mr-2">{formatDay(entry.on)}</span>
                              {entry.kind === 'TICKET' ? (
                                <span className="text-slate-700">
                                  Ticket: {entry.title} <span className="text-slate-400">({entry.status.toLowerCase().replace('_', ' ')}{entry.sla_breached ? ', SLA missed' : ''})</span>
                                </span>
                              ) : (
                                <span className="text-slate-700">Paid {entry.payee_name} <strong>{formatRupees(entry.amount)}</strong></span>
                              )}
                            </li>
                          ))}
                        </ol>
                      </>
                    )}
                  </div>
                )}
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
