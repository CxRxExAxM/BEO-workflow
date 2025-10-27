from fastapi import FastAPI, UploadFile, File, Form, HTTPException, Depends
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse, FileResponse
from fastapi.staticfiles import StaticFiles
from pdf2image import convert_from_bytes
from pydantic import BaseModel
from typing import List, Dict, Optional
from sqlalchemy.orm import Session
from datetime import datetime
import base64
import io
from PIL import Image
import json
import uuid
import os
from pathlib import Path

# Import database components
from database import get_db, init_db, THUMBNAILS_DIR, HIGH_RES_DIR, ORIGINALS_DIR
from models import BEO, BEOPage, Annotation

app = FastAPI(title="Catering Workflow API - Database Edition")
# CORS middleware - allow all origins (can restrict later with specific domains)
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # Allow all origins for now
    allow_credentials=False,  # Must be False when allow_origins is "*"
    allow_methods=["*"],
    allow_headers=["*"],
)


# Initialize database on startup
@app.on_event("startup")
async def startup_event():
    init_db()
    print("Database initialized and ready!")


# Pydantic models for API
class SessionResponse(BaseModel):
    session_id: str
    filename: str
    total_pages: int
    pages: List[str]  # base64 encoded thumbnails


class PageSelection(BaseModel):
    session_id: str
    selected_pages: List[int]


class AnnotationData(BaseModel):
    session_id: str
    page_index: int
    annotation_data: dict


# Helper functions
def save_file(file_data: bytes, directory: str, filename: str) -> str:
    """Save file to disk and return relative path"""
    filepath = os.path.join(directory, filename)
    with open(filepath, 'wb') as f:
        f.write(file_data)
    return filename


def load_file_as_base64(directory: str, filename: str) -> str:
    """Load file from disk and return as base64"""
    filepath = os.path.join(directory, filename)
    with open(filepath, 'rb') as f:
        return base64.b64encode(f.read()).decode('utf-8')


@app.get("/api")
async def api_root():
    return {"message": "Catering Workflow API - Database Edition", "status": "running"}

@app.get("/")
async def root():
    """Serve the React app"""
    index_path = FRONTEND_BUILD_DIR / "index.html"
    if index_path.exists():
        return FileResponse(str(index_path))
    else:
        return {"message": "Frontend not built. Run 'npm run build' in frontend directory"}


def parse_filename_date(filename: str) -> dict:
    """
    Parse date from filename like '1028 Tuesday.pdf' or '1027 Monday.pdf'
    Returns dict with event_date, day_of_week, week_number, year
    """
    import re
    from datetime import datetime

    # Try to match pattern: MMDD DayName.pdf
    match = re.match(r'(\d{2})(\d{2})\s+(\w+)\.pdf', filename, re.IGNORECASE)

    if match:
        month = int(match.group(1))
        day = int(match.group(2))
        day_name = match.group(3).capitalize()

        # Assume current year or next year if date has passed
        now = datetime.now()
        year = now.year

        try:
            event_date = datetime(year, month, day)

            # If date is in the past by more than 6 months, assume next year
            if (now - event_date).days > 180:
                year += 1
                event_date = datetime(year, month, day)

            return {
                'event_date': event_date,
                'day_of_week': event_date.strftime("%A"),
                'week_number': event_date.isocalendar()[1],
                'year': year
            }
        except ValueError:
            # Invalid date
            pass

    return {}


