import { OfflineIndicator } from '../components/OfflineIndicator';
import { ErrorToastContainer } from '../components/common/ErrorToastContainer';
import { Link, Outlet, useLocation } from 'react-router-dom';
import KeyboardShortcutsHelp from '../components/common/KeyboardShortcutsHelp';
import ErrorBoundary from '../components/common/ErrorBoundary';
import UndoToastManager from '../components/common/UndoToastManager';
import { NotificationCenter } from '../components/NotificationCenter';
import { useSupabaseAuth } from '../contexts/SupabaseAuthContext';
import { useOfflineData } from '../contexts/OfflineDataContext';
import { useI18n } from '../i18n';
import { AccessControlService } from '../services/accessControlService';
import { useState, useEffect, useRef } from 'react';
import { ModuleName } from '../types';
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
  Calculator,
  UserCog,
  CloudOff
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

  const { isOnline, getSyncStatus, getUserById, getRolePermissionsByRole } = useOfflineData();
  const { unsyncedCount, isSyncing } = getSyncStatus();
  const prevIsSyncingRef = useRef(isSyncing);
  const prevIsOnlineRef = useRef(isOnline);

  // Debug: Log when isOnline changes
  useEffect(() => {
    if (prevIsOnlineRef.current !== isOnline) {
      console.log('🔄 Layout: isOnline changed from', prevIsOnlineRef.current, 'to', isOnline);
      prevIsOnlineRef.current = isOnline;
    }
  }, [isOnline]);

  // Dynamic module access based on user permissions (syncs across devices)
  const [moduleAccess, setModuleAccess] = useState<Record<ModuleName, boolean>>({
    pos: false,
    inventory: false,
    accounting: false,
    reports: false,
    settings: false,
    users: false
  });

  // Load module access
  const loadModuleAccess = async (forceReload = false) => {
    if (!userProfile) return;

    try {
      // Clear cache if forcing reload
      if (forceReload) {
        AccessControlService.clearCache(userProfile.id, userProfile.store_id);
        console.log('🔄 Permission cache cleared, reloading...');
      }

      // Pass role directly to avoid database lookup (user might not be synced yet)
      const access = await AccessControlService.getUserModuleAccess(
        userProfile.id,
        userProfile.store_id,
        userProfile.role
      );
      
      // Check if permissions are minimal (all false) - this indicates user data might not be synced yet
      const hasAnyPermission = Object.values(access).some(v => v === true);
      
      if (!hasAnyPermission) {
        // Check if user exists in IndexedDB - if yes, we should have permissions
        const user = await getUserById(userProfile.id);
        
        if (user) {
          // User exists but no permissions - this shouldn't happen, try reloading
          console.log('⚠️ User exists but no permissions found, checking role permissions...');
          const rolePerms = await getRolePermissionsByRole(user.role);
          
          if (rolePerms.length > 0) {
            // Role permissions exist, force reload
            console.log('🔄 Role permissions found, forcing permission reload...');
            AccessControlService.clearCache(userProfile.id, userProfile.store_id);
            const refreshedAccess = await AccessControlService.getUserModuleAccess(
              userProfile.id,
              userProfile.store_id,
              userProfile.role
            );
            setModuleAccess(refreshedAccess);
            return;
          }
        }
      }
      
      setModuleAccess(access);
      console.log('✅ Module access loaded:', access);
    } catch (error) {
      console.error('Failed to load module access:', error);
    }
  };

  // ✅ FIX 1: Load permissions only after data is ready
  // This prevents queries to role_permissions/user_permissions tables before they're synced
  const { isDataReady } = useOfflineData();
  
  useEffect(() => {
    // Wait for data to be ready before loading module access
    if (!isDataReady || !userProfile) {
      return;
    }
    
    loadModuleAccess();
    
    // Also check after a delay in case sync completes quickly
    // This handles the race condition where sync finishes before this component mounts
    const delayedCheck = setTimeout(async () => {
      if (!userProfile) return;
      
      try {
        const user = await getUserById(userProfile.id);
        
        if (user) {
          // User exists, check if we have proper permissions
          const currentAccess = await AccessControlService.getUserModuleAccess(
            userProfile.id,
            userProfile.store_id,
            userProfile.role
          );
          
          const hasAnyPermission = Object.values(currentAccess).some(v => v === true);
          
          if (!hasAnyPermission) {
            // No permissions but user exists - force reload
            console.log('🔄 Delayed check: User exists but no permissions, reloading...');
            await loadModuleAccess(true);
          } else {
            // Update with proper permissions
            setModuleAccess(currentAccess);
          }
        }
      } catch (error) {
        console.error('Error in delayed permission check:', error);
      }
    }, 3000); // Check after 3 seconds
    
    return () => clearTimeout(delayedCheck);
  }, [userProfile, isDataReady]); // ✅ FIX 1: Include isDataReady in dependencies

  // Reload permissions when sync completes (isSyncing changes from true to false)
  useEffect(() => {
    const wasSyncing = prevIsSyncingRef.current;
    const isNowSyncing = isSyncing;

    // If sync just completed (was syncing, now not syncing)
    if (wasSyncing && !isNowSyncing && userProfile) {
      console.log('🔄 Sync completed, reloading permissions...');
      // Small delay to ensure data is fully written to IndexedDB
      setTimeout(() => {
        loadModuleAccess(true); // Force reload with cache clear
      }, 1000); // Increased delay to ensure data is written
    }

    prevIsSyncingRef.current = isNowSyncing;
  }, [isSyncing, userProfile]);

  // Periodically check if permissions need to be refreshed
  // This handles the case where permissions were loaded with minimal cache before user data synced
  useEffect(() => {
    if (!userProfile) return;

    let checkCount = 0;
    const maxChecks = 20; // Check for 40 seconds (20 * 2 seconds)
    let hasReloaded = false;

    const checkInterval = setInterval(async () => {
      checkCount++;
      
      try {
        const user = await getUserById(userProfile.id);
        
        // If user exists, check if we need to reload permissions
        if (user && !hasReloaded) {
          // Check current permissions state
          const currentAccess = await AccessControlService.getUserModuleAccess(
            userProfile.id,
            userProfile.store_id,
            userProfile.role
          );
          
          const hasAnyPermission = Object.values(currentAccess).some(v => v === true);
          
          if (!hasAnyPermission) {
            // Still no permissions, check if role permissions exist
            const rolePerms = await getRolePermissionsByRole(user.role);
            
            if (rolePerms.length > 0) {
              console.log('🔄 Role permissions exist but not loaded, forcing reload...');
              await loadModuleAccess(true); // Force reload
              hasReloaded = true;
              clearInterval(checkInterval);
            }
          } else {
            // Permissions are good now, update state
            setModuleAccess(currentAccess);
            hasReloaded = true;
            clearInterval(checkInterval);
          }
        } else if (checkCount >= maxChecks) {
          // Stop checking after max attempts
          clearInterval(checkInterval);
        }
      } catch (error) {
        console.error('Error checking user data:', error);
        if (checkCount >= maxChecks) {
          clearInterval(checkInterval);
        }
      }
    }, 2000);

    return () => {
      clearInterval(checkInterval);
    };
  }, [userProfile]);

  // All potential menu items
  const allMenuItems = [
    { id: 'home', label: t('nav.home'), icon: LayoutDashboard, path: '/', module: null },
    { id: 'inventory', label: t('nav.inventory'), icon: Package, path: '/inventory', module: 'inventory' as ModuleName },
    { id: 'pos', label: t('nav.pos'), icon: ShoppingCart, path: '/pos', module: 'pos' as ModuleName },
    { id: 'accounts', label: t('nav.accounts'), icon: Users, path: '/accounts', module: null },
    { id: 'accounting', label: t('nav.accounting'), icon: Calculator, path: '/accounting', module: 'accounting' as ModuleName },
    { id: 'reports', label: t('nav.reports'), icon: FileText, path: '/reports', module: 'reports' as ModuleName },
    { id: 'unsynced', label: t('nav.unsynced'), icon: CloudOff, path: '/unsynced', module: null },
    { id: 'settings', label: t('nav.settings'), icon: Settings, path: '/settings', module: 'settings' as ModuleName },
    { id: 'employees', label: t('nav.employees'), icon: UserCog, path: '/employees', module: 'users' as ModuleName }
  ];

  // Filter menu items based on module access
  const menuItems = allMenuItems.filter(item => {
    // Always show items without module requirement (home, accounts, unsynced)
    if (!item.module) return true;
    
    // Check module access for protected items
    return moduleAccess[item.module] === true;
  });

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
          'Alt+C': 'Accounts',
          'Alt+A': 'Accounting',
          'Alt+R': 'Reports',
          'Alt+S': 'Settings',
          'Alt+E': 'Employees'
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
          <div className="flex items-center justify-between mt-2">
            <div className="flex items-center text-sm text-gray-600">
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
            <NotificationCenter />
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
      <ErrorToastContainer />
    </div>
  );
}