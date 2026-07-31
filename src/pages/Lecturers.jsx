import { useOutletContext } from 'react-router-dom'
import { Icon } from '../components/Icon'
import { ManagerTable } from '../components/ManagerTable'

export function Lecturers() {
  const { lecturers, setModal, remove, getLecturerTaughtSubjects } = useOutletContext()
  return (
    <>
      <header className="mb-8 flex flex-col justify-between gap-4 sm:flex-row sm:items-center">
        <div>
          <p className="text-sm font-medium text-brand-600">University IT Faculty</p>
          <h1 className="mt-1 text-2xl font-bold tracking-tight text-brand-950 sm:text-3xl">Lecturers</h1>
        </div>
        <button onClick={() => setModal('lecturer')} className="inline-flex items-center justify-center gap-2 rounded-xl bg-brand-600 px-4 py-3 text-sm font-semibold text-white shadow-md shadow-brand-600/20 transition hover:bg-brand-800">
          <Icon name="plus" className="h-4 w-4" />Add Lecturer
        </button>
      </header>
      <ManagerTable 
        headers={['Lecturer ID', 'Name', 'Availability', 'Actions']} 
        rows={lecturers} 
        empty="No lecturers registered yet." 
        render={(person) => {
          const taught = getLecturerTaughtSubjects ? getLecturerTaughtSubjects(person.id) : (person.taught_subjects || [])
          return (
            <>
              <td className="px-6 py-4 font-semibold text-brand-600">{person.lecturer_id}</td>
              <td className="px-6 py-4 font-medium text-brand-950">{person.name}</td>

              <td className="px-6 py-4">
                <span className="rounded-full bg-cyan-50 px-3 py-1 text-xs font-semibold text-brand-700">
                  {person.is_all_week ? 'Available all week' : person.available_days.join(', ')}
                </span>
              </td>
              <td className="px-6 py-4">
                <div className="flex gap-2">
                  <button onClick={() => setModal({ type: 'lecturer', data: person })} className="rounded-lg p-2 text-brand-600 hover:bg-cyan-50"><Icon name="edit" className="h-4 w-4" /></button>
                  <button onClick={() => remove('lecturers', person.id)} className="rounded-lg p-2 text-rose-500 hover:bg-rose-50"><Icon name="trash" className="h-4 w-4" /></button>
                </div>
              </td>
            </>
          )
        }} 
      />
    </>
  )
}
