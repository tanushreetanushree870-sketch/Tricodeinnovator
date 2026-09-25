import { BrowserRouter, Routes, Route, Navigate, useLocation } from 'react-router-dom';
import { Toaster } from 'react-hot-toast';
import { AuthProvider, useAuth } from './contexts/AuthContext';
import ErrorBoundary from './components/ErrorBoundary';
import Sidebar from './components/Sidebar';
import AuthPage from './pages/AuthPage';
import Dashboard from './pages/Dashboard';
import Matrix from './pages/Matrix';
import Chat from './pages/Chat';
import Gaps from './pages/Gaps';
import Courses from './pages/Courses';
import Focus from './pages/Focus';
import Leaderboard from './pages/Leaderboard';
import Planner from './pages/Planner';

// Protected route wrapper
const ProtectedLayout = ({ children }) => {
  const { user, loading } = useAuth();

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ background: '#0a0a0f' }}>
        <div className="text-center">
          <div className="w-16 h-16 rounded-2xl flex items-center justify-center mx-auto mb-4"
            style={{ background: 'linear-gradient(135deg,#6366f1,#8b5cf6)' }}>
            <div className="spinner" style={{ borderColor: 'rgba(255,255,255,0.3)', borderTopColor: 'white' }} />
          </div>
          <p style={{ color: '#64748b' }}>Loading ResearchPilot AI...</p>
        </div>
      </div>
    );
  }

  if (!user) return <Navigate to="/login" replace />;

  return (
    <div className="flex h-screen overflow-hidden" style={{ background: '#0a0a0f' }}>
      <Sidebar />
      <main className="flex-1 overflow-y-auto">
        {children}
      </main>
    </div>
  );
};

// Public route: redirect to dashboard if authenticated
const PublicRoute = ({ children }) => {
  const { user, loading } = useAuth();
  if (loading) return null;
  if (user) return <Navigate to="/dashboard" replace />;
  return children;
};

function AppRoutes() {
  return (
    <Routes>
      <Route path="/login" element={
        <PublicRoute><AuthPage /></PublicRoute>
      } />
      <Route path="/dashboard" element={
        <ProtectedLayout><Dashboard /></ProtectedLayout>
      } />
      <Route path="/matrix" element={
        <ProtectedLayout><Matrix /></ProtectedLayout>
      } />
      <Route path="/chat" element={
        <ProtectedLayout><Chat /></ProtectedLayout>
      } />
      <Route path="/gaps" element={
        <ProtectedLayout><Gaps /></ProtectedLayout>
      } />
      <Route path="/courses" element={
        <ProtectedLayout><Courses /></ProtectedLayout>
      } />
      <Route path="/focus" element={
        <ProtectedLayout><Focus /></ProtectedLayout>
      } />
      <Route path="/leaderboard" element={
        <ProtectedLayout><Leaderboard /></ProtectedLayout>
      } />
      <Route path="/planner" element={
        <ProtectedLayout><Planner /></ProtectedLayout>
      } />
      <Route path="*" element={<Navigate to="/dashboard" replace />} />
    </Routes>
  );
}

export default function App() {
  return (
    <ErrorBoundary>
      <BrowserRouter>
        <AuthProvider>
          <AppRoutes />
          <Toaster
            position="top-right"
            toastOptions={{
              style: {
                background: '#1e1e30',
                color: '#f1f5f9',
                border: '1px solid rgba(99,102,241,0.25)',
                borderRadius: '12px',
                fontSize: '14px',
              },
              success: {
                iconTheme: { primary: '#10b981', secondary: '#1e1e30' },
              },
              error: {
                iconTheme: { primary: '#ef4444', secondary: '#1e1e30' },
              },
            }}
          />
        </AuthProvider>
      </BrowserRouter>
    </ErrorBoundary>
  );
}
