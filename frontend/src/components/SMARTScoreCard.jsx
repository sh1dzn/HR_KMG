import { CheckCircleIcon, XCircleIcon, LightBulbIcon } from '@heroicons/react/24/outline'

const criteriaNames = {
  specific: 'S - Конкретность',
  measurable: 'M - Измеримость',
  achievable: 'A - Достижимость',
  relevant: 'R - Релевантность',
  time_bound: 'T - Ограниченность во времени'
}

function ScoreBar({ score, label }) {
  const getColorClass = (score) => {
    if (score >= 0.85) return 'bg-green-500'
    if (score >= 0.7) return 'bg-yellow-500'
    return 'bg-red-500'
  }

  return (
    <div className="mb-4">
      <div className="flex justify-between mb-1">
        <span className="text-sm font-medium text-gray-700">{label}</span>
        <span className="text-sm font-medium text-gray-700">{(score * 100).toFixed(0)}%</span>
      </div>
      <div className="w-full bg-gray-200 rounded-full h-2">
        <div
          className={`h-2 rounded-full ${getColorClass(score)}`}
          style={{ width: `${score * 100}%` }}
        />
      </div>
    </div>
  )
}

function CriterionCard({ name, criterion }) {
  return (
    <div className={`p-4 rounded-lg border ${
      criterion.is_satisfied
        ? 'bg-green-50 border-green-200'
        : 'bg-red-50 border-red-200'
    }`}>
      <div className="flex items-center justify-between mb-2">
        <span className="font-medium text-gray-900">{name}</span>
        {criterion.is_satisfied ? (
          <CheckCircleIcon className="h-5 w-5 text-green-600" />
        ) : (
          <XCircleIcon className="h-5 w-5 text-red-600" />
        )}
      </div>
      <div className="text-2xl font-bold text-gray-900 mb-1">
        {(criterion.score * 100).toFixed(0)}%
      </div>
      <p className="text-sm text-gray-600">{criterion.comment}</p>
    </div>
  )
}

export default function SMARTScoreCard({ evaluation }) {
  const { smart_evaluation, overall_score, quality_level, goal_type, strategic_link, recommendations, reformulated_goal } = evaluation

  const getQualityBadge = (level) => {
    const badges = {
      high: { text: 'Высокое качество', class: 'bg-green-100 text-green-800' },
      medium: { text: 'Среднее качество', class: 'bg-yellow-100 text-yellow-800' },
      low: { text: 'Требует доработки', class: 'bg-red-100 text-red-800' }
    }
    return badges[level] || badges.low
  }

  const qualityBadge = getQualityBadge(quality_level)

  const goalTypeLabels = {
    activity: 'Деятельностная',
    output: 'Результатная',
    impact: 'Влияние на бизнес'
  }

  const strategicLinkLabels = {
    strategic: 'Стратегическая',
    functional: 'Функциональная',
    operational: 'Операционная'
  }

  return (
    <div className="space-y-6">
      {/* Overall score card */}
      <div className="bg-white rounded-xl shadow-sm p-6">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h2 className="text-xl font-bold text-gray-900">Результат оценки</h2>
            <p className="text-gray-600 mt-1">{evaluation.goal_text}</p>
          </div>
          <span className={`px-4 py-2 rounded-full text-sm font-medium ${qualityBadge.class}`}>
            {qualityBadge.text}
          </span>
        </div>

        {/* Overall score */}
        <div className="text-center py-6 bg-gray-50 rounded-xl mb-6">
          <div className="text-5xl font-bold text-primary-600">
            {(overall_score * 100).toFixed(0)}%
          </div>
          <div className="text-gray-600 mt-2">Общий SMART-индекс</div>
        </div>

        {/* SMART criteria grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {Object.entries(smart_evaluation).map(([key, criterion]) => (
            <CriterionCard
              key={key}
              name={criteriaNames[key]}
              criterion={criterion}
            />
          ))}
        </div>
      </div>

      {/* Goal classification */}
      <div className="bg-white rounded-xl shadow-sm p-6">
        <h3 className="text-lg font-semibold text-gray-900 mb-4">Классификация цели</h3>
        <div className="grid grid-cols-2 gap-4">
          <div className="p-4 bg-purple-50 rounded-lg">
            <div className="text-sm text-purple-600 mb-1">Тип цели</div>
            <div className="font-semibold text-gray-900">
              {goal_type?.type_russian || goalTypeLabels[goal_type?.type] || 'Не определён'}
            </div>
            <p className="text-sm text-gray-600 mt-1">{goal_type?.explanation}</p>
          </div>
          {strategic_link && (
            <div className="p-4 bg-blue-50 rounded-lg">
              <div className="text-sm text-blue-600 mb-1">Стратегическая связка</div>
              <div className="font-semibold text-gray-900">
                {strategic_link?.level_russian || strategicLinkLabels[strategic_link?.level] || 'Не определена'}
              </div>
              <p className="text-sm text-gray-600 mt-1">{strategic_link?.explanation}</p>
            </div>
          )}
        </div>
      </div>

      {/* Recommendations */}
      {recommendations && recommendations.length > 0 && (
        <div className="bg-white rounded-xl shadow-sm p-6">
          <h3 className="text-lg font-semibold text-gray-900 mb-4 flex items-center">
            <LightBulbIcon className="h-5 w-5 mr-2 text-yellow-500" />
            Рекомендации по улучшению
          </h3>
          <ul className="space-y-2">
            {recommendations.map((rec, index) => (
              <li key={index} className="flex items-start">
                <span className="text-primary-600 mr-2">•</span>
                <span className="text-gray-700">{rec}</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Reformulated goal */}
      {reformulated_goal && (
        <div className="bg-green-50 border border-green-200 rounded-xl p-6">
          <h3 className="text-lg font-semibold text-green-800 mb-2">
            Улучшенная формулировка
          </h3>
          <p className="text-green-900 font-medium">{reformulated_goal}</p>
          <button
            onClick={() => navigator.clipboard.writeText(reformulated_goal)}
            className="mt-3 text-sm text-green-600 hover:text-green-800"
          >
            Скопировать в буфер обмена
          </button>
        </div>
      )}
    </div>
  )
}
