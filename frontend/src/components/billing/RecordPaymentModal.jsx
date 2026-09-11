import { useState, useEffect } from 'react';
import api from '../../lib/api';
import { formatRupees, formatDay, formatPeriod } from '../../lib/money';
import { X, IndianRupee, Receipt, Clock } from 'lucide-react';

const MODES = [
  { value: 'UPI', label: 'UPI' },
  { value: 'CASH', label: 'Cash' },
  { value: 'BANK_TRANSFER', label: 'Bank transfer' },
  { value: 'CHEQUE', label: 'Cheque' },
  { value: 'OTHER', label: 'Other' }
];

const today = () => new Date().toISOString().slice(0, 10);

/**
 * Records money that has already arrived. LogApart is the building's ledger,
 * not a payment gateway, so this writes down a settlement rather than taking one.
 */
export default function RecordPaymentModal({ invoiceId, isOpen, onClose, onRecorded }) {
  const [invoice, setInvoice] = useState(null);
  const [form, setForm] = useState({ amount: '', mode: 'UPI', reference: '', paid_on: today(), note: '' });
  const [error, setError] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  const [isLoading, setIsLoading] = useState(false);

  useEffect(() => {
    if (!isOpen || !invoiceId) return;

    const load = async () => {
      setIsLoading(true);
      setError('');
      try {
        const res = await api.get(`/api/billing/invoices/${invoiceId}`);
        setInvoice(res.data.data);
        // Default to clearing the balance, the common case.
        setForm((prev) => ({ ...prev, amount: String(res.data.data.balance), paid_on: today() }));
      } catch (err) {
        setError(err.response?.data?.message || 'Could not load this invoice.');
      } finally {
        setIsLoading(false);
      }
    };

    load();
  }, [isOpen, invoiceId]);

  if (!isOpen) return null;

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setIsSaving(true);

    try {
      const res = await api.post(`/api/billing/invoices/${invoiceId}/payments`, {
        amount: Number(form.amount),
        mode: form.mode,
        reference: form.reference || null,
        paid_on: form.paid_on,
        note: form.note || null
      });
      onRecorded(res.data.message);
      onClose();
    } catch (err) {
      setError(err.response?.data?.message || 'Could not record this payment.');
      setIsSaving(false);
    }
  };

  const field =
    'mt-1 w-full px-3 py-2 bg-white border border-slate-300 rounded-lg text-sm outline-none focus:border-teal-500 focus:ring-1 focus:ring-teal-500 transition-colors';
  const label = 'block text-xs font-bold uppercase tracking-wider text-slate-500';

  return (
    <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg border border-slate-200 overflow-hidden flex flex-col max-h-[92vh]">
        <div className="flex justify-between items-center px-6 py-5 border-b border-slate-100 bg-slate-50 shrink-0">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-emerald-100 text-emerald-800 rounded-xl">
              <IndianRupee className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-lg font-bold text-slate-800">Record a payment</h2>
              <p className="text-xs text-slate-500">
                {invoice ? `Flat ${invoice.unit_number}, ${formatPeriod(invoice.period_month)}` : 'Loading invoice...'}
              </p>
            </div>
          </div>
          <button onClick={onClose} className="p-1.5 text-slate-400 hover:text-slate-600 hover:bg-slate-200 rounded-full transition-colors">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto">
          {isLoading && (
            <div className="flex justify-center py-12">
              <div className="animate-spin rounded-full h-7 w-7 border-b-2 border-teal-600"></div>
            </div>
          )}

          {invoice && (
            <form onSubmit={handleSubmit} className="p-6 space-y-5">
              {error && (
                <div className="bg-rose-50 border-l-4 border-rose-500 p-3 rounded-r-md">
                  <p className="text-sm text-rose-700">{error}</p>
                </div>
              )}

              <div className="bg-slate-50 border border-slate-200 rounded-xl p-4 space-y-2">
                <div className="flex justify-between text-xs text-slate-600">
                  <span>Maintenance</span>
                  <span className="font-semibold">{formatRupees(invoice.maintenance_amount)}</span>
                </div>
                <div className="flex justify-between text-xs text-slate-600">
                  <span>Common electricity</span>
                  <span className="font-semibold">{formatRupees(invoice.electricity_amount)}</span>
                </div>
                <div className="flex justify-between text-xs text-slate-600">
                  <span>Common water</span>
                  <span className="font-semibold">{formatRupees(invoice.water_amount)}</span>
                </div>
                <div className="flex justify-between text-sm pt-2 border-t border-slate-200">
                  <span className="font-bold text-slate-800">Invoice total</span>
                  <span className="font-bold text-slate-900">{formatRupees(invoice.total_amount)}</span>
                </div>
                {invoice.amount_paid > 0 && (
                  <div className="flex justify-between text-xs text-emerald-700">
                    <span>Already paid</span>
                    <span className="font-semibold">{formatRupees(invoice.amount_paid)}</span>
                  </div>
                )}
                <div className="flex justify-between text-sm pt-2 border-t border-slate-200">
                  <span className="font-bold text-slate-800">Balance</span>
                  <span className="font-black text-teal-800">{formatRupees(invoice.balance)}</span>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className={label}>Amount received</label>
                  <input
                    type="number" required min="0.01" step="0.01" max={invoice.balance}
                    value={form.amount}
                    onChange={(e) => setForm({ ...form, amount: e.target.value })}
                    className={field}
                  />
                  <p className="mt-1 text-[11px] text-slate-500">Part payments are allowed.</p>
                </div>
                <div>
                  <label className={label}>Received on</label>
                  <input
                    type="date" required value={form.paid_on}
                    onChange={(e) => setForm({ ...form, paid_on: e.target.value })}
                    className={field}
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className={label}>Paid by</label>
                  <select value={form.mode} onChange={(e) => setForm({ ...form, mode: e.target.value })} className={field}>
                    {MODES.map((m) => (
                      <option key={m.value} value={m.value}>{m.label}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className={label}>Reference</label>
                  <input
                    type="text" maxLength={100} placeholder="UPI ref or cheque no."
                    value={form.reference}
                    onChange={(e) => setForm({ ...form, reference: e.target.value })}
                    className={field}
                  />
                </div>
              </div>

              <div>
                <label className={label}>Note (optional)</label>
                <input
                  type="text" maxLength={255} placeholder="e.g. Collected at the office"
                  value={form.note}
                  onChange={(e) => setForm({ ...form, note: e.target.value })}
                  className={field}
                />
              </div>

              {invoice.payments.length > 0 && (
                <div className="border-t border-slate-100 pt-4">
                  <h3 className="text-xs font-bold uppercase tracking-wider text-slate-500 mb-2.5 flex items-center gap-1.5">
                    <Receipt className="w-3.5 h-3.5" />
                    Already recorded
                  </h3>
                  <div className="space-y-2">
                    {invoice.payments.map((payment) => (
                      <div key={payment.id} className="flex items-center justify-between bg-slate-50 border border-slate-200 rounded-lg px-3 py-2">
                        <div>
                          <span className="text-xs font-bold text-slate-800">{formatRupees(payment.amount)}</span>
                          <span className="text-[11px] text-slate-500 ml-2">{payment.mode.replace('_', ' ').toLowerCase()}</span>
                          {payment.reference && <span className="text-[11px] text-slate-400 ml-2">{payment.reference}</span>}
                        </div>
                        <span className="text-[11px] text-slate-400 flex items-center gap-1">
                          <Clock className="w-3 h-3" />
                          {formatDay(payment.paid_on)}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              <div className="flex justify-end gap-3 pt-2">
                <button type="button" onClick={onClose} className="px-4 py-2.5 text-sm font-bold text-slate-600 hover:text-slate-800 transition-colors">
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isSaving}
                  className="px-5 py-2.5 bg-emerald-600 hover:bg-emerald-700 disabled:bg-slate-300 text-white text-sm font-bold rounded-xl transition-colors"
                >
                  {isSaving ? 'Saving...' : 'Record payment'}
                </button>
              </div>
            </form>
          )}
        </div>
      </div>
    </div>
  );
}
