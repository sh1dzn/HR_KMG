"""
Documents (ВНД) API — CRUD + file upload with auto-indexing
"""
import asyncio
import logging
from datetime import datetime, date, timezone
from typing import List, Optional
from uuid import uuid4

from fastapi import APIRouter, Depends, File, Form, HTTPException, Query, UploadFile, status
from sqlalchemy import asc, desc
from sqlalchemy.orm import Session
from pydantic import BaseModel, Field

from app.database import get_db
from app.dependencies.auth import get_current_user, require_role
from app.models.document import Document, DocumentType
from app.models.department import Department
from app.models.user import User
from app.services.document_parser import extract_text
from app.services.rag_service import rag_service

logger = logging.getLogger("hr_ai.documents")

router = APIRouter()

# ── Schemas ─────────────────────────────────────────────────────────────────────

DOC_TYPE_LABELS = {
    "vnd": "ВНД",
    "strategy": "Стратегия",
    "kpi_framework": "KPI-фреймворк",
    "policy": "Политика",
    "regulation": "Регламент",
    "instruction": "Инструкция",
    "standard": "Стандарт",
    "other": "Другое",
}


class DocumentResponse(BaseModel):
    doc_id: str
    title: str
    doc_type: str
    doc_type_label: str = ""
    content_preview: str = ""
    content_length: int = 0
    keywords: List[str] = []
    version: str = "1.0"
    is_active: bool = True
    owner_department_name: Optional[str] = None
    valid_from: Optional[date] = None
    valid_to: Optional[date] = None
    created_at: Optional[datetime] = None
    updated_at: Optional[datetime] = None


class DocumentListResponse(BaseModel):
    documents: List[DocumentResponse]
    total: int
    page: int = 1
    per_page: int = 20


class DocumentDetailResponse(DocumentResponse):
    content: str = ""


class DocumentUpdateRequest(BaseModel):
    title: Optional[str] = None
    doc_type: Optional[str] = None
    keywords: Optional[List[str]] = None
    version: Optional[str] = None
    valid_from: Optional[date] = None
    valid_to: Optional[date] = None
    owner_department_id: Optional[int] = None


# ── Helpers ─────────────────────────────────────────────────────────────────────

def _serialize_doc(doc: Document, include_content: bool = False) -> dict:
    doc_type_val = doc.doc_type.value if hasattr(doc.doc_type, 'value') else str(doc.doc_type)
    content = doc.content or ""
    data = {
        "doc_id": str(doc.doc_id),
        "title": doc.title,
        "doc_type": doc_type_val,
        "doc_type_label": DOC_TYPE_LABELS.get(doc_type_val, doc_type_val),
        "content_preview": content[:200] + ("..." if len(content) > 200 else ""),
        "content_length": len(content),
        "keywords": doc.get_keywords_list(),
        "version": doc.version or "1.0",
        "is_active": doc.is_active,
        "owner_department_name": doc.owner_department.name if doc.owner_department else None,
        "valid_from": doc.valid_from,
        "valid_to": doc.valid_to,
        "created_at": doc.created_at,
        "updated_at": doc.updated_at,
    }
    if include_content:
        data["content"] = content
    return data


SORT_COLUMNS = {
    "title": Document.title,
    "doc_type": Document.doc_type,
    "created_at": Document.created_at,
    "updated_at": Document.updated_at,
}


# ── Endpoints ───────────────────────────────────────────────────────────────────

