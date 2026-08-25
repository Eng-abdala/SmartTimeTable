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
const DEPARTMENT_NAME_PATTERN = /^[A-Za-z][A-Za-z0-9 ]*$/
const DEPARTMENT_SHORTFORM_PATTERN = /^[A-Za-z][A-Za-z0-9]*$/

function sortByNumber(list) {
  return [...list].sort((a, b) => {
    const num = name => { const m = name?.match(/\d+/); return m ? parseInt(m[0], 10) : 999 }
    return num(a.name) - num(b.name) || (a.name || '').localeCompare(b.name || '')
  })
}

function SemesterPicker({ id, semesters, navigate, placeholder, tone = 'brand' }) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
      <div className="mb-3 flex items-center gap-2">
        <span className={`grid h-8 w-8 place-items-center rounded-lg ${tone === 'slate' ? 'bg-slate-800' : 'bg-brand-600'} text-white`}><Icon name="layers" className="h-4 w-4" /></span>
        <p className="text-sm font-bold text-brand-950">Choose a semester</p>
      </div>
      <select
        id={id}
        defaultValue=""
        onChange={event => event.target.value && navigate(`/semesters/${event.target.value}`)}
        className="w-full cursor-pointer appearance-none rounded-xl border border-slate-300 bg-slate-50 px-4 py-3 text-sm font-semibold text-slate-800 outline-none transition hover:bg-white focus:border-brand-500 focus:ring-4 focus:ring-brand-500/10"
      >
        <option value="" disabled>{placeholder}</option>
        {semesters.map(semester => <option key={semester.id} value={semester.id}>{semester.name}</option>)}
      </select>
      <p className="mt-3 text-xs leading-5 text-slate-500">Select a semester to manage its curriculum and subjects.</p>
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
    if (!DEPARTMENT_NAME_PATTERN.test(name)) {
      return setDepartmentError('Department name must start with a letter and can contain only letters, numbers, and spaces.')
    }
    if (!DEPARTMENT_SHORTFORM_PATTERN.test(shortform)) {
      return setDepartmentError('Shortform must start with a letter and can contain only letters and numbers.')
    }

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
    const usedInAcademicYears = departments.filter(item => item.shortform === department.shortform)
    if (usedInAcademicYears.length) {
      setNotice(`Cannot delete ${department.name}: it is registered in ${usedInAcademicYears.length} academic year${usedInAcademicYears.length === 1 ? '' : 's'}.`, 'error')
      return
    }
    if (!window.confirm(`Delete ${department.name}? This works only when it is not used in an academic year and has no semesters.`)) return
    const { error } = await supabase.from('department_catalog').delete().eq('id', department.id)
    if (error) return setNotice(error.message, 'error')
    await loadData()
    setNotice('Department deleted.')
  }

  return (
    <>
      <header className="mb-8 flex flex-col justify-between gap-5 rounded-3xl border border-brand-100 bg-gradient-to-br from-white to-brand-50/60 p-6 shadow-sm sm:flex-row sm:items-center">
        <div>
          <p className="text-sm font-medium text-brand-600"> Faculty of Computer and IT</p>
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
      <section className="mb-8 rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
        <div className="mb-6 flex items-center border-b border-slate-100 pb-5">
          <div className="flex items-center gap-3">
            <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-slate-800 text-white">
              <Icon name="layers" className="h-4 w-4" />
            </span>
            <div>
              <h2 className="text-base font-bold text-brand-950">Foundation</h2>
              <p className="text-xs text-slate-500">Semester 1 · 2 · 3 — no department required</p>
            </div>
          </div>
        </div>

        {generalSemesters.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-slate-200 bg-slate-50 p-8 text-center text-sm text-slate-400">
            General semesters are set up by the system.
          </div>
        ) : (
          <div className="max-w-xl"><SemesterPicker id="general-semester" semesters={generalSemesters} navigate={navigate} placeholder="— Select Semester 1, 2, or 3 —" tone="slate" /></div>
        )}
      </section>

      {/* ── Department Sections (4+) ──────────────────────────── */}
      <div className="space-y-6">
        {departmentSections.map((dept, index) => {
          const color = DEPT_COLORS[index % DEPT_COLORS.length]
          const list = deptSemesters(dept.code)
          const department = departmentCatalog.find(item => item.shortform === dept.code)
          return (
            <section key={dept.code} className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
              <div className="mb-6 flex items-center justify-between border-b border-slate-100 pb-5">
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
                <div className="max-w-xl"><SemesterPicker id={`department-semester-${dept.code}`} semesters={list} navigate={navigate} placeholder="— Select a semester —" /></div>
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
            <label className="block text-sm font-semibold text-brand-950">Department Name<input required value={departmentForm.name} onChange={e => setDepartmentForm({ ...departmentForm, name: e.target.value })} placeholder="e.g. Computer Application" className="mt-1.5 w-full rounded-xl border border-slate-200 px-3 py-2.5 font-normal outline-none focus:border-brand-600" /><span className="mt-1 block text-xs font-normal text-slate-400">Start with a letter; letters, numbers, and spaces only.</span></label>
            <label className="mt-4 block text-sm font-semibold text-brand-950">Shortform<input required maxLength={10} value={departmentForm.shortform} onChange={e => setDepartmentForm({ ...departmentForm, shortform: e.target.value.toUpperCase() })} placeholder="e.g. AI" className="mt-1.5 w-full rounded-xl border border-slate-200 px-3 py-2.5 font-normal outline-none focus:border-brand-600" /><span className="mt-1 block text-xs font-normal text-slate-400">Start with a letter; letters and numbers only.</span></label>
            {departmentError && <div className="mt-4 rounded-xl border border-rose-300 bg-rose-50 px-4 py-3 text-sm text-rose-800">{departmentError}</div>}
            <button className="mt-5 w-full rounded-xl bg-brand-600 py-3 font-semibold text-white transition hover:bg-brand-800">{editingDepartment ? 'Save Changes' : 'Create Department'}</button>
          </form>
        </div>
      )}
    </>
  )
}
