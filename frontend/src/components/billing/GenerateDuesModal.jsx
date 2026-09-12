import { useState, useEffect, useCallback } from 'react';
import api from '../../lib/api';
import { formatRupees, formatPeriod, currentPeriod } from '../../lib/money';
import { X, Calculator, Zap, Droplets, Home, AlertTriangle, Loader2 } from 'lucide-react';

const tenthOf = (period) => `${period}-10`;

/**
 * Generating dues is the one action here that feels irreversible, so the form
 * prices every line on the server and shows it before it will commit anything.
 */
export default function GenerateDuesModal({ isOpen, onClose, onGenerated }) {
  const [form, setForm] = useState({
    period: currentPeriod(),
    due_date: tenthOf(currentPeriod()),
    maintenance_rate: '',
    rate_basis: 'FLAT',
    corpus_rate: '',
    common_electricity_total: '',
    common_water_total: '',
    split_basis: 'EQUAL',
    note: ''
  });

  const [preview, setPreview] = useState(null);
  const [previewError, setPreviewError] = useState('');
  const [isPreviewing, setIsPreviewing] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState('');

  const payload = useCallback(
    () => ({
      maintenance_rate: Number(form.maintenance_rate || 0),
      rate_basis: form.rate_basis,
      corpus_rate: Number(form.corpus_rate || 0),
      common_electricity_total: Number(form.common_electricity_total || 0),
      common_water_total: Number(form.common_water_total || 0),
      split_basis: form.split_basis
    }),
    [form]
  );

  const hasCharge =
    Number(form.maintenance_rate || 0) > 0 ||
    Number(form.corpus_rate || 0) > 0 ||
    Number(form.common_electricity_total || 0) > 0 ||
    Number(form.common_water_total || 0) > 0;

  // Re-price on every change, debounced, so the table always matches the form.
  useEffect(() => {
    if (!isOpen || !hasCharge) {
      setPreview(null);
      setPreviewError('');
      return undefined;
    }

    const timer = setTimeout(async () => {
      setIsPreviewing(true);
      try {
        const res = await api.post('/api/billing/runs/preview', payload());
        setPreview(res.data.data);
        setPreviewError('');
      } catch (err) {
        setPreview(null);
        setPreviewError(err.response?.data?.message || 'Could not price this run.');
      } finally {
        setIsPreviewing(false);
      }
    }, 350);

    return () => clearTimeout(timer);
  }, [isOpen, hasCharge, payload]);

  if (!isOpen) return null;

  const update = (key, value) => {
    setForm((prev) => {
      const next = { ...prev, [key]: value };
      // Keep the due date on the tenth when the month moves, unless it was edited.
      if (key === 'period' && prev.due_date === tenthOf(prev.period)) {
        next.due_date = tenthOf(value);
      }
      return next;
    });
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setIsSaving(true);

    try {
      const res = await api.post('/api/billing/runs', {
        ...payload(),
        period: form.period,
        due_date: form.due_date,
        note: form.note
      });
      onGenerated(res.data.message);
      onClose();
    } catch (err) {
      setError(err.response?.data?.message || 'Could not generate dues.');
    } finally {
      setIsSaving(false);
    }
  };

  const field =
    'mt-1 w-full px-3 py-2 bg-white border border-slate-300 rounded-lg text-sm outline-none focus:border-teal-500 focus:ring-1 focus:ring-teal-500 transition-colors';
  const label = 'block text-xs font-bold uppercase tracking-wider text-slate-500';

  return (
    <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-3xl border border-slate-200 overflow-hidden flex flex-col max-h-[92vh]">
        <div className="flex justify-between items-center px-6 py-5 border-b border-slate-100 bg-slate-50 shrink-0">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-teal-100 text-teal-800 rounded-xl">
              <Calculator className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-lg font-bold text-slate-800">Generate monthly dues</h2>
              <p className="text-xs text-slate-500">Raises one invoice per occupied home</p>
            </div>
          </div>
          <button onClick={onClose} className="p-1.5 text-slate-400 hover:text-slate-600 hover:bg-slate-200 rounded-full transition-colors">
            <X className="w-5 h-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="flex-1 overflow-y-auto">
          <div className="p-6 space-y-5">
            {error && (
              <div className="bg-rose-50 border-l-4 border-rose-500 p-3 rounded-r-md">
                <p className="text-sm text-rose-700">{error}</p>
              </div>
            )}

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className={label}>Billing month</label>
                <input type="month" required value={form.period} onChange={(e) => update('period', e.target.value)} className={field} />
              </div>
              <div>
                <label className={label}>Payment due by</label>
                <input type="date" required value={form.due_date} onChange={(e) => update('due_date', e.target.value)} className={field} />
              </div>
            </div>

            <div className="border border-slate-200 rounded-xl p-4 space-y-3">
              <div className="flex items-center gap-2 text-slate-700">
                <Home className="w-4 h-4 text-teal-600" />
                <span className="text-sm font-bold">Maintenance charge</span>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className={label}>{form.rate_basis === 'FLAT' ? 'Per home' : 'Per square foot'}</label>
                  <input
                    type="number" min="0" step="0.01" placeholder="0.00"
                    value={form.maintenance_rate}
                    onChange={(e) => update('maintenance_rate', e.target.value)}
                    className={field}
                  />
                </div>
                <div>
                  <label className={label}>Charged</label>
                  <select value={form.rate_basis} onChange={(e) => update('rate_basis', e.target.value)} className={field}>
                    <option value="FLAT">Same for every home</option>
                    <option value="PER_SQFT">By carpet area</option>
                  </select>
                </div>
              </div>

              <div>
                <label className={label}>Corpus per home</label>
                <input
                  type="number" min="0" step="0.01" placeholder="0.00"
                  value={form.corpus_rate}
                  onChange={(e) => update('corpus_rate', e.target.value)}
                  className={field}
                />
                <p className="text-[11px] text-slate-400 mt-1">
                  The same figure from every home whatever its size, and kept apart from
                  maintenance so the two can never be spent as one.
                </p>
              </div>
            </div>

            <div className="border border-slate-200 rounded-xl p-4 space-y-3">
              <div className="flex items-center gap-2 text-slate-700">
                <Zap className="w-4 h-4 text-amber-600" />
                <span className="text-sm font-bold">Common bills to split</span>
              </div>
              <p className="text-xs text-slate-500 leading-relaxed">
                Lifts, hallway lights, water pumps and the borewell. Enter what the building
                was billed and it is divided across the occupied homes.
              </p>
              <div className="grid grid-cols-3 gap-4">
                <div>
                  <label className={label}>Electricity total</label>
                  <input
                    type="number" min="0" step="0.01" placeholder="0.00"
                    value={form.common_electricity_total}
                    onChange={(e) => update('common_electricity_total', e.target.value)}
                    className={field}
                  />
                </div>
                <div>
                  <label className={label}>Water total</label>
                  <input
                    type="number" min="0" step="0.01" placeholder="0.00"
                    value={form.common_water_total}
                    onChange={(e) => update('common_water_total', e.target.value)}
                    className={field}
                  />
                </div>
                <div>
                  <label className={label}>Split</label>
                  <select value={form.split_basis} onChange={(e) => update('split_basis', e.target.value)} className={field}>
                    <option value="EQUAL">Equally</option>
                    <option value="PER_SQFT">By carpet area</option>
                  </select>
                </div>
              </div>
            </div>

            <div>
              <label className={label}>Note (optional)</label>
              <input
                type="text" maxLength={255} placeholder="e.g. Includes borewell motor repair"
                value={form.note}
                onChange={(e) => update('note', e.target.value)}
                className={field}
              />
            </div>

            <div className="border-t border-slate-100 pt-5">
              <div className="flex items-center justify-between mb-3">
                <h3 className="text-sm font-bold text-slate-800 flex items-center gap-2">
                  <Droplets className="w-4 h-4 text-slate-400" />
                  What each home will be charged
                </h3>
                {isPreviewing && <Loader2 className="w-4 h-4 text-teal-600 animate-spin" />}
              </div>

              {previewError && (
                <div className="flex items-start gap-2.5 bg-amber-50 border border-amber-200 rounded-xl p-3">
                  <AlertTriangle className="w-4 h-4 text-amber-700 shrink-0 mt-0.5" />
                  <p className="text-xs text-amber-900 leading-relaxed">{previewError}</p>
                </div>
              )}

              {!preview && !previewError && (
                <div className="text-center py-6 text-xs text-slate-400 border-2 border-dashed border-slate-200 rounded-xl">
                  Enter a charge above to see the breakdown.
                </div>
              )}

              {preview && (
                <div className="border border-slate-200 rounded-xl overflow-hidden">
                  <div className="max-h-56 overflow-y-auto">
                    <table className="w-full text-xs">
                      <thead className="bg-slate-50 sticky top-0">
                        <tr className="text-left text-[10px] uppercase tracking-wider text-slate-500">
                          <th className="px-3 py-2 font-bold">Home</th>
                          <th className="px-3 py-2 font-bold text-right">Maintenance</th>
                          <th className="px-3 py-2 font-bold text-right">Electricity</th>
                          <th className="px-3 py-2 font-bold text-right">Water</th>
                          <th className="px-3 py-2 font-bold text-right">Corpus</th>
                          <th className="px-3 py-2 font-bold text-right">Total</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100">
                        {preview.lines.map((line) => (
                          <tr key={line.unit_id} className="hover:bg-slate-50">
                            <td className="px-3 py-2 font-bold text-slate-800">{line.unit_number}</td>
                            <td className="px-3 py-2 text-right text-slate-600">{formatRupees(line.maintenance_amount)}</td>
                            <td className="px-3 py-2 text-right text-slate-600">{formatRupees(line.electricity_amount)}</td>
                            <td className="px-3 py-2 text-right text-slate-600">{formatRupees(line.water_amount)}</td>
                            <td className="px-3 py-2 text-right text-slate-600">{formatRupees(line.corpus_amount)}</td>
                            <td className="px-3 py-2 text-right font-bold text-slate-900">{formatRupees(line.total_amount)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                  <div className="bg-teal-50 border-t border-teal-200 px-3 py-2.5 flex items-center justify-between">
                    <span className="text-xs font-bold text-teal-900">
                      {preview.totals.units_billed} homes, {formatPeriod(form.period)}
                    </span>
                    <span className="text-sm font-black text-teal-900">{formatRupees(preview.totals.total_billed)}</span>
                  </div>
                </div>
              )}
            </div>
          </div>

          <div className="px-6 py-4 bg-slate-50 border-t border-slate-100 flex justify-end gap-3 sticky bottom-0">
            <button type="button" onClick={onClose} className="px-4 py-2.5 text-sm font-bold text-slate-600 hover:text-slate-800 transition-colors">
              Cancel
            </button>
            <button
              type="submit"
              disabled={isSaving || !preview}
              className="px-5 py-2.5 bg-teal-600 hover:bg-teal-700 disabled:bg-slate-300 text-white text-sm font-bold rounded-xl transition-colors"
            >
              {isSaving ? 'Generating...' : preview ? `Raise ${preview.totals.units_billed} invoices` : 'Raise invoices'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
