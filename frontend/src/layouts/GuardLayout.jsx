import { useContext } from 'react';
import { Outlet, useNavigate } from 'react-router-dom';
import { AuthContext } from '../context/AuthContext';
import { ShieldAlert, LogOut, User } from 'lucide-react';

import NotificationDropdown from '../components/common/NotificationDropdown';

export default function GuardLayout() {
  const { user, logout } = useContext(AuthContext);
  const navigate = useNavigate();

  const handleLogout = () => {
    logout();
    navigate('/');
  };

  return (
    <div className="flex flex-col h-screen bg-slate-900 text-slate-200">
      {/* Top Header */}
      <header className="h-20 bg-slate-950 border-b border-slate-800 flex items-center justify-between px-8 shadow-md">
        <div className="flex items-center">
          <ShieldAlert className="h-9 w-9 text-teal-400 mr-3.5" />
          <div>
            <h1 className="text-xl font-bold text-white tracking-wide">Main Gate Security</h1>
            <p className="text-xs text-slate-400 font-medium">LogApart Community Desk</p>
          </div>
        </div>
        
        <div className="flex items-center gap-5">
          <NotificationDropdown />

          <div className="hidden sm:flex items-center text-right border-l border-slate-800 pl-5">
            <div>
              <p className="text-sm font-bold text-white">{user?.name || 'Security'}</p>
              <p className="text-xs text-teal-400 font-semibold">On Duty</p>
            </div>
            <div className="ml-3.5 p-2 bg-slate-800 rounded-xl">
              <User className="h-5 w-5 text-slate-300" />
            </div>
          </div>
          
          <button 
            onClick={handleLogout}
            className="flex items-center px-4 py-2.5 bg-rose-600 hover:bg-rose-700 text-white font-bold rounded-xl text-xs transition-colors shadow-md"
          >
            <LogOut className="h-4 w-4 mr-1.5" />
            Sign Out
          </button>
        </div>
      </header>

      {/* Main Content Area */}
      <main className="flex-1 overflow-auto p-4 sm:p-8">
        <Outlet />
      </main>
    </div>
  );
}
