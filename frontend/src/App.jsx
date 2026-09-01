import { useContext } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider, AuthContext } from './context/AuthContext';
import Login from './pages/Login';
import DashboardLayout from './layouts/DashboardLayout';
import GuardLayout from './layouts/GuardLayout';
import Residents from './pages/Residents';
import Maintenance from './pages/Maintenance';
import Security from './pages/Security';

// Admin Route Wrapper
const AdminRoute = ({ children }) => {
  const { token, user, loading } = useContext(AuthContext);
  
  if (loading) return <div className="h-screen flex items-center justify-center bg-slate-50"><div className="animate-spin rounded-full h-12 w-12 border-b-2 border-teal-600"></div></div>;
  if (!token) return <Navigate to="/" replace />;
  if (user?.role === 'SECURITY') return <Navigate to="/guard/gate" replace />;
  
  return children;
};

// Guard Route Wrapper
const GuardRoute = ({ children }) => {
  const { token, user, loading } = useContext(AuthContext);
  
  if (loading) return <div className="h-screen flex items-center justify-center bg-slate-900"><div className="animate-spin rounded-full h-12 w-12 border-b-2 border-teal-500"></div></div>;
  if (!token) return <Navigate to="/" replace />;
  if (user?.role !== 'SECURITY' && user?.role !== 'SUPER_ADMIN') return <Navigate to="/admin/dashboard" replace />;
  
  return children;
};

import DashboardHome from './pages/DashboardHome';

function AppRoutes() {
  return (
    <Routes>
      <Route path="/" element={<Login />} />
      
      {/* Admin Portal */}
      <Route path="/admin" element={<AdminRoute><DashboardLayout /></AdminRoute>}>
        <Route path="dashboard" element={<DashboardHome />} />
        <Route path="residents" element={<Residents />} />
        <Route path="maintenance" element={<Maintenance />} />
        <Route path="security" element={<Security readOnly={true} />} />
      </Route>

      {/* Security Guard Portal */}
      <Route path="/guard" element={<GuardRoute><GuardLayout /></GuardRoute>}>
        <Route path="gate" element={<Security readOnly={false} />} />
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
