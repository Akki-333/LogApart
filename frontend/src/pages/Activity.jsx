import { useState, useEffect, useCallback } from 'react';
import api from '../lib/api';
import {
  ScrollText, Search, RefreshCw, ChevronDown, ChevronRight, ShieldAlert, Filter
} from 'lucide-react';

// Money and access leave a heavier mark than an edit. The colour is the first
// thing an admin scanning a month of activity actually reads.
const ACTION_STYLES = {
  DELETE_GATE_LOG: 'bg-rose-50 text-rose-700 border-rose-200',
  DELETE_BILLING_RUN: 'bg-rose-50 text-rose-700 border-rose-200',
  VACATE_UNIT: 'bg-amber-50 text-amber-700 border-amber-200',
  REISSUE_PASSWORD: 'bg-amber-50 text-amber-700 border-amber-200',
  RECORD_PAYMENT: 'bg-emerald-50 text-emerald-700 border-emerald-200',
  CREATE_BILLING_RUN: 'bg-teal-50 text-teal-700 border-teal-200',
  ONBOARD_RESIDENT: 'bg-teal-50 text-teal-700 border-teal-200'
};

const readable = (action) => action.replace(/_/g, ' ').toLowerCase();

const formatWhen = (value) => {
  if (!value) return '';
  const at = new Date(value);
  return at.toLocaleString('en-IN', {
    day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit', hour12: true
  });
};

const ActionPill = ({ action }) => (
  <span
    className={`text-[10px] font-bold px-2 py-0.5 rounded border uppercase tracking-wider whitespace-nowrap ${
      ACTION_STYLES[action] || 'bg-slate-100 text-slate-600 border-slate-200'
    }`}
  >
    {readable(action)}
  </span>
);

// before and after are stored as JSON, so the detail view prints them rather
// than guessing at a shape that differs for every action.
const StatePanel = ({ label, state }) => (
  <div className="flex-1 min-w-0">
    <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400 mb-1">{label}</p>
    {state ? (
      <pre className="text-[11px] leading-relaxed bg-slate-900 text-slate-200 rounded-lg p-3 overflow-x-auto max-h-56">
        {JSON.stringify(state, null, 2)}
      </pre>
    ) : (
      <p className="text-xs text-slate-400 italic bg-slate-50 border border-slate-200 rounded-lg p-3">
        Nothing recorded
      </p>
    )}
  </div>
);

