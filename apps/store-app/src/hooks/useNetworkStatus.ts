import { useEffect, useState, useRef } from 'react';

/**
 * Actually tests network connectivity by attempting to fetch a resource
 * This is more reliable than navigator.onLine which can be inaccurate
 */
async function testNetworkConnectivity(): Promise<boolean> {
  try {
    // Try to fetch a small resource with cache-busting
    // Using a small image or a known endpoint that should respond quickly
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 3000); // 3 second timeout
    
    const response = await fetch('https://www.google.com/favicon.ico?' + Date.now(), {
      method: 'HEAD',
      mode: 'no-cors',
      signal: controller.signal,
      cache: 'no-store'
    });
    
    clearTimeout(timeoutId);
    // In no-cors mode, we can't read the response, but if it doesn't throw, we're online
    return true;
  } catch (error) {
    // Network error - we're offline
    return false;
  }
}

export function useNetworkStatus() {
  const [isOnline, setIsOnline] = useState(navigator.onLine);
  const [justCameOnline, setJustCameOnline] = useState(false);
  const previousOnlineStatus = useRef(navigator.onLine);
  const checkInProgressRef = useRef(false);

  useEffect(() => {
    const goOnline = () => {
      console.log('🌐 Browser online event triggered - updating state');
      setIsOnline(true);
      // Detect transition from offline to online
      if (!previousOnlineStatus.current) {
        setJustCameOnline(true);
        // Reset the flag after a short delay
        setTimeout(() => setJustCameOnline(false), 3000);
      }
      previousOnlineStatus.current = true;
    };
    
    const goOffline = () => {
      console.log('📴 Browser offline event triggered - updating state');
      setIsOnline(false);
      previousOnlineStatus.current = false;
      setJustCameOnline(false);
    };
    
    // Periodic check to ensure status is accurate (browser events can be unreliable)
    const checkNetworkStatus = async () => {
      // Prevent multiple simultaneous checks
      if (checkInProgressRef.current) return;
      
      checkInProgressRef.current = true;
      const browserStatus = navigator.onLine;
      
      // If browser says we're offline, trust it immediately
      if (!browserStatus) {
        setIsOnline(prevIsOnline => {
          if (prevIsOnline !== false) {
            console.log('🔄 Browser reports offline, updating state');
            previousOnlineStatus.current = false;
            setJustCameOnline(false);
            return false;
          }
          return prevIsOnline;
        });
        checkInProgressRef.current = false;
        return;
      }
      
      // If browser says we're online, verify with actual network test
      const actualStatus = await testNetworkConnectivity();
      
      setIsOnline(prevIsOnline => {
        if (actualStatus !== prevIsOnline) {
          console.log('🔄 Network connectivity test result:', { was: prevIsOnline, now: actualStatus });
          if (actualStatus) {
            // Detect transition from offline to online
            if (!previousOnlineStatus.current) {
              setJustCameOnline(true);
              setTimeout(() => setJustCameOnline(false), 3000);
            }
            previousOnlineStatus.current = true;
          } else {
            previousOnlineStatus.current = false;
            setJustCameOnline(false);
          }
          return actualStatus;
        }
        return prevIsOnline;
      });
      
      checkInProgressRef.current = false;
    };
    
    window.addEventListener('online', goOnline);
    window.addEventListener('offline', goOffline);
    
    // Initial check
    checkNetworkStatus();
    
    // Check network status every 3 seconds to catch any missed events
    const statusCheckInterval = setInterval(checkNetworkStatus, 3000);
    
    return () => {
      window.removeEventListener('online', goOnline);
      window.removeEventListener('offline', goOffline);
      clearInterval(statusCheckInterval);
    };
  }, []);

  return { 
    isOnline, 
    wasOffline: !isOnline,
    justCameOnline 
  };
} 