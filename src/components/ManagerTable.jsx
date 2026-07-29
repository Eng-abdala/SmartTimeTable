import { Icon } from './Icon'
import { Empty } from './Empty'

export function Actions({ onEdit, onDelete }) { 
  return (
    <td className="px-6 py-4">
      <div className="flex gap-2">
        <button onClick={onEdit} className="rounded-lg p-2 text-brand-600 hover:bg-cyan-50">
          <Icon name="edit" className="h-4 w-4" />
        </button>
        <button onClick={onDelete} className="rounded-lg p-2 text-rose-500 hover:bg-rose-50">
          <Icon name="trash" className="h-4 w-4" />
        </button>
      </div>
    </td>
  )
}

export function ManagerTable({ headers, rows, render, empty }) { 
  return (
    <div className="overflow-hidden rounded-2xl border border-slate-100 bg-white shadow-sm">
      {rows.length ? (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[650px] text-left text-sm">
            <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
              <tr>
                {headers.map((header) => (
                  <th key={header} className="px-6 py-4 font-semibold">{header}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.id} className="border-t border-slate-100 text-slate-600">
                  {render(row)}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <Empty title={empty} text="Use the button above to create one." />
      )}
    </div>
  ) 
}