@app.post("/api/upload-pdf", response_model=SessionResponse)
async def upload_pdf(
    file: UploadFile = File(...),
    file_type: str = Form("daily"),
    db: Session = Depends(get_db)
):
    """
    Upload a PDF and convert to LOW-RES thumbnails for page selection.
    Saves to database and disk storage.
    Auto-detects date from filename (e.g., '1028 Tuesday.pdf')
    """
    try:
        if not file.filename.endswith('.pdf'):
            raise HTTPException(status_code=400, detail="File must be a PDF")

        # Read PDF bytes
        pdf_bytes = await file.read()

        # Generate unique session ID
        session_id = str(uuid.uuid4())

        # Save original PDF to disk
        original_filename = f"{session_id}.pdf"
        save_file(pdf_bytes, ORIGINALS_DIR, original_filename)

        # Convert to LOW-RES thumbnails
        images = convert_from_bytes(pdf_bytes, fmt="jpeg", dpi=75)

        # Parse date from filename
        date_info = parse_filename_date(file.filename)

        # Create BEO record in database
        beo = BEO(
            session_id=session_id,
            filename=file.filename,
            total_pages=len(images),
            status="new",
            file_type=file_type,
            event_date=date_info.get('event_date'),
            day_of_week=date_info.get('day_of_week'),
            week_number=date_info.get('week_number'),
            year=date_info.get('year'),
        )
        db.add(beo)
        db.flush()  # Get the ID before committing

        # Save thumbnail images and create page records
        base64_thumbnails = []
        for idx, img in enumerate(images):
            # Save thumbnail to disk
            thumbnail_filename = f"{session_id}_thumb_{idx}.jpg"
            buffered = io.BytesIO()
            img.save(buffered, format="JPEG", quality=60)
            save_file(buffered.getvalue(), THUMBNAILS_DIR, thumbnail_filename)

            # Create page record
            page = BEOPage(
                beo_id=beo.id,
                page_index=idx,
                original_order=idx,
                thumbnail_path=thumbnail_filename,
            )
            db.add(page)

            # Convert to base64 for response
            img_base64 = base64.b64encode(buffered.getvalue()).decode("utf-8")
            base64_thumbnails.append(img_base64)

        db.commit()

        return SessionResponse(
            session_id=session_id,
            filename=file.filename,
            total_pages=len(images),
            pages=base64_thumbnails
        )

    except Exception as e:
        db.rollback()
        raise HTTPException(status_code=500, detail=f"PDF processing failed: {str(e)}")


class FileUploadItem(BaseModel):
    filename: str
    event_date: str  # ISO format date string
    file_type: str  # "daily" or "addition"


@app.post("/api/upload-multiple-pdfs")
async def upload_multiple_pdfs(
    files: List[UploadFile] = File(...),
    file_data: str = Form(None),  # JSON string with array of {filename, event_date, file_type}
    db: Session = Depends(get_db)
):
    """
    Upload multiple PDFs with user-specified dates and file types.
    Returns list of session responses.
    """
    try:
        # Parse the file data JSON
        import json
        import sys
        file_info_list = json.loads(file_data) if file_data else []

        print(f"DEBUG: Received file_data: {file_data}", file=sys.stderr, flush=True)
        print(f"DEBUG: Parsed file_info_list: {file_info_list}", file=sys.stderr, flush=True)

        # Create a map of filename to info
        file_info_map = {item['filename']: item for item in file_info_list}

        results = []

        for file in files:
            if not file.filename.endswith('.pdf'):
                continue  # Skip non-PDF files

            # Get info for this file
            file_info = file_info_map.get(file.filename, {})
            event_date_str = file_info.get('event_date')
            file_type = file_info.get('file_type', 'daily')

            # Parse the event date
            event_date = None
            day_of_week = None
            week_number = None
            year = None

            if event_date_str:
                try:
                    from datetime import datetime
                    # Handle both "2025-10-30" and "2025-10-30T00:00:00" formats
                    if 'T' not in event_date_str:
                        event_date_str = event_date_str + 'T00:00:00'
                    event_date = datetime.fromisoformat(event_date_str.replace('Z', '+00:00'))
                    day_of_week = event_date.strftime("%A")
                    week_number = event_date.isocalendar()[1]
                    year = event_date.year
                except Exception as e:
                    print(f"Failed to parse date '{event_date_str}' for {file.filename}: {e}", flush=True)
                    pass

            # Read PDF bytes
            pdf_bytes = await file.read()

            # Generate unique session ID
            session_id = str(uuid.uuid4())

            # Save original PDF to disk
            original_filename = f"{session_id}.pdf"
            save_file(pdf_bytes, ORIGINALS_DIR, original_filename)

            # Convert to LOW-RES thumbnails
            images = convert_from_bytes(pdf_bytes, fmt="jpeg", dpi=75)

            # Create BEO record in database
            beo = BEO(
                session_id=session_id,
                filename=file.filename,
                total_pages=len(images),
                status="new",
                file_type=file_type,
                event_date=event_date,
                day_of_week=day_of_week,
                week_number=week_number,
                year=year,
            )
            db.add(beo)
            db.flush()

            # Save thumbnail images and create page records
            base64_thumbnails = []
            for idx, img in enumerate(images):
                # Save thumbnail to disk
                thumbnail_filename = f"{session_id}_thumb_{idx}.jpg"
                buffered = io.BytesIO()
                img.save(buffered, format="JPEG", quality=60)
                save_file(buffered.getvalue(), THUMBNAILS_DIR, thumbnail_filename)

                # Create page record
                page = BEOPage(
                    beo_id=beo.id,
                    page_index=idx,
                    original_order=idx,
                    thumbnail_path=thumbnail_filename,
                )
                db.add(page)

                # Convert to base64 for response
                img_base64 = base64.b64encode(buffered.getvalue()).decode("utf-8")
                base64_thumbnails.append(img_base64)

            results.append({
                "session_id": session_id,
                "filename": file.filename,
                "total_pages": len(images),
                "pages": base64_thumbnails,
                "event_date": event_date.isoformat() if event_date else None,
                "file_type": file_type
            })

        db.commit()
        return {"results": results, "count": len(results)}

    except Exception as e:
        db.rollback()
        raise HTTPException(status_code=500, detail=f"Multi-file upload failed: {str(e)}")


