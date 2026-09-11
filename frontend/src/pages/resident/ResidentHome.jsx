import { useState, useEffect, useContext } from 'react';
import { useNavigate } from 'react-router-dom';
import api from '../../lib/api';
import { AuthContext } from '../../context/AuthContext';
import { formatRupees, formatPeriod, formatDay } from '../../lib/money';
import {
  Wallet, Wrench, ShieldCheck, ArrowRight, Home, KeyRound,
  Clock, CheckCircle2, AlertCircle, Ticket
} from 'lucide-react';

export default function ResidentHome() {
  const { user } = useContext(AuthContext);
  const navigate = useNavigate();
  const [summary, setSummary] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    api
      .get('/api/resident/summary')
      .then((res) => setSummary(res.data.data))
      .catch((err) => setError(err.response?.data?.message || 'Could not load your dashboard.'))
      .finally(() => setLoading(false));
  }, []);

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

  const { unit, dues, tickets, recent_visitors: visitors, active_passes: passes } = summary;
  const owes = dues.balance > 0;

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-black text-slate-900">
            Welcome, {user?.name?.split(' ')[0] || 'Resident'}
          </h1>
          <p className="text-sm text-slate-500 mt-0.5 flex items-center gap-1.5">
            <Home className="w-3.5 h-3.5" />
            Flat {unit.number}, floor {unit.floor}
            {unit.move_in_date ? ` · resident since ${formatDay(unit.move_in_date)}` : ''}
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <button
          onClick={() => navigate('/resident/dues')}
          className={`text-left p-5 rounded-2xl border shadow-xs transition-colors ${
            owes ? 'bg-rose-50 border-rose-200 hover:bg-rose-100' : 'bg-white border-slate-200 hover:bg-slate-50'
          }`}
        >
          <div className="flex justify-between items-start">
            <span className={`text-xs font-bold uppercase tracking-wider ${owes ? 'text-rose-600' : 'text-slate-400'}`}>
              You owe
            </span>
            <span className={`p-2 rounded-xl ${owes ? 'bg-rose-100 text-rose-700' : 'bg-emerald-50 text-emerald-700'}`}>
              <Wallet className="w-4 h-4" />
            </span>
          </div>
          <div className={`text-2xl font-black mt-1 ${owes ? 'text-rose-700' : 'text-slate-900'}`}>
            {formatRupees(dues.balance)}
          </div>
          <span className="text-[11px] text-slate-500">
            {owes ? `${dues.open_invoices} unpaid invoice${dues.open_invoices === 1 ? '' : 's'}` : 'Nothing outstanding'}
          </span>
        </button>

        <button
          onClick={() => navigate('/resident/issues')}
          className="text-left p-5 rounded-2xl border border-slate-200 bg-white shadow-xs hover:bg-slate-50 transition-colors"
        >
          <div className="flex justify-between items-start">
            <span className="text-xs font-bold uppercase tracking-wider text-slate-400">Open issues</span>
            <span className="p-2 bg-amber-50 text-amber-700 rounded-xl"><Wrench className="w-4 h-4" /></span>
          </div>
          <div className="text-2xl font-black text-slate-900 mt-1">{tickets.open_count}</div>
          <span className="text-[11px] text-slate-500">{tickets.total_count} raised in total</span>
        </button>

        <button
          onClick={() => navigate('/resident/gate')}
          className="text-left p-5 rounded-2xl border border-slate-200 bg-white shadow-xs hover:bg-slate-50 transition-colors"
        >
          <div className="flex justify-between items-start">
            <span className="text-xs font-bold uppercase tracking-wider text-slate-400">Expected guests</span>
            <span className="p-2 bg-indigo-50 text-indigo-700 rounded-xl"><Ticket className="w-4 h-4" /></span>
          </div>
          <div className="text-2xl font-black text-slate-900 mt-1">{passes.length}</div>
          <span className="text-[11px] text-slate-500">Pre-approved at the gate</span>
        </button>
      </div>

      {dues.latest && (
        <div className="bg-white rounded-2xl border border-slate-200 shadow-xs p-5">
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-sm font-bold text-slate-900">
              Your {formatPeriod(dues.latest.period_month)} bill
            </h3>
            <button
              onClick={() => navigate('/resident/dues')}
              className="text-xs font-bold text-teal-700 hover:underline flex items-center"
            >
              All bills <ArrowRight className="w-3.5 h-3.5 ml-1" />
            </button>
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            {[
              ['Maintenance', dues.latest.maintenance_amount],
              ['Common electricity', dues.latest.electricity_amount],
              ['Common water', dues.latest.water_amount],
              ['Total', dues.latest.total_amount]
            ].map(([title, amount], index) => (
              <div key={title} className={`p-3 rounded-xl border ${index === 3 ? 'bg-slate-900 border-slate-900' : 'bg-slate-50 border-slate-200'}`}>
                <div className={`text-[10px] font-bold uppercase tracking-wider ${index === 3 ? 'text-slate-400' : 'text-slate-400'}`}>
                  {title}
                </div>
                <div className={`text-sm font-black mt-0.5 ${index === 3 ? 'text-white' : 'text-slate-800'}`}>
                  {formatRupees(amount)}
                </div>
              </div>
            ))}
          </div>
          <p className="text-xs text-slate-500 mt-3">
            {dues.latest.display_status === 'PAID' ? (
              <span className="text-emerald-700 font-semibold flex items-center gap-1">
                <CheckCircle2 className="w-3.5 h-3.5" /> Settled in full
              </span>
            ) : (
              <>Due by {formatDay(dues.latest.due_date)}. Pay the building office and it will be recorded here.</>
            )}
          </p>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        <div className="bg-white rounded-2xl border border-slate-200 shadow-xs p-5">
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-sm font-bold text-slate-900">Recent visitors to your flat</h3>
            <button
              onClick={() => navigate('/resident/gate')}
              className="text-xs font-bold text-indigo-600 hover:underline flex items-center"
            >
              All <ArrowRight className="w-3.5 h-3.5 ml-1" />
            </button>
          </div>

          {visitors.length === 0 ? (
            <div className="text-center py-8 text-xs text-slate-400 border-2 border-dashed border-slate-100 rounded-xl">
              Nothing logged at the gate for your flat yet.
            </div>
          ) : (
            <div className="divide-y divide-slate-100">
              {visitors.map((visitor) => (
                <div key={visitor.id} className="flex items-center justify-between py-2.5">
                  <div>
                    <div className="text-xs font-bold text-slate-800">{visitor.visitor_name}</div>
                    <div className="text-[11px] text-slate-400 capitalize">
                      {visitor.company || visitor.purpose.toLowerCase()}
                    </div>
                  </div>
                  <div className="text-right">
                    {visitor.status === 'ENTERED' ? (
                      <span className="text-[10px] font-bold text-emerald-700 bg-emerald-50 border border-emerald-200 px-2 py-0.5 rounded">
                        INSIDE
                      </span>
                    ) : (
                      <span className="text-[10px] font-semibold text-slate-400">Left</span>
                    )}
                    <div className="text-[11px] text-slate-400 flex items-center justify-end gap-1 mt-0.5">
                      <Clock className="w-3 h-3" />
                      {new Date(visitor.entry_time).toLocaleString('en-IN', {
                        day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit'
                      })}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="bg-white rounded-2xl border border-slate-200 shadow-xs p-5">
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-sm font-bold text-slate-900">Gate passes you have issued</h3>
            <button
              onClick={() => navigate('/resident/gate')}
              className="text-xs font-bold text-indigo-600 hover:underline flex items-center"
            >
              Invite <ArrowRight className="w-3.5 h-3.5 ml-1" />
            </button>
          </div>

          {passes.length === 0 ? (
            <div className="text-center py-8 px-4 border-2 border-dashed border-slate-100 rounded-xl">
              <KeyRound className="w-6 h-6 mx-auto mb-2 text-slate-300" />
              <p className="text-xs text-slate-400 leading-relaxed">
                Pre-approve a guest and they get a gate code, so the guard lets them
                through without calling you.
              </p>
            </div>
          ) : (
            <div className="space-y-2.5">
              {passes.map((pass) => (
                <div key={pass.id} className="flex items-center justify-between bg-indigo-50 border border-indigo-200 rounded-xl px-3.5 py-2.5">
                  <div>
                    <div className="text-xs font-bold text-indigo-900">{pass.visitor_name}</div>
                    <div className="text-[11px] text-indigo-600">Expected {formatDay(pass.expected_on)}</div>
                  </div>
                  <span className="font-mono text-sm font-black tracking-widest text-indigo-900 bg-white border border-indigo-300 px-2.5 py-1 rounded-lg">
                    {pass.pass_code}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      <div className="bg-slate-100 border border-slate-200 rounded-2xl p-4 flex items-start gap-3">
        <ShieldCheck className="w-4 h-4 text-slate-500 shrink-0 mt-0.5" />
        <p className="text-xs text-slate-600 leading-relaxed">
          LogApart records dues rather than collecting them. Settle with the building
          office over UPI, cash or transfer and the payment appears here once recorded.
        </p>
      </div>
    </div>
  );
}
