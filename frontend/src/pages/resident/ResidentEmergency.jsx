import { useState, useEffect } from 'react';
import api from '../../lib/api';
import { Siren, Phone, ShieldAlert, Package } from 'lucide-react';
import { formatDay } from '../../lib/money';

/**
 * The numbers and the button.
 *
 * The button raises an urgent notification at the gate and with the building
 * admins. It does not dial anybody, and the screen says so in as many words,
 * because somebody in trouble should not waste seconds believing help is
 * already on its way when it is not.
 */
export default function ResidentEmergency() {
  const [contacts, setContacts] = useState([]);
  const [parcels, setParcels] = useState([]);
  const [detail, setDetail] = useState('');
  const [sending, setSending] = useState(false);
  const [banner, setBanner] = useState('');

  useEffect(() => {
    api.get('/api/emergency/contacts')
      .then((response) => setContacts(response.data.data))
      .catch((error) => console.error('Failed to load emergency contacts', error));

    api.get('/api/parcels?waiting=true')
      .then((response) => setParcels(response.data.data))
      .catch((error) => console.error('Failed to load parcels', error));
  }, []);

  const raise = async () => {
    if (!window.confirm('Alert the gate and the building admins now?')) return;

    setSending(true);
    try {
      const response = await api.post('/api/emergency/alert', { detail: detail.trim() });
      setBanner(response.data.message);
      setDetail('');
    } catch (error) {
      alert(error.response?.data?.message || 'Could not raise that alert');
    } finally {
      setSending(false);
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-black text-slate-900">Help</h1>
        <p className="text-sm text-slate-500 mt-0.5">The gate, the numbers, and anything waiting for you</p>
      </div>

      {banner && (
        <div className="bg-emerald-50 border border-emerald-200 rounded-xl px-4 py-3 text-sm font-semibold text-emerald-900">
          {banner}
        </div>
      )}

      <div className="bg-rose-50 border border-rose-200 rounded-2xl p-5">
        <div className="flex items-center gap-2 mb-2">
          <Siren className="w-5 h-5 text-rose-700" />
          <h2 className="text-sm font-black text-rose-900">Alert the gate</h2>
        </div>
        <p className="text-xs text-rose-900/80 leading-relaxed mb-3">
          This wakes the guard on duty and every building admin with your flat, your floor
          and your phone number. It does not call the police, an ambulance or the fire
          service. Use the numbers below for that.
        </p>

        <input
          value={detail}
          onChange={(event) => setDetail(event.target.value)}
          placeholder="What is happening, if you have a moment"
          maxLength={200}
          className="w-full px-3 py-2.5 border border-rose-200 rounded-xl text-sm mb-3 bg-white"
        />

        <button
          onClick={raise}
          disabled={sending}
          className="w-full px-4 py-3 bg-rose-600 hover:bg-rose-700 text-white font-black rounded-xl text-sm transition-colors disabled:opacity-60"
        >
          {sending ? 'Alerting...' : 'Alert the gate now'}
        </button>
      </div>

      <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden">
        <div className="px-5 py-3.5 border-b border-slate-100 flex items-center gap-2">
          <ShieldAlert className="w-4 h-4 text-teal-600" />
          <h3 className="text-sm font-bold text-slate-800">Numbers to call</h3>
        </div>

        {contacts.length === 0 ? (
          <p className="px-5 py-8 text-center text-sm text-slate-400">
            The building has not listed any numbers yet. Ask the admin to add them.
          </p>
        ) : (
          <ul className="divide-y divide-slate-100">
            {contacts.map((contact) => (
              <li key={contact.id} className="px-5 py-3 flex items-center justify-between gap-3">
                <div>
                  <p className="text-sm font-semibold text-slate-800">{contact.label}</p>
                  {contact.note && <p className="text-[11px] text-slate-500">{contact.note}</p>}
                </div>
                <a
                  href={`tel:${contact.phone}`}
                  className="flex items-center gap-1.5 px-3 py-2 bg-teal-600 hover:bg-teal-700 text-white text-xs font-bold rounded-xl"
                >
                  <Phone className="w-3.5 h-3.5" /> {contact.phone}
                </a>
              </li>
            ))}
          </ul>
        )}
      </div>

      <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden">
        <div className="px-5 py-3.5 border-b border-slate-100 flex items-center gap-2">
          <Package className="w-4 h-4 text-teal-600" />
          <h3 className="text-sm font-bold text-slate-800">Waiting at the gate</h3>
        </div>

        {parcels.length === 0 ? (
          <p className="px-5 py-8 text-center text-sm text-slate-400">Nothing is being held for your flat.</p>
        ) : (
          <ul className="divide-y divide-slate-100">
            {parcels.map((parcel) => (
              <li key={parcel.id} className="px-5 py-3">
                <p className="text-sm font-semibold text-slate-800">{parcel.courier || 'A delivery'}</p>
                <p className="text-[11px] text-slate-500">
                  {parcel.description || 'No description'} · taken in {formatDay(parcel.received_at)} by {parcel.received_by}
                </p>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