class ProcessAllPagesRequest(BaseModel):
    session_ids: List[str]  # List of session IDs to process


@app.post("/api/process-all-pages")
async def process_all_pages(request: ProcessAllPagesRequest, db: Session = Depends(get_db)):
    """
    Process all pages from multiple uploads directly to high-res BEOs.
    Skips the page selection step - keeps all pages.
    Used for batch uploads where user doesn't need to review/discard pages.
    """
    try:
        processed_beos = []

        for session_id in request.session_ids:
            # Get the upload session
            upload_beo = db.query(BEO).filter(BEO.session_id == session_id).first()
            if not upload_beo:
                continue

            # Load original PDF
            original_path = os.path.join(ORIGINALS_DIR, f"{session_id}.pdf")
            if not os.path.exists(original_path):
                continue

            with open(original_path, 'rb') as f:
                pdf_bytes = f.read()

            # Convert all pages to high-res
            images = convert_from_bytes(pdf_bytes, fmt="jpeg", dpi=300)

            # Create a new BEO from all pages
            new_session_id = str(uuid.uuid4())
            beo_number = f"BEO 1"  # Auto-generated number

            new_beo = BEO(
                session_id=new_session_id,
                filename=upload_beo.filename,
                beo_number=beo_number,
                total_pages=len(images),
                status="ready_for_annotation",
                file_type=upload_beo.file_type,
                event_date=upload_beo.event_date,
                day_of_week=upload_beo.day_of_week,
                week_number=upload_beo.week_number,
                year=upload_beo.year,
                order_position=0,
            )
            db.add(new_beo)
            db.flush()

            # Save all pages as high-res
            for idx, img in enumerate(images):
                # Save high-res to disk
                highres_filename = f"{new_session_id}_highres_{idx}.jpg"
                buffered = io.BytesIO()
                img.save(buffered, format="JPEG", quality=95)
                save_file(buffered.getvalue(), HIGH_RES_DIR, highres_filename)

                # Save thumbnail
                thumb_img = convert_from_bytes(pdf_bytes, fmt="jpeg", dpi=75, first_page=idx+1, last_page=idx+1)[0]
                thumbnail_filename = f"{new_session_id}_thumb_{idx}.jpg"
                thumb_buffered = io.BytesIO()
                thumb_img.save(thumb_buffered, format="JPEG", quality=60)
                save_file(thumb_buffered.getvalue(), THUMBNAILS_DIR, thumbnail_filename)

                # Create page record
                page = BEOPage(
                    beo_id=new_beo.id,
                    page_index=idx,
                    original_order=idx,
                    thumbnail_path=thumbnail_filename,
                    high_res_path=highres_filename,
                )
                db.add(page)

            processed_beos.append({
                "session_id": new_session_id,
                "filename": upload_beo.filename,
                "total_pages": len(images),
                "event_date": upload_beo.event_date.isoformat() if upload_beo.event_date else None
            })

        db.commit()
        return {"status": "success", "processed_count": len(processed_beos), "beos": processed_beos}

    except Exception as e:
        db.rollback()
        raise HTTPException(status_code=500, detail=f"Processing failed: {str(e)}")


