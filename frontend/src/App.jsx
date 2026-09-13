import { useContext, lazy, Suspense } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider, AuthContext } from './context/AuthContext';
import { FeedbackProvider } from './components/common/Feedback';
import { homePathFor, ADMIN_ROLES } from './lib/roles';

// Sign-in stays in the first download, because every visit starts there.
// Everything else loads with the portal that uses it, so a guard at the gate
// never downloads the finance module and a resident never downloads the desk.
import Login from './pages/Login';
import ChangePassword from './pages/ChangePassword';
const DashboardLayout = lazy(() => import('./layouts/DashboardLayout'));
const GuardLayout = lazy(() => import('./layouts/GuardLayout'));
const ResidentLayout = lazy(() => import('./layouts/ResidentLayout'));
const DashboardHome = lazy(() => import('./pages/DashboardHome'));
const Residents = lazy(() => import('./pages/Residents'));
const Maintenance = lazy(() => import('./pages/Maintenance'));
const Billing = lazy(() => import('./pages/Billing'));
const Community = lazy(() => import('./pages/Community'));
const Activity = lazy(() => import('./pages/Activity'));
const Books = lazy(() => import('./pages/Books'));
const Security = lazy(() => import('./pages/Security'));
const ResidentHome = lazy(() => import('./pages/resident/ResidentHome'));
const ResidentDues = lazy(() => import('./pages/resident/ResidentDues'));
const ResidentIssues = lazy(() => import('./pages/resident/ResidentIssues'));
const ResidentGate = lazy(() => import('./pages/resident/ResidentGate'));
const ResidentNotices = lazy(() => import('./pages/resident/ResidentNotices'));
const ResidentAmenities = lazy(() => import('./pages/resident/ResidentAmenities'));
const ResidentHousehold = lazy(() => import('./pages/resident/ResidentHousehold'));
const ResidentPolls = lazy(() => import('./pages/resident/ResidentPolls'));
const ResidentDocuments = lazy(() => import('./pages/resident/ResidentDocuments'));
const ResidentEmergency = lazy(() => import('./pages/resident/ResidentEmergency'));

const Spinner = ({ dark = false }) => (
  <div className={`h-screen flex items-center justify-center ${dark ? 'bg-slate-900' : 'bg-slate-50'}`}>
    <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-teal-600"></div>
  </div>
);

// Inside a portal only the content area waits, so the sidebar stays put.
const PageSpinner = () => (
  <div className="py-24 flex items-center justify-center" role="status" aria-label="Loading">
    <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-teal-600"></div>
  </div>
);

const page = (element) => <Suspense fallback={<PageSpinner />}>{element}</Suspense>;

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
        <Route path="dashboard" element={page(<DashboardHome />)} />
        <Route path="residents" element={page(<Residents />)} />
        <Route path="billing" element={page(<Billing />)} />
        <Route path="books" element={page(<Books />)} />
        <Route path="maintenance" element={page(<Maintenance />)} />
        <Route path="community" element={page(<Community />)} />
        <Route path="activity" element={page(<Activity />)} />
        {/* Read-only by design; the API refuses gate writes from an admin. */}
        <Route path="security" element={page(<Security readOnly={true} />)} />
      </Route>

      {/* Security Guard Portal */}
      <Route
        path="/guard"
        element={<RoleRoute allow={['SECURITY']} dark><GuardLayout /></RoleRoute>}
      >
        <Route index element={<Navigate to="/guard/gate" replace />} />
        <Route path="gate" element={page(<Security readOnly={false} />)} />
      </Route>

      {/* Resident Portal */}
      <Route
        path="/resident"
        element={<RoleRoute allow={['RESIDENT']}><ResidentLayout /></RoleRoute>}
      >
        <Route index element={<Navigate to="/resident/home" replace />} />
        <Route path="home" element={page(<ResidentHome />)} />
        <Route path="dues" element={page(<ResidentDues />)} />
        <Route path="issues" element={page(<ResidentIssues />)} />
        <Route path="gate" element={page(<ResidentGate />)} />
        <Route path="notices" element={page(<ResidentNotices />)} />
        <Route path="amenities" element={page(<ResidentAmenities />)} />
        <Route path="household" element={page(<ResidentHousehold />)} />
        <Route path="polls" element={page(<ResidentPolls />)} />
        <Route path="documents" element={page(<ResidentDocuments />)} />
        <Route path="help" element={page(<ResidentEmergency />)} />
      </Route>

      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}

function App() {
  return (
    <FeedbackProvider>
      <AuthProvider>
        <BrowserRouter>
          <Suspense fallback={<Spinner />}>
            <AppRoutes />
          </Suspense>
        </BrowserRouter>
      </AuthProvider>
    </FeedbackProvider>
  );
}

export default App;
