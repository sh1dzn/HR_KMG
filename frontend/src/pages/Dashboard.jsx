import { useState, useEffect } from 'react'
import { getDashboardSummary } from '../api/client'
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, PieChart, Pie, Cell } from 'recharts'

const COLORS = ['#8b5cf6', '#3b82f6', '#6b7280']

export default function Dashboard() {
  const [quarter, setQuarter] = useState('Q2')
  const [year, setYear] = useState(2026)
  const [loading, setLoading] = useState(false)
  const [data, setData] = useState(null)
  const [error, setError] = useState(null)

  useEffect(() => {
    loadDashboard()
  }, [quarter, year])

  const loadDashboard = async () => {
    setLoading(true)
    setError(null)

    try {
      const result = await getDashboardSummary(quarter, year)
      setData(result)
    } catch (err) {
      setError(err.response?.data?.detail || 'Ошибка загрузки данных')
    } finally {
      setLoading(false)
    }
  }

  if (loading && !data) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-gray-500">Загрузка данных...</div>
      </div>
    )
  }

  if (error) {
    return (
      <div className="p-6 bg-red-50 border border-red-200 rounded-xl text-red-700">
        {error}
      </div>
    )
  }

  const strategicLinkData = data ? [
    { name: 'Стратегические', value: data.strategic_goals_percent },
    { name: 'Функциональные', value: data.functional_goals_percent },
    { name: 'Операционные', value: data.operational_goals_percent },
  ] : []

  const departmentChartData = data?.departments_stats?.map(dept => ({
    name: dept.department_name.substring(0, 15),
    score: (dept.average_smart_score * 100).toFixed(0),
    goals: dept.total_goals,
    maturity: (dept.maturity_index * 100).toFixed(0)
  })) || []

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="bg-white rounded-xl shadow-sm p-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">
              Дашборд качества целеполагания
            </h1>
            <p className="text-gray-600">
              Аналитика по подразделениям и периодам
            </p>
          </div>
          <div className="flex gap-3">
            <select
              className="px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500"
              value={quarter}
              onChange={(e) => setQuarter(e.target.value)}
            >
              <option value="Q1">Q1</option>
              <option value="Q2">Q2</option>
              <option value="Q3">Q3</option>
              <option value="Q4">Q4</option>
            </select>
            <select
              className="px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500"
              value={year}
              onChange={(e) => setYear(parseInt(e.target.value))}
            >
              <option value={2025}>2025</option>
              <option value={2026}>2026</option>
            </select>
          </div>
        </div>
      </div>

      {data && (
        <>
          {/* Summary cards */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div className="bg-white rounded-xl shadow-sm p-6">
              <div className="text-sm text-gray-500 mb-1">Подразделений</div>
              <div className="text-3xl font-bold text-gray-900">{data.total_departments}</div>
            </div>
            <div className="bg-white rounded-xl shadow-sm p-6">
              <div className="text-sm text-gray-500 mb-1">Сотрудников</div>
              <div className="text-3xl font-bold text-gray-900">{data.total_employees}</div>
            </div>
            <div className="bg-white rounded-xl shadow-sm p-6">
              <div className="text-sm text-gray-500 mb-1">Целей</div>
              <div className="text-3xl font-bold text-gray-900">{data.total_goals}</div>
            </div>
            <div className="bg-white rounded-xl shadow-sm p-6">
              <div className="text-sm text-gray-500 mb-1">Средний SMART</div>
              <div className="text-3xl font-bold text-primary-600">
                {(data.average_smart_score * 100).toFixed(0)}%
              </div>
            </div>
          </div>

          {/* Charts row */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Strategic link pie chart */}
            <div className="bg-white rounded-xl shadow-sm p-6">
              <h2 className="text-lg font-semibold text-gray-900 mb-4">
                Стратегическая связка целей
              </h2>
              <div className="h-64">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie
                      data={strategicLinkData}
                      cx="50%"
                      cy="50%"
                      innerRadius={60}
                      outerRadius={80}
                      fill="#8884d8"
                      dataKey="value"
                      label={({ name, value }) => `${name}: ${value.toFixed(0)}%`}
                    >
                      {strategicLinkData.map((entry, index) => (
                        <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                      ))}
                    </Pie>
                    <Tooltip />
                  </PieChart>
                </ResponsiveContainer>
              </div>
              <div className="flex justify-center gap-4 mt-4">
                {strategicLinkData.map((item, index) => (
                  <div key={item.name} className="flex items-center">
                    <div
                      className="w-3 h-3 rounded-full mr-2"
                      style={{ backgroundColor: COLORS[index] }}
                    />
                    <span className="text-sm text-gray-600">{item.name}</span>
                  </div>
                ))}
              </div>
            </div>

            {/* Department bar chart */}
            <div className="bg-white rounded-xl shadow-sm p-6">
              <h2 className="text-lg font-semibold text-gray-900 mb-4">
                SMART-индекс по подразделениям
              </h2>
              <div className="h-64">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={departmentChartData} layout="vertical">
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis type="number" domain={[0, 100]} />
                    <YAxis dataKey="name" type="category" width={100} />
                    <Tooltip />
                    <Bar dataKey="score" fill="#3b82f6" name="SMART %" />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>
          </div>

          {/* Top issues */}
          {data.top_issues && data.top_issues.length > 0 && (
            <div className="bg-white rounded-xl shadow-sm p-6">
              <h2 className="text-lg font-semibold text-gray-900 mb-4">
                Топ проблем в целеполагании
              </h2>
              <div className="flex flex-wrap gap-2">
                {data.top_issues.map((issue, index) => (
                  <span
                    key={index}
                    className="px-4 py-2 bg-red-50 text-red-700 rounded-lg text-sm"
                  >
                    {issue}
                  </span>
                ))}
              </div>
            </div>
          )}

          {/* Department details table */}
          <div className="bg-white rounded-xl shadow-sm overflow-hidden">
            <div className="px-6 py-4 border-b border-gray-200">
              <h2 className="text-lg font-semibold text-gray-900">
                Детализация по подразделениям
              </h2>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                      Подразделение
                    </th>
                    <th className="px-6 py-3 text-center text-xs font-medium text-gray-500 uppercase">
                      Сотрудников
                    </th>
                    <th className="px-6 py-3 text-center text-xs font-medium text-gray-500 uppercase">
                      Целей
                    </th>
                    <th className="px-6 py-3 text-center text-xs font-medium text-gray-500 uppercase">
                      SMART
                    </th>
                    <th className="px-6 py-3 text-center text-xs font-medium text-gray-500 uppercase">
                      Зрелость
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                      Слабые критерии
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-200">
                  {data.departments_stats.map((dept) => (
                    <tr key={dept.department_id} className="hover:bg-gray-50">
                      <td className="px-6 py-4 whitespace-nowrap font-medium text-gray-900">
                        {dept.department_name}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-center text-gray-600">
                        {dept.total_employees}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-center text-gray-600">
                        {dept.total_goals}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-center">
                        <span className={`font-semibold ${
                          dept.average_smart_score >= 0.85 ? 'text-green-600' :
                          dept.average_smart_score >= 0.7 ? 'text-yellow-600' : 'text-red-600'
                        }`}>
                          {(dept.average_smart_score * 100).toFixed(0)}%
                        </span>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-center">
                        <div className="w-full bg-gray-200 rounded-full h-2">
                          <div
                            className="bg-primary-600 h-2 rounded-full"
                            style={{ width: `${dept.maturity_index * 100}%` }}
                          />
                        </div>
                        <span className="text-xs text-gray-500">
                          {(dept.maturity_index * 100).toFixed(0)}%
                        </span>
                      </td>
                      <td className="px-6 py-4">
                        <div className="flex flex-wrap gap-1">
                          {dept.weak_criteria.map((criteria, i) => (
                            <span
                              key={i}
                              className="px-2 py-1 bg-red-50 text-red-600 text-xs rounded"
                            >
                              {criteria}
                            </span>
                          ))}
                          {dept.weak_criteria.length === 0 && (
                            <span className="text-green-600 text-sm">Нет проблем</span>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}
    </div>
  )
}
