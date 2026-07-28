import { useEffect, useMemo, useState } from 'react'
import { supabase } from './lib/supabase'
import facultyLogo from './assets/logo.png'

const days = ['Saturday', 'Sunday', 'Monday', 'Tuesday', 'Wednesday']
const blankSubject = { code: '', name: '', theory_hours: 0, lab_hours: 0 }

function Icon({ name, className = 'h-5 w-5' }) {
  const paths = {
    grid: <><rect x="3" y="3" width="7" height="7" rx="1" /><rect x="14" y="3" width="7" height="7" rx="1" /><rect x="3" y="14" width="7" height="7" rx="1" /><rect x="14" y="14" width="7" height="7" rx="1" /></>,
    layers: <><path d="m12 3 9 5-9 5-9-5 9-5Z" /><path d="m3 12 9 5 9-5" /><path d="m3 17 9 5 9-5" /></>,
    users: <><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" /><circle cx="9" cy="7" r="4" /><path d="M22 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75" /></>,
    group: <><circle cx="8" cy="8" r="3" /><circle cx="17" cy="9" r="2.5" /><path d="M2 20a6 6 0 0 1 12 0M14 20a4.5 4.5 0 0 1 8 0" /></>,
    plus: <path d="M12 5v14M5 12h14" />,
    arrow: <path d="m9 18 6-6-6-6" />,
    back: <path d="m15 18-6-6 6-6" />,
    edit: <><path d="M12 20h9" /><path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4Z" /></>,
    trash: <><path d="M3 6h18" /><path d="M8 6V4h8v2M19 6l-1 14H6L5 6" /><path d="M10 11v5M14 11v5" /></>,
    calendar: <><rect x="3" y="5" width="18" height="16" rx="2" /><path d="M16 3v4M8 3v4M3 11h18" /></>,
  }
  return <svg className={className} fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24" aria-hidden="true">{paths[name]}</svg>
}

