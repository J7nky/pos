// Device Fingerprinting Utility
// Generates unique device identifiers for license binding

import { DeviceFingerprint } from '../types/subscription';

export class DeviceFingerprintGenerator {
  private static instance: DeviceFingerprintGenerator;
  
  private constructor() {}
  
  public static getInstance(): DeviceFingerprintGenerator {
    if (!DeviceFingerprintGenerator.instance) {
      DeviceFingerprintGenerator.instance = new DeviceFingerprintGenerator();
    }
    return DeviceFingerprintGenerator.instance;
  }
  
  /**
   * Generate a comprehensive device fingerprint
   */
  public async generateFingerprint(): Promise<DeviceFingerprint> {
    const components = await this.collectFingerprintComponents();
    const fingerprint_hash = await this.hashComponents(components);
    
    return {
      ...components,
      fingerprint_hash,
      created_at: new Date().toISOString()
    };
  }
  
  /**
   * Collect device-specific components
   */
  private async collectFingerprintComponents(): Promise<Omit<DeviceFingerprint, 'fingerprint_hash' | 'created_at'>> {
    return {
      // Hardware information
      cpu_cores: navigator.hardwareConcurrency || 1,
      total_memory: (navigator as any).deviceMemory ? (navigator as any).deviceMemory * 1024 : 0,
      screen_resolution: `${screen.width}x${screen.height}x${screen.colorDepth}`,
      timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
      
      // Browser/system information
      user_agent: navigator.userAgent,
      platform: navigator.platform,
      language: navigator.language,
    };
  }
  
  /**
   * Hash fingerprint components to create unique identifier
   */
  private async hashComponents(components: Omit<DeviceFingerprint, 'fingerprint_hash' | 'created_at'>): Promise<string> {
    // Create a stable string from components
    const componentString = [
      components.cpu_cores,
      components.total_memory,
      components.screen_resolution,
      components.timezone,
      components.user_agent,
      components.platform,
      components.language
    ].join('|');
    
    // Use Web Crypto API for hashing
    if (crypto && crypto.subtle) {
      try {
        const encoder = new TextEncoder();
        const data = encoder.encode(componentString);
        const hashBuffer = await crypto.subtle.digest('SHA-256', data);
        const hashArray = Array.from(new Uint8Array(hashBuffer));
        return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
      } catch (error) {
        console.warn('Web Crypto API not available, using fallback hash');
      }
    }
    
    // Fallback: Simple hash function
    return this.simpleHash(componentString);
  }
  
  /**
   * Simple hash function fallback
   */
  private simpleHash(str: string): string {
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
      const char = str.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash; // Convert to 32-bit integer
    }
    return Math.abs(hash).toString(16);
  }
  
  /**
   * Verify if current device matches stored fingerprint
   */
  public async verifyFingerprint(storedFingerprint: string): Promise<{ matches: boolean; similarity: number }> {
    const currentFingerprint = await this.generateFingerprint();
    const matches = currentFingerprint.fingerprint_hash === storedFingerprint;
    
    // Calculate similarity score for partial matches
    const similarity = this.calculateSimilarity(currentFingerprint.fingerprint_hash, storedFingerprint);
    
    return { matches, similarity };
  }
  
  /**
   * Calculate similarity between two fingerprints (0-1 scale)
   */
  private calculateSimilarity(fp1: string, fp2: string): number {
    if (fp1 === fp2) return 1.0;
    
    const minLength = Math.min(fp1.length, fp2.length);
    let matches = 0;
    
    for (let i = 0; i < minLength; i++) {
      if (fp1[i] === fp2[i]) matches++;
    }
    
    return matches / Math.max(fp1.length, fp2.length);
  }
  
  /**
   * Get a human-readable device description
   */
  public async getDeviceDescription(): Promise<string> {
    const components = await this.collectFingerprintComponents();
    
    const browser = this.getBrowserName(components.user_agent);
    const os = this.getOperatingSystem(components.platform, components.user_agent);
    
    return `${browser} on ${os} (${components.screen_resolution})`;
  }
  
  /**
   * Extract browser name from user agent
   */
  private getBrowserName(userAgent: string): string {
    if (userAgent.includes('Chrome')) return 'Chrome';
    if (userAgent.includes('Firefox')) return 'Firefox';
    if (userAgent.includes('Safari')) return 'Safari';
    if (userAgent.includes('Edge')) return 'Edge';
    return 'Unknown Browser';
  }
  
  /**
   * Extract operating system from platform and user agent
   */
  private getOperatingSystem(platform: string, userAgent: string): string {
    if (platform.includes('Win') || userAgent.includes('Windows')) return 'Windows';
    if (platform.includes('Mac') || userAgent.includes('Mac')) return 'macOS';
    if (platform.includes('Linux') || userAgent.includes('Linux')) return 'Linux';
    if (userAgent.includes('Android')) return 'Android';
    if (userAgent.includes('iOS')) return 'iOS';
    return 'Unknown OS';
  }
}
