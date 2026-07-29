import { useOutletContext, useParams, useNavigate } from 'react-router-dom'
import { Icon } from '../components/Icon'
import { Empty } from '../components/Empty'
import { useMemo } from 'react'
import { supabase } from '../lib/supabase'

const blankSubject = { code: '', name: '', theory_hours: 0, lab_hours: 0 }

export function SemesterDetail() {
  const { code } = useParams()
  const navigate = useNavigate()
  const { semesters, subjects, lecturers, setModal, remove, loadData, setNotice } = useOutletContext()
  
  const semester = useMemo(() => semesters.find(s => s.code === code), [semesters, code])
  const semesterSubjects = useMemo(() => subjects.filter(s => s.semester_id === semester?.id), [subjects, semester])

  if (!semester) return <div className="p-8 text-center text-slate-500">Semester not found</div>

  const assignLecturer = async (subjectId, lecturerId) => {
    const { error } = await supabase
      .from('subjects')
      .update({ lecturer_id: lecturerId || null })
      .eq('id', subjectId)
    if (error) setNotice(error.message)
    else await loadData()
  }

  return (
    <section>
      <header className="mb-8 flex flex-col justify-between gap-4 sm:flex-row sm:items-center">
        <div>
          <p className="text-sm font-medium text-brand-600">University IT Faculty</p>
          <h1 className="mt-1 text-2xl font-bold tracking-tight text-brand-950 sm:text-3xl">{semester.name}</h1>
        </div>
      </header>
      
      <div className="mb-5 flex flex-col justify-between gap-3 sm:flex-row sm:items-center">
        <button onClick={() => navigate('/semesters')} className="inline-flex items-center gap-2 text-sm font-semibold text-brand-600 hover:text-brand-800">
          <Icon name="back" className="h-4 w-4" />All Semesters
        </button>
        <button onClick={() => setModal({ type: 'subject', data: blankSubject, semester: semester })} className="inline-flex items-center gap-2 rounded-xl bg-brand-600 px-4 py-2.5 text-sm font-semibold text-white">
          <Icon name="plus" className="h-4 w-4" />Add Subject
        </button>
      </div>
      
      <div className="overflow-hidden rounded-2xl border border-slate-100 bg-white shadow-sm">
        <div className="border-b border-slate-100 px-6 py-5">
          <p className="text-sm text-slate-500">Subjects & Lecturers assigned to <b className="text-brand-950">{semester.code}</b></p>
        </div>
        
        {semesterSubjects.length ? (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[800px] text-left text-sm">
              <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
                <tr>
                  {['Subject Code', 'Subject Name', 'Theory', 'Lab', 'Total', 'Assigned Lecturer', 'Actions'].map((title) => (
                    <th key={title} className="px-6 py-4 font-semibold">{title}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {semesterSubjects.map((subject) => {
                  const assignedLecturer = lecturers.find(l => l.id === subject.lecturer_id)
                  return (
                    <tr key={subject.id} className="border-t border-slate-100 text-slate-600">
                      <td className="px-6 py-4 font-semibold text-brand-600">{subject.code}</td>
                      <td className="px-6 py-4 font-medium text-brand-950">{subject.name}</td>
                      <td className="px-6 py-4">{subject.theory_hours}h</td>
                      <td className="px-6 py-4">{subject.lab_hours > 0 ? `${subject.lab_hours}h` : <span className="text-slate-400">—</span>}</td>
                      <td className="px-6 py-4 font-bold text-brand-950">{subject.total_hours}h</td>
                      <td className="px-6 py-4 min-w-[200px]">
                        <select
                          value={subject.lecturer_id || ''}
                          onChange={(e) => assignLecturer(subject.id, e.target.value)}
                          className={`w-full rounded-xl border px-3 py-2 text-sm outline-none transition focus:border-brand-600 ${
                            assignedLecturer 
                              ? 'border-brand-200 bg-cyan-50 font-semibold text-brand-800' 
                              : 'border-slate-200 text-slate-400'
                          }`}
                        >
                          <option value="">— Unassigned —</option>
                          {lecturers.map(l => (
                            <option key={l.id} value={l.id}>{l.name}</option>
                          ))}
                        </select>
                      </td>
                      <td className="px-6 py-4">
                        <div className="flex gap-2">
                          <button onClick={() => setModal({ type: 'subject', data: subject, semester: semester })} className="rounded-lg p-2 text-brand-600 hover:bg-cyan-50" aria-label="Edit subject">
                            <Icon name="edit" className="h-4 w-4" />
                          </button>
                          <button onClick={() => remove('subjects', subject.id)} className="rounded-lg p-2 text-rose-500 hover:bg-rose-50" aria-label="Delete subject">
                            <Icon name="trash" className="h-4 w-4" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        ) : (
          <Empty title="No subjects in this semester" text="Use Add Subject to start building this semester's curriculum." />
        )}
      </div>
    </section>
  )
}
