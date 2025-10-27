# backend/models.py

from sqlalchemy import Column, Integer, String, DateTime, Boolean, Text, ForeignKey, JSON
from sqlalchemy.ext.declarative import declarative_base
from sqlalchemy.orm import relationship
from datetime import datetime

Base = declarative_base()


class BEO(Base):
    """Main BEO document"""
    __tablename__ = "beos"

    id = Column(Integer, primary_key=True, index=True)
    session_id = Column(String, unique=True, index=True)  # Keep for backward compatibility
    filename = Column(String, nullable=False)
    beo_number = Column(String, nullable=True, index=True)  # 7-digit BEO number

    # Event details
    event_date = Column(DateTime, nullable=True)  # Actual event date
    day_of_week = Column(String, nullable=True)  # Monday, Tuesday, etc.
    week_number = Column(Integer, nullable=True)  # Week of year
    year = Column(Integer, nullable=True)

    # Organization
    order_position = Column(Integer, default=0)  # Position within the day

    # Status
    status = Column(String, default="new")  # new, annotated, approved, archived
    file_type = Column(String, default="daily")  # daily, addition
    is_revision = Column(Boolean, default=False)
    parent_beo_id = Column(Integer, ForeignKey("beos.id"), nullable=True)

    # Version tracking
    version_number = Column(Integer, default=1)
    is_active = Column(Boolean, default=True)

    # Metadata
    total_pages = Column(Integer, nullable=False)
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    # Relationships
    pages = relationship("BEOPage", back_populates="beo", cascade="all, delete-orphan")
    annotations = relationship("Annotation", back_populates="beo", cascade="all, delete-orphan")
    parent = relationship("BEO", remote_side=[id], backref="revisions")


class BEOPage(Base):
    """Individual pages of a BEO"""
    __tablename__ = "beo_pages"

    id = Column(Integer, primary_key=True, index=True)
    beo_id = Column(Integer, ForeignKey("beos.id"), nullable=False)

    page_index = Column(Integer, nullable=False)  # 0-indexed position
    original_order = Column(Integer, nullable=False)  # Original page number from PDF

    # File paths (relative to storage root)
    thumbnail_path = Column(String, nullable=True)
    high_res_path = Column(String, nullable=True)

    created_at = Column(DateTime, default=datetime.utcnow)

    # Relationships
    beo = relationship("BEO", back_populates="pages")


class Annotation(Base):
    """Annotations on BEO pages"""
    __tablename__ = "annotations"

    id = Column(Integer, primary_key=True, index=True)
    beo_id = Column(Integer, ForeignKey("beos.id"), nullable=False)
    page_index = Column(Integer, nullable=False)

    # Fabric.js canvas data stored as JSON
    canvas_data = Column(JSON, nullable=False)

    # Metadata
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    # Relationships
    beo = relationship("BEO", back_populates="annotations")


class Week(Base):
    """Week groupings for organization"""
    __tablename__ = "weeks"

    id = Column(Integer, primary_key=True, index=True)
    week_number = Column(Integer, nullable=False)
    year = Column(Integer, nullable=False)
    start_date = Column(DateTime, nullable=False)
    end_date = Column(DateTime, nullable=False)

    created_at = Column(DateTime, default=datetime.utcnow)