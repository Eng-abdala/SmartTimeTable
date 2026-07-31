import { useOutletContext, useNavigate } from 'react-router-dom'
import { Icon } from '../components/Icon'
import { Empty } from '../components/Empty'

export function Semesters() {
  const { semesters, subjects, setModal } = useOutletContext()
  const navigate = useNavigate()

  return (
    <>
      <header className="mb-8 flex flex-col justify-between gap-4 sm:flex-row sm:items-center">
        <div>
          <p className="text-sm font-medium text-brand-600">University IT Faculty</p>
          <h1 className="mt-1 text-2xl font-bold tracking-tight text-brand-950 sm:text-3xl">Semesters</h1>
        </div>
        <button onClick={() => setModal('semester')} className="inline-flex items-center justify-center gap-2 rounded-xl bg-brand-600 px-4 py-3 text-sm font-semibold text-white shadow-md shadow-brand-600/20 transition hover:bg-brand-800">
          <Icon name="plus" className="h-4 w-4" />Add Semester
        </button>
      </header>

      {!semesters.length ? (
        <Empty title="No semesters yet" text="Create your first semester, then add its subjects from the semester view." />
      ) : (
        <section className="grid gap-5 md:grid-cols-2 xl:grid-cols-3">
          {semesters.map((semester) => { 
            const items = subjects.filter((subject) => subject.semester_id === semester.id)
            const hours = items.reduce((sum, subject) => sum + subject.total_hours, 0)
            return (
              <button onClick={() => navigate(`/semesters/${semester.id}`)} key={semester.id} className="group rounded-2xl border border-slate-100 bg-white p-6 text-left shadow-sm transition hover:-translate-y-1 hover:border-brand-500/30 hover:shadow-lg">
                <div className="flex items-start justify-between">
                  <span className="text-brand-500 transition group-hover:translate-x-1"><Icon name="arrow" /></span>
                </div>
                <h2 className="mt-4 text-xl font-bold text-brand-950">{semester.name}</h2>
                <div className="mt-5 flex border-t border-slate-100 pt-4 text-sm">
                  <span className="flex-1 text-slate-500"><b className="text-brand-950">{items.length}</b> subjects</span>
                  <span className="text-slate-500"><b className="text-brand-950">{hours}</b> total hrs</span>
                </div>
              </button>
            )
          })}
        </section>
      )}
    </>
  )
}
