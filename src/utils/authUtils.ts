// Enhanced authentication utilities
import { supabase } from '../lib/supabase';
import { User } from '@supabase/supabase-js';

export interface SessionInfo {
  isValid: boolean;
  user: User | null;
  expiresAt: Date | null;
  refreshToken: string | null;
  needsRefresh: boolean;
}

export class AuthUtils {
  // Check if current session is valid and not expired
  static async validateSession(): Promise<SessionInfo> {
    try {
      const { data: { session }, error } = await supabase.auth.getSession();
      
      if (error) {
        console.error('Session validation error:', error);
        return {
          isValid: false,
          user: null,
          expiresAt: null,
          refreshToken: null,
          needsRefresh: false
        };
      }

      if (!session) {
        return {
          isValid: false,
          user: null,
          expiresAt: null,
          refreshToken: null,
          needsRefresh: false
        };
      }

      const now = new Date();
      const expiresAt = new Date(session.expires_at! * 1000);
      const needsRefresh = expiresAt.getTime() - now.getTime() < 5 * 60 * 1000; // 5 minutes before expiry

      return {
        isValid: true,
        user: session.user,
        expiresAt,
        refreshToken: session.refresh_token,
        needsRefresh
      };
    } catch (error) {
      console.error('Session validation failed:', error);
      return {
        isValid: false,
        user: null,
        expiresAt: null,
        refreshToken: null,
        needsRefresh: false
      };
    }
  }

  // Refresh the session if needed
  static async refreshSessionIfNeeded(): Promise<boolean> {
    try {
      const sessionInfo = await this.validateSession();
      
      if (!sessionInfo.isValid || !sessionInfo.needsRefresh) {
        return sessionInfo.isValid;
      }

      console.log('🔄 Refreshing session...');
      const { data, error } = await supabase.auth.refreshSession();
      
      if (error) {
        console.error('Session refresh failed:', error);
        return false;
      }

      console.log('✅ Session refreshed successfully');
      return true;
    } catch (error) {
      console.error('Session refresh error:', error);
      return false;
    }
  }

  // Clear all authentication data
  static clearAuthData(): void {
    // Clear Supabase session
    supabase.auth.signOut();
    
    // Clear localStorage
    const keysToRemove = Object.keys(localStorage).filter(key => 
      key.startsWith('user_profile_') || 
      key === 'erp_user' ||
      key.includes('supabase') ||
      key.includes('auth') ||
      key.includes('session')
    );
    
    keysToRemove.forEach(key => {
      localStorage.removeItem(key);
      console.log(`🗑️ Cleared: ${key}`);
    });
  }

  // Check if user has required permissions
  static hasPermission(userRole: string, requiredRole: string): boolean {
    const roleHierarchy = {
      'cashier': 1,
      'manager': 2,
      'admin': 3
    };

    const userLevel = roleHierarchy[userRole as keyof typeof roleHierarchy] || 0;
    const requiredLevel = roleHierarchy[requiredRole as keyof typeof roleHierarchy] || 0;

    return userLevel >= requiredLevel;
  }

  // Get session expiry time in a readable format
  static getSessionTimeRemaining(expiresAt: Date | null): string {
    if (!expiresAt) return 'No session';
    
    const now = new Date();
    const diff = expiresAt.getTime() - now.getTime();
    
    if (diff <= 0) return 'Expired';
    
    const minutes = Math.floor(diff / (1000 * 60));
    const hours = Math.floor(minutes / 60);
    const days = Math.floor(hours / 24);
    
    if (days > 0) return `${days}d ${hours % 24}h remaining`;
    if (hours > 0) return `${hours}h ${minutes % 60}m remaining`;
    return `${minutes}m remaining`;
  }
}
