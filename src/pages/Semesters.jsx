import { useOutletContext, useNavigate } from 'react-router-dom'
import { useState } from 'react'
import { Icon } from '../components/Icon'
import { Empty } from '../components/Empty'
import { supabase } from '../lib/supabase'

const DEPT_COLORS = [
  { bg: 'bg-blue-600', light: 'bg-blue-50', border: 'border-blue-200', text: 'text-blue-700' },
  { bg: 'bg-emerald-600', light: 'bg-emerald-50', border: 'border-emerald-200', text: 'text-emerald-700' },
  { bg: 'bg-violet-600', light: 'bg-violet-50', border: 'border-violet-200', text: 'text-violet-700' },
  { bg: 'bg-amber-600', light: 'bg-amber-50', border: 'border-amber-200', text: 'text-amber-700' },
  { bg: 'bg-rose-600', light: 'bg-rose-50', border: 'border-rose-200', text: 'text-rose-700' },
]

function sortByNumber(list) {
  return [...list].sort((a, b) => {
    const num = name => { const m = name?.match(/\d+/); return m ? parseInt(m[0], 10) : 999 }
    return num(a.name) - num(b.name) || (a.name || '').localeCompare(b.name || '')
  })
}

function SemesterCard({ semester, subjects, navigate, setModal, remove }) {
  const items = subjects.filter(s => s.semester_id === semester.id)
  const hours = items.reduce((sum, s) => sum + s.total_hours, 0)
  return (
    <div
      onClick={() => navigate(`/semesters/${semester.id}`)}
      className="group relative cursor-pointer rounded-2xl border border-slate-100 bg-white p-5 text-left shadow-sm transition hover:-translate-y-1 hover:border-brand-500/30 hover:shadow-lg"
    >
      <div className="flex items-start justify-between">
        <span className="text-brand-500 transition group-hover:translate-x-1 block"><Icon name="arrow" /></span>
        <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition">
          <button
            onClick={(e) => { e.stopPropagation(); setModal({ type: 'semester', data: semester }) }}
            className="rounded p-1.5 text-slate-400 hover:bg-slate-100 hover:text-brand-600"
            title="Edit Semester"
          >
            <Icon name="edit" className="h-4 w-4" />
          </button>
          <button
            onClick={(e) => { e.stopPropagation(); remove('semesters', semester.id) }}
            className="rounded p-1.5 text-slate-400 hover:bg-rose-50 hover:text-rose-500"
            title="Delete Semester"
          >
            <Icon name="trash" className="h-4 w-4" />
          </button>
        </div>
      </div>
      <h3 className="mt-2 text-lg font-bold text-brand-950">{semester.name}</h3>
      <div className="mt-4 flex border-t border-slate-100 pt-3 text-sm">
        <span className="flex-1 text-slate-500"><b className="text-brand-950">{items.length}</b> subjects</span>
        <span className="text-slate-500"><b className="text-brand-950">{hours}</b> hrs</span>
      </div>
    </div>
  )
}

