import React, { useState, useEffect } from 'react';
import BEOCard from './BEOCard';
import { API_URL } from '../config';
import {
  DndContext,
  DragEndEvent,
  DragOverlay,
  DragStartEvent,
  closestCorners,
  PointerSensor,
  useSensor,
  useSensors,
} from '@dnd-kit/core';
import {
  SortableContext,
  verticalListSortingStrategy,
  useSortable,
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

interface WeekData {
  year: number;
  week_number: number;
  week_start: string;
  week_end: string;
  days: {
    Monday: BEOData[];
    Tuesday: BEOData[];
    Wednesday: BEOData[];
    Thursday: BEOData[];
    Friday: BEOData[];
    Saturday: BEOData[];
    Sunday: BEOData[];
  };
}

interface WeeklyGridViewProps {
  year?: number;
  weekNumber?: number;
  onBEOClick?: (sessionId: string) => void;
}

// Sortable BEO Card Wrapper
interface SortableBEOCardProps {
  beo: BEOData;
  onBEOClick?: (sessionId: string) => void;
}

const SortableBEOCard: React.FC<SortableBEOCardProps> = ({ beo, onBEOClick }) => {
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
        onClick={() => onBEOClick?.(beo.session_id)}
        isDragging={isDragging}
      />
    </div>
  );
};

