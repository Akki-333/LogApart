import { useState, useEffect, useCallback } from 'react';
import api from '../../lib/api';
import { formatRupees, formatDay } from '../../lib/money';
import { CalendarDays, Clock, X, AlertCircle } from 'lucide-react';

const tomorrow = () => new Date(Date.now() + 86400000).toISOString().slice(0, 10);
const shortTime = (value) => String(value).slice(0, 5);

/**
 * Booking the terrace or the clubhouse. Slots come from the server, so a change
 * to the opening hours reaches this screen without a release.
 */
export default function ResidentAmenities() {
  const [amenities, setAmenities] = useState([]);
  const [selected, setSelected] = useState(null);
  const [date, setDate] = useState(tomorrow());
  const [availability, setAvailability] = useState(null);
  const [bookings, setBookings] = useState([]);
  const [loading, setLoading] = useState(true);
  const [banner, setBanner] = useState('');

  const loadBookings = useCallback(async () => {
    try {
      const response = await api.get('/api/amenities/bookings/all');
      setBookings(response.data.data);
    } catch (error) {
      console.error('Failed to load bookings', error);
    }
  }, []);

  useEffect(() => {
    const load = async () => {
      try {
        const response = await api.get('/api/amenities');
        setAmenities(response.data.data);
        setSelected(response.data.data[0]?.id ?? null);
      } catch (error) {
        console.error('Failed to load amenities', error);
      } finally {
        setLoading(false);
      }
    };

    load();
    loadBookings();
  }, [loadBookings]);

  useEffect(() => {
    if (!selected) return;

    api
      .get(`/api/amenities/${selected}/availability?date=${date}`)
      .then((response) => setAvailability(response.data.data))
      .catch((error) => console.error('Failed to load that day', error));
  }, [selected, date, banner]);

  const book = async (slot) => {
    try {
      const response = await api.post('/api/amenities/bookings', {
        amenity_id: selected,
        booking_date: date,
        starts_at: slot.starts_at
      });
      setBanner(response.data.message);
      loadBookings();
    } catch (error) {
      alert(error.response?.data?.message || 'Could not book that slot');
    }
  };

  const cancel = async (booking) => {
    if (!window.confirm(`Give up ${booking.amenity_name} on ${formatDay(booking.booking_date)}?`)) return;

    try {
      await api.delete(`/api/amenities/bookings/${booking.id}`);
      setBanner('Booking cancelled. The slot is free again.');
      loadBookings();
    } catch (error) {
      alert(error.response?.data?.message || 'Could not cancel that booking');
    }
  };

  if (loading) {
    return <div className="flex justify-center py-20"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-teal-600" /></div>;
  }

  if (amenities.length === 0) {
    return (
      <div className="bg-white rounded-2xl border border-slate-200 p-12 text-center">
        <CalendarDays className="w-8 h-8 mx-auto mb-3 text-slate-300" />
        <p className="text-sm font-semibold text-slate-500">The building has nothing to book yet.</p>
      </div>
    );
  }

  const live = bookings.filter((booking) => booking.status !== 'CANCELLED');

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-black text-slate-900">Book a space</h1>
        <p className="text-sm text-slate-500 mt-0.5">One booking per slot, first come first served</p>
      </div>

      {banner && (
        <div className="bg-emerald-50 border border-emerald-200 rounded-xl px-4 py-3 text-sm font-semibold text-emerald-900">
          {banner}
        </div>
      )}

      <div className="flex flex-wrap items-center gap-3">
        <select
          value={selected ?? ''}
          onChange={(event) => setSelected(Number(event.target.value))}
          className="px-3 py-2 border border-slate-200 rounded-xl text-sm bg-white"
        >
          {amenities.map((amenity) => (
            <option key={amenity.id} value={amenity.id}>{amenity.name}</option>
          ))}
        </select>

        <input
          type="date"
          value={date}
          min={new Date().toISOString().slice(0, 10)}
          onChange={(event) => setDate(event.target.value)}
          className="px-3 py-2 border border-slate-200 rounded-xl text-sm"
        />

        {availability?.amenity?.charge > 0 && (
          <span className="text-xs text-slate-500">
            {formatRupees(availability.amenity.charge)} per booking, added to your next bill
          </span>
        )}
      </div>

      <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
        {(availability?.slots || []).map((slot) => {
          const free = slot.status === 'FREE';

          return (
            <button
              key={slot.starts_at}
              disabled={!free}
              onClick={() => book(slot)}
              className={`rounded-2xl border p-4 text-left transition-colors ${
                free
                  ? 'bg-white border-slate-200 hover:border-teal-400 hover:bg-teal-50'
                  : 'bg-slate-50 border-slate-200 cursor-not-allowed'
              }`}
            >
              <div className="flex items-center gap-2 text-sm font-bold text-slate-800">
                <Clock className="w-3.5 h-3.5 text-teal-600" />
                {shortTime(slot.starts_at)} to {shortTime(slot.ends_at)}
              </div>
              <p className={`text-xs mt-1 ${free ? 'text-teal-700 font-semibold' : 'text-slate-400'}`}>
                {free ? 'Free, tap to book' : `Taken by ${slot.taken_by}`}
              </p>
            </button>
          );
        })}
      </div>

      <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden">
        <div className="px-5 py-3.5 border-b border-slate-100">
          <h3 className="text-sm font-bold text-slate-800">Your flat's bookings</h3>
        </div>

        {live.length === 0 ? (
          <p className="px-5 py-8 text-center text-sm text-slate-400">Nothing booked yet.</p>
        ) : (
          <ul className="divide-y divide-slate-100">
            {live.map((booking) => (
              <li key={booking.id} className="px-5 py-3 flex items-center justify-between gap-3">
                <div>
                  <p className="text-sm font-semibold text-slate-800">{booking.amenity_name}</p>
                  <p className="text-[11px] text-slate-500">
                    {formatDay(booking.booking_date)} · {shortTime(booking.starts_at)} to {shortTime(booking.ends_at)}
                    {booking.charge > 0 && ` · ${formatRupees(booking.charge)}`}
                    {booking.status === 'PENDING' && ' · waiting for the building to confirm'}
                  </p>
                </div>
                <button onClick={() => cancel(booking)} className="p-1.5 text-slate-300 hover:text-rose-600">
                  <X className="w-4 h-4" />
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>

      <p className="text-[11px] text-slate-400 flex items-start gap-1.5">
        <AlertCircle className="w-3.5 h-3.5 shrink-0 mt-px" />
        A slot belongs to whoever books it first. Cancelling frees it for a neighbour.
      </p>
    </div>
  );
}
