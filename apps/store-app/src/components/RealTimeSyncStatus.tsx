import React, { useState, useEffect } from 'react';
import { realTimeSyncService } from '../services/realTimeSyncService';

interface RealTimeSyncStatusProps {
  className?: string;
}

export default function RealTimeSyncStatus({ className = '' }: RealTimeSyncStatusProps) {
  const [status, setStatus] = useState<{
    connected: boolean;
    subscriptions: number;
    deviceId: string;
  }>({
    connected: false,
    subscriptions: 0,
    deviceId: ''
  });

  useEffect(() => {
    // Get initial status
    setStatus(realTimeSyncService.getConnectionStatus());

    // Update status every 5 seconds
    const interval = setInterval(() => {
      setStatus(realTimeSyncService.getConnectionStatus());
    }, 5000);

    return () => clearInterval(interval);
  }, []);

  if (!status.connected) {
    return null; // Don't show anything if not connected
  }

  return (
    <div className={`flex items-center space-x-2 text-xs text-green-600 ${className}`}>
      <div className="flex items-center space-x-1">
        <div className="w-2 h-2 bg-green-500 rounded-full animate-pulse"></div>
        <span>Real-time</span>
      </div>
      <div className="text-gray-500">
        {status.subscriptions} channels
      </div>
    </div>
  );
}
