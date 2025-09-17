import { useState, useEffect } from 'react';
import { useNetworkStatus } from '../hooks/useNetworkStatus';
import Toast from './common/Toast';

export function OfflineIndicator() {
  const { isOnline, justCameOnline } = useNetworkStatus();
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error'; visible: boolean }>({
    message: '',
    type: 'success',
    visible: false
  });

  // Debug logging
  useEffect(() => {
    console.log('🔍 OfflineIndicator: isOnline =', isOnline, 'justCameOnline =', justCameOnline);
  }, [isOnline, justCameOnline]);

  // Show toast when going offline
  useEffect(() => {
    if (!isOnline && !justCameOnline) {
      console.log('🔍 Showing offline toast');
      setToast({
        message: '🚫🌐 Offline mode',
        type: 'error',
        visible: true
      });
    }
  }, [isOnline, justCameOnline]);

  // Show toast when coming back online and hide offline toast
  useEffect(() => {
    if (justCameOnline) {
      console.log('🔍 Showing online toast');
      // Hide any existing offline toast immediately
      setToast(prev => ({ ...prev, visible: false }));
      
      // Show online toast after a brief delay
      setTimeout(() => {
        setToast({
          message: '🌐 Back online',
          type: 'success',
          visible: true
        });
      }, 100);
    }
  }, [justCameOnline]);

  // Hide toast when coming back online (before showing online toast)
  useEffect(() => {
    if (isOnline && !justCameOnline) {
      setToast(prev => ({ ...prev, visible: false }));
    }
  }, [isOnline, justCameOnline]);

  const hideToast = () => setToast(t => ({ ...t, visible: false }));

  return (
    <Toast
      message={toast.message}
      type={toast.type}
      visible={toast.visible}
      onClose={hideToast}
    />
  );
}
