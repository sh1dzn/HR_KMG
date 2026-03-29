import { useState, useEffect, useRef, useCallback } from 'react'
import { useAuth } from '../contexts/AuthContext'
import { getDocuments, getDocument, getDocumentTypes, uploadDocument, deleteDocument } from '../api/client'

const DOC_TYPE_COLORS = {
  vnd: 'var(--fg-brand-primary)',
  strategy: 'var(--fg-success-primary)',
  kpi_framework: 'var(--text-warning-primary)',
  policy: 'var(--fg-error-primary)',
  regulation: 'var(--fg-quaternary)',
  instruction: 'var(--fg-brand-primary)',
  standard: 'var(--fg-success-primary)',
  other: 'var(--fg-quaternary)',
}

export default function Documents() {
  const { user } = useAuth()
  const role = user?.role || 'employee'
  const isAdmin = role === 'admin'

  const [docs, setDocs] = useState([])
  const [total, setTotal] = useState(0)
  const [page, setPage] = useState(1)
  const [search, setSearch] = useState('')
  const [typeFilter, setTypeFilter] = useState('')
  const [docTypes, setDocTypes] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  // Detail view
  const [selectedDoc, setSelectedDoc] = useState(null)
  const [detailLoading, setDetailLoading] = useState(false)

  // Upload modal
  const [showUpload, setShowUpload] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [uploadError, setUploadError] = useState(null)
  const fileRef = useRef(null)

  const perPage = 20

  const loadDocs = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const params = { page, per_page: perPage, sort_by: 'updated_at', sort_order: 'desc' }
      if (search) params.search = search
      if (typeFilter) params.doc_type = typeFilter
      const data = await getDocuments(params)
      setDocs(data.documents)
      setTotal(data.total)
    } catch {
      setError('Не удалось загрузить документы')
    }
    setLoading(false)
  }, [page, search, typeFilter])

  useEffect(() => { loadDocs() }, [loadDocs])
  useEffect(() => { getDocumentTypes().then(setDocTypes).catch(() => {}) }, [])

  const handleViewDoc = async (docId) => {
    setDetailLoading(true)
    try {
      const data = await getDocument(docId)
      setSelectedDoc(data)
    } catch {
      setError('Не удалось загрузить документ')
    }
    setDetailLoading(false)
  }

  const handleDelete = async (docId) => {
    try {
      await deleteDocument(docId)
      loadDocs()
      if (selectedDoc?.doc_id === docId) setSelectedDoc(null)
    } catch { /* ignore */ }
  }

  const handleUpload = async (e) => {
    e.preventDefault()
    const form = e.target
    const file = fileRef.current?.files?.[0]
    if (!file) return

    setUploading(true)
    setUploadError(null)

    const fd = new FormData()
    fd.append('file', file)
    fd.append('title', form.title.value)
    fd.append('doc_type', form.doc_type.value)
    fd.append('keywords', form.keywords.value)
    fd.append('version', form.version.value || '1.0')

    try {
      await uploadDocument(fd)
      setShowUpload(false)
      form.reset()
      loadDocs()
    } catch (err) {
      setUploadError(err.response?.data?.detail || 'Ошибка загрузки')
    }
    setUploading(false)
  }

  const totalPages = Math.ceil(total / perPage)

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="text-lg font-semibold" style={{ color: 'var(--text-primary)' }}>Документы ВНД</h2>
          <p className="text-sm mt-0.5" style={{ color: 'var(--text-tertiary)' }}>
            {total} документ{total === 1 ? '' : total < 5 ? 'а' : 'ов'} в базе
          </p>
        </div>
        {isAdmin && (
          <button
            type="button"
            onClick={() => setShowUpload(true)}
            className="btn-primary flex items-center gap-2"
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" /><polyline points="17 8 12 3 7 8" /><line x1="12" y1="3" x2="12" y2="15" />
            </svg>
            Загрузить документ
          </button>
        )}
      </div>

      {/* Filters */}
      <div className="card p-4">
        <div className="flex flex-col gap-3 sm:flex-row">
          <input
            type="text"
            placeholder="Поиск по названию..."
            value={search}
            onChange={(e) => { setSearch(e.target.value); setPage(1) }}
            className="input-field flex-1"
          />
          <select
            value={typeFilter}
            onChange={(e) => { setTypeFilter(e.target.value); setPage(1) }}
            className="select-field"
            style={{ minWidth: '180px' }}
          >
            <option value="">Все типы</option>
            {docTypes.map((t) => (
              <option key={t.value} value={t.value}>{t.label}</option>
            ))}
          </select>
        </div>
      </div>

      {/* Document detail panel */}
      {selectedDoc && (
        <div className="card p-5">
          <div className="flex items-start justify-between mb-4">
            <div>
              <h3 className="text-base font-semibold" style={{ color: 'var(--text-primary)' }}>{selectedDoc.title}</h3>
              <div className="flex items-center gap-3 mt-1">
                <span className="badge-brand text-xs">{selectedDoc.doc_type_label}</span>
                <span className="text-xs" style={{ color: 'var(--text-quaternary)' }}>v{selectedDoc.version}</span>
                <span className="text-xs" style={{ color: 'var(--text-quaternary)' }}>{selectedDoc.content_length.toLocaleString()} символов</span>
              </div>
            </div>
            <button
              type="button"
              onClick={() => setSelectedDoc(null)}
              className="flex h-8 w-8 items-center justify-center rounded-lg transition-colors"
              style={{ color: 'var(--fg-quaternary)' }}
              onMouseEnter={(e) => { e.currentTarget.style.backgroundColor = 'var(--bg-secondary)' }}
              onMouseLeave={(e) => { e.currentTarget.style.backgroundColor = '' }}
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
              </svg>
            </button>
          </div>
          {selectedDoc.keywords?.length > 0 && (
            <div className="flex flex-wrap gap-1.5 mb-4">
              {selectedDoc.keywords.map((kw) => (
                <span key={kw} className="badge-gray text-xs">{kw}</span>
              ))}
            </div>
          )}
          <div
            className="text-sm leading-relaxed rounded-lg p-4 max-h-[400px] overflow-y-auto"
            style={{ backgroundColor: 'var(--bg-secondary)', color: 'var(--text-secondary)', whiteSpace: 'pre-wrap' }}
          >
            {selectedDoc.content || 'Содержимое недоступно'}
          </div>
        </div>
      )}

      {/* Documents list */}
      {error && (
        <div className="status-error rounded-lg px-4 py-3 text-sm">{error}</div>
      )}

      {loading ? (
        <div className="card p-8 text-center text-sm" style={{ color: 'var(--text-quaternary)' }}>Загрузка...</div>
      ) : docs.length === 0 ? (
        <div className="card p-8 text-center text-sm" style={{ color: 'var(--text-quaternary)' }}>
          {search || typeFilter ? 'Документы не найдены' : 'Документов пока нет'}
        </div>
      ) : (
        <div className="space-y-2">
          {docs.map((doc) => (
            <div
              key={doc.doc_id}
              className="card flex items-center gap-4 px-5 py-4 cursor-pointer transition-all duration-100"
              onClick={() => handleViewDoc(doc.doc_id)}
              onMouseEnter={(e) => { e.currentTarget.style.borderColor = 'var(--border-brand-secondary)' }}
              onMouseLeave={(e) => { e.currentTarget.style.borderColor = 'var(--border-secondary)' }}
            >
              {/* Icon */}
              <div
                className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-lg"
                style={{ border: '1px solid var(--border-secondary)', color: DOC_TYPE_COLORS[doc.doc_type] || 'var(--fg-quaternary)' }}
              >
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" /><polyline points="14 2 14 8 20 8" />
                </svg>
              </div>

              {/* Content */}
              <div className="min-w-0 flex-1">
                <div className="text-sm font-medium truncate" style={{ color: 'var(--text-primary)' }}>{doc.title}</div>
                <div className="text-xs mt-0.5 truncate" style={{ color: 'var(--text-tertiary)' }}>
                  {doc.content_preview}
                </div>
              </div>

              {/* Meta */}
              <div className="hidden sm:flex items-center gap-3 flex-shrink-0">
                <span
                  className="rounded-full px-2.5 py-0.5 text-xs font-medium"
                  style={{ backgroundColor: 'var(--bg-tertiary)', color: DOC_TYPE_COLORS[doc.doc_type] || 'var(--text-quaternary)' }}
                >
                  {doc.doc_type_label}
                </span>
                <span className="text-xs tabular-nums" style={{ color: 'var(--text-quaternary)' }}>
                  v{doc.version}
                </span>
              </div>

              {/* Delete button (admin only) */}
              {isAdmin && (
                <button
                  type="button"
                  onClick={(e) => { e.stopPropagation(); handleDelete(doc.doc_id) }}
                  className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-lg opacity-0 group-hover:opacity-100 transition-opacity"
                  style={{ color: 'var(--fg-error-primary)' }}
                  title="Деактивировать"
                  onMouseEnter={(e) => { e.currentTarget.style.backgroundColor = 'var(--bg-error-secondary)'; e.currentTarget.style.opacity = '1' }}
                  onMouseLeave={(e) => { e.currentTarget.style.backgroundColor = ''; e.currentTarget.style.opacity = '' }}
                >
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <polyline points="3 6 5 6 21 6" /><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
                  </svg>
                </button>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-center gap-2">
          <button
            type="button"
            onClick={() => setPage((p) => Math.max(1, p - 1))}
            disabled={page === 1}
            className="btn-secondary text-sm px-3 py-1.5"
          >
            Назад
          </button>
          <span className="text-sm tabular-nums" style={{ color: 'var(--text-tertiary)' }}>
            {page} / {totalPages}
          </span>
          <button
            type="button"
            onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
            disabled={page === totalPages}
            className="btn-secondary text-sm px-3 py-1.5"
          >
            Далее
          </button>
        </div>
      )}

      {/* Upload modal */}
      {showUpload && (
        <>
          <div className="fixed inset-0 z-50" style={{ backgroundColor: 'rgba(12,17,29,0.48)', backdropFilter: 'blur(2px)' }} onClick={() => setShowUpload(false)} />
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <div className="card w-full max-w-lg p-6" onClick={(e) => e.stopPropagation()}>
              <h3 className="text-base font-semibold mb-4" style={{ color: 'var(--text-primary)' }}>Загрузить документ</h3>

              <form onSubmit={handleUpload} className="space-y-4">
                <div>
                  <label className="block text-sm font-medium mb-1.5" style={{ color: 'var(--text-secondary)' }}>Файл</label>
                  <input
                    ref={fileRef}
                    type="file"
                    accept=".pdf,.docx,.xlsx,.xls,.txt,.md,.csv"
                    required
                    className="input-field w-full text-sm"
                  />
                  <p className="text-xs mt-1" style={{ color: 'var(--text-quaternary)' }}>PDF, DOCX, XLSX, TXT, MD, CSV (макс. 10 МБ)</p>
                </div>

                <div>
                  <label className="block text-sm font-medium mb-1.5" style={{ color: 'var(--text-secondary)' }}>Название</label>
                  <input name="title" type="text" required className="input-field w-full" placeholder="Название документа" />
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-sm font-medium mb-1.5" style={{ color: 'var(--text-secondary)' }}>Тип</label>
                    <select name="doc_type" className="select-field w-full">
                      {docTypes.map((t) => (
                        <option key={t.value} value={t.value}>{t.label}</option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="block text-sm font-medium mb-1.5" style={{ color: 'var(--text-secondary)' }}>Версия</label>
                    <input name="version" type="text" defaultValue="1.0" className="input-field w-full" />
                  </div>
                </div>

                <div>
                  <label className="block text-sm font-medium mb-1.5" style={{ color: 'var(--text-secondary)' }}>Ключевые слова</label>
                  <input name="keywords" type="text" className="input-field w-full" placeholder="через запятую" />
                </div>

                {uploadError && (
                  <div className="status-error rounded-lg px-3 py-2 text-sm">{uploadError}</div>
                )}

                <div className="flex justify-end gap-3 pt-2">
                  <button type="button" onClick={() => setShowUpload(false)} className="btn-secondary">Отмена</button>
                  <button type="submit" disabled={uploading} className="btn-primary">
                    {uploading ? 'Загрузка...' : 'Загрузить'}
                  </button>
                </div>
              </form>
            </div>
          </div>
        </>
      )}
    </div>
  )
}
