import { useState, useEffect, useCallback } from 'react';
import api from '../../lib/api';
import { formatRupees, formatRupeesShort, formatPeriod, currentPeriod } from '../../lib/money';
import { Download, TrendingDown, TrendingUp, Wallet, PiggyBank, AlertCircle } from 'lucide-react';
import { useFeedback } from '../common/Feedback';

// Written out rather than interpolated, because Tailwind scans for whole class
// names and a colour built from a variable is simply not in the stylesheet.
const TONES = {
  slate: { icon: 'text-slate-600', value: 'text-slate-800' },
  emerald: { icon: 'text-emerald-600', value: 'text-emerald-800' },
  rose: { icon: 'text-rose-600', value: 'text-rose-800' },
  teal: { icon: 'text-teal-600', value: 'text-teal-800' }
};

const Figure = ({ label, value, hint, tone = 'slate', icon: Icon }) => (
  <div className="bg-white border border-slate-200 rounded-2xl p-4">
    <div className="flex items-center gap-2 mb-1.5">
      {Icon && <Icon className={`w-3.5 h-3.5 ${TONES[tone].icon}`} />}
      <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">{label}</span>
    </div>
    <p className={`text-xl font-black ${TONES[tone].value}`}>{formatRupeesShort(value)}</p>
    {hint && <p className="text-[11px] text-slate-500 mt-0.5">{hint}</p>}
  </div>
);

/**
 * The month on a cash basis: what the building actually received and what
 * actually left the account. A bill approved but unpaid is shown apart, because
 * folding it into the closing balance would stop the figure matching the bank.
 */
export default function StatementTab() {
  const { toast } = useFeedback();
  const [period, setPeriod] = useState(currentPeriod());
  const [statement, setStatement] = useState(null);
  const [corpus, setCorpus] = useState(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [st, cp] = await Promise.all([
        api.get(`/api/finance/statement?period=${period}`),
        api.get('/api/finance/corpus')
      ]);
      setStatement(st.data.data);
      setCorpus(cp.data.data);
    } catch (error) {
      console.error('Failed to load the statement', error);
    } finally {
      setLoading(false);
    }
  }, [period]);

  useEffect(() => { load(); }, [load]);

  // The browser cannot follow a plain link here, since the API needs the bearer
  // token. Fetching it as a blob keeps the download inside the signed-in session.
  const downloadCsv = async () => {
    try {
      const response = await api.get(`/api/finance/statement/export?period=${period}`, { responseType: 'blob' });
      const url = URL.createObjectURL(new Blob([response.data], { type: 'text/csv' }));
      const link = document.createElement('a');
      link.href = url;
      link.download = `logapart-${period}.csv`;
      link.click();
      URL.revokeObjectURL(url);
    } catch (error) {
      toast.error('Could not export that month.');
    }
  };

  if (loading) return <p className="text-sm text-slate-400 py-10 text-center">Reading the books...</p>;
  if (!statement) return <p className="text-sm text-slate-400 py-10 text-center">Nothing to show for that month.</p>;

  const spentTotal = statement.spent;

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <input
          type="month"
          value={period}
          onChange={(event) => setPeriod(event.target.value)}
          className="px-3 py-2 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-teal-500/40"
        />
        <button
          onClick={downloadCsv}
          className="flex items-center px-3.5 py-2 bg-white hover:bg-slate-50 text-slate-700 font-semibold border border-slate-200 rounded-xl text-sm transition-colors"
        >
          <Download className="w-4 h-4 mr-2" /> Export {formatPeriod(period)}
        </button>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <Figure label="Opening balance" value={statement.opening_balance} icon={Wallet} />
        <Figure label="Came in" value={statement.collected} tone="emerald" icon={TrendingUp}
          hint={`${statement.payments_recorded} payments recorded`} />
        <Figure label="Went out" value={statement.spent} tone="rose" icon={TrendingDown} />
        <Figure label="Closing balance" value={statement.closing_balance} tone="teal" icon={Wallet} />
      </div>

      {statement.bills_outstanding > 0 && (
        <div className="flex items-start gap-2.5 bg-amber-50 border border-amber-200 rounded-xl px-4 py-3">
          <AlertCircle className="w-4 h-4 text-amber-700 shrink-0 mt-0.5" />
          <p className="text-xs text-amber-900 leading-relaxed">
            <span className="font-bold">{formatRupees(statement.bills_outstanding)}</span> across{' '}
            {statement.bills_outstanding_count} approved bills has not left the account yet, so it is owed
            rather than spent and is not in the closing balance.
          </p>
        </div>
      )}

      <div className="grid lg:grid-cols-3 gap-5">
        <div className="lg:col-span-2 bg-white border border-slate-200 rounded-2xl overflow-hidden">
          <div className="px-5 py-3.5 border-b border-slate-100">
            <h3 className="text-sm font-bold text-slate-800">Where it went</h3>
            <p className="text-[11px] text-slate-500">{formatPeriod(period)}, by category</p>
          </div>

          {spentTotal === 0 ? (
            <p className="px-5 py-10 text-center text-sm text-slate-400">Nothing left the account this month.</p>
          ) : (
            <ul className="divide-y divide-slate-100">
              {statement.by_category.filter((row) => row.spent > 0).map((row) => (
                <li key={row.category} className="px-5 py-3">
                  <div className="flex items-center justify-between mb-1.5">
                    <span className="text-sm font-semibold text-slate-700">{row.label}</span>
                    <span className="text-sm font-bold text-slate-800">{formatRupees(row.spent)}</span>
                  </div>
                  <div className="h-1.5 bg-slate-100 rounded-full overflow-hidden">
                    <div className="h-full bg-teal-500 rounded-full" style={{ width: `${row.share}%` }} />
                  </div>
                  <p className="text-[10px] text-slate-400 mt-1">{row.share}% of the month, {row.bills} bills</p>
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className="bg-white border border-slate-200 rounded-2xl p-5 h-fit">
          <div className="flex items-center gap-2 mb-3">
            <PiggyBank className="w-4 h-4 text-teal-600" />
            <h3 className="text-sm font-bold text-slate-800">Corpus</h3>
          </div>
          <p className="text-[11px] text-slate-500 leading-relaxed mb-3">
            Collected towards the building itself, kept apart from maintenance so the
            two can never be spent as one.
          </p>
          {corpus && (
            <dl className="space-y-2 text-sm">
              {[
                ['Billed', corpus.billed],
                ['Collected', corpus.collected],
                ['Still owed', corpus.outstanding],
                ['Spent from it', corpus.spent]
              ].map(([label, value]) => (
                <div key={label} className="flex justify-between">
                  <dt className="text-slate-500">{label}</dt>
                  <dd className="font-semibold text-slate-700">{formatRupees(value)}</dd>
                </div>
              ))}
              <div className="flex justify-between pt-2 border-t border-slate-100">
                <dt className="font-bold text-slate-700">Balance</dt>
                <dd className="font-black text-teal-700">{formatRupees(corpus.balance)}</dd>
              </div>
            </dl>
          )}
        </div>
      </div>
    </div>
  );
}
