import { useState, useEffect, useId } from 'react';
import api from '../../lib/api';
import { formatDay } from '../../lib/money';
import { Megaphone, Plus, X, Trash2, Eye, EyeOff, CheckCircle2 } from 'lucide-react';
import { useFeedback } from '../common/Feedback';
import useDialog from '../common/useDialog';

const CATEGORIES = [
  { value: 'GENERAL', label: 'General', tone: 'bg-slate-100 text-slate-700 border-slate-200' },
  { value: 'MAINTENANCE', label: 'Maintenance', tone: 'bg-amber-50 text-amber-700 border-amber-200' },
  { value: 'UTILITY', label: 'Water or power', tone: 'bg-blue-50 text-blue-700 border-blue-200' },
  { value: 'EVENT', label: 'Event', tone: 'bg-indigo-50 text-indigo-700 border-indigo-200' },
  { value: 'URGENT', label: 'Urgent', tone: 'bg-rose-50 text-rose-700 border-rose-200' }
];

const toneFor = (category) => CATEGORIES.find((c) => c.value === category)?.tone || CATEGORIES[0].tone;
const today = () => new Date().toISOString().slice(0, 10);

export default function NoticesTab({ onAction }) {
  const { dialogRef, dialogProps, titleId } = useDialog(isOpen, () => setIsOpen(false));
  const fieldId = useId();
  const { toast, confirm } = useFeedback();
  const [notices, setNotices] = useState([]);
  const [loading, setLoading] = useState(true);
  const [isOpen, setIsOpen] = useState(false);
  const [form, setForm] = useState({
    title: '', body: '', category: 'GENERAL', audience: 'ALL', starts_on: today(), ends_on: ''
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const load = () => {
    setLoading(true);
    api
      .get('/api/notices/all')
      .then((res) => setNotices(res.data.data))
      .catch((err) => console.error('Failed to load notices', err))
      .finally(() => setLoading(false));
  };

  useEffect(load, []);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setSaving(true);

    try {
      const res = await api.post('/api/notices', { ...form, ends_on: form.ends_on || null });
      onAction(res.data.message);
      setIsOpen(false);
      setForm({ title: '', body: '', category: 'GENERAL', audience: 'ALL', starts_on: today(), ends_on: '' });
      load();
    } catch (err) {
      setError(err.response?.data?.message || 'Could not post this notice.');
    } finally {
      setSaving(false);
    }
  };

  const togglePublished = async (notice) => {
    try {
      const res = await api.put(`/api/notices/${notice.id}`, { is_published: !notice.is_published });
      onAction(notice.is_published ? 'Notice taken down.' : 'Notice put back up.');
      load();
    } catch (err) {
      toast.error(err.response?.data?.message || 'Could not update that notice.');
    }
  };

  const remove = async (notice) => {
    const go = await confirm({
      title: `Delete "${notice.title}"?`,
      message: 'This cannot be undone.',
      confirmLabel: 'Delete it',
      tone: 'danger'
    });
    if (!go) return;

    try {
      const res = await api.delete(`/api/notices/${notice.id}`);
      onAction(res.data.message);
      load();
    } catch (err) {
      toast.error(err.response?.data?.message || 'Could not delete that notice.');
    }
  };

  const isLive = (notice) =>
    notice.is_published &&
    String(notice.starts_on).slice(0, 10) <= today() &&
    (!notice.ends_on || String(notice.ends_on).slice(0, 10) >= today());

  const field =
    'mt-1 w-full px-3 py-2 bg-white border border-slate-300 rounded-lg text-sm outline-none focus:border-teal-500 focus:ring-1 focus:ring-teal-500 transition-colors';
  const label = 'block text-xs font-bold uppercase tracking-wider text-slate-500';

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-xs text-slate-500">
          Water tank cleaning, power cuts, fumigation. A notice goes live on its start
          date and comes down on its end date.
        </p>
        <button
          onClick={() => setIsOpen(true)}
          className="flex items-center px-4 py-2.5 bg-teal-600 hover:bg-teal-700 text-white text-sm font-bold rounded-xl transition-colors shadow-sm shrink-0 ml-4"
        >
          <Plus className="w-4 h-4 mr-2" />
          Post a notice
        </button>
      </div>

      {loading ? (
        <div className="flex justify-center py-16">
          <div className="animate-spin rounded-full h-7 w-7 border-b-2 border-teal-600"></div>
        </div>
      ) : notices.length === 0 ? (
        <div className="bg-white rounded-2xl border border-slate-200 p-12 text-center">
          <Megaphone className="w-8 h-8 mx-auto mb-3 text-slate-300" />
          <p className="text-sm font-semibold text-slate-500">No notices posted yet.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {notices.map((notice) => (
            <div
              key={notice.id}
              className={`bg-white rounded-2xl border shadow-xs p-5 ${isLive(notice) ? 'border-slate-200' : 'border-slate-200 opacity-60'}`}
            >
              <div className="flex items-start justify-between gap-4">
                <div className="flex-1">
                  <div className="flex flex-wrap items-center gap-2 mb-1">
                    <h3 className="text-sm font-bold text-slate-900">{notice.title}</h3>
                    <span className={`text-[10px] font-bold px-2 py-0.5 rounded border uppercase tracking-wider ${toneFor(notice.category)}`}>
                      {notice.category}
                    </span>
                    {notice.audience !== 'ALL' && (
                      <span className="text-[10px] font-bold px-2 py-0.5 rounded border uppercase tracking-wider bg-slate-100 text-slate-600 border-slate-200">
                        {notice.audience} only
                      </span>
                    )}
                    {!isLive(notice) && (
                      <span className="text-[10px] font-bold px-2 py-0.5 rounded border uppercase tracking-wider bg-slate-100 text-slate-500 border-slate-200">
                        {notice.is_published ? 'Not live yet' : 'Taken down'}
                      </span>
                    )}
                  </div>

                  <p className="text-xs text-slate-600 leading-relaxed">{notice.body}</p>

                  <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-slate-400 mt-2.5">
                    <span>
                      {formatDay(notice.starts_on)}
                      {notice.ends_on ? ` to ${formatDay(notice.ends_on)}` : ' onwards'}
                    </span>
                    <span>Posted by {notice.posted_by}</span>
                    <span className="flex items-center gap-1 text-emerald-600 font-semibold">
                      <CheckCircle2 className="w-3 h-3" />
                      {notice.acknowledgement_count} of {notice.audience_size} read it
                    </span>
                  </div>
                </div>

                <div className="flex items-center gap-1 shrink-0">
                  <button
                    onClick={() => togglePublished(notice)}
                    title={notice.is_published ? 'Take it down' : 'Put it back up'}
                    className="p-2 text-slate-400 hover:text-teal-700 hover:bg-teal-50 rounded-lg transition-colors"
                  >
                    {notice.is_published ? <Eye className="w-4 h-4" /> : <EyeOff className="w-4 h-4" />}
                  </button>
                  <button
                    onClick={() => remove(notice)}
                    title="Delete"
                    className="p-2 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition-colors"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
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
                <div className="p-2 bg-amber-100 text-amber-800 rounded-xl">
                  <Megaphone className="w-5 h-5" />
                </div>
                <div>
                  <h2 id={titleId} className="text-lg font-bold text-slate-800">Post a notice</h2>
                  <p className="text-xs text-slate-500">Everyone it is addressed to is notified</p>
                </div>
              </div>
              <button onClick={() => setIsOpen(false)} className="p-1.5 text-slate-400 hover:text-slate-600 hover:bg-slate-200 rounded-full transition-colors">
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSubmit} className="p-6 space-y-4">
              {error && (
                <div className="bg-rose-50 border-l-4 border-rose-500 p-3 rounded-r-md">
                  <p className="text-sm text-rose-700">{error}</p>
                </div>
              )}

              <div>
                <label className={label} htmlFor={`${fieldId}-headline`}>Headline</label>
                <input id={`${fieldId}-headline`} type="text" required maxLength={255} placeholder="Overhead tank cleaning"
                  value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} className={field} />
              </div>

              <div>
                <label className={label} htmlFor={`${fieldId}-the-notice`}>The notice</label>
                <textarea id={`${fieldId}-the-notice`} required rows={4} placeholder="Water supply pauses Saturday from 10am to 2pm."
                  value={form.body} onChange={(e) => setForm({ ...form, body: e.target.value })} className={field} />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className={label} htmlFor={`${fieldId}-kind`}>Kind</label>
                  <select id={`${fieldId}-kind`} value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })} className={field}>
                    {CATEGORIES.map((c) => <option key={c.value} value={c.value}>{c.label}</option>)}
                  </select>
                </div>
                <div>
                  <label className={label} htmlFor={`${fieldId}-who-sees-it`}>Who sees it</label>
                  <select id={`${fieldId}-who-sees-it`} value={form.audience} onChange={(e) => setForm({ ...form, audience: e.target.value })} className={field}>
                    <option value="ALL">Everyone</option>
                    <option value="RESIDENT">Residents only</option>
                    <option value="SECURITY">Security only</option>
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className={label} htmlFor={`${fieldId}-goes-up-on`}>Goes up on</label>
                  <input id={`${fieldId}-goes-up-on`} type="date" required value={form.starts_on}
                    onChange={(e) => setForm({ ...form, starts_on: e.target.value })} className={field} />
                </div>
                <div>
                  <label className={label} htmlFor={`${fieldId}-comes-down-on`}>Comes down on</label>
                  <input id={`${fieldId}-comes-down-on`} type="date" min={form.starts_on} value={form.ends_on}
                    onChange={(e) => setForm({ ...form, ends_on: e.target.value })} className={field} />
                  <p className="mt-1 text-[11px] text-slate-500">Leave blank to keep it up.</p>
                </div>
              </div>

              <div className="flex justify-end gap-3 pt-2">
                <button type="button" onClick={() => setIsOpen(false)} className="px-4 py-2.5 text-sm font-bold text-slate-600 hover:text-slate-800 transition-colors">
                  Cancel
                </button>
                <button type="submit" disabled={saving}
                  className="px-5 py-2.5 bg-teal-600 hover:bg-teal-700 disabled:bg-slate-300 text-white text-sm font-bold rounded-xl transition-colors">
                  {saving ? 'Posting...' : 'Post it'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
