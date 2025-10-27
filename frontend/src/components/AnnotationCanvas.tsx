// src/components/AnnotationCanvas.tsx

import React, { useState, useRef, useEffect } from 'react';
import axios from 'axios';
import { Session } from '../types';
import { fabric } from 'fabric';
import jsPDF from 'jspdf';
import { API_URL } from '../config';

interface AnnotationCanvasProps {
    session: Session;
    selectedPages: number[];
    highResPages: {[key: number]: string};
    pageToSessionMap?: {[key: number]: string};
    pageToLocalIndexMap?: {[key: number]: number};
    initialPageIndex?: number;
    onReset: () => void;
}

const AnnotationCanvas: React.FC<AnnotationCanvasProps> = ({
                                                               session,
                                                               selectedPages,
                                                               highResPages,
                                                               pageToSessionMap = {},
                                                               pageToLocalIndexMap = {},
                                                               initialPageIndex = 0,
                                                               onReset,
                                                           }) => {
    const [currentPageIndex, setCurrentPageIndex] = useState(initialPageIndex);
    const [drawingMode, setDrawingMode] = useState<'pen' | 'highlight' | 'text'>('pen');
    const [color, setColor] = useState('#000000');
    const [brushWidth, setBrushWidth] = useState(8);
    const [zoom, setZoom] = useState(0.6); // Start at 60% for better fit on screen
    const canvasContainerRef = useRef<HTMLDivElement>(null);
    const fabricCanvasRef = useRef<fabric.Canvas | null>(null);
    const [isSaving, setIsSaving] = useState(false);
    const [isLoading, setIsLoading] = useState(true);

    const currentPage = selectedPages[currentPageIndex];

    // Load saved annotations for the current page
    const loadAnnotations = async () => {
        if (!fabricCanvasRef.current) return;

        try {
            // Determine which BEO session this page belongs to and its local page index
            const targetSessionId = pageToSessionMap[currentPage] || session.session_id;
            const localPageIndex = pageToLocalIndexMap[currentPage] !== undefined ? pageToLocalIndexMap[currentPage] : currentPage;

            const response = await axios.get(`${API_URL}/api/session/${targetSessionId}`, {
                headers: {
                    'ngrok-skip-browser-warning': 'true',
                }
            });

            const annotations = response.data.annotations || {};
            const pageAnnotations = annotations[localPageIndex];

            if (pageAnnotations && pageAnnotations.objects && pageAnnotations.objects.length > 0) {
                console.log(`Loading ${pageAnnotations.objects.length} saved annotations for page ${currentPage} (BEO: ${targetSessionId}, local: ${localPageIndex})`);

                const canvas = fabricCanvasRef.current;

                // Only load the annotation objects, not the background
                // This prevents the saved background URL from overwriting our fresh background
                const annotationData = {
                    ...pageAnnotations,
                    backgroundImage: undefined // Don't load saved background
                };

                await new Promise<void>((resolve) => {
                    canvas.loadFromJSON(annotationData, () => {
                        canvas.renderAll();
                        resolve();
                    });
                });
            } else {
                console.log(`No saved annotations for page ${currentPage}`);
            }
        } catch (error) {
            console.error('Failed to load annotations:', error);
        }
    };

    // Initialize Fabric.js canvas once
    useEffect(() => {
        console.log('Canvas init effect running');
        console.log('fabricCanvasRef.current:', fabricCanvasRef.current);
        console.log('canvasContainerRef.current:', canvasContainerRef.current);

        if (fabricCanvasRef.current) {
            console.log('Canvas already exists, skipping');
            return;
        }

        // Use setTimeout to ensure DOM is ready
        const timer = setTimeout(() => {
            console.log('Timer fired, creating canvas');
            const canvasEl = document.createElement('canvas');
            canvasEl.id = 'annotation-canvas';

            if (canvasContainerRef.current) {
                console.log('Container found, appending canvas');
                canvasContainerRef.current.appendChild(canvasEl);

                const canvas = new fabric.Canvas('annotation-canvas', {
                    width: 2550,  // US Letter at 300 DPI: 8.5" x 300
                    height: 3300, // US Letter at 300 DPI: 11" x 300
                    backgroundColor: '#f0f0f0',
                });

                console.log('Canvas created:', canvas);
                fabricCanvasRef.current = canvas;
                setIsLoading(false);
                console.log('isLoading set to false');
            } else {
                console.error('Container ref is null!');
            }
        }, 100);

        return () => {
            clearTimeout(timer);
            if (fabricCanvasRef.current) {
                fabricCanvasRef.current.dispose();
                fabricCanvasRef.current = null;
            }
        };
    }, []);

    // Load background image when page changes
    useEffect(() => {
        if (!fabricCanvasRef.current || isLoading) return;

        const canvas = fabricCanvasRef.current;

        // Use high-res version if available, otherwise fall back to thumbnail
        const pageData = highResPages[currentPage] || session.pages[currentPage];

        // Clear all objects (but we'll reload them if saved)
        canvas.clear();
        canvas.backgroundColor = '#f0f0f0';

        // Load the PDF page as background
        const img = new Image();
        img.crossOrigin = 'anonymous';  // Enable CORS for local images
        img.onload = async () => {
            const fabricImage = new fabric.Image(img);

            // Calculate scale to fit canvas
            const scaleX = canvas.width! / fabricImage.width!;
            const scaleY = canvas.height! / fabricImage.height!;
            const scale = Math.min(scaleX, scaleY);

            fabricImage.set({
                scaleX: scale,
                scaleY: scale,
                left: 0,
                top: 0,
                selectable: false,
                evented: false,
            });

            canvas.setBackgroundImage(fabricImage, canvas.renderAll.bind(canvas));

            // Load saved annotations for this page
            await loadAnnotations();
        };

        img.onerror = (error) => {
            console.error('Failed to load image for page', currentPage, ':', error);
            console.error('Image source was:', pageData);
        };

        // Check if pageData is a URL or base64 data
        if (pageData && pageData.startsWith('/storage/')) {
            // It's a relative URL, prepend API_URL
            const fullUrl = `${API_URL}${pageData}`;
            console.log('Loading page', currentPage, 'from URL:', fullUrl);
            img.src = fullUrl;
        } else if (pageData && pageData.startsWith('http')) {
            // It's already an absolute URL
            console.log('Loading page', currentPage, 'from absolute URL:', pageData);
            img.src = pageData;
        } else if (pageData) {
            console.log('Loading page', currentPage, 'from base64 data');
            img.src = `data:image/jpeg;base64,${pageData}`;  // It's base64 data
        } else {
            console.error('No image data for page', currentPage);
        }
    }, [currentPage, session.pages, highResPages, isLoading]);

    // Update drawing mode and brush settings
    useEffect(() => {
        if (!fabricCanvasRef.current) return;
        const canvas = fabricCanvasRef.current;

        if (drawingMode === 'pen') {
            canvas.isDrawingMode = true;
            canvas.freeDrawingBrush = new fabric.PencilBrush(canvas);
            canvas.freeDrawingBrush.color = color;
            canvas.freeDrawingBrush.width = brushWidth * (1 / zoom); // Adjust for zoom
        } else if (drawingMode === 'highlight') {
            canvas.isDrawingMode = true;
            canvas.freeDrawingBrush = new fabric.PencilBrush(canvas);
            // Add transparency for highlighter effect
            const r = parseInt(color.slice(1, 3), 16);
            const g = parseInt(color.slice(3, 5), 16);
            const b = parseInt(color.slice(5, 7), 16);
            canvas.freeDrawingBrush.color = `rgba(${r}, ${g}, ${b}, 0.3)`;
            canvas.freeDrawingBrush.width = brushWidth * 4 * (1 / zoom); // Adjust for zoom
        } else if (drawingMode === 'text') {
            canvas.isDrawingMode = false;
        }
    }, [drawingMode, color, brushWidth, zoom]);

    const handleAddText = () => {
        if (!fabricCanvasRef.current) return;
        const canvas = fabricCanvasRef.current;

        const text = new fabric.IText('Type here...', {
            left: 100,
            top: 100,
            fill: color,
            fontSize: 24,
            fontFamily: 'Arial',
        });

        canvas.add(text);
        canvas.setActiveObject(text);
        text.enterEditing();
    };

    const handleClear = () => {
        if (!fabricCanvasRef.current) return;
        const canvas = fabricCanvasRef.current;

        // Remove all objects except background
        const objects = canvas.getObjects();
        objects.forEach((obj) => {
            canvas.remove(obj);
        });
        canvas.renderAll();
    };

    const handleUndo = () => {
        if (!fabricCanvasRef.current) return;
        const canvas = fabricCanvasRef.current;

        // Get all objects (drawings)
        const objects = canvas.getObjects();

        if (objects.length > 0) {
            // Remove the last drawn object
            canvas.remove(objects[objects.length - 1]);
            canvas.renderAll();
        }
    };

    const handleSave = async () => {
        if (!fabricCanvasRef.current) return;
        setIsSaving(true);

        try {
            const canvas = fabricCanvasRef.current;
            const json = canvas.toJSON();

            // Determine which BEO session this page belongs to and its local page index
            const targetSessionId = pageToSessionMap[currentPage] || session.session_id;
            const localPageIndex = pageToLocalIndexMap[currentPage] !== undefined ? pageToLocalIndexMap[currentPage] : currentPage;

            console.log('Saving to:', `${API_URL}/api/save-annotation`, {
                session_id: targetSessionId,
                local_page_index: localPageIndex,
                global_page_index: currentPage
            });

            await axios.post(`${API_URL}/api/save-annotation`, {
                session_id: targetSessionId,
                page_index: localPageIndex,
                annotation_data: json,
            }, {
                headers: {
                    'ngrok-skip-browser-warning': 'true',
                }
            });

            alert('Annotations saved!');
        } catch (error) {
            console.error('Failed to save annotations:', error);
            alert('Failed to save. Please try again.');
        } finally {
            setIsSaving(false);
        }
    };

    const handleExport = async () => {
        if (!fabricCanvasRef.current) return;

        try {
            // Export current page as PNG
            const canvas = fabricCanvasRef.current;

            // Convert canvas to data URL
            canvas.renderAll();
            const dataURL = canvas.toDataURL({
                format: 'png',
                quality: 1,
                multiplier: 2, // Higher resolution
            });

            // Convert data URL to blob
            const base64Data = dataURL.split(',')[1];
            const blob = await fetch(`data:image/png;base64,${base64Data}`).then(r => r.blob());

            // Create download link
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = `page_${currentPage + 1}_annotated.png`;
            a.click();
            URL.revokeObjectURL(url);

            alert('Current page exported as PNG!');
        } catch (error) {
            console.error('Export failed:', error);
            alert('Export failed. Please try again.');
        }
    };

    const handleExportAll = async () => {
        if (!fabricCanvasRef.current) return;

        try {
            // Save current page first
            await handleSave();

            // Create PDF with US Letter dimensions
            const pdf = new jsPDF({
                orientation: 'portrait',
                unit: 'in',
                format: 'letter',
            });

            let isFirstPage = true;

            // Process each selected page in order
            for (let i = 0; i < selectedPages.length; i++) {
                const pageIdx = selectedPages[i];
                console.log(`Processing page ${i + 1}/${selectedPages.length} (original page ${pageIdx + 1})`);

                const pageBase64 = session.pages[pageIdx];

                // Create a temporary canvas
                const tempCanvas = document.createElement('canvas');
                tempCanvas.width = 2550;
                tempCanvas.height = 3300;

                const fabricTempCanvas = new fabric.Canvas(tempCanvas);

                // Load and wait for background image
                await new Promise<void>((resolve, reject) => {
                    const img = new Image();
                    img.crossOrigin = 'anonymous';

                    // Use high-res version if available
                    const pageData = highResPages[pageIdx] || session.pages[pageIdx];

                    img.onload = () => {
                        const fabricImage = new fabric.Image(img);
                        const scaleX = fabricTempCanvas.width! / fabricImage.width!;
                        const scaleY = fabricTempCanvas.height! / fabricImage.height!;
                        const scale = Math.min(scaleX, scaleY);

                        fabricImage.set({
                            scaleX: scale,
                            scaleY: scale,
                            left: 0,
                            top: 0,
                            selectable: false,
                            evented: false,
                        });

                        fabricTempCanvas.setBackgroundImage(fabricImage, () => {
                            fabricTempCanvas.renderAll();
                            resolve();
                        });
                    };

                    img.onerror = (error) => {
                        console.error('Image load error:', error);
                        reject(error);
                    };

                    // Check if pageData is a URL or base64 data
                    if (pageData.startsWith('/storage/')) {
                        // It's a relative URL, prepend API_URL
                        img.src = `${API_URL}${pageData}`;
                    } else if (pageData.startsWith('http')) {
                        // It's already an absolute URL
                        img.src = pageData;
                    } else {
                        img.src = `data:image/png;base64,${pageData}`;  // It's base64 data
                    }
                });

                // Try to load saved annotations for this page
                try {
                    const sessionData = await axios.get(`${API_URL}/api/session/${session.session_id}`, {
                        headers: {
                            'ngrok-skip-browser-warning': 'true',
                        }
                    });
                    const annotations = sessionData.data.annotations[pageIdx];

                    if (annotations && annotations.objects && annotations.objects.length > 0) {
                        console.log(`Loading ${annotations.objects.length} annotations for page ${pageIdx + 1}`);

                        // Wait for annotations to load completely
                        await new Promise<void>((resolve) => {
                            fabricTempCanvas.loadFromJSON(annotations, () => {
                                // Ensure background stays behind annotations
                                const bgImage = fabricTempCanvas.backgroundImage;
                                fabricTempCanvas.renderAll();
                                resolve();
                            });
                        });

                        // Additional render to ensure everything is drawn
                        fabricTempCanvas.renderAll();
                    } else {
                        console.log(`No annotations for page ${pageIdx + 1}`);
                    }
                } catch (error) {
                    console.log(`No saved annotations for page ${pageIdx + 1}`, error);
                }

                // Wait longer to ensure rendering is complete
                await new Promise(resolve => setTimeout(resolve, 800));

                // Get canvas as high quality image
                const imgData = fabricTempCanvas.toDataURL({
                    format: 'png',
                    quality: 1,
                    multiplier: 1,
                });

                // Add to PDF
                if (!isFirstPage) {
                    pdf.addPage('letter');
                }

                pdf.addImage(imgData, 'PNG', 0, 0, 8.5, 11);
                isFirstPage = false;

                // Cleanup
                fabricTempCanvas.dispose();
            }

            // Download PDF
            const filename = `${session.filename.replace('.pdf', '')}_annotated.pdf`;
            pdf.save(filename);
            alert(`Successfully exported ${selectedPages.length} pages to PDF!`);

        } catch (error) {
            console.error('Export all failed:', error);
            alert(`Export failed: ${error}. Please try again.`);
        }
    };

    const saveCurrentPage = async () => {
        if (!fabricCanvasRef.current) return;

        try {
            const canvas = fabricCanvasRef.current;
            const json = canvas.toJSON();

            // Determine which BEO session this page belongs to and its local page index
            const targetSessionId = pageToSessionMap[currentPage] || session.session_id;
            const localPageIndex = pageToLocalIndexMap[currentPage] !== undefined ? pageToLocalIndexMap[currentPage] : currentPage;

            await axios.post(`${API_URL}/api/save-annotation`, {
                session_id: targetSessionId,
                page_index: localPageIndex,
                annotation_data: json,
            }, {
                headers: {
                    'ngrok-skip-browser-warning': 'true',
                }
            });

            console.log(`Auto-saved annotations for page ${currentPage} (BEO: ${targetSessionId}, local index: ${localPageIndex})`);
        } catch (error) {
            console.error('Failed to auto-save annotations:', error);
        }
    };

    const goToPreviousPage = async () => {
        if (currentPageIndex > 0) {
            // Auto-save current page before navigating
            await saveCurrentPage();
            setCurrentPageIndex(currentPageIndex - 1);
        }
    };

    const goToNextPage = async () => {
        if (currentPageIndex < selectedPages.length - 1) {
            // Auto-save current page before navigating
            await saveCurrentPage();
            setCurrentPageIndex(currentPageIndex + 1);
        }
    };

    return (
        <div>
            {/* Horizontal Toolbar */}
            <div className="bg-gray-800 rounded-lg shadow-md p-4 mb-4 sticky top-0 z-10 border border-gray-700">
                <div className="flex flex-wrap items-center gap-4">
                    {/* Drawing Mode */}
                    <div className="flex gap-2">
                        <button
                            onClick={() => setDrawingMode('pen')}
                            className={`px-4 py-2 rounded transition-colors ${
                                drawingMode === 'pen'
                                    ? 'bg-blue-600 text-white'
                                    : 'bg-gray-700 text-gray-200 hover:bg-gray-600'
                            }`}
                        >
                            ✏️ Pen
                        </button>
                        <button
                            onClick={() => setDrawingMode('highlight')}
                            className={`px-4 py-2 rounded transition-colors ${
                                drawingMode === 'highlight'
                                    ? 'bg-blue-600 text-white'
                                    : 'bg-gray-700 text-gray-200 hover:bg-gray-600'
                            }`}
                        >
                            🖍️ Highlight
                        </button>
                        <button
                            onClick={() => {
                                setDrawingMode('text');
                                handleAddText();
                            }}
                            className={`px-4 py-2 rounded transition-colors ${
                                drawingMode === 'text'
                                    ? 'bg-blue-600 text-white'
                                    : 'bg-gray-700 text-gray-200 hover:bg-gray-600'
                            }`}
                        >
                            📝 Text
                        </button>
                    </div>

                    <div className="h-8 w-px bg-gray-600"></div>

                    {/* Color Picker */}
                    <div className="flex items-center gap-2">
                        <span className="text-sm font-medium text-gray-300">Color:</span>
                        <input
                            type="color"
                            value={color}
                            onChange={(e) => setColor(e.target.value)}
                            className="w-10 h-10 rounded cursor-pointer border border-gray-600"
                        />
                        {['#000000', '#FF0000', '#FF1493', '#0000FF', '#00FF00', '#FFFF00'].map((c) => (
                            <button
                                key={c}
                                onClick={() => setColor(c)}
                                className={`w-8 h-8 rounded border-2 ${color === c ? 'border-blue-500' : 'border-gray-600'}`}
                                style={{ backgroundColor: c }}
                                title={c === '#FF1493' ? 'Pink' : ''}
                            />
                        ))}
                    </div>

                    <div className="h-8 w-px bg-gray-600"></div>

                    {/* Brush Size */}
                    <div className="flex items-center gap-2">
                        <span className="text-sm font-medium text-gray-300">Size:</span>
                        <button
                            onClick={() => setBrushWidth(Math.max(1, brushWidth - 1))}
                            className="px-2 py-1 bg-gray-700 text-gray-200 rounded hover:bg-gray-600"
                        >
                            −
                        </button>
                        <span className="text-sm text-gray-400 w-12 text-center">{brushWidth}px</span>
                        <button
                            onClick={() => setBrushWidth(Math.min(20, brushWidth + 1))}
                            className="px-2 py-1 bg-gray-700 text-gray-200 rounded hover:bg-gray-600"
                        >
                            +
                        </button>
                    </div>

                    <div className="h-8 w-px bg-gray-600"></div>

                    {/* Zoom */}
                    <div className="flex items-center gap-2">
                        <span className="text-sm font-medium text-gray-300">Zoom:</span>
                        <button
                            onClick={() => setZoom(Math.max(0.3, zoom - 0.1))}
                            className="px-2 py-1 bg-gray-700 text-gray-200 rounded hover:bg-gray-600"
                        >
                            −
                        </button>
                        <span className="text-sm text-gray-400 w-12 text-center">{Math.round(zoom * 100)}%</span>
                        <button
                            onClick={() => setZoom(Math.min(1.5, zoom + 0.1))}
                            className="px-2 py-1 bg-gray-700 text-gray-200 rounded hover:bg-gray-600"
                        >
                            +
                        </button>
                    </div>

                    <div className="flex-grow"></div>

                    {/* Actions */}
                    <div className="flex gap-2">
                        <button
                            onClick={handleUndo}
                            className="px-3 py-2 bg-orange-600 text-white rounded hover:bg-orange-700 transition-colors text-sm"
                        >
                            ↶ Undo
                        </button>
                        <button
                            onClick={handleClear}
                            className="px-3 py-2 bg-red-600 text-white rounded hover:bg-red-700 transition-colors text-sm"
                        >
                            🗑️ Clear
                        </button>
                        <button
                            onClick={handleSave}
                            disabled={isSaving}
                            className="px-3 py-2 bg-green-600 text-white rounded hover:bg-green-700 disabled:bg-gray-600 transition-colors text-sm"
                        >
                            {isSaving ? 'Saving...' : '💾 Save'}
                        </button>
                        <button
                            onClick={async () => {
                                await saveCurrentPage();
                                onReset();
                            }}
                            className="px-3 py-2 bg-gray-600 text-white rounded hover:bg-gray-500 transition-colors text-sm"
                        >
                            ⟲ Back to Grid
                        </button>
                    </div>
                </div>
            </div>

            {/* Page Info and Navigation */}
            <div className="flex justify-between items-center mb-4">
                <h2 className="text-xl font-bold text-white">
                    Page {currentPageIndex + 1} of {selectedPages.length} (Original Page {currentPage + 1})
                </h2>
                <div className="flex gap-2">
                    <button
                        onClick={goToPreviousPage}
                        disabled={currentPageIndex === 0}
                        className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700 disabled:bg-gray-700 disabled:cursor-not-allowed transition-colors"
                    >
                        ← Previous
                    </button>
                    <button
                        onClick={goToNextPage}
                        disabled={currentPageIndex === selectedPages.length - 1}
                        className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700 disabled:bg-gray-700 disabled:cursor-not-allowed transition-colors"
                    >
                        Next →
                    </button>
                </div>
            </div>

            {/* Canvas Area */}
            <div className="bg-gray-800 rounded-lg p-4 overflow-auto border border-gray-700" style={{ maxHeight: 'calc(100vh - 250px)' }}>
                {isLoading && (
                    <div className="text-center py-8 text-gray-400">Loading canvas...</div>
                )}
                <div
                    ref={canvasContainerRef}
                    className="inline-block"
                    style={{
                        touchAction: 'none',
                        display: isLoading ? 'none' : 'inline-block',
                        transform: `scale(${zoom})`,
                        transformOrigin: 'top left',
                    }}
                />
            </div>
        </div>
    );
};

export default AnnotationCanvas;