import React, { useState } from 'react';
import './App.css';
import PDFUpload from './components/PDFUpload';
import PageReview from './components/PageReview';
import AnnotationCanvas from './components/AnnotationCanvas';
import DailyGridView from './components/DailyGridView';
import { Session } from './types';
import { API_URL } from './config';

function App() {
    const [session, setSession] = useState<Session | null>(null);
    const [selectedPages, setSelectedPages] = useState<number[]>([]);
    const [highResPages, setHighResPages] = useState<{[key: number]: string}>({});
    const [currentStep, setCurrentStep] = useState<'upload' | 'review' | 'grid' | 'annotate'>('grid'); // Start with grid view
    const [selectedDate, setSelectedDate] = useState<Date | null>(null); // Track selected date from grid
    const [pageToSessionMap, setPageToSessionMap] = useState<{[key: number]: string}>({}); // Map global page index to BEO session_id
    const [pageToLocalIndexMap, setPageToLocalIndexMap] = useState<{[key: number]: number}>({}); // Map global page index to local page index within BEO
    const [initialPageIndex, setInitialPageIndex] = useState<number>(0); // Which page to start at

    const handleUploadComplete = (sessionData: Session) => {
        setSession(sessionData);
        setCurrentStep('review');
    };

    const handleReviewComplete = () => {
        setSession(null);
        setCurrentStep('grid');
    };

    const handleReset = () => {
        setSession(null);
        setSelectedPages([]);
        setCurrentStep('grid'); // Return to grid view
    };

    const handleBEOClick = async (sessionId: string, currentDate?: Date) => {
        // Store the current date so we can return to it
        if (currentDate) {
            setSelectedDate(currentDate);
        }

        // Load ALL BEOs for the day
        try {
            // Get all BEOs for the day
            const dateStr = currentDate?.toISOString().split('T')[0] || new Date().toISOString().split('T')[0];
            const dayResponse = await fetch(`${API_URL}/api/beos/day/${dateStr}`, {
                headers: {
                    'ngrok-skip-browser-warning': 'true',
                }
            });

            if (!dayResponse.ok) {
                throw new Error('Failed to load day BEOs');
            }

            const dayData = await dayResponse.json();
            const allBEOs = dayData.beos || [];

            if (allBEOs.length === 0) {
                alert('No BEOs found for this day.');
                return;
            }

            // Find the index of the clicked BEO
            const clickedBEOIndex = allBEOs.findIndex((beo: any) => beo.session_id === sessionId);
            let startingPageIndex = 0;

            // Build combined page list and high-res pages from all BEOs
            const allPageIndices: number[] = [];
            const allHighResPages: {[key: number]: string} = {};
            const pageToSession: {[key: number]: string} = {};
            const pageToLocalIndex: {[key: number]: number} = {};
            let globalPageIndex = 0;

            for (let i = 0; i < allBEOs.length; i++) {
                const beo = allBEOs[i];

                // Get pages for this BEO
                const beoResponse = await fetch(`${API_URL}/api/beos/${beo.session_id}/pages`, {
                    headers: {
                        'ngrok-skip-browser-warning': 'true',
                    }
                });

                if (!beoResponse.ok) {
                    console.error(`Failed to load BEO ${beo.session_id}`);
                    continue;
                }

                const beoData = await beoResponse.json();

                // If this is the clicked BEO, remember where it starts
                if (i === clickedBEOIndex) {
                    startingPageIndex = globalPageIndex;
                }

                // Add all pages from this BEO to the combined list
                for (let pageIdx = 0; pageIdx < beoData.total_pages; pageIdx++) {
                    allPageIndices.push(globalPageIndex);
                    allHighResPages[globalPageIndex] = beoData.high_res_pages[pageIdx];
                    pageToSession[globalPageIndex] = beo.session_id; // Track which BEO this page belongs to
                    pageToLocalIndex[globalPageIndex] = pageIdx; // Track local page index within this BEO
                    globalPageIndex++;
                }
            }

            // Create a pseudo-session for the entire day
            const session: Session = {
                session_id: sessionId, // Use clicked BEO's session_id for saving annotations
                filename: `${dateStr} - All BEOs`,
                total_pages: allPageIndices.length,
                pages: []
            };

            console.log('Loading all BEOs for day:', {
                date: dateStr,
                totalBEOs: allBEOs.length,
                totalPages: allPageIndices.length,
                startingAtPage: startingPageIndex
            });

            setSession(session);
            setSelectedPages(allPageIndices);
            setHighResPages(allHighResPages);
            setPageToSessionMap(pageToSession);
            setPageToLocalIndexMap(pageToLocalIndex);
            setInitialPageIndex(startingPageIndex);

            // Navigate to annotation step
            setCurrentStep('annotate');
        } catch (error) {
            console.error('Error loading BEOs:', error);
            alert('Failed to load BEOs. Please try again.');
        }
    };

    const handleAddNewBEO = () => {
        setCurrentStep('upload');
    };

    return (
        <div className="min-h-screen bg-gray-900">
            <header className="bg-gray-800 text-white shadow-lg border-b border-gray-700">
                <div className="container mx-auto px-4 py-6 flex items-center justify-between">
                    <div>
                        <h1 className="text-3xl font-bold">BEO Workflow Manager</h1>
                        <p className="text-gray-400 mt-2">
                            {currentStep === 'grid' && 'Daily BEO Organization'}
                            {currentStep === 'upload' && 'Upload Daily File'}
                            {currentStep === 'review' && 'Review Pages & Assign BEO Numbers'}
                            {currentStep === 'annotate' && 'Annotate and Review'}
                        </p>
                    </div>
                    {currentStep === 'grid' && (
                        <button
                            onClick={handleAddNewBEO}
                            className="bg-blue-600 text-white px-6 py-3 rounded-lg font-semibold hover:bg-blue-700 transition-colors"
                        >
                            + Add New BEO
                        </button>
                    )}
                    {currentStep !== 'grid' && (
                        <button
                            onClick={() => setCurrentStep('grid')}
                            className="bg-gray-700 text-white px-6 py-3 rounded-lg font-semibold hover:bg-gray-600 transition-colors"
                        >
                            Back to Grid
                        </button>
                    )}
                </div>
            </header>

            <main className={currentStep === 'grid' ? '' : 'container mx-auto px-4 py-8'}>
                {currentStep === 'grid' && (
                    <DailyGridView
                        onBEOClick={handleBEOClick}
                        initialDate={selectedDate}
                    />
                )}

                {currentStep !== 'grid' && (
                    <>
                        {/* Progress Steps */}
                        <div className="mb-8">
                            <div className="flex items-center justify-center space-x-4">
                                <StepIndicator
                                    number={1}
                                    label="Upload PDF"
                                    active={currentStep === 'upload'}
                                    completed={currentStep !== 'upload'}
                                />
                                <div className="w-16 h-1 bg-gray-700" />
                                <StepIndicator
                                    number={2}
                                    label="Review Pages"
                                    active={currentStep === 'review'}
                                    completed={currentStep === 'annotate'}
                                />
                                <div className="w-16 h-1 bg-gray-700" />
                                <StepIndicator
                                    number={3}
                                    label="Annotate"
                                    active={currentStep === 'annotate'}
                                    completed={false}
                                />
                            </div>
                        </div>

                        {/* Step Content */}
                        <div className="bg-gray-800 rounded-lg shadow-md p-6">
                            {currentStep === 'upload' && (
                                <PDFUpload onUploadComplete={handleUploadComplete} />
                            )}

                            {currentStep === 'review' && session && (
                                <PageReview
                                    session={session}
                                    onComplete={handleReviewComplete}
                                />
                            )}

                            {currentStep === 'annotate' && session && (
                                <AnnotationCanvas
                                    session={session}
                                    selectedPages={selectedPages}
                                    highResPages={highResPages}
                                    pageToSessionMap={pageToSessionMap}
                                    pageToLocalIndexMap={pageToLocalIndexMap}
                                    initialPageIndex={initialPageIndex}
                                    onReset={handleReset}
                                />
                            )}
                        </div>
                    </>
                )}
            </main>
        </div>
    );
}

// Step Indicator Component
interface StepIndicatorProps {
    number: number;
    label: string;
    active: boolean;
    completed: boolean;
}

const StepIndicator: React.FC<StepIndicatorProps> = ({ number, label, active, completed }) => {
    return (
        <div className="flex flex-col items-center">
            <div
                className={`w-12 h-12 rounded-full flex items-center justify-center font-bold text-lg
          ${active ? 'bg-blue-600 text-white' : ''}
          ${completed ? 'bg-green-500 text-white' : ''}
          ${!active && !completed ? 'bg-gray-700 text-gray-400' : ''}
        `}
            >
                {completed ? '✓' : number}
            </div>
            <span className="mt-2 text-sm font-medium text-gray-300">{label}</span>
        </div>
    );
};

export default App;