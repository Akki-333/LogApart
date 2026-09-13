import { useState, useEffect, useCallback } from 'react';
import api from '../../lib/api';
import { formatDay } from '../../lib/money';
import { Vote, CheckCircle2, Users } from 'lucide-react';
import { useFeedback } from '../../components/common/Feedback';

/**
 * Society decisions. A household gets one vote, and the screen says so, because
 * a second family member who taps an option should understand why it is refused
 * rather than assume the app is broken.
 */
export default function ResidentPolls() {
  const { toast, confirm } = useFeedback();
  const [polls, setPolls] = useState([]);
  const [loading, setLoading] = useState(true);
  const [banner, setBanner] = useState('');

  const load = useCallback(async () => {
    try {
      const response = await api.get('/api/polls');
      setPolls(response.data.data);
    } catch (error) {
      console.error('Failed to load polls', error);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const vote = async (poll, option) => {
    const go = await confirm({
      title: `Vote "${option.label}"?`,
      message: 'This is your household’s one vote and it cannot be changed.',
      confirmLabel: 'Cast the vote'
    });
    if (!go) return;

    try {
      const response = await api.post(`/api/polls/${poll.id}/vote`, { option_id: option.id });
      setBanner(response.data.message);
      load();
    } catch (error) {
      toast.error(error.response?.data?.message || 'Could not record that vote');
    }
  };

  if (loading) {
    return <div className="flex justify-center py-20"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-teal-600" /></div>;
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-black text-slate-900">Decisions</h1>
        <p className="text-sm text-slate-500 mt-0.5">One vote per home. Results appear once voting closes.</p>
      </div>

      {banner && (
        <div className="bg-emerald-50 border border-emerald-200 rounded-xl px-4 py-3 text-sm font-semibold text-emerald-900">
          {banner}
        </div>
      )}

      {polls.length === 0 ? (
        <div className="bg-white rounded-2xl border border-slate-200 p-12 text-center">
          <Vote className="w-8 h-8 mx-auto mb-3 text-slate-300" />
          <p className="text-sm font-semibold text-slate-500">Nothing to decide right now.</p>
        </div>
      ) : (
        <div className="space-y-4">
          {polls.map((poll) => {
            const voted = poll.own_vote !== null;
            const turnout = poll.eligible_homes > 0
              ? Math.round((poll.votes_cast / poll.eligible_homes) * 100)
              : 0;

            return (
              <div key={poll.id} className="bg-white rounded-2xl border border-slate-200 overflow-hidden">
                <div className="px-5 py-4 border-b border-slate-100">
                  <h3 className="text-sm font-bold text-slate-900">{poll.question}</h3>
                  {poll.detail && <p className="text-xs text-slate-500 mt-1">{poll.detail}</p>}
                  <p className="text-[11px] text-slate-400 mt-1.5 flex items-center gap-2">
                    <Users className="w-3 h-3" />
                    {poll.votes_cast} of {poll.eligible_homes} homes voted, {turnout}% turnout ·{' '}
                    {poll.has_closed ? `closed ${formatDay(poll.closes_on)}` : `closes ${formatDay(poll.closes_on)}`}
                  </p>
                </div>

                <div className="px-5 py-4 space-y-2">
                  {poll.options.map((option) => {
                    const mine = poll.own_vote === option.id;
                    const result = (poll.results || []).find((row) => row.id === option.id);

                    return (
                      <div key={option.id}>
                        <button
                          disabled={voted || poll.has_closed}
                          onClick={() => vote(poll, option)}
                          className={`w-full flex items-center justify-between px-4 py-2.5 rounded-xl border text-left text-sm transition-colors ${
                            mine
                              ? 'bg-teal-50 border-teal-300 text-teal-900 font-bold'
                              : voted || poll.has_closed
                                ? 'bg-slate-50 border-slate-200 text-slate-600'
                                : 'bg-white border-slate-200 text-slate-700 hover:border-teal-400 hover:bg-teal-50'
                          }`}
                        >
                          <span className="flex items-center gap-2">
                            {mine && <CheckCircle2 className="w-4 h-4" />}
                            {option.label}
                          </span>
                          {result && <span className="font-bold">{result.votes} · {result.share}%</span>}
                        </button>

                        {result && (
                          <div className="h-1.5 bg-slate-100 rounded-full overflow-hidden mt-1">
                            <div className="h-full bg-teal-500 rounded-full" style={{ width: `${result.share}%` }} />
                          </div>
                        )}
                      </div>
                    );
                  })}

                  {!poll.has_closed && !voted && (
                    <p className="text-[11px] text-slate-400 pt-1">
                      Your home has not voted yet. Whoever votes first votes for the household.
                    </p>
                  )}

                  {!poll.has_closed && voted && (
                    <p className="text-[11px] text-slate-400 pt-1">
                      Your home has voted. The count stays closed until {formatDay(poll.closes_on)}.
                    </p>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
