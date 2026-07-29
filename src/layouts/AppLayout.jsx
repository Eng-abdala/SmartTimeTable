import { useState, useEffect } from 'react'
import { NavLink, Outlet, useLocation } from 'react-router-dom'
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
  const [notice, setNotice] = useState('')
  const [modal, setModal] = useState(null)
  
  const location = useLocation()

  const loadData = async () => {
    setLoading(true)
    const [semesterRes, subjectRes, lecturerRes, classRes] = await Promise.all([
      supabase.from('semesters').select('*').order('created_at', { ascending: false }),
      supabase.from('subjects').select('*').order('code'),
      supabase.from('lecturers').select('*').order('name'),
      supabase.from('classes').select('*').order('name'),
    ])
    const error = [semesterRes, subjectRes, lecturerRes, classRes].find((result) => result.error)?.error
    if (error) setNotice(`Could not load data: ${error.message}`)
    setSemesters(semesterRes.data || [])
    setSubjects(subjectRes.data || [])
    setLecturers(lecturerRes.data || [])
    setClasses(classRes.data || [])
    setLoading(false)
  }

  useEffect(() => { loadData() }, [])

  async function save(table, values, id) {
    const query = id ? supabase.from(table).update(values).eq('id', id) : supabase.from(table).insert(values)
    const { error } = await query
    if (error) return setNotice(error.message)
    setModal(null)
    setNotice(`${id ? 'Changes' : 'New record'} saved successfully.`)
    await loadData()
  }

  async function remove(table, id) {
    if (!window.confirm('Delete this record? This cannot be undone.')) return
    const { error } = await supabase.from(table).delete().eq('id', id)
    if (error) return setNotice(error.message)
    setNotice('Record deleted.')
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

  return (
    <div className="min-h-screen bg-[#f5f8fa] font-sans text-[#16333a] lg:flex">
      <aside className="flex w-full flex-col bg-brand-950 text-white lg:min-h-screen lg:w-64">
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

      <main className="min-w-0 flex-1 p-5 sm:p-8">
        {notice && (
          <div className="mb-5 flex items-center justify-between rounded-xl border border-brand-600/20 bg-cyan-50 px-4 py-3 text-sm text-brand-800">
            <span>{notice}</span>
            <button onClick={() => setNotice('')} className="font-bold">×</button>
          </div>
        )}
        
        {loading ? (
          <div className="rounded-2xl bg-white p-12 text-center text-slate-500 shadow-sm">Loading timetable data…</div>
        ) : (
          <Outlet context={{ semesters, subjects, lecturers, classes, setModal, remove, metrics, loadData, setNotice }} />
        )}
      </main>
      
      {modal && <Modal modal={modal} semester={modal.semester} onClose={() => setModal(null)} onSave={save} />}
    </div>
  )
}
