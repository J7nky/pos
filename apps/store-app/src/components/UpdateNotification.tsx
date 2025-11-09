import { useEffect, useState } from 'react';
import { useAutoUpdate } from '../hooks/useAutoUpdate';
import { Download, CheckCircle, AlertCircle, X, RefreshCw } from 'lucide-react';

export default function UpdateNotification() {
  const { status, checkForUpdates, quitAndInstall, isElectron } = useAutoUpdate();
  const [isVisible, setIsVisible] = useState(false);
  const [dismissed, setDismissed] = useState(false);

  // Show notification when update is downloaded
  useEffect(() => {
    if (status.downloaded && !dismissed) {
      setIsVisible(true);
    }
  }, [status.downloaded, dismissed]);

  // Auto-hide after 10 seconds if user doesn't interact
  useEffect(() => {
    if (isVisible && status.downloaded) {
      const timer = setTimeout(() => {
        setIsVisible(false);
      }, 10000);
      return () => clearTimeout(timer);
    }
  }, [isVisible, status.downloaded]);

  if (!isElectron || !status.enabled) {
    return null;
  }

  const handleDismiss = () => {
    setIsVisible(false);
    setDismissed(true);
  };

  const handleRestart = async () => {
    await quitAndInstall();
  };

  const handleCheckUpdates = async () => {
    await checkForUpdates();
  };

  // Show update downloaded notification
  if (status.downloaded && isVisible) {
    return (
      <div className="fixed bottom-4 right-4 z-50 max-w-md">
        <div className="bg-white border border-gray-300 rounded-lg shadow-lg p-4">
          <div className="flex items-start gap-3">
            <div className="flex-shrink-0">
              <CheckCircle className="w-5 h-5 text-green-600" />
            </div>
            <div className="flex-1 min-w-0">
              <h3 className="text-sm font-semibold text-gray-900">
                Update Ready
              </h3>
              <p className="text-sm text-gray-600 mt-1">
                Version {status.updateInfo?.version} has been downloaded and will be installed when you restart the app.
              </p>
              <div className="flex gap-2 mt-3">
                <button
                  onClick={handleRestart}
                  className="px-3 py-1.5 text-xs font-medium text-white bg-blue-600 rounded hover:bg-blue-700 transition-colors"
                >
                  Restart Now
                </button>
                <button
                  onClick={handleDismiss}
                  className="px-3 py-1.5 text-xs font-medium text-gray-700 bg-gray-100 rounded hover:bg-gray-200 transition-colors"
                >
                  Later
                </button>
              </div>
            </div>
            <button
              onClick={handleDismiss}
              className="flex-shrink-0 text-gray-400 hover:text-gray-600 transition-colors"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>
      </div>
    );
  }

  // Show download progress (optional, can be hidden if too intrusive)
  if (status.downloading && status.progress && status.progress.percent < 100) {
    return (
      <div className="fixed bottom-4 right-4 z-50 max-w-xs">
        <div className="bg-white border border-gray-300 rounded-lg shadow-lg p-3">
          <div className="flex items-center gap-2">
            <Download className="w-4 h-4 text-blue-600 animate-pulse" />
            <div className="flex-1 min-w-0">
              <p className="text-xs font-medium text-gray-900">
                Downloading update...
              </p>
              <div className="mt-1.5 w-full bg-gray-200 rounded-full h-1.5">
                <div
                  className="bg-blue-600 h-1.5 rounded-full transition-all duration-300"
                  style={{ width: `${status.progress.percent}%` }}
                />
              </div>
              <p className="text-xs text-gray-500 mt-1">
                {status.progress.percent}%
              </p>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // Show error notification (only if significant)
  if (status.error && status.error !== 'Updates are disabled in development mode') {
    return (
      <div className="fixed bottom-4 right-4 z-50 max-w-xs">
        <div className="bg-white border border-red-300 rounded-lg shadow-lg p-3">
          <div className="flex items-start gap-2">
            <AlertCircle className="w-4 h-4 text-red-600 flex-shrink-0 mt-0.5" />
            <div className="flex-1 min-w-0">
              <p className="text-xs font-medium text-red-900">
                Update Error
              </p>
              <p className="text-xs text-red-700 mt-1">
                {status.error}
              </p>
              <button
                onClick={handleCheckUpdates}
                className="mt-2 text-xs text-red-600 hover:text-red-800 flex items-center gap-1"
              >
                <RefreshCw className="w-3 h-3" />
                Retry
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return null;
}


