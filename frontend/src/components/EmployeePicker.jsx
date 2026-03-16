import { useDeferredValue, useState } from 'react'

const buildSearch = (emp) =>
  [emp.full_name, emp.position_name, emp.department_name, emp.employee_code]
    .filter(Boolean).join(' ').toLowerCase()

export default function EmployeePicker({
  employees = [],
  value,
  onChange,
  label = 'Сотрудник',
  placeholder = 'Поиск по ФИО, должности или подразделению',
  emptyText = 'Сотрудники не найдены',
  className = '',
}) {
  const [query, setQuery] = useState('')
  const deferred  = useDeferredValue(query)
  const normalized= deferred.trim().toLowerCase()

  const selected = employees.find((e) => e.id === value) || null

  let list = []
  if (!normalized) {
    list = selected
      ? [selected, ...employees.filter(e => e.id !== selected.id).slice(0, 7)]
      : employees.slice(0, 8)
  } else {
    list = employees.filter(e => buildSearch(e).includes(normalized))
  }

  return (
    <div className={className}>
      <label className="mb-1.5 block text-sm font-medium" style={{ color: 'var(--text-secondary)' }}>{label}</label>
      <div className="rounded-xl p-3" style={{ backgroundColor: 'var(--bg-secondary)', border: '1px solid var(--border-secondary)' }}>

        {/* Search */}
        <div className="relative mb-3">
          <svg className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2" style={{ color: 'var(--fg-quaternary)' }}
            viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/>
          </svg>
          <input type="text" className="input-field pl-9" placeholder={placeholder}
            value={query} onChange={(e) => setQuery(e.target.value)}
          />
        </div>

        {/* Selected banner */}
        {selected && (
          <div className="status-success mb-3 flex items-center gap-2.5 rounded-lg px-3 py-2">
            <div className="flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-full text-[11px] font-semibold text-white"
              style={{ backgroundColor: 'var(--fg-success-primary)' }}
            >
              {(selected.full_name || '').split(' ').map(w => w[0]).slice(0, 2).join('')}
            </div>
            <div className="min-w-0">
              <div className="text-sm font-medium" style={{ color: 'var(--text-success-primary)' }}>{selected.full_name}</div>
              <div className="text-xs" style={{ color: 'var(--text-success-secondary)' }}>
                {[selected.position_name, selected.department_name].filter(Boolean).join(' · ')}
              </div>
            </div>
            <svg className="ml-auto h-4 w-4 flex-shrink-0" style={{ color: 'var(--fg-success-primary)' }} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
              <polyline points="20 6 9 17 4 12"/>
            </svg>
          </div>
        )}

        {/* List */}
        <div className="max-h-56 overflow-y-auto rounded-lg" style={{ border: '1px solid var(--border-secondary)', backgroundColor: 'var(--bg-primary)' }}>
          {list.length > 0 ? list.map((emp) => {
            const isSelected = emp.id === value
            return (
              <button key={emp.id} type="button" onClick={() => onChange(emp.id)}
                className="flex w-full items-start gap-3 px-3 py-2.5 text-left transition-colors last:border-b-0"
                style={{
                  borderBottom: '1px solid var(--border-tertiary)',
                  backgroundColor: isSelected ? 'var(--bg-brand-25)' : undefined,
                }}
                onMouseEnter={(e) => { if (!isSelected) e.currentTarget.style.backgroundColor = 'var(--bg-secondary)' }}
                onMouseLeave={(e) => { e.currentTarget.style.backgroundColor = isSelected ? 'var(--bg-brand-25)' : '' }}
              >
                <div className="mt-0.5 flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full text-[11px] font-semibold"
                  style={{
                    backgroundColor: isSelected ? 'var(--bg-brand-secondary)' : 'var(--bg-tertiary)',
                    color: isSelected ? 'var(--text-brand-primary)' : 'var(--fg-quaternary)',
                  }}
                >
                  {isSelected
                    ? <svg className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><polyline points="20 6 9 17 4 12"/></svg>
                    : (emp.full_name || 'EM').split(' ').map(w => w[0]).slice(0, 2).join('')
                  }
                </div>
                <div className="min-w-0 flex-1">
                  <div className="break-words text-sm font-medium" style={{ color: isSelected ? 'var(--text-brand-primary)' : 'var(--text-primary)' }}>
                    {emp.full_name}
                  </div>
                  <div className="mt-0.5 break-words text-xs" style={{ color: 'var(--text-quaternary)' }}>
                    {[emp.position_name, emp.department_name].filter(Boolean).join(' · ')}
                  </div>
                </div>
              </button>
            )
          }) : (
            <div className="px-3 py-4 text-sm text-center" style={{ color: 'var(--text-quaternary)' }}>{emptyText}</div>
          )}
        </div>

        <div className="mt-2 text-xs" style={{ color: 'var(--text-quaternary)' }}>
          {normalized
            ? `Найдено ${list.length} сотрудников`
            : `Показаны первые ${list.length}. Начните ввод для поиска.`
          }
        </div>
      </div>
    </div>
  )
}
