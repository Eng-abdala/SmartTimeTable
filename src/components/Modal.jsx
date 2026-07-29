import { useState } from 'react'
import { Field } from './Field'

const days = ['Saturday', 'Sunday', 'Monday', 'Tuesday', 'Wednesday']

export function Modal({ modal, semester, onClose, onSave }) {
  const type = typeof modal === 'string' ? modal : modal.type
  const editing = typeof modal === 'object' && modal.data?.id
  const [form, setForm] = useState(
    typeof modal === 'object' ? { ...modal.data } : 
    type === 'lecturer' ? { lecturer_id: '', name: '', is_all_week: true, available_days: [] } : 
    type === 'class' ? { name: '', code: '', shift: 'Morning', intake_year: new Date().getFullYear() } : 
    { name: '', code: '' }
  )

  const change = (key, value) => setForm((current) => ({ ...current, [key]: value }))
  
  const submit = (event) => { 
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
      onSave(table, form, form.id) 
  }
  
  const title = `${editing ? 'Edit' : 'Add'} ${type === 'semester' ? 'Semester' : type === 'subject' ? 'Subject' : type === 'lecturer' ? 'Lecturer' : 'Class'}`
  
  return (
    <div className="fixed inset-0 z-20 grid place-items-center bg-brand-950/45 p-4">
      <form onSubmit={submit} className="w-full max-w-lg rounded-2xl bg-white p-6 shadow-2xl">
        <div className="mb-6 flex items-center justify-between">
          <h2 className="text-xl font-bold text-brand-950">{title}</h2>
          <button type="button" onClick={onClose} className="text-2xl text-slate-400">×</button>
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
              
              <label className="flex cursor-pointer items-center justify-between rounded-xl border border-slate-200 p-4">
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
