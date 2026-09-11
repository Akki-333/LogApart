import { useContext } from 'react';
import { Outlet, NavLink, useNavigate } from 'react-router-dom';
import { AuthContext } from '../context/AuthContext';
import { Building2, Home, LogOut, KeyRound, Wallet, Wrench, ShieldCheck, Megaphone } from 'lucide-react';
import NotificationDropdown from '../components/common/NotificationDropdown';

export default function ResidentLayout() {
  const { user, logout } = useContext(AuthContext);
  const navigate = useNavigate();

  const handleLogout = () => {
    logout();
    navigate('/');
  };

  const navItems = [
    { name: 'Home', icon: Home, path: '/resident/home' },
    { name: 'My Dues', icon: Wallet, path: '/resident/dues' },
    { name: 'Issues', icon: Wrench, path: '/resident/issues' },
    { name: 'My Gate', icon: ShieldCheck, path: '/resident/gate' },
    { name: 'Notices', icon: Megaphone, path: '/resident/notices' }
  ];

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col">
      <header className="bg-white border-b border-slate-200 sticky top-0 z-20">
        <div className="max-w-5xl mx-auto px-4 sm:px-6 h-16 flex items-center justify-between">
          <div className="flex items-center">
            <Building2 className="h-6 w-6 text-teal-600 mr-2.5" />
            <div>
              <span className="text-base font-bold text-slate-900 tracking-tight">LogApart</span>
              <p className="text-[11px] text-slate-500 font-medium leading-none mt-0.5">Resident</p>
            </div>
          </div>

          <div className="flex items-center gap-2 sm:gap-3">
            <NotificationDropdown />

            <div className="hidden sm:block text-right border-l border-slate-200 pl-3">
              <p className="text-sm font-semibold text-slate-800 leading-tight">{user?.name}</p>
              <p className="text-[11px] text-slate-500">{user?.email}</p>
            </div>

            <button
              onClick={() => navigate('/change-password')}
              title="Change password"
              className="p-2.5 text-slate-500 hover:text-teal-700 hover:bg-teal-50 rounded-xl transition-colors"
            >
              <KeyRound className="h-4 w-4" />
            </button>

            <button
              onClick={handleLogout}
              title="Sign out"
              className="p-2.5 text-slate-500 hover:text-rose-600 hover:bg-rose-50 rounded-xl transition-colors"
            >
              <LogOut className="h-4 w-4" />
            </button>
          </div>
        </div>

        <nav className="max-w-5xl mx-auto px-4 sm:px-6 flex gap-1 border-t border-slate-100">
          {navItems.map((item) => (
            <NavLink
              key={item.name}
              to={item.path}
              className={({ isActive }) =>
                `flex items-center gap-1.5 px-3 py-2.5 text-sm font-semibold border-b-2 transition-colors ${
                  isActive
                    ? 'border-teal-600 text-teal-700'
                    : 'border-transparent text-slate-500 hover:text-slate-800'
                }`
              }
            >
              <item.icon className="h-4 w-4" />
              {item.name}
            </NavLink>
          ))}
        </nav>
      </header>

      <main className="flex-1 max-w-5xl w-full mx-auto px-4 sm:px-6 py-6">
        <Outlet />
      </main>
    </div>
  );
}