@app.post("/api/select-pages")
async def select_pages(selection: PageSelection, db: Session = Depends(get_db)):
    """Save which pages user wants to keep"""
    beo = db.query(BEO).filter(BEO.session_id == selection.session_id).first()
    if not beo:
        raise HTTPException(status_code=404, detail="Session not found")

    # Update BEO status
    beo.status = "selected"
    beo.updated_at = datetime.utcnow()
    db.commit()

    return {
        "status": "success",
        "selected_count": len(selection.selected_pages),
        "message": "Ready for high-res processing"
    }


@app.post("/api/process-selected-pages")
async def process_selected_pages(selection: PageSelection, db: Session = Depends(get_db)):
    """
    Convert ONLY selected pages to high resolution for annotation.
    """
    beo = db.query(BEO).filter(BEO.session_id == selection.session_id).first()
    if not beo:
        raise HTTPException(status_code=404, detail="Session not found")

    # Load original PDF
    original_path = os.path.join(ORIGINALS_DIR, f"{selection.session_id}.pdf")
    with open(original_path, 'rb') as f:
        pdf_bytes = f.read()

    # Convert to high-res
    images = convert_from_bytes(pdf_bytes, fmt="jpeg", dpi=300)

    high_res_pages = {}
    for page_idx in selection.selected_pages:
        if page_idx < len(images):
            img = images[page_idx]

            # Save high-res to disk
            highres_filename = f"{selection.session_id}_highres_{page_idx}.jpg"
            buffered = io.BytesIO()
            img.save(buffered, format="JPEG", quality=95)
            save_file(buffered.getvalue(), HIGH_RES_DIR, highres_filename)

            # Update page record with high-res path
            page = db.query(BEOPage).filter(
                BEOPage.beo_id == beo.id,
                BEOPage.page_index == page_idx
            ).first()
            if page:
                page.high_res_path = highres_filename

            # Convert to base64 for response
            img_base64 = base64.b64encode(buffered.getvalue()).decode("utf-8")
            high_res_pages[page_idx] = img_base64

    beo.status = "ready_for_annotation"
    beo.updated_at = datetime.utcnow()
    db.commit()

    return {
        "status": "success",
        "processed_pages": len(selection.selected_pages),
        "high_res_pages": high_res_pages
    }


@app.post("/api/save-annotation")
async def save_annotation(annotation: AnnotationData, db: Session = Depends(get_db)):
    """Save annotation for a specific page"""
    beo = db.query(BEO).filter(BEO.session_id == annotation.session_id).first()
    if not beo:
        raise HTTPException(status_code=404, detail="Session not found")

    # Check if annotation exists for this page
    existing = db.query(Annotation).filter(
        Annotation.beo_id == beo.id,
        Annotation.page_index == annotation.page_index
    ).first()

    if existing:
        # Update existing annotation
        existing.canvas_data = annotation.annotation_data
        existing.updated_at = datetime.utcnow()
    else:
        # Create new annotation
        new_annotation = Annotation(
            beo_id=beo.id,
            page_index=annotation.page_index,
            canvas_data=annotation.annotation_data
        )
        db.add(new_annotation)

    beo.status = "annotated"
    beo.updated_at = datetime.utcnow()
    db.commit()

    return {"status": "success"}


