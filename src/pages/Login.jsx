import { useState } from 'react'
import { supabase } from '../lib/supabase'
import facultyLogo from '../assets/logo.png'
import { Icon } from '../components/Icon'

export function Login() {
  const [hodId, setHodId] = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  const handleSubmit = async event => {
    event.preventDefault()
    setError('')
    setLoading(true)
    const normalizedId = hodId.trim().toLowerCase()
    if (!/^[a-z0-9._-]{3,32}$/.test(normalizedId)) {
      setLoading(false)
      setError('HOD ID must use 3-32 letters, numbers, dots, hyphens, or underscores.')
      return
    }
    const { error: signInError } = await supabase.auth.signInWithPassword({ email: `${normalizedId}@hod.local`, password })
    setLoading(false)
    if (signInError) setError('Invalid HOD ID or password. Please try again.')
  }

  return (
    <main className="grid min-h-screen place-items-center bg-[#f5f8fa] p-5">
      <section className="w-full max-w-md overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-2xl shadow-brand-950/10">
        <div className="bg-gradient-to-br from-brand-950 via-brand-800 to-indigo-900 px-8 py-9 text-center text-white">
          <div className="mx-auto mb-4 grid h-16 w-16 place-items-center overflow-hidden rounded-2xl bg-white p-1 shadow-lg"><img src={facultyLogo} alt="Faculty logo" className="h-full w-full rounded-xl object-cover" /></div>
          <p className="text-sm font-medium text-cyan-100">TimeTable Generator</p>
          <h1 className="mt-1 text-2xl font-bold">HOD Portal</h1>
          <p className="mt-2 text-sm text-cyan-100/80">Sign in to manage the timetable system.</p>
        </div>
        <form onSubmit={handleSubmit} className="space-y-5 p-8">
          <label className="block text-sm font-bold text-brand-950">username
            <input type="text" required autoComplete="username" value={hodId} onChange={event => setHodId(event.target.value)} placeholder="e.g. hoojo" className="mt-2 w-full rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm outline-none transition focus:border-brand-500 focus:bg-white focus:ring-4 focus:ring-brand-500/10" />
          </label>
          <label className="block text-sm font-bold text-brand-950">Password
            <input type="password" required autoComplete="current-password" value={password} onChange={event => setPassword(event.target.value)} placeholder="Enter your password" className="mt-2 w-full rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm outline-none transition focus:border-brand-500 focus:bg-white focus:ring-4 focus:ring-brand-500/10" />
          </label>
          {error && <p className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm font-medium text-rose-700">{error}</p>}
          <button disabled={loading} className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-brand-600 py-3.5 text-sm font-bold text-white shadow-lg shadow-brand-600/20 transition hover:bg-brand-800 disabled:cursor-not-allowed disabled:opacity-60"><Icon name="user" className="h-4 w-4" />{loading ? 'Signing in…' : 'Sign In'}</button>
        </form>
      </section>
    </main>
  )
}
