import { useState } from 'react';
import api from '../../lib/api';
import { formatRupees } from '../../lib/money';
import { Send, Clock, CheckCircle2, XCircle } from 'lucide-react';

const STATUS = {
  PENDING: { icon: Clock, style: 'bg-amber-50 border-amber-200 text-amber-800', label: 'Waiting to be confirmed' },
  VERIFIED: { icon: CheckCircle2, style: 'bg-emerald-50 border-emerald-200 text-emerald-800', label: 'Confirmed' },
  REJECTED: { icon: XCircle, style: 'bg-rose-50 border-rose-200 text-rose-800', label: 'Not confirmed' }
};

/**
 * Telling the building about a payment already made.
 *
 * This does not pay anything and does not move the balance. It is a message,
 * and the screen says so plainly, because a resident who thinks a bill is
 * settled when it is not will be surprised by a late fee.
 */
export default function DeclarePayment({ invoice, onDeclared }) {
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({
    amount: invoice.balance,
    mode: 'UPI',
    reference: '',
    paid_on: new Date().toISOString().slice(0, 10)
  });
  const [busy, setBusy] = useState(false);

  const existing = invoice.declarations || [];
  const pending = existing.find((entry) => entry.status === 'PENDING');

  const submit = async (event) => {
    event.preventDefault();
    setBusy(true);

    try {
      await api.post('/api/resident/declarations', {
        invoice_id: invoice.id,
        amount: Number(form.amount),
        mode: form.mode,
        reference: form.reference || null,
        paid_on: form.paid_on
      });
      setOpen(false);
      onDeclared();
    } catch (error) {
      alert(error.response?.data?.message || 'Could not send that to the building');
    } finally {
      setBusy(false);
    }
  };

  const set = (field) => (event) => setForm({ ...form, [field]: event.target.value });

  return (
    <div>
      <h4 className="text-[10px] font-bold uppercase tracking-wider text-slate-400 mb-2">Already paid this?</h4>

      {existing.length > 0 && (
        <div className="space-y-1.5 mb-3">
          {existing.map((entry) => {
            const look = STATUS[entry.status];
            const Icon = look.icon;

            return (
              <div key={entry.id} className={`flex items-center justify-between border rounded-lg px-3 py-2 text-xs ${look.style}`}>
                <span className="flex items-center gap-1.5">
                  <Icon className="w-3.5 h-3.5" />
                  <span className="font-bold">{formatRupees(entry.amount)}</span>
                  <span>{look.label}</span>
                  {entry.review_note && <span>· {entry.review_note}</span>}
                </span>
                <span className="capitalize">{entry.mode.replace('_', ' ').toLowerCase()}</span>
              </div>
            );
          })}
        </div>
      )}

      {pending ? (
        <p className="text-[11px] text-slate-500">
          The building has your message and will confirm it against the account. The balance
          above will not change until they do.
        </p>
      ) : !open ? (
        <button
          onClick={() => setOpen(true)}
          className="flex items-center px-3.5 py-2 bg-white hover:bg-slate-50 text-slate-700 font-bold border border-slate-200 rounded-xl text-xs transition-colors"
        >
          <Send className="w-3.5 h-3.5 mr-1.5" /> Tell the building you have paid
        </button>
      ) : (
        <form onSubmit={submit} className="bg-slate-50 border border-slate-200 rounded-xl p-3 space-y-2">
          <div className="grid grid-cols-2 gap-2">
            <label className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
              Amount
              <input
                type="number" step="0.01" value={form.amount} onChange={set('amount')} required
                className="w-full mt-1 px-3 py-2 border border-slate-200 rounded-lg text-sm font-normal normal-case tracking-normal"
              />
            </label>

            <label className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
              How you paid
              <select
                value={form.mode} onChange={set('mode')}
                className="w-full mt-1 px-3 py-2 border border-slate-200 rounded-lg text-sm font-normal normal-case tracking-normal"
              >
                <option value="UPI">UPI</option>
                <option value="BANK_TRANSFER">Bank transfer</option>
                <option value="CASH">Cash</option>
                <option value="CHEQUE">Cheque</option>
                <option value="OTHER">Something else</option>
              </select>
            </label>

            <label className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
              Reference
              <input
                value={form.reference} onChange={set('reference')} placeholder="UPI or transaction id"
                className="w-full mt-1 px-3 py-2 border border-slate-200 rounded-lg text-sm font-normal normal-case tracking-normal"
              />
            </label>

            <label className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
              Paid on
              <input
                type="date" value={form.paid_on} onChange={set('paid_on')} required
                className="w-full mt-1 px-3 py-2 border border-slate-200 rounded-lg text-sm font-normal normal-case tracking-normal"
              />
            </label>
          </div>

          <p className="text-[11px] text-slate-500">
            This is a message to the building, not a payment. Your balance changes only once
            they confirm it against the account.
          </p>

          <div className="flex gap-2">
            <button
              type="submit" disabled={busy}
              className="px-3.5 py-2 bg-teal-600 hover:bg-teal-700 text-white font-bold rounded-xl text-xs disabled:opacity-50"
            >
              Send it
            </button>
            <button
              type="button" onClick={() => setOpen(false)}
              className="px-3.5 py-2 bg-white hover:bg-slate-100 text-slate-600 font-bold border border-slate-200 rounded-xl text-xs"
            >
              Cancel
            </button>
          </div>
        </form>
      )}
    </div>
  );
}
