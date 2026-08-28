import { useOutletContext, useParams, useNavigate } from 'react-router-dom'
import { Icon } from '../components/Icon'
import { Empty } from '../components/Empty'
import { useMemo, useState, useRef, useEffect } from 'react'
import { supabase } from '../lib/supabase'

const blankSubject = { name: '', theory_hours: 0, lab_hours: 0 }

const LECTURER_COLORS = [
  'bg-blue-100 text-blue-700 border-blue-200',
  'bg-purple-100 text-purple-700 border-purple-200',
  'bg-emerald-100 text-emerald-700 border-emerald-200',
  'bg-amber-100 text-amber-700 border-amber-200',
  'bg-rose-100 text-rose-700 border-rose-200',
  'bg-cyan-100 text-cyan-700 border-cyan-200',
  'bg-orange-100 text-orange-700 border-orange-200',
  'bg-indigo-100 text-indigo-700 border-indigo-200',
]

function getAvatarColor(name = '') {
  let hash = 0
  for (let i = 0; i < name.length; i++) hash = name.charCodeAt(i) + ((hash << 5) - hash)
  return LECTURER_COLORS[Math.abs(hash) % LECTURER_COLORS.length]
}

// ── Search-ahead component ───────────────────────────────────────────────────
function LecturerSearch({ unaddedLecturers, onAdd }) {
  const [query, setQuery] = useState('')
  const [open, setOpen] = useState(false)
  const ref = useRef()

  const results = useMemo(() => {
    const q = query.toLowerCase().trim()
    if (!q) return []
    return unaddedLecturers.filter(l =>
      l.name.toLowerCase().includes(q) ||
      (l.lecturer_id || '').toLowerCase().includes(q)
    ).slice(0, 8)
  }, [query, unaddedLecturers])

  // Close dropdown on outside click
  useEffect(() => {
    function handle(e) { if (ref.current && !ref.current.contains(e.target)) setOpen(false) }
    document.addEventListener('mousedown', handle)
    return () => document.removeEventListener('mousedown', handle)
  }, [])

  const pick = (lecturer) => {
    onAdd(lecturer.id)
    setQuery('')
    setOpen(false)
  }

  return (
    <div ref={ref} className="relative w-full sm:w-96">
      <div className="flex items-center gap-3 rounded-2xl border-2 border-slate-200 bg-white px-4 py-3 shadow-sm transition-all focus-within:border-brand-500 focus-within:ring-4 focus-within:ring-brand-500/20">
        <svg className="h-5 w-5 shrink-0 text-slate-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-4.35-4.35M17 11A6 6 0 1 1 5 11a6 6 0 0 1 12 0z" />
        </svg>
        <input
          type="text"
          value={query}
          onChange={e => { setQuery(e.target.value); setOpen(true) }}
          onFocus={() => setOpen(true)}
          placeholder="Search lecturer by name or ID…"
          className="flex-1 bg-transparent text-base font-medium text-slate-700 outline-none placeholder:text-slate-400 placeholder:font-normal"
        />
        {query && (
          <button onClick={() => { setQuery(''); setOpen(false) }} className="text-slate-300 hover:text-slate-500 transition">
            <Icon name="trash" className="h-4 w-4" />
          </button>
        )}
      </div>

      {open && results.length > 0 && (
        <ul className="absolute left-0 right-0 top-full z-30 mt-1.5 overflow-hidden rounded-xl border border-slate-200 bg-white shadow-xl">
          {results.map(l => (
            <li key={l.id}>
              <button
                onClick={() => pick(l)}
                className="flex w-full items-center gap-3 px-4 py-2.5 text-left hover:bg-brand-50 transition"
              >
                <div className={`grid h-8 w-8 shrink-0 place-items-center rounded-full border-2 text-xs font-black ${getAvatarColor(l.name)}`}>
                  {l.name.charAt(0).toUpperCase()}
                </div>
                <div>
                  <p className="text-sm font-semibold text-slate-800">{l.name}</p>
                  <p className="text-[11px] text-slate-400">{l.lecturer_id}</p>
                </div>
                <span className="ml-auto rounded-lg bg-brand-600 px-2.5 py-1 text-[11px] font-bold text-white">Add</span>
              </button>
            </li>
          ))}
        </ul>
      )}

      {open && query.trim() && results.length === 0 && (
        <div className="absolute left-0 right-0 top-full z-30 mt-1.5 rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-400 shadow-xl">
          No lecturers found for "<strong>{query}</strong>"
        </div>
      )}
    </div>
  )
}

