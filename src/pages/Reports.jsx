import { useMemo, useState } from 'react'
import { useOutletContext } from 'react-router-dom'
import { Icon } from '../components/Icon'
import { Empty } from '../components/Empty'

export function Reports() {
  const { semesters, subjects, getSubjectLecturers } = useOutletContext()
  const [search, setSearch] = useState('')
  const [semesterFilter, setSemesterFilter] = useState('All')

  // One report row per subject name, even where the curriculum includes the
  // same subject in CA, CN, and CM versions of a semester.
  const semesterOptions = useMemo(() => {
    const levels = new Map()
    semesters.forEach(semester => {
      const match = semester.name.match(/Semester\s*(\d+)/i)
      if (match) levels.set(Number(match[1]), new Set([...(levels.get(Number(match[1])) || []), semester.id]))
    })
    return Array.from(levels.entries()).sort(([a], [b]) => a - b).map(([level, ids]) => ({ level, ids }))
  }, [semesters])
  const selectedSemesterIds = useMemo(() => new Set(
    semesterFilter === 'All' ? [] : semesterFilter.split(',').filter(Boolean)
  ), [semesterFilter])

  const rows = useMemo(() => {
    const grouped = new Map()
    subjects.forEach(subject => {
      const key = subject.name.trim().toLowerCase().replace(/\s+/g, ' ')
      if (!grouped.has(key)) {
        grouped.set(key, { name: subject.name.trim(), codes: new Set(), semesterIds: new Set(), totalHours: new Set(), theoryHours: new Set(), labHours: new Set(), lecturerIds: new Set() })
      }
      const entry = grouped.get(key)
      if (subject.code) entry.codes.add(subject.code)
      entry.semesterIds.add(subject.semester_id)
      entry.totalHours.add(Number(subject.total_hours) || 0)
      entry.theoryHours.add(Number(subject.theory_hours) || 0)
      entry.labHours.add(Number(subject.lab_hours) || 0)
      getSubjectLecturers(subject.id).forEach(lecturer => entry.lecturerIds.add(lecturer.id))
    })
    return Array.from(grouped.values()).map(entry => ({
      ...entry,
      code: Array.from(entry.codes).join(', '),
      total: Array.from(entry.totalHours).sort((a, b) => a - b).join(' / '),
      theory: Array.from(entry.theoryHours).sort((a, b) => a - b).join(' / '),
      lab: Array.from(entry.labHours).sort((a, b) => a - b).join(' / '),
      lecturerCount: entry.lecturerIds.size,
    })).filter(subject => {
    const query = search.trim().toLowerCase()
    const matchesSearch = !query || [subject.name, subject.code].some(value => value?.toLowerCase().includes(query))
    const matchesSemester = semesterFilter === 'All' || Array.from(subject.semesterIds).some(id => selectedSemesterIds.has(id))
    return matchesSearch && matchesSemester
    }).sort((a, b) => a.name.localeCompare(b.name))
  }, [getSubjectLecturers, search, selectedSemesterIds, semesterFilter, subjects])

  const totals = useMemo(() => rows.reduce((result, subject) => ({
    subjects: result.subjects + 1,
    hours: result.hours + Math.max(...Array.from(subject.totalHours)),
  }), { subjects: 0, hours: 0 }), [rows])
  const totalLecturers = useMemo(() => new Set(
    rows.flatMap(subject => Array.from(subject.lecturerIds))
  ).size, [rows])

  return (
    <section>
      <header className="mb-7 rounded-3xl border border-brand-100 bg-gradient-to-br from-white to-brand-50/70 p-6 shadow-sm sm:p-7">
        <div className="flex flex-col gap-5 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-4">
            <span className="grid h-12 w-12 place-items-center rounded-2xl bg-brand-600 text-white shadow-lg shadow-brand-600/20"><Icon name="grid" className="h-6 w-6" /></span>
            <div><p className="text-sm font-medium text-brand-600">University IT Faculty</p><h1 className="mt-1 text-2xl font-bold text-brand-950 sm:text-3xl">Subjects Report</h1><p className="mt-1 text-sm text-slate-500">Each subject appears once across all departments and semesters.</p></div>
          </div>
          <span className="rounded-full border border-brand-100 bg-white px-4 py-2 text-sm font-bold text-brand-700">{totals.subjects} subjects</span>
        </div>
      </header>

      <div className="mb-6 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {[['Total Subjects', totals.subjects, 'bg-brand-600'], ['Total Hours', `${totals.hours}h`, 'bg-indigo-600'], ['Departments', 'All Departments', 'bg-cyan-600'], ['Total Lecturers', totalLecturers, 'bg-amber-500']].map(([label, value, color]) => <div key={label} className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm"><span className={`mb-3 block h-2 w-10 rounded-full ${color}`} /><p className="text-xs font-bold uppercase tracking-wide text-slate-400">{label}</p><p className="mt-1 text-2xl font-bold text-brand-950">{value}</p></div>)}
      </div>

      <div className="overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-sm">
        <div className="flex flex-col gap-3 border-b border-slate-100 bg-slate-50/80 p-4 sm:flex-row">
          <input value={search} onChange={event => setSearch(event.target.value)} placeholder="Search subject, code, or semester…" className="min-w-0 flex-1 rounded-xl border border-slate-200 bg-white px-3.5 py-2.5 text-sm outline-none focus:border-brand-500" />
          <select value={semesterFilter} onChange={event => setSemesterFilter(event.target.value)} className="rounded-xl border border-slate-200 bg-white px-3.5 py-2.5 text-sm font-semibold text-slate-700 outline-none focus:border-brand-500"><option value="All">All Semesters</option>{semesterOptions.map(option => <option key={option.level} value={Array.from(option.ids).join(',')}>Semester {option.level}</option>)}</select>
        </div>
        {rows.length ? <div className="overflow-x-auto"><table className="w-full min-w-[760px] text-left text-sm"><thead className="bg-brand-950 text-xs uppercase tracking-wide text-cyan-100"><tr><th className="px-5 py-4">Code</th><th className="px-5 py-4">Subject</th><th className="px-5 py-4 text-center">Total</th><th className="px-5 py-4 text-center">Theory</th><th className="px-5 py-4 text-center">Lab</th><th className="px-5 py-4 text-center">Lecturers</th></tr></thead><tbody className="divide-y divide-slate-100">{rows.map(subject => <tr key={subject.name} className="transition hover:bg-brand-50/40"><td className="px-5 py-4"><span className="rounded-lg bg-slate-100 px-2 py-1 font-mono text-xs font-bold text-slate-600">{subject.code || '—'}</span></td><td className="px-5 py-4 font-semibold text-slate-800">{subject.name}</td><td className="px-5 py-4 text-center font-bold text-brand-950">{subject.total}h</td><td className="px-5 py-4 text-center"><span className="rounded-full bg-cyan-50 px-2.5 py-1 text-xs font-bold text-cyan-700">{subject.theory}h</span></td><td className="px-5 py-4 text-center"><span className="rounded-full bg-amber-50 px-2.5 py-1 text-xs font-bold text-amber-700">{subject.lab}h</span></td><td className="px-5 py-4 text-center"><span className="inline-flex min-w-8 justify-center rounded-full bg-indigo-50 px-2.5 py-1 text-xs font-bold text-indigo-700">{subject.lecturerCount}</span></td></tr>)}</tbody></table></div> : <Empty title="No subjects found" text="Try another subject name or code." />}
      </div>
    </section>
  )
}
