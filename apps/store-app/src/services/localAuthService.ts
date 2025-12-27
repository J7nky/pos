// Local Authentication Service
// Supports both offline-only and hybrid (offline + Supabase sync) authentication

import { getDB } from '../lib/db';
import { User, Employee } from '../types';
import { v4 as uuidv4 } from 'uuid';
import * as bcrypt from 'bcryptjs';
import { credentialStorageService } from './credentialStorageService';
import { supabase } from '../lib/supabase';

interface LocalAuthSession {
  userId: string;
  email: string;
  role: 'admin' | 'manager' | 'cashier';
  storeId: string;
  expiresAt: number;
}

const SESSION_DURATION = 24 * 60 * 60 * 1000; // 24 hours
const SESSION_KEY = 'pos_local_session';

export class LocalAuthService {
  private static instance: LocalAuthService;

  public static getInstance(): LocalAuthService {
    if (!LocalAuthService.instance) {
      LocalAuthService.instance = new LocalAuthService();
    }
    return LocalAuthService.instance;
  }

  /**
   * Sign up - Create first user (admin) for local-only mode
   */
  async signUp(email: string, password: string, name: string, storeName: string): Promise<User> {
    // Check if any users exist
    const existingUsers = await getDB().users.toArray();
    if (existingUsers.length > 0) {
      throw new Error('Local account already exists. Please sign in.');
    }

    // Hash password
    const passwordHash = await bcrypt.hash(password, 10);

    // Create store
    const storeId = uuidv4();
    const now = new Date().toISOString();
    
    await getDB().stores.add({
      id: storeId,
      store_id: storeId,
      name: storeName,
      address: '',
      phone: '',
      email: email,
      preferred_currency: 'USD',
      preferred_language: 'en',
      preferred_commission_rate: 10,
      exchange_rate: 89500,
      low_stock_alert: true,
      created_at: now,
      updated_at: now,
      _synced: false,
    });

    // Create admin user
    const userId = uuidv4();
    const user: Employee = {
      id: userId,
      email: email,
      name: name,
      role: 'admin',
      store_id: storeId,
      branch_id: null,
      created_at: now,
      updated_at: now,
      _synced: false,
    };

    await getDB().users.add(user);

    // Store password hash in encrypted storage
    try {
      await credentialStorageService.storeCredentials(
        userId,
        email,
        passwordHash
      );
    } catch (error) {
      console.warn('Failed to store encrypted credentials, falling back to legacy storage:', error);
      // Fallback to legacy storage
      await getDB().localPasswords.add({
        userId: userId,
        passwordHash: passwordHash,
      });
    }

    // Create session
    this.createSession(user);

    return user;
  }

  /**
   * Sign in - Authenticate with local credentials
   * Supports both encrypted credentials and legacy localPasswords
   */
  async signIn(email: string, password: string): Promise<User> {
    // Find user by email
    const user = await getDB().users.where('email').equals(email).first();
    if (!user) {
      throw new Error('Invalid email or password');
    }

    let isValid = false;

    // Try encrypted credentials first
    const credential = await credentialStorageService.getCredentials(user.id);
    if (credential) {
      const decryptedHash = await credentialStorageService.getDecryptedPasswordHash(user.id);
      if (decryptedHash) {
        isValid = await bcrypt.compare(password, decryptedHash);
      }
    }

    // Fallback to legacy localPasswords if encrypted credentials don't exist
    if (!isValid) {
      const passwordRecord = await getDB().localPasswords.get(user.id);
      if (passwordRecord) {
        isValid = await bcrypt.compare(password, passwordRecord.passwordHash);
        
        // Migrate to encrypted storage if password is valid
        if (isValid) {
          try {
            await credentialStorageService.storeCredentials(
              user.id,
              user.email,
              passwordRecord.passwordHash
            );
            console.log('✅ Migrated credentials to encrypted storage');
          } catch (error) {
            console.warn('Failed to migrate credentials to encrypted storage:', error);
          }
        }
      }
    }

    if (!isValid) {
      throw new Error('Invalid email or password');
    }

    // Create session
    this.createSession(user);

    return user;
  }

  /**
   * Sign out - Clear local session
   */
  signOut(): void {
    localStorage.removeItem(SESSION_KEY);
  }

  /**
   * Get current session
   */
  getSession(): LocalAuthSession | null {
    const sessionJson = localStorage.getItem(SESSION_KEY);
    if (!sessionJson) return null;

    try {
      const session: LocalAuthSession = JSON.parse(sessionJson);
      
      // Check if session expired
      if (Date.now() > session.expiresAt) {
        this.signOut();
        return null;
      }

      return session;
    } catch {
      return null;
    }
  }

  /**
   * Get current user
   */
  async getCurrentUser(): Promise<User | null> {
    const session = this.getSession();
    if (!session) return null;

    const user = await getDB().users.get(session.userId);
    return user || null;
  }

