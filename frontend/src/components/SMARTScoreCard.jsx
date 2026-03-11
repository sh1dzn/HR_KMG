import { useState } from 'react'
import {
  CheckCircleIcon,
  XCircleIcon,
  ClipboardDocumentIcon,
} from '@heroicons/react/24/outline'
import { Card, CardContent, CardHeader, CardTitle } from './ui/card'

const criteriaNames = {
  specific: 'S - Конкретность',
  measurable: 'M - Измеримость',
  achievable: 'A - Достижимость',
  relevant: 'R - Релевантность',
  time_bound: 'T - Ограниченность во времени',
}

const qualityConfig = {
  high: {
    text: 'Высокое качество',
    bg: 'bg-green-50',
    textColor: 'text-green-700',
    border: 'border-green-200',
    dot: 'bg-green-500',
  },
  medium: {
    text: 'Среднее качество',
    bg: 'bg-amber-50',
    textColor: 'text-amber-700',
    border: 'border-amber-200',
    dot: 'bg-amber-500',
  },
  low: {
    text: 'Требует доработки',
    bg: 'bg-red-50',
    textColor: 'text-red-700',
    border: 'border-red-200',
    dot: 'bg-red-500',
  },
}

const goalTypeLabels = {
  activity: 'Деятельностная',
  output: 'Результатная',
  impact: 'Влияние на бизнес',
}

const strategicLinkLabels = {
  strategic: 'Стратегическая',
  functional: 'Функциональная',
  operational: 'Операционная',
}

/* Score ring */
function ScoreDisplay({ score }) {
  const percentage = Math.round(score * 100)
  const radius = 64
  const stroke = 8
  const normalizedRadius = radius - stroke / 2
  const circumference = 2 * Math.PI * normalizedRadius
  const offset = circumference - (score * circumference)

  const getColor = () => {
    if (percentage >= 85) return '#16a34a'
    if (percentage >= 60) return '#d97706'
    return '#dc2626'
  }

  return (
    <div className="relative inline-flex items-center justify-center">
      <svg width={radius * 2} height={radius * 2} className="-rotate-90">
        <circle
          cx={radius}
          cy={radius}
          r={normalizedRadius}
          fill="none"
          stroke="#e5e7eb"
          strokeWidth={stroke}
        />
        <circle
          cx={radius}
          cy={radius}
          r={normalizedRadius}
          fill="none"
          stroke={getColor()}
          strokeWidth={stroke}
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={offset}
          className="transition-all duration-500"
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span className="text-3xl font-semibold text-gray-900">{percentage}%</span>
        <span className="text-xs text-gray-500 mt-0.5">SMART-индекс</span>
      </div>
    </div>
  )
}

/* Criterion card */
function CriterionCard({ name, criterion }) {
  const satisfied = criterion.is_satisfied
  const percentage = Math.round(criterion.score * 100)

  return (
    <Card className="rounded-xl bg-white/80">
      <CardContent className="p-4 pt-4">
      <div className="flex items-center justify-between mb-2">
        <span className="text-sm font-medium text-gray-900">{name}</span>
        {satisfied ? (
          <CheckCircleIcon className="h-5 w-5 text-green-600 flex-shrink-0" />
        ) : (
          <XCircleIcon className="h-5 w-5 text-red-500 flex-shrink-0" />
        )}
      </div>
      <div className="text-xl font-semibold text-gray-900 mb-2">{percentage}%</div>
      <div className="w-full bg-gray-100 rounded-lg h-1.5 mb-3">
        <div
          className={`h-1.5 rounded-lg transition-all duration-500 ${satisfied ? 'bg-green-500' : 'bg-red-500'}`}
          style={{ width: `${percentage}%` }}
        />
      </div>
      {criterion.comment && (
        <p className="text-sm text-gray-500 leading-relaxed">{criterion.comment}</p>
      )}
      </CardContent>
    </Card>
  )
}

