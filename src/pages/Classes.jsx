import { useOutletContext } from 'react-router-dom'
import { Icon } from '../components/Icon'
import { ManagerTable } from '../components/ManagerTable'
import { useMemo, useState } from 'react'
import { Empty } from '../components/Empty'

export function Classes() {
  const { classes, setModal, remove } = useOutletContext()
  const [selectedYear, setSelectedYear] = useState(null)
  
  // Group classes by intake_year
  const groupedClasses = useMemo(() => {
    const groups = {}
    classes.forEach(c => {
      const year = c.intake_year || 2024
      if (!groups[year]) groups[year] = []
      groups[year].push(c)
    })
    
    // Sort years descending (e.g. 2026, 2025...)
    return Object.keys(groups)
      .sort((a, b) => b - a)
      .map(year => ({
        year,
        items: groups[year]
      }))
  }, [classes])

  if (selectedYear) {
    const yearData = groupedClasses.find(g => g.year === String(selectedYear))
    const items = yearData ? yearData.items : []

    return (
      <section>
        <header className="mb-8 flex flex-col justify-between gap-4 sm:flex-row sm:items-center">
          <div>
            <p className="text-sm font-medium text-brand-600">University IT Faculty</p>
            <h1 className="mt-1 text-2xl font-bold tracking-tight text-brand-950 sm:text-3xl">Class of {selectedYear}</h1>
          </div>
        </header>
        
        <div className="mb-5 flex flex-col justify-between gap-3 sm:flex-row sm:items-center">
          <button onClick={() => setSelectedYear(null)} className="inline-flex items-center gap-2 text-sm font-semibold text-brand-600 hover:text-brand-800">
            <Icon name="back" className="h-4 w-4" />All Years
          </button>
          <button onClick={() => setModal('class')} className="inline-flex items-center gap-2 rounded-xl bg-brand-600 px-4 py-2.5 text-sm font-semibold text-white">
            <Icon name="plus" className="h-4 w-4" />Add Class
          </button>
        </div>

        <ManagerTable 
          headers={['Class Name', 'Class Code', 'Shift', 'Actions']} 
          rows={items} 
          empty={`No classes registered for ${selectedYear}.`} 
          render={(item) => (
            <>
              <td className="px-6 py-4 font-medium text-brand-950">{item.name}</td>
              <td className="px-6 py-4 font-semibold text-brand-600">{item.code}</td>
              <td className="px-6 py-4">
                <span className="rounded-full bg-amber-50 px-3 py-1 text-xs font-semibold text-amber-700">{item.shift}</span>
              </td>
              <td className="px-6 py-4">
                <div className="flex gap-2">
                  <button onClick={() => setModal({ type: 'class', data: item })} className="rounded-lg p-2 text-brand-600 hover:bg-cyan-50"><Icon name="edit" className="h-4 w-4" /></button>
                  <button onClick={() => remove('classes', item.id)} className="rounded-lg p-2 text-rose-500 hover:bg-rose-50"><Icon name="trash" className="h-4 w-4" /></button>
                </div>
              </td>
            </>
          )} 
        />
      </section>
    )
  }

  return (
    <>
      <header className="mb-8 flex flex-col justify-between gap-4 sm:flex-row sm:items-center">
        <div>
          <p className="text-sm font-medium text-brand-600">University IT Faculty</p>
          <h1 className="mt-1 text-2xl font-bold tracking-tight text-brand-950 sm:text-3xl">Classes by Year</h1>
        </div>
        <button onClick={() => setModal('class')} className="inline-flex items-center justify-center gap-2 rounded-xl bg-brand-600 px-4 py-3 text-sm font-semibold text-white shadow-md shadow-brand-600/20 transition hover:bg-brand-800">
          <Icon name="plus" className="h-4 w-4" />Add Class
        </button>
      </header>

      {!groupedClasses.length ? (
        <Empty title="No classes registered yet" text="Use the button above to create one." />
      ) : (
        <section className="grid gap-5 md:grid-cols-2 xl:grid-cols-4">
          {groupedClasses.map(({ year, items }) => (
            <button 
              onClick={() => setSelectedYear(year)} 
              key={year} 
              className="group rounded-2xl border border-slate-100 bg-white p-6 text-left shadow-sm transition hover:-translate-y-1 hover:border-brand-500/30 hover:shadow-lg"
            >
              <div className="flex items-start justify-between">
                <span className="rounded-lg bg-cyan-50 px-3 py-1 text-xs font-bold text-brand-600">{year}</span>
                <span className="text-brand-500 transition group-hover:translate-x-1"><Icon name="arrow" /></span>
              </div>
              <h2 className="mt-6 text-xl font-bold text-brand-950">Class of {year}</h2>
              <div className="mt-5 flex border-t border-slate-100 pt-4 text-sm">
                <span className="flex-1 text-slate-500"><b className="text-brand-950">{items.length}</b> classes registered</span>
              </div>
            </button>
          ))}
        </section>
      )}
    </>
  )
}
