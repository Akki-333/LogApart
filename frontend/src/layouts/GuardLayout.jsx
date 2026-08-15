import { useContext } from 'react';
import { Outlet, useNavigate } from 'react-router-dom';
import { AuthContext } from '../context/AuthContext';
import { ShieldAlert, LogOut, User } from 'lucide-react';

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
          <ShieldAlert className="h-10 w-10 text-teal-500 mr-4" />
          <div>
            <h1 className="text-2xl font-bold text-white tracking-widest uppercase">Security Portal</h1>
            <p className="text-sm text-slate-400 font-medium">LogApart Main Gate</p>
          </div>
        </div>
        
        <div className="flex items-center gap-6">
          <div className="hidden sm:flex items-center text-right">
            <div>
              <p className="text-lg font-bold text-white">{user?.name || 'Gate Guard'}</p>
              <p className="text-sm text-teal-400">On Duty</p>
            </div>
            <div className="ml-4 p-3 bg-slate-800 rounded-full">
              <User className="h-6 w-6 text-slate-300" />
            </div>
          </div>
          
          <button 
            onClick={handleLogout}
            className="flex items-center px-4 py-3 bg-rose-600 hover:bg-rose-700 text-white font-bold rounded-lg transition-colors shadow-lg"
          >
            <LogOut className="h-5 w-5 mr-2" />
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
