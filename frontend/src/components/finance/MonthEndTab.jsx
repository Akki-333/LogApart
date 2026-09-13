import { useState, useEffect, useCallback, useId } from 'react';
import { useNavigate } from 'react-router-dom';
import api from '../../lib/api';
import { formatRupees, currentPeriod } from '../../lib/money';
import { SkeletonList } from '../common/Skeleton';
import { CheckCircle2, Circle, ArrowRight } from 'lucide-react';

/**
 * The month-end close as one checklist. Raising dues, clearing declared
 * payments, recording the bills, chasing the homes behind and sending the
 * committee its statement happen on four screens; this is where a treasurer
 * sees whether they have all happened.
 *
 * Nothing on it can be ticked by hand. Every step is read from the records the
 * work leaves behind, so a full list means the work was done, not that somebody
 * said it was.
 */
export default function MonthEndTab({ onOpenTab }) {
  const navigate = useNavigate();
  const monthId = useId();
  const [period, setPeriod] = useState(currentPeriod());
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const response = await api.get(`/api/finance/close?period=${period}`);
      setData(response.data.data);
    } catch (error) {
      console.error('Failed to load the month-end checklist', error);
      setData(null);
    } finally {
      setLoading(false);
    }
  }, [period]);

  useEffect(() => { load(); }, [load]);

  const open = (where) => {
    if (where.startsWith('books:')) onOpenTab(where.slice('books:'.length));
    else navigate(`/admin/${where}`);
  };

  const share = data ? Math.round((data.done / data.total) * 100) : 0;

  return (
    <div className="bg-white rounded-2xl border border-slate-200 shadow-xs">
      <div className="p-5 border-b border-slate-100 flex flex-wrap items-end justify-between gap-4">
        <div>
          <h2 className="text-sm font-bold text-slate-900">Closing the month</h2>
          <p className="text-xs text-slate-500 mt-0.5">Each tick comes from the records themselves, not from a box somebody checked</p>
        </div>
        <div>
          <label htmlFor={monthId} className="block text-[10px] font-bold uppercase tracking-wider text-slate-500 mb-1">Month</label>
          <input
            id={monthId}
            type="month"
            value={period}
            max={currentPeriod()}
            onChange={(event) => event.target.value && setPeriod(event.target.value)}
            className="px-3 py-2 border border-slate-200 rounded-xl text-sm"
          />
        </div>
      </div>

      {loading ? (
        <div className="p-5"><SkeletonList rows={5} label="Checking the month" /></div>
      ) : !data ? (
        <p className="p-8 text-center text-sm text-slate-400">Could not read that month.</p>
      ) : (
        <>
          <div className="px-5 pt-4">
            <div className="flex justify-between text-xs mb-1.5">
              <span className="font-semibold text-slate-700">{data.done} of {data.total} done</span>
              <span className={data.done === data.total ? 'font-bold text-emerald-700' : 'text-slate-400'}>
                {data.done === data.total ? 'Ready to close' : 'Still open'}
              </span>
            </div>
            <div
              className="w-full bg-slate-100 rounded-full h-2 overflow-hidden"
              role="progressbar"
              aria-valuemin={0}
              aria-valuemax={data.total}
              aria-valuenow={data.done}
              aria-label="Month-end steps done"
            >
              <div className="h-2 rounded-full bg-emerald-500 transition-all duration-500" style={{ width: `${share}%` }} />
            </div>
          </div>

          <ol className="divide-y divide-slate-100 mt-3">
            {data.steps.map((step) => (
              <li key={step.key} className="px-5 py-3.5 flex flex-wrap items-center gap-3">
                {step.done ? (
                  <CheckCircle2 className="w-5 h-5 text-emerald-600 shrink-0" aria-label="Done" />
                ) : (
                  <Circle className="w-5 h-5 text-slate-300 shrink-0" aria-label="Not done" />
                )}
                <div className="flex-1 min-w-[200px]">
                  <p className={`text-sm font-semibold ${step.done ? 'text-slate-500' : 'text-slate-900'}`}>{step.label}</p>
                  <p className="text-xs text-slate-500">
                    {step.detail}
                    {step.amount > 0 && `, ${formatRupees(step.amount)}`}
                  </p>
                </div>
                {!step.done && (
                  <button
                    type="button"
                    onClick={() => open(step.where)}
                    className="inline-flex items-center gap-1 px-3 py-1.5 text-xs font-bold text-teal-800 bg-teal-50 hover:bg-teal-100 border border-teal-200 rounded-lg"
                  >
                    Go there <ArrowRight className="w-3.5 h-3.5" aria-hidden="true" />
                  </button>
                )}
              </li>
            ))}
          </ol>
        </>
      )}
    </div>
  );
}