  /**
   * Create session
   */
  private createSession(user: User): void {
    const session: LocalAuthSession = {
      userId: user.id,
      email: user.email,
      role: user.role,
      storeId: user.store_id,
      expiresAt: Date.now() + SESSION_DURATION,
    };

    localStorage.setItem(SESSION_KEY, JSON.stringify(session));
  }

  /**
   * Change password
   */
  async changePassword(userId: string, currentPassword: string, newPassword: string): Promise<void> {
    // Verify current password first
    const user = await getDB().users.get(userId);
    if (!user) {
      throw new Error('User not found');
    }

    // Try to verify with encrypted credentials
    let isValid = false;
    const credential = await credentialStorageService.getCredentials(userId);
    if (credential) {
      const decryptedHash = await credentialStorageService.getDecryptedPasswordHash(userId);
      if (decryptedHash) {
        isValid = await bcrypt.compare(currentPassword, decryptedHash);
      }
    }

    // Fallback to legacy localPasswords
    if (!isValid) {
      const passwordRecord = await getDB().localPasswords.get(userId);
      if (passwordRecord) {
        isValid = await bcrypt.compare(currentPassword, passwordRecord.passwordHash);
      }
    }

    if (!isValid) {
      throw new Error('Current password is incorrect');
    }

    // Hash new password
    const newPasswordHash = await bcrypt.hash(newPassword, 10);

    // Update in encrypted storage
    try {
      await credentialStorageService.updateCredentials(userId, {
        passwordHash: newPasswordHash,
      });
    } catch (error) {
      console.warn('Failed to update encrypted credentials, falling back to legacy storage:', error);
      // Fallback to legacy storage
      await getDB().localPasswords.update(userId, {
        passwordHash: newPasswordHash,
      });
    }
  }

  /**
   * Store credentials after successful Supabase authentication
   * This allows offline access after initial online authentication
   */
  async storeCredentialsFromSupabase(
    userId: string,
    email: string,
    password: string,
    supabaseUserId: string
  ): Promise<void> {
    try {
      // Hash password
      const passwordHash = await bcrypt.hash(password, 10);

      // Store in encrypted storage with Supabase user ID
      await credentialStorageService.storeCredentials(
        userId,
        email,
        passwordHash,
        supabaseUserId
      );

      console.log('✅ Stored credentials for offline access');
    } catch (error) {
      console.error('Error storing credentials from Supabase:', error);
      throw error;
    }
  }

  /**
   * Sync local credentials with Supabase when online
   * Validates that stored credentials match Supabase authentication
   */
  async syncWithSupabase(userId: string, email: string, password: string): Promise<boolean> {
    try {
      if (!navigator.onLine) {
        return false;
      }

      // Try to authenticate with Supabase
      const { data, error } = await supabase.auth.signInWithPassword({ email, password });

      if (error || !data.user) {
        console.warn('Supabase sync failed:', error?.message);
        return false;
      }

      // Update credentials with Supabase user ID
      const credential = await credentialStorageService.getCredentials(userId);
      if (credential) {
        await credentialStorageService.updateCredentials(userId, {
          supabaseUserId: data.user.id,
          lastSyncedAt: new Date().toISOString(),
        });
      } else {
        // Store new credentials if they don't exist
        const passwordHash = await bcrypt.hash(password, 10);
        await credentialStorageService.storeCredentials(
          userId,
          email,
          passwordHash,
          data.user.id
        );
      }

      console.log('✅ Synced credentials with Supabase');
      return true;
    } catch (error) {
      console.error('Error syncing with Supabase:', error);
      return false;
    }
  }

  /**
   * Get user profile data for offline access
   */
  async getUserProfile(userId: string): Promise<any | null> {
    try {
      const user = await getDB().users.get(userId);
      if (!user) return null;

      // Try to get cached profile from localStorage
      const cachedProfileKey = `user_profile_${userId}`;
      const cachedProfile = localStorage.getItem(cachedProfileKey);
      if (cachedProfile) {
        try {
          return JSON.parse(cachedProfile);
        } catch {
          // Invalid cache, continue to build from user data
        }
      }

      // Build profile from user data
      const store = await getDB().stores.get(user.store_id);
      return {
        id: user.id,
        email: user.email,
        name: user.name,
        role: user.role,
        store_id: user.store_id,
        branch_id: user.branch_id || null,
        stores: store ? {
          id: store.id,
          name: store.name,
          address: store.address || '',
          phone: store.phone || '',
          email: store.email || '',
          preferred_currency: store.preferred_currency || 'USD',
          preferred_language: store.preferred_language || 'en',
          preferred_commission_rate: store.preferred_commission_rate || 10,
          exchange_rate: store.exchange_rate || 89500,
          low_stock_alert: store.low_stock_alert || false,
        } : undefined,
      };
    } catch (error) {
      console.error('Error getting user profile:', error);
      return null;
    }
  }

  /**
   * Check if local-only mode is initialized
   */
  async isInitialized(): Promise<boolean> {
    const users = await getDB().users.toArray();
    return users.length > 0;
  }
}

export const localAuthService = LocalAuthService.getInstance();
