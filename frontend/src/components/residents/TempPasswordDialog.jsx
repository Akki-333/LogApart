import { useState } from 'react';
import { X, KeyRound, Copy, Check, AlertTriangle } from 'lucide-react';

/**
 * Shown once, right after onboarding. The password is never stored in plain
 * text, so if the admin closes this without noting it down the only route back
 * is a reset.
 */
export default function TempPasswordDialog({ credentials, onClose }) {
  const [copied, setCopied] = useState(false);

  if (!credentials) return null;

  const summary = `LogApart login\nEmail: ${credentials.email}\nTemporary password: ${credentials.password}`;

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(summary);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      setCopied(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md border border-slate-200 overflow-hidden">
        <div className="flex justify-between items-center px-6 py-5 border-b border-slate-100 bg-slate-50">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-teal-100 text-teal-800 rounded-xl">
              <KeyRound className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base font-bold text-slate-800">Resident account created</h2>
              <p className="text-xs text-slate-500">Pass these details on to {credentials.name}</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 text-slate-400 hover:text-slate-600 hover:bg-slate-200 rounded-full transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-6 space-y-4">
          <div className="flex items-start gap-2.5 bg-amber-50 border border-amber-200 rounded-xl p-3">
            <AlertTriangle className="w-4 h-4 text-amber-700 shrink-0 mt-0.5" />
            <p className="text-xs text-amber-900 leading-relaxed">
              This password is shown once and cannot be retrieved later. The resident
              is required to replace it the first time they sign in.
            </p>
          </div>

          <div className="bg-slate-50 border border-slate-200 rounded-xl divide-y divide-slate-200">
            <div className="px-4 py-3">
              <span className="block text-[10px] font-bold uppercase tracking-wider text-slate-400">Email</span>
              <span className="text-sm font-semibold text-slate-800 break-all">{credentials.email}</span>
            </div>
            <div className="px-4 py-3">
              <span className="block text-[10px] font-bold uppercase tracking-wider text-slate-400">Temporary password</span>
              <span className="text-base font-mono font-bold text-teal-800 tracking-wide">{credentials.password}</span>
            </div>
          </div>

          <div className="flex gap-2.5">
            <button
              onClick={handleCopy}
              className="flex-1 flex items-center justify-center px-4 py-2.5 bg-white hover:bg-slate-50 text-slate-700 font-bold border border-slate-200 rounded-xl text-sm transition-colors"
            >
              {copied ? <Check className="w-4 h-4 mr-2 text-emerald-600" /> : <Copy className="w-4 h-4 mr-2" />}
              {copied ? 'Copied' : 'Copy details'}
            </button>
            <button
              onClick={onClose}
              className="flex-1 px-4 py-2.5 bg-teal-600 hover:bg-teal-700 text-white font-bold rounded-xl text-sm transition-colors"
            >
              Done
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
