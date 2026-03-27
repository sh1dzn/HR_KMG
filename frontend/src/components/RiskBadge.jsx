const RISK_COLORS = {
  high: { bg: 'rgba(220,38,38,0.15)', color: '#dc2626' },
  medium: { bg: 'rgba(234,179,8,0.15)', color: '#ca8a04' },
  low: { bg: 'rgba(22,163,74,0.15)', color: '#16a34a' },
}

export default function RiskBadge({ riskLevel, riskScore, size = 'sm' }) {
  const c = RISK_COLORS[riskLevel] || RISK_COLORS.low
  if (size === 'dot') {
    return <span className="inline-block h-2.5 w-2.5 rounded-full flex-shrink-0" style={{ backgroundColor: c.color }} title={`Риск: ${riskScore}`} />
  }
  return (
    <span className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium" style={{ backgroundColor: c.bg, color: c.color }}>
      <span className="h-1.5 w-1.5 rounded-full" style={{ backgroundColor: c.color }} />
      {riskScore !== undefined ? riskScore : riskLevel}
    </span>
  )
}
