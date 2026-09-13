import { createContext, useContext, useState, useCallback, useRef, useMemo, useId } from 'react';
import { CheckCircle2, AlertTriangle, Info, X } from 'lucide-react';
import Modal from './Modal';

/**
 * Everything the product says back to the person using it.
 *
 * This replaces 54 alert() calls, 9 confirm() and 8 prompt(). Those are
 * blocking, cannot be styled or validated inline, are announced poorly by
 * assistive technology, and on iOS Safari a prompt can be suppressed outright,
 * which silently broke four flows that required a typed reason.
 *
 *   const { toast, confirm, askReason } = useFeedback();
 *
 *   toast.success('Payment recorded.')
 *   if (await confirm({ title: 'Remove this bay?' })) { ... }
 *   const reason = await askReason({ title: 'Why is this being removed?' })
 *
 * confirm and askReason return a promise, so a caller still reads top to bottom
 * the way it did with the browser dialogs. askReason resolves to null on
 * cancel, which is the shape prompt() had.
 */

const FeedbackContext = createContext(null);

export const useFeedback = () => {
  const value = useContext(FeedbackContext);
  if (!value) throw new Error('useFeedback must be used inside FeedbackProvider');
  return value;
};

const TONES = {
  success: { icon: CheckCircle2, shell: 'bg-emerald-50 border-emerald-200 text-emerald-900', mark: 'text-emerald-600' },
  error: { icon: AlertTriangle, shell: 'bg-rose-50 border-rose-200 text-rose-900', mark: 'text-rose-600' },
  info: { icon: Info, shell: 'bg-slate-50 border-slate-200 text-slate-900', mark: 'text-slate-500' }
};

function ToastShelf({ items, dismiss }) {
  return (
    // Polite rather than assertive: these report what happened, they do not
    // interrupt. The region stays mounted so additions are announced.
    <div
      aria-live="polite"
      aria-atomic="false"
      className="fixed bottom-4 right-4 z-[60] flex flex-col gap-2 w-[min(24rem,calc(100vw-2rem))]"
    >
      {items.map((item) => {
        const tone = TONES[item.tone] || TONES.info;
        const Icon = tone.icon;

        return (
          <div
            key={item.id}
            role={item.tone === 'error' ? 'alert' : 'status'}
            className={`flex items-start gap-2.5 border rounded-xl px-4 py-3 shadow-lg ${tone.shell}`}
          >
            <Icon className={`w-4 h-4 shrink-0 mt-0.5 ${tone.mark}`} aria-hidden="true" />
            <p className="text-sm font-medium flex-1 leading-snug">{item.message}</p>
            <button
              type="button"
              onClick={() => dismiss(item.id)}
              aria-label="Dismiss this message"
              className="shrink-0 opacity-50 hover:opacity-100 transition-opacity rounded focus:outline-none focus-visible:ring-2 focus-visible:ring-current"
            >
              <X className="w-3.5 h-3.5" aria-hidden="true" />
            </button>
          </div>
        );
      })}
    </div>
  );
}

function AskDialog({ request, onSettle }) {
  const [value, setValue] = useState('');
  const [error, setError] = useState('');
  const fieldId = useId();
  const errorId = useId();

  if (!request) return null;

  const { title, message, confirmLabel, tone, reasonLabel, minLength } = request;
  const wantsReason = Boolean(reasonLabel);
  const floor = minLength || 4;

  const submit = (event) => {
    event.preventDefault();

    if (wantsReason && value.trim().length < floor) {
      setError(`Please write at least ${floor} characters, so the record explains itself.`);
      return;
    }

    onSettle(wantsReason ? value.trim() : true);
  };

  const cancel = () => onSettle(wantsReason ? null : false);

  return (
    <Modal
      isOpen
      onClose={cancel}
      title={title}
      subtitle={message}
      size="sm"
      icon={tone === 'danger' ? AlertTriangle : undefined}
    >
      <form onSubmit={submit} className="space-y-4">
        {wantsReason && (
          <div>
            <label htmlFor={fieldId} className="block text-xs font-bold uppercase tracking-wider text-slate-500 mb-1.5">
              {reasonLabel}
            </label>
            <textarea
              id={fieldId}
              value={value}
              rows={3}
              onChange={(event) => { setValue(event.target.value); setError(''); }}
              aria-invalid={error ? 'true' : undefined}
              aria-describedby={error ? errorId : undefined}
              className="w-full px-3 py-2 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-teal-500/40"
            />
            {error && <p id={errorId} role="alert" className="text-xs text-rose-600 mt-1.5">{error}</p>}
          </div>
        )}

        <div className="flex gap-2.5">
          <button
            type="submit"
            className={`flex-1 px-4 py-2.5 font-bold rounded-xl text-sm text-white transition-colors ${
              tone === 'danger' ? 'bg-rose-600 hover:bg-rose-700' : 'bg-teal-600 hover:bg-teal-700'
            }`}
          >
            {confirmLabel || 'Confirm'}
          </button>
          <button
            type="button"
            onClick={cancel}
            className="flex-1 px-4 py-2.5 bg-white hover:bg-slate-100 text-slate-600 font-bold border border-slate-200 rounded-xl text-sm transition-colors"
          >
            Cancel
          </button>
        </div>
      </form>
    </Modal>
  );
}

export function FeedbackProvider({ children }) {
  const [items, setItems] = useState([]);
  const [request, setRequest] = useState(null);
  const settleRef = useRef(null);
  const nextId = useRef(0);

  const dismiss = useCallback((id) => {
    setItems((current) => current.filter((item) => item.id !== id));
  }, []);

  const push = useCallback((message, tone) => {
    nextId.current += 1;
    const id = nextId.current;
    setItems((current) => [...current, { id, message, tone }]);
    // Errors stay longer, because they usually need reading twice.
    setTimeout(() => dismiss(id), tone === 'error' ? 8000 : 4500);
  }, [dismiss]);

  const ask = useCallback((options) => new Promise((resolve) => {
    settleRef.current = resolve;
    setRequest(options);
  }), []);

  const settle = useCallback((result) => {
    setRequest(null);
    const resolve = settleRef.current;
    settleRef.current = null;
    if (resolve) resolve(result);
  }, []);

  const value = useMemo(() => ({
    toast: {
      success: (message) => push(message, 'success'),
      error: (message) => push(message, 'error'),
      info: (message) => push(message, 'info')
    },
    confirm: (options) => ask({ ...options, reasonLabel: null }),
    askReason: (options) => ask({ reasonLabel: 'Reason', confirmLabel: 'Save', ...options })
  }), [push, ask]);

  return (
    <FeedbackContext.Provider value={value}>
      {children}
      <AskDialog request={request} onSettle={settle} />
      <ToastShelf items={items} dismiss={dismiss} />
    </FeedbackContext.Provider>
  );
}