function App() {
  const [active, setActive] = useState('Semesters')
  const [semesters, setSemesters] = useState([])
  const [subjects, setSubjects] = useState([])
  const [lecturers, setLecturers] = useState([])
  const [classes, setClasses] = useState([])
  const [selectedSemester, setSelectedSemester] = useState(null)
  const [loading, setLoading] = useState(true)
  const [notice, setNotice] = useState('')
  const [modal, setModal] = useState(null)

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
  const subjectsForSemester = useMemo(() => subjects.filter((subject) => subject.semester_id === selectedSemester?.id), [subjects, selectedSemester])
  const metrics = [
    ['Total Semesters', semesters.length, 'layers', 'bg-brand-600'],
    ['Total Subjects', subjects.length, 'grid', 'bg-accent-400'],
    ['Total Lecturers', lecturers.length, 'users', 'bg-[#7b61c9]'],
    ['Total Classes', classes.length, 'group', 'bg-[#ef7f61]'],
  ]

  async function save(table, values, id) {
    const query = id ? supabase.from(table).update(values).eq('id', id) : supabase.from(table).insert(values)
    const { error } = await query
    if (error) return setNotice(error.message)
    setModal(null); setNotice(`${id ? 'Changes' : 'New record'} saved successfully.`); await loadData()
  }
  async function remove(table, id) {
    if (!window.confirm('Delete this record? This cannot be undone.')) return
    const { error } = await supabase.from(table).delete().eq('id', id)
    if (error) return setNotice(error.message)
    setNotice('Record deleted.'); await loadData()
  }

  const nav = [['Semesters', 'layers'], ['Classes', 'group'], ['Lecturers', 'users']]
  return (
    <div className="min-h-screen bg-[#f5f8fa] font-sans text-[#16333a] lg:flex">
      <aside className="flex w-full flex-col bg-brand-950 text-white lg:min-h-screen lg:w-64">
        <div className="flex items-center gap-3 px-6 py-7">
          <div className="grid h-11 w-11 place-items-center overflow-hidden rounded-full bg-white p-0.5 shadow-lg"><img src={facultyLogo} className="h-full w-full object-cover" alt="Jamhuriya University logo" /></div>
          <div><p className="text-lg font-bold tracking-tight">Smart Timetable</p><p className="text-xs text-cyan-100/70">IT Faculty Portal</p></div>
        </div>
        <nav className="flex gap-1 overflow-x-auto px-3 pb-5 lg:block lg:space-y-1">
          {nav.map(([label, icon]) => <button key={label} onClick={() => { setActive(label); setSelectedSemester(null) }} className={`flex min-w-max items-center gap-3 rounded-xl px-4 py-3 text-sm font-medium transition lg:w-full ${active === label ? 'bg-brand-600 text-white shadow-lg shadow-black/10' : 'text-cyan-50/70 hover:bg-white/10 hover:text-white'}`}><Icon name={icon} />{label}</button>)}
        </nav>
        <div className="mt-auto hidden border-t border-white/10 px-6 py-5 text-xs text-cyan-100/55 lg:block">© 2026 IT Faculty</div>
      </aside>

      <main className="min-w-0 flex-1 p-5 sm:p-8">
        <header className="mb-8 flex flex-col justify-between gap-4 sm:flex-row sm:items-center">
          <div><p className="text-sm font-medium text-brand-600">University IT Faculty</p><h1 className="mt-1 text-2xl font-bold tracking-tight text-brand-950 sm:text-3xl">{selectedSemester ? selectedSemester.name : active}</h1></div>
          <button onClick={() => setModal(active === 'Semesters' ? 'semester' : active === 'Lecturers' ? 'lecturer' : 'class')} className="inline-flex items-center justify-center gap-2 rounded-xl bg-brand-600 px-4 py-3 text-sm font-semibold text-white shadow-md shadow-brand-600/20 transition hover:bg-brand-800"><Icon name="plus" className="h-4 w-4" />Add {active === 'Semesters' ? 'Semester' : active === 'Lecturers' ? 'Lecturer' : 'Class'}</button>
        </header>

        {notice && <div className="mb-5 flex items-center justify-between rounded-xl border border-brand-600/20 bg-cyan-50 px-4 py-3 text-sm text-brand-800"><span>{notice}</span><button onClick={() => setNotice('')} className="font-bold">×</button></div>}
        {loading ? <div className="rounded-2xl bg-white p-12 text-center text-slate-500 shadow-sm">Loading timetable data…</div> : <>
          {!selectedSemester && <section className="mb-8 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">{metrics.map(([label, amount, icon, color]) => <div key={label} className="rounded-2xl border border-slate-100 bg-white p-5 shadow-sm"><div className="flex items-center justify-between"><div className={`grid h-11 w-11 place-items-center rounded-xl text-white ${color}`}><Icon name={icon} /></div><span className="text-3xl font-bold text-brand-950">{amount}</span></div><p className="mt-4 text-sm font-medium text-slate-500">{label}</p></div>)}</section>}
          {active === 'Semesters' && (selectedSemester ? <SemesterDetail semester={selectedSemester} subjects={subjectsForSemester} onBack={() => setSelectedSemester(null)} onAdd={() => setModal({ type: 'subject', data: blankSubject })} onEdit={(data) => setModal({ type: 'subject', data })} onDelete={(id) => remove('subjects', id)} /> : <SemesterGrid semesters={semesters} subjects={subjects} onSelect={setSelectedSemester} />)}
          {active === 'Lecturers' && <LecturerView lecturers={lecturers} onEdit={(data) => setModal({ type: 'lecturer', data })} onDelete={(id) => remove('lecturers', id)} />}
          {active === 'Classes' && <ClassView classes={classes} onEdit={(data) => setModal({ type: 'class', data })} onDelete={(id) => remove('classes', id)} />}
        </>}
      </main>
      {modal && <Modal modal={modal} semester={selectedSemester} onClose={() => setModal(null)} onSave={save} />}
    </div>
  )
}