@app.get("/api/session/{session_id}")
async def get_session(session_id: str, db: Session = Depends(get_db)):
    """Retrieve session data including annotations"""
    beo = db.query(BEO).filter(BEO.session_id == session_id).first()
    if not beo:
        raise HTTPException(status_code=404, detail="Session not found")

    # Get all annotations for this BEO
    annotations = db.query(Annotation).filter(Annotation.beo_id == beo.id).all()

    # Build annotations dict by page index
    annotations_dict = {}
    for ann in annotations:
        annotations_dict[ann.page_index] = ann.canvas_data

    # Get all pages
    pages = db.query(BEOPage).filter(BEOPage.beo_id == beo.id).order_by(BEOPage.page_index).all()

    return {
        "session_id": beo.session_id,
        "filename": beo.filename,
        "total_pages": beo.total_pages,
        "status": beo.status,
        "annotations": annotations_dict,
        "created_at": beo.created_at.isoformat(),
        "updated_at": beo.updated_at.isoformat(),
    }


@app.get("/api/beos/{session_id}/pages")
async def get_beo_pages(session_id: str, db: Session = Depends(get_db)):
    """Get all high-res pages for a BEO"""
    beo = db.query(BEO).filter(BEO.session_id == session_id).first()
    if not beo:
        raise HTTPException(status_code=404, detail="BEO not found")

    # Get all pages for this BEO
    pages = db.query(BEOPage).filter(BEOPage.beo_id == beo.id).order_by(BEOPage.page_index).all()

    # Return URLs to high-res images instead of base64 data
    high_res_pages = {}
    for page in pages:
        if page.high_res_path:
            # Return URL path instead of base64
            high_res_pages[page.page_index] = f"/storage/high_res/{page.high_res_path}"

    return {
        "session_id": beo.session_id,
        "beo_number": beo.beo_number,
        "filename": beo.filename,
        "total_pages": beo.total_pages,
        "high_res_pages": high_res_pages
    }


@app.get("/api/export/{session_id}")
async def export_session(session_id: str, db: Session = Depends(get_db)):
    """Export annotated pages data"""
    beo = db.query(BEO).filter(BEO.session_id == session_id).first()
    if not beo:
        raise HTTPException(status_code=404, detail="Session not found")

    # Get pages and annotations
    pages = db.query(BEOPage).filter(BEOPage.beo_id == beo.id).order_by(BEOPage.page_index).all()
    annotations = db.query(Annotation).filter(Annotation.beo_id == beo.id).all()

    # Build annotations dict
    annotations_dict = {ann.page_index: ann.canvas_data for ann in annotations}

    export_data = {
        "filename": beo.filename,
        "pages": []
    }

    for page in pages:
        # Load high-res image if available
        if page.high_res_path:
            image_base64 = load_file_as_base64(HIGH_RES_DIR, page.high_res_path)
        else:
            image_base64 = load_file_as_base64(THUMBNAILS_DIR, page.thumbnail_path)

        page_data = {
            "page_number": page.page_index + 1,
            "image": image_base64,
            "annotations": annotations_dict.get(page.page_index, {})
        }
        export_data["pages"].append(page_data)

    return export_data


@app.get("/api/beos")
async def list_beos(db: Session = Depends(get_db)):
    """List all BEOs in database (for future grid view)"""
    beos = db.query(BEO).order_by(BEO.created_at.desc()).all()

    return {
        "count": len(beos),
        "beos": [
            {
                "session_id": beo.session_id,
                "filename": beo.filename,
                "total_pages": beo.total_pages,
                "status": beo.status,
                "created_at": beo.created_at.isoformat(),
            }
            for beo in beos
        ]
    }


# Pydantic models for BEO metadata
class BEOMetadata(BaseModel):
    session_id: str
    beo_number: Optional[str] = None  # Last 3-4 digits or full 7-digit BEO#
    event_date: Optional[str] = None  # ISO format date string
    order_position: Optional[int] = None


