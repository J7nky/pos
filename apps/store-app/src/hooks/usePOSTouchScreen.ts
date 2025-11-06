import { useState, useEffect } from 'react';

/**
 * Detects if the current device is a POS touch screen system
 * 
 * Detection criteria:
 * - Has touch support (maxTouchPoints > 0 or ontouchstart available)
 * - Screen size indicates POS terminal (typically 10-24 inch displays)
 * - Pointer events support touch
 * - Optional: Electron app (if running in Electron)
 */
export function usePOSTouchScreen() {
  const [isPOSTouchScreen, setIsPOSTouchScreen] = useState(false);

  useEffect(() => {
    if (typeof window === 'undefined') {
      return;
    }

    // Check for touch support
    const hasTouchSupport = 
      'ontouchstart' in window ||
      navigator.maxTouchPoints > 0 ||
      (navigator as any).msMaxTouchPoints > 0;

    // Check pointer capabilities
    const hasPointerSupport = 
      window.matchMedia('(pointer: coarse)').matches ||
      window.matchMedia('(pointer: fine)').matches;

    // Check screen size (POS systems typically have specific sizes)
    const screenWidth = window.screen.width;
    const screenHeight = window.screen.height;
    const screenDiagonal = Math.sqrt(screenWidth ** 2 + screenHeight ** 2) / 96; // Convert px to inches (assuming 96 DPI)
    
    // POS systems typically range from 10-24 inches diagonal
    // Common resolutions: 1024x768, 1280x800, 1366x768, 1920x1080
    const isPOSScreenSize = 
      screenDiagonal >= 10 && screenDiagonal <= 24 &&
      (
        (screenWidth >= 1024 && screenWidth <= 1920) ||
        (screenHeight >= 600 && screenHeight <= 1080)
      );

    // Check if running in Electron (common for POS systems)
    const isElectron = !!(window as any).electronAPI;

    // Check user agent for POS hardware indicators
    const userAgent = navigator.userAgent.toLowerCase();
    const hasPOSIndicators = 
      userAgent.includes('pos') ||
      userAgent.includes('terminal') ||
      userAgent.includes('kiosk') ||
      userAgent.includes('touchscreen');

    // Combine multiple signals for better detection
    // Primary: Touch support + appropriate screen size
    // Secondary: Electron app or POS indicators in user agent
    const detected = 
      (hasTouchSupport && isPOSScreenSize) ||
      (hasTouchSupport && isElectron) ||
      (hasTouchSupport && hasPOSIndicators) ||
      (hasPointerSupport && isPOSScreenSize && isElectron);

    setIsPOSTouchScreen(detected);
  }, []);

  return { isPOSTouchScreen };
}

/**
 * Utility function to check if device is a POS touch screen (non-hook version)
 * Useful for one-time checks outside React components
 */
export function isPOSTouchScreenDevice(): boolean {
  if (typeof window === 'undefined') {
    return false;
  }

  const hasTouchSupport = 
    'ontouchstart' in window ||
    navigator.maxTouchPoints > 0 ||
    (navigator as any).msMaxTouchPoints > 0;

  const screenWidth = window.screen.width;
  const screenHeight = window.screen.height;
  const screenDiagonal = Math.sqrt(screenWidth ** 2 + screenHeight ** 2) / 96;
  
  const isPOSScreenSize = 
    screenDiagonal >= 10 && screenDiagonal <= 24 &&
    (
      (screenWidth >= 1024 && screenWidth <= 1920) ||
      (screenHeight >= 600 && screenHeight <= 1080)
    );

  const isElectron = !!(window as any).electronAPI;

  const userAgent = navigator.userAgent.toLowerCase();
  const hasPOSIndicators = 
    userAgent.includes('pos') ||
    userAgent.includes('terminal') ||
    userAgent.includes('kiosk') ||
    userAgent.includes('touchscreen');

  return (
    (hasTouchSupport && isPOSScreenSize) ||
    (hasTouchSupport && isElectron) ||
    (hasTouchSupport && hasPOSIndicators)
  );
}

