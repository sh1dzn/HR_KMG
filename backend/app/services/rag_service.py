"""
RAG Service - Document Retrieval using ChromaDB
Сервис для поиска релевантных ВНД документов
"""
import chromadb
from typing import List, Dict, Optional
from app.config import settings


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
        metadatas = [{**metadata, "doc_id": doc_id, "chunk_index": i} for i in range(len(chunks))]

        self.collection.add(
            ids=ids,
            embeddings=embeddings,
            documents=chunks,
            metadatas=metadatas
        )

        return len(chunks)

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

    def search(
        self,
        query: str,
        n_results: int = 5,
        department: Optional[str] = None,
        doc_type: Optional[str] = None
    ) -> List[Dict]:
        """
        Search for relevant documents
        """
        # Get query embedding
        query_embedding = self.llm.get_embedding(query)

        # Build where filter
        where_filter = None
        if doc_type:
            where_filter = {"doc_type": doc_type}

        # Query collection
        results = self.collection.query(
            query_embeddings=[query_embedding],
            n_results=n_results,
            where=where_filter,
            include=["documents", "metadatas", "distances"]
        )

        # Format results
        formatted_results = []
        if results["documents"] and results["documents"][0]:
            for i, doc in enumerate(results["documents"][0]):
                formatted_results.append({
                    "content": doc,
                    "metadata": results["metadatas"][0][i] if results["metadatas"] else {},
                    "distance": results["distances"][0][i] if results["distances"] else 0,
                    "relevance_score": 1 - (results["distances"][0][i] if results["distances"] else 0)
                })

        return formatted_results

    def search_for_goal_generation(
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

        return self.search(query, n_results=n_results, department=department)

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
