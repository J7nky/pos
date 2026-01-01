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

    // Check for actual touch support (not just API presence)
    // Some browsers report maxTouchPoints > 0 even on non-touch devices
    // Require BOTH ontouchstart AND maxTouchPoints to reduce false positives
    const hasTouchSupport = 
      'ontouchstart' in window &&
      navigator.maxTouchPoints > 0;

    // Check pointer type - coarse pointer indicates touch, fine indicates mouse
    const hasCoarsePointer = window.matchMedia('(pointer: coarse)').matches;
    const hasFinePointer = window.matchMedia('(pointer: fine)').matches;
    
    // If only fine pointer (mouse) and no actual touch, it's a regular desktop/laptop
    if (hasFinePointer && !hasCoarsePointer && !hasTouchSupport) {
      setIsPOSTouchScreen(false);
      return;
    }

    // Check user agent to exclude regular laptops/desktops and mobile devices
    const userAgent = navigator.userAgent.toLowerCase();
    
    // Exclude mobile devices (phones/tablets) - they have native keyboards
    const isMobileDevice = 
      /android|webos|iphone|ipad|ipod|blackberry|iemobile|opera mini/i.test(userAgent) ||
      (window.screen.width < 768 || window.screen.height < 768); // Small screens are mobile
    
    if (isMobileDevice) {
      setIsPOSTouchScreen(false);
      return;
    }

    // Check user agent for POS hardware indicators FIRST
    const hasPOSIndicators = 
      userAgent.includes('pos') ||
      userAgent.includes('terminal') ||
      userAgent.includes('kiosk') ||
      userAgent.includes('touchscreen');

    // Check if running in Electron (common for POS systems)
    const isElectron = !!(window as any).electronAPI;

    // Exclude regular laptops/desktops (unless they have POS indicators or are Electron apps)
    // Check for common laptop/desktop indicators in user agent
    const isRegularDesktop = 
      /windows|macintosh|linux/i.test(userAgent) &&
      !hasPOSIndicators &&
      !isElectron; // Electron apps might be POS systems

    // Early return: If it's a regular desktop/laptop without POS indicators or Electron, exclude it
    // Even if it reports touch support (some browsers do this incorrectly)
    // Only exclude if it doesn't have coarse pointer (actual touch input)
    if (isRegularDesktop && !hasCoarsePointer) {
      setIsPOSTouchScreen(false);
      return;
    }

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

    // STRICT detection: Must have actual touch support AND be a POS device
    // Exclude regular desktops/laptops even if they somehow report touch support
    // Require coarse pointer (touch input) to be present
    const detected = 
      hasTouchSupport && // Must have actual touch (both ontouchstart AND maxTouchPoints)
      hasCoarsePointer && // Must have coarse pointer (indicates touch input, not mouse)
      !isRegularDesktop && // Must NOT be a regular desktop/laptop
      !isMobileDevice && // Must NOT be a mobile device
      (
        isPOSScreenSize || // POS screen size
        isElectron || // Electron app (common for POS)
        hasPOSIndicators // POS indicators in user agent
      );

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

  // Check for actual touch support
  // Require BOTH ontouchstart AND maxTouchPoints to reduce false positives
  const hasTouchSupport = 
    'ontouchstart' in window &&
    navigator.maxTouchPoints > 0;

  // Check pointer type
  const hasCoarsePointer = window.matchMedia('(pointer: coarse)').matches;
  const hasFinePointer = window.matchMedia('(pointer: fine)').matches;
  
  // If only fine pointer (mouse) and no actual touch, it's a regular desktop/laptop
  if (hasFinePointer && !hasCoarsePointer && !hasTouchSupport) {
    return false;
  }

  // Check user agent to exclude regular laptops/desktops and mobile devices
  const userAgent = navigator.userAgent.toLowerCase();
  
  // Exclude mobile devices
  const isMobileDevice = 
    /android|webos|iphone|ipad|ipod|blackberry|iemobile|opera mini/i.test(userAgent) ||
    (window.screen.width < 768 || window.screen.height < 768);
  
  if (isMobileDevice) {
    return false;
  }

  // Exclude regular laptops/desktops
  const isRegularDesktop = 
    /windows|macintosh|linux/i.test(userAgent) &&
    !userAgent.includes('pos') &&
    !userAgent.includes('terminal') &&
    !userAgent.includes('kiosk') &&
    !userAgent.includes('touchscreen');

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

  const hasPOSIndicators = 
    userAgent.includes('pos') ||
    userAgent.includes('terminal') ||
    userAgent.includes('kiosk') ||
    userAgent.includes('touchscreen');

  // STRICT detection: Must have actual touch support AND be a POS device
  // Require coarse pointer (touch input) to be present
  return (
    hasTouchSupport &&
    hasCoarsePointer &&
    !isRegularDesktop &&
    !isMobileDevice &&
    (
      isPOSScreenSize ||
      isElectron ||
      hasPOSIndicators
    )
  );
}

