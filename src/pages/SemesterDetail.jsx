import { useOutletContext, useParams, useNavigate } from 'react-router-dom'
import { Icon } from '../components/Icon'
import { Empty } from '../components/Empty'
import { useMemo } from 'react'

const blankSubject = { code: '', name: '', theory_hours: 0, lab_hours: 0 }

// Helper for consistent avatar color based on lecturer name
const LECTURER_COLORS = [
  'bg-blue-100 text-blue-700 border-blue-200',
  'bg-purple-100 text-purple-700 border-purple-200',
  'bg-emerald-100 text-emerald-700 border-emerald-200',
  'bg-amber-100 text-amber-700 border-amber-200',
  'bg-rose-100 text-rose-700 border-rose-200',
  'bg-cyan-100 text-cyan-700 border-cyan-200',
]

function getAvatarColor(name = '') {
  let hash = 0
  for (let i = 0; i < name.length; i++) hash = name.charCodeAt(i) + ((hash << 5) - hash)
  return LECTURER_COLORS[Math.abs(hash) % LECTURER_COLORS.length]
}

export function SemesterDetail() {
  const { code } = useParams()
  const navigate = useNavigate()
  const { 
    semesters, subjects, lecturers, setModal, remove, 
    assignLecturersToSubject, getSubjectLecturers, isLecturerQualified 
  } = useOutletContext()

  const semester = useMemo(() => semesters.find(s => s.code === code), [semesters, code])
  const semesterSubjects = useMemo(() => subjects.filter(s => s.semester_id === semester?.id), [subjects, semester])

  // Total metrics for top stats bar
  const totalHours = useMemo(() => semesterSubjects.reduce((sum, s) => sum + s.total_hours, 0), [semesterSubjects])
  const totalTheory = useMemo(() => semesterSubjects.reduce((sum, s) => sum + s.theory_hours, 0), [semesterSubjects])
  const totalLab = useMemo(() => semesterSubjects.reduce((sum, s) => sum + s.lab_hours, 0), [semesterSubjects])

  // Lecturers assigned to at least one subject in THIS semester
  const semesterLecturers = useMemo(() => {
    const ids = new Set()
    semesterSubjects.forEach(sub => {
      getSubjectLecturers(sub.id).forEach(l => ids.add(l.id))
    })
    return lecturers.filter(l => ids.has(l.id))
  }, [semesterSubjects, lecturers, getSubjectLecturers])

  if (!semester) return <div className="p-8 text-center text-slate-500">Semester not found</div>

  const handleAddLecturer = (subjectId, lecturerId) => {
    if (!lecturerId) return
    const current = getSubjectLecturers(subjectId).map(l => l.id)
    if (!current.includes(lecturerId)) {
      assignLecturersToSubject(subjectId, [...current, lecturerId])
    }
  }

  const handleRemoveLecturer = (subjectId, lecturerId) => {
    const current = getSubjectLecturers(subjectId).map(l => l.id)
    const updated = current.filter(id => id !== lecturerId)
    assignLecturersToSubject(subjectId, updated)
  }

  return (
    <section className="space-y-6">
      {/* Header Banner */}
      <div className="relative overflow-hidden rounded-3xl bg-gradient-to-r from-brand-950 via-brand-900 to-indigo-950 p-6 text-white shadow-xl sm:p-8">
        <div className="absolute -right-10 -top-10 h-44 w-44 rounded-full bg-brand-500/20 blur-3xl" />
        <div className="absolute -bottom-10 right-20 h-44 w-44 rounded-full bg-cyan-500/20 blur-3xl" />
        
        <div className="relative z-10 flex flex-col justify-between gap-6 sm:flex-row sm:items-center">
          <div>
            <button 
              onClick={() => navigate('/semesters')} 
              className="mb-3 inline-flex items-center gap-2 rounded-xl bg-white/10 px-3 py-1.5 text-xs font-semibold text-cyan-200 backdrop-blur-md transition hover:bg-white/20 hover:text-white"
            >
              <Icon name="back" className="h-3.5 w-3.5" /> All Semesters
            </button>
            <div className="flex items-center gap-3">
              <span className="rounded-xl bg-cyan-400/20 px-3 py-1 text-xs font-bold tracking-wide text-cyan-200 border border-cyan-400/30">
                {semester.code}
              </span>
              <h1 className="text-2xl font-black tracking-tight text-white sm:text-3xl">{semester.name}</h1>
            </div>
          </div>

          <button 
            onClick={() => setModal({ type: 'subject', data: blankSubject, semester: semester })} 
            className="inline-flex items-center justify-center gap-2 rounded-2xl bg-gradient-to-r from-cyan-500 to-brand-500 px-5 py-3 text-sm font-bold text-white shadow-lg shadow-cyan-500/30 transition hover:scale-[1.02] hover:shadow-cyan-500/40 active:scale-[0.98]"
          >
            <Icon name="plus" className="h-4 w-4" /> Add Subject
          </button>
        </div>

        {/* Stats Row */}
        <div className="relative z-10 mt-6 grid grid-cols-2 gap-3 border-t border-white/10 pt-5 sm:grid-cols-4">
          <div className="rounded-xl bg-white/5 p-3 backdrop-blur-sm border border-white/10">
            <p className="text-[11px] font-medium uppercase tracking-wider text-cyan-200/70">Subjects</p>
            <p className="text-xl font-bold text-white mt-0.5">{semesterSubjects.length}</p>
          </div>
          <div className="rounded-xl bg-white/5 p-3 backdrop-blur-sm border border-white/10">
            <p className="text-[11px] font-medium uppercase tracking-wider text-cyan-200/70">Total Hours</p>
            <p className="text-xl font-bold text-white mt-0.5">{totalHours} hrs</p>
          </div>
          <div className="rounded-xl bg-white/5 p-3 backdrop-blur-sm border border-white/10">
            <p className="text-[11px] font-medium uppercase tracking-wider text-cyan-200/70">Theory / Lab</p>
            <p className="text-xl font-bold text-white mt-0.5">{totalTheory}h / {totalLab}h</p>
          </div>
          <div className="rounded-xl bg-white/5 p-3 backdrop-blur-sm border border-white/10">
            <p className="text-[11px] font-medium uppercase tracking-wider text-cyan-200/70">Lecturers Assigned</p>
            <p className="text-xl font-bold text-cyan-300 mt-0.5">{semesterLecturers.length} This Semester</p>
          </div>
        </div>
      </div>
      
      {/* Main Subjects Table Card */}
      <div className="overflow-hidden rounded-3xl border border-slate-200/80 bg-white shadow-xl shadow-slate-200/50">
        <div className="flex items-center justify-between border-b border-slate-100 bg-slate-50/80 px-6 py-4">
          <div>
            <h2 className="text-base font-bold text-brand-950">Curriculum & Lecturer Assignments</h2>
            <p className="text-xs text-slate-500 mt-0.5">Assign one or more lecturers to each subject. Dropdowns show qualified lecturers who teach each course first.</p>
          </div>
          <span className="rounded-full bg-brand-50 px-3 py-1 text-xs font-semibold text-brand-700 border border-brand-100">
            {semesterSubjects.length} Subject{semesterSubjects.length === 1 ? '' : 's'}
          </span>
        </div>
        
        {semesterSubjects.length ? (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[900px] text-left text-sm border-collapse">
              <thead>
                <tr className="bg-gradient-to-r from-slate-900 via-brand-950 to-slate-900 text-xs uppercase tracking-wider text-slate-300">
                  <th className="px-6 py-4 font-bold">Code</th>
                  <th className="px-6 py-4 font-bold">Subject Name</th>
                  <th className="px-5 py-4 font-bold text-center">Theory</th>
                  <th className="px-5 py-4 font-bold text-center">Lab</th>
                  <th className="px-5 py-4 font-bold text-center">Total</th>
                  <th className="px-6 py-4 font-bold min-w-[320px]">Assigned Lecturers</th>
                  <th className="px-6 py-4 font-bold text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {semesterSubjects.map((subject) => {
                  const assignedLecturers = getSubjectLecturers(subject.id)
                  const assignedLecturerIds = assignedLecturers.map(l => l.id)
                  const unassignedLecturers = lecturers.filter(l => !assignedLecturerIds.includes(l.id))

                  // Strictly filter to ONLY lecturers qualified to teach this subject
                  const qualifiedLecturers = unassignedLecturers.filter(l => isLecturerQualified ? isLecturerQualified(l, subject) : true)

                  return (
                    <tr key={subject.id} className="group transition-colors hover:bg-cyan-50/30">
                      {/* Code */}
                      <td className="px-6 py-5">
                        <span className="inline-block rounded-xl bg-gradient-to-r from-brand-600 to-indigo-600 px-3 py-1 font-mono text-xs font-bold text-white shadow-xs">
                          {subject.code}
                        </span>
                      </td>

                      {/* Name */}
                      <td className="px-6 py-5">
                        <p className="font-bold text-slate-900 group-hover:text-brand-700 transition-colors">{subject.name}</p>
                        <p className="text-[11px] text-slate-400 mt-0.5">{subject.total_hours} Hours total course</p>
                      </td>

                      {/* Theory */}
                      <td className="px-5 py-5 text-center">
                        <span className="inline-block rounded-lg border border-indigo-200/80 bg-indigo-50/70 px-2.5 py-1 text-xs font-semibold text-indigo-700">
                          {subject.theory_hours}h
                        </span>
                      </td>

                      {/* Lab */}
                      <td className="px-5 py-5 text-center">
                        {subject.lab_hours > 0 ? (
                          <span className="inline-block rounded-lg border border-amber-200/80 bg-amber-50/70 px-2.5 py-1 text-xs font-semibold text-amber-700">
                            {subject.lab_hours}h
                          </span>
                        ) : (
                          <span className="text-slate-300 font-medium">—</span>
                        )}
                      </td>

                      {/* Total */}
                      <td className="px-5 py-5 text-center">
                        <span className="inline-block rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-1 text-xs font-black text-emerald-800 shadow-xs">
                          {subject.total_hours}h
                        </span>
                      </td>

                      {/* Multi-lecturer assigned pills + Add selector */}
                      <td className="px-6 py-5">
                        <div className="space-y-2">
                          <div className="flex flex-wrap items-center gap-1.5">
                            {assignedLecturers.length > 0 ? (
                              assignedLecturers.map((l) => {
                                const colorStyle = getAvatarColor(l.name)
                                const initial = l.name.charAt(0).toUpperCase()
                                return (
                                  <div 
                                    key={l.id} 
                                    className={`group/badge inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-semibold shadow-xs transition hover:shadow-md ${colorStyle}`}
                                  >
                                    <span className="grid h-4 w-4 place-items-center rounded-full bg-white/70 text-[10px] font-bold">
                                      {initial}
                                    </span>
                                    <span>{l.name}</span>
                                    <button 
                                      onClick={() => handleRemoveLecturer(subject.id, l.id)}
                                      className="ml-0.5 rounded-full p-0.5 hover:bg-rose-100 hover:text-rose-700 transition"
                                      title="Unassign this lecturer"
                                    >
                                      ×
                                    </button>
                                  </div>
                                )
                              })
                            ) : (
                              <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-slate-500 bg-slate-100 border border-slate-200 px-3 py-1 rounded-full">
                                ⚪ Unassigned (0 Lecturers)
                              </span>
                            )}
                          </div>

                          <div className="flex items-center gap-2">
                            <select
                              value=""
                              onChange={(e) => handleAddLecturer(subject.id, e.target.value)}
                              className="w-full max-w-[250px] rounded-xl border border-slate-200 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 outline-none transition focus:border-brand-600 focus:ring-2 focus:ring-brand-600/10 hover:border-slate-300"
                            >
                              <option value="">+ Assign Qualified Lecturer...</option>
                              {qualifiedLecturers.length > 0 ? (
                                qualifiedLecturers.map(l => (
                                  <option key={l.id} value={l.id}>{l.name}</option>
                                ))
                              ) : (
                                <option disabled value="">No qualified lecturers registered for this subject</option>
                              )}
                            </select>
                            
                            {assignedLecturers.length > 0 && (
                              <button
                                onClick={() => assignLecturersToSubject(subject.id, [])}
                                className="text-[11px] font-semibold text-rose-600 hover:text-rose-800 hover:underline px-1 py-0.5"
                                title="Clear all assigned lecturers and leave subject unassigned"
                              >
                                Clear All
                              </button>
                            )}

                            {assignedLecturers.length > 1 && (
                              <span className="text-[11px] font-semibold text-emerald-600 bg-emerald-50 px-2 py-0.5 rounded border border-emerald-100">
                                Multi ({assignedLecturers.length})
                              </span>
                            )}
                          </div>
                        </div>
                      </td>

                      {/* Actions */}

                      <td className="px-6 py-5 text-right">
                        <div className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200/80 bg-white p-1 shadow-xs">
                          <button 
                            onClick={() => setModal({ type: 'subject', data: subject, semester: semester })} 
                            className="rounded-lg p-2 text-slate-600 transition hover:bg-cyan-50 hover:text-brand-600" 
                            title="Edit subject"
                          >
                            <Icon name="edit" className="h-4 w-4" />
                          </button>
                          <button 
                            onClick={() => remove('subjects', subject.id)} 
                            className="rounded-lg p-2 text-slate-400 transition hover:bg-rose-50 hover:text-rose-600" 
                            title="Delete subject"
                          >
                            <Icon name="trash" className="h-4 w-4" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        ) : (
          <Empty title="No subjects in this semester" text="Use Add Subject to start building this semester's curriculum." />
        )}
      </div>
    </section>
  )
}


