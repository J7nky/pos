import { useEffect, useState, useRef } from 'react';

export function useNetworkStatus() {
  const [isOnline, setIsOnline] = useState(navigator.onLine);
  const [justCameOnline, setJustCameOnline] = useState(false);
  const previousOnlineStatus = useRef(navigator.onLine);

  useEffect(() => {
    const goOnline = () => {
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
      setIsOnline(false);
      previousOnlineStatus.current = false;
      setJustCameOnline(false);
    };
    
    window.addEventListener('online', goOnline);
    window.addEventListener('offline', goOffline);
    
    return () => {
      window.removeEventListener('online', goOnline);
      window.removeEventListener('offline', goOffline);
    };
  }, []);

  return { 
    isOnline, 
    wasOffline: !isOnline,
    justCameOnline 
  };
} 