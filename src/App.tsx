import React, { useState } from 'react';
import { SupabaseAuthProvider, useSupabaseAuth } from './contexts/SupabaseAuthContext';
import { OfflineDataProvider } from './contexts/OfflineDataContext';
import SupabaseLogin from './components/SupabaseLogin';
import Layout from './components/Layout';
import Home from './components/Home';
import Inventory from './components/Inventory';
import POS from './components/POS';
import Reports from './components/Reports';
import Customers from './components/Customers';
import Accounting from './components/Accounting';
import Settings from './components/Settings';
import OfflineDemo from './components/OfflineDemo';

function AppContent() {
  const { userProfile, loading } = useSupabaseAuth();
  const [currentPage, setCurrentPage] = useState('home');

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-100 flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-32 w-32 border-b-2 border-blue-600"></div>
          <p className="mt-4 text-gray-600">Loading...</p>
        </div>
      </div>
    );
  }

  if (!userProfile) {
    return <SupabaseLogin />;
  }

  const renderPage = () => {
    switch (currentPage) {
      case 'home':
        return <Home />;
      case 'inventory':
        return <Inventory />;
      case 'pos':
        return <POS />;
      case 'reports':
        return <Reports />;
      case 'accounting':
        return <Accounting />;
      case 'customers':
        return <Customers />;
      case 'settings':
        return <Settings />;
      case 'demo':
        return <OfflineDemo />;
      default:
        return <Home />;
    }
  };

  return (
    <Layout currentPage={currentPage} onPageChange={setCurrentPage}>
      {renderPage()}
    </Layout>
  );
}

function App() {
  return (
    <SupabaseAuthProvider>
      <OfflineDataProvider>
        <AppContent />
      </OfflineDataProvider>
    </SupabaseAuthProvider>
  );
}

export default App;