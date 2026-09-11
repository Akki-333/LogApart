import { useState, useEffect } from 'react';
import api from '../../lib/api';
import { formatDay } from '../../lib/money';
import { Megaphone, Check, CheckCircle2 } from 'lucide-react';

const TONES = {
  GENERAL: 'bg-slate-50 border-slate-200',
  MAINTENANCE: 'bg-amber-50 border-amber-200',
  UTILITY: 'bg-blue-50 border-blue-200',
  EVENT: 'bg-indigo-50 border-indigo-200',
  URGENT: 'bg-rose-50 border-rose-200'
};

const BADGES = {
  GENERAL: 'bg-slate-100 text-slate-700 border-slate-200',
  MAINTENANCE: 'bg-amber-100 text-amber-800 border-amber-200',
  UTILITY: 'bg-blue-100 text-blue-800 border-blue-200',
  EVENT: 'bg-indigo-100 text-indigo-800 border-indigo-200',
  URGENT: 'bg-rose-100 text-rose-800 border-rose-200'
};

export default function ResidentNotices() {
  const [notices, setNotices] = useState([]);
  const [loading, setLoading] = useState(true);

  const load = () => {
    api
      .get('/api/notices')
      .then((res) => setNotices(res.data.data))
      .catch((err) => console.error('Failed to load notices', err))
      .finally(() => setLoading(false));
  };

  useEffect(load, []);

  const acknowledge = async (notice) => {
    try {
      await api.post(`/api/notices/${notice.id}/acknowledge`);
      load();
    } catch (err) {
      console.error('Could not acknowledge notice', err);
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-black text-slate-900">Notices</h1>
        <p className="text-sm text-slate-500 mt-0.5">
          Announcements from the building office
        </p>
      </div>

      {loading ? (
        <div className="flex justify-center py-16">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-teal-600"></div>
        </div>
      ) : notices.length === 0 ? (
        <div className="bg-white rounded-2xl border border-slate-200 p-12 text-center">
          <Megaphone className="w-8 h-8 mx-auto mb-3 text-slate-300" />
          <p className="text-sm font-semibold text-slate-500">Nothing on the board right now.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {notices.map((notice) => (
            <div key={notice.id} className={`rounded-2xl border p-5 ${TONES[notice.category] || TONES.GENERAL}`}>
              <div className="flex items-start justify-between gap-4">
                <div className="flex-1">
                  <div className="flex flex-wrap items-center gap-2 mb-1.5">
                    <h3 className="text-sm font-bold text-slate-900">{notice.title}</h3>
                    <span className={`text-[10px] font-bold px-2 py-0.5 rounded border uppercase tracking-wider ${BADGES[notice.category] || BADGES.GENERAL}`}>
                      {notice.category}
                    </span>
                  </div>
                  <p className="text-xs text-slate-700 leading-relaxed whitespace-pre-line">{notice.body}</p>
                  <div className="text-[11px] text-slate-500 mt-2.5">
                    Posted by {notice.posted_by} on {formatDay(notice.starts_on)}
                    {notice.ends_on ? ` · until ${formatDay(notice.ends_on)}` : ''}
                  </div>
                </div>

                {notice.acknowledged ? (
                  <span className="inline-flex items-center text-[11px] font-bold text-emerald-700 shrink-0">
                    <CheckCircle2 className="w-4 h-4 mr-1" />
                    Read
                  </span>
                ) : (
                  <button
                    onClick={() => acknowledge(notice)}
                    className="inline-flex items-center px-3 py-1.5 bg-white hover:bg-slate-50 text-slate-700 text-xs font-bold border border-slate-300 rounded-lg transition-colors shrink-0"
                  >
                    <Check className="w-3.5 h-3.5 mr-1.5" />
                    Got it
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
