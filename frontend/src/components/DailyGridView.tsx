import React, { useState, useEffect } from 'react';
import BEOCard from './BEOCard';
import ConfirmDialog from './ConfirmDialog';
import InputDialog from './InputDialog';
import { API_URL } from '../config';
import axios from 'axios';
import jsPDF from 'jspdf';
import { fabric } from 'fabric';
import {
  DndContext,
  DragEndEvent,
  DragOverlay,
  DragStartEvent,
  closestCenter,
  PointerSensor,
  useSensor,
  useSensors,
} from '@dnd-kit/core';
import {
  SortableContext,
  verticalListSortingStrategy,
  useSortable,
  arrayMove,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';

interface BEOData {
  session_id: string;
  filename: string;
  beo_number: string;
  event_date: string | null;
  order_position: number;
  status: string;
  total_pages: number;
  annotation_count: number;
  thumbnail: string | null;
  created_at: string;
}

interface DailyGridViewProps {
  onBEOClick?: (sessionId: string, currentDate?: Date) => void;
  initialDate?: Date | null;
}

// Sortable BEO Card Wrapper
interface SortableBEOCardProps {
  beo: BEOData;
  currentDate: Date;
  onBEOClick?: (sessionId: string, currentDate?: Date) => void;
  onExport?: (sessionId: string, beoNumber: string) => void;
  onDelete?: (sessionId: string, beoNumber: string) => void;
  onEditName?: (sessionId: string, currentName: string) => void;
}

const SortableBEOCard: React.FC<SortableBEOCardProps> = ({ beo, currentDate, onBEOClick, onExport, onDelete, onEditName }) => {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: beo.session_id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
  };

  return (
    <div ref={setNodeRef} style={style} {...attributes} {...listeners}>
      <BEOCard
        sessionId={beo.session_id}
        beoNumber={beo.beo_number}
        filename={beo.filename}
        status={beo.status}
        totalPages={beo.total_pages}
        annotationCount={beo.annotation_count}
        thumbnail={beo.thumbnail}
        onClick={() => onBEOClick?.(beo.session_id, currentDate)}
        onExport={onExport}
        onDelete={onDelete}
        onEditName={onEditName}
        isDragging={isDragging}
      />
    </div>
  );
};