// ── Subject Assign Cell (for table) ──────────────────────────────────────────
function SubjectAssignCell({ lecturer, assignedSubjects, unassignedSubjects, toggleSubjectForLecturer, colorStyle }) {
  const [pickerOpen, setPickerOpen] = useState(false)
  const [subjectQuery, setSubjectQuery] = useState('')
  const pickerRef = useRef()
  const searchInputRef = useRef()

  const matchingSubjects = useMemo(() => {
    const query = subjectQuery.trim().toLowerCase()
    if (!query) return unassignedSubjects

    return unassignedSubjects.filter(subject =>
      [subject.name, subject.code, subject.id]
        .filter(Boolean)
        .some(value => String(value).toLowerCase().includes(query))
    )
  }, [subjectQuery, unassignedSubjects])

  // Close picker on outside click
  useEffect(() => {
    function handle(e) { if (pickerRef.current && !pickerRef.current.contains(e.target)) setPickerOpen(false) }
    document.addEventListener('mousedown', handle)
    return () => document.removeEventListener('mousedown', handle)
  }, [])

  useEffect(() => {
    if (pickerOpen) searchInputRef.current?.focus()
    else setSubjectQuery('')
  }, [pickerOpen])

  return (
    <div className="flex flex-wrap items-center gap-1.5">
      {assignedSubjects.length > 0 ? (
        assignedSubjects.map(sub => (
          <button
            key={sub.id}
            onClick={() => toggleSubjectForLecturer(lecturer.id, sub.id)}
            title={`Click to unassign ${sub.name}`}
            className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-xs font-semibold transition hover:opacity-70 ${colorStyle}`}
          >
            {sub.name}
            <span className="text-[10px] opacity-60">×</span>
          </button>
        ))
      ) : (
        <span className="text-xs italic text-slate-400">None assigned</span>
      )}

      {/* Add Subject button + dropdown */}
      {unassignedSubjects.length > 0 && (
        <div ref={pickerRef} className="relative">
          <button
            onClick={() => setPickerOpen(v => !v)}
            className="inline-flex items-center gap-1 rounded-full border border-dashed border-brand-300 bg-brand-50/50 px-2.5 py-0.5 text-xs font-semibold text-brand-600 transition hover:border-brand-500 hover:bg-brand-100"
            title="Add subject"
          >
            <Icon name="plus" className="h-3 w-3" />
            Add
          </button>

          {pickerOpen && (
            <div className="absolute left-0 top-full z-40 mt-1.5 min-w-[220px] overflow-hidden rounded-xl border border-slate-200 bg-white shadow-xl">
              <p className="px-3 pt-2 text-[10px] font-bold uppercase tracking-wider text-slate-400">
                Assign a subject
              </p>
              <div className="border-b border-slate-100 px-3 py-2">
                <label className="sr-only" htmlFor={`subject-search-${lecturer.id}`}>Search subjects</label>
                <input
                  ref={searchInputRef}
                  id={`subject-search-${lecturer.id}`}
                  type="search"
                  value={subjectQuery}
                  onChange={event => setSubjectQuery(event.target.value)}
                  placeholder="Search by name or subject ID…"
                  className="w-full rounded-lg border border-slate-200 bg-slate-50 px-2.5 py-1.5 text-xs text-slate-700 outline-none placeholder:text-slate-400 focus:border-brand-400 focus:bg-white focus:ring-2 focus:ring-brand-100"
                />
              </div>
              <ul className="max-h-48 overflow-y-auto py-1">
                {matchingSubjects.map(sub => (
                  <li key={sub.id}>
                    <button
                      onClick={() => { toggleSubjectForLecturer(lecturer.id, sub.id); setPickerOpen(false) }}
                      className="flex w-full items-center gap-3 px-3 py-2 text-left text-sm transition hover:bg-brand-50"
                    >
                      <span className="font-mono text-[10px] font-bold text-indigo-500 bg-indigo-50 rounded px-1.5 py-0.5 shrink-0">
                        {sub.code}
                      </span>
                      <span className="font-medium text-slate-700 truncate">{sub.name}</span>
                    </button>
                  </li>
                ))}
                {matchingSubjects.length === 0 && (
                  <li className="px-3 py-3 text-xs text-slate-400">
                    No subjects match “{subjectQuery.trim()}”.
                  </li>
                )}
              </ul>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

// ── Lecturer Card ────────────────────────────────────────────────────────────
function LecturerCard({ lecturer, semesterSubjects, getSubjectLecturers, toggleSubjectForLecturer, removeLecturerFromSemester }) {
  const [showPicker, setShowPicker] = useState(false)
  const colorStyle = getAvatarColor(lecturer.name)
  const initial = lecturer.name.charAt(0).toUpperCase()

  const assignedSubjects = semesterSubjects.filter(sub =>
    getSubjectLecturers(sub.id).some(l => l.id === lecturer.id)
  )
  const unassignedSubjects = semesterSubjects.filter(sub =>
    !getSubjectLecturers(sub.id).some(l => l.id === lecturer.id)
  )

  return (
    <div className="flex flex-col rounded-3xl border border-slate-200 bg-white p-5 shadow-sm transition hover:shadow-md">
      {/* Card Header */}
      <div className="flex items-start justify-between gap-3 mb-5">
        <div className="flex items-center gap-3.5">
          <div className={`grid h-12 w-12 shrink-0 place-items-center rounded-full border-4 text-lg font-black ${colorStyle}`}>
            {initial}
          </div>
          <div>
            <p className="text-base font-bold text-slate-900">{lecturer.name}</p>
            <p className="text-xs text-slate-400 mt-0.5 font-medium">
              {lecturer.lecturer_id} · {lecturer.is_all_week ? 'All week' : (lecturer.available_days || []).join(', ')}
            </p>
          </div>
        </div>
        <button
          onClick={() => removeLecturerFromSemester(lecturer.id)}
          className="rounded-xl p-2 text-slate-300 hover:bg-rose-50 hover:text-rose-500 transition"
          title="Remove from semester"
        >
          <Icon name="trash" className="h-4 w-4" />
        </button>
      </div>

      {/* Assigned Subjects */}
      <div className="flex-1 flex flex-col space-y-3">
        {assignedSubjects.length === 0 ? (
          <div className="flex-1 rounded-2xl border border-dashed border-slate-200 flex items-center justify-center p-4">
            <p className="text-xs italic text-slate-400">No subjects assigned yet</p>
          </div>
        ) : (
          assignedSubjects.map(sub => (
            <div
              key={sub.id}
              className="group flex items-center justify-between gap-3 rounded-2xl border border-slate-200 bg-white px-4 py-3 transition hover:border-indigo-300 hover:shadow-sm"
            >
              <div className="flex items-center gap-3 min-w-0">
                <span className="font-mono text-xs font-bold text-indigo-600 bg-indigo-50/80 rounded-lg px-2 py-1 shrink-0">{sub.code}</span>
                <span className="text-sm font-semibold text-slate-700 truncate">{sub.name}</span>
              </div>
              <div className="flex items-center gap-3 shrink-0">
                <span className="text-xs font-bold text-slate-400">{sub.total_hours}h</span>
                <button
                  onClick={() => toggleSubjectForLecturer(lecturer.id, sub.id)}
                  className="rounded-lg p-1.5 text-slate-300 opacity-0 group-hover:opacity-100 hover:bg-rose-50 hover:text-rose-500 transition"
                  title="Unassign subject"
                >
                  <Icon name="trash" className="h-4 w-4" />
                </button>
              </div>
            </div>
          ))
        )}

        {/* Assign Subject Picker */}
        {showPicker && unassignedSubjects.length > 0 && (
          <div className="rounded-2xl border border-slate-200 bg-slate-50 p-2 space-y-1 mt-1 shadow-inner">
            <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400 px-2 pb-1">Pick a subject to assign:</p>
            {unassignedSubjects.map(sub => (
              <button
                key={sub.id}
                onClick={() => { toggleSubjectForLecturer(lecturer.id, sub.id); setShowPicker(false) }}
                className="flex w-full items-center justify-between gap-2 rounded-xl border border-transparent hover:border-slate-200 bg-transparent hover:bg-white px-3 py-2 text-left transition shadow-sm hover:shadow"
              >
                <div className="flex items-center gap-3 min-w-0">
                  <span className="font-mono text-[10px] font-bold text-indigo-500 shrink-0">{sub.code}</span>
                  <span className="text-xs font-semibold text-slate-700 truncate">{sub.name}</span>
                </div>
                <span className="text-[10px] font-bold text-slate-400 shrink-0">{sub.total_hours}h</span>
              </button>
            ))}
          </div>
        )}

        {/* Footer buttons */}
        <div className="mt-auto pt-3 flex items-center justify-between gap-2">
          {unassignedSubjects.length > 0 ? (
            <button
              onClick={() => setShowPicker(v => !v)}
              className="inline-flex items-center gap-2 rounded-xl border border-slate-300 bg-white px-4 py-2.5 text-sm font-semibold text-slate-700 hover:bg-slate-50 hover:border-slate-400 transition shadow-sm"
            >
              <Icon name="plus" className="h-4 w-4" />
              {showPicker ? 'Cancel' : 'Assign Subject'}
            </button>
          ) : assignedSubjects.length > 0 ? (
            <span className="text-xs text-emerald-600 font-semibold px-2">✅ All subjects assigned</span>
          ) : <div />}

          {assignedSubjects.length > 0 && (
            <span className="rounded-xl border border-brand-200 bg-brand-50 px-3 py-1.5 text-[11px] font-bold text-brand-700 shadow-sm">
              {assignedSubjects.length} subject{assignedSubjects.length !== 1 ? 's' : ''}
            </span>
          )}
        </div>
      </div>
    </div>
  )
}

// ── Main Page ────────────────────────────────────────────────────────────────
export function SemesterDetail() {
  const { id } = useParams()
  const navigate = useNavigate()
  const { 
    semesters, subjects, lecturers, 
    setModal, remove, setNotice,
    semesterLecturers, setSemesterLecturers,
    assignLecturersToSubject, getSubjectLecturers
  } = useOutletContext()

  const semester = useMemo(() => semesters.find(s => s.id === id), [semesters, id])
  const semesterSubjects = useMemo(() => subjects.filter(s => s.semester_id === semester?.id), [subjects, semester])

  const totalHours = useMemo(() => semesterSubjects.reduce((sum, s) => sum + s.total_hours, 0), [semesterSubjects])
  const totalTheory = useMemo(() => semesterSubjects.reduce((sum, s) => sum + s.theory_hours, 0), [semesterSubjects])
  const totalLab = useMemo(() => semesterSubjects.reduce((sum, s) => sum + s.lab_hours, 0), [semesterSubjects])

  // ── Teaching Staff ──────────────────────────────────────────────────────────
  // Derive staffIds from DB-backed semesterLecturers + any lecturers assigned to subjects in this semester
  const staffIds = useMemo(() => {
    const explicitStaff = semesterLecturers.filter(sl => sl.semester_id === id).map(sl => sl.lecturer_id)
    const subjectStaff = semesterSubjects.flatMap(sub => getSubjectLecturers(sub.id).map(l => l.id))
    return Array.from(new Set([...explicitStaff, ...subjectStaff]))
  }, [semesterLecturers, id, semesterSubjects, getSubjectLecturers])

  const addLecturerToSemester = async (lecturerId) => {
    if (!lecturerId) return
    const isAlreadyInSemesterLecturers = semesterLecturers.some(sl => sl.semester_id === id && sl.lecturer_id === lecturerId)
    if (isAlreadyInSemesterLecturers) return

    // Optimistic local update
    setSemesterLecturers(prev => [...prev, { semester_id: id, lecturer_id: lecturerId }])

    // Sync to DB
    const { error } = await supabase.from('semester_lecturers').upsert([{ semester_id: id, lecturer_id: lecturerId }], { onConflict: 'semester_id,lecturer_id' })
    if (error) setNotice(`Failed to add lecturer: ${error.message}`, 'error')
  }

  const removeLecturerFromSemester = async (lecturerId) => {
    // 1. Remove them from all subjects in this semester
    semesterSubjects.forEach(sub => {
      const current = getSubjectLecturers(sub.id).map(l => l.id)
      if (current.includes(lecturerId)) {
        assignLecturersToSubject(sub.id, current.filter(id => id !== lecturerId))
      }
    })
    
    // 2. Remove them from the semester staff pool
    // Optimistic local update
    setSemesterLecturers(semesterLecturers.filter(sl => !(sl.semester_id === id && sl.lecturer_id === lecturerId)))
    
    // Sync to DB
    const { error } = await supabase.from('semester_lecturers')
      .delete()
      .eq('semester_id', id)
      .eq('lecturer_id', lecturerId)
      
    if (error) setNotice(`Failed to remove lecturer: ${error.message}`, 'error')
  }

  const toggleSubjectForLecturer = (lecturerId, subjectId) => {
    const currentAssignedIds = getSubjectLecturers(subjectId).map(l => l.id)
    const isAlreadyAssigned = currentAssignedIds.includes(lecturerId)

    let updatedIds
    if (isAlreadyAssigned) {
      // Remove ONLY this lecturer from the subject
      updatedIds = currentAssignedIds.filter(id => id !== lecturerId)
    } else {
      // Add this lecturer to the subject alongside any existing lecturers
      updatedIds = Array.from(new Set([...currentAssignedIds, lecturerId]))
      addLecturerToSemester(lecturerId)
    }

    assignLecturersToSubject(subjectId, updatedIds)
  }

  const staffLecturers = useMemo(() => lecturers.filter(l => staffIds.includes(l.id)), [lecturers, staffIds])
  const unaddedLecturers = useMemo(() => lecturers.filter(l => !staffIds.includes(l.id)), [lecturers, staffIds])

  if (!semester) return <div className="p-8 text-center text-slate-500">Semester not found</div>

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
            <h1 className="text-2xl font-black tracking-tight text-white sm:text-3xl">{semester.name}</h1>
          </div>

          <button
            onClick={() => setModal({ type: 'subject', data: blankSubject, semester })}
            className="inline-flex items-center justify-center gap-2 rounded-2xl bg-gradient-to-r from-cyan-500 to-brand-500 px-5 py-3 text-sm font-bold text-white shadow-lg shadow-cyan-500/30 transition hover:scale-[1.02] active:scale-[0.98]"
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
            <p className="text-[11px] font-medium uppercase tracking-wider text-cyan-200/70">Teaching Staff</p>
            <p className="text-xl font-bold text-cyan-300 mt-0.5">{staffLecturers.length} Assigned</p>
          </div>
        </div>
      </div>

      {/* ── Subjects Table ── */}
      <div className="overflow-hidden rounded-3xl border border-slate-200/80 bg-white shadow-xl shadow-slate-200/50">
        <div className="flex items-center justify-between border-b border-slate-100 bg-slate-50/80 px-6 py-4">
          <div>
            <h2 className="text-base font-bold text-brand-950">Curriculum</h2>
            <p className="text-xs text-slate-500 mt-0.5">All subjects in this semester with their hours.</p>
          </div>
          <span className="rounded-full bg-brand-50 px-3 py-1 text-xs font-semibold text-brand-700 border border-brand-100">
            {semesterSubjects.length} Subject{semesterSubjects.length !== 1 ? 's' : ''}
          </span>
        </div>

        {semesterSubjects.length ? (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm border-collapse">
              <thead>
                <tr className="bg-gradient-to-r from-slate-900 via-brand-950 to-slate-900 text-xs uppercase tracking-wider text-slate-300">
                  <th className="px-6 py-4 font-bold">Code</th>
                  <th className="px-6 py-4 font-bold">Subject Name</th>
                  <th className="px-5 py-4 font-bold text-center">Theory</th>
                  <th className="px-5 py-4 font-bold text-center">Lab</th>
                  <th className="px-5 py-4 font-bold text-center">Total</th>
                  <th className="px-6 py-4 font-bold">Assigned Lecturers</th>
                  <th className="px-6 py-4 font-bold text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {semesterSubjects.map((subject) => {
                  const assignedLecturers = getSubjectLecturers(subject.id)
                  return (
                    <tr key={subject.id} className="group transition-colors hover:bg-cyan-50/30">
                      <td className="px-6 py-4">
                        <span className="inline-block rounded-xl bg-gradient-to-r from-brand-600 to-indigo-600 px-3 py-1 font-mono text-xs font-bold text-white shadow-xs">
                          {subject.code}
                        </span>
                      </td>
                      <td className="px-6 py-4">
                        <p className="font-bold text-slate-900">{subject.name}</p>
                        <p className="text-[11px] text-slate-400 mt-0.5">{subject.total_hours} hrs total</p>
                      </td>
                      <td className="px-5 py-4 text-center">
                        <span className="inline-block rounded-lg border border-indigo-200/80 bg-indigo-50/70 px-2.5 py-1 text-xs font-semibold text-indigo-700">
                          {subject.theory_hours}h
                        </span>
                      </td>
                      <td className="px-5 py-4 text-center">
                        {subject.lab_hours > 0 ? (
                          <span className="inline-block rounded-lg border border-amber-200/80 bg-amber-50/70 px-2.5 py-1 text-xs font-semibold text-amber-700">
                            {subject.lab_hours}h
                          </span>
                        ) : (
                          <span className="text-slate-300">—</span>
                        )}
                      </td>
                      <td className="px-5 py-4 text-center">
                        <span className="inline-block rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-1 text-xs font-black text-emerald-800">
                          {subject.total_hours}h
                        </span>
                      </td>
                      <td className="px-6 py-4">
                        <div className="flex flex-wrap gap-1.5">
                          {assignedLecturers.length > 0 ? (
                            assignedLecturers.map(l => (
                              <span key={l.id} className={`inline-flex items-center gap-1 rounded-full border px-2.5 py-0.5 text-xs font-semibold ${getAvatarColor(l.name)}`}>
                                {l.name.split(' ')[0]}
                              </span>
                            ))
                          ) : (
                            <span className="text-xs italic text-slate-400">Not assigned yet</span>
                          )}
                        </div>
                      </td>
                      <td className="px-6 py-4 text-right">
                        <div className="inline-flex items-center gap-1 rounded-xl border border-slate-200/80 bg-white p-1 shadow-xs">
                          <button onClick={() => setModal({ type: 'subject', data: subject, semester })} className="rounded-lg p-2 text-slate-600 hover:bg-cyan-50 hover:text-brand-600" title="Edit">
                            <Icon name="edit" className="h-4 w-4" />
                          </button>
                          <button onClick={() => remove('subjects', subject.id)} className="rounded-lg p-2 text-slate-400 hover:bg-rose-50 hover:text-rose-600" title="Delete">
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
          <Empty title="No subjects yet" text="Use Add Subject to start building this semester's curriculum." />
        )}
      </div>

      {/* ── Teaching Staff Section ── */}
      <div className="overflow-hidden rounded-3xl border border-slate-200/80 bg-white shadow-xl shadow-slate-200/50">
        <div className="flex flex-col gap-4 border-b border-slate-100 bg-slate-50/80 px-6 py-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h2 className="text-base font-bold text-brand-950">Teaching Staff</h2>
            <p className="text-xs text-slate-500 mt-0.5">Search and add lecturers, then assign their subjects.</p>
          </div>
          <LecturerSearch unaddedLecturers={unaddedLecturers} onAdd={addLecturerToSemester} />
        </div>

        {staffLecturers.length === 0 ? (
          <div className="px-6 py-14 text-center">
            <div className="mx-auto mb-3 flex h-14 w-14 items-center justify-center rounded-full bg-slate-100 text-2xl">👤</div>
            <p className="font-semibold text-slate-700">No lecturers assigned yet</p>
            <p className="mt-1 text-sm text-slate-400">Search for a lecturer by name or ID above to get started.</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm border-collapse">
              <thead>
                <tr className="bg-gradient-to-r from-slate-900 via-brand-950 to-slate-900 text-xs uppercase tracking-wider text-slate-300">
                  <th className="px-6 py-4 font-bold">Lecturer</th>
                  <th className="px-6 py-4 font-bold">ID</th>
                  <th className="px-6 py-4 font-bold">Availability</th>
                  <th className="px-6 py-4 font-bold">Assigned Subjects</th>
                  <th className="px-6 py-4 font-bold text-right">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {staffLecturers.map((lecturer) => {
                  const assignedSubjects = semesterSubjects.filter(sub =>
                    getSubjectLecturers(sub.id).some(l => l.id === lecturer.id)
                  )
                  const unassignedSubjects = semesterSubjects.filter(sub =>
                    !getSubjectLecturers(sub.id).some(l => l.id === lecturer.id)
                  )
                  const colorStyle = getAvatarColor(lecturer.name)
                  return (
                    <tr key={lecturer.id} className="group transition-colors hover:bg-cyan-50/30">
                      {/* Name + avatar */}
                      <td className="px-6 py-4">
                        <div className="flex items-center gap-3">
                          <div className={`grid h-9 w-9 shrink-0 place-items-center rounded-full border-2 text-sm font-black ${colorStyle}`}>
                            {lecturer.name.charAt(0).toUpperCase()}
                          </div>
                          <span className="font-semibold text-slate-900">{lecturer.name}</span>
                        </div>
                      </td>
                      {/* Lecturer ID */}
                      <td className="px-6 py-4">
                        <span className="font-mono text-xs font-bold text-brand-600 bg-brand-50 rounded-lg px-2 py-1">
                          {lecturer.lecturer_id}
                        </span>
                      </td>
                      {/* Availability */}
                      <td className="px-6 py-4">
                        <span className="rounded-full bg-cyan-50 px-3 py-1 text-xs font-semibold text-brand-700">
                          {lecturer.is_all_week ? 'All week' : (lecturer.available_days || []).join(', ')}
                        </span>
                      </td>
                      {/* Assigned subjects */}
                      <td className="px-6 py-4">
                        <SubjectAssignCell
                          lecturer={lecturer}
                          assignedSubjects={assignedSubjects}
                          unassignedSubjects={unassignedSubjects}
                          toggleSubjectForLecturer={toggleSubjectForLecturer}
                          colorStyle={colorStyle}
                        />
                      </td>
                      {/* Remove */}
                      <td className="px-6 py-4 text-right">
                        <button
                          onClick={() => removeLecturerFromSemester(lecturer.id)}
                          className="rounded-lg p-2 text-slate-400 hover:bg-rose-50 hover:text-rose-500 transition"
                          title="Remove from semester"
                        >
                          <Icon name="trash" className="h-4 w-4" />
                        </button>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </section>
  )
}
