import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { Toaster } from 'react-hot-toast';
import { AuthProvider, useAuth } from '@/lib/auth';
import type { UserRole } from '@/types';
import { LoginPage } from '@/pages/LoginPage';
import { JoinPage } from '@/pages/JoinPage';
import { DashboardPage } from '@/pages/DashboardPage';
import { NewBookingPage } from '@/pages/NewBookingPage';
import { BookingDetailPage } from '@/pages/BookingDetailPage';
import { SettingsPage } from '@/pages/SettingsPage';
import { SurgeonPage } from '@/pages/SurgeonPage';
import { SuperadminLoginPage } from '@/pages/SuperadminLoginPage';
import { SuperadminDashboardPage } from '@/pages/SuperadminDashboardPage';

function ProtectedRoute({ children, roles }: { children: React.ReactNode; roles: UserRole[] }) {
  const { user, loading } = useAuth();
  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="text-gray-400 text-sm">Loading...</div>
      </div>
    );
  }
  if (!user) return <Navigate to="/login" replace />;
  if (!roles.includes(user.role)) {
    if (user.role === 'surgeon') return <Navigate to="/surgeon" replace />;
    return <Navigate to="/dashboard" replace />;
  }
  return <>{children}</>;
}

function SurgeonRoute({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuth();
  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="text-gray-400 text-sm">Loading...</div>
      </div>
    );
  }
  if (!user) return <Navigate to="/login" replace />;
  if (user.role !== 'surgeon') return <Navigate to="/dashboard" replace />;
  return <>{children}</>;
}

function RootRedirect() {
  const { user, loading } = useAuth();
  if (loading) return null;
  if (!user) return <Navigate to="/login" replace />;
  if (user.role === 'surgeon') return <Navigate to="/surgeon" replace />;
  return <Navigate to="/dashboard" replace />;
}

export default function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <Toaster position="top-right" toastOptions={{ duration: 4000 }} />
        <Routes>
          <Route path="/" element={<RootRedirect />} />
          <Route path="/login" element={<LoginPage />} />
          <Route path="/join/:token" element={<JoinPage />} />
          <Route path="/dashboard" element={
            <ProtectedRoute roles={['secretary', 'practice_admin']}>
              <DashboardPage />
            </ProtectedRoute>
          } />
          <Route path="/dashboard/new-booking" element={
            <ProtectedRoute roles={['secretary', 'practice_admin']}>
              <NewBookingPage />
            </ProtectedRoute>
          } />
          <Route path="/dashboard/booking/:id" element={
            <ProtectedRoute roles={['secretary', 'practice_admin']}>
              <BookingDetailPage />
            </ProtectedRoute>
          } />
          <Route path="/dashboard/settings" element={
            <ProtectedRoute roles={['secretary', 'practice_admin']}>
              <SettingsPage />
            </ProtectedRoute>
          } />
          <Route path="/surgeon" element={
            <SurgeonRoute>
              <SurgeonPage />
            </SurgeonRoute>
          } />
          <Route path="/superadmin/login" element={<SuperadminLoginPage />} />
          <Route path="/superadmin/dashboard" element={<SuperadminDashboardPage />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </BrowserRouter>
    </AuthProvider>
  );
}
