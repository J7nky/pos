import { useEffect, useState, useCallback } from 'react';

export interface UpdateInfo {
  version: string;
  releaseDate?: string;
  releaseNotes?: string;
}

export interface UpdateProgress {
  percent: number;
  transferred?: number;
  total?: number;
  bytesPerSecond?: number;
}

export interface UpdateStatus {
  enabled: boolean;
  version: string;
  updateServer?: string;
  checking: boolean;
  available: boolean;
  downloading: boolean;
  downloaded: boolean;
  error: string | null;
  updateInfo: UpdateInfo | null;
  progress: UpdateProgress | null;
}

export function useAutoUpdate() {
  const [status, setStatus] = useState<UpdateStatus>({
    enabled: false,
    version: '0.0.0',
    checking: false,
    available: false,
    downloading: false,
    downloaded: false,
    error: null,
    updateInfo: null,
    progress: null,
  });

  // Check if running in Electron
  const isElectron = typeof window !== 'undefined' && window.electronAPI;

  // Initialize update status
  useEffect(() => {
    if (!isElectron) return;

    const initStatus = async () => {
      try {
        const versionResult = await window.electronAPI.getAppVersion();
        const statusResult = await window.electronAPI.getUpdateStatus();

        if (versionResult.success && statusResult.success) {
          setStatus(prev => ({
            ...prev,
            enabled: statusResult.enabled || false,
            version: versionResult.version || statusResult.version || '0.0.0',
            updateServer: statusResult.updateServer,
          }));
        }
      } catch (error) {
        console.error('Failed to initialize update status:', error);
      }
    };

    initStatus();
  }, [isElectron]);

  // Set up event listeners
  useEffect(() => {
    if (!isElectron) return;

    const cleanupFunctions: (() => void)[] = [];

    // Update checking
    const cleanupChecking = window.electronAPI.onUpdateChecking(() => {
      setStatus(prev => ({
        ...prev,
        checking: true,
        error: null,
      }));
    });
    cleanupFunctions.push(cleanupChecking);

    // Update available
    const cleanupAvailable = window.electronAPI.onUpdateAvailable((_event, info) => {
      setStatus(prev => ({
        ...prev,
        checking: false,
        available: true,
        downloading: true,
        updateInfo: {
          version: info.version,
          releaseDate: info.releaseDate,
          releaseNotes: info.releaseNotes,
        },
      }));
    });
    cleanupFunctions.push(cleanupAvailable);

    // Update not available
    const cleanupNotAvailable = window.electronAPI.onUpdateNotAvailable(() => {
      setStatus(prev => ({
        ...prev,
        checking: false,
        available: false,
      }));
    });
    cleanupFunctions.push(cleanupNotAvailable);

    // Update error
    const cleanupError = window.electronAPI.onUpdateError((_event, error) => {
      setStatus(prev => ({
        ...prev,
        checking: false,
        downloading: false,
        error: error.message || 'Unknown error',
      }));
    });
    cleanupFunctions.push(cleanupError);

    // Download progress
    const cleanupProgress = window.electronAPI.onUpdateDownloadProgress((_event, progress) => {
      setStatus(prev => ({
        ...prev,
        progress: {
          percent: progress.percent || 0,
          transferred: progress.transferred,
          total: progress.total,
          bytesPerSecond: progress.bytesPerSecond,
        },
      }));
    });
    cleanupFunctions.push(cleanupProgress);

    // Update downloaded
    const cleanupDownloaded = window.electronAPI.onUpdateDownloaded((_event, info) => {
      setStatus(prev => ({
        ...prev,
        downloading: false,
        downloaded: true,
        updateInfo: {
          version: info.version,
          releaseDate: info.releaseDate,
          releaseNotes: info.releaseNotes,
        },
      }));
    });
    cleanupFunctions.push(cleanupDownloaded);

    return () => {
      cleanupFunctions.forEach(cleanup => cleanup());
    };
  }, [isElectron]);

  // Manual check for updates
  const checkForUpdates = useCallback(async () => {
    if (!isElectron) {
      return { success: false, error: 'Not running in Electron' };
    }

    try {
      setStatus(prev => ({ ...prev, checking: true, error: null }));
      const result = await window.electronAPI.checkForUpdates();
      
      if (result.success) {
        if (result.updateInfo) {
          setStatus(prev => ({
            ...prev,
            checking: false,
            available: true,
            downloading: true,
            updateInfo: result.updateInfo || null,
          }));
        } else {
          setStatus(prev => ({
            ...prev,
            checking: false,
            available: false,
          }));
        }
      } else {
        setStatus(prev => ({
          ...prev,
          checking: false,
          error: result.error || 'Failed to check for updates',
        }));
      }

      return result;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      setStatus(prev => ({
        ...prev,
        checking: false,
        error: errorMessage,
      }));
      return { success: false, error: errorMessage };
    }
  }, [isElectron]);

  // Quit and install update
  const quitAndInstall = useCallback(async () => {
    if (!isElectron) {
      return { success: false, error: 'Not running in Electron' };
    }

    try {
      const result = await window.electronAPI.quitAndInstall();
      return result;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      return { success: false, error: errorMessage };
    }
  }, [isElectron]);

  return {
    status,
    checkForUpdates,
    quitAndInstall,
    isElectron,
  };
}


