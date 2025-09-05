import React, { useEffect } from 'react';

interface ToastProps {
  message: string;
  type: 'success' | 'error';
  visible: boolean;
  onClose: () => void;
  // Optional Undo button support
  onAction?: () => void;
  actionLabel?: string;
}

const Toast: React.FC<ToastProps> = ({ message, type, visible, onClose, onAction, actionLabel }) => {
  useEffect(() => {
    if (visible) {
      const timer = setTimeout(() => {
        onClose();
      }, 3000);
      return () => clearTimeout(timer);
    }
  }, [visible, onClose]);

  if (!visible) return null;

  return (
    <div
      className={`fixed top-6 right-6 z-50 px-6 py-3 rounded shadow-lg text-white transition-all duration-300 ${
        type === 'success' ? 'bg-green-600' : 'bg-red-600'
      }`}
      role="alert"
    >
      <span>{message}</span>
      {onAction && actionLabel && (
        <button
          onClick={onAction}
          className="ml-4 px-3 py-1 bg-white text-black rounded hover:bg-gray-200 transition"
          style={{ fontWeight: 600 }}
        >
          {actionLabel}
        </button>
      )}
    </div>
  );
};

export default Toast; 