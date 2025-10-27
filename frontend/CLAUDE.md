# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

This is a React + TypeScript application for digitizing catering workflow documents (Banquet Event Orders - BEOs). The application enables teams to collaboratively annotate multi-page PDF scans with stylus/pen input (optimized for iPad Pro + Apple Pencil).

### Business Context
- Weekly workflow: Receive 7 PDFs every Friday (one per day, ordered by time/number)
- Daily additions/revisions arrive via email that must be inserted into correct day's stack
- Daily in-person meetings require note-taking and annotation on BEO images
- Event management system: OPERA Sales and Catering (not OPERA Cloud)
- Future goals: Real-time collaboration, version control, automated email ingestion, OCR for data extraction

The application follows a three-step workflow: PDF upload, page selection, and annotation with export capabilities.

## Development Commands

### Starting the Development Server
```bash
npm start
```
Opens the app at http://localhost:3000 with hot reload enabled.

### Running Tests
```bash
npm test                    # Run tests in watch mode
npm test -- --coverage      # Run tests with coverage report
npm test -- [filename]      # Run specific test file
```

### Building for Production
```bash
npm run build
```
Creates optimized production build in the `build/` folder.

## Backend API Configuration

The frontend communicates with a FastAPI backend located at `../backend/venv/`. The API URL is configured via environment variable:
- Set `REACT_APP_API_URL` in `.env` file (defaults to `http://localhost:8000`)
- All API requests include the `ngrok-skip-browser-warning: true` header to bypass ngrok warning pages
- API configuration is centralized in `src/config.ts`

### Backend Implementations
There are two backend implementations available:
1. **`main.py`** (In-memory): Uses in-memory session storage with WebSocket support for real-time collaboration
2. **`main_db.py`** (Database): Uses PostgreSQL with SQLAlchemy for persistent storage and file system for images

The database version includes:
- **Models** (`models.py`): `BEO` (document), `BEOPage` (individual pages), `Annotation` (canvas data), `Week` (calendar organization)
- **Storage Strategy**: Low-res thumbnails (75 DPI) for page selection, high-res images (300 DPI) generated only for selected pages
- **File Organization**: `storage/thumbnails/`, `storage/high_res/`, `storage/originals/`
- **Database**: PostgreSQL (configurable via `DATABASE_URL` env var)

### Running the Backend
```bash
cd ../backend/venv
source bin/activate  # or `activate` on Windows

# For in-memory version:
python main.py

# For database version:
python init_db.py    # First time only - creates tables
python main_db.py
```

## Application Architecture

### Three-Step Workflow
The app uses a state machine pattern with three distinct steps managed in `App.tsx`:

1. **Upload Step** (`PDFUpload.tsx`): User uploads PDF, backend processes it and returns a Session with page thumbnails
2. **Select Step** (`PageSelector.tsx`): User selects which pages to keep for annotation (default: all pages)
3. **Annotate Step** (`AnnotationCanvas.tsx`): User annotates selected pages and exports results

### Key State Management
- `session`: Contains session_id, filename, total_pages, and base64-encoded page thumbnails
- `selectedPages`: Array of page indices to annotate
- `highResPages`: Object mapping page index to high-resolution base64 images (used during annotation)
- `currentStep`: Controls which component is rendered ('upload' | 'select' | 'annotate')

### Type System
Core types are defined in `src/types.ts`:
- `Session`: Backend session data with page thumbnails
- `PageSelection`: Page selection payload for API
- `Annotation`: Annotation data structure for saving
- `CanvasAnnotation`: Contains paths and text annotations
- `Path`, `Point`, `TextAnnotation`: Drawing primitives

### Canvas Implementation (AnnotationCanvas.tsx)
- Uses **Fabric.js** for canvas manipulation (drawing, text, etc.)
- Canvas dimensions: 2550x3300px (US Letter at 300 DPI)
- Drawing modes: pen, highlight (with transparency), text
- PDF page images are loaded as non-interactive background images
- Annotations are saved as Fabric.js JSON format
- Export functionality creates multi-page PDFs using jsPDF by rendering each page with its annotations

### Canvas Lifecycle
1. Single Fabric.js canvas is created once on mount with a 100ms delay to ensure DOM readiness
2. Background image is swapped when user navigates between pages (annotations are cleared)
3. Annotations are saved per-page to the backend via `/api/save-annotation`
4. During PDF export, temporary canvases are created for each page to load saved annotations and render with the page image