const WeeklyGridView: React.FC<WeeklyGridViewProps> = ({
  year: propYear,
  weekNumber: propWeekNumber,
  onBEOClick,
}) => {
  const [weekData, setWeekData] = useState<WeekData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [activeBEO, setActiveBEO] = useState<BEOData | null>(null);

  // Calculate current week if not provided
  const getCurrentWeek = () => {
    const now = new Date();
    const year = now.getFullYear();
    const startOfYear = new Date(year, 0, 1);
    const days = Math.floor((now.getTime() - startOfYear.getTime()) / (24 * 60 * 60 * 1000));
    const weekNumber = Math.ceil((days + startOfYear.getDay() + 1) / 7);
    return { year, weekNumber };
  };

  const { year: defaultYear, weekNumber: defaultWeekNumber } = getCurrentWeek();

  // State for current week being viewed
  const [currentYear, setCurrentYear] = useState(propYear || defaultYear);
  const [currentWeek, setCurrentWeek] = useState(propWeekNumber || defaultWeekNumber);

  // Drag and drop sensors
  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: {
        distance: 8, // 8px movement required to start drag
      },
    })
  );

  useEffect(() => {
    fetchWeekData();
  }, [currentYear, currentWeek]);

  const fetchWeekData = async () => {
    setLoading(true);
    setError(null);

    try {
      const response = await fetch(`${API_URL}/api/beos/week/${currentYear}/${currentWeek}`);

      if (!response.ok) {
        throw new Error('Failed to fetch week data');
      }

      const data = await response.json();
      setWeekData(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error occurred');
    } finally {
      setLoading(false);
    }
  };

  const formatDateRange = (start: string, end: string) => {
    const startDate = new Date(start);
    const endDate = new Date(end);
    const options: Intl.DateTimeFormatOptions = { month: 'short', day: 'numeric' };
    return `${startDate.toLocaleDateString('en-US', options)} - ${endDate.toLocaleDateString('en-US', options)}, ${currentYear}`;
  };

  const getDayDate = (dayName: string) => {
    if (!weekData) return '';
    const weekStart = new Date(weekData.week_start);
    const dayIndex = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'].indexOf(dayName);
    const date = new Date(weekStart);
    date.setDate(date.getDate() + dayIndex);
    return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  };

  const handlePreviousWeek = () => {
    if (currentWeek > 1) {
      setCurrentWeek(currentWeek - 1);
    } else {
      // Go to last week of previous year
      setCurrentYear(currentYear - 1);
      setCurrentWeek(52);
    }
  };

  const handleNextWeek = () => {
    if (currentWeek < 52) {
      setCurrentWeek(currentWeek + 1);
    } else {
      // Go to first week of next year
      setCurrentYear(currentYear + 1);
      setCurrentWeek(1);
    }
  };

  const handleDragStart = (event: DragStartEvent) => {
    const { active } = event;
    // Find the BEO being dragged
    for (const day of Object.values(weekData?.days || {})) {
      const beo = day.find((b) => b.session_id === active.id);
      if (beo) {
        setActiveBEO(beo);
        break;
      }
    }
  };

  const handleDragEnd = async (event: DragEndEvent) => {
    const { active, over } = event;
    setActiveBEO(null);

    if (!over || !weekData) return;

    // Determine source and target day
    let sourceDayName: string | null = null;
    let targetDayName: string | null = null;
    let targetPosition = 0;

    // Find source day
    for (const [dayName, beos] of Object.entries(weekData.days)) {
      if (beos.some((b) => b.session_id === active.id)) {
        sourceDayName = dayName;
        break;
      }
    }

    // Determine target day and position
    // over.id could be a BEO session_id or a day name
    for (const [dayName, beos] of Object.entries(weekData.days)) {
      const targetIndex = beos.findIndex((b) => b.session_id === over.id);
      if (targetIndex !== -1) {
        targetDayName = dayName;
        targetPosition = targetIndex;
        break;
      }
    }

    if (!sourceDayName || !targetDayName) return;
    if (sourceDayName === targetDayName && active.id === over.id) return; // No change

    // Calculate target date
    const weekStart = new Date(weekData.week_start);
    const dayIndex = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'].indexOf(targetDayName);
    const targetDate = new Date(weekStart);
    targetDate.setDate(targetDate.getDate() + dayIndex);

    // Send API request to reorder
    try {
      const response = await fetch(`${API_URL}/api/beos/reorder`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          session_id: active.id,
          event_date: targetDate.toISOString().split('T')[0],
          order_position: targetPosition,
        }),
      });

      if (!response.ok) {
        throw new Error('Failed to reorder BEO');
      }

      // Refresh week data
      await fetchWeekData();
    } catch (err) {
      console.error('Error reordering BEO:', err);
      setError('Failed to reorder BEO');
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-xl text-gray-600">Loading week data...</div>
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

  if (!weekData) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-xl text-gray-600">No data available</div>
      </div>
    );
  }

  const dayOrder = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={closestCorners}
      onDragStart={handleDragStart}
      onDragEnd={handleDragEnd}
    >
      <div className="w-full h-full bg-gray-50 p-6">
        {/* Header */}
        <div className="mb-6">
          <div className="flex items-center justify-between mb-2">
            <button
              onClick={handlePreviousWeek}
              className="px-4 py-2 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors"
            >
              Previous Week
            </button>
            <h2 className="text-2xl font-bold text-gray-900">
              Week {currentWeek} • {formatDateRange(weekData.week_start, weekData.week_end)}
            </h2>
            <button
              onClick={handleNextWeek}
              className="px-4 py-2 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors"
            >
              Next Week
            </button>
          </div>
        </div>

        {/* Grid */}
        <div className="grid grid-cols-7 gap-4 h-[calc(100vh-200px)]">
          {dayOrder.map((day) => {
            const dayBEOs = weekData.days[day as keyof typeof weekData.days];
            const beoIds = dayBEOs.map((beo) => beo.session_id);

            return (
              <div
                key={day}
                className="bg-white rounded-lg shadow-sm border border-gray-200 overflow-hidden flex flex-col"
              >
                {/* Day Header */}
                <div className="bg-gray-100 border-b border-gray-200 p-3 sticky top-0 z-10">
                  <h3 className="font-semibold text-gray-900">{day}</h3>
                  <p className="text-sm text-gray-600">{getDayDate(day)}</p>
                  <p className="text-xs text-gray-500 mt-1">
                    {dayBEOs.length} BEO{dayBEOs.length !== 1 ? 's' : ''}
                  </p>
                </div>

                {/* BEO Cards Container */}
                <SortableContext items={beoIds} strategy={verticalListSortingStrategy}>
                  <div className="flex-1 overflow-y-auto p-3 space-y-3">
                    {dayBEOs.length === 0 ? (
                      <div className="text-center text-gray-400 text-sm mt-8">
                        No events
                      </div>
                    ) : (
                      dayBEOs.map((beo) => (
                        <SortableBEOCard
                          key={beo.session_id}
                          beo={beo}
                          onBEOClick={onBEOClick}
                        />
                      ))
                    )}
                  </div>
                </SortableContext>
              </div>
            );
          })}
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
    </DndContext>
  );
};

export default WeeklyGridView;
