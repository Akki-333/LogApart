import { useState, useEffect, useCallback, useId } from 'react';
import api from '../../lib/api';
import { formatDay } from '../../lib/money';
import { useFeedback } from '../common/Feedback';
import { SkeletonList } from '../common/Skeleton';
import { CheckCircle2, Circle } from 'lucide-react';

const CLOSABLE = ['HELPERS_UNLINKED', 'PARKING_RELEASED', 'PASSES_CANCELLED'];
const inDays = (n) => new Date(Date.now() + n * 86400000).toISOString().slice(0, 10);

/**
 * The move-out as a checklist. Recording notice opens it; from then on the
 * certificate is refused until the helpers, the parking bay and any live gate
 * pass for the home are closed off. Every tick is read from those records.
 */
export default function MoveOutChecklist({ unitId }) {
  const fieldId = useId();
  const { toast, confirm } = useFeedback();
  const [moveOut, setMoveOut] = useState(undefined);
  const [planned, setPlanned] = useState(inDays(30));
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    try {
      const response = await api.get(`/api/units/${unitId}/move-out`);
      setMoveOut(response.data.data);
    } catch (error) {
      console.error('Failed to load the move-out', error);
      setMoveOut(null);
    }
  }, [unitId]);

  useEffect(() => { load(); }, [load]);

  const act = async (request, success) => {
    setBusy(true);
    try {
      const response = await request();
      toast.success(success || response.data.message);
      load();
    } catch (error) {
      toast.error(error.response?.data?.message || 'That did not go through.');
    } finally {
      setBusy(false);
    }
  };

  const withdraw = async () => {
    const go = await confirm({
      title: 'Withdraw this move-out?',
      message: 'The resident is staying. The checklist closes and nothing it released is undone.',
      confirmLabel: 'Withdraw'
    });
    if (go) act(() => api.post(`/api/units/${unitId}/move-out/cancel`, {}));
  };

  if (moveOut === undefined) return <SkeletonList rows={3} label="Loading the move-out" />;

  const open = moveOut && moveOut.status === 'OPEN';

  if (!open) {
    return (
      <div className="p-3 bg-slate-50 border border-slate-200 rounded-xl space-y-2">
        <p className="text-xs text-slate-600">
          No notice on record. Record it to run the checklist, which closes off helpers, parking and gate passes
          before the certificate is issued. You can also vacate straight away below.
        </p>
        <div className="flex flex-wrap items-end gap-2">
          <div>
            <label htmlFor={fieldId} className="block text-[10px] font-bold uppercase tracking-wider text-slate-500 mb-1">Moving out on</label>
            <input id={fieldId} type="date" value={planned} onChange={(event) => setPlanned(event.target.value)} className="px-3 py-2 border border-slate-300 rounded-lg text-sm" />
          </div>
          <button
            type="button"
            disabled={busy || !planned}
            onClick={() => act(() => api.post(`/api/units/${unitId}/move-out`, { planned_move_out: planned }))}
            className="px-3 py-2 text-xs font-bold text-white bg-slate-800 hover:bg-slate-900 rounded-lg disabled:opacity-60"
          >
            Record notice
          </button>
        </div>
      </div>
    );
  }

  const pending = moveOut.steps.filter((step) => CLOSABLE.includes(step.key) && !step.done);

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <h3 className="text-xs font-bold uppercase tracking-wider text-slate-500">
          Move-out checklist · leaving {formatDay(moveOut.planned_move_out)}
        </h3>
        <button type="button" onClick={withdraw} className="text-[11px] font-semibold text-slate-400 hover:text-slate-700">Withdraw</button>
      </div>
      <ol className="border border-slate-200 rounded-xl divide-y divide-slate-100">
        {moveOut.steps.map((step) => (
          <li key={step.key} className="px-3 py-2 flex items-center gap-2.5">
            {step.done
              ? <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" aria-label="Done" />
              : <Circle className="w-4 h-4 text-slate-300 shrink-0" aria-label="Not done" />}
            <div className="flex-1 min-w-0">
              <p className={`text-xs font-semibold ${step.done ? 'text-slate-500' : 'text-slate-800'}`}>{step.label}</p>
              <p className="text-[11px] text-slate-400">{step.detail}</p>
            </div>
            {CLOSABLE.includes(step.key) && !step.done && (
              <button
                type="button"
                disabled={busy}
                onClick={() => act(() => api.post(`/api/units/${unitId}/move-out/release`, { step: step.key }))}
                className="px-2.5 py-1 text-[11px] font-bold text-teal-800 bg-teal-50 hover:bg-teal-100 border border-teal-200 rounded-lg disabled:opacity-60"
              >
                Close off
              </button>
            )}
          </li>
        ))}
      </ol>
      {pending.length > 1 && (
        <button
          type="button"
          disabled={busy}
          onClick={() => act(() => api.post(`/api/units/${unitId}/move-out/release`, {}))}
          className="text-xs font-bold text-teal-700 hover:text-teal-900 disabled:opacity-60"
        >
          Close off all {pending.length}
        </button>
      )}
      {!moveOut.ready && (
        <p className="text-[11px] text-amber-700">The certificate is issued once every step above except dues is done.</p>
      )}
    </div>
  );
}