class BEOReorder(BaseModel):
    session_id: str
    event_date: str  # ISO format date string
    order_position: int


class CreateBEOFromPages(BaseModel):
    parent_session_id: str  # Original upload session
    beo_number: str
    page_indices: List[int]
    order_position: int


@app.post("/api/beos/create-from-pages")
async def create_beo_from_pages(data: CreateBEOFromPages, db: Session = Depends(get_db)):
    """Create a new BEO from specific pages of an uploaded PDF"""
    # Get the parent BEO (original upload)
    parent_beo = db.query(BEO).filter(BEO.session_id == data.parent_session_id).first()
    if not parent_beo:
        raise HTTPException(status_code=404, detail="Parent session not found")

    # Generate new session ID for this BEO
    new_session_id = str(uuid.uuid4())

    # Load original PDF
    original_path = os.path.join(ORIGINALS_DIR, f"{data.parent_session_id}.pdf")
    with open(original_path, 'rb') as f:
        pdf_bytes = f.read()

    # Convert to high-res for selected pages
    images = convert_from_bytes(pdf_bytes, fmt="jpeg", dpi=300)

    # Create new BEO record
    new_beo = BEO(
        session_id=new_session_id,
        filename=parent_beo.filename,
        beo_number=data.beo_number,
        total_pages=len(data.page_indices),
        status="ready_for_annotation",
        file_type=parent_beo.file_type,  # Inherit file type from parent
        event_date=parent_beo.event_date,
        day_of_week=parent_beo.day_of_week,
        week_number=parent_beo.week_number,
        year=parent_beo.year,
        order_position=data.order_position,
    )
    db.add(new_beo)
    db.flush()

    # Save high-res pages
    for new_idx, original_idx in enumerate(data.page_indices):
        if original_idx < len(images):
            img = images[original_idx]

            # Save high-res to disk
            highres_filename = f"{new_session_id}_highres_{new_idx}.jpg"
            buffered = io.BytesIO()
            img.save(buffered, format="JPEG", quality=95)
            save_file(buffered.getvalue(), HIGH_RES_DIR, highres_filename)

            # Also save thumbnail
            thumb_img = convert_from_bytes(pdf_bytes, fmt="jpeg", dpi=75, first_page=original_idx+1, last_page=original_idx+1)[0]
            thumbnail_filename = f"{new_session_id}_thumb_{new_idx}.jpg"
            thumb_buffered = io.BytesIO()
            thumb_img.save(thumb_buffered, format="JPEG", quality=60)
            save_file(thumb_buffered.getvalue(), THUMBNAILS_DIR, thumbnail_filename)

            # Create page record
            page = BEOPage(
                beo_id=new_beo.id,
                page_index=new_idx,
                original_order=original_idx,
                thumbnail_path=thumbnail_filename,
                high_res_path=highres_filename,
            )
            db.add(page)

    db.commit()

    return {"status": "success", "session_id": new_session_id, "beo_number": data.beo_number}


