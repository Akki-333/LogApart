import { useState, useContext, useEffect, useId } from 'react';
import { useNavigate } from 'react-router-dom';
import { AuthContext } from '../context/AuthContext';
import { homePathFor } from '../lib/roles';
import { Building2, Mail, Lock, ArrowRight } from 'lucide-react';

export default function Login() {
  const fieldId = useId();
  const { login, token, user, loading } = useContext(AuthContext);
  const navigate = useNavigate();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState(() => {
    // Set by the API client when it ended a dead session, so the screen can say
    // whether the password changed, the account closed, or the day simply ran out.
    try {
      const reason = sessionStorage.getItem('logapart:signed-out-reason');
      if (reason) sessionStorage.removeItem('logapart:signed-out-reason');
      return reason || '';
    } catch {
      return '';
    }
  });
  const [isLoading, setIsLoading] = useState(false);

  // Someone arriving with a live session should not sit on the login screen.
  useEffect(() => {
    if (loading || !token || !user) return;
    navigate(user.must_change_password ? '/change-password' : homePathFor(user.role), { replace: true });
  }, [loading, token, user, navigate]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setIsLoading(true);
    
    const result = await login(email, password);
    
    if (result.success) {
      const destination = result.user.must_change_password
        ? '/change-password'
        : homePathFor(result.user.role);
      navigate(destination, { replace: true });
    } else {
      setError(result.message);
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col justify-center py-12 sm:px-6 lg:px-8">
      <div className="sm:mx-auto sm:w-full sm:max-w-md">
        <div className="flex justify-center text-teal-600 mb-4">
          <Building2 size={48} strokeWidth={1.5} />
        </div>
        <h2 className="mt-2 text-center text-3xl font-extrabold text-slate-900">
          LogApart
        </h2>
        <p className="mt-2 text-center text-sm text-slate-600">
          Sign in to access your community dashboard
        </p>
      </div>

      <div className="mt-8 sm:mx-auto sm:w-full sm:max-w-md">
        <div className="bg-white py-8 px-4 shadow-xl sm:rounded-xl sm:px-10 border border-slate-100">
          <form className="space-y-6" onSubmit={handleSubmit}>
            {error && (
              <div className="bg-rose-50 border-l-4 border-rose-500 p-4 rounded-r-md">
                <p className="text-sm text-rose-700">{error}</p>
              </div>
            )}
            
            <div>
              <label className="block text-sm font-medium text-slate-700" htmlFor={`${fieldId}-email-address`}>
                Email address
              </label>
              <div className="mt-1 relative rounded-md shadow-sm">
                <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                  <Mail className="h-5 w-5 text-slate-400" />
                </div>
                <input
                  type="email"
                  id={`${fieldId}-email-address`}
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="focus:ring-teal-500 focus:border-teal-500 block w-full pl-10 sm:text-sm border-slate-300 rounded-md py-2 px-3 border outline-none"
                  placeholder="admin@apartadmin.com"
                />
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-700" htmlFor={`${fieldId}-password`}>
                Password
              </label>
              <div className="mt-1 relative rounded-md shadow-sm">
                <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                  <Lock className="h-5 w-5 text-slate-400" />
                </div>
                <input
                  type="password"
                  id={`${fieldId}-password`}
                  required
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="focus:ring-teal-500 focus:border-teal-500 block w-full pl-10 sm:text-sm border-slate-300 rounded-md py-2 px-3 border outline-none"
                  placeholder="••••••••"
                />
              </div>
            </div>

            <div className="flex items-center justify-between">
              <div className="flex items-center">
                <input
                  id="remember-me"
                  name="remember-me"
                  type="checkbox"
                  className="h-4 w-4 text-teal-600 focus:ring-teal-500 border-slate-300 rounded"
                />
                <label htmlFor="remember-me" className="ml-2 block text-sm text-slate-900">
                  Remember me
                </label>
              </div>

              <div className="text-sm">
                <a href="#" className="font-medium text-teal-600 hover:text-teal-500">
                  Forgot password?
                </a>
              </div>
            </div>

            <div>
              <button
                type="submit"
                disabled={isLoading}
                className="w-full flex justify-center py-2.5 px-4 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-teal-600 hover:bg-teal-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-teal-500 transition-colors disabled:opacity-70 disabled:cursor-not-allowed group"
              >
                {isLoading ? 'Signing in...' : 'Sign in'}
                {!isLoading && <ArrowRight className="ml-2 h-4 w-4 group-hover:translate-x-1 transition-transform" />}
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
}
