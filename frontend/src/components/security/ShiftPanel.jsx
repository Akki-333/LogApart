import { useState, useEffect, useCallback, useId } from 'react';
import api from '../../lib/api';
import { useFeedback } from '../common/Feedback';
import { SkeletonBlock } from '../common/Skeleton';
import { Clock, LogIn, LogOut, ClipboardCheck } from 'lucide-react';

const timeOf = (value) => new Date(value).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
const duration = (minutes) => `${Math.floor(minutes / 60)}h ${minutes % 60}m`;

/**
 * The shift, from the guard's side. Whatever the last guard wrote at handover
 * is shown first and has to be acknowledged before a new shift can start, so
 * "the tanker comes at six" is never lost between two people.
 */
export default function ShiftPanel() {
  const noteId = useId();
  const { toast } = useFeedback();
  const [state, setState] = useState(null);
  const [ending, setEnding] = useState(false);
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    try {
      const response = await api.get('/api/shifts/current');
      setState(response.data.data);
    } catch (error) {
      console.error('Failed to load the shift', error);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const run = async (action) => {
    setBusy(true);
    try {
      await action();
      await load();
    } catch (error) {
      toast.error(error.response?.data?.message || 'That did not go through.');
      load();
    } finally {
      setBusy(false);
    }
  };

  const start = () => run(async () => {
    await api.post('/api/shifts/start', {});
    toast.success('Shift started.');
  });

  const acknowledgeAndStart = (handover) => run(async () => {
    await api.post(`/api/shifts/${handover.id}/acknowledge`, {});
    await api.post('/api/shifts/start', {});
    toast.success('Handover acknowledged. Shift started.');
  });

  const end = (event) => {
    event.preventDefault();
    run(async () => {
      const response = await api.post('/api/shifts/end', { handover_note: note.trim() || undefined });
      toast.success(response.data.message);
      setNote('');
      setEnding(false);
    });
  };

  if (!state) {
    return <div className="bg-slate-800 border border-slate-700 rounded-2xl p-5"><SkeletonBlock className="h-10 w-2/3" /></div>;
  }

  const { shift, pending_handover: handover, visitors_inside: inside } = state;

  if (!shift && handover) {
    return (
      <section aria-labelledby={`${noteId}-handover`} className="bg-amber-500/10 rounded-2xl border border-amber-500/40 p-5 space-y-3">
        <div className="flex items-center gap-2">
          <ClipboardCheck className="w-5 h-5 text-amber-300" aria-hidden="true" />
          <h2 id={`${noteId}-handover`} className="text-sm font-bold text-amber-100">
            Handover from {handover.guard_name}, who left at {timeOf(handover.ended_at)}
          </h2>
        </div>
        <p className="text-sm text-amber-50 whitespace-pre-line bg-slate-900/60 border border-amber-500/30 rounded-xl p-3">{handover.handover_note}</p>
        <button
          type="button"
          disabled={busy}
          onClick={() => acknowledgeAndStart(handover)}
          className="inline-flex items-center px-4 py-2.5 bg-amber-600 hover:bg-amber-700 text-white text-sm font-bold rounded-xl disabled:opacity-60"
        >
          <LogIn className="w-4 h-4 mr-2" aria-hidden="true" /> I have read this, start my shift
        </button>
      </section>
    );
  }

  if (!shift) {
    return (
      <section className="bg-slate-800 rounded-2xl border border-slate-700 p-5 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2 text-sm text-slate-300">
          <Clock className="w-4 h-4 text-slate-400" aria-hidden="true" />
          You are not on shift. Start one so the gate log and handovers carry your name.
        </div>
        <button
          type="button"
          disabled={busy}
          onClick={start}
          className="inline-flex items-center px-4 py-2.5 bg-teal-600 hover:bg-teal-700 text-white text-sm font-bold rounded-xl disabled:opacity-60"
        >
          <LogIn className="w-4 h-4 mr-2" aria-hidden="true" /> Start shift
        </button>
      </section>
    );
  }

  return (
    <section className="bg-slate-800 rounded-2xl border border-slate-700 p-5 space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2 text-sm text-slate-300">
          <span className="w-2.5 h-2.5 rounded-full bg-emerald-500" aria-hidden="true" />
          <span>
            On shift since <strong>{timeOf(shift.started_at)}</strong> ({duration(shift.minutes)}) · {inside} visitor{inside === 1 ? '' : 's'} inside
          </span>
        </div>
        {!ending && (
          <button
            type="button"
            onClick={() => setEnding(true)}
            className="inline-flex items-center px-4 py-2 bg-slate-900 border border-slate-600 text-slate-200 hover:bg-slate-700 text-sm font-bold rounded-xl"
          >
            <LogOut className="w-4 h-4 mr-2" aria-hidden="true" /> End shift
          </button>
        )}
      </div>

      {ending && (
        <form onSubmit={end} className="space-y-2">
          <label htmlFor={noteId} className="block text-xs font-bold uppercase tracking-wider text-slate-400">
            Handover note for the next guard
          </label>
          <textarea
            id={noteId}
            rows={3}
            maxLength={1000}
            value={note}
            onChange={(event) => setNote(event.target.value)}
            placeholder={inside > 0 ? `${inside} still inside. Anything the next guard should know?` : 'Anything the next guard should know?'}
            className="w-full px-3 py-2 bg-slate-900 border border-slate-600 text-white placeholder-slate-500 rounded-xl text-sm outline-none focus:border-teal-500 focus:ring-1 focus:ring-teal-500"
          />
          <div className="flex gap-2 justify-end">
            <button type="button" onClick={() => setEnding(false)} className="px-4 py-2 text-sm font-semibold text-slate-300 bg-slate-700 rounded-xl">
              Keep working
            </button>
            <button type="submit" disabled={busy} className="px-4 py-2 text-sm font-bold text-white bg-rose-600 hover:bg-rose-700 rounded-xl disabled:opacity-60">
              End shift
            </button>
          </div>
        </form>
      )}
    </section>
  );
}
