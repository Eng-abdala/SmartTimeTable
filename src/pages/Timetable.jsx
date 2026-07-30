import React, { useState, useMemo, useRef } from 'react'
import { useOutletContext } from 'react-router-dom'
import { Icon } from '../components/Icon'
import { Empty } from '../components/Empty'
import html2pdf from 'html2pdf.js'

const YEARS = [2026, 2025, 2024, 2023]
const DAYS = ['Saturday', 'Sunday', 'Monday', 'Tuesday', 'Wednesday']

const SHIFT_SLOTS = {
  Morning: [
    { id: 1, label: 'Period 1', time: '8:00 AM – 9:30 AM' },
    { id: 2, label: 'Period 2', time: '9:30 AM – 11:00 AM' },
    { id: 'break', label: '☕ Break', time: '11:00 – 11:30 AM', isBreak: true },
    { id: 3, label: 'Period 3', time: '11:30 AM – 1:00 PM' },
  ],
  Afternoon: [
    { id: 1, label: 'Period 1', time: '1:00 PM – 2:30 PM' },
    { id: 2, label: 'Period 2', time: '2:30 PM – 3:30 PM' },
    { id: 'break', label: '☕ Break', time: '3:30 PM – 4:00 PM', isBreak: true },
    { id: 3, label: 'Period 3', time: '4:00 PM – 5:00 PM' },
  ],
}

// Color palette for subjects
const COLORS = [
  'bg-blue-50 border-blue-200 text-blue-900',
  'bg-purple-50 border-purple-200 text-purple-900',
  'bg-emerald-50 border-emerald-200 text-emerald-900',
  'bg-amber-50 border-amber-200 text-amber-900',
  'bg-rose-50 border-rose-200 text-rose-900',
  'bg-cyan-50 border-cyan-200 text-cyan-900',
  'bg-orange-50 border-orange-200 text-orange-900',
  'bg-indigo-50 border-indigo-200 text-indigo-900',
]

function generateTimetable(semesterSubjects, lecturers, shift, selectedClassId, getRandomLecturerForClass, getSubjectLecturers) {
  // ── Step 1: Assign lecturers to subjects for this specific class ──────────
  // Constraint: one lecturer → one subject per class (no lecturer teaches two subjects to the same class)
  const usedLecturerIds = new Set()        // lecturers already committed to a subject for this class
  const subjectLecturerMap = new Map()     // subjectId → lecturer object

  for (const sub of semesterSubjects) {
    // Get all qualified lecturers for this subject
    const qualifiedForSubject = getSubjectLecturers ? getSubjectLecturers(sub.id) : []

    // Try the preferred random pick first, then cycle through qualified, then fall back to anyone
    const preferred = getRandomLecturerForClass ? getRandomLecturerForClass(sub.id, selectedClassId) : null
    const candidates = preferred
      ? [preferred, ...qualifiedForSubject.filter(l => l.id !== preferred.id), ...lecturers.filter(l => !qualifiedForSubject.some(q => q.id === l.id) && l.id !== preferred?.id)]
      : [...qualifiedForSubject, ...lecturers.filter(l => !qualifiedForSubject.some(q => q.id === l.id))]

    // Pick the first candidate not already used for another subject in this class
    const assigned = candidates.find(l => l && !usedLecturerIds.has(l.id)) || null
    if (assigned) usedLecturerIds.add(assigned.id)
    subjectLecturerMap.set(sub.id, assigned)
  }

  // ── Step 2: Build blocks from subjects ───────────────────────────────────
  const blocks = []
  semesterSubjects.forEach(sub => {
    const lecturer = subjectLecturerMap.get(sub.id)

    // Group into 2-period and 1-period blocks (standard timetable chunking)
    let t = sub.theory_hours
    while (t > 0) {
      let size = t >= 2 ? 2 : 1
      blocks.push({ subject: sub, type: 'Theory', lecturer, size })
      t -= size
    }
    let l = sub.lab_hours
    while (l > 0) {
      let size = l >= 2 ? 2 : 1
      blocks.push({ subject: sub, type: 'Lab', lecturer, size })
      l -= size
    }
  })

  // ── Step 3: Spread blocks across days ────────────────────────────────────
  const timetable = {}
  DAYS.forEach(d => { timetable[d] = [] })
  const daySlotCount = { Saturday: 0, Sunday: 0, Monday: 0, Tuesday: 0, Wednesday: 0 }

  const totalPeriods = blocks.reduce((sum, b) => sum + b.size, 0)
  const baseMax = Math.ceil(totalPeriods / 5)

  const getMaxSlots = (day) => {
    let m = Math.max(baseMax, 4)
    if (shift === 'Morning' && (day === 'Tuesday' || day === 'Wednesday')) m = Math.max(m, 5)
    return m
  }

  // Simple round-robin to spread blocks evenly across the week
  let dayIdx = 0
  for (const block of blocks) {
    let placed = false
    const startDayIdx = dayIdx

    do {
      const day = DAYS[dayIdx]
      if (daySlotCount[day] + block.size <= getMaxSlots(day)) {
        for (let i = 0; i < block.size; i++) {
          timetable[day].push({
            slotIndex: daySlotCount[day],
            subject: block.subject,
            type: block.type,
            lecturer: block.lecturer
          })
          daySlotCount[day]++
        }
        placed = true
        dayIdx = (dayIdx + 1) % DAYS.length
        break
      }
      dayIdx = (dayIdx + 1) % DAYS.length
    } while (dayIdx !== startDayIdx)

    // Fallback: dump wherever there's space
    if (!placed) {
      for (let i = 0; i < block.size; i++) {
        for (const day of DAYS) {
          if (daySlotCount[day] < getMaxSlots(day)) {
            timetable[day].push({
              slotIndex: daySlotCount[day],
              subject: block.subject,
              type: block.type,
              lecturer: block.lecturer
            })
            daySlotCount[day]++
            break
          }
        }
      }
    }
  }

  return timetable
}


