import { useOutletContext } from 'react-router-dom'
import { Icon } from '../components/Icon'

export function Dashboard() {
  const { semesters, subjects, lecturers, classes, metrics } = useOutletContext()

  return (
    <>
      <header className="mb-8">
        <p className="text-sm font-medium text-brand-600">University IT Faculty</p>
        <h1 className="mt-1 text-2xl font-bold tracking-tight text-brand-950 sm:text-3xl">Faculty Dashboard</h1>
      </header>

      <section className="mb-8 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {metrics.map(([label, amount, icon, color]) => (
          <div key={label} className="rounded-2xl border border-slate-100 bg-white p-5 shadow-sm">
            <div className="flex items-center justify-between">
              <div className={`grid h-11 w-11 place-items-center rounded-xl text-white ${color}`}>
                <Icon name={icon} />
              </div>
              <span className="text-3xl font-bold text-brand-950">{amount}</span>
            </div>
            <p className="mt-4 text-sm font-medium text-slate-500">{label}</p>
          </div>
        ))}
      </section>

      <div className="grid gap-6 lg:grid-cols-2">
        <div className="rounded-2xl border border-slate-100 bg-white p-6 shadow-sm">
          <h2 className="mb-4 flex items-center gap-2 text-lg font-bold text-brand-950">
            <Icon name="layers" className="h-5 w-5 text-brand-600" /> Recent Semesters
          </h2>
          {semesters.length ? (
            <div className="space-y-3">
              {semesters.slice(0, 4).map(s => (
                <div key={s.id} className="flex items-center justify-between rounded-xl bg-slate-50 p-3">
                  <span className="font-semibold text-brand-950">{s.name}</span>
                  <span className="rounded-lg bg-cyan-100 px-2 py-1 text-xs font-bold text-brand-700">{s.code}</span>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-sm text-slate-500">No semesters added yet.</p>
          )}
        </div>

        <div className="rounded-2xl border border-slate-100 bg-white p-6 shadow-sm">
          <h2 className="mb-4 flex items-center gap-2 text-lg font-bold text-brand-950">
            <Icon name="group" className="h-5 w-5 text-[#ef7f61]" /> Recent Classes
          </h2>
          {classes.length ? (
            <div className="space-y-3">
              {classes.slice(0, 4).map(c => (
                <div key={c.id} className="flex items-center justify-between rounded-xl bg-slate-50 p-3">
                  <span className="font-semibold text-brand-950">{c.name}</span>
                  <span className="text-sm font-medium text-slate-500">Intake {c.intake_year || 2024}</span>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-sm text-slate-500">No classes added yet.</p>
          )}
        </div>
      </div>
    </>
  )
}
