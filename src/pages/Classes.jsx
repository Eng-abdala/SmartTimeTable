import { useOutletContext, useNavigate } from 'react-router-dom'
import { Icon } from '../components/Icon'
import { ManagerTable } from '../components/ManagerTable'
import { useMemo, useState } from 'react'
import { Empty } from '../components/Empty'
import { supabase } from '../lib/supabase'
import { getYearSemesterMap } from '../lib/semesterUtils'

export function Classes() {
  const { classes, academicYears, departments, departmentCatalog, semesters, setModal, remove, loadData, setNotice } = useOutletContext()
  const navigate = useNavigate()

  // ── Navigation state ───────────────────────────────────────────────────────
  const [selectedYear, setSelectedYear] = useState(null)
  const [selectedDept, setSelectedDept] = useState(null)

  // ── Inline modal states ────────────────────────────────────────────────────
  const [showYearForm, setShowYearForm] = useState(false)
  const [yearInput, setYearInput] = useState(new Date().getFullYear())

  const [showDeptPicker, setShowDeptPicker] = useState(false)
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

  // ── Derived: map of { intake_year -> semester_id } from current data ────────
  const yearSemesterMap = useMemo(() => getYearSemesterMap(classes), [classes])
  // map of { semester_id -> intake_year } — which year owns each semester
  const semesterYearMap = useMemo(() => {
    const m = {}
    Object.entries(yearSemesterMap).forEach(([yr, semId]) => { if (semId) m[semId] = Number(yr) })
    return m
  }, [yearSemesterMap])

  const [bulkSemError, setBulkSemError] = useState('')

  // ── Semester Picker Modal ──────────────────────────────────────────────────
  const [semPickerYear, setSemPickerYear] = useState(null)   // which year card was clicked
  const [semPickerChoice, setSemPickerChoice] = useState('') // selected semester id (general) or sem-level label (dept)

  // Open picker modal
  const openSemPicker = (year) => {
    setSemPickerYear(year)
    setSemPickerChoice('')
  }

  // Execute assignment after user picks a semester
  const doAssignSemester = async () => {
    const year = semPickerYear
    if (!year || !semPickerChoice) return

    const yearCls = classes.filter(c => c.intake_year === year)
    const yearDepts = departments.filter(d => d.intake_year === year)

    const chosenSem = semesters.find(s => s.id === semPickerChoice)
    if (!chosenSem) return

    if (chosenSem.department && yearDepts.length > 0) {
      // Dept mode: semPickerChoice is a representative dept semester
      const updates = []
      const missingDepts = []
      
      const levelMatch = chosenSem.name.match(/Semester\s*(\d+)/i)
      const levelNum = levelMatch ? levelMatch[1] : null

      for (const dept of yearDepts) {
        const deptCls = yearCls.filter(c => c.name.toUpperCase().startsWith(dept.shortform.toUpperCase()))
        if (deptCls.length === 0) continue // Skip if this department has no classes in this year

        let deptSem = null
        if (levelNum) {
          deptSem = semesters.find(s =>
            s.department === dept.shortform &&
            new RegExp(`Semester\\s*${levelNum}\\b`, 'i').test(s.name)
          )
        } else {
          // Fallback if it doesn't contain "Semester X", just try removing parenthesis suffix
          const levelName = chosenSem.name.replace(/\s*\(.*?\)\s*$/, '').trim()
          deptSem = semesters.find(s =>
            s.department === dept.shortform &&
            s.name.replace(/\s*\(.*?\)\s*$/, '').trim() === levelName
          )
        }

        if (!deptSem) {
          missingDepts.push(dept.shortform)
          continue
        }
        updates.push({ semId: deptSem.id, classIds: deptCls.map(c => c.id) })
      }

      if (updates.length === 0) {
        setNotice('No matching department semesters found for this level. Please create them first.', 'error')
        return
      }

      const semIds = updates.map(u => u.semId)
      const conflictClass = classes.find(c => c.intake_year !== year && semIds.includes(c.semester_id))
      if (conflictClass) {
        setNotice(`Cannot assign: this semester level is already used by Class of ${conflictClass.intake_year}.`, 'error')
        return
      }

      for (const { semId, classIds } of updates) {
        const { error } = await supabase.from('classes').update({ semester_id: semId }).in('id', classIds)
        if (error) { setNotice(error.message, 'error'); return }
      }
      
      if (missingDepts.length > 0) {
        setNotice(`⚠ Assigned to some depts, but missing semesters for: ${missingDepts.join(', ')}. Create them first!`, 'error')
      } else {
        setNotice(`✅ Semesters auto-assigned for all departments in Class of ${year}!`)
      }
    } else {
      // General mode: assign the specific selected semester to all classes in the year
      const conflictClass = classes.find(c => c.intake_year !== year && c.semester_id === semPickerChoice)
      if (conflictClass) {
        setNotice(`Cannot assign: this semester is already used by Class of ${conflictClass.intake_year}.`, 'error')
        return
      }

      const { error } = await supabase
        .from('classes')
        .update({ semester_id: semPickerChoice })
        .in('id', yearCls.map(c => c.id))
      if (error) { setNotice(error.message, 'error'); return }
      setNotice(`✅ Semester "${chosenSem.name}" assigned to all classes in Class of ${year}!`)
    }

    await loadData()
    setSemPickerYear(null)
    setSemPickerChoice('')
  }


  // Add an existing catalogue department to the selected Class of year.
  const addDepartmentToYear = async (department) => {
    if (!department || !selectedYear) return
    if (departments.some(d => d.shortform === department.shortform && d.intake_year === selectedYear)) {
      setDeptError(`${department.name} is already part of Class of ${selectedYear}.`)
      return
    }
    const { error } = await supabase.from('departments').insert([{
      name: department.name,
      shortform: department.shortform,
      intake_year: selectedYear,
    }])
    if (error) { setDeptError(error.message); return }
    await loadData()
    setDeptError('')
    setShowDeptPicker(false)
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
          headers={['Class Name', 'Shift', 'Semester', 'Actions']}
          rows={deptClasses}
          empty={`No classes registered for ${currentDept.name} yet.`}
          render={(item) => (
            <>
              <td className="px-6 py-4 font-medium text-brand-950">{item.name}</td>
              <td className="px-6 py-4">
                <span className="rounded-full bg-amber-50 px-3 py-1 text-xs font-semibold text-amber-700">{item.shift}</span>
              </td>
              <td className="px-6 py-4">
                {item.semester_id ? (() => {
                  const inherited = yearSemesterMap[selectedYear]
                  const isLocked = inherited && inherited === item.semester_id
                  return (
                    <span className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-semibold ${isLocked ? 'bg-cyan-50 text-brand-600 border border-cyan-200' : 'bg-cyan-50 text-brand-600'}`}>
                      {isLocked && <span title="Inherited from Academic Year">🔒</span>}
                      {semesters.find(s => s.id === item.semester_id)?.name || 'Unknown'}
                    </span>
                  )
                })() : (
                  <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold text-slate-400">No semester</span>
                )}
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
            onClick={() => { setDeptError(''); setShowDeptPicker(true) }}
            className="inline-flex items-center gap-2 rounded-xl bg-brand-600 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-brand-800"
          >
            <Icon name="plus" className="h-4 w-4" />Add Department
          </button>
        </div>

        {/* ── Select an existing Department ── */}
        {showDeptPicker && (
          <div className="fixed inset-0 z-20 grid place-items-center bg-brand-950/45 p-4 overflow-y-auto">
            <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-2xl my-8">
              <div className="mb-6 flex items-center justify-between">
                <h2 className="text-xl font-bold text-brand-950">Add Department</h2>
                <button type="button" onClick={() => setShowDeptPicker(false)} className="text-2xl text-slate-400 hover:text-slate-600">×</button>
              </div>
              <p className="mb-4 text-sm text-slate-500">Choose a department already managed on the Semesters page.</p>
              {!departmentCatalog.length ? (
                <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800">
                  No departments available. Create one on the Semesters page first.
                </div>
              ) : (
                <div className="max-h-72 space-y-2 overflow-y-auto pr-1">
                  {departmentCatalog.map(department => {
                    const alreadyAdded = departments.some(d => d.shortform === department.shortform && d.intake_year === selectedYear)
                    return (
                      <button
                        key={department.id}
                        type="button"
                        disabled={alreadyAdded}
                        onClick={() => addDepartmentToYear(department)}
                        className="flex w-full items-center justify-between rounded-xl border border-slate-200 px-4 py-3 text-left transition hover:border-brand-300 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50"
                      >
                        <span><b className="block text-sm text-brand-950">{department.name}</b><span className="text-xs text-slate-500">{department.shortform}</span></span>
                        <span className="text-xs font-semibold text-brand-600">{alreadyAdded ? 'Added' : 'Select'}</span>
                      </button>
                    )
                  })}
                </div>
              )}
              {deptError && <div className="mt-4 rounded-xl border border-rose-300 bg-rose-50 px-4 py-3 text-sm text-rose-800">{deptError}</div>}
            </div>
          </div>
        )}

        {!yearDepartments.length ? (
          <Empty title={`No departments for Class of ${selectedYear}`} text='Click "Add Department" to select one.' />
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
      {/* ── Semester Picker Modal ── */}
      {semPickerYear !== null && (() => {
        const yearDepts = departments.filter(d => d.intake_year === semPickerYear)

        // General semesters (Semester 1, 2, 3 — no department)
        const generalOptions = semesters
          .filter(s => !s.department)
          .sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true }))
          .map(s => ({ id: s.id, label: s.name, isDept: false }))

        // Department semester levels — group by level name, show once
        // e.g. "Semester 4 (CA)", "Semester 4 (CM)", "Semester 4 (CN)" → show "Semester 4" once
        const deptLevelMap = {}
        if (yearDepts.length > 0) {
          semesters
            .filter(s => s.department && yearDepts.some(d => d.shortform === s.department))
            .forEach(s => {
              const levelName = s.name.replace(/\s*\(.*?\)\s*$/, '').trim()
              if (!deptLevelMap[levelName]) deptLevelMap[levelName] = s.id // representative id
            })
        }
        const deptOptions = Object.entries(deptLevelMap)
          .sort(([a], [b]) => a.localeCompare(b, undefined, { numeric: true }))
          .map(([label, id]) => ({ id, label, isDept: true }))

        // Combine: general first, then dept levels
        const allOptions = [...generalOptions, ...deptOptions]

        return (
          <div className="fixed inset-0 z-30 grid place-items-center bg-brand-950/45 p-4">
            <div className="w-full max-w-sm rounded-2xl bg-white p-6 shadow-2xl">
              <div className="mb-5 flex items-center justify-between">
                <h2 className="text-xl font-bold text-brand-950">Set Semester — Class of {semPickerYear}</h2>
                <button type="button" onClick={() => { setSemPickerYear(null); setSemPickerChoice('') }} className="text-2xl text-slate-400 hover:text-slate-600">×</button>
              </div>

              <p className="mb-4 text-sm text-slate-500">
                Select a semester to assign to all classes in Class of {semPickerYear}.
              </p>

              {allOptions.length === 0 ? (
                <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
                  No semesters found. Go to the <b>Semesters</b> page and create one first.
                </div>
              ) : (
                <div className="space-y-2 max-h-72 overflow-y-auto pr-1">
                  {allOptions.map(opt => {
                    const isSelected = semPickerChoice === opt.id
                    return (
                      <button
                        key={opt.id}
                        type="button"
                        onClick={() => setSemPickerChoice(opt.id)}
                        className={`w-full rounded-xl border px-4 py-3 text-left transition ${
                          isSelected
                            ? 'border-brand-500 bg-brand-50'
                            : 'border-slate-200 bg-white hover:border-brand-300 hover:bg-slate-50'
                        }`}
                      >
                        <span className={`text-sm font-bold ${isSelected ? 'text-brand-800' : 'text-slate-800'}`}>
                          {opt.label}
                        </span>
                        {opt.isDept && (
                          <span className="ml-2 rounded-full bg-indigo-50 px-2 py-0.5 text-xs font-semibold text-indigo-600">
                            per department
                          </span>
                        )}
                        {!opt.isDept && yearDepts.length > 0 && (
                          <span className="ml-2 rounded-full bg-slate-100 px-2 py-0.5 text-xs font-semibold text-slate-500">
                            all classes
                          </span>
                        )}
                      </button>
                    )
                  })}
                </div>
              )}

              <button
                onClick={doAssignSemester}
                disabled={!semPickerChoice}
                className="mt-5 w-full rounded-xl bg-brand-600 py-2 px-10 font-bold text-white transition hover:bg-brand-800 disabled:opacity-40 disabled:cursor-not-allowed"
              >
                ⚡ Assign Semester
              </button>
            </div>
          </div>
        )
      })()}


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
        <section className="grid gap-40  md:grid-cols-2 xl:grid-cols-4">
          {academicYears.map((year) => (
            <div
              key={year}
              className="group rounded-2xl w-65  border border-slate-100 bg-white p-6 shadow-sm transition hover:-translate-y-1 hover:border-brand-500/30 hover:shadow-lg"
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
              {/* Semester badge and auto-assign button */}
              <div className="mt-3 flex flex-wrap items-center justify-between gap-3 border-t border-slate-50 pt-3">
                {(() => {
                  const yearCls = classes.filter(c => c.intake_year === year)
                  if (yearCls.length === 0) {
                    return <span className="rounded-full bg-slate-100 px-2.5 py-1 text-xs font-semibold text-slate-400 whitespace-nowrap">No classes</span>
                  }
                  
                  const assignedClasses = yearCls.filter(c => c.semester_id)
                  if (assignedClasses.length === 0) {
                    return <span className="rounded-full bg-slate-100 px-2.5 py-1 text-xs font-semibold text-slate-400 whitespace-nowrap">No semester</span>
                  }
                  
                  // Extract the level of the first assigned semester to show
                  const firstSem = semesters.find(s => s.id === assignedClasses[0].semester_id)
                  const levelMatch = firstSem?.name.match(/Semester\s*(\d+)/i)
                  const levelName = levelMatch ? `Semester ${levelMatch[1]}` : firstSem?.name.replace(/\s*\(.*?\)\s*$/, '').trim() || 'Semester'
                  
                  const isAllAssigned = assignedClasses.length === yearCls.length
                  
                  if (isAllAssigned) {
                    return <span className="rounded-full bg-emerald-50 px-2.5 py-1 text-xs font-semibold text-emerald-700 whitespace-nowrap">✓ {levelName}</span>
                  } else {
                    return <span className="rounded-full bg-amber-50 px-2.5 py-1 text-xs font-semibold text-amber-700 whitespace-nowrap">⚠ {levelName} (partial)</span>
                  }
                })()}
                <button
                  onClick={e => { e.stopPropagation(); openSemPicker(year) }}
                  className="shrink-0 rounded-lg px-2.5 py-1 text-xs font-semibold text-brand-600 border border-brand-200 hover:bg-cyan-50 transition"
                  title="Auto-assign correct semester to each class"
                >
                  ⚡ Set Semester
                </button>
              </div>
            </div>
          ))}
        </section>
      )}
    </>
  )
}
