import { useState, useEffect, useCallback } from 'react';
import api from '../../lib/api';
import { formatRupees } from '../../lib/money';
import { Target, Save } from 'lucide-react';
import { useFeedback } from '../common/Feedback';

// April to March. A year is named for the April it began in.
const financialYears = () => {
  const now = new Date();
  const start = now.getMonth() >= 3 ? now.getFullYear() : now.getFullYear() - 1;
  return [start + 1, start, start - 1, start - 2].map((year) => `${year}-${year + 1}`);
};

/**
 * Budget against actual, measured on what was incurred rather than what was
 * paid. A committee that underspends in March by paying in April has saved
 * nobody anything, so the bill date is what counts here.
 */
export default function BudgetTab({ onAction }) {
  const { toast } = useFeedback();
  const years = financialYears();
  const [year, setYear] = useState(years[1]);
  const [budget, setBudget] = useState(null);
  const [drafts, setDrafts] = useState({});
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const response = await api.get(`/api/finance/budget?financial_year=${year}`);
      setBudget(response.data.data);
      setDrafts({});
    } catch (error) {
      console.error('Failed to load the budget', error);
    } finally {
      setLoading(false);
    }
  }, [year]);

  useEffect(() => { load(); }, [load]);

  const save = async (category) => {
    const amount = Number(drafts[category]);

    if (!Number.isFinite(amount) || amount < 0) {
      toast.error('Enter a figure for that line.');
      return;
    }

    try {
      await api.post('/api/finance/budget', { financial_year: year, category, amount });
      onAction('Budget line saved.');
      load();
    } catch (error) {
      toast.error(error.response?.data?.message || 'Could not save that line');
    }
  };

  if (loading) return <p className="text-sm text-slate-400 py-10 text-center">Reading the budget...</p>;
  if (!budget) return null;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <select
          value={year}
          onChange={(event) => setYear(event.target.value)}
          className="px-3 py-2 border border-slate-200 rounded-xl text-sm bg-white focus:outline-none focus:ring-2 focus:ring-teal-500/40"
        >
          {years.map((option) => <option key={option} value={option}>{option}</option>)}
        </select>

        <p className="text-xs text-slate-500">
          <span className="font-bold text-slate-700">{formatRupees(budget.totals.spent)}</span> spent of{' '}
          <span className="font-bold text-slate-700">{formatRupees(budget.totals.budget)}</span> planned
        </p>
      </div>

      <div className="bg-white border border-slate-200 rounded-2xl overflow-hidden">
        <div className="px-5 py-3.5 border-b border-slate-100 flex items-center gap-2">
          <Target className="w-4 h-4 text-teal-600" />
          <h3 className="text-sm font-bold text-slate-800">Budget against actual</h3>
        </div>

        <ul className="divide-y divide-slate-100">
          {budget.lines.map((line) => (
            <li key={line.category} className="px-5 py-3">
              <div className="flex flex-wrap items-center gap-3">
                <span className="flex-1 min-w-[140px] text-sm font-semibold text-slate-700">{line.label}</span>

                <input
                  type="number"
                  step="1"
                  value={drafts[line.category] ?? (line.budget || '')}
                  onChange={(event) => setDrafts({ ...drafts, [line.category]: event.target.value })}
                  placeholder="Not budgeted"
                  className="w-32 px-3 py-1.5 border border-slate-200 rounded-lg text-sm text-right"
                />

                <button
                  onClick={() => save(line.category)}
                  className="p-1.5 text-slate-400 hover:text-teal-700 transition-colors"
                  title="Save this line"
                >
                  <Save className="w-4 h-4" />
                </button>

                <span className="w-28 text-right text-sm font-bold text-slate-800">{formatRupees(line.spent)}</span>

                <span
                  className={`w-24 text-right text-xs font-bold ${
                    line.over_budget ? 'text-rose-700' : 'text-slate-400'
                  }`}
                >
                  {line.used_percent === null ? 'unplanned' : `${line.used_percent}% used`}
                </span>
              </div>

              {line.budget > 0 && (
                <div className="h-1.5 bg-slate-100 rounded-full overflow-hidden mt-2">
                  <div
                    className={`h-full rounded-full ${line.over_budget ? 'bg-rose-500' : 'bg-teal-500'}`}
                    style={{ width: `${Math.min(100, line.used_percent || 0)}%` }}
                  />
                </div>
              )}
            </li>
          ))}
        </ul>
      </div>

      <p className="text-[11px] text-slate-400">
        Measured on the bill date rather than the payment date, so a March bill paid in
        April still belongs to the year it was incurred in.
      </p>
    </div>
  );
}
