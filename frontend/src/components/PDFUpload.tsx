// src/components/PDFUpload.tsx

import React, { useState } from 'react';
import axios from 'axios';
import { Session } from '../types';
import { API_URL } from '../config';

interface PDFUploadProps {
    onUploadComplete: (session: Session) => void;
}

const PDFUpload: React.FC<PDFUploadProps> = ({ onUploadComplete }) => {
    const [selectedFile, setSelectedFile] = useState<File | null>(null);
    const [fileType, setFileType] = useState<'daily' | 'addition'>('daily');
    const [uploading, setUploading] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const handleFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
        const file = event.target.files?.[0];
        if (file) {
            if (file.type === 'application/pdf' || file.name.endsWith('.pdf')) {
                setSelectedFile(file);
                setError(null);
            } else {
                setError('Please select a PDF file');
                setSelectedFile(null);
            }
        }
    };

    const handleUpload = async () => {
        if (!selectedFile) return;

        setUploading(true);
        setError(null);

        try {
            const formData = new FormData();
            formData.append('file', selectedFile);
            formData.append('file_type', fileType);

            const response = await axios.post(
                `${API_URL}/api/upload-pdf`,
                formData,
                {
                    headers: {
                        'Content-Type': 'multipart/form-data',
                        'ngrok-skip-browser-warning': 'true',
                    },
                }
            );

            onUploadComplete(response.data);
        } catch (err: any) {
            console.error('Upload error:', err);
            setError(err.response?.data?.detail || 'Upload failed. Please try again.');
        } finally {
            setUploading(false);
        }
    };

    return (
        <div className="max-w-2xl mx-auto">
            <h2 className="text-2xl font-bold text-white mb-6">Upload PDF Document</h2>

            {/* File Type Selection */}
            <div className="mb-6">
                <label className="block text-sm font-medium text-gray-300 mb-3">
                    File Type *
                </label>
                <div className="flex gap-6">
                    <label className="flex items-center cursor-pointer">
                        <input
                            type="radio"
                            name="fileType"
                            value="daily"
                            checked={fileType === 'daily'}
                            onChange={() => setFileType('daily')}
                            className="w-4 h-4 text-blue-600 bg-gray-600 border-gray-500 focus:ring-blue-500"
                        />
                        <span className="ml-2 text-white">Daily File</span>
                    </label>
                    <label className="flex items-center cursor-pointer">
                        <input
                            type="radio"
                            name="fileType"
                            value="addition"
                            checked={fileType === 'addition'}
                            onChange={() => setFileType('addition')}
                            className="w-4 h-4 text-blue-600 bg-gray-600 border-gray-500 focus:ring-blue-500"
                        />
                        <span className="ml-2 text-white">Addition/Revision</span>
                    </label>
                </div>
            </div>

            {/* File Selection Area */}
            <div className="border-4 border-dashed border-gray-600 rounded-lg p-12 text-center bg-gray-700">
                <svg
                    className="mx-auto h-16 w-16 text-gray-400 mb-4"
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                >
                    <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12"
                    />
                </svg>
                <label htmlFor="file-upload" className="cursor-pointer">
                    <span className="text-lg text-gray-200 mb-2 block">
                        {selectedFile ? selectedFile.name : 'Select a PDF file'}
                    </span>
                    <span className="text-sm text-gray-400">
                        {selectedFile
                            ? `${(selectedFile.size / 1024).toFixed(1)} KB`
                            : 'Click to choose a file'}
                    </span>
                </label>
                <input
                    id="file-upload"
                    type="file"
                    accept=".pdf,application/pdf"
                    onChange={handleFileChange}
                    className="hidden"
                />
            </div>

            {/* Error Message */}
            {error && (
                <div className="mt-4 p-4 bg-red-900 border border-red-700 rounded-lg">
                    <p className="text-red-200">{error}</p>
                </div>
            )}

            {/* Upload Button */}
            {selectedFile && (
                <div className="mt-6 flex justify-center">
                    <button
                        onClick={handleUpload}
                        disabled={uploading}
                        className="px-8 py-3 bg-blue-600 text-white rounded-lg font-semibold hover:bg-blue-700 disabled:bg-gray-600 disabled:cursor-not-allowed transition-colors"
                    >
                        {uploading ? (
                            <span className="flex items-center">
                                <svg className="animate-spin h-5 w-5 mr-3" viewBox="0 0 24 24">
                                    <circle
                                        className="opacity-25"
                                        cx="12"
                                        cy="12"
                                        r="10"
                                        stroke="currentColor"
                                        strokeWidth="4"
                                        fill="none"
                                    />
                                    <path
                                        className="opacity-75"
                                        fill="currentColor"
                                        d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                                    />
                                </svg>
                                Uploading...
                            </span>
                        ) : (
                            'Upload PDF'
                        )}
                    </button>
                </div>
            )}
        </div>
    );
};

export default PDFUpload;
