import { useState, useEffect } from 'react'
import { NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import facultyLogo from '../assets/logo.png'
import { Icon } from '../components/Icon'
import { Modal } from '../components/Modal'
import { getYearSemesterMap } from '../lib/semesterUtils'

export function AppLayout() {
  const [semesters, setSemesters] = useState([])
  const [subjects, setSubjects] = useState([])
  const [lecturers, setLecturers] = useState([])
  const [classes, setClasses] = useState([])
  const [academicYears, setAcademicYears] = useState([])
  const [departments, setDepartments] = useState([])
  
  // New DB-backed states replacing local storage maps
  const [subjectLecturers, setSubjectLecturers] = useState([])
  const [semesterLecturers, setSemesterLecturers] = useState([])
  
  const [loading, setLoading] = useState(true)
  const [notice, setNotice] = useState(null) // { msg, type: 'success' | 'error' }
  const notify = (msg, type = 'success') => setNotice({ msg, type })
  
  useEffect(() => {
    if (notice) {
      const timer = setTimeout(() => setNotice(null), 3000)
      return () => clearTimeout(timer)
    }
  }, [notice])

  const [modal, setModal] = useState(null)
  
  const location = useLocation()
  const navigate = useNavigate()

  const loadData = async () => {
    setLoading(true)
    try {
      const [semRes, subRes, lecRes, clsRes, yrRes, deptRes, subLecRes, semLecRes] = await Promise.all([
        supabase.from('semesters').select('*').order('name', { ascending: false }),
        supabase.from('subjects').select('*').order('name'),
        supabase.from('lecturers').select('*').order('name'),
        supabase.from('classes').select('*').order('name'),
        supabase.from('academic_years').select('*').order('year', { ascending: false }),
        supabase.from('departments').select('*').order('name'),
        supabase.from('subject_lecturers').select('*'),
        supabase.from('semester_lecturers').select('*')
      ])
      if (semRes.error) throw semRes.error
      if (subRes.error) throw subRes.error
      if (lecRes.error) throw lecRes.error
      if (clsRes.error) throw clsRes.error
      if (yrRes.error) throw yrRes.error
      if (deptRes.error) throw deptRes.error
      
      if (subLecRes.error) console.error("Could not load subject_lecturers:", subLecRes.error)
      if (semLecRes.error) console.warn("Could not load semester_lecturers. Did you run the SQL migration?", semLecRes.error)
      
      const loadedClasses = clsRes.data || []
      const yearSemMap = getYearSemesterMap(loadedClasses)
      
      // Auto-sync any classes that don't match their Academic Year's semester
      const syncedClasses = loadedClasses.map(c => {
        if (c.intake_year && yearSemMap[c.intake_year] && c.semester_id !== yearSemMap[c.intake_year]) {
          const correctSem = yearSemMap[c.intake_year]
          // Sync DB in background
          supabase.from('classes').update({ semester_id: correctSem }).eq('id', c.id)
          return { ...c, semester_id: correctSem }
        }
        return c
      })

      setSemesters(semRes.data || [])
      setSubjects(subRes.data || [])
      setLecturers(lecRes.data || [])
      setClasses(syncedClasses)
      setAcademicYears((yrRes.data || []).map(y => y.year))
      setDepartments(deptRes.data || [])
      setSubjectLecturers(subLecRes.data || [])
      setSemesterLecturers(semLecRes.data || [])
    } catch (err) {
      notify(`Could not load data: ${err.message}`, 'error')
    }
    setLoading(false)
  }

  useEffect(() => { loadData() }, [])

  async function save(table, values, id) {
    const query = id
      ? supabase.from(table).update(values).eq('id', id).select().single()
      : supabase.from(table).insert(values).select().single()
    const { data: savedRecord, error } = await query
    if (error) return notify(error.message, 'error')
    setModal(null)
    notify(`${id ? 'Changes' : 'New record'} saved successfully.`, 'success')
    await loadData()
    return savedRecord
  }

  async function remove(table, id) {
    if (!window.confirm('Delete this record? This cannot be undone.')) return
    const { error } = await supabase.from(table).delete().eq('id', id)
    if (error) return notify(error.message, 'error')
    notify('Record deleted.', 'success')
    await loadData()
  }

  const nav = [
    ['Dashboard', 'grid', '/'],
    ['Timetable', 'calendar', '/timetable'],
    ['Master Schedule', 'table', '/schedule'],
    ['Semesters', 'layers', '/semesters'],
    ['Classes', 'group', '/classes'],
    ['Lecturers', 'users', '/lecturers']
  ]

  const metrics = [
    ['Total Semesters', semesters.length, 'layers', 'bg-brand-600'],
    ['Total Subjects', subjects.length, 'grid', 'bg-accent-400'],
    ['Total Lecturers', lecturers.length, 'users', 'bg-[#7b61c9]'],
    ['Total Classes', classes.length, 'group', 'bg-[#ef7f61]'],
  ]

  // Taught subjects logic directly modifies lecturer state and DB
  const saveLecturerTaughtSubjects = async (lecturerId, taughtSubjects) => {
    // Optimistic local state update
    setLecturers(prev => prev.map(l => l.id === lecturerId ? { ...l, taught_subjects: taughtSubjects } : l))
    
    // Sync to DB
    const { error } = await supabase.from('lecturers').update({ taught_subjects: taughtSubjects }).eq('id', lecturerId)
    if (error) notify(error.message, 'error')
  }

  const getLecturerTaughtSubjects = (lecturerId) => {
    const lecturer = lecturers.find(l => l.id === lecturerId)
    if (lecturer && Array.isArray(lecturer.taught_subjects)) return lecturer.taught_subjects
    return []
  }

  const isLecturerQualified = (lecturer, subject) => {
    const taught = getLecturerTaughtSubjects(lecturer.id)
    if (!taught || taught.length === 0) return false
    return taught.includes(subject.name) || taught.includes(subject.code)
  }

  const assignLecturersToSubject = async (subjectId, lecturerIds) => {
    // Optimistic local update for subjectLecturers junction
    const currentOthers = subjectLecturers.filter(sl => sl.subject_id !== subjectId)
    const newAssignments = lecturerIds.map(id => ({ subject_id: subjectId, lecturer_id: id }))
    setSubjectLecturers([...currentOthers, ...newAssignments])

    // Also update subjects state locally so stats refresh instantly (primary lecturer)
    const primaryId = lecturerIds.length > 0 ? lecturerIds[0] : null
    setSubjects(prev => prev.map(s =>
      s.id === subjectId ? { ...s, lecturer_id: primaryId } : s
    ))

    // Sync to DB in background
    // 1. Update primary lecturer on subjects table
    supabase.from('subjects').update({ lecturer_id: primaryId }).eq('id', subjectId)
      .then(({ error }) => { if (error) notify(error.message, 'error') })
      
    // 2. Replace all subject_lecturers rows for this subject
    const { error: delError } = await supabase.from('subject_lecturers').delete().eq('subject_id', subjectId)
    if (delError) {
      notify(delError.message, 'error')
      return
    }
    
    if (newAssignments.length > 0) {
      const { error: insError } = await supabase.from('subject_lecturers').insert(newAssignments)
      if (insError) notify(insError.message, 'error')
    }
  }

  const getSubjectLecturers = (subjectId) => {
    // Read from DB-backed state
    const assignedIds = subjectLecturers.filter(sl => sl.subject_id === subjectId).map(sl => sl.lecturer_id)
    if (assignedIds.length > 0) {
      return lecturers.filter(l => assignedIds.includes(l.id))
    }
    
    // Fallback to single primary lecturer if junction table is empty
    const sub = subjects.find(s => s.id === subjectId)
    if (sub && sub.lecturer_id) {
      const dbL = lecturers.find(l => l.id === sub.lecturer_id)
      return dbL ? [dbL] : []
    }
    return []
  }

  const getRandomLecturerForClass = (subjectId, classId) => {
    const subjectLecturersList = getSubjectLecturers(subjectId)
    if (!subjectLecturersList || subjectLecturersList.length === 0) return null
    if (subjectLecturersList.length === 1) return subjectLecturersList[0]

    // Deterministic random hash per (subjectId + classId) combination
    let hash = 0
    const str = (subjectId || '') + (classId || '')
    for (let i = 0; i < str.length; i++) {
      hash = (hash << 5) - hash + str.charCodeAt(i)
      hash |= 0
    }
    const index = Math.abs(hash) % subjectLecturersList.length
    return subjectLecturersList[index]
  }

  return (
    <div className="min-h-screen bg-[#f5f8fa] font-sans text-[#16333a] lg:flex">
      <aside className="flex w-full flex-col bg-brand-950 text-white lg:fixed lg:inset-y-0 lg:w-64">
        <div className="flex items-center gap-3 px-6 py-7">
          <div className="grid h-11 w-11 place-items-center overflow-hidden rounded-full bg-white p-0.5 shadow-lg">
            <img src={facultyLogo} className="h-full w-full object-cover" alt="Jamhuriya University logo" />
          </div>
          <div>
            <p className="text-lg font-bold tracking-tight">Smart Timetable</p>
            <p className="text-xs text-cyan-100/70">IT Faculty Portal</p>
          </div>
        </div>
        <nav className="flex gap-1 overflow-x-auto px-3 pb-5 lg:block lg:space-y-1">
          {nav.map(([label, icon, path]) => (
            <NavLink 
              key={label} 
              to={path}
              className={({ isActive }) => `flex min-w-max items-center gap-3 rounded-xl px-4 py-3 text-sm font-medium transition lg:w-full ${isActive ? 'bg-brand-600 text-white shadow-lg shadow-black/10' : 'text-cyan-50/70 hover:bg-white/10 hover:text-white'}`}
            >
              <Icon name={icon} />{label}
            </NavLink>
          ))}
        </nav>
        <div className="mt-auto hidden border-t border-white/10 px-6 py-5 text-xs text-cyan-100/55 lg:block">© 2026 IT Faculty</div>
      </aside>

      <main className="min-w-0 flex-1 p-5 sm:p-8 lg:ml-64">
        {location.pathname !== '/' && (
          <button 
            onClick={() => navigate(-1)} 
            className="mb-6 inline-flex items-center gap-2 rounded-xl bg-white px-4 py-2.5 text-sm font-bold text-slate-600 hover:bg-slate-50 hover:text-brand-600 transition shadow-sm border border-slate-200 hover:border-brand-200"
          >
            <Icon name="back" className="h-4 w-4" /> Go Back
          </button>
        )}

        {notice && (
          <div className={`mb-5 flex items-center justify-between rounded-xl border px-4 py-3 text-sm font-medium ${
            notice.type === 'error'
              ? 'border-rose-300 bg-rose-50 text-rose-800'
              : 'border-emerald-300 bg-emerald-50 text-emerald-800'
          }`}>
            <div className="flex items-center gap-2">
              <span className="text-base">{notice.type === 'error' ? '⚠' : '✓'}</span>
              <span>{notice.msg}</span>
            </div>
            <button onClick={() => setNotice(null)} className="ml-4 rounded p-1 text-lg leading-none opacity-60 hover:opacity-100">×</button>
          </div>
        )}
        
        {loading ? (
          <div className="rounded-2xl bg-white p-12 text-center text-slate-500 shadow-sm">Loading timetable data…</div>
        ) : (
          <Outlet context={{ 
            semesters, subjects, lecturers, classes, academicYears, departments,
            setModal, remove, metrics, loadData, setNotice: notify, 
            subjectLecturers, semesterLecturers, setSemesterLecturers,
            assignLecturersToSubject, getSubjectLecturers, getRandomLecturerForClass,
            saveLecturerTaughtSubjects, getLecturerTaughtSubjects, isLecturerQualified 
          }} />
        )}
      </main>
      
      {modal && (
        <Modal 
          modal={modal} 
          semester={modal.semester}
          semesters={semesters}
          subjects={subjects}
          lecturers={lecturers}
          classes={classes}
          getLecturerTaughtSubjects={getLecturerTaughtSubjects}
          saveLecturerTaughtSubjects={saveLecturerTaughtSubjects}
          onClose={() => setModal(null)} 
          onSave={save} 
        />
      )}
    </div>
  )
}
