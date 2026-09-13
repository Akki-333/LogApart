import { useState, useEffect, useCallback } from 'react';
import { Link } from 'react-router-dom';
import api from '../../lib/api';
import { formatRupees, formatPeriod, formatDay } from '../../lib/money';
import { Wallet, ChevronDown, CheckCircle2, Receipt, AlertCircle } from 'lucide-react';
import DeclarePayment from '../../components/resident/DeclarePayment';

const STATUS_STYLES = {
  PAID: 'bg-emerald-50 text-emerald-700 border-emerald-200',
  PARTIAL: 'bg-blue-50 text-blue-700 border-blue-200',
  PENDING: 'bg-slate-100 text-slate-600 border-slate-200',
  OVERDUE: 'bg-rose-50 text-rose-700 border-rose-200'
};

export default function ResidentDues() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [expanded, setExpanded] = useState(null);

  const load = useCallback(() => {
    api
      .get('/api/resident/invoices')
      .then((res) => setData(res.data.data))
      .catch((err) => setError(err.response?.data?.message || 'Could not load your bills.'))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => { load(); }, [load]);

  if (loading) {
    return (
      <div className="flex justify-center py-20">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-teal-600"></div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="bg-white rounded-2xl border border-slate-200 p-10 text-center">
        <AlertCircle className="w-8 h-8 mx-auto mb-3 text-amber-500" />
        <p className="text-sm font-semibold text-slate-700">{error}</p>
      </div>
    );
  }

  const owes = data.total_outstanding > 0;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-black text-slate-900">My Dues</h1>
        <p className="text-sm text-slate-500 mt-0.5">
          Every bill raised for Home {data.unit.number}, with what has been paid against it
        </p>
      </div>

      <div className={`rounded-2xl border p-5 ${owes ? 'bg-rose-50 border-rose-200' : 'bg-emerald-50 border-emerald-200'}`}>
        <div className="flex items-center justify-between">
          <div>
            <span className={`text-xs font-bold uppercase tracking-wider ${owes ? 'text-rose-600' : 'text-emerald-700'}`}>
              Total outstanding
            </span>
            <div className={`text-3xl font-black mt-1 ${owes ? 'text-rose-700' : 'text-emerald-800'}`}>
              {formatRupees(data.total_outstanding)}
            </div>
            <p className={`text-xs mt-1 ${owes ? 'text-rose-700/80' : 'text-emerald-800/80'}`}>
              {owes
                ? 'Pay the building office and it will be recorded against these bills.'
                : 'You are fully paid up. Nothing is owed.'}
            </p>
          </div>
          <span className={`p-3 rounded-2xl ${owes ? 'bg-rose-100 text-rose-700' : 'bg-emerald-100 text-emerald-700'}`}>
            <Wallet className="w-6 h-6" />
          </span>
        </div>
      </div>

      {data.invoices.length === 0 ? (
        <div className="bg-white rounded-2xl border border-slate-200 p-12 text-center">
          <Receipt className="w-8 h-8 mx-auto mb-3 text-slate-300" />
          <p className="text-sm font-semibold text-slate-500">No bills have been raised for your home yet.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {data.invoices.map((invoice) => {
            const isOpen = expanded === invoice.id;

            return (
              <div key={invoice.id} className="bg-white rounded-2xl border border-slate-200 shadow-xs overflow-hidden">
                <button
                  onClick={() => setExpanded(isOpen ? null : invoice.id)}
                  className="w-full flex items-center justify-between px-5 py-4 hover:bg-slate-50 transition-colors text-left"
                >
                  <div className="flex items-center gap-4">
                    <div>
                      <div className="text-sm font-bold text-slate-900">{formatPeriod(invoice.period_month)}</div>
                      <div className="text-[11px] text-slate-400">
                        Due {formatDay(invoice.due_date)}
                        {invoice.days_overdue > 0 ? ` · ${invoice.days_overdue} days late` : ''}
                      </div>
                    </div>
                    <span className={`text-[10px] font-bold px-2 py-0.5 rounded border uppercase tracking-wider ${STATUS_STYLES[invoice.display_status]}`}>
                      {invoice.display_status}
                    </span>
                  </div>

                  <div className="flex items-center gap-3">
                    <div className="text-right">
                      <div className="text-sm font-black text-slate-900">{formatRupees(invoice.total_amount)}</div>
                      {invoice.balance > 0 && (
                        <div className="text-[11px] font-semibold text-rose-600">{formatRupees(invoice.balance)} left</div>
                      )}
                    </div>
                    <ChevronDown className={`w-4 h-4 text-slate-400 transition-transform ${isOpen ? 'rotate-180' : ''}`} />
                  </div>
                </button>

                {isOpen && (
                  <div className="px-5 pb-5 pt-1 border-t border-slate-100 space-y-4">
                    <div>
                      <h4 className="text-[10px] font-bold uppercase tracking-wider text-slate-400 mb-2">What you were charged</h4>
                      <div className="space-y-1.5 text-xs">
                        <div className="flex justify-between text-slate-600">
                          <span>Home maintenance</span>
                          <span className="font-semibold">{formatRupees(invoice.maintenance_amount)}</span>
                        </div>
                        <div className="flex justify-between text-slate-600">
                          <span>Your share of common electricity</span>
                          <span className="font-semibold">{formatRupees(invoice.electricity_amount)}</span>
                        </div>
                        <div className="flex justify-between text-slate-600">
                          <span>Your share of common water</span>
                          <span className="font-semibold">{formatRupees(invoice.water_amount)}</span>
                        </div>
                        {invoice.corpus_amount > 0 && (
                          <div className="flex justify-between text-slate-600">
                            <span>Building corpus</span>
                            <span className="font-semibold">{formatRupees(invoice.corpus_amount)}</span>
                          </div>
                        )}
                        {(invoice.adjustments || []).map((adjustment, index) => (
                          <div key={index} className="flex justify-between text-slate-600">
                            <span>
                              {adjustment.kind === 'LATE_FEE' ? 'Late fee' : adjustment.kind.toLowerCase()}
                              <span className="text-slate-400"> · {adjustment.reason}</span>
                            </span>
                            <span className={`font-semibold ${adjustment.amount < 0 ? 'text-emerald-700' : 'text-rose-700'}`}>
                              {formatRupees(adjustment.amount)}
                            </span>
                          </div>
                        ))}
                        <div className="flex justify-between pt-1.5 border-t border-slate-200 text-slate-900">
                          <span className="font-bold">Total</span>
                          <span className="font-black">{formatRupees(invoice.total_amount)}</span>
                        </div>
                      </div>
                      {invoice.run_note && (
                        <p className="text-[11px] text-slate-400 mt-2 italic">{invoice.run_note}</p>
                      )}
                    </div>

                    <div>
                      <h4 className="text-[10px] font-bold uppercase tracking-wider text-slate-400 mb-2">Payments recorded</h4>
                      {!invoice.payments?.length ? (
                        <p className="text-xs text-slate-400">Nothing recorded against this bill yet.</p>
                      ) : (
                        <div className="space-y-1.5">
                          {invoice.payments.map((payment, index) => (
                            <div key={index} className="flex items-center justify-between bg-emerald-50 border border-emerald-200 rounded-lg px-3 py-2 text-xs">
                              <span className="flex items-center gap-1.5 text-emerald-800">
                                <CheckCircle2 className="w-3.5 h-3.5" />
                                <span className="font-bold">{formatRupees(payment.amount)}</span>
                                <span className="capitalize text-emerald-700">
                                  by {payment.mode.replace('_', ' ').toLowerCase()}
                                </span>
                                {payment.reference && <span className="text-emerald-600">· {payment.reference}</span>}
                                {payment.receipt_number && (
                                  <Link to={`/receipts/${payment.receipt_number}`} className="font-mono text-emerald-700 underline decoration-dotted underline-offset-2 hover:text-emerald-900">· {payment.receipt_number}</Link>
                                )}
                              </span>
                              <span className="text-emerald-700">{formatDay(payment.paid_on)}</span>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>

                    {invoice.balance > 0 && <DeclarePayment invoice={invoice} onDeclared={load} />}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