/* Main component */
export default function SMARTScoreCard({ evaluation }) {
  const [copied, setCopied] = useState(false)

  const {
    smart_evaluation,
    overall_score,
    quality_level,
    goal_type,
    strategic_link,
    recommendations,
    reformulated_goal,
    goal_text,
  } = evaluation

  const quality = qualityConfig[quality_level] || qualityConfig.low

  const handleCopy = async () => {
    if (!reformulated_goal) return
    try {
      await navigator.clipboard.writeText(reformulated_goal)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch { /* clipboard API may not be available */ }
  }

  return (
    <div className="space-y-5 animate-fade-in">
      <Card>
        <CardContent className="p-6 pt-6">
        <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3 mb-6">
          <div className="min-w-0 flex-1">
            <h2 className="text-base font-semibold text-gray-900">Результат оценки</h2>
            {goal_text && (
              <p className="text-sm text-gray-500 mt-1 leading-relaxed line-clamp-2">{goal_text}</p>
            )}
          </div>
          <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 text-xs font-medium rounded-lg border flex-shrink-0 ${quality.bg} ${quality.textColor} ${quality.border}`}>
            <span className={`w-1.5 h-1.5 rounded-lg ${quality.dot}`} />
            {quality.text}
          </span>
        </div>

        <div className="flex justify-center py-4 mb-6">
          <ScoreDisplay score={overall_score} />
        </div>

        <h3 className="text-sm font-semibold text-gray-900 mb-3">Критерии SMART</h3>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
          {Object.entries(smart_evaluation).map(([key, criterion]) => (
            <CriterionCard key={key} name={criteriaNames[key]} criterion={criterion} />
          ))}
        </div>
        </CardContent>
      </Card>

      {(goal_type || strategic_link) && (
        <Card>
          <CardHeader className="pb-0">
            <CardTitle>Классификация цели</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            {goal_type && (
              <Card className="rounded-xl bg-slate-50/80 shadow-none">
                <CardContent className="p-4 pt-4">
                <div className="text-xs font-medium uppercase tracking-wider text-gray-500 mb-1">Тип цели</div>
                <div className="text-sm font-semibold text-gray-900">
                  {goal_type.type_russian || goalTypeLabels[goal_type.type] || 'Не определён'}
                </div>
                {goal_type.explanation && (
                  <p className="text-sm text-gray-500 mt-1.5 leading-relaxed">{goal_type.explanation}</p>
                )}
                </CardContent>
              </Card>
            )}
            {strategic_link && (
              <Card className="rounded-xl bg-slate-50/80 shadow-none">
                <CardContent className="p-4 pt-4">
                <div className="text-xs font-medium uppercase tracking-wider text-gray-500 mb-1">Стратегическая связка</div>
                <div className="text-sm font-semibold text-gray-900">
                  {strategic_link.level_russian || strategicLinkLabels[strategic_link.level] || 'Не определена'}
                </div>
                {strategic_link.explanation && (
                  <p className="text-sm text-gray-500 mt-1.5 leading-relaxed">{strategic_link.explanation}</p>
                )}
                </CardContent>
              </Card>
            )}
            </div>
          </CardContent>
        </Card>
      )}

      {recommendations && recommendations.length > 0 && (
        <Card>
          <CardHeader className="pb-0">
            <CardTitle>Рекомендации по улучшению</CardTitle>
          </CardHeader>
          <CardContent>
          <ul className="space-y-2.5">
            {recommendations.map((rec, index) => (
              <li key={index} className="flex items-start gap-2.5 text-sm text-gray-600 leading-relaxed">
                <span className="mt-1.5 h-1.5 w-1.5 flex-shrink-0 rounded-lg bg-cyan-700" />
                <span>{rec}</span>
              </li>
            ))}
          </ul>
          </CardContent>
        </Card>
      )}

      {reformulated_goal && (
        <Card className="border-emerald-200 bg-emerald-50/90">
          <CardContent className="p-6 pt-6">
          <div className="flex items-start justify-between gap-4 mb-2">
            <h3 className="text-sm font-semibold text-green-800">Улучшенная формулировка</h3>
            <button
              onClick={handleCopy}
              className="inline-flex items-center gap-1.5 text-sm font-medium text-green-700 hover:text-green-900 bg-white border border-green-200 px-3 py-1.5 rounded-lg transition-colors duration-150 flex-shrink-0 cursor-pointer"
            >
              <ClipboardDocumentIcon className="h-4 w-4" />
              {copied ? 'Скопировано' : 'Скопировать'}
            </button>
          </div>
          <p className="text-sm text-green-900 font-medium leading-relaxed">{reformulated_goal}</p>
          </CardContent>
        </Card>
      )}
    </div>
  )
}
