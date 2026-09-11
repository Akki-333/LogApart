import { useState, useEffect, useCallback } from 'react';
import api from '../../lib/api';
import { formatRupees, formatDay, formatPeriod } from '../../lib/money';
import { BellRing, Gavel, Check, X, HandCoins } from 'lucide-react';

/**
 * The three things an admin does about money that has not arrived: confirm what
 * a resident says they paid, charge the flats that are late, and chase the rest.
 *
 * Late fees are priced before they are charged, on the same code path that
 * charges them, so the table shown here is what will actually happen.
 */
export default function CollectionActions({ period, onChanged }) {
  const [declarations, setDeclarations] = useState([]);
  const [feePreview, setFeePreview] = useState(null);
  const [rule, setRule] = useState({ basis: 'FLAT', amount: 100, grace_days: 5 });
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    try {
      const response = await api.get('/api/billing/declarations?status=PENDING');
      setDeclarations(response.data.data);
    } catch (error) {
      console.error('Failed to load declared payments', error);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const review = async (declaration, approve) => {
    let note = '';

    if (!approve) {
      note = window.prompt(`Why can ${formatRupees(declaration.amount)} from flat ${declaration.unit_number} not be confirmed?`) || '';
      if (note.trim().length < 4) {
        alert('Say why before refusing a declared payment.');
        return;
      }
    }

    try {
      await api.post(`/api/billing/declarations/${declaration.id}/review`, { approve, note: note.trim() });
      load();
      onChanged();
    } catch (error) {
      alert(error.response?.data?.message || 'Could not review that payment');
    }
  };

  const priceFees = async () => {
    setBusy(true);
    try {
      const response = await api.post('/api/billing/late-fees/preview', { ...rule, period });
      setFeePreview(response.data.data);
    } catch (error) {
      alert(error.response?.data?.message || 'Could not price the late fees');
    } finally {
      setBusy(false);
    }
  };

  const chargeFees = async () => {
    setBusy(true);
    try {
      const response = await api.post('/api/billing/late-fees', { ...rule, period });
      alert(response.data.message);
      setFeePreview(null);
      onChanged();
    } catch (error) {
      alert(error.response?.data?.message || 'Could not charge the late fees');
    } finally {
      setBusy(false);
    }
  };

  const remind = async () => {
    if (!window.confirm(`Send a reminder to every flat behind on ${formatPeriod(period)}? Each resident is told only about their own flat.`)) return;

    try {
      const response = await api.post('/api/billing/reminders', { period });
      alert(response.data.message);
    } catch (error) {
      alert(error.response?.data?.message || 'Could not send those reminders');
    }
  };

  return (
    <div className="grid lg:grid-cols-2 gap-5">
      <div className="bg-white border border-slate-200 rounded-2xl overflow-hidden">
        <div className="px-5 py-3.5 border-b border-slate-100 flex items-center gap-2">
          <HandCoins className="w-4 h-4 text-teal-600" />
          <h3 className="text-sm font-bold text-slate-800">Payments residents have declared</h3>
          {declarations.length > 0 && (
            <span className="ml-auto text-[10px] font-bold px-2 py-0.5 rounded-full bg-amber-100 text-amber-800">
              {declarations.length} waiting
            </span>
          )}
        </div>

        {declarations.length === 0 ? (
          <p className="px-5 py-8 text-center text-sm text-slate-400">
            Nothing waiting. A declared payment appears here until you confirm it against the account.
          </p>
        ) : (
          <ul className="divide-y divide-slate-100">
            {declarations.map((declaration) => (
              <li key={declaration.id} className="px-5 py-3 flex flex-wrap items-center gap-3">
                <div className="flex-1 min-w-[180px]">
                  <p className="text-sm font-semibold text-slate-800">
                    Flat {declaration.unit_number} · {formatRupees(declaration.amount)}
                  </p>
                  <p className="text-[11px] text-slate-500">
                    {declaration.mode}
                    {declaration.reference && ` · ${declaration.reference}`} · paid {formatDay(declaration.paid_on)} ·{' '}
                    {formatRupees(declaration.balance)} outstanding
                  </p>
                </div>

                <button
                  onClick={() => review(declaration, true)}
                  className="flex items-center gap-1 px-2.5 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold rounded-lg"
                >
                  <Check className="w-3.5 h-3.5" /> Confirm
                </button>
                <button
                  onClick={() => review(declaration, false)}
                  className="flex items-center gap-1 px-2.5 py-1.5 bg-white hover:bg-rose-50 text-rose-600 border border-rose-200 text-xs font-bold rounded-lg"
                >
                  <X className="w-3.5 h-3.5" /> Refuse
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>

      <div className="bg-white border border-slate-200 rounded-2xl overflow-hidden">
        <div className="px-5 py-3.5 border-b border-slate-100 flex items-center gap-2">
          <Gavel className="w-4 h-4 text-teal-600" />
          <h3 className="text-sm font-bold text-slate-800">Late fees and reminders</h3>
        </div>

        <div className="px-5 py-4 space-y-3">
          <div className="flex flex-wrap items-end gap-2">
            <label className="text-[11px] text-slate-500">
              Basis
              <select
                value={rule.basis}
                onChange={(event) => setRule({ ...rule, basis: event.target.value })}
                className="block w-32 px-3 py-2 border border-slate-200 rounded-xl text-sm"
              >
                <option value="FLAT">Flat amount</option>
                <option value="PERCENT">Percent of balance</option>
              </select>
            </label>

            <label className="text-[11px] text-slate-500">
              {rule.basis === 'PERCENT' ? 'Percent' : 'Amount'}
              <input
                type="number"
                step="0.01"
                value={rule.amount}
                onChange={(event) => setRule({ ...rule, amount: event.target.value })}
                className="block w-24 px-3 py-2 border border-slate-200 rounded-xl text-sm"
              />
            </label>

            <label className="text-[11px] text-slate-500">
              Grace days
              <input
                type="number"
                value={rule.grace_days}
                onChange={(event) => setRule({ ...rule, grace_days: event.target.value })}
                className="block w-24 px-3 py-2 border border-slate-200 rounded-xl text-sm"
              />
            </label>

            <button
              onClick={priceFees}
              disabled={busy}
              className="px-3.5 py-2 bg-white hover:bg-slate-50 text-slate-700 font-bold border border-slate-200 rounded-xl text-sm disabled:opacity-50"
            >
              Price it
            </button>
          </div>

          {feePreview && (
            <div className="bg-slate-50 border border-slate-200 rounded-xl p-3">
              {feePreview.chargeable === 0 ? (
                <p className="text-xs text-slate-500">
                  Nothing to charge for {formatPeriod(period)}.
                  {feePreview.skipped > 0 && ` ${feePreview.skipped} flats were already charged this month.`}
                </p>
              ) : (
                <>
                  <p className="text-xs text-slate-600 mb-2">
                    <span className="font-bold">{formatRupees(feePreview.total_fee)}</span> across{' '}
                    {feePreview.chargeable} flats
                    {feePreview.skipped > 0 && `, ${feePreview.skipped} already charged this month`}.
                  </p>
                  <ul className="text-[11px] text-slate-500 space-y-0.5 max-h-32 overflow-y-auto">
                    {feePreview.lines.map((line) => (
                      <li key={line.invoice_id} className={line.already_charged ? 'line-through opacity-50' : ''}>
                        Flat {line.unit_number} · {line.days_overdue} days late · {formatRupees(line.fee)}
                      </li>
                    ))}
                  </ul>
                  <button
                    onClick={chargeFees}
                    disabled={busy}
                    className="mt-3 px-3.5 py-2 bg-slate-900 hover:bg-slate-800 text-white font-bold rounded-xl text-sm disabled:opacity-50"
                  >
                    Charge {formatRupees(feePreview.total_fee)}
                  </button>
                </>
              )}
            </div>
          )}

          <button
            onClick={remind}
            className="flex items-center w-full justify-center px-3.5 py-2.5 bg-white hover:bg-slate-50 text-slate-700 font-bold border border-slate-200 rounded-xl text-sm"
          >
            <BellRing className="w-4 h-4 mr-2" /> Remind the flats behind on {formatPeriod(period)}
          </button>

          <p className="text-[11px] text-slate-400">
            Each reminder reaches only the resident it is about, so a defaulter list never
            becomes a notice to the building.
          </p>
        </div>
      </div>
    </div>
  );
}
