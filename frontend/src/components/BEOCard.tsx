import React from 'react';

interface BEOCardProps {
  sessionId: string;
  beoNumber: string;
  filename: string;
  status: string;
  totalPages: number;
  annotationCount: number;
  thumbnail: string | null;
  onClick?: () => void;
  onExport?: (sessionId: string, beoNumber: string) => void;
  onDelete?: (sessionId: string, beoNumber: string) => void;
  onEditName?: (sessionId: string, currentName: string) => void;
  isDragging?: boolean;
}

const BEOCard: React.FC<BEOCardProps> = ({
  sessionId,
  beoNumber,
  filename,
  status,
  totalPages,
  annotationCount,
  thumbnail,
  onClick,
  onExport,
  onDelete,
  onEditName,
  isDragging = false,
}) => {
  const getStatusColor = (status: string) => {
    switch (status) {
      case 'new':
        return 'bg-gray-200 text-gray-700';
      case 'selected':
        return 'bg-blue-200 text-blue-700';
      case 'ready_for_annotation':
        return 'bg-yellow-200 text-yellow-700';
      case 'annotated':
        return 'bg-green-200 text-green-700';
      case 'approved':
        return 'bg-purple-200 text-purple-700';
      default:
        return 'bg-gray-200 text-gray-700';
    }
  };

  const getStatusLabel = (status: string) => {
    switch (status) {
      case 'new':
        return 'New';
      case 'selected':
        return 'Selected';
      case 'ready_for_annotation':
        return 'Ready';
      case 'annotated':
        return 'Annotated';
      case 'approved':
        return 'Approved';
      default:
        return status;
    }
  };

  return (
    <div
      className={`
        bg-gray-800 rounded-lg shadow-md hover:shadow-lg transition-shadow
        border-2 border-gray-700 hover:border-blue-500
        ${isDragging ? 'opacity-50 rotate-3' : 'opacity-100'}
      `}
    >
      {/* Thumbnail */}
      <div
        className="cursor-pointer"
        onClick={onClick}
      >
        {thumbnail && (
          <div className="h-32 overflow-hidden rounded-t-lg bg-gray-900">
            <img
              src={`data:image/jpeg;base64,${thumbnail}`}
              alt={`BEO ${beoNumber} thumbnail`}
              className="w-full h-full object-cover"
            />
          </div>
        )}
      </div>

      {/* Content */}
      <div className="p-3 space-y-2">
        {/* BEO Number - Prominent */}
        <div
          className="flex items-center justify-between cursor-pointer"
          onClick={onClick}
        >
          <h3 className="text-2xl font-bold text-white">
            {beoNumber}
          </h3>
          <span className={`text-xs px-2 py-1 rounded-full ${getStatusColor(status)}`}>
            {getStatusLabel(status)}
          </span>
        </div>

        {/* Metadata Row */}
        <div className="space-y-2">
          {annotationCount > 0 && (
            <div className="text-xs text-gray-400">
              <span className="text-green-400 font-medium">
                {annotationCount} note{annotationCount !== 1 ? 's' : ''}
              </span>
            </div>
          )}

          {/* Action Buttons */}
          <div className="flex gap-1 flex-wrap">
            {onEditName && (
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  onEditName(sessionId, beoNumber);
                }}
                className="px-2 py-1 bg-blue-600 text-white text-xs rounded hover:bg-blue-700 transition-colors font-medium"
                title="Edit name"
              >
                ✏️ Edit
              </button>
            )}
            {onExport && (
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  onExport(sessionId, beoNumber);
                }}
                className="px-2 py-1 bg-indigo-600 text-white text-xs rounded hover:bg-indigo-700 transition-colors font-medium"
                title="Export to PDF"
              >
                📄 Export
              </button>
            )}
            {onDelete && (
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  onDelete(sessionId, beoNumber);
                }}
                className="px-2 py-1 bg-red-600 text-white text-xs rounded hover:bg-red-700 transition-colors font-medium"
                title="Delete BEO"
              >
                🗑️ Delete
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default BEOCard;