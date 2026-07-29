import { Icon } from './Icon'

export function Empty({ title, text }) { 
  return (
    <div className="rounded-2xl bg-white px-6 py-14 text-center shadow-sm">
      <div className="mx-auto grid h-12 w-12 place-items-center rounded-full bg-cyan-50 text-brand-600">
        <Icon name="calendar" />
      </div>
      <h3 className="mt-4 font-bold text-brand-950">{title}</h3>
      <p className="mx-auto mt-1 max-w-sm text-sm text-slate-500">{text}</p>
    </div>
  ) 
}
