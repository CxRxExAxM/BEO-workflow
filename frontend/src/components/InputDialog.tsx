import React, { useState, useEffect } from 'react';

interface InputDialogProps {
  isOpen: boolean;
  title: string;
  message: string;
  initialValue?: string;
  confirmText?: string;
  cancelText?: string;
  onConfirm: (value: string) => void;
  onCancel: () => void;
}

const InputDialog: React.FC<InputDialogProps> = ({
  isOpen,
  title,
  message,
  initialValue = '',
  confirmText = 'Save',
  cancelText = 'Cancel',
  onConfirm,
  onCancel,
}) => {
  const [value, setValue] = useState(initialValue);

  useEffect(() => {
    if (isOpen) {
      setValue(initialValue);
    }
  }, [isOpen, initialValue]);

  if (!isOpen) return null;

  const handleConfirm = () => {
    if (value.trim()) {
      onConfirm(value.trim());
    }
  };

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      handleConfirm();
    } else if (e.key === 'Escape') {
      onCancel();
    }
  };

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
            <div className="text-3xl mr-4">✏️</div>
            <div className="flex-1">
              <h3 className="text-lg font-semibold text-white mb-2">
                {title}
              </h3>
              <p className="text-sm text-gray-300 mb-4">
                {message}
              </p>

              {/* Input Field */}
              <input
                type="text"
                value={value}
                onChange={(e) => setValue(e.target.value)}
                onKeyDown={handleKeyPress}
                className="w-full px-3 py-2 bg-gray-700 border border-gray-600 text-white placeholder-gray-400 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                placeholder="Enter value..."
                autoFocus
              />
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
              onClick={handleConfirm}
              disabled={!value.trim()}
              className={`px-4 py-2 text-white rounded-lg transition-colors font-medium ${
                value.trim()
                  ? 'bg-blue-600 hover:bg-blue-700'
                  : 'bg-gray-600 cursor-not-allowed'
              }`}
            >
              {confirmText}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default InputDialog;
