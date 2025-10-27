import React from 'react';

interface ConfirmDialogProps {
  isOpen: boolean;
  title: string;
  message: string;
  confirmText?: string;
  cancelText?: string;
  onConfirm: () => void;
  onCancel: () => void;
  variant?: 'danger' | 'warning' | 'info';
}

const ConfirmDialog: React.FC<ConfirmDialogProps> = ({
  isOpen,
  title,
  message,
  confirmText = 'Confirm',
  cancelText = 'Cancel',
  onConfirm,
  onCancel,
  variant = 'warning',
}) => {
  if (!isOpen) return null;

  const getVariantColors = () => {
    switch (variant) {
      case 'danger':
        return {
          button: 'bg-red-600 hover:bg-red-700 focus:ring-red-500',
          icon: '⚠️',
        };
      case 'warning':
        return {
          button: 'bg-yellow-600 hover:bg-yellow-700 focus:ring-yellow-500',
          icon: '⚠️',
        };
      case 'info':
        return {
          button: 'bg-blue-600 hover:bg-blue-700 focus:ring-blue-500',
          icon: 'ℹ️',
        };
    }
  };

  const colors = getVariantColors();

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto">
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-black bg-opacity-70 transition-opacity"
        onClick={onCancel}
      />

      {/* Dialog */}
      <div className="flex min-h-full items-center justify-center p-4">
        <div className="relative bg-gray-800 rounded-lg shadow-xl max-w-md w-full p-6 transform transition-all border border-gray-700">
          {/* Icon & Title */}
          <div className="flex items-start">
            <div className="text-3xl mr-4">{colors.icon}</div>
            <div className="flex-1">
              <h3 className="text-lg font-semibold text-white mb-2">
                {title}
              </h3>
              <p className="text-sm text-gray-300 whitespace-pre-line">
                {message}
              </p>
            </div>
          </div>

          {/* Buttons */}
          <div className="mt-6 flex gap-3 justify-end">
            <button
              onClick={onCancel}
              className="px-4 py-2 bg-gray-700 text-gray-200 rounded-lg hover:bg-gray-600 transition-colors font-medium"
            >
              {cancelText}
            </button>
            <button
              onClick={onConfirm}
              className={`px-4 py-2 text-white rounded-lg transition-colors font-medium ${colors.button}`}
            >
              {confirmText}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default ConfirmDialog;