@app.get("/api/beos/week/{year}/{week_number}")
async def get_week_beos(year: int, week_number: int, db: Session = Depends(get_db)):
    """
    Get all BEOs for a specific week, organized by day.
    Returns a dict with day-of-week keys (Monday-Sunday).
    """
    from datetime import datetime, timedelta

    # Calculate week start/end dates
    # Week 1 is the first week containing a Thursday
    jan_4 = datetime(year, 1, 4)
    week_start = jan_4 - timedelta(days=jan_4.weekday()) + timedelta(weeks=week_number - 1)
    week_end = week_start + timedelta(days=6)

    # Query BEOs in this date range
    beos = db.query(BEO).filter(
        BEO.event_date >= week_start,
        BEO.event_date <= week_end,
        BEO.is_active == True
    ).order_by(BEO.event_date, BEO.order_position).all()

    # Organize by day of week
    days = {
        "Monday": [],
        "Tuesday": [],
        "Wednesday": [],
        "Thursday": [],
        "Friday": [],
        "Saturday": [],
        "Sunday": []
    }

    for beo in beos:
        if beo.event_date and beo.day_of_week:
            # Get first page thumbnail
            first_page = db.query(BEOPage).filter(
                BEOPage.beo_id == beo.id,
                BEOPage.page_index == 0
            ).first()

            thumbnail_base64 = None
            if first_page and first_page.thumbnail_path:
                thumbnail_base64 = load_file_as_base64(THUMBNAILS_DIR, first_page.thumbnail_path)

            # Get annotation count
            annotation_count = db.query(Annotation).filter(
                Annotation.beo_id == beo.id
            ).count()

            beo_data = {
                "session_id": beo.session_id,
                "filename": beo.filename,
                "beo_number": beo.beo_number or beo.session_id[:7],  # Use beo_number if set, else first 7 chars of session_id
                "event_date": beo.event_date.isoformat() if beo.event_date else None,
                "order_position": beo.order_position,
                "status": beo.status,
                "total_pages": beo.total_pages,
                "annotation_count": annotation_count,
                "thumbnail": thumbnail_base64,
                "created_at": beo.created_at.isoformat(),
            }

            if beo.day_of_week in days:
                days[beo.day_of_week].append(beo_data)

    return {
        "year": year,
        "week_number": week_number,
        "week_start": week_start.isoformat(),
        "week_end": week_end.isoformat(),
        "days": days
    }


@app.get("/api/beos/day/{date}")
async def get_day_beos(date: str, db: Session = Depends(get_db)):
    """
    Get all BEOs for a specific date (YYYY-MM-DD format).
    Returns BEOs ordered by order_position.
    """
    from datetime import datetime

    try:
        # Parse date string
        target_date = datetime.fromisoformat(date).date()
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid date format. Use YYYY-MM-DD")

    # Query BEOs for this date
    beos = db.query(BEO).filter(
        BEO.event_date >= datetime.combine(target_date, datetime.min.time()),
        BEO.event_date < datetime.combine(target_date, datetime.max.time()),
        BEO.is_active == True
    ).order_by(BEO.order_position).all()

    beo_list = []
    for beo in beos:
        # Get first page thumbnail
        first_page = db.query(BEOPage).filter(
            BEOPage.beo_id == beo.id,
            BEOPage.page_index == 0
        ).first()

        thumbnail_base64 = None
        if first_page and first_page.thumbnail_path:
            thumbnail_base64 = load_file_as_base64(THUMBNAILS_DIR, first_page.thumbnail_path)

        # Get annotation count
        annotation_count = db.query(Annotation).filter(
            Annotation.beo_id == beo.id
        ).count()

        beo_data = {
            "session_id": beo.session_id,
            "filename": beo.filename,
            "beo_number": beo.beo_number or beo.session_id[:7],
            "event_date": beo.event_date.isoformat() if beo.event_date else None,
            "order_position": beo.order_position,
            "status": beo.status,
            "total_pages": beo.total_pages,
            "annotation_count": annotation_count,
            "thumbnail": thumbnail_base64,
            "created_at": beo.created_at.isoformat(),
        }
        beo_list.append(beo_data)

    return {
        "date": date,
        "beos": beo_list
    }


@app.patch("/api/beos/metadata")
async def update_beo_metadata(metadata: BEOMetadata, db: Session = Depends(get_db)):
    """Update BEO metadata (BEO#, event date, etc.)"""
    beo = db.query(BEO).filter(BEO.session_id == metadata.session_id).first()
    if not beo:
        raise HTTPException(status_code=404, detail="BEO not found")

    # Update fields if provided
    if metadata.beo_number is not None:
        beo.beo_number = metadata.beo_number

    if metadata.event_date is not None:
        event_dt = datetime.fromisoformat(metadata.event_date)
        beo.event_date = event_dt
        beo.day_of_week = event_dt.strftime("%A")  # Monday, Tuesday, etc.
        beo.week_number = event_dt.isocalendar()[1]
        beo.year = event_dt.year

    if metadata.order_position is not None:
        beo.order_position = metadata.order_position

    beo.updated_at = datetime.utcnow()
    db.commit()

    return {"status": "success", "message": "BEO metadata updated"}


