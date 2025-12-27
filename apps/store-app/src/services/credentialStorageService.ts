// Secure Credential Storage Service
// Uses Web Crypto API for encryption and bcrypt for password hashing

import { getDB } from '../lib/db';

interface StoredCredential {
  userId: string;
  email: string;
  encryptedPasswordHash: string; // Encrypted bcrypt hash
  iv: string; // Initialization vector for encryption
  salt: string; // Salt for key derivation
  createdAt: string;
  lastSyncedAt?: string;
  supabaseUserId?: string; // Link to Supabase user ID when synced
}

const CREDENTIAL_KEY_PREFIX = 'credential_key_';

/**
 * CredentialStorageService
 * 
 * Provides secure storage of user credentials with:
 * - bcrypt password hashing
 * - Web Crypto API encryption
 * - Secure key derivation
 */
export class CredentialStorageService {
  private static instance: CredentialStorageService;

  public static getInstance(): CredentialStorageService {
    if (!CredentialStorageService.instance) {
      CredentialStorageService.instance = new CredentialStorageService();
    }
    return CredentialStorageService.instance;
  }

  /**
   * Derive encryption key from user-specific data
   */
  private async deriveKey(userId: string, salt: Uint8Array): Promise<CryptoKey> {
    const keyMaterial = await crypto.subtle.importKey(
      'raw',
      new TextEncoder().encode(userId + CREDENTIAL_KEY_PREFIX),
      { name: 'PBKDF2' },
      false,
      ['deriveBits', 'deriveKey']
    );

    return crypto.subtle.deriveKey(
      {
        name: 'PBKDF2',
        salt: salt,
        iterations: 100000,
        hash: 'SHA-256',
      },
      keyMaterial,
      { name: 'AES-GCM', length: 256 },
      false,
      ['encrypt', 'decrypt']
    );
  }

  /**
   * Encrypt data using AES-GCM
   */
  private async encrypt(data: string, key: CryptoKey): Promise<{ encrypted: string; iv: string }> {
    const iv = crypto.getRandomValues(new Uint8Array(12));
    const encodedData = new TextEncoder().encode(data);

    const encrypted = await crypto.subtle.encrypt(
      { name: 'AES-GCM', iv: iv },
      key,
      encodedData
    );

    return {
      encrypted: this.arrayBufferToBase64(encrypted),
      iv: this.arrayBufferToBase64(iv),
    };
  }

  /**
   * Decrypt data using AES-GCM
   */
  private async decrypt(encrypted: string, iv: string, key: CryptoKey): Promise<string> {
    const encryptedArray = this.base64ToArrayBuffer(encrypted);
    const ivArray = this.base64ToArrayBuffer(iv);

    const decrypted = await crypto.subtle.decrypt(
      { name: 'AES-GCM', iv: ivArray },
      key,
      encryptedArray
    );

    return new TextDecoder().decode(decrypted);
  }

  /**
   * Store credentials securely
   * @param userId - User ID
   * @param email - User email
   * @param passwordHash - bcrypt hashed password (already hashed)
   * @param supabaseUserId - Optional Supabase user ID for syncing
   */
  async storeCredentials(
    userId: string,
    email: string,
    passwordHash: string,
    supabaseUserId?: string
  ): Promise<void> {
    try {
      // Generate salt for key derivation
      const salt = crypto.getRandomValues(new Uint8Array(16));
      const saltBase64 = this.arrayBufferToBase64(salt);

      // Derive encryption key
      const key = await this.deriveKey(userId, salt);

      // Encrypt the password hash
      const { encrypted, iv } = await this.encrypt(passwordHash, key);

      // Store in IndexedDB
      const credential: StoredCredential = {
        userId,
        email,
        encryptedPasswordHash: encrypted,
        iv,
        salt: saltBase64,
        createdAt: new Date().toISOString(),
        lastSyncedAt: supabaseUserId ? new Date().toISOString() : undefined,
        supabaseUserId,
      };

      await getDB().localCredentials.put(credential);
    } catch (error) {
      console.error('Error storing credentials:', error);
      throw new Error('Failed to store credentials securely');
    }
  }

  /**
   * Get stored credentials for a user
   */
  async getCredentials(userId: string): Promise<StoredCredential | null> {
    try {
      return await getDB().localCredentials.get(userId) || null;
    } catch (error) {
      console.error('Error getting credentials:', error);
      return null;
    }
  }

  /**
   * Get credentials by email
   */
  async getCredentialsByEmail(email: string): Promise<StoredCredential | null> {
    try {
      return await getDB().localCredentials.where('email').equals(email).first() || null;
    } catch (error) {
      console.error('Error getting credentials by email:', error);
      return null;
    }
  }

  /**
   * Get decrypted password hash from stored credentials
   * @param userId - User ID
   * @returns Decrypted password hash (bcrypt hash) if credentials exist, null otherwise
   */
  async getDecryptedPasswordHash(userId: string): Promise<string | null> {
    try {
      const credential = await this.getCredentials(userId);
      if (!credential) {
        return null;
      }

      // Decrypt the stored password hash
      const salt = this.base64ToArrayBuffer(credential.salt);
      const key = await this.deriveKey(userId, salt);
      const decryptedHash = await this.decrypt(
        credential.encryptedPasswordHash,
        credential.iv,
        key
      );

      return decryptedHash;
    } catch (error) {
      console.error('Error verifying password:', error);
      return null;
    }
  }

