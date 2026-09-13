import { useState } from 'react';
import StatementTab from '../components/finance/StatementTab';
import ExpensesTab from '../components/finance/ExpensesTab';
import VendorsTab from '../components/finance/VendorsTab';
import BudgetTab from '../components/finance/BudgetTab';
import MonthEndTab from '../components/finance/MonthEndTab';
import { BookOpen, Receipt, Building, Target, CheckCircle2, ListChecks } from 'lucide-react';

const TABS = [
  { key: 'STATEMENT', label: 'Statement', icon: BookOpen, blurb: 'What came in, what went out, what is left' },
  { key: 'EXPENSES', label: 'Expenses', icon: Receipt, blurb: 'Every bill the building pays, by category' },
  { key: 'VENDORS', label: 'Vendors', icon: Building, blurb: 'Who is paid, and the contracts that lapse' },
  { key: 'BUDGET', label: 'Budget', icon: Target, blurb: 'What was planned against what was spent' },
  { key: 'CLOSE', label: 'Month end', icon: ListChecks, blurb: 'Whether this month is done, read from the work itself' }
];

/**
 * The other half of the ledger. Dues and collection live on the Billing screen.
 * This is the money going out, and the picture a committee is asked for at the
 * annual meeting.
 */
export default function Books() {
  const [tab, setTab] = useState('STATEMENT');
  const [banner, setBanner] = useState('');

  const announce = (message) => {
    setBanner(message);
    setTimeout(() => setBanner(''), 5000);
  };

  const active = TABS.find((item) => item.key === tab);

  return (
    <div className="max-w-7xl mx-auto space-y-6 pb-12">
      <div>
        <h1 className="text-2xl font-black text-slate-900">The Books</h1>
        <p className="text-sm text-slate-500 mt-0.5">{active.blurb}</p>
      </div>

      <div className="flex flex-wrap items-center gap-1 bg-slate-100 p-1 rounded-xl border border-slate-200 w-fit">
        {TABS.map((item) => (
          <button
            key={item.key}
            onClick={() => setTab(item.key)}
            className={`flex items-center px-3.5 py-2 rounded-lg text-xs font-bold transition-colors ${
              tab === item.key ? 'bg-white text-teal-700 shadow-xs' : 'text-slate-500 hover:text-slate-800'
            }`}
          >
            <item.icon className="w-3.5 h-3.5 mr-1.5" />
            {item.label}
          </button>
        ))}
      </div>

      {banner && (
        <div className="flex items-center gap-2.5 bg-emerald-50 border border-emerald-200 rounded-xl px-4 py-3">
          <CheckCircle2 className="w-4 h-4 text-emerald-700 shrink-0" />
          <p className="text-sm font-semibold text-emerald-900">{banner}</p>
        </div>
      )}

      {tab === 'STATEMENT' && <StatementTab />}
      {tab === 'CLOSE' && <MonthEndTab onOpenTab={setTab} />}
      {tab === 'EXPENSES' && <ExpensesTab onAction={announce} />}
      {tab === 'VENDORS' && <VendorsTab onAction={announce} />}
      {tab === 'BUDGET' && <BudgetTab onAction={announce} />}
    </div>
  );
}
