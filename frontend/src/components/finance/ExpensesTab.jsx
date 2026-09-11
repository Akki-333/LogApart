import { useState, useEffect, useCallback } from 'react';
import api from '../../lib/api';
import { formatRupees, formatDay } from '../../lib/money';
import { Plus, Receipt, Trash2, CheckCircle2, Clock } from 'lucide-react';

const today = () => new Date().toISOString().slice(0, 10);

const BLANK = {
  payee_name: '', vendor_id: '', category: 'REPAIRS', fund: 'MAINTENANCE',
  amount: '', bill_date: today(), paid_on: '', mode: 'BANK_TRANSFER', reference: '', note: ''
};

/** Every bill the building pays, and the ones it still owes. */
export default function ExpensesTab({ onAction }) {
  const [expenses, setExpenses] = useState([]);
  const [totals, setTotals] = useState(null);
  const [categories, setCategories] = useState([]);
  const [vendors, setVendors] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState('ALL');
  const [form, setForm] = useState(BLANK);
  const [isOpen, setIsOpen] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const query = filter === 'ALL' ? '' : `?category=${filter}`;
      const [list, vendorList] = await Promise.all([
        api.get(`/api/finance/expenses${query}`),
        api.get('/api/finance/vendors')
      ]);
      setExpenses(list.data.data);
      setTotals(list.data.totals);
      setCategories(list.data.categories);
      setVendors(vendorList.data.data.filter((vendor) => vendor.is_active));
    } catch (error) {
      console.error('Failed to load expenses', error);
    } finally {
      setLoading(false);
    }
  }, [filter]);

  useEffect(() => { load(); }, [load]);

  const submit = async (event) => {
    event.preventDefault();
    try {
      await api.post('/api/finance/expenses', {
        ...form,
        vendor_id: form.vendor_id || null,
        paid_on: form.paid_on || null,
        amount: Number(form.amount)
      });
      setForm(BLANK);
      setIsOpen(false);
      onAction('Expense recorded.');
      load();
    } catch (error) {
      alert(error.response?.data?.message || 'Could not record that expense');
    }
  };

  const settle = async (expense) => {
    try {
      await api.put(`/api/finance/expenses/${expense.id}`, { paid_on: today() });
      onAction(`Marked the ${expense.payee_name} bill as paid.`);
      load();
    } catch (error) {
      alert(error.response?.data?.message || 'Could not update that expense');
    }
  };

  // Removing a bill needs a reason, which is the only explanation the activity
  // log will carry for money disappearing from the ledger.
  const remove = async (expense) => {
    const reason = window.prompt(`Why is the ${formatRupees(expense.amount)} bill to ${expense.payee_name} being removed?`);
    if (reason === null) return;

    if (reason.trim().length < 4) {
      alert('Record a short reason before removing an expense.');
      return;
    }

    try {
      await api.delete(`/api/finance/expenses/${expense.id}`, { data: { reason: reason.trim() } });
      onAction('Expense removed.');
      load();
    } catch (error) {
      alert(error.response?.data?.message || 'Could not remove that expense');
    }
  };

  const set = (field) => (event) => setForm({ ...form, [field]: event.target.value });

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <select
            value={filter}
            onChange={(event) => setFilter(event.target.value)}
            className="px-3 py-2 border border-slate-200 rounded-xl text-sm bg-white focus:outline-none focus:ring-2 focus:ring-teal-500/40"
          >
            <option value="ALL">Every category</option>
            {categories.map((item) => (
              <option key={item.code} value={item.code}>{item.label}</option>
            ))}
          </select>

          {totals && (
            <p className="text-xs text-slate-500">
              <span className="font-bold text-slate-700">{formatRupees(totals.total)}</span> across {totals.count} bills
              {totals.unpaid > 0 && <span className="text-amber-700">, {formatRupees(totals.unpaid)} still to pay</span>}
            </p>
          )}
        </div>

        <button
          onClick={() => setIsOpen(!isOpen)}
          className="flex items-center px-3.5 py-2 bg-teal-600 hover:bg-teal-700 text-white font-bold rounded-xl text-sm transition-colors"
        >
          <Plus className="w-4 h-4 mr-1.5" /> Record a bill
        </button>
      </div>

      {isOpen && (
        <form onSubmit={submit} className="bg-white border border-slate-200 rounded-2xl p-5 grid md:grid-cols-3 gap-3">
          <select value={form.vendor_id} onChange={set('vendor_id')} className="px-3 py-2 border border-slate-200 rounded-xl text-sm">
            <option value="">Payee not on the registry</option>
            {vendors.map((vendor) => <option key={vendor.id} value={vendor.id}>{vendor.name}</option>)}
          </select>

          <input value={form.payee_name} onChange={set('payee_name')} placeholder="Who was paid"
            className="px-3 py-2 border border-slate-200 rounded-xl text-sm" />

          <select value={form.category} onChange={set('category')} className="px-3 py-2 border border-slate-200 rounded-xl text-sm">
            {categories.map((item) => <option key={item.code} value={item.code}>{item.label}</option>)}
          </select>

          <input type="number" step="0.01" value={form.amount} onChange={set('amount')} placeholder="Amount" required
            className="px-3 py-2 border border-slate-200 rounded-xl text-sm" />

          <label className="text-xs text-slate-500">
            Bill date
            <input type="date" value={form.bill_date} onChange={set('bill_date')} required
              className="w-full px-3 py-2 border border-slate-200 rounded-xl text-sm" />
          </label>

          <label className="text-xs text-slate-500">
            Paid on, if it has been
            <input type="date" value={form.paid_on} onChange={set('paid_on')}
              className="w-full px-3 py-2 border border-slate-200 rounded-xl text-sm" />
          </label>

          <select value={form.fund} onChange={set('fund')} className="px-3 py-2 border border-slate-200 rounded-xl text-sm">
            <option value="MAINTENANCE">From maintenance</option>
            <option value="CORPUS">From the corpus</option>
          </select>

          <input value={form.reference} onChange={set('reference')} placeholder="Reference"
            className="px-3 py-2 border border-slate-200 rounded-xl text-sm" />

          <button type="submit" className="px-4 py-2 bg-slate-900 hover:bg-slate-800 text-white font-bold rounded-xl text-sm">
            Record it
          </button>
        </form>
      )}

      <div className="bg-white border border-slate-200 rounded-2xl overflow-hidden">
        {loading ? (
          <p className="px-5 py-10 text-center text-sm text-slate-400">Reading the ledger...</p>
        ) : expenses.length === 0 ? (
          <div className="px-5 py-12 text-center">
            <Receipt className="w-8 h-8 text-slate-300 mx-auto mb-3" />
            <p className="text-sm font-semibold text-slate-600">Nothing recorded yet</p>
          </div>
        ) : (
          <ul className="divide-y divide-slate-100">
            {expenses.map((expense) => (
              <li key={expense.id} className="px-5 py-3 flex flex-wrap items-center gap-3">
                <div className="flex-1 min-w-[200px]">
                  <p className="text-sm font-semibold text-slate-800">{expense.payee_name}</p>
                  <p className="text-[11px] text-slate-500">
                    {expense.category_label} · billed {formatDay(expense.bill_date)}
                    {expense.ticket_title && <span> · against {expense.ticket_title}</span>}
                    {expense.fund === 'CORPUS' && <span className="text-teal-700 font-semibold"> · from the corpus</span>}
                  </p>
                </div>

                <span className="text-sm font-bold text-slate-800">{formatRupees(expense.amount)}</span>

                {expense.is_settled ? (
                  <span className="flex items-center gap-1 text-[10px] font-bold uppercase tracking-wider text-emerald-700">
                    <CheckCircle2 className="w-3.5 h-3.5" /> Paid {formatDay(expense.paid_on)}
                  </span>
                ) : (
                  <button
                    onClick={() => settle(expense)}
                    className="flex items-center gap-1 text-[10px] font-bold uppercase tracking-wider text-amber-700 hover:text-amber-900"
                  >
                    <Clock className="w-3.5 h-3.5" /> Mark paid
                  </button>
                )}

                <button onClick={() => remove(expense)} className="p-1.5 text-slate-300 hover:text-rose-600 transition-colors">
                  <Trash2 className="w-4 h-4" />
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
