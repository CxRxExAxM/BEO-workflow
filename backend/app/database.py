# backend/database.py

from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from models import Base
import os

# Database URL - change based on environment
DATABASE_URL = os.getenv(
    "DATABASE_URL",
    "postgresql://postgres:devpassword@localhost:5432/beo_app"
)

# Storage paths
STORAGE_ROOT = os.getenv("STORAGE_ROOT", "./storage")
THUMBNAILS_DIR = os.path.join(STORAGE_ROOT, "thumbnails")
HIGH_RES_DIR = os.path.join(STORAGE_ROOT, "high_res")
ORIGINALS_DIR = os.path.join(STORAGE_ROOT, "originals")

# Create directories if they don't exist
for directory in [STORAGE_ROOT, THUMBNAILS_DIR, HIGH_RES_DIR, ORIGINALS_DIR]:
    os.makedirs(directory, exist_ok=True)

# Create database engine
engine = create_engine(DATABASE_URL)

# Create session factory
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)


def init_db():
    """Initialize database tables"""
    Base.metadata.create_all(bind=engine)
    print("Database tables created successfully!")


def get_db():
    """Dependency for FastAPI to get database session"""
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()