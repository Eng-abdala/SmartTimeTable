import { useOutletContext, useNavigate } from 'react-router-dom'
import { Icon } from '../components/Icon'
import { ManagerTable } from '../components/ManagerTable'
import { useMemo, useState } from 'react'
import { Empty } from '../components/Empty'
import { supabase } from '../lib/supabase'

const STANDARD_DEPARTMENTS = [
  { name: 'Computer Application', code: 'CA' },
  { name: 'Computer Network', code: 'CN' },
  { name: 'Computer Multimedia', code: 'CM' },
 
]

function generateId() {
  return Math.random().toString(36).substr(2, 9)
}

export function Classes() {
  const { classes, academicYears, departments, setModal, remove, loadData, setNotice } = useOutletContext()
  const navigate = useNavigate()

  // ── Navigation state ───────────────────────────────────────────────────────
  const [selectedYear, setSelectedYear] = useState(null)
  const [selectedDept, setSelectedDept] = useState(null)

  // ── Inline modal states ────────────────────────────────────────────────────
  const [showYearForm, setShowYearForm] = useState(false)
  const [yearInput, setYearInput] = useState(new Date().getFullYear())

  const [showDeptForm, setShowDeptForm] = useState(false)
  const [editingDept, setEditingDept] = useState(null)
  const [deptForm, setDeptForm] = useState({ name: STANDARD_DEPARTMENTS[0].name, shortform: STANDARD_DEPARTMENTS[0].code })
  const [deptError, setDeptError] = useState('')

  // ── Academic Year CRUD ─────────────────────────────────────────────────────
  const addAcademicYear = async () => {
    const year = Number(yearInput)
    if (!year || year < 2000 || year > 2100) return
    if (academicYears.includes(year)) return
    
    const { error } = await supabase.from('academic_years').insert([{ year }])
    if (error) {
      setNotice(error.message, 'error')
      return
    }
    
    await loadData()
    setYearInput(new Date().getFullYear())
    setShowYearForm(false)
  }

  const removeAcademicYear = async (year) => {
    if (!window.confirm(`Delete Class of ${year} and all its departments?`)) return
    
    // Departments cascade delete is not enforced yet, so we delete manually
    await supabase.from('departments').delete().eq('intake_year', year)
    const { error } = await supabase.from('academic_years').delete().eq('year', year)
    
    if (error) {
      setNotice(error.message, 'error')
      return
    }
    
    await loadData()
  }

  // ── Department CRUD ────────────────────────────────────────────────────────
  const addDepartment = async () => {
    if (!deptForm.name.trim() || !deptForm.shortform.trim()) {
      setDeptError('Name and shortform are required.')
      return
    }

    const shortform = deptForm.shortform.trim().toUpperCase()

    if (editingDept) {
      if (departments.some(d => d.id !== editingDept && d.shortform === shortform && d.intake_year === selectedYear)) {
        setDeptError(`Department "${deptForm.name}" already exists for ${selectedYear}.`)
        return
      }
      
      const { error } = await supabase.from('departments').update({
        name: deptForm.name.trim(),
        shortform
      }).eq('id', editingDept)

      if (error) { setDeptError(error.message); return }
    } else {
      if (departments.some(d => d.shortform === shortform && d.intake_year === selectedYear)) {
        setDeptError(`Department "${deptForm.name}" already exists for ${selectedYear}.`)
        return
      }
      
      const { error } = await supabase.from('departments').insert([{
        name: deptForm.name.trim(),
        shortform,
        intake_year: selectedYear,
      }])

      if (error) { setDeptError(error.message); return }
    }

    await loadData()
    setDeptForm({ name: STANDARD_DEPARTMENTS[0].name, shortform: STANDARD_DEPARTMENTS[0].code })
    setEditingDept(null)
    setDeptError('')
    setShowDeptForm(false)
  }

  const removeDepartment = async (deptId) => {
    const dept = departments.find(d => d.id === deptId)
    if (!dept) return
    if (!window.confirm(`Delete ${dept.name} department and all its classes?`)) return
    
    // Classes are handled separately or cascade depending on schema, but safe to just delete dept
    const { error } = await supabase.from('departments').delete().eq('id', deptId)
    if (error) {
      setNotice(error.message, 'error')
      return
    }
    
    await loadData()
  }

  const openDeptForm = (dept = null) => {
    setDeptError('')
    if (dept) {
      setEditingDept(dept.id)
      setDeptForm({ name: dept.name, shortform: dept.shortform })
    } else {
      setEditingDept(null)
      setDeptForm({ name: STANDARD_DEPARTMENTS[0].name, shortform: STANDARD_DEPARTMENTS[0].code })
    }
    setShowDeptForm(true)
  }

  // ── Derived data ───────────────────────────────────────────────────────────
  const yearDepartments = useMemo(() =>
    departments
      .filter(d => d.intake_year === selectedYear)
      .sort((a, b) => a.name.localeCompare(b.name)),
    [departments, selectedYear]
  )

  const currentDept = useMemo(() =>
    departments.find(d => d.id === selectedDept),
    [departments, selectedDept]
  )

  const deptClasses = useMemo(() => {
    if (!currentDept) return []
    return classes
      .filter(c =>
        c.intake_year === currentDept.intake_year &&
        c.name.toUpperCase().startsWith(currentDept.shortform.toUpperCase())
      )
      .sort((a, b) => a.name.localeCompare(b.name))
  }, [classes, currentDept])

  const getClassCount = (dept) =>
    classes.filter(c =>
      c.intake_year === dept.intake_year &&
      c.name.toUpperCase().startsWith(dept.shortform.toUpperCase())
    ).length

  const getDeptCount = (year) => departments.filter(d => d.intake_year === year).length

  const getYearClassCount = (year) => classes.filter(c => c.intake_year === year).length

  // ═══════════════════════════════════════════════════════════════════════════
  // Level 3 — Classes (Year + Department selected)
  // ═══════════════════════════════════════════════════════════════════════════
  if (selectedYear && selectedDept && currentDept) {
    return (
      <section>
        <header className="mb-8 flex flex-col justify-between gap-4 sm:flex-row sm:items-center">
          <div>
            <p className="text-sm font-medium text-brand-600">Class of {selectedYear} · {currentDept.shortform}</p>
            <h1 className="mt-1 text-2xl font-bold tracking-tight text-brand-950 sm:text-3xl">{currentDept.name}</h1>
          </div>
        </header>

        <div className="mb-5 flex flex-col justify-between gap-3 sm:flex-row sm:items-center">
          <button onClick={() => setSelectedDept(null)} className="inline-flex items-center gap-2 text-sm font-semibold text-brand-600 hover:text-brand-800 transition">
            <Icon name="back" className="h-4 w-4" />Back to Departments
          </button>
          <button
            onClick={() => setModal({ type: 'class', department: currentDept, intakeYear: selectedYear })}
            className="inline-flex items-center gap-2 rounded-xl bg-brand-600 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-brand-800"
          >
            <Icon name="plus" className="h-4 w-4" />Add Class
          </button>
        </div>

        <ManagerTable
          headers={['Class Name', 'Shift', 'Actions']}
          rows={deptClasses}
          empty={`No classes registered for ${currentDept.name} yet.`}
          render={(item) => (
            <>
              <td className="px-6 py-4 font-medium text-brand-950">{item.name}</td>
              <td className="px-6 py-4">
                <span className="rounded-full bg-amber-50 px-3 py-1 text-xs font-semibold text-amber-700">{item.shift}</span>
              </td>
              <td className="px-6 py-4">
                <div className="flex gap-2">
                  <button onClick={() => navigate(`/timetable?classId=${item.id}`)} className="rounded-lg bg-indigo-50 px-3 py-1.5 text-xs font-semibold text-indigo-700 hover:bg-indigo-100 transition">
                    View Timetable
                  </button>
                  <button onClick={() => setModal({ type: 'class', data: item, department: currentDept, intakeYear: selectedYear })} className="rounded-lg p-2 text-brand-600 hover:bg-cyan-50" title="Edit Class"><Icon name="edit" className="h-4 w-4" /></button>
                  <button onClick={() => remove('classes', item.id)} className="rounded-lg p-2 text-rose-500 hover:bg-rose-50" title="Delete Class"><Icon name="trash" className="h-4 w-4" /></button>
                </div>
              </td>
            </>
          )}
        />
      </section>
    )
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // Level 2 — Departments (Year selected)
  // ═══════════════════════════════════════════════════════════════════════════
  if (selectedYear && !selectedDept) {
    return (
      <section>
        <header className="mb-8 flex flex-col justify-between gap-4 sm:flex-row sm:items-center">
          <div>
            <p className="text-sm font-medium text-brand-600">University IT Faculty</p>
            <h1 className="mt-1 text-2xl font-bold tracking-tight text-brand-950 sm:text-3xl">Class of {selectedYear}</h1>
          </div>
        </header>

        <div className="mb-5 flex flex-col justify-between gap-3 sm:flex-row sm:items-center">
          <button onClick={() => setSelectedYear(null)} className="inline-flex items-center gap-2 text-sm font-semibold text-brand-600 hover:text-brand-800 transition">
            <Icon name="back" className="h-4 w-4" />Back to Academic Years
          </button>
          <button
            onClick={() => openDeptForm()}
            className="inline-flex items-center gap-2 rounded-xl bg-brand-600 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-brand-800"
          >
            <Icon name="plus" className="h-4 w-4" />Add Department
          </button>
        </div>

        {/* ── Add / Edit Department Modal ── */}
        {showDeptForm && (
          <div className="fixed inset-0 z-20 grid place-items-center bg-brand-950/45 p-4 overflow-y-auto">
            <form
              onSubmit={e => { e.preventDefault(); addDepartment() }}
              className="w-full max-w-md rounded-2xl bg-white p-6 shadow-2xl my-8"
            >
              <div className="mb-6 flex items-center justify-between">
                <h2 className="text-xl font-bold text-brand-950">{editingDept ? 'Edit' : 'Add'} Department</h2>
                <button type="button" onClick={() => setShowDeptForm(false)} className="text-2xl text-slate-400 hover:text-slate-600">×</button>
              </div>
              <div className="space-y-4">
                <label className="block text-sm font-semibold text-brand-950">
                  Department Name <span className="text-rose-500">*</span>
                  <select
                    value={deptForm.name}
                    onChange={e => { 
                      const selectedName = e.target.value;
                      const dept = STANDARD_DEPARTMENTS.find(d => d.name === selectedName);
                      setDeptForm({ ...deptForm, name: selectedName, shortform: dept ? dept.code : '' });
                      setDeptError('');
                    }}
                    required
                    className="mt-1.5 w-full rounded-xl border border-slate-200 px-3 py-2.5 font-normal text-slate-700 outline-none focus:border-brand-600"
                  >
                    {STANDARD_DEPARTMENTS.map(d => (
                      <option key={d.code} value={d.name}>{d.name}</option>
                    ))}
                  </select>
                </label>
                <label className="block text-sm font-semibold text-brand-950">
                  Shortform (Auto-generated)
                  <input
                    value={deptForm.shortform}
                    readOnly
                    className="mt-1.5 w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 font-bold text-slate-500 outline-none"
                  />
                </label>

                {deptForm.shortform && (
                  <div className="rounded-xl border border-cyan-200 bg-cyan-50 px-4 py-3 text-sm text-brand-700">
                    Class name preview: <strong>{deptForm.shortform.toUpperCase()}{String(selectedYear).slice(-2)}__</strong>
                  </div>
                )}

                {deptError && (
                  <div className="flex items-start gap-2 rounded-xl border border-rose-300 bg-rose-50 px-4 py-3 text-sm text-rose-800">
                    <span className="mt-0.5 shrink-0">⚠</span>
                    <span>{deptError}</span>
                  </div>
                )}
              </div>
              <button className="mt-4 w-full rounded-xl bg-brand-600 py-3 font-semibold text-white transition hover:bg-brand-800">
                {editingDept ? 'Save Changes' : 'Create Department'}
              </button>
            </form>
          </div>
        )}

        {!yearDepartments.length ? (
          <Empty title={`No departments for Class of ${selectedYear}`} text='Click "Add Department" to create one.' />
        ) : (
          <div className="grid gap-5 md:grid-cols-2 xl:grid-cols-3">
            {yearDepartments.map((dept) => (
              <div
                key={dept.id}
                className="group relative rounded-2xl border border-slate-100 bg-white p-6 shadow-sm transition hover:-translate-y-1 hover:border-brand-500/30 hover:shadow-lg"
              >
                <div className="flex items-start justify-between">
                  <span className="rounded-lg bg-indigo-50 px-3 py-1 text-xs font-bold text-indigo-700">{dept.shortform}</span>
                  <div className="flex items-center gap-1">
                    <button
                      onClick={(e) => { e.stopPropagation(); openDeptForm(dept) }}
                      className="rounded-lg p-1.5 text-slate-400 opacity-0 transition hover:bg-cyan-50 hover:text-brand-600 group-hover:opacity-100"
                      title="Edit Department"
                    >
                      <Icon name="edit" className="h-3.5 w-3.5" />
                    </button>
                    <button
                      onClick={(e) => { e.stopPropagation(); removeDepartment(dept.id) }}
                      className="rounded-lg p-1.5 text-slate-400 opacity-0 transition hover:bg-rose-50 hover:text-rose-500 group-hover:opacity-100"
                      title="Delete Department"
                    >
                      <Icon name="trash" className="h-3.5 w-3.5" />
                    </button>
                  </div>
                </div>
                <button onClick={() => setSelectedDept(dept.id)} className="mt-4 block w-full text-left">
                  <p className="text-xs font-medium text-slate-400">{dept.dept_id}</p>
                  <h2 className="mt-1 text-xl font-bold leading-tight text-brand-950">{dept.name}</h2>
                  <div className="mt-5 flex border-t border-slate-100 pt-4 text-sm">
                    <span className="flex-1 text-slate-500"><b className="text-brand-950">{getClassCount(dept)}</b> classes</span>
                    <span className="text-brand-500 transition group-hover:translate-x-1"><Icon name="arrow" /></span>
                  </div>
                </button>
              </div>
            ))}
          </div>
        )}
      </section>
    )
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // Level 1 — Academic Years (default view)
  // ═══════════════════════════════════════════════════════════════════════════
  return (
    <>
      <header className="mb-8 flex flex-col justify-between gap-4 sm:flex-row sm:items-center">
        <div>
          <p className="text-sm font-medium text-brand-600">University IT Faculty</p>
          <h1 className="mt-1 text-2xl font-bold tracking-tight text-brand-950 sm:text-3xl">Academic Years</h1>
        </div>
        <button
          onClick={() => { setYearInput(new Date().getFullYear()); setShowYearForm(true) }}
          className="inline-flex items-center justify-center gap-2 rounded-xl bg-brand-600 px-4 py-3 text-sm font-semibold text-white shadow-md shadow-brand-600/20 transition hover:bg-brand-800"
        >
          <Icon name="plus" className="h-4 w-4" />Add Academic Year
        </button>
      </header>

      {/* ── Add Year Modal ── */}
      {showYearForm && (
        <div className="fixed inset-0 z-20 grid place-items-center bg-brand-950/45 p-4">
          <form
            onSubmit={e => { e.preventDefault(); addAcademicYear() }}
            className="w-full max-w-sm rounded-2xl bg-white p-6 shadow-2xl"
          >
            <div className="mb-6 flex items-center justify-between">
              <h2 className="text-xl font-bold text-brand-950">Add Academic Year</h2>
              <button type="button" onClick={() => setShowYearForm(false)} className="text-2xl text-slate-400 hover:text-slate-600">×</button>
            </div>
            <label className="block text-sm font-semibold text-brand-950">
              Intake Year
              <input
                type="number"
                value={yearInput}
                onChange={e => setYearInput(Number(e.target.value))}
                min={2000}
                max={2100}
                className="mt-1.5 w-full rounded-xl border border-slate-200 px-3 py-2.5 font-normal text-slate-700 outline-none focus:border-brand-600"
                autoFocus
              />
            </label>
            {academicYears.includes(Number(yearInput)) && (
              <div className="mt-3 rounded-xl border border-amber-300 bg-amber-50 px-4 py-2.5 text-sm text-amber-800">
                Class of {yearInput} already exists.
              </div>
            )}
            <button
              disabled={academicYears.includes(Number(yearInput))}
              className="mt-4 w-full rounded-xl bg-brand-600 py-3 font-semibold text-white transition hover:bg-brand-800 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              Create Class of {yearInput}
            </button>
          </form>
        </div>
      )}

      {!academicYears.length ? (
        <Empty title="No academic years yet" text='Click "Add Academic Year" to get started.' />
      ) : (
        <section className="grid gap-5 md:grid-cols-2 xl:grid-cols-4">
          {academicYears.map((year) => (
            <div
              key={year}
              className="group rounded-2xl border border-slate-100 bg-white p-6 shadow-sm transition hover:-translate-y-1 hover:border-brand-500/30 hover:shadow-lg"
            >
              <div className="flex items-start justify-between">
                <span className="rounded-lg bg-cyan-50 px-3 py-1 text-xs font-bold text-brand-600">{year}</span>
                <button
                  onClick={(e) => { e.stopPropagation(); removeAcademicYear(year) }}
                  className="rounded-lg p-1.5 text-slate-400 opacity-0 transition hover:bg-rose-50 hover:text-rose-500 group-hover:opacity-100"
                  title="Delete Year"
                >
                  <Icon name="trash" className="h-3.5 w-3.5" />
                </button>
              </div>
              <button onClick={() => setSelectedYear(year)} className="block w-full text-left">
                <h2 className="mt-6 text-xl font-bold text-brand-950">Class of {year}</h2>
                <div className="mt-5 flex border-t border-slate-100 pt-4 text-sm">
                  <span className="flex-1 text-slate-500">
                    <b className="text-brand-950">{getDeptCount(year)}</b> dept{getDeptCount(year) !== 1 ? 's' : ''} · <b className="text-brand-950">{getYearClassCount(year)}</b> classes
                  </span>
                  <span className="text-brand-500 transition group-hover:translate-x-1"><Icon name="arrow" /></span>
                </div>
              </button>
            </div>
          ))}
        </section>
      )}
    </>
  )
}
