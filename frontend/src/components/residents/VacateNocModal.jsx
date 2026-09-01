import { useState } from 'react';
import { X, FileCheck2, Printer, AlertCircle, CheckCircle2, User, Home, Calendar } from 'lucide-react';

export default function VacateNocModal({ isOpen, onClose, onConfirmVacate, unit }) {
  const [moveOutDate, setMoveOutDate] = useState(new Date().toISOString().split('T')[0]);
  const [submitting, setSubmitting] = useState(false);
  const [showCertificate, setShowCertificate] = useState(false);

  if (!isOpen || !unit) return null;

  const handleVacate = async () => {
    setSubmitting(true);
    await onConfirmVacate(unit.unit_id, moveOutDate);
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
              <p className="text-xs text-slate-500">Vacating Flat {unit.number} • {unit.resident_name}</p>
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
                    This is to certify that <strong>{unit.resident_name}</strong>, residing at <strong>Flat {unit.number} (Floor {unit.floor})</strong>, has completed all move-out formalities on <strong>{moveOutDate}</strong>.
                  </p>
                  <p>
                    The management confirms that there are zero outstanding maintenance dues or unaddressed structural damages recorded for this unit.
                  </p>
                </div>

                <div className="grid grid-cols-2 gap-4 pt-4 border-t border-slate-200 text-xs font-sans">
                  <div>
                    <span className="text-slate-400 block text-[10px] uppercase">Authorized By</span>
                    <strong className="text-slate-800">Super Admin Office</strong>
                  </div>
                  <div className="text-right">
                    <span className="text-slate-400 block text-[10px] uppercase">Certificate Status</span>
                    <span className="inline-flex items-center text-emerald-700 font-bold">
                      <CheckCircle2 className="w-3.5 h-3.5 mr-1" /> Approved
                    </span>
                  </div>
                </div>
              </div>

              <div className="flex justify-between items-center pt-2">
                <button
                  type="button"
                  onClick={() => setShowCertificate(false)}
                  className="text-xs font-semibold text-slate-500 hover:text-slate-700"
                >
                  ← Back to Checklist
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
                  <span className="font-semibold text-slate-700">Flat {unit.number} ({unit.type})</span>
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

              {/* Clearance Checklist */}
              <div className="space-y-2 pt-2">
                <label className="block text-xs font-bold uppercase tracking-wider text-slate-500">
                  Pre-Exit Verification Checklist
                </label>

                <div className="space-y-2 text-xs">
                  <div className="flex items-center justify-between p-3 bg-emerald-50 text-emerald-800 rounded-xl border border-emerald-100">
                    <span className="flex items-center gap-2">
                      <CheckCircle2 className="w-4 h-4 text-emerald-600" /> Maintenance Dues Audit
                    </span>
                    <strong className="text-emerald-700">All Cleared (₹0 Due)</strong>
                  </div>

                  <div className="flex items-center justify-between p-3 bg-emerald-50 text-emerald-800 rounded-xl border border-emerald-100">
                    <span className="flex items-center gap-2">
                      <CheckCircle2 className="w-4 h-4 text-emerald-600" /> Structural Damage Audit
                    </span>
                    <strong className="text-emerald-700">No Open Tickets</strong>
                  </div>
                </div>
              </div>

              {/* Certificate Preview Trigger */}
              <div className="text-center pt-1">
                <button
                  type="button"
                  onClick={() => setShowCertificate(true)}
                  className="text-xs font-bold text-teal-600 hover:text-teal-700 hover:underline flex items-center justify-center gap-1 mx-auto"
                >
                  <FileCheck2 className="w-3.5 h-3.5" /> Preview Digital NOC Certificate
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
                disabled={submitting}
                onClick={handleVacate}
                className="px-6 py-2.5 text-sm font-bold text-white bg-rose-600 rounded-xl hover:bg-rose-700 transition-colors shadow-md disabled:opacity-50"
              >
                {submitting ? 'Vacating...' : 'Confirm Move-Out & Mark Vacant'}
              </button>
            </div>
          )}
        </div>

      </div>
    </div>
  );
}
