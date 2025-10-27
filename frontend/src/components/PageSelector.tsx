// src/components/PageSelector.tsx

import React, { useState } from 'react';
import axios from 'axios';
import { Session } from '../types';
import { API_URL } from '../config';

interface PageSelectorProps {
    session: Session;
    onSelectionComplete: (selectedPages: number[]) => void;
}

const PageSelector: React.FC<PageSelectorProps> = ({ session, onSelectionComplete }) => {
    const [selectedPages, setSelectedPages] = useState<Set<number>>(
        new Set(Array.from({ length: session.total_pages }, (_, i) => i))
    );
    const [isProcessing, setIsProcessing] = useState(false);

    const togglePage = (pageIndex: number) => {
        const newSelection = new Set(selectedPages);
        if (newSelection.has(pageIndex)) {
            newSelection.delete(pageIndex);
        } else {
            newSelection.add(pageIndex);
        }
        setSelectedPages(newSelection);
    };

    const selectAll = () => {
        setSelectedPages(new Set(Array.from({ length: session.total_pages }, (_, i) => i)));
    };

    const deselectAll = () => {
        setSelectedPages(new Set());
    };

    const handleContinue = async () => {
        const pagesArray = Array.from(selectedPages).sort((a, b) => a - b);

        // Save selection to backend
        try {
            await axios.post(`${API_URL}/api/select-pages`, {
                session_id: session.session_id,
                selected_pages: pagesArray,
            }, {
                headers: {
                    'ngrok-skip-browser-warning': 'true',
                }
            });
            onSelectionComplete(pagesArray);
        } catch (error) {
            console.error('Failed to save page selection:', error);
            alert('Failed to save selection. Please try again.');
        }
    };

    return (
        <div>
            <div className="flex justify-between items-center mb-6">
                <h2 className="text-2xl font-bold text-gray-800">
                    Select Pages to Keep
                </h2>
                <div className="space-x-2">
                    <button
                        onClick={selectAll}
                        className="px-4 py-2 bg-gray-200 text-gray-700 rounded hover:bg-gray-300 transition-colors"
                    >
                        Select All
                    </button>
                    <button
                        onClick={deselectAll}
                        className="px-4 py-2 bg-gray-200 text-gray-700 rounded hover:bg-gray-300 transition-colors"
                    >
                        Deselect All
                    </button>
                </div>
            </div>

            <div className="mb-6 p-4 bg-blue-50 border border-blue-200 rounded-lg">
                <p className="text-blue-800">
                    <strong>{selectedPages.size}</strong> of <strong>{session.total_pages}</strong> pages selected
                </p>
            </div>

            {/* Page Grid */}
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4 mb-8">
                {session.pages.map((pageBase64, index) => (
                    <div
                        key={index}
                        className={`relative border-2 rounded-lg overflow-hidden cursor-pointer transition-all ${
                            selectedPages.has(index)
                                ? 'border-blue-500 shadow-lg'
                                : 'border-gray-300 opacity-50'
                        }`}
                        onClick={() => togglePage(index)}
                    >
                        <img
                            src={`data:image/png;base64,${pageBase64}`}
                            alt={`Page ${index + 1}`}
                            className="w-full h-auto"
                        />
                        <div className="absolute top-2 right-2">
                            <div
                                className={`w-8 h-8 rounded-full flex items-center justify-center ${
                                    selectedPages.has(index) ? 'bg-blue-600' : 'bg-gray-400'
                                }`}
                            >
                                {selectedPages.has(index) && (
                                    <svg className="w-5 h-5 text-white" fill="currentColor" viewBox="0 0 20 20">
                                        <path
                                            fillRule="evenodd"
                                            d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z"
                                            clipRule="evenodd"
                                        />
                                    </svg>
                                )}
                            </div>
                        </div>
                        <div className="absolute bottom-0 left-0 right-0 bg-black bg-opacity-50 text-white text-center py-1">
                            Page {index + 1}
                        </div>
                    </div>
                ))}
            </div>

            {/* Continue Button */}
            <div className="flex justify-center">
                <button
                    onClick={handleContinue}
                    disabled={selectedPages.size === 0}
                    className="px-8 py-3 bg-blue-600 text-white rounded-lg font-semibold hover:bg-blue-700 disabled:bg-gray-400 disabled:cursor-not-allowed transition-colors"
                >
                    Continue to Annotation ({selectedPages.size} pages)
                </button>
            </div>
        </div>
    );
};

export default PageSelector;