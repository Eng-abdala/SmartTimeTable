import React, { useState, useMemo, useRef, useEffect, useCallback } from 'react'
import { useOutletContext, useSearchParams, useNavigate } from 'react-router-dom'
import { Icon } from '../components/Icon'
import { Empty } from '../components/Empty'
import html2pdf from 'html2pdf.js'
import { supabase } from '../lib/supabase'

const DAYS = ['Saturday', 'Sunday', 'Monday', 'Tuesday', 'Wednesday']

const SHIFT_SLOTS = {
  Morning: [
    { id: 1, label: 'Period 1', time: '8:00 AM – 9:20 AM' },
    { id: 2, label: 'Period 2', time: '9:20 AM – 10:40 AM' },
    { id: 'break', label: '☕ Break', time: '10:40 AM – 10:55 AM', isBreak: true },
    { id: 3, label: 'Period 3', time: '10:55 AM – 12:15 PM' },
  ],
  Afternoon: [
    { id: 1, label: 'Period 1', time: '1:00 PM – 2:20 PM' },
    { id: 2, label: 'Period 2', time: '2:20 PM – 3:40 PM' },
    { id: 'break', label: '☕ Break', time: '3:40 PM – 3:55 PM', isBreak: true },
    { id: 3, label: 'Period 3', time: '3:55 PM – 5:15 PM' },
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

// Returns true if the lecturer is available to teach on the given day
function isLecturerAvailableOnDay(lecturer, day) {
  if (!lecturer) return true
  if (lecturer.is_all_week) return true
  return Array.isArray(lecturer.available_days) && lecturer.available_days.includes(day)
}

function generateSinglePassTimetable(semesterSubjects, lecturers, shift, selectedClassId, getRandomLecturerForClass, getSubjectLecturers, busyMap, initialDailyLoad, classCountMap, attemptSeed) {
  // Step 1: Assign EXACTLY ONE lecturer per subject for this class
  // Rule 1: A subject in this class has only 1 teacher for all periods (Theory & Lab).
  // Rule 2: A teacher can teach AT MOST 1 subject in this class (but can teach across different classes).
  const usedLecturersInClass = new Set()
  const subjectLecturerMap = new Map()

  // Helper: Calculate how many free period slots a lecturer has available in the week for this shift
  const countFreeSlotsForLecturer = (lecturer) => {
    if (!lecturer) return 0
    let freeCount = 0
    DAYS.forEach(day => {
      if (isLecturerAvailableOnDay(lecturer, day)) {
        const usedDaily = initialDailyLoad?.[lecturer.id]?.[day] || 0
        const maxDailyAllowed = Math.max(0, 3 - usedDaily)
        let daySlotsAvailable = 0
        const maxSlotsPerDay = shift === 'Morning' ? 5 : 4
        for (let s = 0; s < maxSlotsPerDay; s++) {
          if (!busyMap?.[lecturer.id]?.[day]?.[s]) {
            daySlotsAvailable++
          }
        }
        freeCount += Math.min(daySlotsAvailable, maxDailyAllowed)
      }
    })
    return freeCount
  }

  for (const sub of semesterSubjects) {
    const requiredHours = sub.total_hours || (sub.theory_hours + sub.lab_hours) || 0
    const allQualified = getSubjectLecturers ? getSubjectLecturers(sub.id) : []
    
    // Filter out lecturers who are ALREADY teaching another subject in this same class
    // OR who have already reached the maximum limit of 3 classes in total.
    const availableForThisClass = allQualified.filter(l => {
      if (usedLecturersInClass.has(l.id)) return false
      const currentClassCount = classCountMap?.[l.id]?.size || 0
      if (currentClassCount >= 3) return false
      return true
    })
    const pool = availableForThisClass.length > 0 ? availableForThisClass : allQualified

    // Sort candidate pool:
    // 1. Prioritize lecturers who have enough free slots to cover ALL periods (freeSlots >= requiredHours)
    // 2. Secondary sort by total free slots descending
    const sortedCandidates = [...pool].sort((a, b) => {
      const freeA = countFreeSlotsForLecturer(a)
      const freeB = countFreeSlotsForLecturer(b)

      const coversAllA = freeA >= requiredHours ? 1 : 0
      const coversAllB = freeB >= requiredHours ? 1 : 0

      if (coversAllA !== coversAllB) return coversAllB - coversAllA
      return freeB - freeA
    })

    let chosenLecturer = null
    if (sortedCandidates.length > 0) {
      // Pick best candidate; rotate among fully capable candidates if attemptSeed > 0
      const fullyCapable = sortedCandidates.filter(l => countFreeSlotsForLecturer(l) >= requiredHours)
      const choicePool = fullyCapable.length > 0 ? fullyCapable : sortedCandidates
      const idx = attemptSeed % choicePool.length
      chosenLecturer = choicePool[idx]
      usedLecturersInClass.add(chosenLecturer.id)
    }

    subjectLecturerMap.set(sub.id, chosenLecturer)
  }

  // Step 2: Build blocks using the single assigned lecturer per subject
  const blocks = []
  semesterSubjects.forEach(sub => {
    const lecturer = subjectLecturerMap.get(sub.id)
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

  const shuffle = (array) => {
    for (let i = array.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [array[i]], [array[j]] = [array[j]], [array[i]]
    }
  }

  const theoryBlocks = blocks.filter(b => b.type === 'Theory')
  const labBlocks = blocks.filter(b => b.type === 'Lab')

  shuffle(theoryBlocks)
  shuffle(labBlocks)

  const shuffledBlocks = [...theoryBlocks, ...labBlocks]

  const localDailyLoad = initialDailyLoad ? JSON.parse(JSON.stringify(initialDailyLoad)) : {}
  const timetable = {}
  DAYS.forEach(d => { timetable[d] = [] })
  const daySlotCount = { Saturday: 0, Sunday: 0, Monday: 0, Tuesday: 0, Wednesday: 0 }

  const totalPeriods = shuffledBlocks.reduce((sum, b) => sum + b.size, 0)
  const baseMax = Math.ceil(totalPeriods / 5)

  const getMaxSlots = (day) => {
    let m = Math.max(baseMax, 4)
    if (shift === 'Morning') m = Math.min(m, 5)
    return m
  }

  const theoryDayIdxMap = {}
  let dayIdx = (attemptSeed + Math.floor(Math.random() * DAYS.length)) % DAYS.length
  let emptyLecturerCount = 0

  for (const block of shuffledBlocks) {
    let placed = false
    const startDayIdx = dayIdx

    do {
      const day = DAYS[dayIdx]

      if (daySlotCount[day] + block.size <= getMaxSlots(day)) {
        let assignedLecturer = block.lecturer
        let hasClash = false

        if (assignedLecturer) {
          const lid = assignedLecturer.id

          if (!isLecturerAvailableOnDay(assignedLecturer, day)) {
            hasClash = true
          }

          if (!hasClash && (localDailyLoad[lid]?.[day] || 0) + block.size > 3) {
            hasClash = true
          }

          if (!hasClash && busyMap && busyMap[lid]) {
            for (let i = 0; i < block.size; i++) {
              const slotIndex = daySlotCount[day] + i
              if (busyMap[lid][day] && busyMap[lid][day][slotIndex]) {
                hasClash = true
                break
              }
            }
          }
        }

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
              lecturer: assignedLecturer
            })
            daySlotCount[day]++
          }

          if (assignedLecturer) {
            const lid = assignedLecturer.id
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

    // Fallback Phase 1: Try placing block.lecturer into any day/slot where they are free from busyMap clashes
    if (!placed && block.lecturer) {
      const lid = block.lecturer.id
      for (const day of DAYS) {
        if (isLecturerAvailableOnDay(block.lecturer, day)) {
          if (daySlotCount[day] + block.size <= getMaxSlots(day)) {
            let hasBusyClash = false
            if (busyMap && busyMap[lid]) {
              for (let i = 0; i < block.size; i++) {
                const sIdx = daySlotCount[day] + i
                if (busyMap[lid][day] && busyMap[lid][day][sIdx]) {
                  hasBusyClash = true
                  break
                }
              }
            }

            if (!hasBusyClash) {
              for (let i = 0; i < block.size; i++) {
                timetable[day].push({
                  slotIndex: daySlotCount[day],
                  subject: block.subject,
                  type: block.type,
                  lecturer: block.lecturer
                })
                daySlotCount[day]++
              }
              if (!localDailyLoad[lid]) localDailyLoad[lid] = {}
              localDailyLoad[lid][day] = (localDailyLoad[lid][day] || 0) + block.size
              placed = true
              break
            }
          }
        }
      }
    }

    // Fallback Phase 2: If lecturer is physically busy in busyMap at all slots, place block with lecturer = null
    if (!placed) {
      emptyLecturerCount++
      for (let i = 0; i < block.size; i++) {
        let placedSlot = false
        for (const day of DAYS) {
          const slotIndex = daySlotCount[day]
          if (slotIndex < getMaxSlots(day)) {
            timetable[day].push({
              slotIndex,
              subject: block.subject,
              type: block.type,
              lecturer: null
            })
            daySlotCount[day]++
            placedSlot = true
            break
          }
        }

        if (!placedSlot) {
          for (const day of DAYS) {
            if (daySlotCount[day] < getMaxSlots(day)) {
              timetable[day].push({
                slotIndex: daySlotCount[day],
                subject: block.subject,
                type: block.type,
                lecturer: null
              })
              daySlotCount[day]++
              break
            }
          }
        }
      }
    }
  }

  // Group consecutive blocks by lecturer (Theory before Lab)
  for (const day of DAYS) {
    const entries = timetable[day]
    if (!entries || entries.length <= 1) continue

    const lecturerOrder = []
    const seen = new Set()
    for (const entry of entries) {
      const lid = entry.lecturer?.id || '__none__'
      if (!seen.has(lid)) {
        seen.add(lid)
        lecturerOrder.push(lid)
      }
    }

    timetable[day] = entries.sort((a, b) => {
      const aIdx = lecturerOrder.indexOf(a.lecturer?.id || '__none__')
      const bIdx = lecturerOrder.indexOf(b.lecturer?.id || '__none__')
      if (aIdx !== bIdx) return aIdx - bIdx
      if (a.type === 'Theory' && b.type === 'Lab') return -1
      if (a.type === 'Lab' && b.type === 'Theory') return 1
      return 0
    })

    // Re-index slotIndex after sorting
    timetable[day].forEach((item, idx) => {
      item.slotIndex = idx
    })
  }

  return { timetable, emptyLecturerCount }
}

function generateTimetable(semesterSubjects, lecturers, shift, selectedClassId, getRandomLecturerForClass, getSubjectLecturers, busyMap, initialDailyLoad, classCountMap) {
  let bestGrid = null
  let minEmpty = Infinity

  // Perform multi-attempt optimization to eliminate conflicts and minimize unassigned slots
  for (let attempt = 0; attempt < 50; attempt++) {
    const res = generateSinglePassTimetable(
      semesterSubjects, lecturers, shift, selectedClassId,
      getRandomLecturerForClass, getSubjectLecturers, busyMap, initialDailyLoad, classCountMap, attempt
    )

    if (res.emptyLecturerCount === 0) {
      return res.timetable
    }

    if (res.emptyLecturerCount < minEmpty) {
      minEmpty = res.emptyLecturerCount
      bestGrid = res.timetable
    }
  }

  return bestGrid
}


export function Timetable() {
  const { classes, semesters, subjects, lecturers, academicYears, getRandomLecturerForClass, getSubjectLecturers, setNotice, loadData } = useOutletContext()
  const navigate = useNavigate()

  const [searchParams, setSearchParams] = useSearchParams()
  const urlClassId = searchParams.get('classId')

  const [selectedSemesterId, setSelectedSemesterId] = useState(() => localStorage.getItem('tt_semester') || '')
  const [selectedClassId, setSelectedClassId] = useState(() => urlClassId || localStorage.getItem('tt_class') || '')
  const [timetable, setTimetable] = useState(null)
  const [generated, setGenerated] = useState(false)
  const [isSaved, setIsSaved] = useState(false)
  const [globalBusyMap, setGlobalBusyMap] = useState({})
  
  const printRef = useRef()

  // Load existing timetables map from DB (which class+semester combos already have a timetable)
  const [savedTimetableMap, setSavedTimetableMap] = useState({}) // key: `${classId}_${semesterId}` -> row id

  const loadSavedTimetableMap = useCallback(async () => {
    const { data } = await supabase.from('timetables').select('id, class_id, semester_id')
    if (data) {
      const map = {}
      data.forEach(row => { map[`${row.class_id}_${row.semester_id}`] = row.id })
      setSavedTimetableMap(map)
    }
  }, [])

  useEffect(() => { loadSavedTimetableMap() }, [])

  // When navigating via URL classId, auto-select that class's semester
  useEffect(() => {
    if (!urlClassId || !classes.length) return
    const cls = classes.find(c => c.id === urlClassId)
    if (cls?.semester_id) {
      setSelectedSemesterId(cls.semester_id)
      setSelectedClassId(urlClassId)
    }
  }, [urlClassId, classes])

  // Load timetable on mount if URL has classId
  useEffect(() => {
    if (urlClassId && selectedSemesterId) {
      const cls = classes.find(c => c.id === urlClassId)
      // Only load if semester matches the class's own semester
      if (!cls || cls.semester_id !== selectedSemesterId) return
      ;(async () => {
        const { data } = await supabase
          .from('timetables')
          .select('grid')
          .eq('class_id', urlClassId)
          .eq('semester_id', selectedSemesterId)
          .maybeSingle()
        if (data?.grid) {
          setTimetable(data.grid)
          setGenerated(true)
          setIsSaved(true)
          setSelectedClassId(urlClassId)
        }
      })()
    }
  }, [urlClassId, selectedSemesterId, classes])

  // Persist selections to localStorage
  const saveSemester = (v) => { setSelectedSemesterId(v); localStorage.setItem('tt_semester', v); saveClass('') }
  const saveClass = (v) => { 
    setSelectedClassId(v); 
    localStorage.setItem('tt_class', v);
    setSearchParams({});
  }

  // Classes filtered by selected semester (showing all assigned classes)
  const semesterClasses = useMemo(() => {
    if (!selectedSemesterId) return []
    return classes.filter(c => c.semester_id === selectedSemesterId)
  }, [classes, selectedSemesterId])

  // Only show semesters that have at least one class assigned
  const sortedSemesters = useMemo(() => {
    const assignedSemesterIds = new Set(classes.map(c => c.semester_id).filter(Boolean))
    return [...semesters]
      .filter(s => assignedSemesterIds.has(s.id))
      .sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true }))
  }, [semesters, classes])

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

  // Already has a timetable check (from DB)
  const alreadyHasTimetable = useMemo(() => {
    if (!selectedClassId || !selectedSemesterId) return false
    return !!savedTimetableMap[`${selectedClassId}_${selectedSemesterId}`]
  }, [selectedClassId, selectedSemesterId, savedTimetableMap])

  const handleGenerate = async () => {
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

    // Build busyMap from all OTHER saved timetables directly from Supabase DB
    const busyMap = {} // lecturerId -> day -> slotIndex -> true
    const dailyLoad = {} // lecturerId -> day -> totalSlots
    const classCountMap = {} // lecturerId -> Set of classIds

    const { data: dbTimetables } = await supabase.from('timetables').select('class_id, semester_id, grid')

    if (dbTimetables) {
      dbTimetables.forEach(row => {
        if (row.class_id !== selectedClassId) {
          const savedGrid = row.grid
          const savedClassId = row.class_id
          const savedClass = classes.find(c => c.id === savedClassId)

          DAYS.forEach(day => {
            if (savedGrid && savedGrid[day] && Array.isArray(savedGrid[day])) {
              savedGrid[day].forEach(session => {
                if (session.lecturer) {
                  const lid = session.lecturer.id
                  
                  // Track class count
                  if (!classCountMap[lid]) classCountMap[lid] = new Set()
                  classCountMap[lid].add(savedClassId)

                  // Track daily load for classes in the SAME SHIFT (max 3 periods per shift per day)
                  const isSameShift = !savedClass || savedClass.shift === selectedClass.shift
                  if (isSameShift) {
                    if (!dailyLoad[lid]) dailyLoad[lid] = {}
                    dailyLoad[lid][day] = (dailyLoad[lid][day] || 0) + 1

                    if (!busyMap[lid]) busyMap[lid] = {}
                    if (!busyMap[lid][day]) busyMap[lid][day] = {}
                    busyMap[lid][day][session.slotIndex] = true
                  }
                }
              })
            }
          })
        }
      })
    }

    const grid = generateTimetable(
      semesterSubjects, lecturers, selectedClass.shift,
      selectedClass.id, getRandomLecturerForClass, getSubjectLecturers, busyMap, dailyLoad, classCountMap
    )
    setGlobalBusyMap(busyMap)
    setTimetable(grid)
    setGenerated(true)
    setIsSaved(false)
  }

  const handleSaveTimetable = async () => {
    if (!timetable || !selectedClassId || !selectedSemesterId) return
    const existingId = savedTimetableMap[`${selectedClassId}_${selectedSemesterId}`]
    let error
    if (existingId) {
      // Update existing row
      const res = await supabase.from('timetables').update({ grid: timetable }).eq('id', existingId)
      error = res.error
    } else {
      // Insert new row
      const res = await supabase.from('timetables').insert([{ class_id: selectedClassId, semester_id: selectedSemesterId, grid: timetable }])
      error = res.error
    }
    if (error) {
      setNotice(`Failed to save: ${error.message}`, 'error')
      return
    }
    await loadSavedTimetableMap()
    setIsSaved(true)
    setNotice('Timetable saved to database successfully!', 'success')
  }

  const handleReset = () => {
    if (searchParams.has('classId')) {
      navigate(-1)
      return
    }
    setSearchParams({})
    setSelectedSemesterId(''); setSelectedClassId('')
    setTimetable(null); setGenerated(false)
    localStorage.removeItem('tt_semester')
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

  const handleExportExcel = () => {
    const el = printRef.current
    if (!el) return
    const className = `${selectedClass?.name}_${selectedSemester?.name}`.replace(/\s+/g, '_')
    
    const clone = el.cloneNode(true)
    const html = `
      <html xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:x="urn:schemas-microsoft-com:office:excel" xmlns="http://www.w3.org/TR/REC-html40">
      <head>
        <meta charset="utf-8" />
        <style>
          table { border-collapse: collapse; width: 100%; font-family: 'Times New Roman', serif; font-size: 11pt; }
          th, td { border: 1px solid #000000; padding: 6px; text-align: center; }
          th { background-color: #f1f5f9; font-weight: bold; }
          .header-day { background-color: #d9eef9; font-weight: bold; }
        </style>
      </head>
      <body>${clone.outerHTML}</body>
      </html>
    `
    const blob = new Blob([html], { type: 'application/vnd.ms-excel;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `Timetable_${className}.xls`
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
    URL.revokeObjectURL(url)
    setNotice('Class Timetable exported to Excel successfully!', 'success')
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

  const handleDeleteSaved = async () => {
    if (!selectedClassId || !selectedSemesterId) return
    if (!confirm('Are you sure you want to delete this saved timetable?')) return
    const existingId = savedTimetableMap[`${selectedClassId}_${selectedSemesterId}`]
    if (existingId) {
      const { error } = await supabase.from('timetables').delete().eq('id', existingId)
      if (error) { setNotice(`Failed to delete: ${error.message}`, 'error'); return }
    }
    // Also clean up any old localStorage entries
    localStorage.removeItem(`saved_tt_${selectedClassId}`)
    localStorage.removeItem(`saved_tt_${selectedClassId}_${selectedSemesterId}`)
    await loadSavedTimetableMap()
    handleGenerateAnother()
    setNotice('Timetable deleted successfully.', 'success')
  }

  const getAvailableLecturersForSession = (subject, day, slotIndex, currentLecturerId) => {
    const allQualified = getSubjectLecturers(subject.id) || []
    return allQualified.filter(l => {
      // Always show the currently assigned lecturer so it stays selectable
      if (currentLecturerId === l.id) return true

      // Filter out lecturers not available on this day
      if (!l.is_all_week) {
        if (!Array.isArray(l.available_days) || !l.available_days.includes(day)) return false
      }
      
      // Check global busy map (other classes)
      if (globalBusyMap[l.id]?.[day]?.[slotIndex]) return false
      
      // Check current timetable (this class)
      if (timetable && timetable[day]) {
        const conflictInThisClass = timetable[day].some(session => 
          session.slotIndex === slotIndex && 
          session.lecturer && 
          session.lecturer.id === l.id
        )
        if (conflictInThisClass) return false
      }
      
      return true
    })
  }

  const handleLecturerChange = (day, sessionIdx, newLecturerId) => {
    const newTimetable = { ...timetable }
    const session = newTimetable[day][sessionIdx]
    if (newLecturerId) {
      const lecturer = lecturers.find(l => l.id === newLecturerId)
      session.lecturer = lecturer
    } else {
      session.lecturer = null
    }
    setTimetable(newTimetable)
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
          <div className="flex flex-wrap items-center gap-3 mt-1">
            <h1 className="text-2xl font-bold tracking-tight text-brand-950 sm:text-3xl">Timetable Generator</h1>
            <button
              onClick={() => navigate('/schedule')}
              className="inline-flex items-center gap-1.5 rounded-xl border border-brand-200 bg-brand-50/80 px-3 py-1.5 text-xs font-semibold text-brand-800 transition hover:bg-brand-100"
            >
              <Icon name="table" className="h-4 w-4 text-brand-600" />
              View All Classes Master Schedule Grid
            </button>
          </div>
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

            <button onClick={handleExportExcel} className="inline-flex items-center gap-2 rounded-xl bg-emerald-600 px-4 py-2.5 text-sm font-semibold text-white shadow-md hover:bg-emerald-700">
              <span className="text-base">📊</span> Excel
            </button>
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

            {/* Step 1 - Semester */}
            <div>
              <label className="block text-sm font-bold text-brand-950 mb-1.5">
                <span className="mr-2 inline-flex h-5 w-5 items-center justify-center rounded-full bg-brand-600 text-xs text-white font-bold">1</span>
                Semester
              </label>
              <select
                value={selectedSemesterId}
                onChange={e => saveSemester(e.target.value)}
                className="w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm text-slate-700 outline-none focus:border-brand-600"
              >
                <option value="">— Select Semester —</option>
                {sortedSemesters.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
              </select>
              {sortedSemesters.length === 0 && (
                <p className="mt-1.5 text-xs text-amber-600">No semesters have classes assigned yet. Go to <b>Classes</b> and use &ldquo;Set Semester&rdquo; on each year card.</p>
              )}
              {selectedSemesterId && semesterClasses.length === 0 && (
                <p className="mt-1.5 text-xs text-amber-600">No classes are assigned to this semester yet. Go to Classes and use &ldquo;Set Semester&rdquo; to assign them.</p>
              )}
            </div>

            {/* Step 2 - Class */}
            <div>
              <label className="block text-sm font-bold text-brand-950 mb-1.5">
                <span className="mr-2 inline-flex h-5 w-5 items-center justify-center rounded-full bg-brand-600 text-xs text-white font-bold">2</span>
                Class
              </label>
              <select
                value={selectedClassId}
                onChange={e => saveClass(e.target.value)}
                disabled={!selectedSemesterId}
                className="w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm text-slate-700 outline-none focus:border-brand-600 disabled:opacity-40"
              >
                <option value="">— Select Class —</option>
                {semesterClasses.map(c => {
                  const isSaved = !!savedTimetableMap[`${c.id}_${selectedSemesterId}`]
                  return (
                    <option key={c.id} value={c.id}>
                      {c.name} – {c.shift} Shift {isSaved ? '✓ (Saved)' : ''}
                    </option>
                  )
                })}
              </select>
            </div>

            {/* Status: already has a timetable */}
            {alreadyHasTimetable && selectedClassId && selectedSemesterId && (
              <div className="rounded-xl border border-blue-300 bg-blue-50 px-4 py-3 text-sm text-blue-900 flex items-start gap-2">
                <span className="text-lg">ℹ️</span>
                <div>
                  <b>{selectedClass?.name}</b> already has a saved timetable for <b>{selectedSemester?.name}</b>.
                  <p className="mt-1 text-xs text-blue-700">You can click below to generate a new layout or click &quot;Master Schedule Grid&quot; to see all timetables together.</p>
                </div>
              </div>
            )}

            {/* Warning: no subjects in semester */}
            {selectedSemesterId && !semesterSubjects.length && (
              <div className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700 flex items-start gap-2">
                <span className="text-lg">❌</span>
                <span>No subjects found for this semester. Please add subjects to the semester first.</span>
              </div>
            )}

            <button
              onClick={handleGenerate}
              disabled={!selectedSemesterId || !selectedClassId || !semesterSubjects.length}
              className="w-full rounded-xl bg-brand-600 py-3 font-bold text-white shadow-md shadow-brand-600/20 transition hover:bg-brand-800 disabled:opacity-40 disabled:cursor-not-allowed flex items-center justify-center gap-2"
            >
              <Icon name="wand" className="h-5 w-5" />
              {alreadyHasTimetable ? 'Generate / Shuffle New Timetable' : 'Generate Timetable'}
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
                          // morningEarly: 7:00 AM start — used when a day has more than 4 sessions (overflow)
                          // morningDefault: 7:45 AM start — used for standard ≤4-session days
                          // Morning capacity = 20 periods/week (4 per day × 5 days)
                          // Each extra period beyond 20 requires one day to start at 7:00 AM
                          const morningEarly = [
                            '07:00 AM - 07:45 AM', '07:45 AM - 08:45 AM', '08:45 AM - 09:45 AM',
                            '10:15 AM - 11:15 AM', '11:15 AM - 12:15 PM', '12:15 PM - 01:15 PM', '01:15 PM - 02:15 PM'
                          ]
                          const morningDefault = [
                            '07:45 AM - 08:45 AM', '08:45 AM - 09:45 AM', '10:15 AM - 11:15 AM',
                            '11:15 AM - 12:15 PM', '12:15 PM - 01:15 PM', '01:15 PM - 02:15 PM', '02:15 PM - 03:15 PM'
                          ]
                          
                          // Any day with more than 4 sessions needs the early 7:00 AM slot
                          if (daySessions.length > 4) {
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
                              {!isSaved && generated ? (
                                <select 
                                  value={session.lecturer ? session.lecturer.id : ''}
                                  onChange={(e) => handleLecturerChange(day, idx, e.target.value)}
                                  className="w-full bg-transparent outline-none border-b border-dashed border-slate-300 focus:border-brand-500 py-1"
                                >
                                  <option value="">-- No Lecturer --</option>
                                  {getAvailableLecturersForSession(session.subject, day, session.slotIndex, session.lecturer?.id).map(l => (
                                    <option key={l.id} value={l.id}>{l.name}</option>
                                  ))}
                                </select>
                              ) : (
                                session.lecturer ? session.lecturer.name : <span className="italic text-slate-400">No Lecture</span>
                              )}
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

