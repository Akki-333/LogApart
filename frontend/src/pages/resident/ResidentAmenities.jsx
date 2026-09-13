import { useState, useEffect, useCallback, useId } from 'react';
import api from '../../lib/api';
import { formatRupees, formatDay } from '../../lib/money';
import { CalendarDays, ChevronLeft, ChevronRight, X, AlertCircle } from 'lucide-react';
import { useFeedback } from '../../components/common/Feedback';
import { SkeletonList } from '../../components/common/Skeleton';

const DAY_MS = 24 * 60 * 60 * 1000;

// The resident's own calendar day, not UTC's, so an early-morning visit in
// India does not open on yesterday.
const localToday = () => new Date(Date.now() - new Date().getTimezoneOffset() * 60000).toISOString().slice(0, 10);
const addDays = (day, count) => new Date(Date.parse(`${day}T00:00:00Z`) + count * DAY_MS).toISOString().slice(0, 10);
const shortTime = (value) => String(value).slice(0, 5);
const dayHeading = (day) =>
  new Date(`${day}T00:00:00Z`).toLocaleDateString('en-IN', { weekday: 'short', day: 'numeric', month: 'short', timeZone: 'UTC' });

/**
 * Booking the terrace or the clubhouse, a week at a time. Somebody planning a
 * birthday looks for the free evening, not through one day's list after
 * another, so the whole week comes back in a single request. Slots come from
 * the server, so a change to the opening hours reaches this screen without a
 * release.
 */
