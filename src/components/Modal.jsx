import { useState } from 'react'
import { Field } from './Field'

const days = ['Saturday', 'Sunday', 'Monday', 'Tuesday', 'Wednesday']

export function Modal({ modal, semester, subjects = [], getLecturerTaughtSubjects, saveLecturerTaughtSubjects, onClose, onSave }) {
  const type = typeof modal === 'string' ? modal : modal.type
  const editing = typeof modal === 'object' && modal.data?.id
  const lecturerId = typeof modal === 'object' ? modal.data?.id : null
  const initialTaught = lecturerId && getLecturerTaughtSubjects ? getLecturerTaughtSubjects(lecturerId) : (modal.data?.taught_subjects || [])

  const [form, setForm] = useState(
    typeof modal === 'object' ? { ...modal.data, taught_subjects: initialTaught } : 
    type === 'lecturer' ? { lecturer_id: '', name: '', is_all_week: true, available_days: [], taught_subjects: [] } : 
    type === 'class' ? { name: '', code: '', shift: 'Morning', intake_year: new Date().getFullYear() } : 
    { name: '', code: '' }
  )

  const [customSubject, setCustomSubject] = useState('')

  // Unique list of subjects from curriculum
  const availableSubjectNames = Array.from(new Set((subjects || []).map(s => s.name).filter(Boolean)))

  const change = (key, value) => setForm((current) => ({ ...current, [key]: value }))
  
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
    const table = type === 'semester' ? 'semesters' : type === 'class' ? 'classes' : `${type}s`
    
    // Omit taught_subjects when saving directly to Supabase table to avoid schema errors
    const { taught_subjects, ...dbPayload } = form

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
              <Field label="Semester Code" value={form.code} onChange={(v) => change('code', v)} placeholder="SEM-06" />
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
              
              {/* Taught Subjects Section */}
              <div className="rounded-xl border border-slate-200 p-4 space-y-3 bg-slate-50/50">
                <div>
                  <b className="block text-sm text-brand-950">Subjects Taught / Qualified To Teach</b>
                  <span className="text-xs text-slate-500">Select subjects this lecturer can teach to filter them when assigning in semesters</span>
                </div>

                <div className="flex flex-wrap gap-2 max-h-40 overflow-y-auto p-1">
                  {availableSubjectNames.length > 0 ? (
                    availableSubjectNames.map((subName) => {
                      const isSelected = (form.taught_subjects || []).includes(subName)
                      return (
                        <button
                          type="button"
                          key={subName}
                          onClick={() => toggleSubject(subName)}
                          className={`rounded-lg px-3 py-1.5 text-xs font-semibold transition border ${
                            isSelected 
                              ? 'bg-brand-600 border-brand-600 text-white shadow-xs' 
                              : 'bg-white border-slate-200 text-slate-600 hover:border-brand-300'
                          }`}
                        >
                          {isSelected ? '✓ ' : '+ '}{subName}
                        </button>
                      )
                    })
                  ) : (
                    <p className="text-xs text-slate-400 italic">No subjects created in curriculum yet. Type custom subject below.</p>
                  )}
                </div>

                {/* Custom Subject Input */}
                <div className="flex gap-2 pt-1 border-t border-slate-200/60">
                  <input 
                    type="text" 
                    value={customSubject}
                    onChange={(e) => setCustomSubject(e.target.value)}
                    placeholder="Add specific subject (e.g. C# Programming)"
                    className="flex-1 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs text-slate-700 outline-none focus:border-brand-600"
                  />
                  <button 
                    type="button" 
                    onClick={addCustomSubject}
                    className="rounded-lg bg-slate-200 px-3 py-1.5 text-xs font-bold text-slate-700 hover:bg-slate-300"
                  >
                    Add
                  </button>
                </div>

                {/* Selected Subjects Summary Pills */}
                {form.taught_subjects?.length > 0 && (
                  <div className="flex flex-wrap gap-1.5 pt-2">
                    <span className="text-[11px] text-slate-400 self-center">Selected:</span>
                    {form.taught_subjects.map(s => (
                      <span key={s} className="inline-flex items-center gap-1 rounded-md bg-cyan-100 px-2 py-0.5 text-[11px] font-bold text-brand-800">
                        {s}
                        <button type="button" onClick={() => toggleSubject(s)} className="text-rose-600 font-bold">×</button>
                      </span>
                    ))}
                  </div>
                )}
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
              <Field label="Class Name" value={form.name} onChange={(v) => change('name', v)} placeholder="CA235" />
              <Field label="Class Code" value={form.code} onChange={(v) => change('code', v)} placeholder="CLS-CA235" />
              <div className="grid grid-cols-2 gap-4">
                <label className="block text-sm font-semibold text-brand-950">
                  Shift
                  <select value={form.shift} onChange={(e) => change('shift', e.target.value)} className="mt-1.5 w-full rounded-xl border border-slate-200 px-3 py-2.5 font-normal text-slate-700 outline-none focus:border-brand-600">
                    <option>Morning</option>
                    <option>Afternoon</option>
                  </select>
                </label>
                <label className="block text-sm font-semibold text-brand-950">
                  Intake Year
                  <select value={form.intake_year} onChange={(e) => change('intake_year', Number(e.target.value))} className="mt-1.5 w-full rounded-xl border border-slate-200 px-3 py-2.5 font-normal text-slate-700 outline-none focus:border-brand-600">
                    <option value={2026}>2026</option>
                    <option value={2025}>2025</option>
                    <option value={2024}>2024</option>
                    <option value={2023}>2023</option>
                  </select>
                </label>
              </div>
            </>
          )}
        </div>
        
        <button className="mt-7 w-full rounded-xl bg-brand-600 py-3 font-semibold text-white transition hover:bg-brand-800">
          {editing ? 'Save Changes' : `Create ${type === 'semester' ? 'Semester' : type === 'subject' ? 'Subject' : type === 'lecturer' ? 'Lecturer' : 'Class'}`}
        </button>
      </form>
    </div>
  )
}