export default function Activity() {
  const [entries, setEntries] = useState([]);
  const [actions, setActions] = useState([]);
  const [nextBeforeId, setNextBeforeId] = useState(null);
  const [loading, setLoading] = useState(true);

  const [search, setSearch] = useState('');
  const [actionFilter, setActionFilter] = useState('ALL');

  const [openId, setOpenId] = useState(null);
  const [detail, setDetail] = useState(null);
  const [detailLoading, setDetailLoading] = useState(false);

  const buildQuery = useCallback(
    (beforeId) => {
      const params = new URLSearchParams({ limit: '50' });
      if (search.trim()) params.set('search', search.trim());
      if (actionFilter !== 'ALL') params.set('action', actionFilter);
      if (beforeId) params.set('before_id', String(beforeId));
      return params.toString();
    },
    [search, actionFilter]
  );

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const response = await api.get(`/api/audit?${buildQuery(null)}`);
      setEntries(response.data.data);
      setNextBeforeId(response.data.next_before_id);
      setActions(response.data.actions || []);
    } catch (error) {
      console.error('Failed to load the activity log', error);
    } finally {
      setLoading(false);
    }
  }, [buildQuery]);

  // Typing in the search box should not fire a request per keystroke.
  useEffect(() => {
    const timer = setTimeout(load, search ? 300 : 0);
    return () => clearTimeout(timer);
  }, [load, search]);

  // Older pages are appended, so scrolling back through a month keeps
  // everything already read on screen.
  const loadOlder = async () => {
    if (!nextBeforeId) return;

    try {
      const response = await api.get(`/api/audit?${buildQuery(nextBeforeId)}`);
      setEntries((current) => [...current, ...response.data.data]);
      setNextBeforeId(response.data.next_before_id);
    } catch (error) {
      console.error('Failed to load older activity', error);
    }
  };

  const toggle = async (id) => {
    if (openId === id) {
      setOpenId(null);
      setDetail(null);
      return;
    }

    setOpenId(id);
    setDetail(null);
    setDetailLoading(true);

    try {
      const response = await api.get(`/api/audit/${id}`);
      setDetail(response.data.data);
    } catch (error) {
      console.error('Failed to load that entry', error);
    } finally {
      setDetailLoading(false);
    }
  };

  return (
    <div className="p-6 space-y-5">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-800 flex items-center gap-2.5">
            <ScrollText className="w-6 h-6 text-teal-600" />
            Activity
          </h1>
          <p className="text-sm text-slate-500 mt-1">
            Every change to money, accounts and gate records, and who made it.
          </p>
        </div>

        <button
          onClick={load}
          className="flex items-center px-3.5 py-2 bg-white hover:bg-slate-50 text-slate-700 font-semibold border border-slate-200 rounded-xl text-sm transition-colors"
        >
          <RefreshCw className={`w-4 h-4 mr-2 ${loading ? 'animate-spin' : ''}`} />
          Refresh
        </button>
      </div>

      <div className="flex flex-wrap gap-3">
        <div className="relative flex-1 min-w-[220px]">
          <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Search by what happened or who did it"
            className="w-full pl-9 pr-3 py-2.5 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-teal-500/40"
          />
        </div>

        <div className="relative">
          <Filter className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
          <select
            value={actionFilter}
            onChange={(event) => setActionFilter(event.target.value)}
            className="pl-9 pr-8 py-2.5 border border-slate-200 rounded-xl text-sm bg-white focus:outline-none focus:ring-2 focus:ring-teal-500/40"
          >
            <option value="ALL">Every action</option>
            {actions.map((action) => (
              <option key={action} value={action}>{readable(action)}</option>
            ))}
          </select>
        </div>
      </div>

      <div className="bg-white border border-slate-200 rounded-2xl overflow-hidden">
        {loading ? (
          <p className="px-5 py-10 text-center text-sm text-slate-400">Reading the log...</p>
        ) : entries.length === 0 ? (
          <div className="px-5 py-12 text-center">
            <ShieldAlert className="w-8 h-8 text-slate-300 mx-auto mb-3" />
            <p className="text-sm font-semibold text-slate-600">Nothing recorded yet</p>
            <p className="text-xs text-slate-400 mt-1">
              Entries appear as soon as someone changes money, an account or a gate record.
            </p>
          </div>
        ) : (
          <ul className="divide-y divide-slate-100">
            {entries.map((entry) => (
              <li key={entry.id}>
                <button
                  onClick={() => toggle(entry.id)}
                  className="w-full flex items-start gap-3 px-5 py-3.5 text-left hover:bg-slate-50 transition-colors"
                >
                  {openId === entry.id ? (
                    <ChevronDown className="w-4 h-4 text-slate-400 mt-0.5 shrink-0" />
                  ) : (
                    <ChevronRight className="w-4 h-4 text-slate-400 mt-0.5 shrink-0" />
                  )}

                  <div className="flex-1 min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <ActionPill action={entry.action} />
                      <span className="text-sm font-semibold text-slate-800">{entry.summary}</span>
                    </div>
                    <p className="text-xs text-slate-500 mt-1">
                      {entry.actor_name} · {entry.actor_role?.replace('_', ' ').toLowerCase()} · {formatWhen(entry.created_at)}
                    </p>
                  </div>
                </button>

                {openId === entry.id && (
                  <div className="px-5 pb-5 pt-1 bg-slate-50/70 border-t border-slate-100">
                    {detailLoading ? (
                      <p className="text-xs text-slate-400 py-3">Loading the detail...</p>
                    ) : detail ? (
                      <div className="space-y-3">
                        <div className="flex flex-wrap gap-x-6 gap-y-1 text-xs text-slate-500">
                          <span>
                            <span className="font-semibold text-slate-600">Record:</span> {detail.entity} {detail.entity_id || ''}
                          </span>
                          <span>
                            <span className="font-semibold text-slate-600">From:</span> {detail.ip || 'unknown address'}
                          </span>
                        </div>
                        <div className="flex flex-col md:flex-row gap-4">
                          <StatePanel label="Before" state={detail.before_state} />
                          <StatePanel label="After" state={detail.after_state} />
                        </div>
                      </div>
                    ) : (
                      <p className="text-xs text-slate-400 py-3">That entry could not be read.</p>
                    )}
                  </div>
                )}
              </li>
            ))}
          </ul>
        )}
      </div>

      {nextBeforeId && (
        <div className="text-center">
          <button
            onClick={loadOlder}
            className="px-4 py-2.5 bg-white hover:bg-slate-50 text-slate-700 font-semibold border border-slate-200 rounded-xl text-sm transition-colors"
          >
            Load older activity
          </button>
        </div>
      )}
    </div>
  );
}
