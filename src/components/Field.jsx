export function Field({ label, value, onChange, placeholder, type = 'text', min, max, minLength, maxLength, pattern, required = true }) { 
  return (
    <label className="block text-sm font-semibold text-brand-950">
      {label}
      <input 
        required={required}
        type={type} 
        min={min} 
        max={max}
        minLength={minLength}
        maxLength={maxLength}
        pattern={pattern}
        value={value} 
        onChange={(e) => onChange(e.target.value)} 
        placeholder={placeholder} 
        className="mt-1.5 w-full rounded-xl border border-slate-200 px-3 py-2.5 font-normal text-slate-700 outline-none transition placeholder:text-slate-400 focus:border-brand-600 focus:ring-2 focus:ring-brand-600/10" 
      />
    </label>
  )
}
