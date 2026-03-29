import { useEffect, useState } from 'react'
import { generateOneOnOneAgenda } from '../api/client'
import AIThinking from './AIThinking'

const PRIORITY_STYLES = {
  high: { bg: 'rgba(220,38,38,0.12)', color: '#dc2626', label: 'Высокий' },
  medium: { bg: 'rgba(234,179,8,0.12)', color: '#ca8a04', label: 'Средний' },
  low: { bg: 'rgba(107,114,128,0.12)', color: '#6b7280', label: 'Низкий' },
}

export default function OneOnOneModal({ employeeId, employeeName, quarter, year, onClose }) {
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [expandedIdx, setExpandedIdx] = useState(null)
  const [copied, setCopied] = useState(false)

  useEffect(() => {
    generateOneOnOneAgenda(employeeId, quarter, year)
      .then(res => { setData(res); setLoading(false) })
      .catch(err => { setError(err.response?.data?.detail || 'Ошибка генерации'); setLoading(false) })
  }, [employeeId, quarter, year])

  const copyToClipboard = () => {
    if (!data) return
    const text = [
      `Повестка 1-on-1: ${data.employee_name}`,
      `Период: ${quarter} ${year}`,
      `Руководитель: ${data.manager_name || '—'}`,
      '',
      `Сводка: ${data.summary.total_goals} целей, SMART ${data.summary.avg_smart}, просрочено: ${data.summary.overdue}, отклонений: ${data.summary.rejected_count}`,
      '',
      ...data.agenda.map((item, i) => [
        `${i + 1}. [${item.priority.toUpperCase()}] ${item.topic}`,
        item.goal_text ? `   Цель: ${item.goal_text}` : '',
        `   ${item.context}`,
        ...(item.suggested_questions || []).map(q => `   - ${q}`),
        '',
      ].filter(Boolean).join('\n')),
    ].join('\n')
    navigator.clipboard.writeText(text).then(() => { setCopied(true); setTimeout(() => setCopied(false), 2000) })
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ backgroundColor: 'rgba(12,17,29,0.48)', backdropFilter: 'blur(2px)' }}>
      <div className="w-full max-w-lg max-h-[85vh] overflow-y-auto rounded-2xl p-6" style={{ backgroundColor: 'var(--bg-primary)', border: '1px solid var(--border-secondary)', boxShadow: '0 8px 32px rgba(0,0,0,0.12)' }}>
        {/* Header */}
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-base font-semibold" style={{ color: 'var(--text-primary)' }}>
            Повестка 1-on-1: {employeeName}
          </h2>
          <button type="button" onClick={onClose} className="h-8 w-8 flex items-center justify-center rounded-lg" style={{ color: 'var(--fg-quaternary)' }}>
            <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
          </button>
        </div>

        {loading && <AIThinking label="Генерация повестки..." />}
        {error && <div className="rounded-lg px-3 py-2 text-sm" style={{ backgroundColor: 'var(--bg-error-secondary)', color: 'var(--text-error-primary)' }}>{error}</div>}

        {data && (
          <>
            {/* Summary */}
            <div className="grid grid-cols-4 gap-2 mb-4">
              {[
                { label: 'Целей', value: data.summary.total_goals },
                { label: 'SMART', value: data.summary.avg_smart },
                { label: 'Просроч.', value: data.summary.overdue },
                { label: 'Алертов', value: data.summary.alerts_count },
              ].map(s => (
                <div key={s.label} className="rounded-lg p-2 text-center" style={{ backgroundColor: 'var(--bg-secondary)' }}>
                  <div className="text-lg font-bold" style={{ color: 'var(--text-primary)' }}>{s.value}</div>
                  <div className="text-xs" style={{ color: 'var(--text-tertiary)' }}>{s.label}</div>
                </div>
              ))}
            </div>

            {/* Agenda items */}
            <div className="space-y-2 mb-4">
              {data.agenda.map((item, idx) => {
                const ps = PRIORITY_STYLES[item.priority] || PRIORITY_STYLES.low
                const isOpen = expandedIdx === idx
                return (
                  <div key={idx} className="rounded-lg overflow-hidden" style={{ border: '1px solid var(--border-secondary)' }}>
                    <button type="button" onClick={() => setExpandedIdx(isOpen ? null : idx)}
                      className="w-full flex items-center gap-3 px-4 py-3 text-left">
                      <span className="rounded-full px-2 py-0.5 text-xs font-medium flex-shrink-0" style={{ backgroundColor: ps.bg, color: ps.color }}>
                        {ps.label}
                      </span>
                      <span className="text-sm font-medium flex-1" style={{ color: 'var(--text-primary)' }}>{item.topic}</span>
                      <svg className={`h-4 w-4 transition-transform ${isOpen ? 'rotate-180' : ''}`} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{ color: 'var(--fg-quaternary)' }}>
                        <polyline points="6 9 12 15 18 9"/>
                      </svg>
                    </button>
                    {isOpen && (
                      <div className="px-4 pb-3 space-y-2">
                        {item.goal_text && (
                          <p className="text-xs rounded px-2 py-1" style={{ backgroundColor: 'var(--bg-secondary)', color: 'var(--text-secondary)' }}>
                            {item.goal_text}
                          </p>
                        )}
                        <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>{item.context}</p>
                        {item.suggested_questions?.length > 0 && (
                          <ul className="space-y-1 pl-4">
                            {item.suggested_questions.map((q, qi) => (
                              <li key={qi} className="text-sm list-disc" style={{ color: 'var(--text-brand-primary)' }}>{q}</li>
                            ))}
                          </ul>
                        )}
                      </div>
                    )}
                  </div>
                )
              })}
            </div>

            {/* Copy button */}
            <button type="button" onClick={copyToClipboard}
              className="w-full rounded-lg py-2.5 text-sm font-medium transition-colors"
              style={{ backgroundColor: 'var(--bg-secondary)', color: 'var(--text-primary)', border: '1px solid var(--border-secondary)' }}>
              {copied ? 'Скопировано!' : 'Скопировать повестку'}
            </button>
          </>
        )}
      </div>
    </div>
  )
}
