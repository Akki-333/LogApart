import { useState, useEffect, useCallback } from 'react';
import api from '../../lib/api';
import { formatRupees, formatDay } from '../../lib/money';
import { Plus, Building, AlertTriangle, Phone, CalendarClock } from 'lucide-react';
import { useFeedback } from '../common/Feedback';

const today = () => new Date().toISOString().slice(0, 10);

/**
 * Who the building pays and what it is bound by. The renewal warning is the
 * reason this exists: an AMC that lapses quietly is found out by the lift.
 */
export default function VendorsTab({ onAction }) {
  const { toast } = useFeedback();
  const [vendors, setVendors] = useState([]);
  const [contracts, setContracts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [vendorForm, setVendorForm] = useState({ name: '', service: '', contact_person: '', phone: '' });
  const [contractForm, setContractForm] = useState({
    vendor_id: '', title: '', start_date: today(), end_date: '', amount: '', remind_days_before: 30
  });

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [vendorList, contractList] = await Promise.all([
        api.get('/api/finance/vendors'),
        api.get('/api/finance/contracts')
      ]);
      setVendors(vendorList.data.data);
      setContracts(contractList.data.data);
    } catch (error) {
      console.error('Failed to load vendors', error);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const addVendor = async (event) => {
    event.preventDefault();
    try {
      await api.post('/api/finance/vendors', vendorForm);
      setVendorForm({ name: '', service: '', contact_person: '', phone: '' });
      onAction(`${vendorForm.name} added to the registry.`);
      load();
    } catch (error) {
      toast.error(error.response?.data?.message || 'Could not add that vendor');
    }
  };

  const addContract = async (event) => {
    event.preventDefault();
    try {
      await api.post('/api/finance/contracts', { ...contractForm, amount: Number(contractForm.amount || 0) });
      setContractForm({ vendor_id: '', title: '', start_date: today(), end_date: '', amount: '', remind_days_before: 30 });
      onAction('Contract recorded.');
      load();
    } catch (error) {
      toast.error(error.response?.data?.message || 'Could not record that contract');
    }
  };

  // Expired ones stay in the warning rather than dropping out of sight, because
  // a lapsed AMC is more urgent than one about to lapse, not less.
  const renewing = contracts.filter((contract) => contract.needs_renewal || contract.has_expired);

  if (loading) return <p className="text-sm text-slate-400 py-10 text-center">Reading the registry...</p>;

  return (
    <div className="space-y-5">
      {renewing.length > 0 && (
        <div className="bg-amber-50 border border-amber-200 rounded-2xl p-4">
          <div className="flex items-center gap-2 mb-2">
            <AlertTriangle className="w-4 h-4 text-amber-700" />
            <h3 className="text-sm font-bold text-amber-900">Needs renewing</h3>
          </div>
          <ul className="space-y-1.5">
            {renewing.map((contract) => (
              <li key={contract.id} className="text-xs text-amber-900">
                <span className="font-bold">{contract.vendor_name}</span> · {contract.title} ·{' '}
                {contract.has_expired
                  ? `expired ${formatDay(contract.end_date)}`
                  : `${contract.days_remaining} days left, to ${formatDay(contract.end_date)}`}
              </li>
            ))}
          </ul>
        </div>
      )}

      <div className="grid lg:grid-cols-2 gap-5">
        <div className="bg-white border border-slate-200 rounded-2xl overflow-hidden">
          <div className="px-5 py-3.5 border-b border-slate-100 flex items-center gap-2">
            <Building className="w-4 h-4 text-teal-600" />
            <h3 className="text-sm font-bold text-slate-800">Vendors</h3>
          </div>

          <form onSubmit={addVendor} className="px-5 py-3 border-b border-slate-100 grid grid-cols-2 gap-2">
            <input value={vendorForm.name} onChange={(e) => setVendorForm({ ...vendorForm, name: e.target.value })}
              placeholder="Name" required className="px-3 py-2 border border-slate-200 rounded-xl text-sm" />
            <input value={vendorForm.service} onChange={(e) => setVendorForm({ ...vendorForm, service: e.target.value })}
              placeholder="What they do" required className="px-3 py-2 border border-slate-200 rounded-xl text-sm" />
            <input value={vendorForm.contact_person} onChange={(e) => setVendorForm({ ...vendorForm, contact_person: e.target.value })}
              placeholder="Contact" className="px-3 py-2 border border-slate-200 rounded-xl text-sm" />
            <div className="flex gap-2">
              <input value={vendorForm.phone} onChange={(e) => setVendorForm({ ...vendorForm, phone: e.target.value })}
                placeholder="Phone" className="flex-1 min-w-0 px-3 py-2 border border-slate-200 rounded-xl text-sm" />
              <button type="submit" className="px-3 py-2 bg-teal-600 hover:bg-teal-700 text-white rounded-xl">
                <Plus className="w-4 h-4" />
              </button>
            </div>
          </form>

          {vendors.length === 0 ? (
            <p className="px-5 py-8 text-center text-sm text-slate-400">Nobody on the registry yet.</p>
          ) : (
            <ul className="divide-y divide-slate-100">
              {vendors.map((vendor) => (
                <li key={vendor.id} className="px-5 py-3 flex items-center justify-between gap-3">
                  <div className="min-w-0">
                    <p className="text-sm font-semibold text-slate-800">{vendor.name}</p>
                    <p className="text-[11px] text-slate-500 flex items-center gap-2">
                      {vendor.service}
                      {vendor.phone && <span className="flex items-center gap-1"><Phone className="w-3 h-3" />{vendor.phone}</span>}
                    </p>
                  </div>
                  <div className="text-right shrink-0">
                    <p className="text-sm font-bold text-slate-800">{formatRupees(vendor.spent_total)}</p>
                    <p className="text-[10px] text-slate-400">{vendor.live_contracts} live contracts</p>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className="bg-white border border-slate-200 rounded-2xl overflow-hidden">
          <div className="px-5 py-3.5 border-b border-slate-100 flex items-center gap-2">
            <CalendarClock className="w-4 h-4 text-teal-600" />
            <h3 className="text-sm font-bold text-slate-800">Contracts</h3>
          </div>

          <form onSubmit={addContract} className="px-5 py-3 border-b border-slate-100 grid grid-cols-2 gap-2">
            <select value={contractForm.vendor_id} onChange={(e) => setContractForm({ ...contractForm, vendor_id: e.target.value })}
              required className="px-3 py-2 border border-slate-200 rounded-xl text-sm">
              <option value="">Vendor</option>
              {vendors.map((vendor) => <option key={vendor.id} value={vendor.id}>{vendor.name}</option>)}
            </select>
            <input value={contractForm.title} onChange={(e) => setContractForm({ ...contractForm, title: e.target.value })}
              placeholder="What it covers" required className="px-3 py-2 border border-slate-200 rounded-xl text-sm" />
            <label className="text-[11px] text-slate-500">Starts
              <input type="date" value={contractForm.start_date} required
                onChange={(e) => setContractForm({ ...contractForm, start_date: e.target.value })}
                className="w-full px-3 py-2 border border-slate-200 rounded-xl text-sm" />
            </label>
            <label className="text-[11px] text-slate-500">Ends
              <input type="date" value={contractForm.end_date} required
                onChange={(e) => setContractForm({ ...contractForm, end_date: e.target.value })}
                className="w-full px-3 py-2 border border-slate-200 rounded-xl text-sm" />
            </label>
            <input type="number" value={contractForm.amount} placeholder="Value"
              onChange={(e) => setContractForm({ ...contractForm, amount: e.target.value })}
              className="px-3 py-2 border border-slate-200 rounded-xl text-sm" />
            <button type="submit" className="px-3 py-2 bg-slate-900 hover:bg-slate-800 text-white font-bold rounded-xl text-sm">
              Record it
            </button>
          </form>

          {contracts.length === 0 ? (
            <p className="px-5 py-8 text-center text-sm text-slate-400">No contracts recorded.</p>
          ) : (
            <ul className="divide-y divide-slate-100">
              {contracts.map((contract) => (
                <li key={contract.id} className="px-5 py-3">
                  <p className="text-sm font-semibold text-slate-800">{contract.title}</p>
                  <p className="text-[11px] text-slate-500">
                    {contract.vendor_name} · {formatRupees(contract.amount)} · to {formatDay(contract.end_date)}
                    {contract.has_expired && <span className="text-rose-700 font-bold"> · expired</span>}
                    {contract.needs_renewal && <span className="text-amber-700 font-bold"> · {contract.days_remaining} days left</span>}
                  </p>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </div>
  );
}
