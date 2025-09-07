import React, { useEffect } from 'react';

interface ToastProps {
  message: string;
  type: 'success' | 'error';
  visible: boolean;
  onClose: () => void;
  onAction?: () => void;
  actionLabel?: string;
  progress?: number;
}

const Toast: React.FC<ToastProps> = ({ message, type, visible, onClose, onAction, actionLabel, progress }) => {
  useEffect(() => {
    if (visible && !onAction) {
      const timer = setTimeout(() => {
        onClose();
      }, 3000);
      return () => clearTimeout(timer);
    }
  }, [visible, onClose, onAction]);

  if (!visible) return null;

  return (
    <div
      className={`fixed top-6 right-6 z-50 px-6 py-3 rounded shadow-lg text-white transition-all duration-300 flex flex-col gap-2 ${
        type === 'success' ? 'bg-green-600' : 'bg-red-600'
      }`}
      role="alert"
    >
      <div className="flex items-center gap-3">
        <span>{message}</span>
        {onAction && actionLabel && (
          <button
            onClick={() => {
              onAction();
              onClose();
            }}
            className="bg-white text-gray-800 px-3 py-1 rounded text-sm font-medium hover:bg-gray-100 transition-colors"
          >
            {actionLabel}
          </button>
        )}
      </div>
      {progress !== undefined && (
        <div className="w-full bg-white/20 rounded-full h-1.5 overflow-hidden">
          <div
            className="h-full bg-white/60 rounded-full transition-all duration-75 ease-linear"
            style={{ width: `${progress}%` }}
          />
        </div>
      )}
    </div>
  );
};

export default Toast; 