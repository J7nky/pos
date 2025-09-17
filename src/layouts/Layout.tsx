import { OfflineIndicator } from '../components/OfflineIndicator';
import { Link, Outlet, useLocation } from 'react-router-dom';
import KeyboardShortcutsHelp from '../components/common/KeyboardShortcutsHelp';
import ErrorBoundary from '../components/common/ErrorBoundary';
import UndoToastManager from '../components/common/UndoToastManager';
import { useSupabaseAuth } from '../contexts/SupabaseAuthContext';
import { useOfflineData } from '../contexts/OfflineDataContext';
import { useI18n } from '../i18n';
import {
  LayoutDashboard,
  Package,
  ShoppingCart,
  Users,
  FileText,
  Settings,
  LogOut,
  Wifi,
  WifiOff,
  Calculator
} from 'lucide-react';

export default function Layout() {
  const { userProfile, signOut } = useSupabaseAuth();
  const { t } = useI18n();
  const location = useLocation();

  if (!userProfile) {
    return (
      <div className="min-h-screen bg-gray-100 flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-32 w-32 border-b-2 border-blue-600"></div>
          <p className="mt-4 text-gray-600">Loading...</p>
        </div>
      </div>
    );
  }

  const { isOnline, getSyncStatus } = useOfflineData();
  const { unsyncedCount } = getSyncStatus();

  const menuItems = [
    { id: 'home', label: t('nav.home'), icon: LayoutDashboard, path: '/' },
    { id: 'inventory', label: t('nav.inventory'), icon: Package, path: '/inventory' },
    { id: 'pos', label: t('nav.pos'), icon: ShoppingCart, path: '/pos' },
    { id: 'customers', label: t('nav.customers'), icon: Users, path: '/customers' },
    { id: 'accounting', label: t('nav.accounting'), icon: Calculator, path: '/accounting' },
    { id: 'reports', label: t('nav.reports'), icon: FileText, path: '/reports' },
    { id: 'settings', label: t('nav.settings'), icon: Settings, path: '/settings' }
  ];

  // Define shortcuts based on current page
  const getShortcutsForPage = () => {
    const baseShortcuts: Array<{
      title: string;
      shortcuts: Record<string, string>;
    }> = [
      {
        title: 'Navigation',
        shortcuts: {
          'Alt+H': 'Home',
          'Alt+I': 'Inventory',
          'Alt+P': 'Point of Sale',
          'Alt+C': 'Customers',
          'Alt+A': 'Accounting',
          'Alt+R': 'Reports',
          'Alt+S': 'Settings'
        }
      }
    ];

    if (location.pathname === '/pos') {
      baseShortcuts.push({
        title: 'POS Actions',
        shortcuts: {
          'F1': 'New Bill',
          'F2': 'Complete Sale',
          'F3': 'Clear Cart',
          'Ctrl+F': 'Focus Search',
          'Ctrl+U': 'Focus Customer',
          'Ctrl+1': 'Cash Payment',
          'Ctrl+2': 'Credit Payment',
          'Ctrl+Enter': 'Complete Sale'
        }
      });
    }

    if (location.pathname === '/accounting') {
      baseShortcuts.push({
        title: 'Accounting Actions',
        shortcuts: {
          'F2': 'Customer Payment',
          'F3': 'Supplier Payment',
          'F4': 'Record Expense',
          'Ctrl+R': 'Refresh Data',
          'Ctrl+S': 'Sync Data',
          'Ctrl+F': 'Focus Search'
        }
      });
    }

    return baseShortcuts;
  };

  return (
    <div className="flex h-screen bg-gray-50">
      {/* Sidebar */}
      <div className="w-64 bg-white shadow-lg">
        <div className="p-6 border-b">
          <h1 className="text-xl font-bold text-gray-800">{t('layout.title')}</h1>
          <div className="flex items-center mt-2 text-sm text-gray-600">
            {isOnline ? (
              <><Wifi className="w-4 h-4 mr-2 text-green-500" /> {t('layout.connection.online')}</>
            ) : (
              <><WifiOff className="w-4 h-4 mr-2 text-red-500" /> {t('layout.connection.offline')}</>
            )}
            {unsyncedCount > 0 && (
              <span className="ml-2 px-2 py-1 bg-yellow-100 text-yellow-800 text-xs rounded-full">
                {t('common.status.unsyncedCount', { count: unsyncedCount })}
              </span>
            )}
          </div>
          <div className="mt-2">
            <KeyboardShortcutsHelp shortcuts={getShortcutsForPage()} />
          </div>
        </div>

        <nav className="mt-6">
          {menuItems.map((item, index) => (
            <Link
              key={item.id}
              to={item.path}
              className={`w-full flex items-center px-6 py-3 text-left hover:bg-blue-50 transition-colors focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-inset min-h-[48px] ${
                location.pathname === item.path ? 'bg-blue-50 border-r-2 border-blue-500 text-blue-600' : 'text-gray-600'
              }`}
              tabIndex={index + 1}
              accessKey={item.label.charAt(0).toLowerCase()}
              aria-label={`${item.label} (Alt+${item.label.charAt(0).toUpperCase()})`}
            >
              <item.icon className="w-5 h-5 mr-3" />
              {item.label}
            </Link>
          ))}
        </nav>

        <div className="absolute bottom-0 w-64 p-6 border-t">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-gray-700">{userProfile?.name}</p>
              <p className="text-xs text-gray-500 capitalize">{userProfile?.role}</p>
            </div>
            <button
              onClick={signOut}
              className="p-2 text-gray-400 hover:text-red-600 transition-colors focus:outline-none focus:ring-2 focus:ring-red-500 rounded min-h-[44px] min-w-[44px]"
              aria-label="Sign out"
              tabIndex={20}
            >
              <LogOut className="w-5 h-5" />
            </button>
          </div>
        </div>
      </div>

      {/* Main Content */}
      <div className="flex-1 overflow-auto">
        <ErrorBoundary>
          <Outlet />
        </ErrorBoundary>
      </div>
      <OfflineIndicator />
      <UndoToastManager />
    </div>
  );
}