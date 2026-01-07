import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider } from './context/AuthContext';
import { Layout } from './components/Layout';
import { ProtectedRoute } from './components/ProtectedRoute';
import { ApiGuardScreen } from './components/ApiGuard';
import { isApiUrlConfigured, getApiBaseUrl } from './lib/version';
import { LoginPage } from './pages/Login';
import { DashboardPage } from './pages/Dashboard';
import { UploadPage } from './pages/Upload';
import { TransactionsPage } from './pages/Transactions';
import { CategoriesPage } from './pages/Categories';
import { RulesPage } from './pages/Rules';
import { BudgetsPage } from './pages/Budgets';
import { InsightsPage } from './pages/Insights';
import { SettingsPage } from './pages/Settings';

// Log API_BASE_URL on startup
console.log(`[App Startup] API_BASE_URL=${getApiBaseUrl()}`);

function App() {
  // Show API configuration error in production if not configured
  if (!isApiUrlConfigured()) {
    return <ApiGuardScreen />;
  }

  return (
    <BrowserRouter>
      <AuthProvider>
        <Routes>
          <Route path="/login" element={<LoginPage />} />
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
                  <BudgetsPage />
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
      </AuthProvider>
    </BrowserRouter>
  );
}

export default App;

