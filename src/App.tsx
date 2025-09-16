// src/App.jsx
import React from 'react';
import { SupabaseAuthProvider, useSupabaseAuth } from './contexts/SupabaseAuthContext';
import { OfflineDataProvider } from './contexts/OfflineDataContext';
import { SupabaseDataProvider } from './contexts/SupabaseDataContext';
import SupabaseLogin from './components/SupabaseLogin';
import { I18nProvider, useI18n } from './i18n';
import { Outlet } from 'react-router-dom';

function AppContent() {
  const { userProfile, loading } = useSupabaseAuth();
  const { t } = useI18n();

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

  if (!userProfile) {
    return <SupabaseLogin />;
  }
  
  // Render the nested routes (which will be the Layout and its children)
  return <Outlet />;
}

export default function App() {
  return (
    <I18nProvider>
      <SupabaseAuthProvider>
        <SupabaseDataProvider>
          <OfflineDataProvider>
            <AppContent />
          </OfflineDataProvider>
        </SupabaseDataProvider>
      </SupabaseAuthProvider>
    </I18nProvider>
  );
}