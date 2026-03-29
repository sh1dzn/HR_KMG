export const QUARTERS = ['Q1', 'Q2', 'Q3', 'Q4']

export function getQuarterByMonth(monthIndex) {
  const month = Number(monthIndex) + 1
  if (month <= 3) return 'Q1'
  if (month <= 6) return 'Q2'
  if (month <= 9) return 'Q3'
  return 'Q4'
}

export function getCurrentPeriod(date = new Date()) {
  const year = date.getFullYear()
  const quarter = getQuarterByMonth(date.getMonth())
  return { quarter, year }
}

export function getYearRange(centerYear = new Date().getFullYear(), back = 1, forward = 2) {
  const years = []
  for (let y = centerYear - back; y <= centerYear + forward; y += 1) years.push(y)
  return years
}
