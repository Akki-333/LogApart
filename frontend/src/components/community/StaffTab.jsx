import { useState, useEffect, useCallback, useId } from 'react';
import api from '../../lib/api';
import { formatRupees, formatPeriod, currentPeriod } from '../../lib/money';
import { HardHat, Plus, X, Check, Minus, Sun, Ban } from 'lucide-react';
import { useFeedback } from '../common/Feedback';
import useDialog from '../common/useDialog';

const MARKS = [
  { value: 'PRESENT', label: 'Present', icon: Check, tone: 'bg-emerald-600 text-white border-emerald-600' },
  { value: 'HALF_DAY', label: 'Half day', icon: Minus, tone: 'bg-amber-500 text-white border-amber-500' },
  { value: 'LEAVE', label: 'Leave', icon: Sun, tone: 'bg-blue-500 text-white border-blue-500' },
  { value: 'ABSENT', label: 'Absent', icon: Ban, tone: 'bg-rose-600 text-white border-rose-600' }
];

const markFor = (status) => MARKS.find((m) => m.value === status);
const today = () => new Date().toISOString().slice(0, 10);

export default function StaffTab({ onAction }) {
  const { dialogRef, dialogProps, titleId } = useDialog(isOpen, () => setIsOpen(false));
  const fieldId = useId();
  const { toast } = useFeedback();
  const [period, setPeriod] = useState(currentPeriod());
  const [staff, setStaff] = useState([]);
  const [markDate, setMarkDate] = useState(today());
  const [grid, setGrid] = useState({});
  const [loading, setLoading] = useState(true);
  const [isOpen, setIsOpen] = useState(false);
  const [form, setForm] = useState({ name: '', phone: '', role_title: '', monthly_salary: '', joined_on: '' });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const load = useCallback(() => {
    setLoading(true);
    Promise.all([api.get(`/api/staff?period=${period}`), api.get(`/api/staff/attendance?period=${period}`)])
      .then(([s, a]) => {
        setStaff(s.data.data);
        setGrid(a.data.data.by_staff || {});
      })
      .catch((err) => console.error('Failed to load staff', err))
      .finally(() => setLoading(false));
  }, [period]);

  useEffect(() => { load(); }, [load]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setSaving(true);

    try {
      const res = await api.post('/api/staff', { ...form, monthly_salary: Number(form.monthly_salary || 0) });
      onAction(res.data.message);
      setIsOpen(false);
      setForm({ name: '', phone: '', role_title: '', monthly_salary: '', joined_on: '' });
      load();
    } catch (err) {
      setError(err.response?.data?.message || 'Could not add this person.');
    } finally {
      setSaving(false);
    }
  };

  const mark = async (member, status) => {
    try {
      await api.post('/api/staff/attendance', {
        staff_id: member.id,
        attendance_date: markDate,
        status
      });
      load();
    } catch (err) {
      toast.error(err.response?.data?.message || 'Could not record that.');
    }
  };

  const payrollTotal = staff
    .filter((member) => member.is_active)
    .reduce((sum, member) => sum + member.payable, 0);

  const field =
    'mt-1 w-full px-3 py-2 bg-white border border-slate-300 rounded-lg text-sm outline-none focus:border-teal-500 focus:ring-1 focus:ring-teal-500 transition-colors';
  const label = 'block text-xs font-bold uppercase tracking-wider text-slate-500';

  return (
    <div className="space-y-4">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <p className="text-xs text-slate-500 max-w-lg">
          Guards, cleaners and the maintenance crew. Attendance drives the indicative
          monthly pay below, which you still sign off yourself.
        </p>
        <div className="flex items-center gap-2.5">
          <input
            type="month" value={period} onChange={(e) => setPeriod(e.target.value)}
            className="px-3 py-2 bg-white border border-slate-200 rounded-xl text-sm font-semibold text-slate-700 outline-none focus:border-teal-500"
          />
          <button
            onClick={() => setIsOpen(true)}
            className="flex items-center px-4 py-2.5 bg-teal-600 hover:bg-teal-700 text-white text-sm font-bold rounded-xl transition-colors shadow-sm"
          >
            <Plus className="w-4 h-4 mr-2" />
            Add staff
          </button>
        </div>
      </div>

      {staff.length > 0 && (
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-white rounded-2xl border border-slate-200 shadow-xs p-4">
          <div className="flex items-center gap-2.5">
            <span className="text-xs font-bold uppercase tracking-wider text-slate-500">Marking</span>
            <input
              type="date" value={markDate} max={today()} onChange={(e) => setMarkDate(e.target.value)}
              className="px-3 py-1.5 bg-slate-50 border border-slate-200 rounded-lg text-xs font-bold text-slate-700 outline-none focus:border-teal-500"
            />
          </div>
          <div className="text-right">
            <span className="text-xs font-bold uppercase tracking-wider text-slate-400">Payable for {formatPeriod(period)}</span>
            <div className="text-lg font-black text-slate-900">{formatRupees(payrollTotal)}</div>
          </div>
        </div>
      )}

      {loading ? (
        <div className="flex justify-center py-16">
          <div className="animate-spin rounded-full h-7 w-7 border-b-2 border-teal-600"></div>
        </div>
      ) : staff.length === 0 ? (
        <div className="bg-white rounded-2xl border border-slate-200 p-12 text-center">
          <HardHat className="w-8 h-8 mx-auto mb-3 text-slate-300" />
          <p className="text-sm font-semibold text-slate-500">Nobody on the roster yet.</p>
          <p className="text-xs text-slate-400 mt-1">Add the guards and cleaners to start tracking attendance.</p>
        </div>
      ) : (
        <div className="bg-white rounded-2xl border border-slate-200 shadow-xs overflow-x-auto">
          <table className="w-full text-sm min-w-[860px]">
            <thead className="bg-slate-50 border-b border-slate-200">
              <tr className="text-left text-[10px] uppercase tracking-wider text-slate-500">
                <th className="px-5 py-3 font-bold">Name</th>
                <th className="px-5 py-3 font-bold">Role</th>
                <th className="px-5 py-3 font-bold">This month</th>
                <th className="px-5 py-3 font-bold text-right">Salary</th>
                <th className="px-5 py-3 font-bold text-right">Payable</th>
                <th className="px-5 py-3 font-bold text-center">Mark for the chosen day</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {staff.map((member) => {
                const marked = grid[member.id]?.[markDate];
                const current = marked ? markFor(marked.status) : null;

                return (
                  <tr key={member.id} className={`hover:bg-slate-50 transition-colors ${member.is_active ? '' : 'opacity-50'}`}>
                    <td className="px-5 py-3">
                      <div className="font-bold text-slate-800">{member.name}</div>
                      <div className="text-[11px] text-slate-400">{member.phone || 'No phone'}</div>
                    </td>
                    <td className="px-5 py-3 text-xs font-semibold text-slate-600">{member.role_title}</td>
                    <td className="px-5 py-3">
                      <div className="text-xs font-bold text-slate-800">
                        {member.credited_days} of {member.days_in_month} days
                      </div>
                      <div className="text-[11px] text-slate-400">
                        {member.present_days} present · {member.half_days} half · {member.leave_days} leave · {member.absent_days} absent
                      </div>
                    </td>
                    <td className="px-5 py-3 text-right text-xs text-slate-600">{formatRupees(member.monthly_salary)}</td>
                    <td className="px-5 py-3 text-right text-xs font-black text-slate-900">{formatRupees(member.payable)}</td>
                    <td className="px-5 py-3">
                      <div className="flex items-center justify-center gap-1">
                        {MARKS.map((option) => {
                          const isSet = current?.value === option.value;
                          return (
                            <button
                              key={option.value}
                              onClick={() => mark(member, option.value)}
                              disabled={!member.is_active}
                              title={option.label}
                              className={`p-1.5 rounded-lg border transition-colors disabled:opacity-40 ${
                                isSet ? option.tone : 'bg-white text-slate-400 border-slate-200 hover:border-slate-400'
                              }`}
                            >
                              <option.icon className="w-3.5 h-3.5" />
                            </button>
                          );
                        })}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {isOpen && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div ref={dialogRef} {...dialogProps} className="bg-white rounded-2xl shadow-2xl w-full max-w-md border border-slate-200 overflow-hidden">
            <div className="flex justify-between items-center px-6 py-5 border-b border-slate-100 bg-slate-50">
              <div className="flex items-center gap-3">
                <div className="p-2 bg-teal-100 text-teal-800 rounded-xl">
                  <HardHat className="w-5 h-5" />
                </div>
                <h2 id={titleId} className="text-lg font-bold text-slate-800">Add to the roster</h2>
              </div>
              <button onClick={() => setIsOpen(false)} className="p-1.5 text-slate-400 hover:text-slate-600 hover:bg-slate-200 rounded-full transition-colors">
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSubmit} className="p-6 space-y-4">
              {error && (
                <div className="bg-rose-50 border-l-4 border-rose-500 p-3 rounded-r-md">
                  <p className="text-sm text-rose-700">{error}</p>
                </div>
              )}

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className={label} htmlFor={`${fieldId}-name`}>Name</label>
                  <input id={`${fieldId}-name`} type="text" required maxLength={255} value={form.name}
                    onChange={(e) => setForm({ ...form, name: e.target.value })} className={field} />
                </div>
                <div>
                  <label className={label} htmlFor={`${fieldId}-role`}>Role</label>
                  <input id={`${fieldId}-role`} type="text" required maxLength={100} placeholder="Cleaner" value={form.role_title}
                    onChange={(e) => setForm({ ...form, role_title: e.target.value })} className={field} />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className={label} htmlFor={`${fieldId}-phone`}>Phone</label>
                  <input id={`${fieldId}-phone`} type="tel" maxLength={20} value={form.phone}
                    onChange={(e) => setForm({ ...form, phone: e.target.value })} className={field} />
                </div>
                <div>
                  <label className={label} htmlFor={`${fieldId}-started-on`}>Started on</label>
                  <input id={`${fieldId}-started-on`} type="date" value={form.joined_on}
                    onChange={(e) => setForm({ ...form, joined_on: e.target.value })} className={field} />
                </div>
              </div>

              <div>
                <label className={label} htmlFor={`${fieldId}-monthly-salary`}>Monthly salary</label>
                <input id={`${fieldId}-monthly-salary`} type="number" min="0" step="0.01" placeholder="0.00" value={form.monthly_salary}
                  onChange={(e) => setForm({ ...form, monthly_salary: e.target.value })} className={field} />
                <p className="mt-1 text-[11px] text-slate-500">
                  Pay is prorated across the days of the month. A half day counts half, leave counts full.
                </p>
              </div>

              <div className="flex justify-end gap-3 pt-2">
                <button type="button" onClick={() => setIsOpen(false)} className="px-4 py-2.5 text-sm font-bold text-slate-600 hover:text-slate-800 transition-colors">
                  Cancel
                </button>
                <button type="submit" disabled={saving}
                  className="px-5 py-2.5 bg-teal-600 hover:bg-teal-700 disabled:bg-slate-300 text-white text-sm font-bold rounded-xl transition-colors">
                  {saving ? 'Adding...' : 'Add to roster'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
