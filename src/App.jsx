import { BrowserRouter, Routes, Route } from 'react-router-dom'
import { AppLayout } from './layouts/AppLayout'
import { Dashboard } from './pages/Dashboard'
import { Semesters } from './pages/Semesters'
import { SemesterDetail } from './pages/SemesterDetail'
import { Lecturers } from './pages/Lecturers'
import { Classes } from './pages/Classes'
import { Timetable } from './pages/Timetable'
import { Schedule } from './pages/Schedule'

function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<AppLayout />}>
          <Route index element={<Dashboard />} />
          <Route path="semesters" element={<Semesters />} />
          <Route path="semesters/:id" element={<SemesterDetail />} />
          <Route path="lecturers" element={<Lecturers />} />
          <Route path="classes" element={<Classes />} />
          <Route path="timetable" element={<Timetable />} />
          <Route path="schedule" element={<Schedule />} />
        </Route>
      </Routes>
    </BrowserRouter>
  )
}

export default App
