import { useState, useEffect } from 'react'
import { NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import facultyLogo from '../assets/logo.png'
import { Icon } from '../components/Icon'
import { Modal } from '../components/Modal'

export function AppLayout() {
  const [semesters, setSemesters] = useState([])
  const [subjects, setSubjects] = useState([])
  const [lecturers, setLecturers] = useState([])
  const [classes, setClasses] = useState([])
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
    const [semesterRes, subjectRes, lecturerRes, classRes] = await Promise.all([
      supabase.from('semesters').select('*').order('created_at', { ascending: false }),
      supabase.from('subjects').select('*').order('code'),
      supabase.from('lecturers').select('*').order('name'),
      supabase.from('classes').select('*').order('name'),
    ])
    const error = [semesterRes, subjectRes, lecturerRes, classRes].find((result) => result.error)?.error
    if (error) notify(`Could not load data: ${error.message}`, 'error')
    setSemesters(semesterRes.data || [])
    setSubjects(subjectRes.data || [])
    setLecturers(lecturerRes.data || [])
    setClasses(classRes.data || [])
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

  const [subjectLecturersMap, setSubjectLecturersMap] = useState(() => {
    try {
      return JSON.parse(localStorage.getItem('subject_lecturers_map') || '{}')
    } catch {
      return {}
    }
  })

  const [lecturerSubjectsMap, setLecturerSubjectsMap] = useState(() => {
    try {
      return JSON.parse(localStorage.getItem('lecturer_subjects_map') || '{}')
    } catch {
      return {}
    }
  })

  const saveLecturerTaughtSubjects = (lecturerId, taughtSubjects) => {
    const updated = {
      ...lecturerSubjectsMap,
      [lecturerId]: taughtSubjects
    }
    setLecturerSubjectsMap(updated)
    localStorage.setItem('lecturer_subjects_map', JSON.stringify(updated))
  }

  const getLecturerTaughtSubjects = (lecturerId) => {
    const list = lecturerSubjectsMap[lecturerId]
    if (Array.isArray(list)) return list
    const lecturer = lecturers.find(l => l.id === lecturerId)
    if (lecturer && Array.isArray(lecturer.taught_subjects)) return lecturer.taught_subjects
    return []
  }

  const isLecturerQualified = (lecturer, subject) => {
    const taught = getLecturerTaughtSubjects(lecturer.id)
    if (!taught || taught.length === 0) return false
    return taught.includes(subject.name) || taught.includes(subject.code)
  }

  const saveSubjectLecturersMap = (newMap) => {
    setSubjectLecturersMap(newMap)
    localStorage.setItem('subject_lecturers_map', JSON.stringify(newMap))
  }

  const assignLecturersToSubject = async (subjectId, lecturerIds) => {
    // Optimistic local update — no full page reload
    const updatedMap = {
      ...subjectLecturersMap,
      [subjectId]: {
        ...subjectLecturersMap[subjectId],
        lecturer_ids: lecturerIds
      }
    }
    saveSubjectLecturersMap(updatedMap)

    // Also update subjects state locally so stats refresh instantly
    setSubjects(prev => prev.map(s =>
      s.id === subjectId ? { ...s, lecturer_id: lecturerIds[0] || null } : s
    ))

    // Sync to DB in background (no await on page render path)
    const primaryId = lecturerIds.length > 0 ? lecturerIds[0] : null
    supabase.from('subjects').update({ lecturer_id: primaryId }).eq('id', subjectId)
      .then(({ error }) => { if (error) notify(error.message, 'error') })
  }

  const getSubjectLecturers = (subjectId) => {
    const entry = subjectLecturersMap[subjectId]
    if (entry && Array.isArray(entry.lecturer_ids)) {
      return lecturers.filter(l => entry.lecturer_ids.includes(l.id))
    }
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
            semesters, subjects, lecturers, classes, setModal, remove, metrics, loadData, setNotice: notify, 
            subjectLecturersMap, assignLecturersToSubject, getSubjectLecturers, getRandomLecturerForClass,
            lecturerSubjectsMap, saveLecturerTaughtSubjects, getLecturerTaughtSubjects, isLecturerQualified 
          }} />
        )}
      </main>
      
      {modal && (
        <Modal 
          modal={modal} 
          semester={modal.semester} 
          subjects={subjects}
          lecturers={lecturers}
          getLecturerTaughtSubjects={getLecturerTaughtSubjects}
          saveLecturerTaughtSubjects={saveLecturerTaughtSubjects}
          onClose={() => setModal(null)} 
          onSave={save} 
        />
      )}
    </div>
  )
}
