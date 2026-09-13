import { useEffect, useState, useContext } from 'react';
import { useParams, Link } from 'react-router-dom';
import api from '../lib/api';
import { AuthContext } from '../context/AuthContext';
import { formatRupees, formatDay, formatPeriod } from '../lib/money';
import { SkeletonList } from '../components/common/Skeleton';
import { Printer, ArrowLeft } from 'lucide-react';

const MODES = { UPI: 'UPI', CASH: 'Cash', BANK_TRANSFER: 'Bank transfer', CHEQUE: 'Cheque', OTHER: 'Other' };

/**
 * A receipt somebody can print, or save as a PDF from the print dialog.
 *
 * It sits outside the portal layouts on purpose, so what reaches the printer is
 * the receipt and nothing else. A resident reads it through their own home's
 * route, so the number in the address cannot open a neighbour's payment.
 */
export default function ReceiptPage() {
  const { number } = useParams();
  const { user } = useContext(AuthContext);
  const [receipt, setReceipt] = useState(null);
  const [error, setError] = useState('');

  const resident = user?.role === 'RESIDENT';
  const backTo = resident ? '/resident/documents' : '/admin/billing';

  useEffect(() => {
    const path = resident
      ? `/api/resident/receipts/${encodeURIComponent(number)}`
      : `/api/billing/receipts/${encodeURIComponent(number)}`;

    api
      .get(path)
      .then((response) => setReceipt(response.data.data))
      .catch((err) => setError(err.response?.data?.message || 'Could not open that receipt.'));
  }, [number, resident]);

  // The browser offers the title as the file name when saving as a PDF.
  useEffect(() => {
    if (!receipt) return undefined;
    const previous = document.title;
    document.title = `Receipt ${receipt.receipt_number}`;
    return () => { document.title = previous; };
  }, [receipt]);

  return (
    <main className="min-h-screen bg-slate-100 print:bg-white py-8 px-4 print:p-0">
      <div className="max-w-2xl mx-auto">
        <div className="flex items-center justify-between mb-4 print:hidden">
          <Link to={backTo} className="inline-flex items-center gap-1.5 text-sm font-semibold text-slate-600 hover:text-teal-700">
            <ArrowLeft className="w-4 h-4" aria-hidden="true" /> Back
          </Link>
          {receipt && (
            <button
              type="button"
              onClick={() => window.print()}
              className="inline-flex items-center gap-2 px-4 py-2 bg-teal-600 hover:bg-teal-700 text-white text-sm font-bold rounded-xl"
            >
              <Printer className="w-4 h-4" aria-hidden="true" /> Print or save as PDF
            </button>
          )}
        </div>

        <article className="bg-white rounded-2xl border border-slate-200 shadow-sm print:shadow-none print:border-0 print:rounded-none p-8 sm:p-10">
          {error ? (
            <p role="alert" className="text-sm font-semibold text-rose-700">{error}</p>
          ) : !receipt ? (
            <SkeletonList rows={5} label="Opening the receipt" />
          ) : (
            <>
              <header className="flex flex-wrap items-start justify-between gap-4 border-b border-slate-200 pb-6">
                <div>
                  <p className="text-xs font-bold uppercase tracking-widest text-teal-700">LogApart</p>
                  <h1 className="text-2xl font-black text-slate-900 mt-1">Payment receipt</h1>
                </div>
                <dl className="text-right text-sm">
                  <dt className="text-xs text-slate-500">Receipt number</dt>
                  <dd className="font-mono font-bold text-slate-900">{receipt.receipt_number}</dd>
                  <dt className="text-xs text-slate-500 mt-2">Paid on</dt>
                  <dd className="font-semibold text-slate-900">{formatDay(receipt.paid_on)}</dd>
                </dl>
              </header>

              <section className="py-6 grid sm:grid-cols-2 gap-6 border-b border-slate-200">
                <div>
                  <p className="text-xs text-slate-500">Received from</p>
                  <p className="text-base font-bold text-slate-900">{receipt.resident_name || 'The resident of this home'}</p>
                  <p className="text-sm text-slate-600">Home {receipt.unit_number}, floor {receipt.unit_floor}</p>
                </div>
                <div className="sm:text-right">
                  <p className="text-xs text-slate-500">Amount received</p>
                  <p className="text-3xl font-black text-slate-900">{formatRupees(receipt.amount)}</p>
                  <p className="text-sm text-slate-600">
                    By {MODES[receipt.mode] || receipt.mode}{receipt.reference ? `, reference ${receipt.reference}` : ''}
                  </p>
                </div>
              </section>

              <section className="py-6">
                <h2 className="text-xs font-bold uppercase tracking-wider text-slate-500 mb-3">Towards</h2>
                <table className="w-full text-sm">
                  <tbody className="divide-y divide-slate-100">
                    <tr>
                      <th scope="row" className="py-2 text-left font-normal text-slate-600">Maintenance bill for {formatPeriod(receipt.period_month)}</th>
                      <td className="py-2 text-right font-semibold text-slate-900">{formatRupees(receipt.total_amount)}</td>
                    </tr>
                    <tr>
                      <th scope="row" className="py-2 text-left font-normal text-slate-600">Due on</th>
                      <td className="py-2 text-right text-slate-900">{formatDay(receipt.due_date)}</td>
                    </tr>
                    <tr>
                      <th scope="row" className="py-2 text-left font-normal text-slate-600">Paid against this bill so far</th>
                      <td className="py-2 text-right text-slate-900">{formatRupees(receipt.amount_paid)}</td>
                    </tr>
                    <tr>
                      <th scope="row" className="py-2 text-left font-bold text-slate-900">Still due on this bill today</th>
                      <td className="py-2 text-right font-bold text-slate-900">{formatRupees(receipt.balance)}</td>
                    </tr>
                  </tbody>
                </table>
              </section>

              <footer className="pt-6 border-t border-slate-200 text-xs text-slate-500">
                Generated by LogApart when the payment was recorded{receipt.recorded_by ? ` by ${receipt.recorded_by}` : ''}.
              </footer>
            </>
          )}
        </article>
      </div>
    </main>
  );
}
