import { useState, useEffect } from 'react';
import api from '../../lib/api';
import { formatRupees, formatDay, formatPeriod } from '../../lib/money';
import { X, FileCheck2, Printer, AlertCircle, CheckCircle2, User, Home, Calendar, Loader2 } from 'lucide-react';

export default function VacateNocModal({ isOpen, onClose, onConfirmVacate, unit }) {
  const [moveOutDate, setMoveOutDate] = useState(new Date().toISOString().split('T')[0]);
  const [submitting, setSubmitting] = useState(false);
  const [showCertificate, setShowCertificate] = useState(false);

  // The certificate used to assert zero dues as fixed text. It now reads the
  // real ledger, and the server refuses to issue while a balance is open.
  const [dues, setDues] = useState(null);
  const [duesLoading, setDuesLoading] = useState(false);
  const [waiveDues, setWaiveDues] = useState(false);
  const [waiverReason, setWaiverReason] = useState('');
  const [certificate, setCertificate] = useState(null);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!isOpen || !unit?.unit_id) return;

    setDues(null);
    setCertificate(null);
    setWaiveDues(false);
    setWaiverReason('');
    setError('');
    setShowCertificate(false);
    setDuesLoading(true);

    api
      .get(`/api/units/${unit.unit_id}/dues`)
      .then((res) => setDues(res.data.data))
      .catch(() => setError('Could not check outstanding dues for this home.'))
      .finally(() => setDuesLoading(false));
  }, [isOpen, unit?.unit_id]);

  if (!isOpen || !unit) return null;

  const hasDues = Boolean(dues && dues.balance > 0);
  const blocked = hasDues && !waiveDues;
  const needsReason = hasDues && waiveDues && !waiverReason.trim();

  const handleVacate = async () => {
    setError('');
    setSubmitting(true);

    const result = await onConfirmVacate(unit.unit_id, moveOutDate, {
      waive_dues: waiveDues,
      waiver_reason: waiverReason.trim()
    });

    if (result?.success) {
      setCertificate(result.certificate);
      setShowCertificate(true);
    } else if (result?.message) {
      setError(result.message);
    }

    setSubmitting(false);
  };

  const handlePrint = () => {
    window.print();
  };

  return (
    <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-xl border border-slate-100 overflow-hidden animate-in fade-in zoom-in-95 duration-200">
        
        {/* Modal Header */}
        <div className="flex justify-between items-center px-6 py-5 border-b border-slate-100 bg-slate-50">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-rose-100 text-rose-700 rounded-xl">
              <FileCheck2 className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-lg font-bold text-slate-800">Move-Out & NOC Clearance</h2>
              <p className="text-xs text-slate-500">Vacating Home {unit.number} • {unit.resident_name}</p>
            </div>
          </div>
          <button 
            onClick={onClose} 
            className="p-1.5 text-slate-400 hover:text-slate-600 hover:bg-slate-200 rounded-full transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Modal Body */}
        <div className="p-6 space-y-6 max-h-[80vh] overflow-y-auto">
          
          {/* Certificate View */}
          {showCertificate ? (
            <div className="space-y-4">
              <div id="noc-certificate" className="border-2 border-slate-800 rounded-xl p-6 bg-slate-50/50 space-y-4 font-serif">
                <div className="text-center border-b-2 border-slate-300 pb-3">
                  <h3 className="text-xl font-bold uppercase tracking-widest text-slate-900">LogApart Community</h3>
                  <p className="text-xs text-slate-600 uppercase font-sans">No Objection Certificate (NOC) / Exit Clearance Pass</p>
                </div>

                <div className="text-xs text-slate-700 space-y-2 leading-relaxed font-sans">
                  <p>
                    This is to certify that <strong>{certificate?.resident_name || unit.resident_name}</strong>, residing at{' '}
                    <strong>Home {certificate?.unit_number || unit.number} (Floor {unit.floor})</strong>, has completed all
                    move-out formalities on <strong>{formatDay(certificate?.move_out_date || moveOutDate)}</strong>.
                  </p>
                  {certificate?.dues_waived ? (
                    <p>
                      A balance of <strong>{formatRupees(certificate.outstanding_at_issue)}</strong> was outstanding at the time
                      of issue and was waived by the management. Reason on record:{' '}
                      <strong>{certificate.waiver_reason}</strong>.
                    </p>
                  ) : (
                    <p>
                      The building ledger shows no outstanding maintenance dues, shared utility charges, or unpaid invoices
                      recorded against this unit.
                    </p>
                  )}
                </div>

                <div className="grid grid-cols-3 gap-4 pt-4 border-t border-slate-200 text-xs font-sans">
                  <div>
                    <span className="text-slate-400 block text-[10px] uppercase">Certificate No.</span>
                    <strong className="text-slate-800">{certificate?.certificate_number || 'Pending'}</strong>
                  </div>
                  <div>
                    <span className="text-slate-400 block text-[10px] uppercase">Authorized By</span>
                    <strong className="text-slate-800">Building Admin Office</strong>
                  </div>
                  <div className="text-right">
                    <span className="text-slate-400 block text-[10px] uppercase">Dues at issue</span>
                    <span className={`inline-flex items-center font-bold ${certificate?.dues_waived ? 'text-amber-700' : 'text-emerald-700'}`}>
                      <CheckCircle2 className="w-3.5 h-3.5 mr-1" />
                      {formatRupees(certificate?.outstanding_at_issue || 0)}
                    </span>
                  </div>
                </div>
              </div>

              <div className="flex justify-between items-center pt-2">
                <button
                  type="button"
                  onClick={certificate ? onClose : () => setShowCertificate(false)}
                  className="text-xs font-semibold text-slate-500 hover:text-slate-700"
                >
                  {certificate ? 'Close' : 'Back to checklist'}
                </button>
                <button
                  type="button"
                  onClick={handlePrint}
                  className="flex items-center px-4 py-2 bg-slate-800 text-white rounded-xl text-xs font-bold hover:bg-slate-900 transition-colors shadow-sm"
                >
                  <Printer className="w-3.5 h-3.5 mr-1.5" /> Print Certificate
                </button>
              </div>
            </div>
          ) : (
            <>
              {/* Resident Summary Card */}
              <div className="bg-slate-50 rounded-xl p-4 border border-slate-100 space-y-2 text-sm">
                <div className="flex justify-between">
                  <span className="text-slate-500 flex items-center gap-1.5"><User className="w-4 h-4 text-slate-400" /> Resident:</span>
                  <span className="font-bold text-slate-800">{unit.resident_name}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-500 flex items-center gap-1.5"><Home className="w-4 h-4 text-slate-400" /> Unit:</span>
                  <span className="font-semibold text-slate-700">Home {unit.number} ({unit.type})</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-500 flex items-center gap-1.5"><Calendar className="w-4 h-4 text-slate-400" /> Moved In:</span>
                  <span className="text-slate-700">{unit.move_in_date ? new Date(unit.move_in_date).toLocaleDateString() : 'N/A'}</span>
                </div>
              </div>

              {/* Move out date input */}
              <div>
                <label className="block text-xs font-bold uppercase tracking-wider text-slate-500 mb-1.5">
                  Official Move-Out Date
                </label>
                <input
                  type="date"
                  value={moveOutDate}
                  onChange={(e) => setMoveOutDate(e.target.value)}
                  className="w-full border border-slate-300 rounded-xl p-2.5 outline-none focus:border-teal-500 focus:ring-1 focus:ring-teal-500 text-sm font-semibold text-slate-800"
                />
              </div>

              {/* Dues audit, read from the billing ledger */}
              <div className="space-y-2 pt-2">
                <label className="block text-xs font-bold uppercase tracking-wider text-slate-500">
                  Dues audit
                </label>

                {duesLoading && (
                  <div className="flex items-center gap-2 p-3 bg-slate-50 rounded-xl border border-slate-200 text-xs text-slate-500">
                    <Loader2 className="w-4 h-4 animate-spin" />
                    Checking the ledger for this home...
                  </div>
                )}

                {!duesLoading && dues && !hasDues && (
                  <div className="flex items-center justify-between p-3 bg-emerald-50 text-emerald-800 rounded-xl border border-emerald-100 text-xs">
                    <span className="flex items-center gap-2">
                      <CheckCircle2 className="w-4 h-4 text-emerald-600" /> No outstanding invoices
                    </span>
                    <strong className="text-emerald-700">{formatRupees(0)} due</strong>
                  </div>
                )}

                {!duesLoading && hasDues && (
                  <div className="space-y-2">
                    <div className="p-3 bg-rose-50 text-rose-900 rounded-xl border border-rose-200 text-xs space-y-2">
                      <div className="flex items-center justify-between">
                        <span className="flex items-center gap-2 font-bold">
                          <AlertCircle className="w-4 h-4 text-rose-600" />
                          {dues.open_invoices} unpaid invoice{dues.open_invoices === 1 ? '' : 's'}
                        </span>
                        <strong className="text-sm">{formatRupees(dues.balance)}</strong>
                      </div>
                      <div className="divide-y divide-rose-200/70 border-t border-rose-200/70 pt-1">
                        {dues.invoices.map((invoice) => (
                          <div key={invoice.id} className="flex justify-between py-1">
                            <span>{formatPeriod(invoice.period_month)}</span>
                            <span className="font-semibold">
                              {formatRupees(invoice.balance)}
                              {invoice.days_overdue > 0 ? ` · ${invoice.days_overdue}d late` : ''}
                            </span>
                          </div>
                        ))}
                      </div>
                    </div>

                    <label className="flex items-start gap-2.5 p-3 bg-amber-50 border border-amber-200 rounded-xl cursor-pointer">
                      <input
                        type="checkbox"
                        checked={waiveDues}
                        onChange={(e) => setWaiveDues(e.target.checked)}
                        className="mt-0.5 accent-amber-600"
                      />
                      <span className="text-xs text-amber-900 leading-relaxed">
                        <strong>Waive these dues and issue the certificate anyway.</strong> The waived amount
                        and your reason are recorded on the certificate.
                      </span>
                    </label>

                    {waiveDues && (
                      <input
                        type="text"
                        maxLength={255}
                        placeholder="Reason for the waiver, kept on record"
                        value={waiverReason}
                        onChange={(e) => setWaiverReason(e.target.value)}
                        className="w-full border border-amber-300 rounded-xl p-2.5 outline-none focus:border-amber-500 focus:ring-1 focus:ring-amber-500 text-xs"
                      />
                    )}
                  </div>
                )}
              </div>

              {error && (
                <div className="bg-rose-50 border-l-4 border-rose-500 p-3 rounded-r-md">
                  <p className="text-xs text-rose-700">{error}</p>
                </div>
              )}

              {/* Certificate Preview Trigger */}
              <div className="text-center pt-1">
                <button
                  type="button"
                  onClick={() => setShowCertificate(true)}
                  className="text-xs font-bold text-teal-600 hover:text-teal-700 hover:underline flex items-center justify-center gap-1 mx-auto"
                >
                  <FileCheck2 className="w-3.5 h-3.5" /> Preview the certificate
                </button>
              </div>
            </>
          )}

          {/* Action Footer */}
          {!showCertificate && (
            <div className="pt-4 flex items-center justify-between border-t border-slate-100 mt-6">
              <button
                type="button"
                onClick={onClose}
                className="px-5 py-2.5 text-sm font-semibold text-slate-600 bg-slate-100 rounded-xl hover:bg-slate-200 transition-colors"
              >
                Cancel
              </button>
              
              <button
                type="button"
                disabled={submitting || duesLoading || blocked || needsReason}
                onClick={handleVacate}
                title={blocked ? 'Settle the outstanding dues or record a waiver first' : undefined}
                className="px-6 py-2.5 text-sm font-bold text-white bg-rose-600 rounded-xl hover:bg-rose-700 transition-colors shadow-md disabled:bg-slate-300 disabled:cursor-not-allowed"
              >
                {submitting
                  ? 'Vacating...'
                  : blocked
                    ? 'Dues outstanding'
                    : 'Confirm move-out and issue NOC'}
              </button>
            </div>
          )}
        </div>

      </div>
    </div>
  );
}
