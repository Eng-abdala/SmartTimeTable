import { useState, useMemo } from 'react'
import { Field } from './Field'
import { getYearSemesterMap } from '../lib/semesterUtils'

const days = ['Saturday', 'Sunday', 'Monday', 'Tuesday', 'Wednesday']
const SEMESTER_NAME_PATTERN = /^semester\s*(\d+)$/i
const LECTURER_ID_PATTERN = /^[A-Za-z][A-Za-z0-9]{2,7}$/
const LECTURER_NAME_PATTERN = /^[A-Za-z ]+$/

function semesterNameForInput(semester) {
  if (!semester?.department) return semester?.name
  const departmentSuffix = ` (${semester.department})`
  return semester.name?.endsWith(departmentSuffix)
    ? semester.name.slice(0, -departmentSuffix.length)
    : semester.name
}

export function Modal({ modal, semester, semesters = [], subjects = [], lecturers = [], classes = [], departments = [], getLecturerTaughtSubjects, saveLecturerTaughtSubjects, onClose, onSave }) {
  const type = typeof modal === 'string' ? modal : modal.type
  const editing = typeof modal === 'object' && modal.data?.id
  const lecturerId = typeof modal === 'object' ? modal.data?.id : null
  const initialTaught = lecturerId && getLecturerTaughtSubjects ? getLecturerTaughtSubjects(lecturerId) : (modal.data?.taught_subjects || [])
  const deptContext = typeof modal === 'object' ? modal.department : null
  const intakeYearContext = typeof modal === 'object' ? modal.intakeYear : null
  const prefillDepartment = typeof modal === 'object' ? modal.prefillDepartment : null
  const classPrefix = deptContext && intakeYearContext ? `${deptContext.shortform}${String(intakeYearContext).slice(-2)}` : ''

  // Compute the semester this academic year already has locked in
  const yearSemesterMap = useMemo(() => getYearSemesterMap(classes), [classes])
  const semesterYearMap = useMemo(() => {
    const m = {}
    Object.entries(yearSemesterMap).forEach(([yr, semId]) => { if (semId) m[semId] = Number(yr) })
    return m
  }, [yearSemesterMap])
  // The semester inherited from the academic year context
  const yearInheritedSemesterId = intakeYearContext ? (yearSemesterMap[intakeYearContext] || null) : null
  const classSemesterId = yearInheritedSemesterId

  const [form, setForm] = useState(
    typeof modal === 'object' && modal.data ? { 
      ...modal.data,
      name: type === 'semester' ? semesterNameForInput(modal.data) : modal.data.name,
      taught_subjects: initialTaught,
      roomNumber: classPrefix && modal.data.name?.startsWith(classPrefix) ? modal.data.name.slice(classPrefix.length) : modal.data.name
    } : 
    type === 'lecturer' ? {
      lecturer_id: '', name: '', is_all_week: true, available_days: [], taught_subjects: [],
      morning_available_hours: 20, afternoon_available_hours: 20,
    } : 
    type === 'class' ? { 
      name: '', 
      roomNumber: '',
      shift: 'Morning', 
      intake_year: intakeYearContext || new Date().getFullYear(),
      // Auto-inherit semester from the academic year
      semester_id: classSemesterId,
      department_id: deptContext ? deptContext.id : null
    } : 
    { name: '', department: prefillDepartment || '' }
  )

  const [formError, setFormError] = useState('')
  const [customSubject, setCustomSubject] = useState('')
  const departmentOptions = Array.from(new Map(departments.map(dept => [dept.shortform, dept])).values())
    .sort((a, b) => a.name.localeCompare(b.name))

  // Unique list of subjects from curriculum
  const availableSubjectNames = Array.from(new Set((subjects || []).map(s => s.name).filter(Boolean)))

  const change = (key, value) => {
    if (key === 'lecturer_id') setFormError('')
    if (key === 'name' && type === 'class') {
      // Auto-detect year from class name: read the first 2 digits after letters
      // e.g. CA23 → 2023, CA235 → 2023, CN24 → 2024, CM26 → 2026
      const match = value.match(/^[A-Za-z]+(\d{2})/)
      if (match) {
        const shortYear = parseInt(match[1], 10)
        // Only auto-set if it's a valid intake year (20-27 range = 2020-2027)
        if (shortYear >= 20 && shortYear <= 30) {
          const fullYear = 2000 + shortYear
          setForm((current) => ({ ...current, [key]: value, intake_year: fullYear }))
          return
        }
      }
    }
    setForm((current) => ({ ...current, [key]: value }))
  }
  
  const submit = async (event) => { 
    event.preventDefault()
    if (type === 'subject') { 
      const theory = Number(form.theory_hours) || 0
      const lab = Number(form.lab_hours) || 0
      if (theory < 0 || theory > 8) {
        setFormError('Theory hours must be between 0 and 8.')
        return
      }
      if (lab < 0 || lab > 3) {
        setFormError('Lab hours must be between 0 and 3.')
        return
      }
      return onSave('subjects', { 
        semester_id: semester.id, 
        code: form.code,
        name: form.name, 
        theory_hours: theory, 
        lab_hours: lab, 
        total_hours: theory + lab 
      }, form.id) 
    }

    // Validate duplicate lecturer_id
    if (type === 'lecturer' && form.lecturer_id) {
      const duplicate = lecturers.find(
        (l) => l.lecturer_id === form.lecturer_id.trim() && l.id !== form.id
      )
      if (duplicate) {
        setFormError(`Lecturer ID "${form.lecturer_id.trim()}" is already used by ${duplicate.name}. Please use a unique ID.`)
        return
      }
    }

    const table = type === 'semester' ? 'semesters' : type === 'class' ? 'classes' : `${type}s`
    
    // Omit fields not in the Supabase schema
    const { taught_subjects, roomNumber, ...dbPayload } = form
    // semester_id is valid for classes — keep it in dbPayload

    if (type === 'class') {
      if (classPrefix && !/^\d+$/.test((roomNumber || '').trim())) {
        setFormError('Class number must contain digits only, for example 1, 2, or 3.')
        return
      }
      dbPayload.name = classPrefix ? `${classPrefix}${roomNumber || ''}` : form.name;
      if (!dbPayload.department_id && deptContext) dbPayload.department_id = deptContext.id
      // Enforce: if the academic year has an assigned semester, always save that
      if (classSemesterId) {
        dbPayload.semester_id = classSemesterId
      }
    }

    if (type === 'lecturer') {
      const lecturerIdValue = form.lecturer_id.trim()
      const lecturerName = form.name.trim()
      const morningHours = Number(form.morning_available_hours)
      const afternoonHours = Number(form.afternoon_available_hours)
      if (!LECTURER_ID_PATTERN.test(lecturerIdValue)) {
        setFormError('Lecturer ID must start with a letter, contain only letters and numbers, and be 3–8 characters long.')
        return
      }
      if (lecturerName.length < 3 || !LECTURER_NAME_PATTERN.test(lecturerName) || !/[A-Za-z]/.test(lecturerName)) {
        setFormError('Full name must contain only letters and spaces, cannot be only spaces, and must be at least 3 characters long.')
        return
      }
      if (!Number.isInteger(morningHours) || morningHours < 0 || morningHours > 20 || !Number.isInteger(afternoonHours) || afternoonHours < 0 || afternoonHours > 20) {
        setFormError('Morning and afternoon availability must each be a whole number from 0 to 20 hours per week.')
        return
      }
      dbPayload.lecturer_id = lecturerIdValue
      dbPayload.name = lecturerName
      dbPayload.morning_available_hours = morningHours
      dbPayload.afternoon_available_hours = afternoonHours
    }

    // (Code generation moved below so it can pick up the appended department for semesters)

    if (type === 'semester') {
      const match = dbPayload.name?.trim().match(SEMESTER_NAME_PATTERN)
      if (!match) {
        setFormError('Semester name must be "Semester" followed by a number, for example "Semester 4".')
        return
      }

      const semesterLevel = Number(match[1])
      if (!Number.isInteger(semesterLevel) || semesterLevel < 1 || semesterLevel > 10) {
        setFormError('Semester number must be between 1 and 10.')
        return
      }

      dbPayload.name = `Semester ${semesterLevel}`
      const isHigh = semesterLevel >= 4
      if (!isHigh) {
        delete dbPayload.department
      } else if (!dbPayload.department) {
        setFormError('Department is required for Semester 4 and above.')
        return
      } else {
        // Append department to name so it stays unique in the database
        if (!dbPayload.name.includes(dbPayload.department)) {
          dbPayload.name = `${dbPayload.name.trim()} (${dbPayload.department})`
        }
      }
    }

    // Auto-generate code from name if missing (classes, semesters, subjects all have a NOT NULL code column)
    if ((type === 'class' || type === 'semester' || type === 'subject') && !dbPayload.code) {
      dbPayload.code = (dbPayload.name || '').toUpperCase().replace(/\s+/g, '-').slice(0, 20)
    }

    const savedRecord = await onSave(table, dbPayload, form.id)

    // Save taught subjects in local store if lecturer
    // Use savedRecord.id for new lecturers (form.id is undefined for new ones)
    if (type === 'lecturer' && saveLecturerTaughtSubjects) {
      const lecId = form.id || savedRecord?.id
      if (lecId) saveLecturerTaughtSubjects(lecId, taught_subjects || [])
    }
  }

  const toggleSubject = (subName) => {
    const current = form.taught_subjects || []
    if (current.includes(subName)) {
      change('taught_subjects', current.filter(s => s !== subName))
    } else {
      change('taught_subjects', [...current, subName])
    }
  }

  const addCustomSubject = () => {
    if (!customSubject.trim()) return
    const current = form.taught_subjects || []
    if (!current.includes(customSubject.trim())) {
      change('taught_subjects', [...current, customSubject.trim()])
    }
    setCustomSubject('')
  }
  
  const title = `${editing ? 'Edit' : 'Add'} ${type === 'semester' ? 'Semester' : type === 'subject' ? 'Subject' : type === 'lecturer' ? 'Lecturer' : 'Class'}`
  
  return (
    <div className="fixed inset-0 z-20 grid place-items-center bg-brand-950/45 p-4 overflow-y-auto">
      <form onSubmit={submit} className="w-full max-w-lg rounded-2xl bg-white p-6 shadow-2xl my-8">
        <div className="mb-6 flex items-center justify-between">
          <h2 className="text-xl font-bold text-brand-950">{title}</h2>
          <button type="button" onClick={onClose} className="text-2xl text-slate-400 hover:text-slate-600">×</button>
        </div>
        
        <div className="space-y-4">
          {type === 'semester' && (
            <>
              <Field label="Semester Name" value={form.name} onChange={(v) => change('name', v)} placeholder="Semester 6" />
              {prefillDepartment ? (
                // Department is pre-set from the section button — show locked badge
                <div className="flex items-center gap-2 rounded-xl border border-slate-200 bg-slate-50 px-4 py-3">
                  <span className="text-sm font-semibold text-slate-500">Department:</span>
                  <span className="rounded-full bg-brand-100 px-3 py-0.5 text-sm font-bold text-brand-700">{prefillDepartment}</span>
                  <span className="text-xs text-slate-400">(pre-selected)</span>
                </div>
              ) : (() => {
                const match = form.name?.match(/\d+/)
                const isHigh = match && parseInt(match[0], 10) >= 4
                if (!isHigh) return null
                return (
                  <label className="block text-sm font-semibold text-brand-950">
                    Department
                    <select
                      required
                      value={form.department || ''}
                      onChange={e => change('department', e.target.value)}
                      className="mt-1.5 w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 font-normal text-slate-700 outline-none transition focus:border-brand-600 focus:ring-2 focus:ring-brand-600/10"
                    >
                      <option value="">-- Select Department --</option>
                      {departmentOptions.map(dept => (
                        <option key={dept.shortform} value={dept.shortform}>{dept.name} ({dept.shortform})</option>
                      ))}
                    </select>
                  </label>
                )
              })()}
            </>
          )}
          
          {type === 'subject' && (
            <>
              <Field label="Subject Code" value={form.code} onChange={(v) => change('code', v)} placeholder="CS302" />
              <Field label="Subject Name" value={form.name} onChange={(v) => change('name', v)} placeholder="C# Programming II" />
              <div className="grid gap-4 sm:grid-cols-2">
                <Field label="Theory Hours (max 8)" type="number" min="0" max="8" value={form.theory_hours} onChange={(v) => change('theory_hours', v)} />
                <Field label="Lab Hours (max 3)" type="number" min="0" max="3" required={false} value={form.lab_hours} onChange={(v) => change('lab_hours', v)} />
              </div>
            </>
          )}
          
          {type === 'lecturer' && (
            <>
              <Field label="Lecturer ID" value={form.lecturer_id} onChange={(v) => change('lecturer_id', v)} placeholder="LEC101" minLength={3} maxLength={8} pattern="[A-Za-z][A-Za-z0-9]{2,7}" />
              <Field label="Full Name" value={form.name} onChange={(v) => change('name', v)} placeholder="Yahye Ali Isse" minLength={3} pattern="[A-Za-z ]+" />
              <div className="grid gap-4 sm:grid-cols-2">
                <Field label="Morning available hours (per week)" type="number" min="0" max="20" value={form.morning_available_hours ?? 20} onChange={(v) => change('morning_available_hours', v)} placeholder="12" />
                <Field label="Afternoon available hours (per week)" type="number" min="0" max="20" value={form.afternoon_available_hours ?? 20} onChange={(v) => change('afternoon_available_hours', v)} placeholder="3" />
              </div>
              

              <label className="flex cursor-pointer items-center justify-between rounded-xl border border-slate-200 p-4 bg-white">
                <span>
                  <b className="block text-sm text-brand-950">Available All Week</b>
                  <span className="text-xs text-slate-500">Includes all faculty teaching days</span>
                </span>
                <input checked={form.is_all_week} onChange={(e) => change('is_all_week', e.target.checked)} className="h-5 w-5 accent-brand-600" type="checkbox" />
              </label>
              
              {!form.is_all_week && (
                <div>
                  <p className="mb-2 text-sm font-semibold text-brand-950">Available days</p>
                  <div className="flex flex-wrap gap-2">
                    {days.map((day) => (
                      <label key={day} className={`cursor-pointer rounded-lg border px-3 py-2 text-xs font-medium ${form.available_days.includes(day) ? 'border-brand-600 bg-cyan-50 text-brand-700' : 'border-slate-200 text-slate-500'}`}>
                        <input className="sr-only" type="checkbox" checked={form.available_days.includes(day)} onChange={() => change('available_days', form.available_days.includes(day) ? form.available_days.filter((item) => item !== day) : [...form.available_days, day])} />
                        {day}
                      </label>
                    ))}
                  </div>
                </div>
              )}
            </>
          )}
          
          {type === 'class' && (
            <>
              {classPrefix ? (
                <label className="block text-sm font-semibold text-brand-950 mb-4">
                  Class Name
                  <div className="mt-1.5 flex items-center overflow-hidden rounded-xl border border-slate-200 focus-within:border-brand-600 focus-within:ring-1 focus-within:ring-brand-600">
                    <span className="bg-slate-50 px-3 py-2.5 text-slate-500 font-mono font-bold border-r border-slate-200">
                      {classPrefix}
                    </span>
                    <input 
                      value={form.roomNumber || ''} 
                      onChange={(e) => change('roomNumber', e.target.value)} 
                      placeholder="1" 
                      inputMode="numeric"
                      pattern="[0-9]+"
                      className="w-full px-3 py-2.5 font-normal text-slate-700 outline-none"
                      autoFocus
                    />
                  </div>
                </label>
              ) : (
                <Field label="Class Name" value={form.name} onChange={(v) => change('name', v)} placeholder="CA235" />
              )}
              <div className="grid gap-4 sm:grid-cols-2">
                <label className="block text-sm font-semibold text-brand-950">
                  Shift
                  <select value={form.shift || 'Morning'} onChange={(e) => change('shift', e.target.value)} className="mt-1.5 w-full rounded-xl border border-slate-200 px-3 py-2.5 font-normal text-slate-700 outline-none focus:border-brand-600">
                    <option value="Morning">Morning</option>
                    <option value="Afternoon">Afternoon</option>
                  </select>
                </label>
                {!intakeYearContext && (
                  <label className="block text-sm font-semibold text-brand-950">
                    Intake Year
                    <div className="mt-1.5 flex items-center gap-2">
                      <select value={form.intake_year} onChange={(e) => change('intake_year', Number(e.target.value))} className="w-full rounded-xl border border-slate-200 px-3 py-2.5 font-normal text-slate-700 outline-none focus:border-brand-600">
                        <option value={2027}>2027</option>
                        <option value={2026}>2026</option>
                        <option value={2025}>2025</option>
                        <option value={2024}>2024</option>
                        <option value={2023}>2023</option>
                      </select>
                    </div>
                  </label>
                )}
              </div>
              <label className="block text-sm font-semibold text-brand-950">
                Current Semester
                {classSemesterId ? (
                  // Locked — show read-only badge
                  <div className="mt-1.5 flex items-center gap-2 rounded-xl border border-cyan-200 bg-cyan-50 px-4 py-2.5">
                    <span className="text-base">🔒</span>
                    <div className="min-w-0">
                      <p className="font-semibold text-brand-700 text-sm">
                        {semesters.find(s => s.id === classSemesterId)?.name || 'Unknown'}
                      </p>
                      <p className="text-[11px] text-slate-500 mt-0.5">
                        Inherited from Class of {intakeYearContext} — cannot be changed individually
                      </p>
                    </div>
                  </div>
                ) : (
                  <>
                    <select
                      value={form.semester_id || ''}
                      onChange={(e) => {
                        const newSemId = e.target.value || null
                        // Block if this semester is already owned by another year
                        if (newSemId) {
                          const ownerYear = semesterYearMap[newSemId]
                          const curYear = intakeYearContext || form.intake_year
                          if (ownerYear && ownerYear !== curYear) {
                            setFormError(`That semester is already assigned to Class of ${ownerYear}. Each semester can only belong to one academic year.`)
                            return
                          }
                        }
                        setFormError('')
                        change('semester_id', newSemId)
                      }}
                      className="mt-1.5 w-full rounded-xl border border-slate-200 px-3 py-2.5 font-normal text-slate-700 outline-none focus:border-brand-600"
                    >
                      <option value="">— Not assigned —</option>
                      {[...semesters].sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true })).map(s => {
                        const ownerYear = semesterYearMap[s.id]
                        const curYear = intakeYearContext || form.intake_year
                        const takenByOther = ownerYear && ownerYear !== curYear
                        return (
                          <option key={s.id} value={s.id} disabled={takenByOther}>
                            {s.name}{takenByOther ? ` (Class of ${ownerYear})` : ''}
                          </option>
                        )
                      })}
                    </select>
                    <span className="mt-1 block text-xs font-normal text-slate-400">You can update this anytime when the class moves to the next semester.</span>
                  </>
                )}
              </label>
            </>
          )}
        </div>
        
        {formError && (
          <div className="mt-4 flex items-start gap-2 rounded-xl border border-rose-300 bg-rose-50 px-4 py-3 text-sm text-rose-800">
            <span className="mt-0.5 shrink-0">⚠</span>
            <span>{formError}</span>
          </div>
        )}
        
        <button className="mt-4 w-full rounded-xl bg-brand-600 py-3 font-semibold text-white transition hover:bg-brand-800">
          {editing ? 'Save Changes' : `Create ${type === 'semester' ? 'Semester' : type === 'subject' ? 'Subject' : type === 'lecturer' ? 'Lecturer' : 'Class'}`}
        </button>
      </form>
    </div>
  )
}