  /**
   * Update credentials (e.g., after password change or Supabase sync)
   */
  async updateCredentials(
    userId: string,
    updates: {
      passwordHash?: string;
      supabaseUserId?: string;
      lastSyncedAt?: string;
    }
  ): Promise<void> {
    try {
      const credential = await this.getCredentials(userId);
      if (!credential) {
        throw new Error('Credentials not found');
      }

      if (updates.passwordHash) {
        // Re-encrypt with new password hash
        const salt = this.base64ToArrayBuffer(credential.salt);
        const key = await this.deriveKey(userId, salt);
        const { encrypted, iv } = await this.encrypt(updates.passwordHash, key);

        credential.encryptedPasswordHash = encrypted;
        credential.iv = iv;
      }

      if (updates.supabaseUserId !== undefined) {
        credential.supabaseUserId = updates.supabaseUserId;
      }

      if (updates.lastSyncedAt !== undefined) {
        credential.lastSyncedAt = updates.lastSyncedAt;
      } else if (updates.supabaseUserId) {
        credential.lastSyncedAt = new Date().toISOString();
      }

      await getDB().localCredentials.put(credential);
    } catch (error) {
      console.error('Error updating credentials:', error);
      throw new Error('Failed to update credentials');
    }
  }

  /**
   * Clear credentials for a user
   */
  async clearCredentials(userId: string): Promise<void> {
    try {
      await getDB().localCredentials.delete(userId);
    } catch (error) {
      console.error('Error clearing credentials:', error);
    }
  }

  /**
   * Clear all credentials (use with caution)
   */
  async clearAllCredentials(): Promise<void> {
    try {
      await getDB().localCredentials.clear();
    } catch (error) {
      console.error('Error clearing all credentials:', error);
    }
  }

  /**
   * Check if credentials exist for a user
   */
  async hasCredentials(userId: string): Promise<boolean> {
    try {
      const credential = await this.getCredentials(userId);
      return credential !== null;
    } catch (error) {
      return false;
    }
  }

  /**
   * Get all credentials that need syncing (have no supabaseUserId)
   */
  async getUnsyncedCredentials(): Promise<StoredCredential[]> {
    try {
      return await getDB().localCredentials
        .where('supabaseUserId')
        .equals(undefined)
        .toArray();
    } catch (error) {
      console.error('Error getting unsynced credentials:', error);
      return [];
    }
  }

  /**
   * Get all saved users with their credentials
   * Returns array of users with id, email, and name for display
   */
  async getAllSavedUsers(): Promise<Array<{ id: string; email: string; name: string }>> {
    try {
      const savedUsers: Array<{ id: string; email: string; name: string }> = [];

      // Get all credentials from encrypted storage
      const credentials = await getDB().localCredentials.toArray();
      
      // Get all legacy passwords
      const legacyPasswords = await getDB().localPasswords.toArray();

      // Get all user IDs that have credentials
      const userIdsWithCredentials = new Set<string>();
      credentials.forEach(c => userIdsWithCredentials.add(c.userId));
      legacyPasswords.forEach(p => userIdsWithCredentials.add(p.userId));

      // Fetch user details from users table
      const users = await getDB().users
        .where('id')
        .anyOf(Array.from(userIdsWithCredentials))
        .toArray();

      // Map users to saved users format
      for (const user of users) {
        // Check if user has credentials (encrypted or legacy)
        const hasEncryptedCreds = credentials.some(c => c.userId === user.id);
        const hasLegacyCreds = legacyPasswords.some(p => p.userId === user.id);

        if (hasEncryptedCreds || hasLegacyCreds) {
          savedUsers.push({
            id: user.id,
            email: user.email,
            name: user.name,
          });
        }
      }

      return savedUsers;
    } catch (error) {
      console.error('Error getting all saved users:', error);
      return [];
    }
  }

  /**
   * Remove saved user credentials
   * Removes from both encrypted storage and legacy storage
   */
  async removeSavedUser(userId: string): Promise<void> {
    try {
      // Remove from encrypted storage
      await getDB().localCredentials.delete(userId);

      // Remove from legacy storage
      await getDB().localPasswords.delete(userId);

      // Clear cached profile data
      const profileKey = `user_profile_${userId}`;
      localStorage.removeItem(profileKey);

      console.log('✅ Removed saved credentials for user:', userId);
    } catch (error) {
      console.error('Error removing saved user:', error);
      throw new Error('Failed to remove saved user');
    }
  }

  // Utility methods for base64 conversion
  private arrayBufferToBase64(buffer: ArrayBuffer | Uint8Array): string {
    const bytes = buffer instanceof Uint8Array ? buffer : new Uint8Array(buffer);
    let binary = '';
    for (let i = 0; i < bytes.byteLength; i++) {
      binary += String.fromCharCode(bytes[i]);
    }
    return btoa(binary);
  }

  private base64ToArrayBuffer(base64: string): Uint8Array {
    const binary = atob(base64);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) {
      bytes[i] = binary.charCodeAt(i);
    }
    return bytes;
  }
}

export const credentialStorageService = CredentialStorageService.getInstance();

