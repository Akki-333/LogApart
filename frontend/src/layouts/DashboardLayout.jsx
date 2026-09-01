import { useContext } from 'react';
import { Outlet, NavLink, useNavigate } from 'react-router-dom';
import { AuthContext } from '../context/AuthContext';
import { 
  Building2, 
  LayoutDashboard, 
  Users, 
  Wrench, 
  ShieldCheck, 
  LogOut,
  Menu
} from 'lucide-react';
import NotificationDropdown from '../components/common/NotificationDropdown';

export default function DashboardLayout() {
  const { user, logout } = useContext(AuthContext);
  const navigate = useNavigate();

  const handleLogout = () => {
    logout();
    navigate('/');
  };

  const navItems = [
    { name: 'Dashboard', icon: LayoutDashboard, path: '/admin/dashboard' },
    { name: 'Residents', icon: Users, path: '/admin/residents' },
    { name: 'Maintenance', icon: Wrench, path: '/admin/maintenance' },
    { name: 'Security', icon: ShieldCheck, path: '/admin/security' },
  ];

  return (
    <div className="flex h-screen bg-slate-50">
      {/* Sidebar */}
      <aside className="w-64 bg-slate-900 text-slate-300 flex flex-col shadow-xl">
        <div className="h-16 flex items-center px-6 bg-slate-950 border-b border-slate-800">
          <Building2 className="h-6 w-6 text-teal-500 mr-3" />
          <span className="text-lg font-bold text-white tracking-wide">LogApart</span>
        </div>
        
        <div className="px-6 py-4">
          <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-4">
            Main Menu
          </p>
          <nav className="space-y-1">
            {navItems.map((item) => (
              <NavLink
                key={item.name}
                to={item.path}
                end={item.path === '/admin/dashboard'}
                className={({ isActive }) =>
                  `flex items-center px-3 py-2.5 rounded-lg transition-colors group ${
                    isActive
                      ? 'bg-teal-600 text-white font-medium'
                      : 'hover:bg-slate-800 hover:text-white'
                  }`
                }
              >
                <item.icon className="h-5 w-5 mr-3 opacity-80" />
                {item.name}
              </NavLink>
            ))}
          </nav>
        </div>

        <div className="mt-auto p-4 border-t border-slate-800">
          <div className="flex items-center px-3 py-3 rounded-lg bg-slate-800 mb-2">
            <div className="w-8 h-8 rounded-full bg-teal-500 flex items-center justify-center text-white font-bold mr-3">
              {user?.name?.charAt(0) || 'A'}
            </div>
            <div>
              <p className="text-sm font-medium text-white">{user?.name || 'Building Admin'}</p>
              <p className="text-xs text-slate-400 font-medium">{user?.role === 'SUPER_ADMIN' ? 'Admin' : (user?.role?.replace('_', ' ') || 'Admin')}</p>
            </div>
          </div>
          <button 
            onClick={handleLogout}
            className="flex w-full items-center px-3 py-2 text-sm text-slate-400 hover:text-rose-400 transition-colors"
          >
            <LogOut className="h-4 w-4 mr-2" />
            Sign Out
          </button>
        </div>
      </aside>

      {/* Main Content Area */}
      <main className="flex-1 flex flex-col overflow-hidden">
        {/* Topbar */}
        <header className="h-16 bg-white border-b border-slate-200 flex items-center justify-between px-6 z-10">
          <div className="flex items-center">
            <button className="text-slate-500 hover:text-slate-700 lg:hidden mr-4">
              <Menu className="h-6 w-6" />
            </button>
            <h1 className="text-xl font-semibold text-slate-800">Overview</h1>
          </div>
          <div className="flex items-center space-x-4">
            <NotificationDropdown />
          </div>
        </header>

        {/* Page Content */}
        <div className="flex-1 overflow-auto p-6">
          <Outlet />
        </div>
      </main>
    </div>
  );
}
