import { useState, useEffect, useCallback, useId } from 'react';
import api from '../../lib/api';
import { downloadFile } from '../../lib/download';
import { currentPeriod } from '../../lib/money';
import { useFeedback } from '../common/Feedback';
import { SkeletonList } from '../common/Skeleton';
import { Download, AlertTriangle, RefreshCw } from 'lucide-react';

const today = () => new Date().toISOString().slice(0, 10);
const daysAgo = (n) => new Date(Date.now() - n * 86400000).toISOString().slice(0, 10);

const MONTHLY = [
  { key: 'collections', title: 'Collections', blurb: 'What each home was billed and has paid' },
  { key: 'staff-pay', title: 'Staff pay', blurb: 'Attendance and indicative pay for the month' },
  { key: 'helper-attendance', title: 'Helper attendance', blurb: 'Days present and every visit' }
];

const RANGED = [
  { key: 'gate', title: 'Gate traffic', blurb: 'Every visitor in the range, at most a year' },
  { key: 'sla-breaches', title: 'SLA breaches', blurb: 'Tickets that missed their target' }
];

/**
 * The reports a committee circulates, in one place. Every download is written
 * to the activity log on the server, because each of them names people.
 */
export default function ReportsTab() {
  const fieldId = useId();
  const { toast } = useFeedback();
  const [month, setMonth] = useState(currentPeriod());
  const [from, setFrom] = useState(daysAgo(30));
  const [to, setTo] = useState(today());
  const [breaches, setBreaches] = useState(null);
  const [sweeping, setSweeping] = useState(false);

  const loadBreaches = useCallback(async () => {
    try {
      const response = await api.get(`/api/tickets/sla/breaches?from=${from}&to=${to}`);
      setBreaches(response.data.data);
    } catch (error) {
      setBreaches([]);
      toast.error(error.response?.data?.message || 'Could not read the breach report.');
    }
  }, [from, to, toast]);

  useEffect(() => { loadBreaches(); }, [loadBreaches]);

  const download = async (url, filename) => {
    try {
      await downloadFile(url, filename);
    } catch {
      toast.error('Could not build that report.');
    }
  };

  const sweep = async () => {
    setSweeping(true);
    try {
      const response = await api.post('/api/tickets/sla/escalate', {});
      toast.info(response.data.message);
      loadBreaches();
    } catch (error) {
      toast.error(error.response?.data?.message || 'Could not run the check.');
    } finally {
      setSweeping(false);
    }
  };

  const field = 'px-3 py-2 bg-white border border-slate-300 rounded-lg text-sm';
  const card = 'bg-white rounded-2xl border border-slate-200 p-4 flex items-center justify-between gap-3';
  const button = 'inline-flex items-center px-3 py-2 text-xs font-bold text-teal-800 bg-teal-50 hover:bg-teal-100 border border-teal-200 rounded-xl shrink-0';

  return (
    <div className="space-y-6">
      <section className="space-y-3">
        <div className="flex flex-wrap items-center gap-3">
          <h2 className="text-sm font-bold text-slate-900">Monthly</h2>
          <label htmlFor={`${fieldId}-month`} className="sr-only">Month</label>
          <input id={`${fieldId}-month`} type="month" value={month} max={currentPeriod()} onChange={(event) => event.target.value && setMonth(event.target.value)} className={field} />
        </div>
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {MONTHLY.map((report) => (
            <div key={report.key} className={card}>
              <div>
                <p className="text-sm font-bold text-slate-800">{report.title}</p>
                <p className="text-xs text-slate-500">{report.blurb}</p>
              </div>
              <button type="button" className={button} onClick={() => download(`/api/exports/${report.key}.csv?month=${month}`, `logapart-${report.key}-${month}.csv`)}>
                <Download className="w-3.5 h-3.5 mr-1" aria-hidden="true" /> CSV
              </button>
            </div>
          ))}
          <div className={card}>
            <div>
              <p className="text-sm font-bold text-slate-800">Defaulters</p>
              <p className="text-xs text-slate-500">Every home with a balance today</p>
            </div>
            <button type="button" className={button} onClick={() => download('/api/exports/defaulters.csv', `logapart-defaulters-${today()}.csv`)}>
              <Download className="w-3.5 h-3.5 mr-1" aria-hidden="true" /> CSV
            </button>
          </div>
        </div>
      </section>

      <section className="space-y-3">
        <div className="flex flex-wrap items-center gap-3">
          <h2 className="text-sm font-bold text-slate-900">Date range</h2>
          <label htmlFor={`${fieldId}-from`} className="text-xs text-slate-500">From</label>
          <input id={`${fieldId}-from`} type="date" value={from} max={to} onChange={(event) => event.target.value && setFrom(event.target.value)} className={field} />
          <label htmlFor={`${fieldId}-to`} className="text-xs text-slate-500">to</label>
          <input id={`${fieldId}-to`} type="date" value={to} min={from} max={today()} onChange={(event) => event.target.value && setTo(event.target.value)} className={field} />
        </div>
        <div className="grid sm:grid-cols-2 gap-3">
          {RANGED.map((report) => (
            <div key={report.key} className={card}>
              <div>
                <p className="text-sm font-bold text-slate-800">{report.title}</p>
                <p className="text-xs text-slate-500">{report.blurb}</p>
              </div>
              <button type="button" className={button} onClick={() => download(`/api/exports/${report.key}.csv?from=${from}&to=${to}`, `logapart-${report.key}-${from}-to-${to}.csv`)}>
                <Download className="w-3.5 h-3.5 mr-1" aria-hidden="true" /> CSV
              </button>
            </div>
          ))}
        </div>
      </section>

      <section className="bg-white rounded-2xl border border-slate-200 overflow-hidden">
        <div className="px-5 py-3.5 border-b border-slate-100 flex items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <AlertTriangle className="w-4 h-4 text-rose-600" aria-hidden="true" />
            <h2 className="text-sm font-bold text-slate-800">Tickets that missed their SLA in the range</h2>
          </div>
          <button type="button" onClick={sweep} disabled={sweeping} className="inline-flex items-center text-xs font-bold text-slate-600 hover:text-teal-700 disabled:opacity-60">
            <RefreshCw className={`w-3.5 h-3.5 mr-1 ${sweeping ? 'animate-spin' : ''}`} aria-hidden="true" /> Check now
          </button>
        </div>
        {!breaches ? (
          <div className="p-5"><SkeletonList rows={3} label="Loading breaches" /></div>
        ) : breaches.length === 0 ? (
          <p className="px-5 py-8 text-center text-sm text-slate-400">Every ticket in the range met its target.</p>
        ) : (
          <ul className="divide-y divide-slate-100">
            {breaches.map((ticket) => (
              <li key={ticket.id} className="px-5 py-3 flex flex-wrap items-center justify-between gap-2">
                <div>
                  <p className="text-sm font-semibold text-slate-800">{ticket.title}</p>
                  <p className="text-xs text-slate-500">{ticket.place} · {ticket.priority.toLowerCase()} · {ticket.status.toLowerCase().replace('_', ' ')}</p>
                </div>
                <span className="text-xs font-bold text-rose-700">{ticket.hours_late}h over its {ticket.sla_hours}h target</span>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
