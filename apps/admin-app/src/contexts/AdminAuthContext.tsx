import { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import { supabase } from '../lib/supabase';

interface AdminUser {
  id: string;
  email: string;
  name: string;
  role: 'super_admin' | 'admin';
  stores?: string[]; // Array of store IDs they can manage
}

interface AdminAuthContextType {
  user: AdminUser | null;
  loading: boolean;
  isAuthenticated: boolean;
  signIn: (email: string, password: string) => Promise<{ success: boolean; error?: string }>;
  signOut: () => Promise<void>;
}

const AdminAuthContext = createContext<AdminAuthContextType | undefined>(undefined);

export function AdminAuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AdminUser | null>(null);
  const [loading, setLoading] = useState(true);

  // Helper function to logout (defined early so it can be used by loadAdminUser)
  const performSignOut = async () => {
    await supabase.auth.signOut();
    setUser(null);
  };

  const loadAdminUser = async (userId: string): Promise<boolean> => {
    try {
      // Only allow super_admin users to access admin app
      // Super admins have role='super_admin' AND store_id = NULL
      const { data, error } = await supabase
        .from('users')
        .select('id, email, name, role, store_id')
        .eq('id', userId)
        .eq('role', 'super_admin')
        .is('store_id', null)
        .maybeSingle();

      if (error) {
        console.error('Error loading admin user from users table:', error);
        setUser(null);
        setLoading(false);
        // Auto-logout if there's an error
        await performSignOut();
        return false;
      }

      if (!data) {
        // User not found or not a super_admin
        console.warn('User is not a super_admin - auto-logging out');
        setUser(null);
        setLoading(false);
        // Auto-logout non-super_admin users
        await performSignOut();
        return false;
      }

      // Verify it's actually a super_admin (double check)
      const isSuperAdmin = data.role === 'super_admin' && data.store_id === null;
      
      if (!isSuperAdmin) {
        console.warn('User does not have super_admin privileges - auto-logging out');
        setUser(null);
        setLoading(false);
        // Auto-logout if not super_admin
        await performSignOut();
        return false;
      }

      setUser({
        id: data.id,
        email: data.email,
        name: data.name,
        role: 'super_admin',
        stores: [], // Super admins have access to all stores
      });
      return true;
    } catch (error) {
      console.error('Error loading admin user:', error);
      setUser(null);
      // Auto-logout on error
      await performSignOut();
      return false;
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    // Check for existing session
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session?.user) {
        loadAdminUser(session.user.id);
      } else {
        setLoading(false);
      }
    });

    // Listen for auth changes
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      if (session?.user) {
        loadAdminUser(session.user.id);
      } else {
        setUser(null);
        setLoading(false);
      }
    });

    return () => subscription.unsubscribe();
  }, []);

  const signIn = async (email: string, password: string) => {
    try {
      const { data, error } = await supabase.auth.signInWithPassword({
        email,
        password,
      });

      if (error) {
        return { success: false, error: error.message };
      }

      if (data.user) {
        // Load user and check if they're super_admin
        const isSuperAdmin = await loadAdminUser(data.user.id);
        
        // If user is not a super_admin, loadAdminUser will have already logged them out
        if (!isSuperAdmin) {
          return { 
            success: false, 
            error: 'Access denied. Only super administrators can access this dashboard.' 
          };
        }

        return { success: true };
      }

      return { success: false, error: 'Failed to sign in' };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  };

  const signOut = async () => {
    await performSignOut();
  };

  return (
    <AdminAuthContext.Provider
      value={{
        user,
        loading,
        isAuthenticated: !!user,
        signIn,
        signOut,
      }}
    >
      {children}
    </AdminAuthContext.Provider>
  );
}

export function useAdminAuth() {
  const context = useContext(AdminAuthContext);
  if (!context) {
    throw new Error('useAdminAuth must be used within AdminAuthProvider');
  }
  return context;
}

