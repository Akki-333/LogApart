import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import api from '../../lib/api';
import { formatRupees, formatPeriod, formatDay } from '../../lib/money';
import { FolderOpen, Receipt, FileCheck2, Megaphone, FileText } from 'lucide-react';

const TABS = [
  { key: 'INVOICES', label: 'Bills', icon: FileText },
  { key: 'RECEIPTS', label: 'Receipts', icon: Receipt },
  { key: 'CERTIFICATES', label: 'Certificates', icon: FileCheck2 },
  { key: 'NOTICES', label: 'Notices', icon: Megaphone }
];

/**
 * Everything on paper for this home, in one place. Nothing new is stored here:
 * it is the same bills, receipts, certificates and notices, gathered so nobody
 * has to remember which screen last March's receipt was on.
 */
export default function ResidentDocuments() {
  const [data, setData] = useState(null);
  const [tab, setTab] = useState('INVOICES');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api
      .get('/api/resident/documents')
      .then((response) => setData(response.data.data))
      .catch((error) => console.error('Failed to load your documents', error))
      .finally(() => setLoading(false));
  }, []);

  if (loading) {
    return <div className="flex justify-center py-20"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-teal-600" /></div>;
  }

  if (!data) return null;

  const counts = {
    INVOICES: data.invoices.length,
    RECEIPTS: data.receipts.length,
    CERTIFICATES: data.certificates.length,
    NOTICES: data.notices.length
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-black text-slate-900">My Documents</h1>
        <p className="text-sm text-slate-500 mt-0.5">Everything on paper for home {data.unit.number}</p>
      </div>

      <div className="flex flex-wrap items-center gap-1 bg-slate-100 p-1 rounded-xl border border-slate-200 w-fit">
        {TABS.map((item) => (
          <button
            key={item.key}
            onClick={() => setTab(item.key)}
            className={`flex items-center px-3.5 py-2 rounded-lg text-xs font-bold transition-colors ${
              tab === item.key ? 'bg-white text-teal-700 shadow-xs' : 'text-slate-500 hover:text-slate-800'
            }`}
          >
            <item.icon className="w-3.5 h-3.5 mr-1.5" />
            {item.label}
            <span className="ml-1.5 text-[10px] text-slate-400">{counts[item.key]}</span>
          </button>
        ))}
      </div>

      <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden">
        {counts[tab] === 0 ? (
          <div className="px-5 py-12 text-center">
            <FolderOpen className="w-8 h-8 mx-auto mb-3 text-slate-300" />
            <p className="text-sm font-semibold text-slate-500">Nothing here yet.</p>
          </div>
        ) : (
          <ul className="divide-y divide-slate-100">
            {tab === 'INVOICES' && data.invoices.map((invoice) => (
              <li key={invoice.id} className="px-5 py-3 flex items-center justify-between">
                <div>
                  <p className="text-sm font-semibold text-slate-800">{formatPeriod(invoice.period_month)}</p>
                  <p className="text-[11px] text-slate-500">Due {formatDay(invoice.due_date)} · {invoice.display_status.toLowerCase()}</p>
                </div>
                <div className="text-right">
                  <p className="text-sm font-bold text-slate-800">{formatRupees(invoice.total_amount)}</p>
                  {invoice.balance > 0 && <p className="text-[11px] text-rose-600">{formatRupees(invoice.balance)} left</p>}
                </div>
              </li>
            ))}

            {tab === 'RECEIPTS' && data.receipts.map((receipt) => (
              <li key={receipt.receipt_number} className="px-5 py-3 flex items-center justify-between">
                <div>
                  <Link to={`/receipts/${receipt.receipt_number}`} className="text-sm font-bold text-teal-800 font-mono underline decoration-dotted underline-offset-2 hover:text-teal-600">{receipt.receipt_number}</Link>
                  <p className="text-[11px] text-slate-500">
                    {formatPeriod(receipt.period_month)} · {receipt.mode.replace('_', ' ').toLowerCase()}
                    {receipt.reference && ` · ${receipt.reference}`}
                  </p>
                </div>
                <div className="text-right">
                  <p className="text-sm font-bold text-emerald-700">{formatRupees(receipt.amount)}</p>
                  <p className="text-[11px] text-slate-400">{formatDay(receipt.paid_on)}</p>
                </div>
              </li>
            ))}

            {tab === 'CERTIFICATES' && data.certificates.map((certificate) => (
              <li key={certificate.certificate_number} className="px-5 py-3">
                <p className="text-sm font-bold text-slate-800 font-mono">{certificate.certificate_number}</p>
                <p className="text-[11px] text-slate-500">
                  Move-out {formatDay(certificate.move_out_date)} ·{' '}
                  {certificate.dues_waived
                    ? `${formatRupees(certificate.outstanding_at_issue)} waived: ${certificate.waiver_reason}`
                    : 'dues clear at issue'}
                </p>
              </li>
            ))}

            {tab === 'NOTICES' && data.notices.map((notice) => (
              <li key={notice.id} className="px-5 py-3">
                <p className="text-sm font-semibold text-slate-800">{notice.title}</p>
                <p className="text-xs text-slate-600 mt-0.5">{notice.body}</p>
                <p className="text-[11px] text-slate-400 mt-1">Posted {formatDay(notice.starts_on)}</p>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
