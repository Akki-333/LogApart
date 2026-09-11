import { useState, useEffect, useCallback } from 'react';
import api from '../lib/api';
import GenerateDuesModal from '../components/billing/GenerateDuesModal';
import RecordPaymentModal from '../components/billing/RecordPaymentModal';
import CollectionActions from '../components/billing/CollectionActions';
import { formatRupees, formatRupeesShort, formatPeriod, formatDay, currentPeriod } from '../lib/money';
import {
  Wallet, Calculator, TrendingUp, AlertCircle, RefreshCw, Trash2,
  IndianRupee, CheckCircle2, Phone, Search, FileText
} from 'lucide-react';

const AGING_LABELS = {
  CURRENT: 'Not yet due',
  DAYS_1_30: '1 to 30 days',
  DAYS_31_60: '31 to 60 days',
  DAYS_61_90: '61 to 90 days',
  DAYS_90_PLUS: 'Over 90 days'
};

const STATUS_STYLES = {
  PAID: 'bg-emerald-50 text-emerald-700 border-emerald-200',
  PARTIAL: 'bg-blue-50 text-blue-700 border-blue-200',
  PENDING: 'bg-slate-100 text-slate-600 border-slate-200',
  OVERDUE: 'bg-rose-50 text-rose-700 border-rose-200'
};

const StatusPill = ({ status }) => (
  <span className={`text-[10px] font-bold px-2 py-0.5 rounded border uppercase tracking-wider ${STATUS_STYLES[status] || STATUS_STYLES.PENDING}`}>
    {status}
  </span>
);

