import { useState, useEffect, useRef, useCallback } from 'react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { useAuth } from '../contexts/AuthContext'
import {
  chatListConversations,
  chatCreateAndSend,
  chatSendMessage,
  chatGetMessages,
  chatDeleteConversation,
} from '../api/client'

/* ── Quick actions by role ──────────────────────────────────────────────────── */

const QUICK_ACTIONS = {
  employee: [
    { label: 'Помоги сформулировать цель', message: 'Помоги мне сформулировать цель по методологии SMART для моей должности' },
    { label: 'Объясни оценку SMART', message: 'Объясни, как работает оценка целей по SMART и на что обращать внимание' },
    { label: 'Найди в ВНД', message: 'Какие внутренние нормативные документы регулируют процесс постановки целей?' },
    { label: 'Процесс согласования', message: 'Расскажи про процесс согласования целей — какие этапы, кто участвует?' },
  ],
  manager: [
    { label: 'Статус команды', message: 'Покажи текущий статус целей моей команды — сколько целей в каждом статусе?' },
    { label: 'Помоги с каскадированием', message: 'Как правильно каскадировать мои цели на подчинённых? Дай рекомендации.' },
    { label: 'Подготовь повестку 1-on-1', message: 'Помоги подготовить повестку для 1-on-1 встречи с сотрудником по его целям' },
    { label: 'Формулировка цели', message: 'Помоги сформулировать цель по SMART для моего подразделения' },
  ],
  admin: [
    { label: 'Общая аналитика', message: 'Дай общую картину по качеству целеполагания в компании — что хорошо, что нужно улучшить?' },
    { label: 'Статус системы', message: 'Покажи текущую статистику системы — сколько сотрудников, целей, документов?' },
    { label: 'Проблемные зоны', message: 'Какие подразделения имеют наибольшие проблемы с качеством целей?' },
    { label: 'Помощь по ВНД', message: 'Какие внутренние нормативные документы есть в системе и как они используются?' },
  ],
}

/* ── SVG Icons ──────────────────────────────────────────────────────────────── */

function ChatBubbleIcon({ className }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z" />
    </svg>
  )
}

function XIcon({ className }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
    </svg>
  )
}

function SendIcon({ className }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <line x1="22" y1="2" x2="11" y2="13" /><polygon points="22 2 15 22 11 13 2 9 22 2" />
    </svg>
  )
}

function PlusIcon({ className }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" />
    </svg>
  )
}

function ListIcon({ className }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <line x1="8" y1="6" x2="21" y2="6" /><line x1="8" y1="12" x2="21" y2="12" /><line x1="8" y1="18" x2="21" y2="18" />
      <line x1="3" y1="6" x2="3.01" y2="6" /><line x1="3" y1="12" x2="3.01" y2="12" /><line x1="3" y1="18" x2="3.01" y2="18" />
    </svg>
  )
}

function TrashIcon({ className }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="3 6 5 6 21 6" /><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
    </svg>
  )
}

function ArrowLeftIcon({ className }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <line x1="19" y1="12" x2="5" y2="12" /><polyline points="12 19 5 12 12 5" />
    </svg>
  )
}

function SparklesIcon({ className }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 2l2.4 7.2L22 12l-7.6 2.8L12 22l-2.4-7.2L2 12l7.6-2.8L12 2z" />
    </svg>
  )
}

