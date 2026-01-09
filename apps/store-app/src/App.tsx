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
  const { currentBranchId, setCurrentBranchId, branchSyncStatus, initializationError, isInitializing } = useOfflineData();
  const { t } = useI18n();

  // ✅ FIX 5: Show error UI if initialization failed (e.g., empty database + offline)
  if (initializationError && !isInitializing) {
    return (
      <div className="min-h-screen bg-gray-100 flex items-center justify-center p-4">
        <div className="bg-white rounded-lg shadow-xl p-8 max-w-md w-full text-center">
          <div className="w-16 h-16 mx-auto mb-4 bg-red-100 rounded-full flex items-center justify-center">
            <svg className="w-8 h-8 text-red-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
            </svg>
          </div>
          <h2 className="text-2xl font-bold text-gray-800 mb-2">Unable to Load Data</h2>
          <p className="text-gray-600 mb-6">{initializationError}</p>
          <div className="space-y-3">
            <button
              onClick={() => window.location.reload()}
              className="w-full px-6 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors font-semibold"
            >
              Retry
            </button>
            <p className="text-sm text-gray-500">
              If this persists, please check your internet connection and try again.
            </p>
          </div>
        </div>
      </div>
    );
  }

  // Check if admin user needs to select a branch
  const isAdmin = userProfile?.role === 'admin' && userProfile?.branch_id === null;
  const needsBranchSelection = isAdmin && !currentBranchId;

  // ✅ FIX 2: Wait for branch sync to complete before showing BranchSelectionScreen
  // This ensures branches are available when the selection screen loads
  if (needsBranchSelection) {
    // Show loading spinner while branch sync is in progress
    if (branchSyncStatus.isSyncing) {
      return (
        <div className="min-h-screen bg-gray-100 flex items-center justify-center">
          <div className="text-center">
            <div className="animate-spin rounded-full h-32 w-32 border-b-2 border-blue-600 mx-auto"></div>
            <p className="mt-4 text-gray-600">Syncing branch data from server...</p>
            <p className="mt-2 text-sm text-gray-500">This usually takes just a few seconds</p>
          </div>
        </div>
      );
    }
    
    // Show BranchSelectionScreen only after sync completes (or if sync failed)
    // BranchSelectionScreen has its own retry logic for edge cases
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