@app.post("/api/beos/reorder")
async def reorder_beo(reorder: BEOReorder, db: Session = Depends(get_db)):
    """Move a BEO to a different day and/or position"""
    beo = db.query(BEO).filter(BEO.session_id == reorder.session_id).first()
    if not beo:
        raise HTTPException(status_code=404, detail="BEO not found")

    # Parse new event date
    new_date = datetime.fromisoformat(reorder.event_date)

    # Update BEO
    beo.event_date = new_date
    beo.day_of_week = new_date.strftime("%A")
    beo.week_number = new_date.isocalendar()[1]
    beo.year = new_date.year
    beo.order_position = reorder.order_position
    beo.updated_at = datetime.utcnow()

    # Reorder other BEOs on the same day
    same_day_beos = db.query(BEO).filter(
        BEO.event_date == new_date,
        BEO.session_id != reorder.session_id,
        BEO.is_active == True
    ).order_by(BEO.order_position).all()

    # Adjust positions of other BEOs
    for idx, other_beo in enumerate(same_day_beos):
        if idx >= reorder.order_position:
            other_beo.order_position = idx + 1
        else:
            other_beo.order_position = idx

    db.commit()

    return {"status": "success", "message": "BEO reordered successfully"}


@app.delete("/api/beos/{session_id}")
async def delete_beo(session_id: str, db: Session = Depends(get_db)):
    """Delete a BEO and all its associated data"""
    beo = db.query(BEO).filter(BEO.session_id == session_id).first()
    if not beo:
        raise HTTPException(status_code=404, detail="BEO not found")

    # Delete associated pages (cascade should handle this, but explicit is better)
    db.query(BEOPage).filter(BEOPage.beo_id == beo.id).delete()

    # Delete associated annotations
    db.query(Annotation).filter(Annotation.beo_id == beo.id).delete()

    # Delete the BEO itself
    db.delete(beo)
    db.commit()

    return {"status": "success", "message": "BEO deleted successfully"}


# Serve React build files
# Get the path to the frontend build directory
FRONTEND_BUILD_DIR = Path(__file__).parent.parent.parent / "frontend" / "build"

# Mount static files (JS, CSS, images, etc.)
if FRONTEND_BUILD_DIR.exists():
    app.mount("/static", StaticFiles(directory=str(FRONTEND_BUILD_DIR / "static")), name="static")

# Mount storage directories for serving images
app.mount("/storage/high_res", StaticFiles(directory=str(HIGH_RES_DIR)), name="high_res")
app.mount("/storage/thumbnails", StaticFiles(directory=str(THUMBNAILS_DIR)), name="thumbnails")
app.mount("/storage/originals", StaticFiles(directory=str(ORIGINALS_DIR)), name="originals")

if FRONTEND_BUILD_DIR.exists():
    # Serve index.html for the root and any other routes (SPA catch-all)
    @app.get("/{full_path:path}")
    async def serve_react_app(full_path: str):
        # If it's an API route, let FastAPI handle it normally
        if full_path.startswith("api/"):
            raise HTTPException(status_code=404, detail="API endpoint not found")

        # For all other routes, serve index.html (React Router will handle it)
        index_path = FRONTEND_BUILD_DIR / "index.html"
        if index_path.exists():
            return FileResponse(str(index_path))
        else:
            raise HTTPException(status_code=404, detail="Frontend not found")
else:
    print(f"Warning: Frontend build directory not found at {FRONTEND_BUILD_DIR}")
    print("Run 'npm run build' in the frontend directory")


if __name__ == "__main__":
    import uvicorn

    # Remove reload when running directly
    uvicorn.run("main_db:app", host="0.0.0.0", port=8000, reload=True)