/**
 * Build a map of { intake_year -> semester_id } from the classes array.
 * The "owner" of a semester is the intake year that has it assigned to the
 * most of its classes (majority vote), so a single stale row cannot
 * hijack the mapping.
 */
export function getYearSemesterMap(classes = []) {
  const votes = {} // { intake_year: { semId: count } }

  classes.forEach(c => {
    if (!c.intake_year || !c.semester_id) return
    if (!votes[c.intake_year]) votes[c.intake_year] = {}
    votes[c.intake_year][c.semester_id] = (votes[c.intake_year][c.semester_id] || 0) + 1
  })

  const map = {}
  Object.entries(votes).forEach(([yr, semCounts]) => {
    // Pick the semester with the highest vote count for this year
    const winner = Object.entries(semCounts).sort((a, b) => b[1] - a[1])[0]
    if (winner) map[Number(yr)] = winner[0]
  })

  return map
}

/**
 * Build a map of { semester_id -> intake_year } — which year "owns" a semester.
 */
export function getSemesterYearMap(classes = []) {
  const yearSemMap = getYearSemesterMap(classes)
  const semYearMap = {}
  Object.entries(yearSemMap).forEach(([yr, semId]) => {
    if (semId) semYearMap[semId] = Number(yr)
  })
  return semYearMap
}
