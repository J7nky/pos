import React, { ReactNode } from 'react';
import { useSupabaseAuth } from '../contexts/SupabaseAuthContext';
import { useOfflineData } from '../contexts/OfflineDataContext';
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

interface LayoutProps {
  children: ReactNode;
  currentPage: string;
  onPageChange: (page: string) => void;
}

export default function Layout({ children, currentPage, onPageChange }: LayoutProps) {
  const { userProfile, signOut } = useSupabaseAuth();
  const { isOnline, products, customers, inventory, getSyncStatus } = useOfflineData();
  const { unsyncedCount, isSyncing } = getSyncStatus();

  // Listen for navigation events from Fast Actions
  React.useEffect(() => {
    const handleNavigate = (event: CustomEvent) => {
      onPageChange(event.detail);
    };
    
    window.addEventListener('navigate', handleNavigate as EventListener);
    return () => window.removeEventListener('navigate', handleNavigate as EventListener);
  }, [onPageChange]);

  const menuItems = [
    { id: 'home', label: 'Home', icon: LayoutDashboard },
    { id: 'inventory', label: 'Inventory', icon: Package },

    { id: 'pos', label: 'Point of Sale', icon: ShoppingCart },
    { id: 'customers', label: 'Customers', icon: Users },
    { id: 'accounting', label: 'Accounting', icon: Calculator },
    { id: 'reports', label: 'Reports', icon: FileText },
    { id: 'demo', label: '🚀 Offline Demo', icon: () => <span className="text-lg">🚀</span> },
    { id: 'settings', label: 'Settings', icon: Settings }
  ];

  return (
    <div className="flex h-screen bg-gray-50">
      {/* Sidebar */}
      <div className="w-64 bg-white shadow-lg">
        <div className="p-6 border-b">
          <h1 className="text-xl font-bold text-gray-800">ProducePOS</h1>
          <div className="flex items-center mt-2 text-sm text-gray-600">
            {isOnline ? (
              <><Wifi className="w-4 h-4 mr-2 text-green-500" /> Online</>
            ) : (
              <><WifiOff className="w-4 h-4 mr-2 text-red-500" /> Offline</>
            )}
            {unsyncedCount > 0 && (
              <span className="ml-2 px-2 py-1 bg-yellow-100 text-yellow-800 text-xs rounded-full">
                {unsyncedCount} unsynced
              </span>
            )}
          </div>
        </div>
        
        <nav className="mt-6">
          {menuItems.map(item => (
            <button
              key={item.id}
              onClick={() => onPageChange(item.id)}
              className={`w-full flex items-center px-6 py-3 text-left hover:bg-blue-50 transition-colors ${
                currentPage === item.id ? 'bg-blue-50 border-r-2 border-blue-500 text-blue-600' : 'text-gray-600'
              }`}
            >
              <item.icon className="w-5 h-5 mr-3" />
              {item.label}
            </button>
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
              className="p-2 text-gray-400 hover:text-red-600 transition-colors"
            >
              <LogOut className="w-5 h-5" />
            </button>
          </div>
        </div>
      </div>

      {/* Main Content */}
      <div className="flex-1 overflow-auto">
        {children}
      </div>
    </div>
  );
}