export function Timetable() {
  const { classes, semesters, subjects, lecturers, getRandomLecturerForClass, getSubjectLecturers } = useOutletContext()

  const [selectedYear, setSelectedYear] = useState(() => localStorage.getItem('tt_year') || '')
  const [selectedSemesterId, setSelectedSemesterId] = useState(() => localStorage.getItem('tt_semester') || '')
  const [selectedClassId, setSelectedClassId] = useState(() => localStorage.getItem('tt_class') || '')
  const [timetable, setTimetable] = useState(() => {
    try { 
      const parsed = JSON.parse(localStorage.getItem('tt_grid') || 'null') 
      if (parsed && parsed['Saturday'] && !Array.isArray(parsed['Saturday'])) {
        localStorage.removeItem('tt_grid')
        return null
      }
      return parsed
    } catch { return null }
  })
  const [generated, setGenerated] = useState(() => {
    try { 
      const parsed = JSON.parse(localStorage.getItem('tt_grid') || 'null') 
      if (parsed && parsed['Saturday'] && !Array.isArray(parsed['Saturday'])) {
        return false
      }
      return !!parsed
    } catch { return false }
  })
  const printRef = useRef()

  // Persist selections to localStorage whenever they change
  const saveYear = (v) => { setSelectedYear(v); localStorage.setItem('tt_year', v) }
  const saveSemester = (v) => { setSelectedSemesterId(v); localStorage.setItem('tt_semester', v) }
  const saveClass = (v) => { setSelectedClassId(v); localStorage.setItem('tt_class', v) }

  // Classes filtered by selected year
  const yearClasses = useMemo(() =>
    classes.filter(c => c.intake_year === Number(selectedYear)),
    [classes, selectedYear]
  )

  // Selected class info
  const selectedClass = useMemo(() =>
    classes.find(c => c.id === selectedClassId),
    [classes, selectedClassId]
  )

  // Selected semester info
  const selectedSemester = useMemo(() =>
    semesters.find(s => s.id === selectedSemesterId),
    [semesters, selectedSemesterId]
  )

  // Subjects for selected semester
  const semesterSubjects = useMemo(() =>
    subjects.filter(s => s.semester_id === selectedSemesterId),
    [subjects, selectedSemesterId]
  )

  const handleGenerate = () => {
    if (!selectedClass || !selectedSemester || !semesterSubjects.length) return
    const grid = generateTimetable(
      semesterSubjects, lecturers, selectedClass.shift,
      selectedClass.id, getRandomLecturerForClass, getSubjectLecturers
    )
    setTimetable(grid)
    setGenerated(true)
    localStorage.setItem('tt_grid', JSON.stringify(grid))
  }

  const handleReset = () => {
    setSelectedYear(''); setSelectedSemesterId(''); setSelectedClassId('')
    setTimetable(null); setGenerated(false)
    localStorage.removeItem('tt_year'); localStorage.removeItem('tt_semester')
    localStorage.removeItem('tt_class'); localStorage.removeItem('tt_grid')
  }

  const handlePrint = () => window.print()

  const handleDownloadPdf = () => {
    const el = printRef.current
    const className = `${selectedClass?.name}_${selectedSemester?.name}_${selectedYear}`.replace(/\s+/g, '_')
    html2pdf()
      .set({
        margin: 10,
        filename: `Timetable_${className}.pdf`,
        image: { type: 'jpeg', quality: 0.98 },
        html2canvas: { scale: 2, useCORS: true },
        jsPDF: { unit: 'mm', format: 'a4', orientation: 'portrait' }, // Using portrait like the PDF sample
      })
      .from(el)
      .save()
  }

  const shift = selectedClass?.shift || 'Morning'
  
  // Calculate total periods for the footer
  let totalPeriods = 0
  if (timetable) {
    DAYS.forEach(day => {
      totalPeriods += timetable[day].length
    })
  }

  return (
    <>
      <style>{`
        @media print {
          body > * { display: none; }
          #print-timetable { display: block !important; }
          #print-timetable { position: fixed; top: 0; left: 0; width: 100%; }
        }
      `}</style>

      <header className="mb-8 flex flex-col justify-between gap-4 sm:flex-row sm:items-center">
        <div>
          <p className="text-sm font-medium text-brand-600">University IT Faculty</p>
          <h1 className="mt-1 text-2xl font-bold tracking-tight text-brand-950 sm:text-3xl">Timetable Generator</h1>
        </div>
        {generated && (
          <div className="flex flex-wrap gap-3">
            <button onClick={handleReset} className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-semibold text-slate-700 shadow-sm hover:bg-slate-50">
              <Icon name="back" className="h-4 w-4" /> New Timetable
            </button>
            <button onClick={handleDownloadPdf} className="inline-flex items-center gap-2 rounded-xl bg-rose-600 px-4 py-2.5 text-sm font-semibold text-white shadow-md hover:bg-rose-700">
              <Icon name="print" className="h-4 w-4" /> Download PDF
            </button>
            <button onClick={handlePrint} className="inline-flex items-center gap-2 rounded-xl bg-brand-600 px-4 py-2.5 text-sm font-semibold text-white shadow-md hover:bg-brand-800">
              <Icon name="print" className="h-4 w-4" /> Print
            </button>
          </div>
        )}
      </header>

      {!generated ? (
        <div className="mx-auto max-w-lg">
          <div className="rounded-2xl border border-slate-100 bg-white p-8 shadow-sm space-y-6">
            <div className="text-center">
              <div className="mx-auto mb-4 grid h-14 w-14 place-items-center rounded-2xl bg-brand-600 text-white shadow-md shadow-brand-600/20">
                <Icon name="wand" className="h-7 w-7" />
              </div>
              <h2 className="text-xl font-bold text-brand-950">Generate a Timetable</h2>
              <p className="mt-1 text-sm text-slate-500">Fill in the steps below then click Generate</p>
            </div>

            {/* Step 1 - Year */}
            <div>
              <label className="block text-sm font-bold text-brand-950 mb-1.5">
                <span className="mr-2 inline-flex h-5 w-5 items-center justify-center rounded-full bg-brand-600 text-xs text-white font-bold">1</span>
                Intake Year
              </label>
              <select
                value={selectedYear}
                onChange={e => { saveYear(e.target.value); saveClass(''); saveSemester('') }}
                className="w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm text-slate-700 outline-none focus:border-brand-600"
              >
                <option value="">— Select Year —</option>
                {YEARS.map(y => <option key={y} value={y}>{y}</option>)}
              </select>
            </div>

            {/* Step 2 - Semester */}
            <div>
              <label className="block text-sm font-bold text-brand-950 mb-1.5">
                <span className="mr-2 inline-flex h-5 w-5 items-center justify-center rounded-full bg-brand-600 text-xs text-white font-bold">2</span>
                Semester
              </label>
              <select
                value={selectedSemesterId}
              onChange={e => saveSemester(e.target.value)}
                disabled={!selectedYear}
                className="w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm text-slate-700 outline-none focus:border-brand-600 disabled:opacity-40"
              >
                <option value="">— Select Semester —</option>
                {semesters.map(s => <option key={s.id} value={s.id}>{s.name} ({s.code})</option>)}
              </select>
            </div>

            {/* Step 3 - Class */}
            <div>
              <label className="block text-sm font-bold text-brand-950 mb-1.5">
                <span className="mr-2 inline-flex h-5 w-5 items-center justify-center rounded-full bg-brand-600 text-xs text-white font-bold">3</span>
                Class
              </label>
              <select
                value={selectedClassId}
                onChange={e => saveClass(e.target.value)}
                disabled={!selectedYear || !selectedSemesterId}
                className="w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm text-slate-700 outline-none focus:border-brand-600 disabled:opacity-40"
              >
                <option value="">— Select Class —</option>
                {yearClasses.map(c => <option key={c.id} value={c.id}>{c.name} ({c.code}) – {c.shift}</option>)}
              </select>
              {selectedYear && yearClasses.length === 0 && (
                <p className="mt-1.5 text-xs text-rose-500">No classes found for intake year {selectedYear}.</p>
              )}
            </div>

            <button
              onClick={handleGenerate}
              disabled={!selectedYear || !selectedSemesterId || !selectedClassId || !semesterSubjects.length}
              className="w-full rounded-xl bg-brand-600 py-3 font-bold text-white shadow-md shadow-brand-600/20 transition hover:bg-brand-800 disabled:opacity-40 disabled:cursor-not-allowed flex items-center justify-center gap-2"
            >
              <Icon name="wand" className="h-5 w-5" />
              Generate Timetable
            </button>
          </div>
        </div>
      ) : (
        <div className="flex justify-center bg-white border border-slate-200 rounded-xl p-8">
          <div ref={printRef} id="print-timetable" className="w-full max-w-4xl bg-white" style={{fontFamily: "'Times New Roman', Times, serif"}}>
            
            {/* Title exact match */}
            <h2 className="text-center text-[22px] font-bold mb-6 text-black">
              Period of {selectedClass?.name} - {selectedSemester?.name}
            </h2>

            {/* The Table */}
            <table className="w-full border-collapse text-[15px] border border-black">
              <thead>
                <tr className="border border-black">
                  <th className="border border-black px-4 py-2 text-center font-bold text-black bg-white w-[30%]">Subject</th>
                  <th className="border border-black px-4 py-2 text-center font-bold text-black bg-white w-[25%]">Time</th>
                  <th className="border border-black px-4 py-2 text-center font-bold text-black bg-white w-[30%]">Lecturer</th>
                  <th className="border border-black px-4 py-2 text-center font-bold text-black bg-white w-[15%]">Type</th>
                </tr>
              </thead>
              <tbody>
                {DAYS.map(day => {
                  const daySessions = timetable[day]
                  if (!daySessions || daySessions.length === 0) return null

                  return (
                    <React.Fragment key={day}>
                      {/* Day Header Row */}
                      <tr>
                        <td colSpan={4} className="border border-black bg-[#d9eef9] px-4 py-1.5 text-center font-bold text-black">
                          {day}
                        </td>
                      </tr>
                      
                      {/* Sessions for the Day */}
                      {daySessions.map((session, idx) => {
                        let timeString = ''
                        if (shift === 'Morning') {
                          // Allow overflow times if total periods require it
                          const morningEarly = [
                            '07:00 AM - 07:45 AM', '07:45 AM - 08:45 AM', '08:45 AM - 09:45 AM',
                            '10:15 AM - 11:15 AM', '11:15 AM - 12:15 PM', '12:15 PM - 01:15 PM', '01:15 PM - 02:15 PM'
                          ]
                          const morningDefault = [
                            '07:45 AM - 08:45 AM', '08:45 AM - 09:45 AM', '10:15 AM - 11:15 AM',
                            '11:15 AM - 12:15 PM', '12:15 PM - 01:15 PM', '01:15 PM - 02:15 PM', '02:15 PM - 03:15 PM'
                          ]
                          
                          if ((day === 'Tuesday' || day === 'Wednesday') && daySessions.length >= 5) {
                            timeString = morningEarly[session.slotIndex] || 'Extra Slot'
                          } else {
                            timeString = morningDefault[session.slotIndex] || 'Extra Slot'
                          }
                        } else {
                          // Afternoon overflow times
                          const afternoonSlots = [
                            '01:00 PM - 01:50 PM', '01:50 PM - 02:40 PM', '02:40 PM - 03:30 PM', 
                            '04:00 PM - 05:00 PM', '05:00 PM - 05:50 PM', '05:50 PM - 06:40 PM', '06:40 PM - 07:30 PM'
                          ]
                          timeString = afternoonSlots[session.slotIndex] || 'Extra Slot'
                        }

                        return (
                          <tr key={`${day}-${idx}`} className="border border-black bg-white text-black">
                            <td className="border border-black px-3 py-1.5 align-middle">
                              {session.subject.name}
                            </td>
                            <td className="border border-black px-3 py-1.5 text-center align-middle whitespace-nowrap">
                              {timeString}
                            </td>
                            <td className="border border-black px-3 py-1.5 align-middle">
                              {session.lecturer ? session.lecturer.name : ''}
                            </td>
                            <td className="border border-black px-3 py-1.5 text-center align-middle">
                              {session.type}
                            </td>
                          </tr>
                        )
                      })}
                    </React.Fragment>
                  )
                })}
              </tbody>
            </table>

            {/* Footer */}
            <div className="text-center font-bold mt-1 text-[15px] text-black">
              Total Periods: {totalPeriods}
            </div>

          </div>
        </div>
      )}
    </>
  )
}