function MarkdownMessage({ content }) {
  return (
    <div className="chat-markdown">
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        components={{
          p: ({ children }) => <p className="mb-2 last:mb-0">{children}</p>,
          ul: ({ children }) => <ul className="list-disc ml-5 mb-2">{children}</ul>,
          ol: ({ children }) => <ol className="list-decimal ml-5 mb-2">{children}</ol>,
          li: ({ children }) => <li className="mb-1">{children}</li>,
          h1: ({ children }) => <h1 className="text-base font-semibold mb-2">{children}</h1>,
          h2: ({ children }) => <h2 className="text-sm font-semibold mb-2">{children}</h2>,
          h3: ({ children }) => <h3 className="text-sm font-semibold mb-1">{children}</h3>,
          code: ({ children, className }) => (
            <code className={`rounded px-1.5 py-0.5 bg-black/5 ${className || ''}`.trim()}>{children}</code>
          ),
          pre: ({ children }) => (
            <pre className="rounded-lg p-3 overflow-x-auto text-xs mb-2 bg-black/5">{children}</pre>
          ),
          table: ({ children }) => (
            <div className="overflow-x-auto mb-2">
              <table className="w-full text-xs border-collapse">{children}</table>
            </div>
          ),
          th: ({ children }) => <th className="text-left font-semibold border-b py-1 pr-2">{children}</th>,
          td: ({ children }) => <td className="border-b py-1 pr-2 align-top">{children}</td>,
        }}
      >
        {content || ''}
      </ReactMarkdown>
    </div>
  )
}

/* ── Role labels ────────────────────────────────────────────────────────────── */

const ROLE_ASSISTANT_NAME = {
  employee: 'Персональный ассистент',
  manager: 'Ассистент руководителя',
  admin: 'Ассистент администратора',
}

/* ── Component ──────────────────────────────────────────────────────────────── */

