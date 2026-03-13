"""
RAG Service - Document Retrieval using ChromaDB
Сервис для поиска релевантных ВНД документов
"""
import asyncio
import json
import chromadb
from typing import Any, List, Dict, Optional
from app.config import settings
from app.utils.document_scope import department_matches_scope, resolve_department_scope_labels
from app.utils.text_processing import extract_keywords


class RAGService:
    """Service for Retrieval-Augmented Generation using ChromaDB"""

    def __init__(self):
        self._client = None
        self._collection = None
        self._llm = None

    @property
    def llm(self):
        if self._llm is None:
            from app.services.llm_service import llm_service
            self._llm = llm_service
        return self._llm

    @property
    def client(self):
        if self._client is None:
            self._client = chromadb.PersistentClient(
                path=settings.CHROMA_PERSIST_DIR
            )
        return self._client

    @property
    def collection(self):
        if self._collection is None:
            self._collection = self.client.get_or_create_collection(
                name=settings.CHROMA_COLLECTION_NAME,
                metadata={"hnsw:space": "cosine"}
            )
        return self._collection

    def add_document(
        self,
        doc_id: int,
        content: str,
        metadata: Dict,
        chunk_size: int = 1000,
        chunk_overlap: int = 200
    ) -> int:
        """
        Add document to vector store with chunking

        Args:
            doc_id: Document ID
            content: Document content
            metadata: Document metadata
            chunk_size: Size of text chunks
            chunk_overlap: Overlap between chunks

        Returns:
            Number of chunks added
        """
        # Chunk the document
        chunks = self._chunk_text(content, chunk_size, chunk_overlap)

        # Generate embeddings
        embeddings = self.llm.get_embeddings(chunks)

        # Add to collection
        ids = [f"doc_{doc_id}_chunk_{i}" for i in range(len(chunks))]
        prepared_metadata = self._prepare_metadata_for_chroma({**metadata, "doc_id": str(doc_id)})
        metadatas = [{**prepared_metadata, "chunk_index": i} for i in range(len(chunks))]

        self.collection.add(
            ids=ids,
            embeddings=embeddings,
            documents=chunks,
            metadatas=metadatas
        )

        return len(chunks)

    def _serialize_metadata_value(self, value: Any) -> Optional[str | int | float | bool]:
        if value is None:
            return None
        if isinstance(value, (str, int, float, bool)):
            return value
        if isinstance(value, (list, tuple, set)):
            return ", ".join(str(item).strip() for item in value if str(item).strip()) or None
        if isinstance(value, dict):
            return json.dumps(value, ensure_ascii=False, sort_keys=True)
        return str(value)

    def _prepare_metadata_for_chroma(self, metadata: Dict[str, Any]) -> Dict[str, str | int | float | bool]:
        prepared: Dict[str, str | int | float | bool] = {}
        for key, value in metadata.items():
            serialized = self._serialize_metadata_value(value)
            if serialized is None:
                continue
            prepared[key] = serialized
        return prepared

    def _chunk_text(self, text: str, chunk_size: int, overlap: int) -> List[str]:
        """Split text into overlapping chunks"""
        chunks = []
        start = 0

        while start < len(text):
            end = start + chunk_size

            # Try to break at sentence boundary
            if end < len(text):
                # Look for sentence end
                for punct in ['. ', '.\n', '! ', '? ']:
                    last_punct = text[start:end].rfind(punct)
                    if last_punct > chunk_size // 2:
                        end = start + last_punct + len(punct)
                        break

            chunk = text[start:end].strip()
            if chunk:
                chunks.append(chunk)

            start = end - overlap

        return chunks

    def _department_matches(self, metadata: Optional[Dict], department: Optional[str]) -> bool:
        metadata = metadata or {}
        scope_values = resolve_department_scope_labels(metadata.get("department_scope_values") or metadata.get("department_scope"))
        return department_matches_scope(
            department,
            scope_values,
            owner_department_name=metadata.get("owner_department_name"),
            owner_department_code=metadata.get("owner_department_code"),
        )

    def _collection_needs_rebuild(self) -> bool:
        if self.collection.count() == 0:
            return True

        try:
            sample = self.collection.get(limit=1, include=["metadatas"])
            metadatas = sample.get("metadatas") or []
            sample_metadata = metadatas[0] if metadatas else None
            if not sample_metadata:
                return True
            return "owner_department_name" not in sample_metadata or "department_scope_values" not in sample_metadata
        except Exception:
            return True

    def ensure_collection_populated(self, force: bool = False) -> int:
        if not settings.OPENAI_API_KEY:
            return 0
        if not force and not self._collection_needs_rebuild():
            return 0

        from app.database import SessionLocal
        from app.models import Department, Document

        db = SessionLocal()
        try:
            departments = db.query(Department).all()
            department_names_by_id = {department.id: department.name for department in departments}
            department_codes_by_id = {
                department.id: department.code
                for department in departments
                if department.code
            }
            documents = db.query(Document).filter(Document.is_active == True).all()

            self.clear_collection()

            indexed_documents = 0
            for document in documents:
                if not document.content:
                    continue

                scope_values = resolve_department_scope_labels(
                    document.department_scope,
                    department_names_by_id=department_names_by_id,
                    department_codes_by_id=department_codes_by_id,
                )
                owner_department = document.owner_department

                self.add_document(
                    doc_id=document.doc_id,
                    content=document.content,
                    metadata={
                        "title": document.title,
                        "doc_type": document.doc_type.value if document.doc_type else "",
                        "department_scope_values": scope_values,
                        "owner_department_id": document.owner_department_id,
                        "owner_department_name": owner_department.name if owner_department else None,
                        "owner_department_code": owner_department.code if owner_department else None,
                        "keywords": document.get_keywords_list(),
                        "valid_from": document.valid_from.isoformat() if document.valid_from else None,
                        "valid_to": document.valid_to.isoformat() if document.valid_to else None,
                    },
                )
                indexed_documents += 1

            return indexed_documents
        finally:
            db.close()

    def get_index_status(self) -> dict:
        from app.database import SessionLocal
        from app.models import Document

        db = SessionLocal()
        try:
            active_documents = db.query(Document).filter(Document.is_active == True).count()
        finally:
            db.close()

        try:
            indexed_chunks = self.collection.count()
        except Exception:
            indexed_chunks = 0

        vector_index_ready = indexed_chunks > 0
        return {
            "active_documents": active_documents,
            "indexed_chunks": indexed_chunks,
            "openai_configured": bool(settings.OPENAI_API_KEY),
            "vector_index_ready": vector_index_ready,
            "search_mode": "vector+lexical" if bool(settings.OPENAI_API_KEY) and vector_index_ready else "lexical",
            "collection_name": settings.CHROMA_COLLECTION_NAME,
            "persist_dir": settings.CHROMA_PERSIST_DIR,
        }

    def _lexical_search(
        self,
        query: str,
        n_results: int = 5,
        department: Optional[str] = None,
        doc_type: Optional[str] = None,
    ) -> List[Dict]:
        from app.database import SessionLocal
        from app.models import Department, Document

        db = SessionLocal()
        try:
            department_rows = db.query(Department).all()
            department_names_by_id = {row.id: row.name for row in department_rows}
            department_codes_by_id = {row.id: row.code for row in department_rows if row.code}

            query_terms = set(extract_keywords(query, min_length=2))
            if not query_terms:
                query_terms = {token.strip().lower() for token in query.split() if token.strip()}

            query_builder = db.query(Document).filter(Document.is_active == True)
            if doc_type:
                query_builder = query_builder.filter(Document.doc_type == doc_type)
            documents = query_builder.all()

            results: list[dict] = []
            for document in documents:
                owner_department = document.owner_department
                scope_values = resolve_department_scope_labels(
                    document.department_scope,
                    department_names_by_id=department_names_by_id,
                    department_codes_by_id=department_codes_by_id,
                )
                if not department_matches_scope(
                    department,
                    scope_values,
                    owner_department_name=owner_department.name if owner_department else None,
                    owner_department_code=owner_department.code if owner_department else None,
                ):
                    continue

                title = (document.title or "").lower()
                keywords = " ".join(document.get_keywords_list()).lower()
                content = (document.content or "").lower()
                title_hits = sum(1 for term in query_terms if term in title)
                keyword_hits = sum(1 for term in query_terms if term in keywords)
                content_hits = sum(1 for term in query_terms if term in content[:4000])
                raw_score = title_hits * 2 + keyword_hits * 1.5 + content_hits
                if raw_score <= 0:
                    continue

                relevance_score = round(min(raw_score / max(len(query_terms) * 2, 1), 1.0), 2)
                results.append(
                    {
                        "content": (document.content or "")[:1200],
                        "metadata": {
                            "doc_id": str(document.doc_id),
                            "title": document.title,
                            "doc_type": document.doc_type.value if document.doc_type else "",
                            "department_scope_values": scope_values,
                            "owner_department_name": owner_department.name if owner_department else None,
                            "owner_department_code": owner_department.code if owner_department else None,
                            "keywords": ", ".join(document.get_keywords_list()),
                        },
                        "distance": round(1 - relevance_score, 2),
                        "relevance_score": relevance_score,
                    }
                )

            results.sort(key=lambda item: item["relevance_score"], reverse=True)
            return results[:n_results]
        finally:
            db.close()

    async def search(
        self,
        query: str,
        n_results: int = 5,
        department: Optional[str] = None,
        doc_type: Optional[str] = None
    ) -> List[Dict]:
        """
        Search for relevant documents
        """
        if not settings.OPENAI_API_KEY:
            return await asyncio.to_thread(self._lexical_search, query, n_results, department, doc_type)

        await asyncio.to_thread(self.ensure_collection_populated)

        try:
            # Get query embedding
            query_embedding = await asyncio.to_thread(self.llm.get_embedding, query)

            # Build where filter
            where_filter = None
            if doc_type:
                where_filter = {"doc_type": doc_type}

            # Query collection
            candidate_count = max(n_results * 3, 10) if department else n_results
            results = await asyncio.to_thread(
                self.collection.query,
                query_embeddings=[query_embedding],
                n_results=candidate_count,
                where=where_filter,
                include=["documents", "metadatas", "distances"],
            )

            # Format results
            formatted_results = []
            if results["documents"] and results["documents"][0]:
                for i, doc in enumerate(results["documents"][0]):
                    metadata = results["metadatas"][0][i] if results["metadatas"] else {}
                    if not self._department_matches(metadata, department):
                        continue
                    formatted_results.append({
                        "content": doc,
                        "metadata": metadata,
                        "distance": results["distances"][0][i] if results["distances"] else 0,
                        "relevance_score": 1 - (results["distances"][0][i] if results["distances"] else 0)
                    })
                    if len(formatted_results) >= n_results:
                        break

            if formatted_results:
                return formatted_results
        except Exception:
            pass

        return await asyncio.to_thread(self._lexical_search, query, n_results, department, doc_type)

    async def search_for_goal_generation(
        self,
        position: str,
        department: str,
        focus_areas: Optional[List[str]] = None,
        n_results: int = 10
    ) -> List[Dict]:
        """Search documents relevant for goal generation"""
        query_parts = [
            f"Цели и KPI для должности {position}",
            f"Задачи подразделения {department}",
            "Стратегические приоритеты компании"
        ]

        if focus_areas:
            query_parts.extend([f"Приоритет: {area}" for area in focus_areas])

        query = ". ".join(query_parts)

        return await self.search(query, n_results=n_results, department=department)

    def get_document_count(self) -> int:
        """Get total number of document chunks in collection"""
        return self.collection.count()

    def clear_collection(self):
        """Clear all documents from collection"""
        self.client.delete_collection(settings.CHROMA_COLLECTION_NAME)
        self._collection = self.client.get_or_create_collection(
            name=settings.CHROMA_COLLECTION_NAME,
            metadata={"hnsw:space": "cosine"}
        )


# Global instance
rag_service = RAGService()
