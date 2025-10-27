import React, { useState } from 'react';
import { Session } from '../types';
import { API_URL } from '../config';
import axios from 'axios';

interface PageReviewProps {
    session: Session;
    onComplete: () => void;
}

interface BEOGroup {
    beo_number: string;
    pages: number[];
    order_position: number;
}

const PageReview: React.FC<PageReviewProps> = ({ session, onComplete }) => {
    const [currentPageIndex, setCurrentPageIndex] = useState(0);
    const [beoGroups, setBeoGroups] = useState<BEOGroup[]>([]);
    const [processing, setProcessing] = useState(false);

    const currentPage = session.pages[currentPageIndex];
    const totalPages = session.total_pages;
    const isLastPage = currentPageIndex === totalPages - 1;

    const handleKeep = async () => {
        // Each kept page creates a new BEO with auto-generated number
        const nextBEONumber = `BEO ${beoGroups.length + 1}`;
        const newGroup: BEOGroup = {
            beo_number: nextBEONumber,
            pages: [currentPageIndex],
            order_position: beoGroups.length,
        };
        setBeoGroups([...beoGroups, newGroup]);

        // Move to next page or finish
        if (isLastPage) {
            await finishReview();
        } else {
            setCurrentPageIndex(currentPageIndex + 1);
        }
    };

    const handleDiscard = () => {
        // Just skip this page
        if (isLastPage) {
            finishReview();
        } else {
            setCurrentPageIndex(currentPageIndex + 1);
        }
    };

    const finishReview = async () => {
        if (beoGroups.length === 0) {
            alert('No pages were kept. Please keep at least one page or cancel.');
            return;
        }

        setProcessing(true);

        try {
            console.log('Creating', beoGroups.length, 'BEOs from selected pages...');

            // For each BEO group, create a separate BEO from the pages
            for (const group of beoGroups) {
                await axios.post(
                    `${API_URL}/api/beos/create-from-pages`,
                    {
                        parent_session_id: session.session_id,
                        beo_number: group.beo_number,
                        page_indices: group.pages,
                        order_position: group.order_position,
                    },
                    {
                        headers: {
                            'Content-Type': 'application/json',
                            'ngrok-skip-browser-warning': 'true',
                        },
                    }
                );
            }

            // Delete the original upload session (it's no longer needed)
            try {
                await axios.delete(
                    `${API_URL}/api/beos/${session.session_id}`,
                    {
                        headers: {
                            'ngrok-skip-browser-warning': 'true',
                        },
                    }
                );
            } catch (deleteError) {
                console.error('Failed to delete parent session:', deleteError);
                // Don't fail the whole operation if deletion fails
            }

            // All done - navigate back to grid
            onComplete();
        } catch (error) {
            console.error('Error finishing review:', error);
            alert('Failed to save BEOs. Please try again.');
            setProcessing(false);
        }
    };

    const handleBack = () => {
        if (currentPageIndex > 0) {
            setCurrentPageIndex(currentPageIndex - 1);

            // If going back, we need to undo the last action
            // Check if the previous page was part of a BEO group
            const lastGroup = beoGroups[beoGroups.length - 1];
            if (lastGroup && lastGroup.pages.includes(currentPageIndex)) {
                // Remove this page from the group
                const updatedGroups = [...beoGroups];
                const pageIndexInGroup = lastGroup.pages.indexOf(currentPageIndex);
                updatedGroups[updatedGroups.length - 1].pages.splice(pageIndexInGroup, 1);

                // If the group is now empty, remove it
                if (updatedGroups[updatedGroups.length - 1].pages.length === 0) {
                    updatedGroups.pop();
                }
                setBeoGroups(updatedGroups);
            }
        }
    };

    return (
        <div className="h-screen flex flex-col bg-gray-900 relative">
            {/* Processing Overlay */}
            {processing && (
                <div className="absolute inset-0 bg-black bg-opacity-75 flex items-center justify-center z-50">
                    <div className="bg-gray-800 p-8 rounded-lg shadow-2xl border border-gray-700">
                        <div className="flex flex-col items-center">
                            <svg className="animate-spin h-12 w-12 text-blue-500 mb-4" viewBox="0 0 24 24">
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
                            <p className="text-white text-lg font-semibold">Creating {beoGroups.length} BEO{beoGroups.length > 1 ? 's' : ''}...</p>
                            <p className="text-gray-400 text-sm mt-2">Please wait, this may take a moment</p>
                        </div>
                    </div>
                </div>
            )}

            {/* Header with controls - fixed at top */}
            <div className="bg-gray-800 border-b border-gray-700 px-6 py-4">
                {/* Page Progress */}
                <div className="mb-4">
                    <div className="flex items-center justify-between mb-2">
                        <h2 className="text-xl font-bold text-white">Review Pages & Assign BEO Numbers</h2>
                        <p className="text-gray-400 font-medium">
                            Page {currentPageIndex + 1} of {totalPages}
                        </p>
                    </div>
                    <div className="w-full bg-gray-700 rounded-full h-2">
                        <div
                            className="bg-blue-600 h-2 rounded-full transition-all"
                            style={{ width: `${((currentPageIndex + 1) / totalPages) * 100}%` }}
                        />
                    </div>
                </div>

                {/* Action Buttons */}
                <div className="flex gap-3 justify-end">
                    {currentPageIndex > 0 && (
                        <button
                            onClick={handleBack}
                            disabled={processing}
                            className="px-5 py-2 bg-gray-700 text-gray-200 rounded-lg font-semibold hover:bg-gray-600 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                        >
                            ← Back
                        </button>
                    )}
                    <button
                        onClick={handleDiscard}
                        disabled={processing}
                        className="px-5 py-2 bg-red-600 text-white rounded-lg font-semibold hover:bg-red-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                    >
                        Discard
                    </button>
                    <button
                        onClick={handleKeep}
                        disabled={processing}
                        className="px-5 py-2 bg-green-600 text-white rounded-lg font-semibold hover:bg-green-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                    >
                        {processing ? 'Processing...' : (isLastPage ? 'Keep & Finish' : 'Keep & Continue →')}
                    </button>
                </div>
            </div>

            {/* Full Page Preview - takes remaining height */}
            <div className="flex-1 overflow-auto bg-gray-900 flex items-center justify-center p-4">
                {currentPage && (
                    <img
                        src={`data:image/jpeg;base64,${currentPage}`}
                        alt={`Page ${currentPageIndex + 1}`}
                        className="max-w-full max-h-full object-contain shadow-2xl cursor-zoom-in"
                        onClick={() => window.open(`data:image/jpeg;base64,${currentPage}`, '_blank')}
                        title="Click to view full size in new tab"
                    />
                )}
            </div>
        </div>
    );
};

export default PageReview;
