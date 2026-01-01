// src/App.jsx
import { SupabaseAuthProvider, useSupabaseAuth } from './contexts/SupabaseAuthContext';
import { OfflineDataProvider, useOfflineData } from './contexts/OfflineDataContext';
import { CustomerFormProvider } from './contexts/CustomerFormContext';

import SupabaseLogin from './components/SupabaseLogin';
import BranchSelectionScreen from './components/BranchSelectionScreen';
import { I18nProvider, useI18n } from './i18n';
import NativeKeyboardHandler from './components/common/NativeKeyboardHandler';
import ErrorBoundary from './components/ErrorBoundary';
import I18nErrorBoundary from './components/I18nErrorBoundary';
import UpdateNotification from './components/UpdateNotification';
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
  // EXCEPT for public routes that don't require authentication
  const isPublicRoute = location.pathname.startsWith('/public/');
  
  if (!userProfile && location.pathname !== '/login' && !isPublicRoute) {
    // Check if we're in offline mode (no Supabase credentials)
    const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
    const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;
    
    if (!supabaseUrl || !supabaseAnonKey || supabaseUrl === 'https://placeholder.supabase.co') {
      // In offline mode, bypass authentication and go directly to the app
      console.log('Offline mode: bypassing authentication');
      return <Outlet />;
    }
    
    return <SupabaseLogin />;
  }
  
  // Render the nested routes (which will be the Login page or Layout and its children)
  return (
    <>
      <Outlet />
      <NativeKeyboardHandler />
      <UpdateNotification />
    </>
  );
}

// Wrapper component to handle branch selection for admin users
function BranchAwareAppContent() {
  const { userProfile } = useSupabaseAuth();
  const { currentBranchId, setCurrentBranchId, loading } = useOfflineData();
  const { t } = useI18n();

  // Check if admin user needs to select a branch
  const isAdmin = userProfile?.role === 'admin' && userProfile?.branch_id === null;
  const needsBranchSelection = isAdmin && !currentBranchId;

  // If admin user needs branch selection, show it immediately
  // The BranchSelectionScreen has its own retry logic to wait for branch data
  // Don't wait for loading.sync here - that creates a chicken-and-egg problem
  // (sync won't start until branch is selected, per OfflineDataContext logic)
  if (needsBranchSelection) {
    return (
      <BranchSelectionScreen 
        onBranchSelected={(branchId) => {
          console.log('🏢 Admin selected branch:', branchId);
          setCurrentBranchId(branchId);
          // Data loading will automatically start now that branchId is set
        }} 
      />
    );
  }

  // Otherwise, render the normal app content
  return <AppContent />;
}

export default function App() {
  return (
    <ErrorBoundary>
      <SupabaseAuthProvider>
        <OfflineDataProvider>
          <I18nErrorBoundary>
            <I18nProvider>
              <CustomerFormProvider>
                <BranchAwareAppContent />
              </CustomerFormProvider>
            </I18nProvider>
          </I18nErrorBoundary>
        </OfflineDataProvider>
      </SupabaseAuthProvider>
    </ErrorBoundary>
  );
}