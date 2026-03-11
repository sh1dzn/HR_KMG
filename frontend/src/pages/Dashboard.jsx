import { useState, useEffect } from 'react'
import { getDashboardSummary } from '../api/client'
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/card'
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, PieChart, Pie, Cell, Legend,
} from 'recharts'

const COLORS = ['#0f766e', '#1d4ed8', '#94a3b8']

const CustomTooltipPie = ({ active, payload }) => {
  if (active && payload && payload.length) {
    return (
      <div className="bg-white border border-gray-200 rounded-lg px-3 py-2 shadow-xs">
        <p className="text-sm font-semibold text-gray-900">{payload[0].name}</p>
        <p className="text-sm text-gray-600">{payload[0].value.toFixed(1)}%</p>
      </div>
    )
  }
  return null
}

const CustomTooltipBar = ({ active, payload, label }) => {
  if (active && payload && payload.length) {
    return (
      <div className="bg-white border border-gray-200 rounded-lg px-3 py-2 shadow-xs">
        <p className="text-sm font-semibold text-gray-900 mb-1">{label}</p>
        {payload.map((entry, index) => (
          <p key={index} className="text-sm text-gray-600">{entry.name}: {entry.value}%</p>
        ))}
      </div>
    )
  }
  return null
}

const renderCustomLabel = ({ cx, cy, midAngle, outerRadius, name, value }) => {
  const RADIAN = Math.PI / 180
  const radius = outerRadius + 30
  const x = cx + radius * Math.cos(-midAngle * RADIAN)
  const y = cy + radius * Math.sin(-midAngle * RADIAN)

  return (
    <text x={x} y={y} fill="#334155" textAnchor={x > cx ? 'start' : 'end'} dominantBaseline="central" className="text-xs font-medium">
      {name}: {value.toFixed(0)}%
    </text>
  )
}

