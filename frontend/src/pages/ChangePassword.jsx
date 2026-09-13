import { useState, useContext, useId } from 'react';
import { useNavigate } from 'react-router-dom';
import { AuthContext } from '../context/AuthContext';
import { homePathFor } from '../lib/roles';
import { Building2, Lock, ShieldCheck, ArrowRight } from 'lucide-react';

const MIN_LENGTH = 8;

export default function ChangePassword() {
  const fieldId = useId();
  const { user, changePassword, logout } = useContext(AuthContext);
  const navigate = useNavigate();

  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [error, setError] = useState('');
  const [isSaving, setIsSaving] = useState(false);

  const isForced = Boolean(user?.must_change_password);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');

    if (newPassword.length < MIN_LENGTH) {
      setError(`Your new password must be at least ${MIN_LENGTH} characters.`);
      return;
    }

    if (newPassword !== confirmPassword) {
      setError('The two new passwords do not match.');
      return;
    }

    setIsSaving(true);
    const result = await changePassword(currentPassword, newPassword);

    if (result.success) {
      navigate(homePathFor(result.user.role), { replace: true });
      return;
    }

    setError(result.message);
    setIsSaving(false);
  };

  const field = 'mt-1 block w-full px-3 py-2.5 border border-slate-300 rounded-lg text-sm outline-none focus:border-teal-500 focus:ring-1 focus:ring-teal-500 transition-colors';

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col justify-center py-12 px-4 sm:px-6">
      <div className="sm:mx-auto sm:w-full sm:max-w-md">
        <div className="flex justify-center text-teal-600 mb-4">
          <Building2 size={44} strokeWidth={1.5} />
        </div>
        <h2 className="text-center text-2xl font-extrabold text-slate-900">
          {isForced ? 'Set your password' : 'Change your password'}
        </h2>
        <p className="mt-2 text-center text-sm text-slate-600">
          {isForced
            ? 'Your account was created with a one-time password. Choose your own to continue.'
            : 'Pick a new password for your LogApart account.'}
        </p>
      </div>

      <div className="mt-8 sm:mx-auto sm:w-full sm:max-w-md">
        <div className="bg-white py-8 px-6 shadow-xl rounded-xl border border-slate-100 sm:px-10">
          {isForced && (
            <div className="mb-6 flex items-start gap-3 bg-teal-50 border border-teal-200 rounded-lg p-3.5">
              <ShieldCheck className="w-4 h-4 text-teal-700 shrink-0 mt-0.5" />
              <p className="text-xs text-teal-900 leading-relaxed">
                Until you do this, the rest of LogApart stays locked for your account.
              </p>
            </div>
          )}

          <form className="space-y-5" onSubmit={handleSubmit}>
            {error && (
              <div className="bg-rose-50 border-l-4 border-rose-500 p-3 rounded-r-md">
                <p className="text-sm text-rose-700">{error}</p>
              </div>
            )}

            <div>
              <label className="block text-sm font-medium text-slate-700" htmlFor={`${fieldId}-field-3`}>
                {isForced ? 'One-time password' : 'Current password'}
              </label>
              <div className="relative">
                <input id={`${fieldId}-field-3`}
                  type="password"
                  required
                  autoComplete="current-password"
                  value={currentPassword}
                  onChange={(e) => setCurrentPassword(e.target.value)}
                  className={field}
                />
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-700" htmlFor={`${fieldId}-new-password`}>New password</label>
              <input id={`${fieldId}-new-password`}
                type="password"
                required
                autoComplete="new-password"
                minLength={MIN_LENGTH}
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                className={field}
              />
              <p className="mt-1.5 text-xs text-slate-500">At least {MIN_LENGTH} characters.</p>
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-700" htmlFor={`${fieldId}-confirm-new-password`}>Confirm new password</label>
              <input id={`${fieldId}-confirm-new-password`}
                type="password"
                required
                autoComplete="new-password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                className={field}
              />
            </div>

            <button
              type="submit"
              disabled={isSaving}
              className="w-full flex justify-center items-center py-2.5 px-4 rounded-lg text-sm font-semibold text-white bg-teal-600 hover:bg-teal-700 disabled:bg-slate-400 transition-colors"
            >
              <Lock className="w-4 h-4 mr-2" />
              {isSaving ? 'Saving...' : 'Save password'}
              {!isSaving && <ArrowRight className="w-4 h-4 ml-2" />}
            </button>
          </form>

          <button
            onClick={logout}
            className="mt-5 w-full text-center text-xs font-semibold text-slate-500 hover:text-slate-700 transition-colors"
          >
            Sign out instead
          </button>
        </div>
      </div>
    </div>
  );
}
