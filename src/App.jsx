import { useEffect, useState } from 'react'
import { BrowserRouter, Routes, Route } from 'react-router-dom'
import { AppLayout } from './layouts/AppLayout'
import { Dashboard } from './pages/Dashboard'
import { Semesters } from './pages/Semesters'
import { SemesterDetail } from './pages/SemesterDetail'
import { Lecturers } from './pages/Lecturers'
import { Classes } from './pages/Classes'
import { Timetable } from './pages/Timetable'
import { Schedule } from './pages/Schedule'
import { Reports } from './pages/Reports'
import { Login } from './pages/Login'
import { supabase } from './lib/supabase'

function AuthenticatedApp() {
  const [session, setSession] = useState(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => { setSession(data.session); setLoading(false) })
    const { data: listener } = supabase.auth.onAuthStateChange((_event, nextSession) => setSession(nextSession))
    return () => listener.subscription.unsubscribe()
  }, [])

  if (loading) return <div className="grid min-h-screen place-items-center bg-[#f5f8fa] text-sm font-semibold text-brand-700">Loading secure portal…</div>
  if (!session) return <Login />
  return <AppRoutes />
}

function AppRoutes() {
  return (
    <Routes>
      <Route path="/" element={<AppLayout />}>
        <Route index element={<Dashboard />} />
        <Route path="semesters" element={<Semesters />} />
        <Route path="semesters/:id" element={<SemesterDetail />} />
        <Route path="lecturers" element={<Lecturers />} />
        <Route path="classes" element={<Classes />} />
        <Route path="timetable" element={<Timetable />} />
        <Route path="schedule" element={<Schedule />} />
        <Route path="reports" element={<Reports />} />
      </Route>
    </Routes>
  )
}

function App() {
  return (
    <BrowserRouter>
      <AuthenticatedApp />
    </BrowserRouter>
  )
}

export default App