export default function Billing() {
  const [period, setPeriod] = useState(currentPeriod());
  const [overview, setOverview] = useState(null);
  const [invoices, setInvoices] = useState([]);
  const [runs, setRuns] = useState([]);
  const [loading, setLoading] = useState(true);
  const [banner, setBanner] = useState('');

  const [statusFilter, setStatusFilter] = useState('ALL');
  const [search, setSearch] = useState('');

  const [isGenerateOpen, setIsGenerateOpen] = useState(false);
  const [payingInvoiceId, setPayingInvoiceId] = useState(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [ov, inv, rn] = await Promise.all([
        api.get(`/api/billing/overview?period=${period}`),
        api.get(`/api/billing/invoices?period=${period}`),
        api.get('/api/billing/runs')
      ]);
      setOverview(ov.data.data);
      setInvoices(inv.data.data);
      setRuns(rn.data.data);
    } catch (err) {
      console.error('Failed to load billing data', err);
    } finally {
      setLoading(false);
    }
  }, [period]);

  useEffect(() => {
    load();
  }, [load]);

  const announce = (message) => {
    setBanner(message);
    load();
    setTimeout(() => setBanner(''), 5000);
  };

  const handleDeleteRun = async (run) => {
    const confirmed = window.confirm(
      `Delete the ${formatPeriod(run.period_month)} run and all ${run.units_billed} invoices it raised?`
    );
    if (!confirmed) return;

    try {
      await api.delete(`/api/billing/runs/${run.id}`);
      announce('Billing run removed.');
    } catch (err) {
      alert(err.response?.data?.message || 'Could not delete that run.');
    }
  };

  const activeRun = runs.find((r) => String(r.period_month).slice(0, 7) === period);

  const visibleInvoices = invoices.filter((invoice) => {
    if (statusFilter !== 'ALL' && invoice.display_status !== statusFilter) return false;
    if (!search.trim()) return true;
    const q = search.toLowerCase();
    return (
      invoice.unit_number?.toLowerCase().includes(q) ||
      invoice.resident_name?.toLowerCase().includes(q)
    );
  });

  return (
    <div className="max-w-7xl mx-auto space-y-7 pb-12">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-black text-slate-900">Building Finances</h1>
          <p className="text-sm text-slate-500 mt-0.5">
            Monthly dues, the shared electricity and water split, and what has actually been collected
          </p>
        </div>

        <div className="flex items-center gap-2.5">
          <input
            type="month"
            value={period}
            onChange={(e) => setPeriod(e.target.value)}
            className="px-3 py-2 bg-white border border-slate-200 rounded-xl text-sm font-semibold text-slate-700 outline-none focus:border-teal-500"
          />
          <button
            onClick={load}
            title="Refresh"
            className="p-2.5 bg-white border border-slate-200 text-slate-600 hover:text-teal-700 hover:bg-teal-50 rounded-xl transition-colors"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
          </button>
          <button
            onClick={() => setIsGenerateOpen(true)}
            className="flex items-center px-4 py-2.5 bg-teal-600 hover:bg-teal-700 text-white text-sm font-bold rounded-xl transition-colors shadow-sm"
          >
            <Calculator className="w-4 h-4 mr-2" />
            Generate Dues
          </button>
        </div>
      </div>

      {banner && (
        <div className="flex items-center gap-2.5 bg-emerald-50 border border-emerald-200 rounded-xl px-4 py-3">
          <CheckCircle2 className="w-4 h-4 text-emerald-700 shrink-0" />
          <p className="text-sm font-semibold text-emerald-900">{banner}</p>
        </div>
      )}

      <div className="grid grid-cols-1 sm:grid-cols-4 gap-4">
        <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-xs">
          <div className="flex justify-between items-start">
            <span className="text-xs font-bold uppercase tracking-wider text-slate-400">Billed</span>
            <span className="p-2 bg-slate-100 text-slate-600 rounded-xl"><FileText className="w-4 h-4" /></span>
          </div>
          <div className="text-2xl font-black text-slate-900 mt-1">{formatRupeesShort(overview?.month.billed)}</div>
          <span className="text-[11px] text-slate-500">{overview?.month.invoice_count || 0} invoices, {formatPeriod(period)}</span>
        </div>

        <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-xs">
          <div className="flex justify-between items-start">
            <span className="text-xs font-bold uppercase tracking-wider text-emerald-600">Collected</span>
            <span className="p-2 bg-emerald-50 text-emerald-700 rounded-xl"><TrendingUp className="w-4 h-4" /></span>
          </div>
          <div className="text-2xl font-black text-emerald-700 mt-1">{formatRupeesShort(overview?.month.collected)}</div>
          <div className="mt-2">
            <div className="w-full bg-slate-100 rounded-full h-1.5 overflow-hidden">
              <div
                className="bg-emerald-600 h-1.5 rounded-full transition-all duration-500"
                style={{ width: `${overview?.month.collection_rate || 0}%` }}
              ></div>
            </div>
            <span className="text-[11px] text-slate-500 mt-1 inline-block">
              {overview?.month.collection_rate || 0}% collected, {overview?.month.settled_count || 0} flats settled
            </span>
          </div>
        </div>

        <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-xs">
          <div className="flex justify-between items-start">
            <span className="text-xs font-bold uppercase tracking-wider text-amber-600">Outstanding</span>
            <span className="p-2 bg-amber-50 text-amber-700 rounded-xl"><Wallet className="w-4 h-4" /></span>
          </div>
          <div className="text-2xl font-black text-amber-700 mt-1">{formatRupeesShort(overview?.month.outstanding)}</div>
          <span className="text-[11px] text-slate-500">For {formatPeriod(period)}</span>
        </div>

        <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-xs">
          <div className="flex justify-between items-start">
            <span className="text-xs font-bold uppercase tracking-wider text-rose-600">Owed, all months</span>
            <span className="p-2 bg-rose-50 text-rose-700 rounded-xl"><AlertCircle className="w-4 h-4" /></span>
          </div>
          <div className="text-2xl font-black text-rose-700 mt-1">{formatRupeesShort(overview?.all_time_outstanding)}</div>
          <span className="text-[11px] text-slate-500">{overview?.defaulters.length || 0} flats with a balance</span>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="bg-white rounded-2xl border border-slate-200 shadow-xs p-5">
          <h3 className="text-sm font-bold text-slate-900 mb-1">How long money has been owed</h3>
          <p className="text-xs text-slate-400 mb-4">Across every month, not just this one</p>
          <div className="space-y-2.5">
            {Object.entries(AGING_LABELS).map(([key, text]) => {
              const amount = overview?.aging[key] || 0;
              const total = overview?.all_time_outstanding || 0;
              const share = total > 0 ? Math.round((amount / total) * 100) : 0;

              return (
                <div key={key}>
                  <div className="flex justify-between text-xs mb-1">
                    <span className={amount > 0 ? 'font-semibold text-slate-700' : 'text-slate-400'}>{text}</span>
                    <span className={amount > 0 ? 'font-bold text-slate-900' : 'text-slate-400'}>{formatRupees(amount)}</span>
                  </div>
                  <div className="w-full bg-slate-100 rounded-full h-1.5 overflow-hidden">
                    <div
                      className={`h-1.5 rounded-full transition-all duration-500 ${
                        key === 'CURRENT' ? 'bg-slate-400' : key === 'DAYS_90_PLUS' ? 'bg-rose-600' : 'bg-amber-500'
                      }`}
                      style={{ width: `${share}%` }}
                    ></div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        <div className="lg:col-span-2 bg-white rounded-2xl border border-slate-200 shadow-xs p-5">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h3 className="text-sm font-bold text-slate-900">Flats with an open balance</h3>
              <p className="text-xs text-slate-400">Longest outstanding first</p>
            </div>
            <span className="text-xs font-bold text-rose-700 bg-rose-50 border border-rose-200 px-2.5 py-1 rounded-full">
              {overview?.defaulters.length || 0} flats
            </span>
          </div>

          {!overview?.defaulters.length ? (
            <div className="text-center py-10 text-xs text-slate-400 border-2 border-dashed border-slate-100 rounded-xl">
              Nothing outstanding. Every raised invoice has been settled.
            </div>
          ) : (
            <div className="max-h-64 overflow-y-auto divide-y divide-slate-100">
              {overview.defaulters.map((flat) => (
                <div key={flat.unit_id} className="flex items-center justify-between py-2.5">
                  <div className="flex items-center gap-3">
                    <span className="w-11 h-11 rounded-xl bg-slate-100 flex items-center justify-center text-sm font-black text-slate-700">
                      {flat.unit_number}
                    </span>
                    <div>
                      <div className="text-xs font-bold text-slate-800">{flat.resident_name || 'No resident on record'}</div>
                      <div className="text-[11px] text-slate-400 flex items-center gap-1">
                        {flat.resident_phone ? (<><Phone className="w-3 h-3" />{flat.resident_phone}</>) : 'No phone'}
                        <span className="mx-1">•</span>
                        {flat.open_invoices} invoice{flat.open_invoices === 1 ? '' : 's'}
                      </div>
                    </div>
                  </div>
                  <div className="text-right">
                    <div className="text-sm font-black text-slate-900">{formatRupees(flat.balance)}</div>
                    <div className={`text-[11px] font-semibold ${flat.days_overdue > 0 ? 'text-rose-600' : 'text-slate-400'}`}>
                      {flat.days_overdue > 0 ? `${flat.days_overdue} days late` : 'Not yet due'}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      <CollectionActions period={period} onChanged={load} />

      <div className="bg-white rounded-2xl border border-slate-200 shadow-xs overflow-hidden">
        <div className="p-5 border-b border-slate-100 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <h3 className="text-sm font-bold text-slate-900">Invoices for {formatPeriod(period)}</h3>
            {activeRun ? (
              <p className="text-xs text-slate-400">
                Raised {formatDay(activeRun.created_at)} by {activeRun.generated_by}
                {activeRun.note ? ` • ${activeRun.note}` : ''}
              </p>
            ) : (
              <p className="text-xs text-slate-400">No dues generated for this month yet</p>
            )}
          </div>

          <div className="flex items-center gap-2.5">
            <div className="relative">
              <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                placeholder="Flat or resident"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="pl-8 pr-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-medium outline-none focus:bg-white focus:border-teal-500 w-44"
              />
            </div>
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className="px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold text-slate-700 outline-none cursor-pointer focus:border-teal-500"
            >
              <option value="ALL">All statuses</option>
              <option value="PENDING">Pending</option>
              <option value="PARTIAL">Part paid</option>
              <option value="OVERDUE">Overdue</option>
              <option value="PAID">Paid</option>
            </select>
            {activeRun && (
              <button
                onClick={() => handleDeleteRun(activeRun)}
                title="Delete this run"
                className="p-2 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-xl transition-colors"
              >
                <Trash2 className="w-4 h-4" />
              </button>
            )}
          </div>
        </div>

        {loading ? (
          <div className="flex justify-center py-16">
            <div className="animate-spin rounded-full h-7 w-7 border-b-2 border-teal-600"></div>
          </div>
        ) : visibleInvoices.length === 0 ? (
          <div className="text-center py-16 px-6">
            <Wallet className="w-8 h-8 mx-auto mb-3 text-slate-300" />
            <p className="text-sm font-semibold text-slate-500">
              {invoices.length === 0 ? 'No invoices for this month.' : 'No invoices match those filters.'}
            </p>
            {invoices.length === 0 && (
              <p className="text-xs text-slate-400 mt-1">
                Use Generate Dues to raise this month's bills across the occupied flats.
              </p>
            )}
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-slate-50 border-b border-slate-200">
                <tr className="text-left text-[10px] uppercase tracking-wider text-slate-500">
                  <th className="px-5 py-3 font-bold">Flat</th>
                  <th className="px-5 py-3 font-bold">Resident</th>
                  <th className="px-5 py-3 font-bold text-right">Maintenance</th>
                  <th className="px-5 py-3 font-bold text-right">Electricity</th>
                  <th className="px-5 py-3 font-bold text-right">Water</th>
                  <th className="px-5 py-3 font-bold text-right">Total</th>
                  <th className="px-5 py-3 font-bold text-right">Balance</th>
                  <th className="px-5 py-3 font-bold">Status</th>
                  <th className="px-5 py-3 font-bold text-right">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {visibleInvoices.map((invoice) => (
                  <tr key={invoice.id} className="hover:bg-slate-50 transition-colors">
                    <td className="px-5 py-3 font-black text-slate-800">{invoice.unit_number}</td>
                    <td className="px-5 py-3">
                      <div className="text-xs font-semibold text-slate-700">{invoice.resident_name || 'Not recorded'}</div>
                      <div className="text-[11px] text-slate-400">Due {formatDay(invoice.due_date)}</div>
                    </td>
                    <td className="px-5 py-3 text-right text-xs text-slate-600">{formatRupees(invoice.maintenance_amount)}</td>
                    <td className="px-5 py-3 text-right text-xs text-slate-600">{formatRupees(invoice.electricity_amount)}</td>
                    <td className="px-5 py-3 text-right text-xs text-slate-600">{formatRupees(invoice.water_amount)}</td>
                    <td className="px-5 py-3 text-right text-xs font-bold text-slate-900">{formatRupees(invoice.total_amount)}</td>
                    <td className="px-5 py-3 text-right text-xs font-bold text-slate-900">
                      {invoice.balance > 0 ? formatRupees(invoice.balance) : <span className="text-emerald-600">Settled</span>}
                    </td>
                    <td className="px-5 py-3">
                      <StatusPill status={invoice.display_status} />
                      {invoice.days_overdue > 0 && (
                        <div className="text-[11px] text-rose-600 font-semibold mt-0.5">{invoice.days_overdue}d late</div>
                      )}
                    </td>
                    <td className="px-5 py-3 text-right">
                      {invoice.balance > 0 ? (
                        <button
                          onClick={() => setPayingInvoiceId(invoice.id)}
                          className="inline-flex items-center px-3 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold rounded-lg transition-colors"
                        >
                          <IndianRupee className="w-3 h-3 mr-1" />
                          Record
                        </button>
                      ) : (
                        <span className="inline-flex items-center text-xs font-semibold text-emerald-700">
                          <CheckCircle2 className="w-3.5 h-3.5 mr-1" />
                          Paid
                        </span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <GenerateDuesModal
        isOpen={isGenerateOpen}
        onClose={() => setIsGenerateOpen(false)}
        onGenerated={announce}
      />

      <RecordPaymentModal
        invoiceId={payingInvoiceId}
        isOpen={Boolean(payingInvoiceId)}
        onClose={() => setPayingInvoiceId(null)}
        onRecorded={announce}
      />
    </div>
  );
}