export default function ChatWidget() {
  const { user, isAuthenticated } = useAuth()
  const [isOpen, setIsOpen] = useState(false)
  const [showHistory, setShowHistory] = useState(false)
  const [conversations, setConversations] = useState([])
  const [activeConversationId, setActiveConversationId] = useState(null)
  const [messages, setMessages] = useState([])
  const [inputValue, setInputValue] = useState('')
  const [loading, setLoading] = useState(false)
  const [loadingConvs, setLoadingConvs] = useState(false)
  const messagesEndRef = useRef(null)
  const inputRef = useRef(null)

  const role = user?.role || 'employee'
  const quickActions = QUICK_ACTIONS[role] || QUICK_ACTIONS.employee

  const scrollToBottom = useCallback(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [])

  useEffect(() => { scrollToBottom() }, [messages, scrollToBottom])

  useEffect(() => {
    if (isOpen && inputRef.current) {
      setTimeout(() => inputRef.current?.focus(), 100)
    }
  }, [isOpen, activeConversationId])

  const loadConversations = useCallback(async () => {
    setLoadingConvs(true)
    try {
      const data = await chatListConversations()
      setConversations(data)
    } catch { /* ignore */ }
    setLoadingConvs(false)
  }, [])

  const loadMessages = useCallback(async (convId) => {
    try {
      const data = await chatGetMessages(convId)
      setMessages(data)
    } catch { /* ignore */ }
  }, [])

  const handleOpen = () => {
    setIsOpen(true)
    if (conversations.length === 0) loadConversations()
  }

  const handleNewChat = () => {
    setActiveConversationId(null)
    setMessages([])
    setShowHistory(false)
  }

  const handleSelectConversation = async (conv) => {
    setActiveConversationId(conv.id)
    setShowHistory(false)
    await loadMessages(conv.id)
  }

  const handleDeleteConversation = async (e, convId) => {
    e.stopPropagation()
    try {
      await chatDeleteConversation(convId)
      setConversations((prev) => prev.filter((c) => c.id !== convId))
      if (activeConversationId === convId) {
        handleNewChat()
      }
    } catch { /* ignore */ }
  }

  const handleSend = async (text) => {
    const msg = (text || inputValue).trim()
    if (!msg || loading) return
    setInputValue('')

    // Optimistic: add user message
    const tempUserMsg = { id: 'temp-user', role: 'user', content: msg, created_at: new Date().toISOString() }
    setMessages((prev) => [...prev, tempUserMsg])
    setLoading(true)

    try {
      let result
      if (activeConversationId) {
        result = await chatSendMessage(activeConversationId, msg)
      } else {
        result = await chatCreateAndSend(msg)
        setActiveConversationId(result.conversation_id)
        // Refresh conversation list
        loadConversations()
      }

      // Replace temp message with real ones
      setMessages((prev) => {
        const withoutTemp = prev.filter((m) => m.id !== 'temp-user')
        return [...withoutTemp, result.user_message, result.assistant_message]
      })
    } catch {
      setMessages((prev) => {
        const withoutTemp = prev.filter((m) => m.id !== 'temp-user')
        return [...withoutTemp,
          { ...tempUserMsg, id: 'sent-user' },
          { id: 'error', role: 'assistant', content: 'Ошибка при отправке. Попробуйте ещё раз.', created_at: new Date().toISOString() },
        ]
      })
    }
    setLoading(false)
  }

  const handleKeyDown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleSend()
    }
  }

  if (!isAuthenticated) return null

  return (
    <>
      {/* Floating button */}
      {!isOpen && (
        <button
          type="button"
          onClick={handleOpen}
          className="fixed bottom-4 right-4 z-[60] flex h-12 w-12 items-center justify-center rounded-lg transition-colors"
          style={{
            backgroundColor: 'var(--bg-primary)',
            color: 'var(--fg-brand-primary)',
            border: '1px solid var(--border-secondary)',
            boxShadow: '0 4px 12px rgba(16, 24, 40, 0.14)',
          }}
          title="AI Ассистент"
          onMouseEnter={(e) => { e.currentTarget.style.backgroundColor = 'var(--bg-secondary)' }}
          onMouseLeave={(e) => { e.currentTarget.style.backgroundColor = 'var(--bg-primary)' }}
        >
          <ChatBubbleIcon className="h-5 w-5" />
        </button>
      )}

      {/* Chat panel */}
      {isOpen && (
        <div
          className="fixed bottom-4 right-4 z-[60] flex flex-col rounded-xl overflow-hidden"
          style={{
            width: 'min(420px, calc(100vw - 24px))',
            height: 'min(640px, calc(100vh - 100px))',
            backgroundColor: 'var(--bg-primary)',
            border: '1px solid var(--border-secondary)',
            boxShadow: '0 10px 30px rgba(16, 24, 40, 0.18)',
          }}
        >
          {/* Header */}
          <div
            className="flex items-center justify-between px-4 py-3 flex-shrink-0"
            style={{
              backgroundColor: 'var(--bg-secondary)',
              borderBottom: '1px solid var(--border-secondary)',
            }}
          >
            <div className="flex items-center gap-3">
              {showHistory ? (
                <button
                  type="button"
                  onClick={() => setShowHistory(false)}
                  className="flex h-7 w-7 items-center justify-center rounded-md transition-colors"
                  style={{ color: 'var(--text-secondary)' }}
                  onMouseEnter={(e) => { e.currentTarget.style.backgroundColor = 'var(--bg-tertiary)' }}
                  onMouseLeave={(e) => { e.currentTarget.style.backgroundColor = '' }}
                >
                  <ArrowLeftIcon className="h-4 w-4" />
                </button>
              ) : (
                <div className="flex h-8 w-8 items-center justify-center rounded-md"
                  style={{ backgroundColor: 'var(--bg-primary)', border: '1px solid var(--border-secondary)', color: 'var(--fg-brand-primary)' }}
                >
                  <ChatBubbleIcon className="h-4 w-4" />
                </div>
              )}
              <div>
                <div className="text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>{showHistory ? 'История' : 'AI Ассистент'}</div>
                {!showHistory && (
                  <div className="text-xs" style={{ color: 'var(--text-tertiary)' }}>{ROLE_ASSISTANT_NAME[role]}</div>
                )}
              </div>
            </div>
            <div className="flex items-center gap-1">
              {!showHistory && (
                <>
                  <button
                    type="button"
                    onClick={() => { setShowHistory(true); loadConversations() }}
                    className="flex h-8 w-8 items-center justify-center rounded-md transition-colors"
                    style={{ color: 'var(--text-secondary)' }}
                    onMouseEnter={(e) => { e.currentTarget.style.backgroundColor = 'var(--bg-tertiary)' }}
                    onMouseLeave={(e) => { e.currentTarget.style.backgroundColor = '' }}
                    title="История диалогов"
                  >
                    <ListIcon className="h-4 w-4" />
                  </button>
                  <button
                    type="button"
                    onClick={handleNewChat}
                    className="flex h-8 w-8 items-center justify-center rounded-md transition-colors"
                    style={{ color: 'var(--text-secondary)' }}
                    onMouseEnter={(e) => { e.currentTarget.style.backgroundColor = 'var(--bg-tertiary)' }}
                    onMouseLeave={(e) => { e.currentTarget.style.backgroundColor = '' }}
                    title="Новый диалог"
                  >
                    <PlusIcon className="h-4 w-4" />
                  </button>
                </>
              )}
              <button
                type="button"
                onClick={() => setIsOpen(false)}
                className="flex h-8 w-8 items-center justify-center rounded-md transition-colors"
                style={{ color: 'var(--text-secondary)' }}
                onMouseEnter={(e) => { e.currentTarget.style.backgroundColor = 'var(--bg-tertiary)' }}
                onMouseLeave={(e) => { e.currentTarget.style.backgroundColor = '' }}
                title="Закрыть"
              >
                <XIcon className="h-4 w-4" />
              </button>
            </div>
          </div>

          {/* Conversation list */}
          {showHistory ? (
            <div className="flex-1 overflow-y-auto">
              {loadingConvs ? (
                <div className="flex items-center justify-center py-12 text-sm" style={{ color: 'var(--text-quaternary)' }}>Загрузка...</div>
              ) : conversations.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-12 text-sm" style={{ color: 'var(--text-quaternary)' }}>
                  <ChatBubbleIcon className="h-8 w-8 mb-2 opacity-40" />
                  Диалогов пока нет
                </div>
              ) : (
                <div className="p-2 space-y-1">
                  {conversations.map((conv) => (
                    <div
                      key={conv.id}
                      onClick={() => handleSelectConversation(conv)}
                      className="flex items-center gap-3 rounded-lg px-3 py-3 cursor-pointer transition-colors group"
                      style={{
                        backgroundColor: conv.id === activeConversationId ? 'var(--bg-secondary)' : '',
                        border: conv.id === activeConversationId ? '1px solid var(--border-primary)' : '1px solid transparent',
                      }}
                      onMouseEnter={(e) => { if (conv.id !== activeConversationId) e.currentTarget.style.backgroundColor = 'var(--bg-secondary)' }}
                      onMouseLeave={(e) => { if (conv.id !== activeConversationId) e.currentTarget.style.backgroundColor = '' }}
                    >
                      <ChatBubbleIcon className="h-4 w-4 flex-shrink-0" style={{ color: 'var(--fg-quaternary)' }} />
                      <div className="min-w-0 flex-1">
                        <div className="text-sm font-medium truncate" style={{ color: 'var(--text-primary)' }}>{conv.title}</div>
                        <div className="text-xs mt-0.5" style={{ color: 'var(--text-quaternary)' }}>
                          {conv.message_count} сообщ. · {new Date(conv.updated_at).toLocaleDateString('ru-RU')}
                        </div>
                      </div>
                      <button
                        type="button"
                        onClick={(e) => handleDeleteConversation(e, conv.id)}
                        className="flex h-7 w-7 items-center justify-center rounded-lg opacity-0 group-hover:opacity-100 transition-opacity"
                        style={{ color: 'var(--fg-error-primary)' }}
                        onMouseEnter={(e) => { e.currentTarget.style.backgroundColor = 'var(--bg-error-secondary)' }}
                        onMouseLeave={(e) => { e.currentTarget.style.backgroundColor = '' }}
                        title="Удалить"
                      >
                        <TrashIcon className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          ) : (
            <>
              {/* Messages area */}
              <div className="flex-1 overflow-y-auto px-4 py-3 space-y-3">
                {messages.length === 0 && !loading ? (
                  // Empty state with quick actions
                  <div className="flex flex-col h-full">
                    <div className="flex-1 flex flex-col items-center justify-center py-4">
                      <div className="flex h-12 w-12 items-center justify-center rounded-lg mb-3"
                        style={{ backgroundColor: 'var(--bg-brand-secondary)', color: 'var(--fg-brand-primary)' }}>
                        <SparklesIcon className="h-6 w-6" />
                      </div>
                      <div className="text-sm font-semibold mb-1" style={{ color: 'var(--text-primary)' }}>
                        Чем могу помочь?
                      </div>
                      <div className="text-xs text-center mb-4" style={{ color: 'var(--text-tertiary)' }}>
                        Я знаю ВНД, цели и процессы компании
                      </div>
                    </div>
                    <div className="space-y-2 pb-2">
                      {quickActions.map((action) => (
                        <button
                          key={action.label}
                          type="button"
                          onClick={() => handleSend(action.message)}
                          className="w-full text-left rounded-lg px-4 py-3 text-sm transition-colors"
                          style={{
                            backgroundColor: 'var(--bg-secondary)',
                            border: '1px solid var(--border-secondary)',
                            color: 'var(--text-secondary)',
                          }}
                          onMouseEnter={(e) => { e.currentTarget.style.borderColor = 'var(--border-brand-secondary)'; e.currentTarget.style.color = 'var(--text-primary)' }}
                          onMouseLeave={(e) => { e.currentTarget.style.borderColor = 'var(--border-secondary)'; e.currentTarget.style.color = 'var(--text-secondary)' }}
                        >
                          {action.label}
                        </button>
                      ))}
                    </div>
                  </div>
                ) : (
                  <>
                    {messages.map((msg, idx) => (
                      <div key={msg.id || idx} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                        <div
                          className="max-w-[85%] rounded-lg px-4 py-2.5 text-sm leading-relaxed"
                          style={msg.role === 'user'
                            ? {
                              backgroundColor: 'var(--bg-brand-solid)',
                              color: 'white',
                            }
                            : {
                              backgroundColor: 'var(--bg-secondary)',
                              color: 'var(--text-primary)',
                              border: '1px solid var(--border-secondary)',
                            }
                          }
                        >
                          {msg.role === 'assistant' ? (
                            <MarkdownMessage content={msg.content} />
                          ) : (
                            <div style={{ whiteSpace: 'pre-wrap' }}>{msg.content}</div>
                          )}
                        </div>
                      </div>
                    ))}
                    {loading && (
                      <div className="flex justify-start">
                        <div
                          className="rounded-lg px-4 py-3 text-sm"
                          style={{ backgroundColor: 'var(--bg-secondary)', border: '1px solid var(--border-secondary)', color: 'var(--text-tertiary)' }}
                        >
                          Печатает...
                        </div>
                      </div>
                    )}
                    <div ref={messagesEndRef} />
                  </>
                )}
              </div>

              {/* Input area */}
              <div className="flex-shrink-0 px-3 pb-3 pt-1">
                <div
                  className="flex items-end gap-2 rounded-lg px-3 py-2"
                  style={{ backgroundColor: 'var(--bg-secondary)', border: '1px solid var(--border-secondary)' }}
                >
                  <textarea
                    ref={inputRef}
                    value={inputValue}
                    onChange={(e) => setInputValue(e.target.value)}
                    onKeyDown={handleKeyDown}
                    placeholder="Напишите сообщение..."
                    rows={1}
                    className="flex-1 resize-none bg-transparent text-sm outline-none"
                    style={{ color: 'var(--text-primary)', maxHeight: '100px', minHeight: '24px' }}
                    onInput={(e) => { e.target.style.height = 'auto'; e.target.style.height = Math.min(e.target.scrollHeight, 100) + 'px' }}
                    disabled={loading}
                  />
                  <button
                    type="button"
                    onClick={() => handleSend()}
                    disabled={!inputValue.trim() || loading}
                    className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-md transition-colors"
                    style={{
                      backgroundColor: inputValue.trim() && !loading ? 'var(--fg-brand-primary)' : 'transparent',
                      color: inputValue.trim() && !loading ? 'white' : 'var(--fg-quaternary)',
                    }}
                  >
                    <SendIcon className="h-4 w-4" />
                  </button>
                </div>
              </div>
            </>
          )}
        </div>
      )}
    </>
  )
}
