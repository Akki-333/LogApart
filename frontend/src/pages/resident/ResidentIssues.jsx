import { useState, useEffect, useId } from 'react';
import api from '../../lib/api';
import TicketConversation from '../../components/tickets/TicketConversation';
import { formatDay } from '../../lib/money';
import { Wrench, Plus, X, CheckCircle2, Clock, AlertCircle, Info, Building2, Home } from 'lucide-react';
import useDialog from '../../components/common/useDialog';

const CATEGORIES = [
  { value: 'PLUMBING', label: 'Plumbing or seepage' },
  { value: 'ELECTRICAL', label: 'Electrical or common lighting' },
  { value: 'LIFT', label: 'Lift' },
  { value: 'WATER_SUPPLY', label: 'Water supply or pump' },
  { value: 'STRUCTURAL', label: 'Structural or civil' },
  { value: 'SECURITY', label: 'Gate, doors or security' },
  { value: 'GENERAL', label: 'Something else' }
];

const STATUS_STYLES = {
  OPEN: 'bg-rose-50 text-rose-700 border-rose-200',
  IN_PROGRESS: 'bg-amber-50 text-amber-700 border-amber-200',
  RESOLVED: 'bg-emerald-50 text-emerald-700 border-emerald-200',
  CLOSED: 'bg-slate-100 text-slate-600 border-slate-200'
};

