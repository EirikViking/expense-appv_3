import { Suspense, lazy } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider } from './context/AuthContext';
import { Layout } from './components/Layout';
import { ProtectedRoute } from './components/ProtectedRoute';
import { ApiGuardScreen } from './components/ApiGuard';
import { isApiUrlConfigured, getApiBaseUrl } from './lib/version';
import { FeatureFlagsProvider, useFeatureFlags } from './context/FeatureFlagsContext';

const LoginPage = lazy(() => import('./pages/Login').then((m) => ({ default: m.LoginPage })));
const BootstrapPage = lazy(() => import('./pages/Bootstrap').then((m) => ({ default: m.BootstrapPage })));
const SetPasswordPage = lazy(() => import('./pages/SetPassword').then((m) => ({ default: m.SetPasswordPage })));
const ResetPasswordPage = lazy(() => import('./pages/ResetPassword').then((m) => ({ default: m.ResetPasswordPage })));
const DashboardPage = lazy(() => import('./pages/Dashboard').then((m) => ({ default: m.DashboardPage })));
const UploadPage = lazy(() => import('./pages/Upload').then((m) => ({ default: m.UploadPage })));
const TransactionsPage = lazy(() => import('./pages/Transactions').then((m) => ({ default: m.TransactionsPage })));
const CategoriesPage = lazy(() => import('./pages/Categories').then((m) => ({ default: m.CategoriesPage })));
const RulesPage = lazy(() => import('./pages/Rules').then((m) => ({ default: m.RulesPage })));
const BudgetsPage = lazy(() => import('./pages/Budgets').then((m) => ({ default: m.BudgetsPage })));
const InsightsPage = lazy(() => import('./pages/Insights').then((m) => ({ default: m.InsightsPage })));
const SettingsPage = lazy(() => import('./pages/Settings').then((m) => ({ default: m.SettingsPage })));

// Log API_BASE_URL on startup
console.log(`[App Startup] API_BASE_URL=${getApiBaseUrl()}`);

function AppRoutes() {
  const { showBudgets } = useFeatureFlags();

  return (
    <Suspense fallback={<div className="min-h-screen bg-black text-white" />}>
      <Routes>
        <Route path="/login" element={<LoginPage />} />
        <Route path="/bootstrap" element={<BootstrapPage />} />
        <Route path="/set-password" element={<SetPasswordPage />} />
        <Route path="/reset-password" element={<ResetPasswordPage />} />
        <Route
          path="/"
          element={
            <ProtectedRoute>
              <Layout>
                <DashboardPage />
              </Layout>
            </ProtectedRoute>
          }
        />
        <Route
          path="/upload"
          element={
            <ProtectedRoute>
              <Layout>
                <UploadPage />
              </Layout>
            </ProtectedRoute>
          }
        />
        <Route
          path="/transactions"
          element={
            <ProtectedRoute>
              <Layout>
                <TransactionsPage />
              </Layout>
            </ProtectedRoute>
          }
        />
        <Route
          path="/categories"
          element={
            <ProtectedRoute>
              <Layout>
                <CategoriesPage />
              </Layout>
            </ProtectedRoute>
          }
        />
        <Route
          path="/rules"
          element={
            <ProtectedRoute>
              <Layout>
                <RulesPage />
              </Layout>
            </ProtectedRoute>
          }
        />
        <Route
          path="/budgets"
          element={
            <ProtectedRoute>
              <Layout>
                {showBudgets ? <BudgetsPage /> : <Navigate to="/settings" replace />}
              </Layout>
            </ProtectedRoute>
          }
        />
        <Route
          path="/insights"
          element={
            <ProtectedRoute>
              <Layout>
                <InsightsPage />
              </Layout>
            </ProtectedRoute>
          }
        />
        <Route
          path="/settings"
          element={
            <ProtectedRoute>
              <Layout>
                <SettingsPage />
              </Layout>
            </ProtectedRoute>
          }
        />
        {/* Catch-all redirect to dashboard */}
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </Suspense>
  );
}

function App() {
  // Show API configuration error in production if not configured
  if (!isApiUrlConfigured()) {
    return <ApiGuardScreen />;
  }

  return (
    <BrowserRouter>
      <AuthProvider>
        <FeatureFlagsProvider>
          <AppRoutes />
        </FeatureFlagsProvider>
      </AuthProvider>
    </BrowserRouter>
  );
}

export default App;
