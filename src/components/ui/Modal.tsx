import React from "react";
import { X } from "lucide-react";

interface ModalProps {
  isOpen: boolean;
  onClose: () => void;
  title?: string;
  subtitle?: string;
  maxWidth?: "sm" | "md" | "lg" | "xl" | "2xl" | "4xl";
  headerBg?: string; // Tailwind gradient or color
  children: React.ReactNode;
  footer?: React.ReactNode; // Optional footer (for buttons)
}

const Modal: React.FC<ModalProps> = ({
  isOpen,
  onClose,
  title,
  subtitle,
  maxWidth = "lg",
  headerBg = "bg-white",
  children,
  footer,
}) => {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
      <div className={`bg-white rounded-lg w-full max-w-${maxWidth} max-h-[90vh] overflow-y-auto`}>
        {/* Header */}
        {(title || subtitle) && (
          <div className={`p-6 border-b ${headerBg}`}>
            <div className="flex items-center justify-between">
              <div>
                <h2 className={`text-xl font-semibold ${headerBg.includes("bg-gradient") ? "text-white" : "text-gray-900"}`}>
                  {title}
                </h2>
                {subtitle && (
                  <p className={`${headerBg.includes("bg-gradient") ? "text-white/80" : "text-gray-500"} text-sm mt-1`}>
                    {subtitle}
                  </p>
                )}
              </div>
              <button
                onClick={onClose}
                className={`transition-colors ${
                  headerBg.includes("bg-gradient")
                    ? "text-white/80 hover:text-white"
                    : "text-gray-400 hover:text-gray-600"
                }`}
              >
                <X className="w-6 h-6" />
              </button>
            </div>
          </div>
        )}

        {/* Body */}
        <div className="p-6">{children}</div>

        {/* Footer */}
        {footer && <div className="p-6 border-t flex justify-end space-x-3">{footer}</div>}
      </div>
    </div>
  );
};

export default Modal;
