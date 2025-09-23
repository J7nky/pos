// src/App.jsx
import { SupabaseAuthProvider, useSupabaseAuth } from './contexts/SupabaseAuthContext';
import { OfflineDataProvider } from './contexts/OfflineDataContext';
import SupabaseLogin from './components/SupabaseLogin';
import { I18nProvider, useI18n } from './i18n';
import ErrorBoundary from './components/ErrorBoundary';
import I18nErrorBoundary from './components/I18nErrorBoundary';
import { Outlet, useLocation } from 'react-router-dom';

function AppContent() {
  const { userProfile, loading } = useSupabaseAuth();
  const { t } = useI18n();
  const location = useLocation();

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-100 flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-32 w-32 border-b-2 border-blue-600"></div>
          <p className="mt-4 text-gray-600">{t('app.loading')}</p>
        </div>
      </div>
    );
  }

  // If user is not authenticated and not on login page, show SupabaseLogin
  if (!userProfile && location.pathname !== '/login') {
    return <SupabaseLogin />;
  }
  
  // Render the nested routes (which will be the Login page or Layout and its children)
  return <Outlet />;
}

export default function App() {
  return (
    <ErrorBoundary>
      <SupabaseAuthProvider>
        <OfflineDataProvider>
          <I18nErrorBoundary>
            <I18nProvider>
              <AppContent />
            </I18nProvider>
          </I18nErrorBoundary>
        </OfflineDataProvider>
      </SupabaseAuthProvider>
    </ErrorBoundary>
  );
}