### API Endpoints
Common to both implementations:
- `POST /api/upload-pdf`: Upload PDF, receive Session with thumbnails
- `POST /api/select-pages`: Save page selection
- `POST /api/save-annotation`: Save annotations for a page (Fabric.js JSON)
- `GET /api/session/:session_id`: Retrieve session data including saved annotations
- `GET /api/export/:session_id`: Export annotated pages as JSON

Database version additional endpoints:
- `POST /api/process-selected-pages`: Generate high-res versions of selected pages only
- `GET /api/beos`: List all BEOs in database (for future grid view)
- `WS /ws/:session_id`: WebSocket for real-time collaboration (in-memory version only)

## Styling

- **TailwindCSS** is used for styling (configured in `tailwind.config.js`)
- PostCSS processes Tailwind directives (configured in `postcss.config.js`)
- Custom CSS is in `src/App.css` and `src/index.css`

## Testing

- Testing stack: React Testing Library, Jest, @testing-library/user-event
- Test files should be co-located with components (e.g., `Component.test.tsx`)

## Development Setup

### Local Development
- Frontend: WebStorm IDE
- Backend: PyCharm Community Edition
- PostgreSQL: Running in Docker (`docker run --name beo-db ...`)
- Team OS: Windows desktop, Apple mobile, Mac for primary development

### Environment Configuration
Create `.env` file in frontend root:
```bash
# Local development
REACT_APP_API_URL=http://localhost:8000

# iPad/team testing (use ngrok)
REACT_APP_API_URL=https://your-ngrok-url.ngrok-free.app
```

### Testing on iPad
1. Start backend: `cd ../backend/venv && python main_db.py`
2. Start ngrok: `ngrok http 8000` (in separate terminal)
3. Update `.env` with ngrok URL
4. Start frontend: `npm start`
5. Access from iPad: `http://YOUR_MAC_IP:3000` (both devices on same WiFi)

## Future Development Roadmap

### Phase 1: Storage & Multi-Week Support (Weeks 1-2)
- ✅ PostgreSQL database setup
- ✅ File-based storage (thumbnails, high-res, originals)
- 🔲 Multi-week dropdown navigation
- 🔲 Week/year organization

### Phase 2: Weekly Grid View + Drag & Drop (Weeks 3-4)
- 🔲 7-day grid layout (Mon-Sun)
- 🔲 Drag BEOs between days
- 🔲 Reorder within day (saves `order_position`)
- 🔲 Status badges (New/Revision/Annotated/Approved)

### Phase 3: Page Sorting Within BEO (Week 5)
- 🔲 Reorder pages via thumbnail strip
- 🔲 Insert new pages between existing
- 🔲 Maintain page order in exports

### Phase 4: Revision Handling (Week 6)
- 🔲 Version detection and replacement
- 🔲 Version history (v1, v2, etc.)
- 🔲 Side-by-side version comparison

### Phase 5: Real-Time Collaboration (Weeks 7-8)
- 🔲 Live annotation updates via WebSocket
- 🔲 User presence indicators
- 🔲 Comment threads
- 🔲 @mentions and notifications

### Phase 6: Email Automation (Weeks 9-10)
- 🔲 Gmail API integration
- 🔲 Auto-process Friday weekly emails (7 PDFs)
- 🔲 Auto-process daily additions/revisions
- 🔲 Smart revision detection

### Phase 7: OPERA Integration (TBD)
- 🔲 Research OPERA API capabilities
- 🔲 Direct BEO ingestion (if API available)
- 🔲 OCR + parsing (if no API)

## Important Technical Notes

- **Canvas zoom affects brush width**: Brush width is divided by zoom factor to maintain consistent stroke appearance
- **Lazy loading strategy**: Low-res thumbnails (75 DPI) for page selection, high-res (300 DPI) only for selected pages
- **Export timing**: Temporary canvases created for each page to load saved annotations and render with page image
- **Fabric.js version**: Using v5.3.0 (v6 has breaking API changes)
- **File format**: PDFs converted to JPEG at 300 DPI for optimal balance of quality and speed
- **Storage location**: Backend files stored in `../backend/venv/storage/` (will move to Unraid for production)
- **Database**: PostgreSQL running in Docker, connection string in `database.py`
- **Annotation persistence**: Fabric.js objects serialized as JSON to `annotations` table