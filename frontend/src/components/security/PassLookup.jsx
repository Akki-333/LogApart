import { useState } from 'react';
import api from '../../lib/api';
import { KeyRound, Search, UserCheck, X, AlertCircle } from 'lucide-react';

/**
 * Gate-desk lookup for a pre-approved visitor. The guard types the six
 * characters the resident gave their guest, sees who it belongs to, and admits
 * them without ringing the flat.
 */
export default function PassLookup({ onAdmitted }) {
  const [code, setCode] = useState('');
  const [pass, setPass] = useState(null);
  const [error, setError] = useState('');
  const [searching, setSearching] = useState(false);
  const [admitting, setAdmitting] = useState(false);
  const [vehicleNumber, setVehicleNumber] = useState('');

  const reset = () => {
    setCode('');
    setPass(null);
    setError('');
    setVehicleNumber('');
  };

  const handleSearch = async (e) => {
    e.preventDefault();
    setError('');
    setPass(null);
    setSearching(true);

    try {
      const res = await api.get(`/api/security/passes/lookup?code=${encodeURIComponent(code.trim())}`);
      setPass(res.data.data);
      setVehicleNumber(res.data.data.vehicle_number || '');
    } catch (err) {
      setError(err.response?.data?.message || 'Could not check that code.');
    } finally {
      setSearching(false);
    }
  };

  const handleAdmit = async () => {
    setAdmitting(true);

    try {
      const res = await api.put(`/api/security/passes/${pass.id}/admit`, {
        vehicle_number: vehicleNumber || null,
        vehicle_type: vehicleNumber ? 'CAR' : null
      });
      onAdmitted(res.data.message);
      reset();
    } catch (err) {
      setError(err.response?.data?.message || 'Could not admit this visitor.');
      setAdmitting(false);
    }
  };

  return (
    <div className="bg-slate-800 border border-slate-700 rounded-2xl p-5">
      <div className="flex items-center gap-2.5 mb-3">
        <span className="p-2 bg-indigo-500/20 text-indigo-300 rounded-xl">
          <KeyRound className="w-5 h-5" />
        </span>
        <div>
          <h3 className="text-sm font-bold text-white">Expected visitor</h3>
          <p className="text-xs text-slate-400">Type the code the resident gave them</p>
        </div>
      </div>

      <form onSubmit={handleSearch} className="flex gap-2.5">
        <input
          type="text"
          value={code}
          onChange={(e) => setCode(e.target.value.toUpperCase())}
          placeholder="A1B2C3"
          maxLength={12}
          className="flex-1 px-4 py-3 bg-slate-900 border-2 border-slate-700 rounded-xl text-lg font-mono font-black tracking-[0.25em] text-white placeholder-slate-600 outline-none focus:border-indigo-500 transition-colors"
        />
        <button
          type="submit"
          disabled={searching || code.trim().length < 4}
          className="px-5 py-3 bg-indigo-600 hover:bg-indigo-700 disabled:bg-slate-700 disabled:text-slate-500 text-white font-bold rounded-xl transition-colors flex items-center"
        >
          <Search className="w-5 h-5 mr-2" />
          {searching ? 'Checking' : 'Check'}
        </button>
      </form>

      {error && (
        <div className="mt-3 flex items-start gap-2.5 bg-rose-500/15 border border-rose-500/40 rounded-xl p-3">
          <AlertCircle className="w-4 h-4 text-rose-400 shrink-0 mt-0.5" />
          <p className="text-sm text-rose-200">{error}</p>
        </div>
      )}

      {pass && (
        <div className="mt-4 bg-emerald-500/10 border border-emerald-500/40 rounded-xl p-4">
          <div className="flex items-start justify-between gap-4">
            <div>
              <div className="text-lg font-black text-white">{pass.visitor_name}</div>
              <div className="text-sm text-emerald-300 font-semibold mt-0.5">
                Visiting Flat {pass.unit_number}, floor {pass.unit_floor}
              </div>
              <div className="text-xs text-slate-400 mt-1">
                Approved by {pass.pre_approved_by || 'the resident'}
                {pass.visitor_phone ? ` · ${pass.visitor_phone}` : ''}
                <span className="capitalize"> · {String(pass.purpose).toLowerCase()}</span>
              </div>
            </div>
            <button onClick={reset} className="p-1.5 text-slate-400 hover:text-white rounded-full transition-colors">
              <X className="w-5 h-5" />
            </button>
          </div>

          <div className="flex gap-2.5 mt-4">
            <input
              type="text"
              value={vehicleNumber}
              onChange={(e) => setVehicleNumber(e.target.value.toUpperCase())}
              placeholder="Vehicle number, if any"
              maxLength={50}
              className="flex-1 px-3 py-2.5 bg-slate-900 border border-slate-700 rounded-xl text-sm font-semibold text-white placeholder-slate-600 outline-none focus:border-emerald-500 transition-colors"
            />
            <button
              onClick={handleAdmit}
              disabled={admitting}
              className="px-5 py-2.5 bg-emerald-600 hover:bg-emerald-700 disabled:bg-slate-700 text-white font-bold rounded-xl transition-colors flex items-center"
            >
              <UserCheck className="w-5 h-5 mr-2" />
              {admitting ? 'Admitting' : 'Let them in'}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
