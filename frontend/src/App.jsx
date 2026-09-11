import { useContext } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider, AuthContext } from './context/AuthContext';
import { homePathFor, ADMIN_ROLES } from './lib/roles';

import Login from './pages/Login';
import ChangePassword from './pages/ChangePassword';
import DashboardLayout from './layouts/DashboardLayout';
import GuardLayout from './layouts/GuardLayout';
import ResidentLayout from './layouts/ResidentLayout';
import DashboardHome from './pages/DashboardHome';
import Residents from './pages/Residents';
import Maintenance from './pages/Maintenance';
import Security from './pages/Security';
import ResidentHome from './pages/resident/ResidentHome';

const Spinner = ({ dark = false }) => (
  <div className={`h-screen flex items-center justify-center ${dark ? 'bg-slate-900' : 'bg-slate-50'}`}>
    <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-teal-600"></div>
  </div>
);

/**
 * Single gate for every protected route. Signed-out users go to the login
 * screen, users holding a one-time password go to the change-password screen,
 * and anyone whose role is not listed is sent to their own portal instead.
 */
const RoleRoute = ({ allow, dark = false, children }) => {
  const { token, user, loading, mustChangePassword } = useContext(AuthContext);

  if (loading) return <Spinner dark={dark} />;
  if (!token) return <Navigate to="/" replace />;
  if (!user) return <Spinner dark={dark} />;
  if (mustChangePassword) return <Navigate to="/change-password" replace />;
  if (!allow.includes(user.role)) return <Navigate to={homePathFor(user.role)} replace />;

  return children;
};

// Reachable by anyone signed in, whatever state their password is in.
const AuthedRoute = ({ children }) => {
  const { token, user, loading } = useContext(AuthContext);

  if (loading) return <Spinner />;
  if (!token) return <Navigate to="/" replace />;
  if (!user) return <Spinner />;

  return children;
};

function AppRoutes() {
  return (
    <Routes>
      <Route path="/" element={<Login />} />

      <Route
        path="/change-password"
        element={<AuthedRoute><ChangePassword /></AuthedRoute>}
      />

      {/* Admin Portal */}
      <Route
        path="/admin"
        element={<RoleRoute allow={ADMIN_ROLES}><DashboardLayout /></RoleRoute>}
      >
        <Route index element={<Navigate to="/admin/dashboard" replace />} />
        <Route path="dashboard" element={<DashboardHome />} />
        <Route path="residents" element={<Residents />} />
        <Route path="maintenance" element={<Maintenance />} />
        {/* Read-only by design; the API refuses gate writes from an admin. */}
        <Route path="security" element={<Security readOnly={true} />} />
      </Route>

      {/* Security Guard Portal */}
      <Route
        path="/guard"
        element={<RoleRoute allow={['SECURITY']} dark><GuardLayout /></RoleRoute>}
      >
        <Route index element={<Navigate to="/guard/gate" replace />} />
        <Route path="gate" element={<Security readOnly={false} />} />
      </Route>

      {/* Resident Portal */}
      <Route
        path="/resident"
        element={<RoleRoute allow={['RESIDENT']}><ResidentLayout /></RoleRoute>}
      >
        <Route index element={<Navigate to="/resident/home" replace />} />
        <Route path="home" element={<ResidentHome />} />
      </Route>

      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}

function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <AppRoutes />
      </BrowserRouter>
    </AuthProvider>
  );
}

export default App;
