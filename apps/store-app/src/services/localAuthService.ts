// Local-Only Authentication Service
// For Starter tier - No Supabase, purely local authentication

import { getDB } from '../lib/db';
import { User } from '../types';
import { createId } from '@paralleldrive/cuid2';
import bcrypt from 'bcryptjs'; // You'll need to install: npm install bcryptjs

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
    const storeId = createId();
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
    const userId = createId();
    const user: User = {
      id: userId,
      email: email,
      name: name,
      role: 'admin',
      store_id: storeId,
      created_at: now,
    };

    await getDB().users.add(user);

    // Store password hash separately (not in user table)
    await getDB().localPasswords.add({
      userId: userId,
      passwordHash: passwordHash,
    });

    // Create session
    this.createSession(user);

    return user;
  }

  /**
   * Sign in - Authenticate with local credentials
   */
  async signIn(email: string, password: string): Promise<User> {
    // Find user by email
    const user = await getDB().users.where('email').equals(email).first();
    if (!user) {
      throw new Error('Invalid email or password');
    }

    // Get password hash
    const passwordRecord = await getDB().localPasswords.get(user.id);
    if (!passwordRecord) {
      throw new Error('Invalid email or password');
    }

    // Verify password
    const isValid = await bcrypt.compare(password, passwordRecord.passwordHash);
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
    // Get password hash
    const passwordRecord = await getDB().localPasswords.get(userId);
    if (!passwordRecord) {
      throw new Error('User not found');
    }

    // Verify current password
    const isValid = await bcrypt.compare(currentPassword, passwordRecord.passwordHash);
    if (!isValid) {
      throw new Error('Current password is incorrect');
    }

    // Hash new password
    const newPasswordHash = await bcrypt.hash(newPassword, 10);

    // Update password
    await getDB().localPasswords.update(userId, {
      passwordHash: newPasswordHash,
    });
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