@router.get("/", response_model=DocumentListResponse)
async def list_documents(
    search: Optional[str] = Query(None, description="Поиск по названию"),
    doc_type: Optional[str] = Query(None, description="Фильтр по типу документа"),
    is_active: Optional[bool] = Query(None, description="Фильтр по статусу"),
    sort_by: Optional[str] = Query(None, description="Сортировка: title, doc_type, created_at, updated_at"),
    sort_order: str = Query("desc", description="asc / desc"),
    page: int = Query(1, ge=1),
    per_page: int = Query(20, ge=1, le=100),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Список документов ВНД с пагинацией, фильтрацией и поиском."""
    query = db.query(Document)

    if is_active is not None:
        query = query.filter(Document.is_active == is_active)
    else:
        query = query.filter(Document.is_active == True)

    if doc_type:
        query = query.filter(Document.doc_type == doc_type)
    if search:
        query = query.filter(Document.title.ilike(f"%{search.strip()}%"))

    total = query.count()

    sort_col = SORT_COLUMNS.get(sort_by, Document.updated_at)
    order_fn = desc if sort_order == "desc" else asc
    docs = query.order_by(order_fn(sort_col)).offset((page - 1) * per_page).limit(per_page).all()

    return DocumentListResponse(
        documents=[_serialize_doc(d) for d in docs],
        total=total,
        page=page,
        per_page=per_page,
    )


@router.get("/types")
async def get_document_types(current_user: User = Depends(get_current_user)):
    """Список типов документов."""
    return [{"value": k, "label": v} for k, v in DOC_TYPE_LABELS.items()]


@router.get("/{doc_id}", response_model=DocumentDetailResponse)
async def get_document(
    doc_id: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Получить документ с полным содержимым."""
    doc = db.query(Document).filter(Document.doc_id == doc_id).first()
    if not doc:
        raise HTTPException(status_code=404, detail="Документ не найден")
    return _serialize_doc(doc, include_content=True)


@router.post("/upload", response_model=DocumentResponse)
async def upload_document(
    file: UploadFile = File(...),
    title: str = Form(...),
    doc_type: str = Form("vnd"),
    keywords: str = Form(""),
    version: str = Form("1.0"),
    owner_department_id: Optional[int] = Form(None),
    db: Session = Depends(get_db),
    current_user: User = Depends(require_role("admin")),
):
    """Загрузить документ (PDF, DOCX, XLSX, TXT) — только для администратора."""
    # Read and parse file
    file_bytes = await file.read()
    if len(file_bytes) > 10 * 1024 * 1024:  # 10MB limit
        raise HTTPException(status_code=400, detail="Файл слишком большой (макс. 10 МБ)")

    try:
        content = extract_text(file_bytes, file.filename or "file.txt")
    except Exception as e:
        logger.error(f"Failed to parse file {file.filename}: {e}")
        raise HTTPException(status_code=400, detail=f"Не удалось разобрать файл: {str(e)}")

    if not content.strip():
        raise HTTPException(status_code=400, detail="Не удалось извлечь текст из файла")

    # Validate doc_type
    try:
        dt = DocumentType(doc_type)
    except ValueError:
        dt = DocumentType.OTHER

    # Parse keywords
    kw_list = [k.strip() for k in keywords.split(",") if k.strip()] if keywords else []

    now = datetime.now(timezone.utc)
    doc = Document(
        doc_id=str(uuid4()),
        doc_type=dt,
        title=title,
        content=content,
        valid_from=date.today(),
        owner_department_id=owner_department_id,
        keywords=kw_list or None,
        version=version,
        is_active=True,
        created_at=now,
        updated_at=now,
    )
    db.add(doc)
    db.commit()
    db.refresh(doc)

    # Index in ChromaDB
    try:
        metadata = {
            "title": doc.title,
            "doc_type": doc_type,
            "keywords": ", ".join(kw_list) if kw_list else "",
        }
        await asyncio.to_thread(rag_service.add_document, doc.doc_id, content, metadata)
        logger.info(f"Document {doc.doc_id} indexed in ChromaDB")
    except Exception as e:
        logger.warning(f"Failed to index document {doc.doc_id}: {e}")

    return _serialize_doc(doc)


@router.put("/{doc_id}", response_model=DocumentResponse)
async def update_document(
    doc_id: str,
    body: DocumentUpdateRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_role("admin")),
):
    """Обновить метаданные документа — только для администратора."""
    doc = db.query(Document).filter(Document.doc_id == doc_id).first()
    if not doc:
        raise HTTPException(status_code=404, detail="Документ не найден")

    if body.title is not None:
        doc.title = body.title
    if body.doc_type is not None:
        try:
            doc.doc_type = DocumentType(body.doc_type)
        except ValueError:
            pass
    if body.keywords is not None:
        doc.keywords = body.keywords
    if body.version is not None:
        doc.version = body.version
    if body.valid_from is not None:
        doc.valid_from = body.valid_from
    if body.valid_to is not None:
        doc.valid_to = body.valid_to
    if body.owner_department_id is not None:
        doc.owner_department_id = body.owner_department_id

    doc.updated_at = datetime.now(timezone.utc)
    db.commit()
    db.refresh(doc)

    return _serialize_doc(doc)


@router.delete("/{doc_id}", status_code=status.HTTP_200_OK)
async def delete_document(
    doc_id: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_role("admin")),
):
    """Деактивировать документ (soft delete) — только для администратора."""
    doc = db.query(Document).filter(Document.doc_id == doc_id).first()
    if not doc:
        raise HTTPException(status_code=404, detail="Документ не найден")

    doc.is_active = False
    doc.updated_at = datetime.now(timezone.utc)
    db.commit()

    return {"message": "Документ деактивирован"}