function SemesterGrid({ semesters, subjects, onSelect }) {
  if (!semesters.length) return <Empty title="No semesters yet" text="Create your first semester, then add its subjects from the semester view." />
  return <section className="grid gap-5 md:grid-cols-2 xl:grid-cols-3">{semesters.map((semester) => { const items = subjects.filter((subject) => subject.semester_id === semester.id); const hours = items.reduce((sum, subject) => sum + subject.total_hours, 0); return <button onClick={() => onSelect(semester)} key={semester.id} className="group rounded-2xl border border-slate-100 bg-white p-6 text-left shadow-sm transition hover:-translate-y-1 hover:border-brand-500/30 hover:shadow-lg"><div className="flex items-start justify-between"><span className="rounded-lg bg-cyan-50 px-3 py-1 text-xs font-bold text-brand-600">{semester.code}</span><span className="text-brand-500 transition group-hover:translate-x-1"><Icon name="arrow" /></span></div><h2 className="mt-6 text-xl font-bold text-brand-950">{semester.name}</h2><div className="mt-5 flex border-t border-slate-100 pt-4 text-sm"><span className="flex-1 text-slate-500"><b className="text-brand-950">{items.length}</b> subjects</span><span className="text-slate-500"><b className="text-brand-950">{hours}</b> total hrs</span></div></button> })}</section>
}
function SemesterDetail({ semester, subjects, onBack, onAdd, onEdit, onDelete }) {
  return <section><div className="mb-5 flex flex-col justify-between gap-3 sm:flex-row sm:items-center"><button onClick={onBack} className="inline-flex items-center gap-2 text-sm font-semibold text-brand-600 hover:text-brand-800"><Icon name="back" className="h-4 w-4" />All semesters</button><button onClick={onAdd} className="inline-flex items-center gap-2 rounded-xl bg-brand-600 px-4 py-2.5 text-sm font-semibold text-white"><Icon name="plus" className="h-4 w-4" />Add Subject</button></div><div className="overflow-hidden rounded-2xl border border-slate-100 bg-white shadow-sm"><div className="border-b border-slate-100 px-6 py-5"><p className="text-sm text-slate-500">Subjects assigned to <b className="text-brand-950">{semester.code}</b></p></div>{subjects.length ? <div className="overflow-x-auto"><table className="w-full min-w-[700px] text-left text-sm"><thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500"><tr>{['Subject Code', 'Subject Name', 'Theory Hours', 'Lab Hours', 'Total Hours', 'Actions'].map((title) => <th key={title} className="px-6 py-4 font-semibold">{title}</th>)}</tr></thead><tbody>{subjects.map((subject) => <tr key={subject.id} className="border-t border-slate-100 text-slate-600"><td className="px-6 py-4 font-semibold text-brand-600">{subject.code}</td><td className="px-6 py-4 font-medium text-brand-950">{subject.name}</td><td className="px-6 py-4">{subject.theory_hours}</td><td className="px-6 py-4">{subject.lab_hours}</td><td className="px-6 py-4 font-bold text-brand-950">{subject.total_hours}</td><td className="px-6 py-4"><div className="flex gap-2"><button onClick={() => onEdit(subject)} className="rounded-lg p-2 text-brand-600 hover:bg-cyan-50" aria-label="Edit subject"><Icon name="edit" className="h-4 w-4" /></button><button onClick={() => onDelete(subject.id)} className="rounded-lg p-2 text-rose-500 hover:bg-rose-50" aria-label="Delete subject"><Icon name="trash" className="h-4 w-4" /></button></div></td></tr>)}</tbody></table></div> : <Empty title="No subjects in this semester" text="Use Add Subject to start building this semester's curriculum." />}</div></section>
}
function LecturerView({ lecturers, onEdit, onDelete }) { return <ManagerTable headers={['Lecturer ID', 'Name', 'Availability', 'Actions']} rows={lecturers} empty="No lecturers registered yet." render={(person) => <><td className="px-6 py-4 font-semibold text-brand-600">{person.lecturer_id}</td><td className="px-6 py-4 font-medium text-brand-950">{person.name}</td><td className="px-6 py-4"><span className="rounded-full bg-cyan-50 px-3 py-1 text-xs font-semibold text-brand-700">{person.is_all_week ? 'Available all week' : person.available_days.join(', ')}</span></td><Actions onEdit={() => onEdit(person)} onDelete={() => onDelete(person.id)} /></>} /> }
function ClassView({ classes, onEdit, onDelete }) { return <ManagerTable headers={['Class Name', 'Class Code', 'Shift', 'Actions']} rows={classes} empty="No classes registered yet." render={(item) => <><td className="px-6 py-4 font-medium text-brand-950">{item.name}</td><td className="px-6 py-4 font-semibold text-brand-600">{item.code}</td><td className="px-6 py-4"><span className="rounded-full bg-amber-50 px-3 py-1 text-xs font-semibold text-amber-700">{item.shift}</span></td><Actions onEdit={() => onEdit(item)} onDelete={() => onDelete(item.id)} /></>} /> }
function Actions({ onEdit, onDelete }) { return <td className="px-6 py-4"><div className="flex gap-2"><button onClick={onEdit} className="rounded-lg p-2 text-brand-600 hover:bg-cyan-50"><Icon name="edit" className="h-4 w-4" /></button><button onClick={onDelete} className="rounded-lg p-2 text-rose-500 hover:bg-rose-50"><Icon name="trash" className="h-4 w-4" /></button></div></td> }
function ManagerTable({ headers, rows, render, empty }) { return <div className="overflow-hidden rounded-2xl border border-slate-100 bg-white shadow-sm">{rows.length ? <div className="overflow-x-auto"><table className="w-full min-w-[650px] text-left text-sm"><thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500"><tr>{headers.map((header) => <th key={header} className="px-6 py-4 font-semibold">{header}</th>)}</tr></thead><tbody>{rows.map((row) => <tr key={row.id} className="border-t border-slate-100 text-slate-600">{render(row)}</tr>)}</tbody></table></div> : <Empty title={empty} text="Use the button above to create one." />}</div> }
function Empty({ title, text }) { return <div className="rounded-2xl bg-white px-6 py-14 text-center shadow-sm"><div className="mx-auto grid h-12 w-12 place-items-center rounded-full bg-cyan-50 text-brand-600"><Icon name="calendar" /></div><h3 className="mt-4 font-bold text-brand-950">{title}</h3><p className="mx-auto mt-1 max-w-sm text-sm text-slate-500">{text}</p></div> }

function Modal({ modal, semester, onClose, onSave }) {
  const type = typeof modal === 'string' ? modal : modal.type
  const editing = typeof modal === 'object' && modal.data?.id
  const [form, setForm] = useState(typeof modal === 'object' ? { ...modal.data } : type === 'lecturer' ? { lecturer_id: '', name: '', is_all_week: true, available_days: [] } : type === 'class' ? { name: '', code: '', shift: 'Morning' } : { name: '', code: '' })
  const change = (key, value) => setForm((current) => ({ ...current, [key]: value }))
  const submit = (event) => { event.preventDefault(); if (type === 'subject') { const theory = Number(form.theory_hours); const lab = Number(form.lab_hours); return onSave('subjects', { semester_id: semester.id, code: form.code, name: form.name, theory_hours: theory, lab_hours: lab, total_hours: theory + lab }, form.id) } onSave(type === 'semester' ? 'semesters' : `${type}s`, form, form.id) }
  const title = `${editing ? 'Edit' : 'Add'} ${type === 'semester' ? 'Semester' : type === 'subject' ? 'Subject' : type === 'lecturer' ? 'Lecturer' : 'Class'}`
  return <div className="fixed inset-0 z-20 grid place-items-center bg-brand-950/45 p-4"><form onSubmit={submit} className="w-full max-w-lg rounded-2xl bg-white p-6 shadow-2xl"><div className="mb-6 flex items-center justify-between"><h2 className="text-xl font-bold text-brand-950">{title}</h2><button type="button" onClick={onClose} className="text-2xl text-slate-400">×</button></div><div className="space-y-4">{type === 'semester' && <><Field label="Semester Name" value={form.name} onChange={(v) => change('name', v)} placeholder="Semester 6 - Spring 2026" /><Field label="Semester Code" value={form.code} onChange={(v) => change('code', v)} placeholder="SEM-06" /></>}{type === 'subject' && <><Field label="Subject Code" value={form.code} onChange={(v) => change('code', v)} placeholder="CS302" /><Field label="Subject Name" value={form.name} onChange={(v) => change('name', v)} placeholder="C# Programming II" /><div className="grid grid-cols-2 gap-4"><Field label="Theory Hours" type="number" min="0" value={form.theory_hours} onChange={(v) => change('theory_hours', v)} /><Field label="Lab Hours" type="number" min="0" value={form.lab_hours} onChange={(v) => change('lab_hours', v)} /></div></>}{type === 'lecturer' && <><Field label="Lecturer ID" value={form.lecturer_id} onChange={(v) => change('lecturer_id', v)} placeholder="LEC-101" /><Field label="Full Name" value={form.name} onChange={(v) => change('name', v)} placeholder="Yahye Ali Isse" /><label className="flex cursor-pointer items-center justify-between rounded-xl border border-slate-200 p-4"><span><b className="block text-sm text-brand-950">Available All Week</b><span className="text-xs text-slate-500">Includes all faculty teaching days</span></span><input checked={form.is_all_week} onChange={(e) => change('is_all_week', e.target.checked)} className="h-5 w-5 accent-brand-600" type="checkbox" /></label>{!form.is_all_week && <div><p className="mb-2 text-sm font-semibold text-brand-950">Available days</p><div className="flex flex-wrap gap-2">{days.map((day) => <label key={day} className={`cursor-pointer rounded-lg border px-3 py-2 text-xs font-medium ${form.available_days.includes(day) ? 'border-brand-600 bg-cyan-50 text-brand-700' : 'border-slate-200 text-slate-500'}`}><input className="sr-only" type="checkbox" checked={form.available_days.includes(day)} onChange={() => change('available_days', form.available_days.includes(day) ? form.available_days.filter((item) => item !== day) : [...form.available_days, day])} />{day}</label>)}</div></div>}</>}{type === 'class' && <><Field label="Class Name" value={form.name} onChange={(v) => change('name', v)} placeholder="CA235" /><Field label="Class Code" value={form.code} onChange={(v) => change('code', v)} placeholder="CLS-CA235" /><label className="block text-sm font-semibold text-brand-950">Shift<select value={form.shift} onChange={(e) => change('shift', e.target.value)} className="mt-1.5 w-full rounded-xl border border-slate-200 px-3 py-2.5 font-normal text-slate-700 outline-none focus:border-brand-600"><option>Morning</option><option>Afternoon</option></select></label></>}</div><button className="mt-7 w-full rounded-xl bg-brand-600 py-3 font-semibold text-white transition hover:bg-brand-800">{editing ? 'Save Changes' : `Create ${type === 'semester' ? 'Semester' : type === 'subject' ? 'Subject' : type === 'lecturer' ? 'Lecturer' : 'Class'}`}</button></form></div>
}
function Field({ label, value, onChange, placeholder, type = 'text', min }) { return <label className="block text-sm font-semibold text-brand-950">{label}<input required type={type} min={min} value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder} className="mt-1.5 w-full rounded-xl border border-slate-200 px-3 py-2.5 font-normal text-slate-700 outline-none transition placeholder:text-slate-400 focus:border-brand-600 focus:ring-2 focus:ring-brand-600/10" /></label> }

export default App