const DailyGridView: React.FC<DailyGridViewProps> = ({ onBEOClick, initialDate }) => {
  const [currentDate, setCurrentDate] = useState<Date>(initialDate || new Date());
  const [beos, setBeos] = useState<BEOData[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [activeBEO, setActiveBEO] = useState<BEOData | null>(null);
  const [confirmDialog, setConfirmDialog] = useState<{
    isOpen: boolean;
    title: string;
    message: string;
    onConfirm: () => void;
    variant?: 'danger' | 'warning' | 'info';
  }>({
    isOpen: false,
    title: '',
    message: '',
    onConfirm: () => {},
  });

  const [inputDialog, setInputDialog] = useState<{
    isOpen: boolean;
    title: string;
    message: string;
    initialValue: string;
    onConfirm: (value: string) => void;
  }>({
    isOpen: false,
    title: '',
    message: '',
    initialValue: '',
    onConfirm: () => {},
  });

  // Drag and drop sensors
  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: {
        distance: 8, // 8px movement required to start drag
      },
    })
  );

  useEffect(() => {
    fetchDayData();
  }, [currentDate]);

  const fetchDayData = async () => {
    setLoading(true);
    setError(null);

    try {
      const dateStr = currentDate.toISOString().split('T')[0]; // YYYY-MM-DD
      const response = await fetch(`${API_URL}/api/beos/day/${dateStr}`, {
        headers: {
          'ngrok-skip-browser-warning': 'true',
        }
      });

      if (!response.ok) {
        throw new Error('Failed to fetch day data');
      }

      const data = await response.json();
      setBeos(data.beos || []);
    } catch (err) {
      console.error('Error fetching day data:', err);
      setError(err instanceof Error ? err.message : 'Unknown error occurred');
      setBeos([]); // Set empty array on error
    } finally {
      setLoading(false);
    }
  };

  const formatDate = (date: Date) => {
    const options: Intl.DateTimeFormatOptions = {
      weekday: 'long',
      year: 'numeric',
      month: 'long',
      day: 'numeric'
    };
    return date.toLocaleDateString('en-US', options);
  };

  const handlePreviousDay = () => {
    const newDate = new Date(currentDate);
    newDate.setDate(newDate.getDate() - 1);
    setCurrentDate(newDate);
  };

  const handleNextDay = () => {
    const newDate = new Date(currentDate);
    newDate.setDate(newDate.getDate() + 1);
    setCurrentDate(newDate);
  };

  const handleToday = () => {
    setCurrentDate(new Date());
  };

  const handleDateChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const newDate = new Date(event.target.value + 'T00:00:00');
    setCurrentDate(newDate);
  };

  const handleDragStart = (event: DragStartEvent) => {
    const { active } = event;
    const beo = beos.find((b) => b.session_id === active.id);
    if (beo) {
      setActiveBEO(beo);
    }
  };

  const handleDragEnd = async (event: DragEndEvent) => {
    const { active, over } = event;
    setActiveBEO(null);

    if (!over || active.id === over.id) return;

    const oldIndex = beos.findIndex((beo) => beo.session_id === active.id);
    const newIndex = beos.findIndex((beo) => beo.session_id === over.id);

    if (oldIndex === -1 || newIndex === -1) return;

    // Optimistically update UI
    const newBeos = arrayMove(beos, oldIndex, newIndex);
    setBeos(newBeos);

    // Update order positions on backend
    try {
      const dateStr = currentDate.toISOString().split('T')[0];
      const response = await fetch(`${API_URL}/api/beos/reorder`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'ngrok-skip-browser-warning': 'true',
        },
        body: JSON.stringify({
          session_id: active.id,
          event_date: dateStr,
          order_position: newIndex,
        }),
      });

      if (!response.ok) {
        throw new Error('Failed to reorder BEO');
      }

      // Refresh to get updated positions from server
      await fetchDayData();
    } catch (err) {
      console.error('Error reordering BEO:', err);
      setError('Failed to reorder BEO');
      // Revert optimistic update on error
      await fetchDayData();
    }
  };

  const handleExport = async (sessionId: string, beoNumber: string) => {
    setLoading(true);

    try {
      // Get BEO pages
      const pagesResponse = await axios.get(`${API_URL}/api/beos/${sessionId}/pages`, {
        headers: {
          'ngrok-skip-browser-warning': 'true',
        }
      });

      const { high_res_pages, total_pages } = pagesResponse.data;

      // Get annotations
      const sessionResponse = await axios.get(`${API_URL}/api/session/${sessionId}`, {
        headers: {
          'ngrok-skip-browser-warning': 'true',
        }
      });

      const annotations = sessionResponse.data.annotations || {};

      // Create PDF
      const pdf = new jsPDF({
        orientation: 'portrait',
        unit: 'in',
        format: 'letter',
      });

      let isFirstPage = true;

      // Process each page
      for (let pageIdx = 0; pageIdx < total_pages; pageIdx++) {
        console.log(`Processing page ${pageIdx + 1}/${total_pages}`);

        // Create a temporary canvas
        const tempCanvas = document.createElement('canvas');
        tempCanvas.width = 2550;  // US Letter at 300 DPI
        tempCanvas.height = 3300;

        const fabricTempCanvas = new fabric.Canvas(tempCanvas);

        // Load and wait for background image
        await new Promise<void>((resolve, reject) => {
          const img = new Image();
          img.crossOrigin = 'anonymous';

          const pageBase64 = high_res_pages[pageIdx];

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

          img.src = `data:image/jpeg;base64,${pageBase64}`;
        });

        // Load saved annotations for this page if they exist
        const pageAnnotations = annotations[pageIdx];
        if (pageAnnotations && pageAnnotations.objects && pageAnnotations.objects.length > 0) {
          console.log(`Loading ${pageAnnotations.objects.length} annotations for page ${pageIdx + 1}`);

          await new Promise<void>((resolve) => {
            fabricTempCanvas.loadFromJSON(pageAnnotations, () => {
              fabricTempCanvas.renderAll();
              resolve();
            });
          });

          fabricTempCanvas.renderAll();
        }

        // Wait for rendering
        await new Promise(resolve => setTimeout(resolve, 500));

        // Get canvas as image
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
      const filename = `BEO_${beoNumber}_annotated.pdf`;
      pdf.save(filename);

      console.log(`Successfully exported ${total_pages} pages to ${filename}`);
    } catch (error) {
      console.error('Export failed:', error);
      alert(`Export failed: ${error}. Please try again.`);
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = (sessionId: string, beoNumber: string) => {
    setConfirmDialog({
      isOpen: true,
      title: 'Delete BEO',
      message: `Are you sure you want to delete BEO ${beoNumber}?\n\nThis action cannot be undone.`,
      variant: 'danger',
      onConfirm: async () => {
        setConfirmDialog({ ...confirmDialog, isOpen: false });

        try {
          const response = await axios.delete(`${API_URL}/api/beos/${sessionId}`, {
            headers: {
              'ngrok-skip-browser-warning': 'true',
            }
          });

          if (response.status === 200) {
            await fetchDayData();
          }
        } catch (error) {
          console.error('Delete failed:', error);
          alert(`Failed to delete BEO: ${error}. Please try again.`);
        }
      },
    });
  };

  const handleEditName = (sessionId: string, currentName: string) => {
    setInputDialog({
      isOpen: true,
      title: 'Edit BEO Name',
      message: 'Enter the new name for this BEO:',
      initialValue: currentName,
      onConfirm: async (newName: string) => {
        setInputDialog({ ...inputDialog, isOpen: false });

        if (!newName || newName === currentName) {
          return;
        }

        try {
          const response = await axios.patch(`${API_URL}/api/beos/metadata`, {
            session_id: sessionId,
            beo_number: newName,
          }, {
            headers: {
              'Content-Type': 'application/json',
              'ngrok-skip-browser-warning': 'true',
            }
          });

          if (response.status === 200) {
            // Refresh the day data
            await fetchDayData();
          }
        } catch (error) {
          console.error('Edit failed:', error);
          alert(`Failed to update BEO name: ${error}. Please try again.`);
        }
      },
    });
  };

  const handleDeleteAll = () => {
    setConfirmDialog({
      isOpen: true,
      title: 'Delete All BEOs',
      message: `Are you sure you want to delete all ${beos.length} BEOs for this day?\n\nThis action cannot be undone.`,
      variant: 'danger',
      onConfirm: async () => {
        setConfirmDialog({ ...confirmDialog, isOpen: false });
        setLoading(true);

        try {
          for (const beo of beos) {
            await axios.delete(`${API_URL}/api/beos/${beo.session_id}`, {
              headers: {
                'ngrok-skip-browser-warning': 'true',
              }
            });
          }

          await fetchDayData();
        } catch (error) {
          console.error('Delete all failed:', error);
          alert(`Failed to delete BEOs: ${error}. Please try again.`);
        } finally {
          setLoading(false);
        }
      },
    });
  };

  const handleExportAll = async () => {
    if (beos.length === 0) {
      alert('No BEOs to export for this day.');
      return;
    }

    setLoading(true);

    try {
      // Create a single PDF with all BEOs for the day
      const pdf = new jsPDF({
        orientation: 'portrait',
        unit: 'in',
        format: 'letter',
      });

      let isFirstPage = true;

      // Process each BEO
      for (const beo of beos) {
        console.log(`Processing BEO ${beo.beo_number}...`);

        // Get BEO pages
        const pagesResponse = await axios.get(`${API_URL}/api/beos/${beo.session_id}/pages`, {
          headers: {
            'ngrok-skip-browser-warning': 'true',
          }
        });

        const { high_res_pages, total_pages } = pagesResponse.data;

        // Get annotations
        const sessionResponse = await axios.get(`${API_URL}/api/session/${beo.session_id}`, {
          headers: {
            'ngrok-skip-browser-warning': 'true',
          }
        });

        const annotations = sessionResponse.data.annotations || {};

        // Process each page of this BEO
        for (let pageIdx = 0; pageIdx < total_pages; pageIdx++) {
          const tempCanvas = document.createElement('canvas');
          tempCanvas.width = 2550;
          tempCanvas.height = 3300;

          const fabricTempCanvas = new fabric.Canvas(tempCanvas);

          // Load background image
          await new Promise<void>((resolve, reject) => {
            const img = new Image();
            img.crossOrigin = 'anonymous';
            const pageBase64 = high_res_pages[pageIdx];

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

            img.onerror = reject;
            img.src = `data:image/jpeg;base64,${pageBase64}`;
          });

          // Load annotations if they exist
          const pageAnnotations = annotations[pageIdx];
          if (pageAnnotations && pageAnnotations.objects && pageAnnotations.objects.length > 0) {
            await new Promise<void>((resolve) => {
              fabricTempCanvas.loadFromJSON(pageAnnotations, () => {
                fabricTempCanvas.renderAll();
                resolve();
              });
            });
          }

          // Wait for rendering
          await new Promise(resolve => setTimeout(resolve, 500));

          // Get canvas as image
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
      }

      // Download PDF
      const dateStr = currentDate.toISOString().split('T')[0];
      const filename = `BEOs_${dateStr}.pdf`;
      pdf.save(filename);

      console.log(`Successfully exported ${beos.length} BEOs to ${filename}`);
    } catch (error) {
      console.error('Export all failed:', error);
      alert(`Export failed: ${error}. Please try again.`);
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-xl text-gray-600">Loading BEOs...</div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-xl text-red-600">Error: {error}</div>
      </div>
    );
  }

  const beoIds = beos.map((beo) => beo.session_id);

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={closestCenter}
      onDragStart={handleDragStart}
      onDragEnd={handleDragEnd}
    >
      <div className="w-full min-h-screen bg-gray-900">
        {/* Header with Date Navigation */}
        <div className="bg-gray-800 border-b border-gray-700 px-6 py-4 sticky top-0 z-20 shadow-sm">
          <div className="max-w-7xl mx-auto">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-4">
                <button
                  onClick={handlePreviousDay}
                  className="px-4 py-2 bg-gray-700 border border-gray-600 rounded-lg hover:bg-gray-600 transition-colors font-medium text-gray-200"
                >
                  ← Previous
                </button>
                <button
                  onClick={handleToday}
                  className="px-4 py-2 bg-blue-600 border border-blue-500 rounded-lg hover:bg-blue-700 transition-colors font-medium text-white"
                >
                  Today
                </button>
                <button
                  onClick={handleNextDay}
                  className="px-4 py-2 bg-gray-700 border border-gray-600 rounded-lg hover:bg-gray-600 transition-colors font-medium text-gray-200"
                >
                  Next →
                </button>
              </div>

              <div className="flex items-center gap-4">
                <h2 className="text-2xl font-bold text-white">
                  {formatDate(currentDate)}
                </h2>
                <input
                  type="date"
                  value={currentDate.toISOString().split('T')[0]}
                  onChange={handleDateChange}
                  className="px-3 py-2 bg-gray-700 border border-gray-600 text-gray-200 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                />
              </div>

              <div className="flex items-center gap-3">
                <div className="text-sm text-gray-400 font-medium">
                  {beos.length} BEO{beos.length !== 1 ? 's' : ''}
                </div>
                {beos.length > 0 && (
                  <>
                    <button
                      onClick={handleExportAll}
                      className="px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition-colors font-medium text-sm"
                    >
                      📄 Export All
                    </button>
                    <button
                      onClick={handleDeleteAll}
                      className="px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 transition-colors font-medium text-sm"
                    >
                      🗑️ Delete All
                    </button>
                  </>
                )}
              </div>
            </div>
          </div>
        </div>

        {/* BEO Grid */}
        <div className="max-w-7xl mx-auto px-6 py-6">
          <SortableContext items={beoIds} strategy={verticalListSortingStrategy}>
            {beos.length === 0 ? (
              <div className="bg-gray-800 rounded-lg shadow-sm border border-gray-700 p-12 text-center">
                <div className="text-gray-400 text-lg">
                  No BEOs for this date
                </div>
                <p className="text-gray-500 text-sm mt-2">
                  Upload a new daily file to get started
                </p>
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
                {beos.map((beo) => (
                  <SortableBEOCard
                    key={beo.session_id}
                    beo={beo}
                    currentDate={currentDate}
                    onBEOClick={onBEOClick}
                    onExport={handleExport}
                    onDelete={handleDelete}
                    onEditName={handleEditName}
                  />
                ))}
              </div>
            )}
          </SortableContext>
        </div>
      </div>

      {/* Drag Overlay */}
      <DragOverlay>
        {activeBEO ? (
          <BEOCard
            sessionId={activeBEO.session_id}
            beoNumber={activeBEO.beo_number}
            filename={activeBEO.filename}
            status={activeBEO.status}
            totalPages={activeBEO.total_pages}
            annotationCount={activeBEO.annotation_count}
            thumbnail={activeBEO.thumbnail}
            isDragging={true}
          />
        ) : null}
      </DragOverlay>

      {/* Confirmation Dialog */}
      <ConfirmDialog
        isOpen={confirmDialog.isOpen}
        title={confirmDialog.title}
        message={confirmDialog.message}
        variant={confirmDialog.variant}
        onConfirm={confirmDialog.onConfirm}
        onCancel={() => setConfirmDialog({ ...confirmDialog, isOpen: false })}
      />

      {/* Input Dialog */}
      <InputDialog
        isOpen={inputDialog.isOpen}
        title={inputDialog.title}
        message={inputDialog.message}
        initialValue={inputDialog.initialValue}
        onConfirm={inputDialog.onConfirm}
        onCancel={() => setInputDialog({ ...inputDialog, isOpen: false })}
      />
    </DndContext>
  );
};

export default DailyGridView;
