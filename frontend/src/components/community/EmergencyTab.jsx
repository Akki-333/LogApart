import { useState, useEffect, useCallback, useId } from 'react';
import api from '../../lib/api';
import { Phone, Plus, Trash2, LifeBuoy } from 'lucide-react';
import { useFeedback } from '../common/Feedback';
import { SkeletonList } from '../common/Skeleton';

const EMPTY = { label: '', phone: '', note: '' };

/**
 * The numbers on every resident's Help screen. Residents could read the list
 * from the start, but it could only be changed through the API, so it was
 * whatever the seed put there. The building's own numbers go first, because at
 * two in the morning the guard at the gate is closer than the fire brigade.
 */
export default function EmergencyTab({ onAction }) {
  const fieldId = useId();
  const { toast, confirm } = useFeedback();
  const [contacts, setContacts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [form, setForm] = useState(EMPTY);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    try {
      const response = await api.get('/api/emergency/contacts');
      setContacts(response.data.data);
    } catch (err) {
      console.error('Failed to load emergency contacts', err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const add = async (event) => {
    event.preventDefault();
    setSaving(true);
    setError('');

    try {
      const response = await api.post('/api/emergency/contacts', {
        label: form.label.trim(),
        phone: form.phone.trim(),
        note: form.note.trim() || undefined,
        position: contacts.length
      });
      onAction(response.data.message);
      setForm(EMPTY);
      load();
    } catch (err) {
      setError(err.response?.data?.message || 'Could not add that number.');
    } finally {
      setSaving(false);
    }
  };

  const remove = async (contact) => {
    const go = await confirm({
      title: `Remove ${contact.label}?`,
      message: 'Residents stop seeing this number on their Help screen.',
      confirmLabel: 'Remove it',
      tone: 'danger'
    });
    if (!go) return;

    try {
      const response = await api.delete(`/api/emergency/contacts/${contact.id}`);
      onAction(response.data.message);
      load();
    } catch (err) {
      toast.error(err.response?.data?.message || 'Could not remove that number.');
    }
  };

  const field = 'mt-1 w-full px-3 py-2 bg-white border border-slate-300 rounded-lg text-sm outline-none focus:border-teal-500 focus:ring-1 focus:ring-teal-500';
  const label = 'block text-xs font-bold uppercase tracking-wider text-slate-500';

  return (
    <div className="space-y-4">
      <p className="text-xs text-slate-500">
        Shown on every resident's Help screen, in this order. Put the building's own numbers first.
      </p>

      <form onSubmit={add} className="bg-white rounded-2xl border border-slate-200 p-5 grid gap-3 sm:grid-cols-[1fr_1fr_1.4fr_auto] sm:items-end">
        <div>
          <label htmlFor={`${fieldId}-label`} className={label}>Who</label>
          <input
            id={`${fieldId}-label`}
            required
            maxLength={100}
            placeholder="Security desk"
            value={form.label}
            onChange={(event) => setForm({ ...form, label: event.target.value })}
            className={field}
          />
        </div>
        <div>
          <label htmlFor={`${fieldId}-phone`} className={label}>Number</label>
          <input
            id={`${fieldId}-phone`}
            required
            type="tel"
            minLength={3}
            maxLength={20}
            placeholder="112"
            value={form.phone}
            onChange={(event) => setForm({ ...form, phone: event.target.value })}
            className={field}
          />
        </div>
        <div>
          <label htmlFor={`${fieldId}-note`} className={label}>Note</label>
          <input
            id={`${fieldId}-note`}
            maxLength={255}
            placeholder="Staffed round the clock"
            value={form.note}
            onChange={(event) => setForm({ ...form, note: event.target.value })}
            className={field}
          />
        </div>
        <button
          type="submit"
          disabled={saving}
          className="flex items-center justify-center px-4 py-2 bg-teal-600 hover:bg-teal-700 text-white text-sm font-bold rounded-xl disabled:opacity-60"
        >
          <Plus className="w-4 h-4 mr-1.5" aria-hidden="true" />
          {saving ? 'Adding' : 'Add'}
        </button>
        {error && <p role="alert" className="sm:col-span-4 text-xs font-semibold text-rose-700">{error}</p>}
      </form>

      <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden">
        {loading ? (
          <div className="p-5"><SkeletonList rows={4} label="Loading emergency numbers" /></div>
        ) : contacts.length === 0 ? (
          <div className="p-12 text-center">
            <LifeBuoy className="w-8 h-8 mx-auto mb-3 text-slate-300" aria-hidden="true" />
            <p className="text-sm font-semibold text-slate-500">No numbers yet.</p>
            <p className="text-xs text-slate-400 mt-1">Residents see an empty Help screen until one is added.</p>
          </div>
        ) : (
          <ol className="divide-y divide-slate-100">
            {contacts.map((contact) => (
              <li key={contact.id} className="px-5 py-3 flex items-center gap-3">
                <span className="p-2 bg-rose-50 text-rose-700 rounded-xl shrink-0">
                  <Phone className="w-4 h-4" aria-hidden="true" />
                </span>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-bold text-slate-800">{contact.label}</p>
                  {contact.note && <p className="text-xs text-slate-500 truncate">{contact.note}</p>}
                </div>
                <a href={`tel:${contact.phone}`} className="font-mono text-sm font-bold text-teal-800 hover:underline">{contact.phone}</a>
                <button
                  type="button"
                  onClick={() => remove(contact)}
                  aria-label={`Remove ${contact.label}`}
                  className="p-1.5 text-slate-300 hover:text-rose-600 hover:bg-rose-50 rounded-lg"
                >
                  <Trash2 className="w-4 h-4" aria-hidden="true" />
                </button>
              </li>
            ))}
          </ol>
        )}
      </div>
    </div>
  );
}
