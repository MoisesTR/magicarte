const MOTHERS_DAY_MONTH = 4 // May (0-indexed)
const MOTHERS_DAY_DATE = 30 // Nicaragua: May 30

export function getMothersDay() {
  const now = new Date()
  const year = now.getFullYear()
  const mothersDay = new Date(year, MOTHERS_DAY_MONTH, MOTHERS_DAY_DATE)
  const daysLeft = Math.ceil((mothersDay - now) / (1000 * 60 * 60 * 24))
  return { isActive: daysLeft >= -2 && daysLeft <= 20, daysLeft }
}
