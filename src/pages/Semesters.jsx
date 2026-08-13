import { useOutletContext, useNavigate } from 'react-router-dom'
import { Icon } from '../components/Icon'
import { Empty } from '../components/Empty'

const DEPARTMENTS = [
  { code: 'CA', label: 'Computer Application' },
  { code: 'CN', label: 'Computer Networking' },
  { code: 'CM', label: 'Computer Multimedia' },
]

const DEPT_COLORS = {
  CA: { bg: 'bg-blue-600',   light: 'bg-blue-50',   border: 'border-blue-200',   text: 'text-blue-700',   badge: 'bg-blue-100 text-blue-700'   },
  CN: { bg: 'bg-emerald-600', light: 'bg-emerald-50', border: 'border-emerald-200', text: 'text-emerald-700', badge: 'bg-emerald-100 text-emerald-700' },
  CM: { bg: 'bg-violet-600',  light: 'bg-violet-50',  border: 'border-violet-200',  text: 'text-violet-700',  badge: 'bg-violet-100 text-violet-700'  },
}

function sortByNumber(list) {
  return [...list].sort((a, b) => {
    const num = name => { const m = name?.match(/\d+/); return m ? parseInt(m[0], 10) : 999 }
    return num(a.name) - num(b.name) || (a.name || '').localeCompare(b.name || '')
  })
}

function SemesterCard({ semester, subjects, navigate }) {
  const items = subjects.filter(s => s.semester_id === semester.id)
  const hours = items.reduce((sum, s) => sum + s.total_hours, 0)
  return (
    <button
      onClick={() => navigate(`/semesters/${semester.id}`)}
      className="group rounded-2xl border border-slate-100 bg-white p-5 text-left shadow-sm transition hover:-translate-y-1 hover:border-brand-500/30 hover:shadow-lg"
    >
      <span className="text-brand-500 transition group-hover:translate-x-1 block"><Icon name="arrow" /></span>
      <h3 className="mt-3 text-lg font-bold text-brand-950">{semester.name}</h3>
      <div className="mt-4 flex border-t border-slate-100 pt-3 text-sm">
        <span className="flex-1 text-slate-500"><b className="text-brand-950">{items.length}</b> subjects</span>
        <span className="text-slate-500"><b className="text-brand-950">{hours}</b> hrs</span>
      </div>
    </button>
  )
}

export function Semesters() {
  const { semesters, subjects, setModal } = useOutletContext()
  const navigate = useNavigate()

  // Split into general (1–3) and departmental (4+)
  const generalSemesters = sortByNumber(semesters.filter(s => {
    const m = s.name?.match(/\d+/)
    return !m || parseInt(m[0], 10) <= 3
  }))

  const deptSemesters = (dept) => sortByNumber(
    semesters.filter(s => s.department === dept)
  )

  return (
    <>
      <header className="mb-8 flex flex-col justify-between gap-4 sm:flex-row sm:items-center">
        <div>
          <p className="text-sm font-medium text-brand-600">University IT Faculty</p>
          <h1 className="mt-1 text-2xl font-bold tracking-tight text-brand-950 sm:text-3xl">Semesters</h1>
        </div>
      </header>

      {/* ── General Semesters (1–3) ───────────────────────────── */}
      <section className="mb-10">
        <div className="mb-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-slate-800 text-white">
              <Icon name="layers" className="h-4 w-4" />
            </span>
            <div>
              <h2 className="text-base font-bold text-brand-950">General Semesters</h2>
              <p className="text-xs text-slate-500">Semester 1 · 2 · 3 — no department required</p>
            </div>
          </div>
          <button
            onClick={() => setModal('semester')}
            className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-brand-700 shadow-sm transition hover:bg-brand-50 hover:border-brand-300"
          >
            <Icon name="plus" className="h-3.5 w-3.5" /> Add Semester
          </button>
        </div>

        {generalSemesters.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-slate-200 bg-slate-50 p-8 text-center text-sm text-slate-400">
            No general semesters yet. Click "Add Semester" to create Semester 1, 2, or 3.
          </div>
        ) : (
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
            {generalSemesters.map(s => (
              <SemesterCard key={s.id} semester={s} subjects={subjects} navigate={navigate} />
            ))}
          </div>
        )}
      </section>

      {/* ── Department Sections (4+) ──────────────────────────── */}
      <div className="space-y-8">
        {DEPARTMENTS.map(dept => {
          const color = DEPT_COLORS[dept.code]
          const list = deptSemesters(dept.code)
          return (
            <section key={dept.code} className={`rounded-2xl border ${color.border} ${color.light} p-6`}>
              <div className="mb-5 flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <span className={`flex h-9 w-9 items-center justify-center rounded-xl ${color.bg} text-white font-bold text-sm`}>
                    {dept.code}
                  </span>
                  <div>
                    <h2 className={`text-base font-bold ${color.text}`}>{dept.label}</h2>
                    <p className="text-xs text-slate-500">Semester 4 and above</p>
                  </div>
                </div>
                <button
                  onClick={() => setModal({ type: 'semester', prefillDepartment: dept.code })}
                  className={`inline-flex items-center gap-1.5 rounded-xl ${color.bg} px-3 py-2 text-sm font-semibold text-white shadow-sm transition hover:opacity-90`}
                >
                  <Icon name="plus" className="h-3.5 w-3.5" /> Add Semester
                </button>
              </div>

              {list.length === 0 ? (
                <div className="rounded-xl border border-dashed border-current/20 bg-white/60 p-6 text-center text-sm text-slate-400">
                  No semesters yet for {dept.label}. Click "Add Semester" above.
                </div>
              ) : (
                <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
                  {list.map(s => (
                    <SemesterCard key={s.id} semester={s} subjects={subjects} navigate={navigate} />
                  ))}
                </div>
              )}
            </section>
          )
        })}
      </div>
    </>
  )
}