export default function ResidentAmenities() {
  const { toast, confirm } = useFeedback();
  const amenityField = useId();
  const [amenities, setAmenities] = useState([]);
  const [selected, setSelected] = useState(null);
  const [weekStart, setWeekStart] = useState(localToday());
  const [week, setWeek] = useState(null);
  const [bookings, setBookings] = useState([]);
  const [loading, setLoading] = useState(true);
  const [banner, setBanner] = useState('');
  const [booking, setBooking] = useState(null);

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

  const loadWeek = useCallback(async () => {
    if (!selected) return;
    try {
      const response = await api.get(`/api/amenities/${selected}/availability?date=${weekStart}&days=7`);
      setWeek(response.data.data);
    } catch (error) {
      console.error('Failed to load that week', error);
    }
  }, [selected, weekStart]);

  useEffect(() => { loadWeek(); }, [loadWeek]);

  const book = async (day, slot) => {
    const key = `${day}|${slot.starts_at}`;
    setBooking(key);
    try {
      const response = await api.post('/api/amenities/bookings', {
        amenity_id: selected,
        booking_date: day,
        starts_at: slot.starts_at
      });
      setBanner(response.data.message);
      loadBookings();
      loadWeek();
    } catch (error) {
      toast.error(error.response?.data?.message || 'Could not book that slot');
    } finally {
      setBooking(null);
    }
  };

  const cancel = async (entry) => {
    const go = await confirm({
      title: `Give up ${entry.amenity_name}?`,
      message: `Your slot on ${formatDay(entry.booking_date)} goes back to the building.`,
      confirmLabel: 'Give it up'
    });
    if (!go) return;

    try {
      await api.delete(`/api/amenities/bookings/${entry.id}`);
      setBanner('Booking cancelled. The slot is free again.');
      loadBookings();
      loadWeek();
    } catch (error) {
      toast.error(error.response?.data?.message || 'Could not cancel that booking');
    }
  };

  if (loading) {
    return <div className="bg-white rounded-2xl border border-slate-200 p-5"><SkeletonList rows={5} label="Loading spaces" /></div>;
  }

  if (amenities.length === 0) {
    return (
      <div className="bg-white rounded-2xl border border-slate-200 p-12 text-center">
        <CalendarDays className="w-8 h-8 mx-auto mb-3 text-slate-300" />
        <p className="text-sm font-semibold text-slate-500">The building has nothing to book yet.</p>
      </div>
    );
  }

  const live = bookings.filter((entry) => entry.status !== 'CANCELLED');
  const amenityName = amenities.find((amenity) => amenity.id === selected)?.name || 'this space';
  const today = localToday();
  const lastDay = addDays(weekStart, 6);
  const hourNow = new Date().getHours();

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-black text-slate-900">Book a space</h1>
        <p className="text-sm text-slate-500 mt-0.5">Pick a free slot in the week. One booking per slot, first come first served</p>
      </div>

      {banner && (
        <div role="status" className="bg-emerald-50 border border-emerald-200 rounded-xl px-4 py-3 text-sm font-semibold text-emerald-900">
          {banner}
        </div>
      )}

      <div className="flex flex-wrap items-end gap-3">
        <div>
          <label htmlFor={amenityField} className="block text-[10px] font-bold uppercase tracking-wider text-slate-500 mb-1">Space</label>
          <select
            id={amenityField}
            value={selected ?? ''}
            onChange={(event) => setSelected(Number(event.target.value))}
            className="px-3 py-2 border border-slate-200 rounded-xl text-sm bg-white"
          >
            {amenities.map((amenity) => (
              <option key={amenity.id} value={amenity.id}>{amenity.name}</option>
            ))}
          </select>
        </div>

        <div className="flex items-center gap-1.5">
          <button
            type="button"
            onClick={() => setWeekStart(addDays(weekStart, -7) < today ? today : addDays(weekStart, -7))}
            disabled={weekStart <= today}
            aria-label="Previous week"
            className="p-2 border border-slate-200 rounded-xl bg-white text-slate-600 hover:bg-slate-50 disabled:opacity-40 disabled:cursor-not-allowed"
          >
            <ChevronLeft className="w-4 h-4" aria-hidden="true" />
          </button>
          <span className="text-sm font-semibold text-slate-700 px-1" aria-live="polite">
            {formatDay(weekStart)} to {formatDay(lastDay)}
          </span>
          <button
            type="button"
            onClick={() => setWeekStart(addDays(weekStart, 7))}
            aria-label="Next week"
            className="p-2 border border-slate-200 rounded-xl bg-white text-slate-600 hover:bg-slate-50"
          >
            <ChevronRight className="w-4 h-4" aria-hidden="true" />
          </button>
        </div>

        {week?.amenity?.charge > 0 && (
          <span className="text-xs text-slate-500">
            {formatRupees(week.amenity.charge)} per booking, added to your next bill
          </span>
        )}
      </div>

      <div className="bg-white rounded-2xl border border-slate-200 overflow-x-auto">
        {!week ? (
          <div className="p-5"><SkeletonList rows={4} label="Loading the week" /></div>
        ) : (
          <table className="w-full text-xs min-w-[640px]">
            <caption className="sr-only">
              Slots for {amenityName}, {formatDay(weekStart)} to {formatDay(lastDay)}
            </caption>
            <thead className="bg-slate-50 border-b border-slate-200">
              <tr>
                <th scope="col" className="p-2.5 text-left font-bold text-slate-500">Time</th>
                {week.days.map((day) => (
                  <th key={day.date} scope="col" className={`p-2.5 text-center font-bold ${day.date === today ? 'text-teal-700' : 'text-slate-700'}`}>
                    {dayHeading(day.date)}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {week.slots.map((slot, index) => (
                <tr key={slot.starts_at}>
                  <th scope="row" className="p-2.5 text-left font-semibold text-slate-700 whitespace-nowrap">
                    {shortTime(slot.starts_at)} to {shortTime(slot.ends_at)}
                  </th>
                  {week.days.map((day) => {
                    const cell = day.slots[index];
                    const key = `${day.date}|${cell.starts_at}`;
                    const past = day.date === today && Number(shortTime(cell.ends_at).slice(0, 2)) <= hourNow;

                    return (
                      <td key={day.date} className="p-1">
                        {cell.status !== 'FREE' ? (
                          <span className="block rounded-lg bg-slate-100 text-slate-500 text-center py-2 px-1 truncate" title={cell.taken_by}>
                            {cell.taken_by}
                          </span>
                        ) : past ? (
                          <span className="block rounded-lg text-slate-300 text-center py-2">Past</span>
                        ) : (
                          <button
                            type="button"
                            onClick={() => book(day.date, cell)}
                            disabled={booking === key}
                            aria-label={`Book ${amenityName} on ${formatDay(day.date)}, ${shortTime(cell.starts_at)} to ${shortTime(cell.ends_at)}`}
                            className="w-full rounded-lg border border-teal-200 bg-teal-50 hover:bg-teal-100 text-teal-800 font-bold py-2 disabled:opacity-50"
                          >
                            {booking === key ? 'Booking' : 'Free'}
                          </button>
                        )}
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden">
        <div className="px-5 py-3.5 border-b border-slate-100">
          <h2 className="text-sm font-bold text-slate-800">Your home's bookings</h2>
        </div>

        {live.length === 0 ? (
          <p className="px-5 py-8 text-center text-sm text-slate-400">Nothing booked yet.</p>
        ) : (
          <ul className="divide-y divide-slate-100">
            {live.map((entry) => (
              <li key={entry.id} className="px-5 py-3 flex items-center justify-between gap-3">
                <div>
                  <p className="text-sm font-semibold text-slate-800">{entry.amenity_name}</p>
                  <p className="text-[11px] text-slate-500">
                    {formatDay(entry.booking_date)} · {shortTime(entry.starts_at)} to {shortTime(entry.ends_at)}
                    {entry.charge > 0 && ` · ${formatRupees(entry.charge)}`}
                    {entry.status === 'PENDING' && ' · waiting for the building to confirm'}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => cancel(entry)}
                  aria-label={`Cancel ${entry.amenity_name} on ${formatDay(entry.booking_date)}`}
                  className="p-1.5 text-slate-300 hover:text-rose-600"
                >
                  <X className="w-4 h-4" aria-hidden="true" />
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>

      <p className="text-[11px] text-slate-400 flex items-start gap-1.5">
        <AlertCircle className="w-3.5 h-3.5 shrink-0 mt-px" aria-hidden="true" />
        A slot belongs to whoever books it first. Cancelling frees it for a neighbour.
      </p>
    </div>
  );
}
