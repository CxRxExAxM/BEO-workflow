from fastapi import FastAPI, UploadFile, File, HTTPException, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from pdf2image import convert_from_bytes
from pydantic import BaseModel
from typing import List, Dict, Optional
import base64
import io
from PIL import Image
import json
import uuid

app = FastAPI(title="Catering Workflow API")

# CORS middleware - allows React frontend to connect
app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:3000",
        "http://172.16.3.124:3000",  # Your Mac's local IP
        "https://marvin-challengeable-ligamentously.ngrok-free.dev",  # Your ngrok URL
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# In-memory storage (replace with database later)
sessions: Dict[str, dict] = {}
active_connections: Dict[str, List[WebSocket]] = {}


# Pydantic models for request/response validation
class Session(BaseModel):
    session_id: str
    filename: str
    total_pages: int
    pages: List[str]  # base64 encoded images


class PageSelection(BaseModel):
    session_id: str
    selected_pages: List[int]  # 0-indexed page numbers


class Annotation(BaseModel):
    session_id: str
    page_index: int
    annotation_data: dict  # JSON data from canvas (paths, text, etc.)


class AnnotationUpdate(BaseModel):
    session_id: str
    page_index: int
    user_id: str
    annotation_data: dict


@app.get("/")
async def root():
    return {"message": "Catering Workflow API", "status": "running"}


@app.post("/api/upload-pdf", response_model=Session)
async def upload_pdf(file: UploadFile = File(...)):
    """
    Upload a PDF and convert it to images.
    Returns a session ID and base64-encoded page images.
    """
    try:
        # Validate file type
        if not file.filename.endswith('.pdf'):
            raise HTTPException(status_code=400, detail="File must be a PDF")

        # Read PDF bytes
        pdf_bytes = await file.read()

        # Convert PDF to images with higher DPI for better quality
        images = convert_from_bytes(pdf_bytes, fmt="jpeg", dpi=300)  # Increased from 150 to 300

        # Generate session ID
        session_id = str(uuid.uuid4())

        # Convert images to base64
        base64_images = []
        for img in images:
            buffered = io.BytesIO()
            img.save(buffered, format="jpeg")
            img_base64 = base64.b64encode(buffered.getvalue()).decode("utf-8")
            base64_images.append(img_base64)

        # Store session data
        sessions[session_id] = {
            "filename": file.filename,
            "total_pages": len(images),
            "pages": base64_images,
            "selected_pages": list(range(len(images))),  # All selected by default
            "annotations": {}  # {page_index: annotation_data}
        }

        return Session(
            session_id=session_id,
            filename=file.filename,
            total_pages=len(images),
            pages=base64_images
        )

    except Exception as e:
        raise HTTPException(status_code=500, detail=f"PDF processing failed: {str(e)}")


@app.post("/api/select-pages")
async def select_pages(selection: PageSelection):
    """
    Save which pages the user wants to keep.
    """
    if selection.session_id not in sessions:
        raise HTTPException(status_code=404, detail="Session not found")

    sessions[selection.session_id]["selected_pages"] = selection.selected_pages

    return {
        "status": "success",
        "selected_count": len(selection.selected_pages)
    }


@app.post("/api/save-annotation")
async def save_annotation(annotation: Annotation):
    """
    Save annotation data for a specific page.
    """
    if annotation.session_id not in sessions:
        raise HTTPException(status_code=404, detail="Session not found")

    # Store annotation
    if "annotations" not in sessions[annotation.session_id]:
        sessions[annotation.session_id]["annotations"] = {}

    sessions[annotation.session_id]["annotations"][annotation.page_index] = annotation.annotation_data

    # Broadcast to other users via WebSocket (if any connected)
    await broadcast_annotation_update(
        annotation.session_id,
        annotation.page_index,
        annotation.annotation_data
    )

    return {"status": "success"}


@app.get("/api/session/{session_id}")
async def get_session(session_id: str):
    """
    Retrieve session data including annotations.
    """
    if session_id not in sessions:
        raise HTTPException(status_code=404, detail="Session not found")

    return sessions[session_id]


@app.get("/api/export/{session_id}")
async def export_session(session_id: str):
    """
    Export annotated pages as JSON (can be extended to create images/PDF).
    """
    if session_id not in sessions:
        raise HTTPException(status_code=404, detail="Session not found")

    session_data = sessions[session_id]
    selected_pages = session_data["selected_pages"]

    export_data = {
        "filename": session_data["filename"],
        "pages": []
    }

    for page_idx in selected_pages:
        page_data = {
            "page_number": page_idx + 1,
            "image": session_data["pages"][page_idx],
            "annotations": session_data["annotations"].get(page_idx, {})
        }
        export_data["pages"].append(page_data)

    return export_data


# WebSocket for real-time collaboration
@app.websocket("/ws/{session_id}")
async def websocket_endpoint(websocket: WebSocket, session_id: str):
    """
    WebSocket connection for real-time annotation updates.
    """
    await websocket.accept()

    # Add to active connections
    if session_id not in active_connections:
        active_connections[session_id] = []
    active_connections[session_id].append(websocket)

    try:
        while True:
            # Receive annotation updates from client
            data = await websocket.receive_text()
            annotation_update = json.loads(data)

            # Broadcast to all other connected clients
            for connection in active_connections[session_id]:
                if connection != websocket:
                    await connection.send_text(data)

    except WebSocketDisconnect:
        active_connections[session_id].remove(websocket)
        if not active_connections[session_id]:
            del active_connections[session_id]


async def broadcast_annotation_update(session_id: str, page_index: int, annotation_data: dict):
    """
    Broadcast annotation updates to all connected WebSocket clients.
    """
    if session_id in active_connections:
        message = json.dumps({
            "type": "annotation_update",
            "page_index": page_index,
            "annotation_data": annotation_data
        })

        for connection in active_connections[session_id]:
            try:
                await connection.send_text(message)
            except:
                pass


if __name__ == "__main__":
    import uvicorn

    uvicorn.run(app, host="0.0.0.0", port=8000, reload=True)