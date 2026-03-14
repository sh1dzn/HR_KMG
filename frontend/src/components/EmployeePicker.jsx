import { useDeferredValue, useState } from 'react'
import { CheckIcon, MagnifyingGlassIcon, UserIcon } from '@heroicons/react/24/outline'

const buildEmployeeSearchText = (employee) =>
  [
    employee.full_name,
    employee.position_name,
    employee.department_name,
    employee.employee_code,
  ]
    .filter(Boolean)
    .join(' ')
    .toLowerCase()

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
  const deferredQuery = useDeferredValue(query)
  const normalizedQuery = deferredQuery.trim().toLowerCase()

  const selectedEmployee = employees.find((employee) => employee.id === value) || null

  let filteredEmployees = []
  if (!normalizedQuery) {
    if (!selectedEmployee) {
      filteredEmployees = employees.slice(0, 8)
    } else {
      const withoutSelected = employees.filter((employee) => employee.id !== selectedEmployee.id)
      filteredEmployees = [selectedEmployee, ...withoutSelected.slice(0, 7)]
    }
  } else {
    filteredEmployees = employees.filter((employee) => buildEmployeeSearchText(employee).includes(normalizedQuery))
  }

  return (
    <div className={className}>
      <label className="block text-sm font-medium text-gray-700 mb-1.5">{label}</label>
      <div className="rounded-xl border border-slate-200 bg-slate-50/70 p-3">
        <div className="relative">
          <MagnifyingGlassIcon className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
          <input
            type="text"
            className="input-field pl-9"
            placeholder={placeholder}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
        </div>

        {selectedEmployee && (
          <div className="mt-3 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-900">
            <div className="font-medium">{selectedEmployee.full_name}</div>
            <div className="mt-0.5 text-xs text-emerald-700">
              {[selectedEmployee.position_name, selectedEmployee.department_name].filter(Boolean).join(' · ')}
            </div>
          </div>
        )}

        <div className="mt-3 max-h-64 overflow-auto rounded-lg border border-slate-200 bg-white">
          {filteredEmployees.length > 0 ? (
            filteredEmployees.map((employee) => {
              const isSelected = employee.id === value

              return (
                <button
                  key={employee.id}
                  type="button"
                  onClick={() => onChange(employee.id)}
                  className={[
                    'flex w-full items-start gap-3 border-b border-slate-100 px-3 py-3 text-left transition-colors last:border-b-0',
                    isSelected ? 'bg-emerald-50' : 'hover:bg-slate-50',
                  ].join(' ')}
                >
                  <div className={`mt-0.5 flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-full ${
                    isSelected ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-100 text-slate-500'
                  }`}>
                    {isSelected ? <CheckIcon className="h-4 w-4" /> : <UserIcon className="h-4 w-4" />}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="break-words text-sm font-medium text-slate-900">{employee.full_name}</div>
                    <div className="mt-0.5 break-words text-xs text-slate-500">
                      {[employee.position_name, employee.department_name].filter(Boolean).join(' · ')}
                    </div>
                  </div>
                </button>
              )
            })
          ) : (
            <div className="px-3 py-4 text-sm text-slate-500">{emptyText}</div>
          )}
        </div>

        <div className="mt-2 text-xs text-slate-500">
          {normalizedQuery
            ? `Найдено ${filteredEmployees.length} сотрудников`
            : `Показаны первые ${filteredEmployees.length} сотрудников. Начните ввод для точного поиска.`}
        </div>
      </div>
    </div>
  )
}
