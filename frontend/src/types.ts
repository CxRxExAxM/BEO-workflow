// src/types.ts

export interface Session {
    session_id: string;
    filename: string;
    total_pages: number;
    pages: string[]; // base64 encoded images
}

export interface PageSelection {
    session_id: string;
    selected_pages: number[];
}

export interface Annotation {
    session_id: string;
    page_index: number;
    annotation_data: CanvasAnnotation;
}

export interface CanvasAnnotation {
    paths: Path[];
    texts: TextAnnotation[];
}

export interface Path {
    id: string;
    points: Point[];
    color: string;
    width: number;
}

export interface Point {
    x: number;
    y: number;
}

export interface TextAnnotation {
    id: string;
    text: string;
    x: number;
    y: number;
    color: string;
    fontSize: number;
}