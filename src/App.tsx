import { lazy, Suspense, type ReactNode } from 'react';
import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import { AppShell } from '@/components/AppShell';
import { Spinner } from '@/components/ui';
import { AuthProvider, useAuth } from '@/lib/auth';
import type { Role } from '@/lib/api';
import { I18nProvider } from '@/lib/i18n';
import { AccountPage, ForgotPasswordPage, LoginPage } from '@/pages/AuthPages';
import { DashboardPage } from '@/pages/DashboardPage';
import { UpdatePrompt } from '@/components/UpdatePrompt';

const CreateJobPage = lazy(() => import('@/pages/CreateJobPage').then((m) => ({ default: m.CreateJobPage })));
const JobDetailPage = lazy(() => import('@/pages/JobDetailPage').then((m) => ({ default: m.JobDetailPage })));
const CapturePage = lazy(() => import('@/features/capture/CapturePage').then((m) => ({ default: m.CapturePage })));
const NavigatePage = lazy(() => import('@/pages/NavigatePage').then((m) => ({ default: m.NavigatePage })));
const ComparePage = lazy(() => import('@/pages/ComparePage').then((m) => ({ default: m.ComparePage })));
const ReportsPage = lazy(() => import('@/pages/ReportsPage').then((m) => ({ default: m.ReportsPage })));
const AdminPage = lazy(() => import('@/pages/AdminPage').then((m) => ({ default: m.AdminPage })));

function Loading() {
  return <div className="flex h-full items-center justify-center p-8"><Spinner /></div>;
}

/**
 * Client-side guard for navigation only. Every permission is enforced again
 * by the server on each request; hiding a route is not a security control.
 */
function RequireAuth({ children, roles }: { children: ReactNode; roles?: Role[] }) {
  const { user, ready } = useAuth();
  if (!user && !ready) return <Loading />;
  if (!user) return <Navigate to="/login" replace />;
  if (user.must_change_password) return <Navigate to="/account" replace />;
  if (roles && !roles.includes(user.role)) return <Navigate to="/" replace />;
  return <>{children}</>;
}

function RequireSession({ children }: { children: ReactNode }) {
  const { user, ready } = useAuth();
  if (!user && !ready) return <Loading />;
  return user ? <>{children}</> : <Navigate to="/login" replace />;
}

export default function App() {
  return (
    <I18nProvider>
      <AuthProvider>
        <BrowserRouter basename={import.meta.env.BASE_URL.replace(/\/$/, '') || '/'}>
          <Suspense fallback={<Loading />}>
            <Routes>
              <Route path="/login" element={<LoginPage />} />
              <Route path="/forgot" element={<ForgotPasswordPage />} />
              <Route path="/account" element={<RequireSession><AccountPage /></RequireSession>} />
              <Route path="/jobs/:id/capture/:type" element={<RequireAuth roles={['admin', 'inspector']}><CapturePage /></RequireAuth>} />
              <Route element={<RequireAuth><AppShell /></RequireAuth>}>
                <Route index element={<DashboardPage />} />
                <Route path="/jobs/new" element={<RequireAuth roles={['admin', 'inspector']}><CreateJobPage /></RequireAuth>} />
                <Route path="/jobs/:id" element={<JobDetailPage />} />
                <Route path="/jobs/:id/navigate" element={<NavigatePage />} />
                <Route path="/jobs/:id/compare" element={<ComparePage />} />
                <Route path="/reports" element={<ReportsPage />} />
                <Route path="/admin" element={<RequireAuth roles={['admin']}><AdminPage /></RequireAuth>} />
              </Route>
              <Route path="*" element={<Navigate to="/" replace />} />
            </Routes>
          </Suspense>
          <UpdatePrompt />
        </BrowserRouter>
      </AuthProvider>
    </I18nProvider>
  );
}
