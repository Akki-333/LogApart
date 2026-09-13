import { useState, useEffect, useCallback } from 'react';
import api from '../../lib/api';
import { MessageSquare, Send, Star, RotateCcw } from 'lucide-react';
import { useFeedback } from '../common/Feedback';

const when = (value) =>
  new Date(value).toLocaleString('en-IN', {
    day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit', hour12: true
  });

/**
 * The conversation on one issue, shared by the office and the home.
 *
 * The rating and the reopen button only appear for the resident who raised it,
 * because the API refuses them from anybody else and a button that always
 * fails is worse than no button.
 */
export default function TicketConversation({ ticketId, canRate = false, onChanged }) {
  const { toast, askReason } = useFeedback();
  const [comments, setComments] = useState([]);
  const [meta, setMeta] = useState(null);
  const [draft, setDraft] = useState('');
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    try {
      const response = await api.get(`/api/tickets/${ticketId}/comments`);
      setComments(response.data.data);
      setMeta(response.data.ticket);
    } catch (error) {
      console.error('Failed to load the conversation', error);
    } finally {
      setLoading(false);
    }
  }, [ticketId]);

  useEffect(() => { load(); }, [load]);

  const send = async (event) => {
    event.preventDefault();
    if (draft.trim().length < 2) return;

    try {
      await api.post(`/api/tickets/${ticketId}/comments`, { body: draft.trim() });
      setDraft('');
      load();
    } catch (error) {
      toast.error(error.response?.data?.message || 'Could not send that');
    }
  };

  const rate = async (stars) => {
    const note = await askReason({
      title: `Rate this fix ${stars} out of 5`,
      message: 'Anything you add goes to the office with the rating.',
      reasonLabel: 'Anything to add, if you like',
      confirmLabel: 'Send the rating',
      minLength: 0
    });
    if (note === null) return;

    try {
      await api.post(`/api/tickets/${ticketId}/rating`, { rating: stars, note: note.trim() });
      load();
      if (onChanged) onChanged();
    } catch (error) {
      toast.error(error.response?.data?.message || 'Could not record that rating');
    }
  };

  const reopen = async () => {
    const reason = await askReason({
      title: 'What is still wrong?',
      message: 'The issue goes back into the queue and the office is told.',
      reasonLabel: 'What is still wrong',
      confirmLabel: 'Reopen the issue'
    });
    if (reason === null) return;

    try {
      await api.post(`/api/tickets/${ticketId}/reopen`, { reason: reason.trim() });
      load();
      if (onChanged) onChanged();
    } catch (error) {
      toast.error(error.response?.data?.message || 'Could not reopen that issue');
    }
  };

  if (loading) return <p className="text-xs text-slate-400 py-3">Loading the conversation...</p>;

  const settled = meta && ['RESOLVED', 'CLOSED'].includes(meta.status);

  return (
    <div className="space-y-3">
      <h4 className="text-[10px] font-bold uppercase tracking-wider text-slate-400 flex items-center gap-1.5">
        <MessageSquare className="w-3.5 h-3.5" /> Conversation
        {meta?.reopen_count > 0 && (
          <span className="text-amber-700 normal-case tracking-normal font-semibold">
            · reopened {meta.reopen_count} time{meta.reopen_count > 1 ? 's' : ''}
          </span>
        )}
      </h4>

      {comments.length === 0 ? (
        <p className="text-xs text-slate-400">Nothing said yet.</p>
      ) : (
        <ul className="space-y-2">
          {comments.map((comment) => {
            const fromOffice = comment.author_role !== 'RESIDENT';

            return (
              <li
                key={comment.id}
                className={`rounded-xl px-3 py-2 border text-xs ${
                  fromOffice ? 'bg-slate-50 border-slate-200' : 'bg-teal-50 border-teal-200'
                }`}
              >
                <p className="text-slate-700 leading-relaxed">{comment.body}</p>
                <p className="text-[10px] text-slate-400 mt-1">
                  {comment.author} · {when(comment.created_at)}
                </p>
              </li>
            );
          })}
        </ul>
      )}

      <form onSubmit={send} className="flex gap-2">
        <input
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
          placeholder="Add to this issue"
          maxLength={1000}
          className="flex-1 min-w-0 px-3 py-2 border border-slate-200 rounded-xl text-sm"
        />
        <button type="submit" className="px-3 py-2 bg-teal-600 hover:bg-teal-700 text-white rounded-xl">
          <Send className="w-4 h-4" />
        </button>
      </form>

      {canRate && settled && (
        <div className="flex flex-wrap items-center gap-3 pt-1">
          {meta.rating ? (
            <span className="flex items-center gap-1 text-xs text-slate-600">
              You rated this
              <span className="flex">
                {[1, 2, 3, 4, 5].map((star) => (
                  <Star
                    key={star}
                    className={`w-3.5 h-3.5 ${star <= meta.rating ? 'text-amber-500 fill-amber-500' : 'text-slate-300'}`}
                  />
                ))}
              </span>
            </span>
          ) : (
            <span className="flex items-center gap-1 text-xs text-slate-600">
              Did the fix hold?
              <span className="flex ml-1">
                {[1, 2, 3, 4, 5].map((star) => (
                  <button key={star} onClick={() => rate(star)} title={`${star} out of 5`}>
                    <Star className="w-4 h-4 text-slate-300 hover:text-amber-500" />
                  </button>
                ))}
              </span>
            </span>
          )}

          <button
            onClick={reopen}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-white hover:bg-amber-50 text-amber-700 border border-amber-200 rounded-lg text-xs font-bold"
          >
            <RotateCcw className="w-3.5 h-3.5" /> Still not fixed
          </button>
        </div>
      )}
    </div>
  );
}