export function Semesters() {
  const { semesters, subjects, departments, departmentCatalog, setModal, remove, loadData, setNotice } = useOutletContext()
  const navigate = useNavigate()
  const [showDepartmentForm, setShowDepartmentForm] = useState(false)
  const [editingDepartment, setEditingDepartment] = useState(null)
  const [departmentForm, setDepartmentForm] = useState({ name: '', shortform: '' })
  const [departmentError, setDepartmentError] = useState('')

  // Split into general (1–3) and departmental (4+)
  const generalSemesters = sortByNumber(semesters.filter(s => {
    const m = s.name?.match(/\d+/)
    return !m || parseInt(m[0], 10) <= 3
  }))

  const deptSemesters = (dept) => sortByNumber(
    semesters.filter(s => s.department === dept)
  )

  // The catalogue is managed here. Existing curriculum records are included
  // too, so a legacy section cannot disappear unexpectedly.
  const departmentSections = Array.from(new Map([
    ...semesters.filter(s => s.department).map(s => [s.department, { code: s.department, label: s.department }]),
    ...departmentCatalog.map(dept => [dept.shortform, { code: dept.shortform, label: dept.name }]),
  ]).values()).sort((a, b) => a.label.localeCompare(b.label))

  const openDepartmentForm = (department = null) => {
    setEditingDepartment(department)
    setDepartmentForm(department ? { name: department.name, shortform: department.shortform } : { name: '', shortform: '' })
    setDepartmentError('')
    setShowDepartmentForm(true)
  }

  const saveDepartment = async (event) => {
    event.preventDefault()
    const name = departmentForm.name.trim()
    const shortform = departmentForm.shortform.trim().toUpperCase()
    if (!name || !shortform) return setDepartmentError('Name and shortform are required.')

    const isShortformInUse = editingDepartment && editingDepartment.shortform !== shortform && (
      semesters.some(s => s.department === editingDepartment.shortform) ||
      departments.some(d => d.shortform === editingDepartment.shortform)
    )
    if (isShortformInUse) return setDepartmentError('The shortform cannot change after curriculum has been created for this department.')

    const query = editingDepartment
      ? supabase.from('department_catalog').update({ name, shortform }).eq('id', editingDepartment.id)
      : supabase.from('department_catalog').insert([{ name, shortform }])
    const { error } = await query
    if (error) return setDepartmentError(error.message)
    if (editingDepartment && editingDepartment.name !== name) {
      const { error: relatedError } = await supabase
        .from('departments')
        .update({ name })
        .eq('shortform', editingDepartment.shortform)
      if (relatedError) return setDepartmentError(relatedError.message)
    }
    await loadData()
    setShowDepartmentForm(false)
    setNotice(`Department ${editingDepartment ? 'updated' : 'created'}.`)
  }

  const deleteDepartment = async (department) => {
    if (!window.confirm(`Delete ${department.name}? This works only when it has no semesters and no classes.`)) return
    const { error } = await supabase.from('department_catalog').delete().eq('id', department.id)
    if (error) return setNotice(error.message, 'error')
    await loadData()
    setNotice('Department deleted.')
  }

  return (
    <>
      <header className="mb-8 flex flex-col justify-between gap-4 sm:flex-row sm:items-center">
        <div>
          <p className="text-sm font-medium text-brand-600">University IT Faculty</p>
          <h1 className="mt-1 text-2xl font-bold tracking-tight text-brand-950 sm:text-3xl">Semesters</h1>
        </div>
        <button
          onClick={() => openDepartmentForm()}
          className="inline-flex items-center justify-center gap-2 rounded-xl bg-brand-600 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-brand-800"
        >
          <Icon name="plus" className="h-4 w-4" /> Add Department
        </button>
      </header>

      {/* ── General Semesters (1–3) ───────────────────────────── */}
      <section className="mb-10">
        <div className="mb-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-slate-800 text-white">
              <Icon name="layers" className="h-4 w-4" />
            </span>
            <div>
              <h2 className="text-base font-bold text-brand-950">General Semesters</h2>
              <p className="text-xs text-slate-500">Semester 1 · 2 · 3 — no department required</p>
            </div>
          </div>
          <button
            onClick={() => setModal('semester')}
            className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-brand-700 shadow-sm transition hover:bg-brand-50 hover:border-brand-300"
          >
            <Icon name="plus" className="h-3.5 w-3.5" /> Add Semester
          </button>
        </div>

        {generalSemesters.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-slate-200 bg-slate-50 p-8 text-center text-sm text-slate-400">
            No general semesters yet. Click "Add Semester" to create Semester 1, 2, or 3.
          </div>
        ) : (
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
            {generalSemesters.map(s => (
              <SemesterCard key={s.id} semester={s} subjects={subjects} navigate={navigate} setModal={setModal} remove={remove} />
            ))}
          </div>
        )}
      </section>

      {/* ── Department Sections (4+) ──────────────────────────── */}
      <div className="space-y-8">
        {departmentSections.map((dept, index) => {
          const color = DEPT_COLORS[index % DEPT_COLORS.length]
          const list = deptSemesters(dept.code)
          const department = departmentCatalog.find(item => item.shortform === dept.code)
          return (
            <section key={dept.code} className={`rounded-2xl border ${color.border} ${color.light} p-6`}>
              <div className="mb-5 flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <span className={`flex h-9 w-9 items-center justify-center rounded-xl ${color.bg} text-white font-bold text-sm`}>
                    {dept.code}
                  </span>
                  <div>
                    <h2 className={`text-base font-bold ${color.text}`}>{dept.label}</h2>
                    <p className="text-xs text-slate-500">Semester 4 and above</p>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  {department && <>
                    <button onClick={() => openDepartmentForm(department)} className={`rounded-lg border ${color.border} bg-white/70 p-2 ${color.text} hover:bg-white`} title="Edit Department"><Icon name="edit" className="h-4 w-4" /></button>
                    <button onClick={() => deleteDepartment(department)} className="rounded-lg border border-rose-200 bg-white/70 p-2 text-rose-500 hover:bg-rose-50" title="Delete Department"><Icon name="trash" className="h-4 w-4" /></button>
                  </>}
                  <button
                    onClick={() => setModal({ type: 'semester', prefillDepartment: dept.code })}
                    className={`inline-flex items-center gap-1.5 rounded-xl ${color.bg} px-3 py-2 text-sm font-semibold text-white shadow-sm transition hover:opacity-90`}
                  >
                    <Icon name="plus" className="h-3.5 w-3.5" /> Add Semester
                  </button>
                </div>
              </div>

              {list.length === 0 ? (
                <div className="rounded-xl border border-dashed border-current/20 bg-white/60 p-6 text-center text-sm text-slate-400">
                  No semesters yet for {dept.label}. Click "Add Semester" above.
                </div>
              ) : (
                <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
                  {list.map(s => (
                    <SemesterCard key={s.id} semester={s} subjects={subjects} navigate={navigate} setModal={setModal} remove={remove} />
                  ))}
                </div>
              )}
            </section>
          )
        })}
        {departmentSections.length === 0 && (
          <div className="rounded-2xl border border-dashed border-slate-200 bg-slate-50 p-8 text-center text-sm text-slate-500">
            No departments yet. Create one with the Add Department button above.
          </div>
        )}
      </div>

      {showDepartmentForm && (
        <div className="fixed inset-0 z-30 grid place-items-center bg-brand-950/45 p-4">
          <form onSubmit={saveDepartment} className="w-full max-w-md rounded-2xl bg-white p-6 shadow-2xl">
            <div className="mb-6 flex items-center justify-between"><h2 className="text-xl font-bold text-brand-950">{editingDepartment ? 'Edit' : 'Add'} Department</h2><button type="button" onClick={() => setShowDepartmentForm(false)} className="text-2xl text-slate-400">×</button></div>
            <label className="block text-sm font-semibold text-brand-950">Department Name<input required value={departmentForm.name} onChange={e => setDepartmentForm({ ...departmentForm, name: e.target.value })} placeholder="e.g. Artificial Intelligence" className="mt-1.5 w-full rounded-xl border border-slate-200 px-3 py-2.5 font-normal outline-none focus:border-brand-600" /></label>
            <label className="mt-4 block text-sm font-semibold text-brand-950">Shortform<input required maxLength={10} value={departmentForm.shortform} onChange={e => setDepartmentForm({ ...departmentForm, shortform: e.target.value.toUpperCase() })} placeholder="e.g. AI" className="mt-1.5 w-full rounded-xl border border-slate-200 px-3 py-2.5 font-normal outline-none focus:border-brand-600" /></label>
            {departmentError && <div className="mt-4 rounded-xl border border-rose-300 bg-rose-50 px-4 py-3 text-sm text-rose-800">{departmentError}</div>}
            <button className="mt-5 w-full rounded-xl bg-brand-600 py-3 font-semibold text-white transition hover:bg-brand-800">{editingDepartment ? 'Save Changes' : 'Create Department'}</button>
          </form>
        </div>
      )}
    </>
  )
}