export default function ResidentIssues() {
  const { dialogRef, dialogProps, titleId } = useDialog(isOpen, () => setIsOpen(false));
  const fieldId = useId();
  const [tickets, setTickets] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [banner, setBanner] = useState('');
  const [isOpen, setIsOpen] = useState(false);
  const [form, setForm] = useState({ scope: 'COMMON', location: '', title: '', description: '', category: 'PLUMBING' });
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState('');
  const [openTicket, setOpenTicket] = useState(null);

  const load = () => {
    setLoading(true);
    api
      .get('/api/resident/tickets')
      .then((res) => setTickets(res.data.data))
      .catch((err) => setError(err.response?.data?.message || 'Could not load your issues.'))
      .finally(() => setLoading(false));
  };

  useEffect(load, []);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setFormError('');
    setSaving(true);

    try {
      const res = await api.post('/api/resident/tickets', form);
      setBanner(res.data.message);
      setIsOpen(false);
      setForm({ scope: 'COMMON', location: '', title: '', description: '', category: 'PLUMBING' });
      load();
      setTimeout(() => setBanner(''), 5000);
    } catch (err) {
      setFormError(err.response?.data?.message || 'Could not report this issue.');
    } finally {
      setSaving(false);
    }
  };

  const field =
    'mt-1 w-full px-3 py-2 bg-white border border-slate-300 rounded-lg text-sm outline-none focus:border-teal-500 focus:ring-1 focus:ring-teal-500 transition-colors';
  const label = 'block text-xs font-bold uppercase tracking-wider text-slate-500';

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-black text-slate-900">Report an Issue</h1>
          <p className="text-sm text-slate-500 mt-0.5">
            Structural and shared problems: leaks, the lift, common lighting, the water pump
          </p>
        </div>
        <button
          onClick={() => setIsOpen(true)}
          className="flex items-center px-4 py-2.5 bg-teal-600 hover:bg-teal-700 text-white text-sm font-bold rounded-xl transition-colors shadow-sm w-fit"
        >
          <Plus className="w-4 h-4 mr-2" />
          Report an issue
        </button>
      </div>

      {banner && (
        <div className="flex items-center gap-2.5 bg-emerald-50 border border-emerald-200 rounded-xl px-4 py-3">
          <CheckCircle2 className="w-4 h-4 text-emerald-700 shrink-0" />
          <p className="text-sm font-semibold text-emerald-900">{banner}</p>
        </div>
      )}

      <div className="bg-slate-100 border border-slate-200 rounded-2xl p-4 flex items-start gap-3">
        <Info className="w-4 h-4 text-slate-500 shrink-0 mt-0.5" />
        <p className="text-xs text-slate-600 leading-relaxed">
          This is for the building itself, not for what is inside your home. A leaking
          wall, a stuck lift or a dead hallway light belong here. Your own fridge or air
          conditioner does not.
        </p>
      </div>

      {loading ? (
        <div className="flex justify-center py-16">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-teal-600"></div>
        </div>
      ) : error ? (
        <div className="bg-white rounded-2xl border border-slate-200 p-10 text-center">
          <AlertCircle className="w-8 h-8 mx-auto mb-3 text-amber-500" />
          <p className="text-sm font-semibold text-slate-700">{error}</p>
        </div>
      ) : tickets.length === 0 ? (
        <div className="bg-white rounded-2xl border border-slate-200 p-12 text-center">
          <Wrench className="w-8 h-8 mx-auto mb-3 text-slate-300" />
          <p className="text-sm font-semibold text-slate-500">Nothing reported for your home yet.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {tickets.map((ticket) => (
            <div key={ticket.id} className="bg-white rounded-2xl border border-slate-200 shadow-xs p-5">
              <div className="flex items-start justify-between gap-4">
                <div className="flex-1">
                  <div className="flex flex-wrap items-center gap-2 mb-1">
                    <h3 className="text-sm font-bold text-slate-900">{ticket.title}</h3>
                    <span className={`text-[10px] font-bold px-2 py-0.5 rounded border uppercase tracking-wider ${STATUS_STYLES[ticket.status]}`}>
                      {ticket.status.replace('_', ' ')}
                    </span>
                    <span className={`inline-flex items-center text-[10px] font-bold px-2 py-0.5 rounded border uppercase tracking-wider ${
                      ticket.scope === 'COMMON'
                        ? 'bg-indigo-50 text-indigo-700 border-indigo-200'
                        : 'bg-teal-50 text-teal-700 border-teal-200'
                    }`}>
                      {ticket.scope === 'COMMON' ? <Building2 className="w-3 h-3 mr-1" /> : <Home className="w-3 h-3 mr-1" />}
                      {ticket.place}
                    </span>
                  </div>
                  <p className="text-xs text-slate-500 leading-relaxed">{ticket.description}</p>
                  <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-slate-400 mt-2.5">
                    <span className="flex items-center gap-1">
                      <Clock className="w-3 h-3" />
                      Reported {formatDay(ticket.created_at)}
                    </span>
                    <span className="capitalize">{String(ticket.category).replace('_', ' ').toLowerCase()}</span>
                    {ticket.assigned_to && <span>Assigned to {ticket.assigned_to}</span>}
                    {ticket.resolved_at && (
                      <span className="text-emerald-600 font-semibold">Resolved {formatDay(ticket.resolved_at)}</span>
                    )}
                  </div>
                </div>
                {ticket.status === 'RESOLVED' && <CheckCircle2 className="w-5 h-5 text-emerald-600 shrink-0" />}
              </div>

              <button
                onClick={() => setOpenTicket(openTicket === ticket.id ? null : ticket.id)}
                className="mt-3 text-xs font-bold text-teal-700 hover:text-teal-900"
              >
                {openTicket === ticket.id ? 'Hide the conversation' : 'Open the conversation'}
              </button>

              {openTicket === ticket.id && (
                <div className="mt-3 pt-3 border-t border-slate-100">
                  <TicketConversation
                    ticketId={ticket.id}
                    canRate={ticket.raised_by_me}
                    onChanged={load}
                  />
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {isOpen && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div ref={dialogRef} {...dialogProps} className="bg-white rounded-2xl shadow-2xl w-full max-w-lg border border-slate-200 overflow-hidden">
            <div className="flex justify-between items-center px-6 py-5 border-b border-slate-100 bg-slate-50">
              <div className="flex items-center gap-3">
                <div className="p-2 bg-amber-100 text-amber-800 rounded-xl">
                  <Wrench className="w-5 h-5" />
                </div>
                <div>
                  <h2 id={titleId} className="text-lg font-bold text-slate-800">Report an issue</h2>
                  <p className="text-xs text-slate-500">The building admin is notified straight away</p>
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

              <div>
                <span id={`${fieldId}-scope-group`} className={label}>What does this affect?</span>
                <div className="grid grid-cols-2 gap-2 mt-1.5" role="group" aria-labelledby={`${fieldId}-scope-group`}>
                  <button
                    type="button"
                    onClick={() => setForm({ ...form, scope: 'COMMON' })}
                    className={`flex items-center justify-center px-3 py-2.5 rounded-lg text-sm font-bold border transition-colors ${
                      form.scope === 'COMMON' ? 'bg-teal-600 text-white border-teal-600' : 'bg-white text-slate-600 border-slate-300 hover:border-teal-400'
                    }`}
                  >
                    <Building2 className="w-4 h-4 mr-2" />
                    Shared space
                  </button>
                  <button
                    type="button"
                    onClick={() => setForm({ ...form, scope: 'UNIT' })}
                    className={`flex items-center justify-center px-3 py-2.5 rounded-lg text-sm font-bold border transition-colors ${
                      form.scope === 'UNIT' ? 'bg-teal-600 text-white border-teal-600' : 'bg-white text-slate-600 border-slate-300 hover:border-teal-400'
                    }`}
                  >
                    <Home className="w-4 h-4 mr-2" />
                    My home
                  </button>
                </div>
              </div>

              {form.scope === 'COMMON' && (
                <div>
                  <label className={label} htmlFor={`${fieldId}-where-is-it`}>Where is it</label>
                  <input id={`${fieldId}-where-is-it`}
                    type="text" required maxLength={100}
                    placeholder="e.g. Lift A, third floor stairwell, terrace"
                    value={form.location}
                    onChange={(e) => setForm({ ...form, location: e.target.value })}
                    className={field}
                  />
                </div>
              )}

              <div>
                <label className={label} htmlFor={`${fieldId}-what-is-wrong`}>What is wrong</label>
                <input id={`${fieldId}-what-is-wrong`}
                  type="text" required maxLength={255}
                  placeholder="e.g. Seepage on the stairwell wall"
                  value={form.title}
                  onChange={(e) => setForm({ ...form, title: e.target.value })}
                  className={field}
                />
              </div>

              <div>
                <label className={label} htmlFor={`${fieldId}-category`}>Category</label>
                <select id={`${fieldId}-category`} value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })} className={field}>
                  {CATEGORIES.map((category) => (
                    <option key={category.value} value={category.value}>{category.label}</option>
                  ))}
                </select>
              </div>

              <div>
                <label className={label} htmlFor={`${fieldId}-tell-us-more`}>Tell us more</label>
                <textarea id={`${fieldId}-tell-us-more`}
                  required rows={4}
                  placeholder="Where exactly is it, and when did you first notice it?"
                  value={form.description}
                  onChange={(e) => setForm({ ...form, description: e.target.value })}
                  className={field}
                />
                <p className="mt-1 text-[11px] text-slate-500">
                  The admin sets the urgency once they have seen it.
                </p>
              </div>

              <div className="flex justify-end gap-3 pt-2">
                <button type="button" onClick={() => setIsOpen(false)} className="px-4 py-2.5 text-sm font-bold text-slate-600 hover:text-slate-800 transition-colors">
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={saving}
                  className="px-5 py-2.5 bg-teal-600 hover:bg-teal-700 disabled:bg-slate-300 text-white text-sm font-bold rounded-xl transition-colors"
                >
                  {saving ? 'Sending...' : 'Report it'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
