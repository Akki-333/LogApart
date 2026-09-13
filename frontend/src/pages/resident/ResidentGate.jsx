import { useState, useEffect, useId } from 'react';
import api from '../../lib/api';
import { formatDay } from '../../lib/money';
import { useFeedback } from '../../components/common/Feedback';
import useDialog from '../../components/common/useDialog';
import {
  ShieldCheck, Plus, X, KeyRound, Copy, Check, Clock,
  Trash2, AlertCircle, Ticket
} from 'lucide-react';

const PURPOSES = [
  { value: 'GUEST', label: 'Guest' },
  { value: 'SERVICE', label: 'Service or repair' },
  { value: 'DELIVERY', label: 'Delivery' },
  { value: 'MAID', label: 'Daily help' },
  { value: 'OTHER', label: 'Other' }
];

const tomorrow = () => new Date(Date.now() + 86400000).toISOString().slice(0, 10);

export default function ResidentGate() {
  const { dialogRef, dialogProps, titleId } = useDialog(isOpen, () => setIsOpen(false));
  const fieldId = useId();
  const { toast, confirm } = useFeedback();
  const [passes, setPasses] = useState([]);
  const [visitors, setVisitors] = useState([]);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState('PASSES');
  const [isOpen, setIsOpen] = useState(false);
  const [form, setForm] = useState({ visitor_name: '', visitor_phone: '', purpose: 'GUEST', vehicle_number: '', expected_on: tomorrow() });
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState('');
  const [issued, setIssued] = useState(null);
  const [copied, setCopied] = useState(false);

  const load = () => {
    setLoading(true);
    Promise.all([api.get('/api/resident/passes'), api.get('/api/resident/visitors')])
      .then(([p, v]) => {
        setPasses(p.data.data);
        setVisitors(v.data.data);
      })
      .catch((err) => console.error('Failed to load gate data', err))
      .finally(() => setLoading(false));
  };

  useEffect(load, []);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setFormError('');
    setSaving(true);

    try {
      const res = await api.post('/api/resident/passes', form);
      setIssued(res.data.data);
      setIsOpen(false);
      setForm({ visitor_name: '', visitor_phone: '', purpose: 'GUEST', vehicle_number: '', expected_on: tomorrow() });
      load();
    } catch (err) {
      setFormError(err.response?.data?.message || 'Could not create this pass.');
    } finally {
      setSaving(false);
    }
  };

  const handleCancel = async (pass) => {
    const go = await confirm({
      title: `Cancel the pass for ${pass.visitor_name}?`,
      message: 'Their code stops working at the gate straight away.',
      confirmLabel: 'Cancel the pass',
      tone: 'danger'
    });
    if (!go) return;

    try {
      await api.delete(`/api/resident/passes/${pass.id}`);
      load();
    } catch (err) {
      toast.error(err.response?.data?.message || 'Could not cancel that pass.');
    }
  };

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(
        `Your gate code for my building is ${issued.pass_code}. Show it at the gate on ${issued.expected_on}.`
      );
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      setCopied(false);
    }
  };

  const upcoming = passes.filter((p) => p.status === 'APPROVED' && !p.entry_time);
  const field =
    'mt-1 w-full px-3 py-2 bg-white border border-slate-300 rounded-lg text-sm outline-none focus:border-teal-500 focus:ring-1 focus:ring-teal-500 transition-colors';
  const label = 'block text-xs font-bold uppercase tracking-wider text-slate-500';

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-black text-slate-900">My Gate</h1>
          <p className="text-sm text-slate-500 mt-0.5">
            Who has visited your home, and guests you have pre-approved
          </p>
        </div>
        <button
          onClick={() => setIsOpen(true)}
          className="flex items-center px-4 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-bold rounded-xl transition-colors shadow-sm w-fit"
        >
          <Plus className="w-4 h-4 mr-2" />
          Pre-approve a guest
        </button>
      </div>

      {issued && (
        <div className="bg-indigo-50 border border-indigo-200 rounded-2xl p-5">
          <div className="flex items-start justify-between gap-4">
            <div>
              <h3 className="text-sm font-bold text-indigo-900 flex items-center gap-1.5">
                <KeyRound className="w-4 h-4" />
                {issued.visitor_name} is pre-approved
              </h3>
              <p className="text-xs text-indigo-700 mt-1 leading-relaxed">
                Send them this code. The guard types it at the gate and lets them
                straight through on {formatDay(issued.expected_on)}.
              </p>
              <div className="flex items-center gap-2.5 mt-3">
                <span className="font-mono text-2xl font-black tracking-[0.3em] text-indigo-900 bg-white border-2 border-indigo-300 px-4 py-2 rounded-xl">
                  {issued.pass_code}
                </span>
                <button
                  onClick={handleCopy}
                  className="flex items-center px-3 py-2 bg-white hover:bg-indigo-100 text-indigo-800 text-xs font-bold border border-indigo-300 rounded-xl transition-colors"
                >
                  {copied ? <Check className="w-3.5 h-3.5 mr-1.5 text-emerald-600" /> : <Copy className="w-3.5 h-3.5 mr-1.5" />}
                  {copied ? 'Copied' : 'Copy message'}
                </button>
              </div>
            </div>
            <button onClick={() => setIssued(null)} className="p-1.5 text-indigo-400 hover:text-indigo-700 rounded-full transition-colors">
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>
      )}

      <div className="flex items-center bg-slate-100 p-1 rounded-xl border border-slate-200 w-fit">
        {[
          ['PASSES', `Expected guests (${upcoming.length})`],
          ['HISTORY', 'Gate history']
        ].map(([key, text]) => (
          <button
            key={key}
            onClick={() => setTab(key)}
            className={`px-4 py-1.5 rounded-lg text-xs font-bold transition-colors ${
              tab === key ? 'bg-white text-indigo-700 shadow-xs' : 'text-slate-500 hover:text-slate-800'
            }`}
          >
            {text}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="flex justify-center py-16">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-teal-600"></div>
        </div>
      ) : tab === 'PASSES' ? (
        upcoming.length === 0 ? (
          <div className="bg-white rounded-2xl border border-slate-200 p-12 text-center">
            <Ticket className="w-8 h-8 mx-auto mb-3 text-slate-300" />
            <p className="text-sm font-semibold text-slate-500">No guests pre-approved right now.</p>
            <p className="text-xs text-slate-400 mt-1 max-w-sm mx-auto leading-relaxed">
              Expecting someone? Give them a code and the guard will not need to call you
              when they arrive.
            </p>
          </div>
        ) : (
          <div className="space-y-3">
            {upcoming.map((pass) => (
              <div key={pass.id} className="bg-white rounded-2xl border border-slate-200 shadow-xs p-4 flex items-center justify-between">
                <div className="flex items-center gap-4">
                  <span className="font-mono text-base font-black tracking-widest text-indigo-900 bg-indigo-50 border border-indigo-200 px-3 py-2 rounded-xl">
                    {pass.pass_code}
                  </span>
                  <div>
                    <div className="text-sm font-bold text-slate-900">{pass.visitor_name}</div>
                    <div className="text-[11px] text-slate-400">
                      Expected {formatDay(pass.expected_on)}
                      <span className="capitalize"> · {String(pass.purpose).toLowerCase()}</span>
                      {pass.visitor_phone ? ` · ${pass.visitor_phone}` : ''}
                    </div>
                  </div>
                </div>
                <button
                  onClick={() => handleCancel(pass)}
                  title="Cancel this pass"
                  className="p-2 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-xl transition-colors"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
            ))}
          </div>
        )
      ) : visitors.length === 0 ? (
        <div className="bg-white rounded-2xl border border-slate-200 p-12 text-center">
          <ShieldCheck className="w-8 h-8 mx-auto mb-3 text-slate-300" />
          <p className="text-sm font-semibold text-slate-500">Nothing logged at the gate for your home yet.</p>
        </div>
      ) : (
        <div className="bg-white rounded-2xl border border-slate-200 shadow-xs divide-y divide-slate-100">
          {visitors.map((visitor) => (
            <div key={visitor.id} className="flex items-center justify-between px-5 py-3">
              <div>
                <div className="text-sm font-bold text-slate-800">{visitor.visitor_name}</div>
                <div className="text-[11px] text-slate-400 capitalize">
                  {visitor.company || String(visitor.purpose).toLowerCase()}
                  {visitor.vehicle_number ? ` · ${visitor.vehicle_number}` : ''}
                  {visitor.pass_code ? ' · pre-approved' : ''}
                </div>
              </div>
              <div className="text-right">
                {visitor.status === 'ENTERED' ? (
                  <span className="text-[10px] font-bold text-emerald-700 bg-emerald-50 border border-emerald-200 px-2 py-0.5 rounded">INSIDE</span>
                ) : visitor.status === 'APPROVED' ? (
                  <span className="text-[10px] font-bold text-indigo-700 bg-indigo-50 border border-indigo-200 px-2 py-0.5 rounded">EXPECTED</span>
                ) : visitor.status === 'DENIED' ? (
                  <span className="text-[10px] font-bold text-slate-500 bg-slate-100 border border-slate-200 px-2 py-0.5 rounded">CANCELLED</span>
                ) : (
                  <span className="text-[10px] font-semibold text-slate-400">LEFT</span>
                )}
                <div className="text-[11px] text-slate-400 flex items-center justify-end gap-1 mt-0.5">
                  <Clock className="w-3 h-3" />
                  {visitor.entry_time
                    ? new Date(visitor.entry_time).toLocaleString('en-IN', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })
                    : formatDay(visitor.expected_on)}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {isOpen && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div ref={dialogRef} {...dialogProps} className="bg-white rounded-2xl shadow-2xl w-full max-w-lg border border-slate-200 overflow-hidden">
            <div className="flex justify-between items-center px-6 py-5 border-b border-slate-100 bg-slate-50">
              <div className="flex items-center gap-3">
                <div className="p-2 bg-indigo-100 text-indigo-800 rounded-xl">
                  <KeyRound className="w-5 h-5" />
                </div>
                <div>
                  <h2 id={titleId} className="text-lg font-bold text-slate-800">Pre-approve a guest</h2>
                  <p className="text-xs text-slate-500">They get a code to show at the gate</p>
                </div>
              </div>
              <button onClick={() => setIsOpen(false)} className="p-1.5 text-slate-400 hover:text-slate-600 hover:bg-slate-200 rounded-full transition-colors">
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSubmit} className="p-6 space-y-4">
              {formError && (
                <div className="bg-rose-50 border-l-4 border-rose-500 p-3 rounded-r-md">
                  <p className="text-sm text-rose-700">{formError}</p>
                </div>
              )}

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className={label} htmlFor={`${fieldId}-who-is-visiting`}>Who is visiting</label>
                  <input id={`${fieldId}-who-is-visiting`}
                    type="text" required maxLength={255} placeholder="Full name"
                    value={form.visitor_name}
                    onChange={(e) => setForm({ ...form, visitor_name: e.target.value })}
                    className={field}
                  />
                </div>
                <div>
                  <label className={label} htmlFor={`${fieldId}-expected-on`}>Expected on</label>
                  <input id={`${fieldId}-expected-on`}
                    type="date" required min={new Date().toISOString().slice(0, 10)}
                    value={form.expected_on}
                    onChange={(e) => setForm({ ...form, expected_on: e.target.value })}
                    className={field}
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className={label} htmlFor={`${fieldId}-their-phone`}>Their phone</label>
                  <input id={`${fieldId}-their-phone`}
                    type="tel" maxLength={20} placeholder="Optional"
                    value={form.visitor_phone}
                    onChange={(e) => setForm({ ...form, visitor_phone: e.target.value })}
                    className={field}
                  />
                </div>
                <div>
                  <label className={label} htmlFor={`${fieldId}-reason`}>Reason</label>
                  <select id={`${fieldId}-reason`} value={form.purpose} onChange={(e) => setForm({ ...form, purpose: e.target.value })} className={field}>
                    {PURPOSES.map((purpose) => (
                      <option key={purpose.value} value={purpose.value}>{purpose.label}</option>
                    ))}
                  </select>
                </div>
              </div>

              <div>
                <label className={label} htmlFor={`${fieldId}-vehicle-number`}>Vehicle number</label>
                <input id={`${fieldId}-vehicle-number`}
                  type="text" maxLength={50} placeholder="Optional, e.g. TN 09 AB 1234"
                  value={form.vehicle_number}
                  onChange={(e) => setForm({ ...form, vehicle_number: e.target.value.toUpperCase() })}
                  className={field}
                />
              </div>

              <div className="flex items-start gap-2.5 bg-slate-50 border border-slate-200 rounded-xl p-3">
                <AlertCircle className="w-4 h-4 text-slate-500 shrink-0 mt-0.5" />
                <p className="text-xs text-slate-600 leading-relaxed">
                  The pass works once. You can cancel it any time before they arrive.
                </p>
              </div>

              <div className="flex justify-end gap-3 pt-1">
                <button type="button" onClick={() => setIsOpen(false)} className="px-4 py-2.5 text-sm font-bold text-slate-600 hover:text-slate-800 transition-colors">
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={saving}
                  className="px-5 py-2.5 bg-indigo-600 hover:bg-indigo-700 disabled:bg-slate-300 text-white text-sm font-bold rounded-xl transition-colors"
                >
                  {saving ? 'Creating...' : 'Create the pass'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
