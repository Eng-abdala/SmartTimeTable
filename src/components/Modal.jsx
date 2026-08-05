import { useState } from 'react'
import { Field } from './Field'

const days = ['Saturday', 'Sunday', 'Monday', 'Tuesday', 'Wednesday']

export function Modal({ modal, semester, semesters = [], subjects = [], lecturers = [], getLecturerTaughtSubjects, saveLecturerTaughtSubjects, onClose, onSave }) {
  const type = typeof modal === 'string' ? modal : modal.type
  const editing = typeof modal === 'object' && modal.data?.id
  const lecturerId = typeof modal === 'object' ? modal.data?.id : null
  const initialTaught = lecturerId && getLecturerTaughtSubjects ? getLecturerTaughtSubjects(lecturerId) : (modal.data?.taught_subjects || [])
  const deptContext = typeof modal === 'object' ? modal.department : null
  const intakeYearContext = typeof modal === 'object' ? modal.intakeYear : null
  const classPrefix = deptContext && intakeYearContext ? `${deptContext.shortform}${String(intakeYearContext).slice(-2)}` : ''

  const [form, setForm] = useState(
    typeof modal === 'object' && modal.data ? { 
      ...modal.data, 
      taught_subjects: initialTaught,
      roomNumber: classPrefix && modal.data.name?.startsWith(classPrefix) ? modal.data.name.slice(classPrefix.length) : modal.data.name
    } : 
    type === 'lecturer' ? { lecturer_id: '', name: '', is_all_week: true, available_days: [], taught_subjects: [] } : 
    type === 'class' ? { 
      name: '', 
      roomNumber: '',
      shift: 'Morning', 
      intake_year: intakeYearContext || new Date().getFullYear(),
      semester_id: null,
      department_id: deptContext ? deptContext.id : null
    } : 
    { name: '' }
  )

  const [formError, setFormError] = useState('')
  const [customSubject, setCustomSubject] = useState('')

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
    const { taught_subjects, roomNumber, department_id, ...dbPayload } = form
    // semester_id is valid for classes — keep it in dbPayload

    if (type === 'class') {
      dbPayload.name = classPrefix ? `${classPrefix}${roomNumber || ''}` : form.name;
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
              <Field label="Semester Name" value={form.name} onChange={(v) => change('name', v)} placeholder="Semester 6 - Spring 2026" />
            </>
          )}
          
          {type === 'subject' && (
            <>
              <Field label="Subject Code" value={form.code} onChange={(v) => change('code', v)} placeholder="CS302" />
              <Field label="Subject Name" value={form.name} onChange={(v) => change('name', v)} placeholder="C# Programming II" />
              <div className="grid grid-cols-2 gap-4">
                <Field label="Theory Hours" type="number" min="0" value={form.theory_hours} onChange={(v) => change('theory_hours', v)} />
                <Field label="Lab Hours (Optional)" type="number" min="0" required={false} value={form.lab_hours} onChange={(v) => change('lab_hours', v)} />
              </div>
            </>
          )}
          
          {type === 'lecturer' && (
            <>
              <Field label="Lecturer ID" value={form.lecturer_id} onChange={(v) => change('lecturer_id', v)} placeholder="LEC-101" />
              <Field label="Full Name" value={form.name} onChange={(v) => change('name', v)} placeholder="Yahye Ali Isse" />
              

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
                      className="w-full px-3 py-2.5 font-normal text-slate-700 outline-none"
                      autoFocus
                    />
                  </div>
                </label>
              ) : (
                <Field label="Class Name" value={form.name} onChange={(v) => change('name', v)} placeholder="CA235" />
              )}
              <div className="grid grid-cols-2 gap-4">
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
                <select
                  value={form.semester_id || ''}
                  onChange={(e) => change('semester_id', e.target.value || null)}
                  className="mt-1.5 w-full rounded-xl border border-slate-200 px-3 py-2.5 font-normal text-slate-700 outline-none focus:border-brand-600"
                >
                  <option value="">— Not assigned —</option>
                  {[...semesters].sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true })).map(s => (
                    <option key={s.id} value={s.id}>{s.name}</option>
                  ))}
                </select>
                <span className="mt-1 block text-xs font-normal text-slate-400">You can update this anytime when the class moves to the next semester.</span>
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