export default function Dashboard() {
  const [quarter, setQuarter] = useState('Q2')
  const [year, setYear] = useState(2026)
  const [loading, setLoading] = useState(false)
  const [data, setData] = useState(null)
  const [error, setError] = useState(null)

  useEffect(() => { loadDashboard() }, [quarter, year])

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
        <div className="flex flex-col items-center gap-3">
          <div className="h-8 w-8 animate-spin rounded-full border-3 border-gray-200 border-t-cyan-700" />
          <span className="text-sm text-gray-500 font-medium">Загрузка данных...</span>
        </div>
      </div>
    )
  }

  if (error) {
    return (
      <Card className="border-red-200 bg-white">
        <CardContent className="p-4 pt-4">
        <div className="flex items-center gap-3 text-red-700">
          <svg className="w-5 h-5 flex-shrink-0" fill="none" viewBox="0 0 24 24" strokeWidth="2" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m9-.75a9 9 0 1 1-18 0 9 9 0 0 1 18 0Zm-9 3.75h.008v.008H12v-.008Z" />
          </svg>
          <span className="text-sm font-medium">{error}</span>
        </div>
        </CardContent>
      </Card>
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
    maturity: (dept.maturity_index * 100).toFixed(0),
  })) || []

  const getSmartScoreColor = (score) => {
    if (score >= 0.85) return 'text-green-600'
    if (score >= 0.7) return 'text-amber-600'
    return 'text-red-600'
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-xl font-semibold text-gray-900">Дашборд качества целеполагания</h1>
          <p className="text-sm text-gray-500 mt-1">
            Квартальная аналитика по качеству формулировок, зрелости
            подразделений и доле стратегически связанных целей.
          </p>
        </div>
        <div className="flex gap-3">
          <select className="select-field" value={quarter} onChange={(e) => setQuarter(e.target.value)}>
            <option value="Q1">Q1</option>
            <option value="Q2">Q2</option>
            <option value="Q3">Q3</option>
            <option value="Q4">Q4</option>
          </select>
          <select className="select-field" value={year} onChange={(e) => setYear(parseInt(e.target.value))}>
            <option value={2025}>2025</option>
            <option value={2026}>2026</option>
          </select>
        </div>
      </div>

      {data && (
        <>
          <div className="grid gap-4 lg:grid-cols-[1.4fr_1fr]">
            <Card>
              <CardHeader className="p-5 pb-0">
                <CardTitle className="text-xs uppercase tracking-[0.18em] text-slate-500">Executive Summary</CardTitle>
              </CardHeader>
              <CardContent className="p-5">
              <div className="text-lg font-semibold text-slate-950">
                В {data.quarter} {data.year} средний индекс качества целей составляет {(data.average_smart_score * 100).toFixed(0)}%.
              </div>
              <div className="mt-2 text-sm leading-6 text-slate-600">
                Доля стратегически связанных целей: {data.strategic_goals_percent.toFixed(1)}%.
                Метрика показывает, насколько контур целей связан с общими
                приоритетами бизнеса и распределением по подразделениям.
              </div>
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="p-5 pb-0">
                <CardTitle className="text-xs uppercase tracking-[0.18em] text-slate-500">Top Issues</CardTitle>
              </CardHeader>
              <CardContent className="p-5">
              <div className="flex flex-wrap gap-2">
                {data.top_issues.length > 0 ? data.top_issues.map((issue) => (
                  <span key={issue} className="rounded-full bg-rose-50 px-3 py-1 text-xs font-medium text-rose-700 border border-rose-100">
                    {issue}
                  </span>
                )) : (
                  <span className="text-sm text-slate-500">По эвристической оценке критичных провалов не выявлено.</span>
                )}
              </div>
              </CardContent>
            </Card>
          </div>

          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <Card>
              <CardContent className="p-5 pt-5">
              <div className="text-2xl font-semibold text-gray-900">{data.total_departments}</div>
              <div className="text-sm text-gray-500 mt-1">Подразделений</div>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-5 pt-5">
              <div className="text-2xl font-semibold text-gray-900">{data.total_employees}</div>
              <div className="text-sm text-gray-500 mt-1">Сотрудников</div>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-5 pt-5">
              <div className="text-2xl font-semibold text-gray-900">{data.total_goals}</div>
              <div className="text-sm text-gray-500 mt-1">Целей</div>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-5 pt-5">
              <div className="text-2xl font-semibold text-cyan-800">{(data.average_smart_score * 100).toFixed(0)}%</div>
              <div className="text-sm text-gray-500 mt-1">Средний SMART</div>
              </CardContent>
            </Card>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <Card>
              <CardHeader className="pb-0">
                <CardTitle className="text-base">Стратегическая связка целей</CardTitle>
              </CardHeader>
              <CardContent>
              <div className="h-72">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie data={strategicLinkData} cx="50%" cy="50%" innerRadius={65} outerRadius={90} paddingAngle={3} fill="#8884d8" dataKey="value" label={renderCustomLabel} strokeWidth={0}>
                      {strategicLinkData.map((entry, index) => (
                        <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                      ))}
                    </Pie>
                    <Tooltip content={<CustomTooltipPie />} />
                    <Legend verticalAlign="bottom" height={36} formatter={(value) => (<span className="text-sm text-gray-600">{value}</span>)} iconType="circle" iconSize={10} />
                  </PieChart>
                </ResponsiveContainer>
              </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-0">
                <CardTitle className="text-base">SMART-индекс по подразделениям</CardTitle>
              </CardHeader>
              <CardContent>
              <div className="h-72">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={departmentChartData} layout="vertical" margin={{ left: 10, right: 20 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" horizontal={false} />
                    <XAxis type="number" domain={[0, 100]} tick={{ fontSize: 12, fill: '#6b7280' }} tickLine={false} axisLine={{ stroke: '#e5e7eb' }} />
                    <YAxis dataKey="name" type="category" width={110} tick={{ fontSize: 12, fill: '#374151' }} tickLine={false} axisLine={false} />
                    <Tooltip content={<CustomTooltipBar />} />
                    <Bar dataKey="score" fill="#0f766e" name="SMART %" radius={[0, 4, 4, 0]} barSize={20} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
              </CardContent>
            </Card>
          </div>

          <Card className="overflow-hidden">
            <CardHeader className="border-b border-gray-200 px-6 py-4">
              <CardTitle className="text-base">Детализация по подразделениям</CardTitle>
              <p className="mt-1 text-sm text-gray-500">
                Таблица показывает зрелость целеполагания и основные слабые
                критерии по каждому подразделению.
              </p>
            </CardHeader>
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="bg-gray-50">
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Подразделение</th>
                    <th className="px-6 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider">Сотрудников</th>
                    <th className="px-6 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider">Целей</th>
                    <th className="px-6 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider">SMART</th>
                    <th className="px-6 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider">Зрелость</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Слабые критерии</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-200">
                  {data.departments_stats.map((dept) => {
                    const smartPercent = (dept.average_smart_score * 100).toFixed(0)
                    const maturityPercent = (dept.maturity_index * 100).toFixed(0)
                    return (
                      <tr key={dept.department_id} className="hover:bg-gray-50">
                        <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">{dept.department_name}</td>
                        <td className="px-6 py-4 whitespace-nowrap text-center text-sm text-gray-600">{dept.total_employees}</td>
                        <td className="px-6 py-4 whitespace-nowrap text-center text-sm text-gray-600">{dept.total_goals}</td>
                        <td className="px-6 py-4 whitespace-nowrap text-center">
                          <span className={`text-sm font-semibold ${getSmartScoreColor(dept.average_smart_score)}`}>{smartPercent}%</span>
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap">
                          <div className="flex flex-col items-center gap-1">
                            <div className="w-full max-w-[120px] bg-gray-200 rounded-lg h-2 overflow-hidden">
                              <div className="h-2 rounded-lg bg-cyan-700" style={{ width: `${maturityPercent}%` }} />
                            </div>
                            <span className="text-xs text-gray-500 font-medium">{maturityPercent}%</span>
                          </div>
                        </td>
                        <td className="px-6 py-4">
                          <div className="flex flex-wrap gap-1.5">
                            {dept.weak_criteria.map((criteria, i) => (
                              <span key={i} className="inline-flex items-center px-2 py-0.5 bg-red-50 text-red-700 text-xs font-medium rounded-lg">{criteria}</span>
                            ))}
                            {dept.weak_criteria.length === 0 && (
                              <span className="text-green-600 text-sm font-medium">Нет проблем</span>
                            )}
                          </div>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          </Card>
        </>
      )}
    </div>
  )
}
