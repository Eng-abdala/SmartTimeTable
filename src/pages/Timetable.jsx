import React, { useState, useMemo, useRef, useEffect } from 'react'
import { useOutletContext, useSearchParams } from 'react-router-dom'
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

function generateTimetable(semesterSubjects, lecturers, shift, selectedClassId, getRandomLecturerForClass, getSubjectLecturers, busyMap, initialDailyLoad, classCountMap) {
  // ── Step 1: Assign lecturers to subjects for this specific class ──────────
  // Constraint: one lecturer → one subject per class (no lecturer teaches two subjects to the same class)
  const usedLecturerIds = new Set()        // lecturers already committed to a subject for this class
  const subjectLecturerMap = new Map()     // subjectId → lecturer object

  // Constraint 2: A lecturer can only teach a maximum of 3 different classes overall.
  const availableLecturers = lecturers.filter(l => {
    const classCount = classCountMap && classCountMap[l.id] ? classCountMap[l.id].size : 0
    // If they already teach 3 classes, they can only be picked if this class is already one of them
    return classCount < 3 || (classCountMap && classCountMap[l.id]?.has(selectedClassId))
  })

  for (const sub of semesterSubjects) {
    // Get all qualified lecturers for this subject, filtered by max class limit
    const allQualified = getSubjectLecturers ? getSubjectLecturers(sub.id) : []
    const qualifiedForSubject = allQualified.filter(l => availableLecturers.some(a => a.id === l.id))

    // Try the preferred random pick first, then cycle through other qualified lecturers
    const preferred = getRandomLecturerForClass ? getRandomLecturerForClass(sub.id, selectedClassId) : null
    const preferredIfAvailable = preferred && availableLecturers.some(a => a.id === preferred.id) ? preferred : null

    // STRICT ASSIGNMENT: Only use lecturers explicitly assigned to this subject
    const candidates = preferredIfAvailable
      ? [preferredIfAvailable, ...qualifiedForSubject.filter(l => l.id !== preferredIfAvailable.id)]
      : [...qualifiedForSubject]

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

  // Ensure all Theory blocks are placed before Lab blocks, but shuffle within those groups to allow regeneration
  const shuffle = (array) => {
    for (let i = array.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [array[i], array[j]] = [array[j], array[i]];
    }
  }
  
  const theoryBlocks = blocks.filter(b => b.type === 'Theory')
  const labBlocks = blocks.filter(b => b.type === 'Lab')
  
  shuffle(theoryBlocks)
  shuffle(labBlocks)
  
  const shuffledBlocks = [...theoryBlocks, ...labBlocks]

  // Clone dailyLoad to track during generation
  const localDailyLoad = initialDailyLoad ? JSON.parse(JSON.stringify(initialDailyLoad)) : {}

  // ── Step 3: Spread blocks across days ────────────────────────────────────
  const timetable = {}
  DAYS.forEach(d => { timetable[d] = [] })
  const daySlotCount = { Saturday: 0, Sunday: 0, Monday: 0, Tuesday: 0, Wednesday: 0 }

  const totalPeriods = shuffledBlocks.reduce((sum, b) => sum + b.size, 0)
  const baseMax = Math.ceil(totalPeriods / 5)

  const getMaxSlots = (day) => {
    let m = Math.max(baseMax, 4)
    if (shift === 'Morning' && (day === 'Tuesday' || day === 'Wednesday')) m = Math.max(m, 5)
    return m
  }

  // Track when the first Theory lesson is placed so Lab lessons don't happen earlier in the week
  const theoryDayIdxMap = {} // subject.id -> earliest chronological day index (0-4)

  // Simple round-robin to spread blocks evenly across the week
  let dayIdx = Math.floor(Math.random() * DAYS.length) // Start on a random day for more variety

  for (const block of shuffledBlocks) {
    let placed = false
    const startDayIdx = dayIdx

    do {
      const day = DAYS[dayIdx]
      
      // Check if we have enough slots on this day
      if (daySlotCount[day] + block.size <= getMaxSlots(day)) {
        
        // --- CLASH CHECK ---
        // Verify the lecturer isn't busy in ANY of the slots we're about to use
        let hasClash = false
        if (block.lecturer) {
          const lid = block.lecturer.id
          
          // Check Daily Load Limit (Max 3 slots per day across all shifts)
          if ((localDailyLoad[lid]?.[day] || 0) + block.size > 3) {
            hasClash = true
          }
          
          if (!hasClash && busyMap[lid]) {
            for (let i = 0; i < block.size; i++) {
              const slotIndex = daySlotCount[day] + i
              if (busyMap[lid][day] && busyMap[lid][day][slotIndex]) {
                hasClash = true
                break
              }
            }
          }
        }
        
        // --- CHRONOLOGICAL CHECK FOR LABS ---
        // Ensure Lab doesn't happen on a day earlier than the first Theory lesson
        const chronoDayIdx = DAYS.indexOf(day)
        if (!hasClash && block.type === 'Lab' && theoryDayIdxMap[block.subject.id] !== undefined) {
          if (chronoDayIdx < theoryDayIdxMap[block.subject.id]) {
            hasClash = true
          }
        }

        if (!hasClash) {
          for (let i = 0; i < block.size; i++) {
            timetable[day].push({
              slotIndex: daySlotCount[day],
              subject: block.subject,
              type: block.type,
              lecturer: block.lecturer
            })
            daySlotCount[day]++
          }
          
          if (block.lecturer) {
            const lid = block.lecturer.id
            if (!localDailyLoad[lid]) localDailyLoad[lid] = {}
            localDailyLoad[lid][day] = (localDailyLoad[lid][day] || 0) + block.size
          }
          
          if (block.type === 'Theory') {
            if (theoryDayIdxMap[block.subject.id] === undefined) {
              theoryDayIdxMap[block.subject.id] = chronoDayIdx
            } else {
              theoryDayIdxMap[block.subject.id] = Math.min(theoryDayIdxMap[block.subject.id], chronoDayIdx)
            }
          }
          
          placed = true
          dayIdx = (dayIdx + 1) % DAYS.length
          break
        }
      }
      dayIdx = (dayIdx + 1) % DAYS.length
    } while (dayIdx !== startDayIdx)

    // Fallback: dump wherever there's space (but still try to avoid clashes)
    if (!placed) {
      for (let i = 0; i < block.size; i++) {
        let fallbackPlaced = false
        for (const day of DAYS) {
          const slotIndex = daySlotCount[day]
          if (slotIndex < getMaxSlots(day)) {
            // Check clash and load limit
            if (block.lecturer) {
              const lid = block.lecturer.id
              if ((localDailyLoad[lid]?.[day] || 0) + 1 > 3) {
                continue // Exceeds daily load limit
              }
              if (busyMap[lid] && busyMap[lid][day] && busyMap[lid][day][slotIndex]) {
                continue // Clash, try next day
              }
            }

            timetable[day].push({
              slotIndex,
              subject: block.subject,
              type: block.type,
              lecturer: block.lecturer
            })
            daySlotCount[day]++
            
            if (block.lecturer) {
              const lid = block.lecturer.id
              if (!localDailyLoad[lid]) localDailyLoad[lid] = {}
              localDailyLoad[lid][day] = (localDailyLoad[lid][day] || 0) + 1
            }
            
            const chronoDayIdxFallback = DAYS.indexOf(day)
            if (block.type === 'Theory') {
              if (theoryDayIdxMap[block.subject.id] === undefined) {
                theoryDayIdxMap[block.subject.id] = chronoDayIdxFallback
              } else {
                theoryDayIdxMap[block.subject.id] = Math.min(theoryDayIdxMap[block.subject.id], chronoDayIdxFallback)
              }
            }
            
            fallbackPlaced = true
            break
          }
        }
        
        // If absolutely nowhere to put it without clashing, just force it in the first day with space 
        // (This is an unsolvable clash, will require manual fix)
        if (!fallbackPlaced) {
          for (const day of DAYS) {
             if (daySlotCount[day] < getMaxSlots(day)) {
                timetable[day].push({
                  slotIndex: daySlotCount[day],
                  subject: block.subject,
                  type: block.type,
                  lecturer: block.lecturer
                })
                daySlotCount[day]++
                
                const chronoDayIdxForce = DAYS.indexOf(day)
                if (block.type === 'Theory') {
                  if (theoryDayIdxMap[block.subject.id] === undefined) {
                    theoryDayIdxMap[block.subject.id] = chronoDayIdxForce
                  } else {
                    theoryDayIdxMap[block.subject.id] = Math.min(theoryDayIdxMap[block.subject.id], chronoDayIdxForce)
                  }
                }
                break
             }
          }
        }
      }
    }
  }

  return timetable
}


export function Timetable() {
  const { classes, semesters, subjects, lecturers, getRandomLecturerForClass, getSubjectLecturers, setNotice } = useOutletContext()

  const [searchParams, setSearchParams] = useSearchParams()
  const urlClassId = searchParams.get('classId')

  const [selectedYear, setSelectedYear] = useState(() => localStorage.getItem('tt_year') || '')
  const [selectedSemesterId, setSelectedSemesterId] = useState(() => localStorage.getItem('tt_semester') || '')
  const [selectedClassId, setSelectedClassId] = useState(() => urlClassId || localStorage.getItem('tt_class') || '')
  const [timetable, setTimetable] = useState(null)
  const [generated, setGenerated] = useState(false)
  const [isSaved, setIsSaved] = useState(false)
  
  const printRef = useRef()

  // Load timetable on mount if URL has classId
  useEffect(() => {
    if (urlClassId) {
      const savedGrid = localStorage.getItem(`saved_tt_${urlClassId}`)
      if (savedGrid) {
        try {
          const parsed = JSON.parse(savedGrid)
          if (parsed && Array.isArray(parsed['Saturday'])) {
            setTimetable(parsed)
            setGenerated(true)
            setIsSaved(true)
            setSelectedClassId(urlClassId)
            
            // Auto-select year/semester if possible based on class
            const targetClass = classes.find(c => c.id === urlClassId)
            if (targetClass) {
              setSelectedYear(targetClass.intake_year.toString())
              // We'll leave semester alone as we don't know it just from the grid, 
              // but they can see the timetable immediately.
            }
          }
        } catch {}
      }
    }
  }, [urlClassId, classes])

  // Persist selections to localStorage whenever they change
  const saveYear = (v) => { setSelectedYear(v); localStorage.setItem('tt_year', v) }
  const saveSemester = (v) => { setSelectedSemesterId(v); localStorage.setItem('tt_semester', v) }
  const saveClass = (v) => { 
    setSelectedClassId(v); 
    localStorage.setItem('tt_class', v);
    setSearchParams({}); // clear URL param if they change class manually
  }

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

    // Ensure all subjects have at least one lecturer assigned
    const unassignedSubjects = semesterSubjects.filter(sub => {
      const assigned = getSubjectLecturers(sub.id)
      return !assigned || assigned.length === 0
    })

    if (unassignedSubjects.length > 0) {
      const names = unassignedSubjects.map(s => s.name).join(', ')
      setNotice(`Cannot generate timetable. The following subjects have no assigned lecturer: ${names}`)
      return
    }

    // Build busyMap from all OTHER saved timetables
    const busyMap = {} // lecturerId -> day -> slotIndex -> true
    const dailyLoad = {} // lecturerId -> day -> totalSlots
    const classCountMap = {} // lecturerId -> Set of classIds

    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i)
      if (key.startsWith('saved_tt_') && key !== `saved_tt_${selectedClassId}`) {
        try {
          const savedGrid = JSON.parse(localStorage.getItem(key))
          const savedClassId = key.replace('saved_tt_', '')
          const savedClass = classes.find(c => c.id === savedClassId)
          
          DAYS.forEach(day => {
            if (savedGrid[day]) {
              savedGrid[day].forEach(session => {
                if (session.lecturer) {
                  const lid = session.lecturer.id
                  
                  // Track class count
                  if (!classCountMap[lid]) classCountMap[lid] = new Set()
                  classCountMap[lid].add(savedClassId)

                  // Track daily load REGARDLESS of shift (max 3 periods across whole day)
                  if (!dailyLoad[lid]) dailyLoad[lid] = {}
                  dailyLoad[lid][day] = (dailyLoad[lid][day] || 0) + 1

                  // Only check physical time clashes against classes in the SAME SHIFT. 
                  if (savedClass && savedClass.shift === selectedClass.shift) {
                    if (!busyMap[lid]) busyMap[lid] = {}
                    if (!busyMap[lid][day]) busyMap[lid][day] = {}
                    busyMap[lid][day][session.slotIndex] = true
                  }
                }
              })
            }
          })
        } catch (e) {
          console.error('Failed to parse saved timetable for clash detection', e)
        }
      }
    }

    const grid = generateTimetable(
      semesterSubjects, lecturers, selectedClass.shift,
      selectedClass.id, getRandomLecturerForClass, getSubjectLecturers, busyMap, dailyLoad, classCountMap
    )
    setTimetable(grid)
    setGenerated(true)
    setIsSaved(false)
  }

  const handleSaveTimetable = () => {
    if (timetable && selectedClassId) {
      localStorage.setItem(`saved_tt_${selectedClassId}`, JSON.stringify(timetable))
      setIsSaved(true)
    }
  }

  const handleReset = () => {
    setSearchParams({}) // Clear URL params so it doesn't reload the saved class
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

  const handleGenerateAnother = () => {
    setSearchParams({}) 
    setSelectedClassId('')
    setTimetable(null)
    setGenerated(false)
    setIsSaved(false)
    localStorage.removeItem('tt_class')
    localStorage.removeItem('tt_grid')
  }

  const handleDeleteSaved = () => {
    if (selectedClassId) {
      if (confirm('Are you sure you want to delete this saved timetable? This will allow lecturers to be scheduled in these slots again.')) {
        localStorage.removeItem(`saved_tt_${selectedClassId}`)
        handleGenerateAnother() // This conveniently resets the view
        setNotice('Saved timetable deleted successfully.')
      }
    }
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
            <button onClick={handleReset} className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-semibold text-slate-700 shadow-sm hover:bg-slate-50 transition">
              <Icon name="back" className="h-4 w-4" /> Go Back
            </button>
            
            {!isSaved && (
              <button 
                onClick={handleGenerate} 
                className="inline-flex items-center gap-2 rounded-xl border border-indigo-200 bg-indigo-50 px-4 py-2.5 text-sm font-semibold text-indigo-700 shadow-sm transition hover:bg-indigo-100 hover:border-indigo-300"
                title="Regenerate a new layout"
              >
                <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                </svg>
                Shuffle Layout
              </button>
            )}

            <button 
              onClick={handleSaveTimetable} 
              disabled={isSaved}
              className={`inline-flex items-center gap-2 rounded-xl px-4 py-2.5 text-sm font-semibold text-white shadow-md transition ${isSaved ? 'bg-emerald-500 cursor-not-allowed' : 'bg-brand-600 hover:bg-brand-800'}`}
            >
              <span className="text-base">{isSaved ? '✓' : '💾'}</span> {isSaved ? 'Saved to Class' : 'Save Timetable'}
            </button>
            
            {isSaved && (
              <button 
                onClick={handleGenerateAnother} 
                className="inline-flex items-center gap-2 rounded-xl bg-indigo-600 px-4 py-2.5 text-sm font-semibold text-white shadow-md transition hover:bg-indigo-800"
              >
                <Icon name="plus" className="h-4 w-4" /> Generate Another Class
              </button>
            )}

            {isSaved && (
              <button 
                onClick={handleDeleteSaved} 
                className="inline-flex items-center gap-2 rounded-xl bg-rose-50 px-4 py-2.5 text-sm font-semibold text-rose-600 shadow-sm transition hover:bg-rose-100 border border-rose-200"
                title="Delete this saved timetable"
              >
                <Icon name="trash" className="h-4 w-4" /> Delete Saved
              </button>
            )}

            <button onClick={handleDownloadPdf} className="inline-flex items-center gap-2 rounded-xl bg-rose-600 px-4 py-2.5 text-sm font-semibold text-white shadow-md hover:bg-rose-700">
              <Icon name="print" className="h-4 w-4" /> PDF
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
                {semesters.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
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
                {yearClasses.map(c => <option key={c.id} value={c.id}>{c.name} – {c.shift}</option>)}
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

