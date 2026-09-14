import { useState, useEffect, useCallback, useId } from 'react';
import api from '../../lib/api';
import { formatDay } from '../../lib/money';
import { Vote, Plus, X, Lock, Eye, EyeOff, Users } from 'lucide-react';
import { useFeedback } from '../common/Feedback';
import useDialog from '../common/useDialog';
import { SkeletonList } from '../common/Skeleton';

const today = () => new Date().toISOString().slice(0, 10);
const inDays = (count) => new Date(Date.now() + count * 86400000).toISOString().slice(0, 10);
const blankForm = () => ({ question: '', detail: '', opens_on: today(), closes_on: inDays(7), options: ['', ''] });

/**
 * Polls from the committee's side. Residents have been able to vote, but a poll
 * could only be raised through the API. One vote per home; residents see the
 * result when the poll closes, and turnout shows which homes voted, never which
 * way.
 */
export default function PollsTab({ onAction }) {
  const fieldId = useId();
  const { toast, confirm } = useFeedback();
  const [polls, setPolls] = useState([]);
  const [loading, setLoading] = useState(true);
  const [isOpen, setIsOpen] = useState(false);
  const { dialogRef, dialogProps, titleId } = useDialog(isOpen, () => setIsOpen(false));
  const [form, setForm] = useState(blankForm);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [turnout, setTurnout] = useState({});

  const load = useCallback(async () => {
    try {
      const response = await api.get('/api/polls');
      setPolls(response.data.data);
    } catch (err) {
      console.error('Failed to load polls', err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const setOption = (index, value) =>
    setForm((current) => ({ ...current, options: current.options.map((option, i) => (i === index ? value : option)) }));

  const submit = async (event) => {
    event.preventDefault();
    const options = form.options.map((option) => option.trim()).filter(Boolean);

    if (options.length < 2) {
      setError('Give the poll at least two options.');
      return;
    }

    setSaving(true);
    setError('');

    try {
      const response = await api.post('/api/polls', {
        question: form.question.trim(),
        detail: form.detail.trim() || undefined,
        opens_on: form.opens_on,
        closes_on: form.closes_on,
        options
      });
      onAction(response.data.message);
      setIsOpen(false);
      setForm(blankForm());
      load();
    } catch (err) {
      setError(err.response?.data?.message || 'Could not raise that poll.');
    } finally {
      setSaving(false);
    }
  };

  const update = async (poll, body, message) => {
    try {
      const response = await api.put(`/api/polls/${poll.id}`, body);
      onAction(message || response.data.message);
      load();
    } catch (err) {
      toast.error(err.response?.data?.message || 'Could not update that poll.');
    }
  };

  const closeNow = async (poll) => {
    const go = await confirm({
      title: 'Close this poll now?',
      message: 'Voting stops and every resident can see the result.',
      confirmLabel: 'Close the poll'
    });
    if (go) update(poll, { close_now: true });
  };

  const toggleTurnout = async (poll) => {
    if (turnout[poll.id]) {
      setTurnout((current) => ({ ...current, [poll.id]: undefined }));
      return;
    }

    try {
      const response = await api.get(`/api/polls/${poll.id}/turnout`);
      setTurnout((current) => ({ ...current, [poll.id]: response.data.data }));
    } catch (err) {
      toast.error(err.response?.data?.message || 'Could not read the turnout.');
    }
  };

  const field = 'mt-1 w-full px-3 py-2 bg-white border border-slate-300 rounded-lg text-sm outline-none focus:border-teal-500 focus:ring-1 focus:ring-teal-500';
  const label = 'block text-xs font-bold uppercase tracking-wider text-slate-500';

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-4">
        <p className="text-xs text-slate-500">One vote per home. Residents see the result when the poll closes.</p>
        <button
          type="button"
          onClick={() => setIsOpen(true)}
          className="flex items-center px-4 py-2.5 bg-teal-600 hover:bg-teal-700 text-white text-sm font-bold rounded-xl shrink-0"
        >
          <Plus className="w-4 h-4 mr-2" aria-hidden="true" /> New poll
        </button>
      </div>

      {loading ? (
        <div className="bg-white rounded-2xl border border-slate-200 p-5"><SkeletonList rows={3} label="Loading polls" /></div>
      ) : polls.length === 0 ? (
        <div className="bg-white rounded-2xl border border-slate-200 p-12 text-center">
          <Vote className="w-8 h-8 mx-auto mb-3 text-slate-300" aria-hidden="true" />
          <p className="text-sm font-semibold text-slate-500">No polls yet.</p>
          <p className="text-xs text-slate-400 mt-1">Ask the building before the next general body meeting.</p>
        </div>
      ) : (
        <ul className="space-y-3">
          {polls.map((poll) => {
            const rows = turnout[poll.id];
            const share = poll.eligible_homes > 0 ? Math.round((poll.votes_cast / poll.eligible_homes) * 100) : 0;

            return (
              <li key={poll.id} className="bg-white rounded-2xl border border-slate-200 p-5">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="text-sm font-bold text-slate-900">{poll.question}</p>
                    {poll.detail && <p className="text-xs text-slate-500 mt-0.5">{poll.detail}</p>}
                    <p className="text-[11px] text-slate-400 mt-1">
                      {formatDay(poll.opens_on)} to {formatDay(poll.closes_on)} · {poll.votes_cast} of {poll.eligible_homes} homes voted ({share}%)
                    </p>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full border ${poll.has_closed ? 'bg-slate-100 text-slate-600 border-slate-200' : 'bg-emerald-50 text-emerald-700 border-emerald-200'}`}>
                      {poll.has_closed ? 'Closed' : 'Open'}
                    </span>
                    {!poll.has_closed && (
                      <button type="button" onClick={() => closeNow(poll)} className="p-1.5 text-slate-400 hover:text-slate-700 hover:bg-slate-100 rounded-lg" aria-label={`Close ${poll.question}`}>
                        <Lock className="w-4 h-4" aria-hidden="true" />
                      </button>
                    )}
                    <button
                      type="button"
                      onClick={() => update(poll, { is_published: !poll.is_published }, poll.is_published ? 'Poll hidden from residents.' : 'Poll shown to residents.')}
                      className="p-1.5 text-slate-400 hover:text-slate-700 hover:bg-slate-100 rounded-lg"
                      aria-label={poll.is_published ? `Hide ${poll.question}` : `Show ${poll.question}`}
                    >
                      {poll.is_published ? <Eye className="w-4 h-4" aria-hidden="true" /> : <EyeOff className="w-4 h-4" aria-hidden="true" />}
                    </button>
                    <button
                      type="button"
                      onClick={() => toggleTurnout(poll)}
                      aria-expanded={Boolean(rows)}
                      className="p-1.5 text-slate-400 hover:text-slate-700 hover:bg-slate-100 rounded-lg"
                      aria-label={`Turnout for ${poll.question}`}
                    >
                      <Users className="w-4 h-4" aria-hidden="true" />
                    </button>
                  </div>
                </div>

                {poll.results && (
                  <ul className="mt-3 space-y-1.5">
                    {poll.results.map((option) => (
                      <li key={option.id}>
                        <div className="flex justify-between text-xs mb-0.5">
                          <span className="font-semibold text-slate-700">{option.label}</span>
                          <span className="text-slate-500">{option.votes} · {option.share}%</span>
                        </div>
                        <div className="w-full bg-slate-100 rounded-full h-1.5 overflow-hidden">
                          <div className="h-1.5 rounded-full bg-teal-500" style={{ width: `${option.share}%` }} />
                        </div>
                      </li>
                    ))}
                  </ul>
                )}

                {rows && (
                  <div className="mt-3 pt-3 border-t border-slate-100">
                    <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400 mb-2">Which homes have voted</p>
                    <div className="flex flex-wrap gap-1.5">
                      {rows.map((row) => (
                        <span
                          key={row.unit_number}
                          className={`text-[11px] font-bold px-2 py-0.5 rounded-md border ${row.has_voted ? 'bg-teal-50 text-teal-800 border-teal-200' : 'bg-white text-slate-400 border-slate-200'}`}
                        >
                          {row.unit_number}{row.has_voted ? '' : ' · not yet'}
                        </span>
                      ))}
                    </div>
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      )}

      {isOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm">
          <div ref={dialogRef} {...dialogProps} className="bg-white rounded-2xl shadow-2xl w-full max-w-lg border border-slate-200 max-h-[90vh] overflow-y-auto focus:outline-none">
            <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100 bg-slate-50">
              <h2 id={titleId} className="text-base font-bold text-slate-800">New poll</h2>
              <button type="button" onClick={() => setIsOpen(false)} aria-label="Close new poll" className="p-1.5 text-slate-400 hover:text-slate-600 rounded-full">
                <X className="w-5 h-5" aria-hidden="true" />
              </button>
            </div>
            <form onSubmit={submit} className="p-6 space-y-4">
              <div>
                <label htmlFor={`${fieldId}-question`} className={label}>Question</label>
                <input id={`${fieldId}-question`} required minLength={5} maxLength={255} value={form.question} onChange={(event) => setForm({ ...form, question: event.target.value })} className={field} />
              </div>
              <div>
                <label htmlFor={`${fieldId}-detail`} className={label}>Detail</label>
                <textarea id={`${fieldId}-detail`} rows={2} value={form.detail} onChange={(event) => setForm({ ...form, detail: event.target.value })} className={field} />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label htmlFor={`${fieldId}-opens`} className={label}>Opens</label>
                  <input id={`${fieldId}-opens`} type="date" required value={form.opens_on} onChange={(event) => setForm({ ...form, opens_on: event.target.value })} className={field} />
                </div>
                <div>
                  <label htmlFor={`${fieldId}-closes`} className={label}>Closes</label>
                  <input id={`${fieldId}-closes`} type="date" required min={form.opens_on} value={form.closes_on} onChange={(event) => setForm({ ...form, closes_on: event.target.value })} className={field} />
                </div>
              </div>
              <fieldset>
                <legend className={label}>Options</legend>
                <div className="space-y-2 mt-1">
                  {form.options.map((option, index) => (
                    <div key={index} className="flex gap-2">
                      <input
                        aria-label={`Option ${index + 1}`}
                        value={option}
                        maxLength={120}
                        onChange={(event) => setOption(index, event.target.value)}
                        className={field.replace('mt-1 ', '')}
                      />
                      {form.options.length > 2 && (
                        <button
                          type="button"
                          onClick={() => setForm((current) => ({ ...current, options: current.options.filter((_, i) => i !== index) }))}
                          aria-label={`Remove option ${index + 1}`}
                          className="p-2 text-slate-400 hover:text-rose-600"
                        >
                          <X className="w-4 h-4" aria-hidden="true" />
                        </button>
                      )}
                    </div>
                  ))}
                </div>
                {form.options.length < 8 && (
                  <button
                    type="button"
                    onClick={() => setForm((current) => ({ ...current, options: [...current.options, ''] }))}
                    className="mt-2 text-xs font-bold text-teal-700 hover:text-teal-900"
                  >
                    Add an option
                  </button>
                )}
              </fieldset>
              {error && <p role="alert" className="text-xs font-semibold text-rose-700">{error}</p>}
              <div className="flex justify-end gap-2 pt-2">
                <button type="button" onClick={() => setIsOpen(false)} className="px-4 py-2 text-sm font-semibold text-slate-600 bg-slate-100 rounded-xl">Cancel</button>
                <button type="submit" disabled={saving} className="px-5 py-2 text-sm font-bold text-white bg-teal-600 hover:bg-teal-700 rounded-xl disabled:opacity-60">
                  {saving ? 'Raising' : 'Raise the poll'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
