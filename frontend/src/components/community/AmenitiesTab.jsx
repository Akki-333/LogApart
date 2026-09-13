import { useState, useEffect, useCallback } from 'react';
import api from '../../lib/api';
import { formatRupees, formatDay } from '../../lib/money';
import { Plus, CalendarDays, Check, X } from 'lucide-react';
import { useFeedback } from '../common/Feedback';

const shortTime = (value) => String(value).slice(0, 5);

/** What the building lets residents book, and the requests waiting on a yes. */
export default function AmenitiesTab({ onAction }) {
  const { toast, askReason } = useFeedback();
  const [amenities, setAmenities] = useState([]);
  const [bookings, setBookings] = useState([]);
  const [loading, setLoading] = useState(true);
  const [form, setForm] = useState({
    name: '', slot_hours: 2, charge: '', opens_at: '08:00', closes_at: '22:00', needs_approval: false
  });

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [list, booked] = await Promise.all([
        api.get('/api/amenities'),
        api.get('/api/amenities/bookings/all')
      ]);
      setAmenities(list.data.data);
      setBookings(booked.data.data);
    } catch (error) {
      console.error('Failed to load amenities', error);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const add = async (event) => {
    event.preventDefault();
    try {
      await api.post('/api/amenities', {
        ...form,
        slot_hours: Number(form.slot_hours),
        charge: Number(form.charge || 0),
        opens_at: `${form.opens_at}:00`,
        closes_at: `${form.closes_at}:00`
      });
      setForm({ name: '', slot_hours: 2, charge: '', opens_at: '08:00', closes_at: '22:00', needs_approval: false });
      onAction('Amenity opened for booking.');
      load();
    } catch (error) {
      toast.error(error.response?.data?.message || 'Could not open that for booking');
    }
  };

  // Refusing frees the slot, so a request that is never going to happen does
  // not sit on the terrace all weekend.
  const review = async (booking, approve) => {
    let note = '';

    if (!approve) {
      note = await askReason({
        title: `Why can home ${booking.unit_number} not have that slot?`,
        message: 'The resident is told what you write here, and the slot is freed.',
        confirmLabel: 'Refuse the booking'
      });
      if (note === null) return;
    }

    try {
      const response = await api.post(`/api/amenities/bookings/${booking.id}/review`, { approve, note: note.trim() });
      onAction(response.data.message);
      load();
    } catch (error) {
      toast.error(error.response?.data?.message || 'Could not review that booking');
    }
  };

  const waiting = bookings.filter((booking) => booking.status === 'PENDING');
  const upcoming = bookings
    .filter((booking) => booking.status === 'CONFIRMED' && booking.booking_date >= new Date().toISOString().slice(0, 10))
    .slice(0, 10);

  if (loading) return <p className="text-sm text-slate-400 py-10 text-center">Loading...</p>;

  return (
    <div className="space-y-5">
      {waiting.length > 0 && (
        <div className="bg-white border border-amber-200 rounded-2xl overflow-hidden">
          <div className="px-5 py-3.5 border-b border-amber-100 bg-amber-50">
            <h3 className="text-sm font-bold text-amber-900">{waiting.length} waiting on a yes</h3>
          </div>
          <ul className="divide-y divide-slate-100">
            {waiting.map((booking) => (
              <li key={booking.id} className="px-5 py-3 flex flex-wrap items-center gap-3">
                <div className="flex-1 min-w-[200px]">
                  <p className="text-sm font-semibold text-slate-800">
                    {booking.amenity_name} · home {booking.unit_number}
                  </p>
                  <p className="text-[11px] text-slate-500">
                    {formatDay(booking.booking_date)} · {shortTime(booking.starts_at)} to {shortTime(booking.ends_at)}
                    {booking.note && ` · ${booking.note}`}
                  </p>
                </div>
                <button onClick={() => review(booking, true)}
                  className="flex items-center gap-1 px-2.5 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold rounded-lg">
                  <Check className="w-3.5 h-3.5" /> Confirm
                </button>
                <button onClick={() => review(booking, false)}
                  className="flex items-center gap-1 px-2.5 py-1.5 bg-white hover:bg-rose-50 text-rose-600 border border-rose-200 text-xs font-bold rounded-lg">
                  <X className="w-3.5 h-3.5" /> Refuse
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}

      <div className="grid lg:grid-cols-2 gap-5">
        <div className="bg-white border border-slate-200 rounded-2xl overflow-hidden">
          <div className="px-5 py-3.5 border-b border-slate-100 flex items-center gap-2">
            <CalendarDays className="w-4 h-4 text-teal-600" />
            <h3 className="text-sm font-bold text-slate-800">What can be booked</h3>
          </div>

          <form onSubmit={add} className="px-5 py-3 border-b border-slate-100 grid grid-cols-2 gap-2">
            <input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })}
              placeholder="Clubhouse, terrace" required className="px-3 py-2 border border-slate-200 rounded-xl text-sm" />
            <input type="number" value={form.charge} onChange={(e) => setForm({ ...form, charge: e.target.value })}
              placeholder="Charge per booking" className="px-3 py-2 border border-slate-200 rounded-xl text-sm" />
            <label className="text-[11px] text-slate-500">Opens
              <input type="time" value={form.opens_at} onChange={(e) => setForm({ ...form, opens_at: e.target.value })}
                className="w-full px-3 py-2 border border-slate-200 rounded-xl text-sm" />
            </label>
            <label className="text-[11px] text-slate-500">Closes
              <input type="time" value={form.closes_at} onChange={(e) => setForm({ ...form, closes_at: e.target.value })}
                className="w-full px-3 py-2 border border-slate-200 rounded-xl text-sm" />
            </label>
            <label className="text-[11px] text-slate-500 flex items-center gap-2">
              <input type="checkbox" checked={form.needs_approval}
                onChange={(e) => setForm({ ...form, needs_approval: e.target.checked })} />
              Needs the office to confirm
            </label>
            <button type="submit" className="flex items-center justify-center px-3 py-2 bg-teal-600 hover:bg-teal-700 text-white font-bold rounded-xl text-sm">
              <Plus className="w-4 h-4 mr-1" /> Open it
            </button>
          </form>

          {amenities.length === 0 ? (
            <p className="px-5 py-8 text-center text-sm text-slate-400">Nothing can be booked yet.</p>
          ) : (
            <ul className="divide-y divide-slate-100">
              {amenities.map((amenity) => (
                <li key={amenity.id} className="px-5 py-3">
                  <p className="text-sm font-semibold text-slate-800">{amenity.name}</p>
                  <p className="text-[11px] text-slate-500">
                    {shortTime(amenity.opens_at)} to {shortTime(amenity.closes_at)} · {amenity.slot_hours}h slots
                    {amenity.charge > 0 && ` · ${formatRupees(amenity.charge)}`}
                    {amenity.needs_approval ? ' · office confirms' : ' · books instantly'}
                  </p>
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className="bg-white border border-slate-200 rounded-2xl overflow-hidden">
          <div className="px-5 py-3.5 border-b border-slate-100">
            <h3 className="text-sm font-bold text-slate-800">Coming up</h3>
          </div>

          {upcoming.length === 0 ? (
            <p className="px-5 py-8 text-center text-sm text-slate-400">Nothing booked ahead.</p>
          ) : (
            <ul className="divide-y divide-slate-100">
              {upcoming.map((booking) => (
                <li key={booking.id} className="px-5 py-3">
                  <p className="text-sm font-semibold text-slate-800">
                    {booking.amenity_name} · home {booking.unit_number}
                  </p>
                  <p className="text-[11px] text-slate-500">
                    {formatDay(booking.booking_date)} · {shortTime(booking.starts_at)} to {shortTime(booking.ends_at)}
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
