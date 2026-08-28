import React, { useState, useEffect, useMemo, useRef } from 'react'
import { useOutletContext, useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { Icon } from '../components/Icon'
import { Empty } from '../components/Empty'
import html2pdf from 'html2pdf.js'
import * as XLSX from 'xlsx'

const DAYS = ['Saturday', 'Sunday', 'Monday', 'Tuesday', 'Wednesday']
const DAY_SHORT = { Saturday: 'Sat', Sunday: 'Sun', Monday: 'Mon', Tuesday: 'Tue', Wednesday: 'Wed' }

// Morning shift: 20 standard periods/week (4 per day × 5 days, 7:45 AM – 12:15 PM).
// Extra hours may use 7:00 AM or the 1:00–3:00 PM overflow slots.
const MORNING_STANDARD_SLOTS = [
  { slotIndex: 0, time: '7:45 AM – 8:45 AM' },
  { slotIndex: 1, time: '8:45 AM – 9:45 AM' },
  { isBreak: true, time: '9:45 AM – 10:15 AM (Break)' },
  { slotIndex: 2, time: '10:15 AM – 11:15 AM' },
  { slotIndex: 3, time: '11:15 AM – 12:15 PM' },
]



const AFTERNOON_SLOTS = [
  { slotIndex: 0, time: '1:00 PM – 1:50 PM' },
  { slotIndex: 1, time: '1:50 PM – 2:40 PM' },
  { slotIndex: 2, time: '2:40 PM – 3:30 PM' },
  { isBreak: true, time: '3:30 PM – 4:00 PM (Break)' },
  { slotIndex: 3, time: '4:00 PM – 5:00 PM' },
]

// Soft, professional pastel color palette matching standard Excel schedules
const PASTEL_COLORS = [
  { bg: '#dbeafe', text: '#1e40af' }, // Soft Blue
  { bg: '#fef3c7', text: '#92400e' }, // Soft Amber
  { bg: '#dcfce7', text: '#166534' }, // Soft Green
  { bg: '#f3e8ff', text: '#6b21a8' }, // Soft Purple
  { bg: '#ffe4e6', text: '#9f1239' }, // Soft Rose
  { bg: '#cff4fc', text: '#055160' }, // Soft Cyan
  { bg: '#ffedd5', text: '#9a3412' }, // Soft Orange
  { bg: '#e0e7ff', text: '#3730a3' }, // Soft Indigo
]

function getSubjectStyle(subjectId) {
  if (!subjectId) return { bg: '#ffffff', text: '#000000' }
  let hash = 0
  for (let i = 0; i < subjectId.length; i++) hash = (hash << 5) - hash + subjectId.charCodeAt(i)
  return PASTEL_COLORS[Math.abs(hash) % PASTEL_COLORS.length]
}

function exportTableToExcel(tableElement, filename) {
  if (!tableElement) return
  const tables = Array.from(tableElement.querySelectorAll('table'))
  if (!tables.length) throw new Error('No schedule table was found.')

  const workbook = XLSX.utils.book_new()
  tables.forEach((table, index) => {
    const worksheet = XLSX.utils.table_to_sheet(table, { raw: true })
    worksheet['!cols'] = Array.from({ length: Math.max(2, table.rows[0]?.cells.length || 2) }, (_, column) => ({ wch: column < 2 ? 20 : 28 }))
    const sheetName = tables.length === 1 ? 'Schedule' : `Schedule ${index + 1}`
    XLSX.utils.book_append_sheet(workbook, worksheet, sheetName)
  })

  // This writes a real Excel workbook, not an HTML file with an .xls suffix.
  XLSX.writeFile(workbook, `${filename}.xlsx`, { compression: true })
}

function getSlotTimeLabel(shift, slotIndex, slotKind) {
  if (shift === 'Afternoon') {
    const slots = ['1:00–1:50 PM', '1:50–2:40 PM', '2:40–3:30 PM', '4:00–5:00 PM', '5:00–5:50 PM', '5:50–6:40 PM']
    return slots[slotIndex] || `Slot ${slotIndex + 1}`
  } else {
    if (slotKind === 'early') return '7:00–7:45 AM'
    if (slotKind === 'afternoon_1') return '1:00–2:00 PM'
    if (slotKind === 'afternoon_2') return '2:00–3:00 PM'
    if (slotIndex === 5) return '1:00–2:00 PM'
    if (slotIndex === 6) return '2:00–3:00 PM'
    if (slotIndex === 4) return '7:00–7:45 AM'
    const slots = ['7:45–8:45 AM', '8:45–9:45 AM', '10:15–11:15 AM', '11:15 AM–12:15 PM']
    return slots[slotIndex] || `Slot ${slotIndex + 1}`
  }
}

export function Schedule() {
  const { classes, semesters, lecturers = [], setNotice, academicYears } = useOutletContext()
  const navigate = useNavigate()
  const printRef = useRef()

  const [activeTab, setActiveTab] = useState('classes') // 'classes' | 'lecturers'
  // Use academic year instead of single semester — shows all depts together
  const semesterLevels = useMemo(() => {
    const levels = new Set()
    semesters?.forEach(sem => {
      const baseName = sem.name.replace(/\s*\(.*?\)/, '').trim()
      levels.add(baseName)
    })
    return Array.from(levels).sort((a, b) => {
       const numA = parseInt(a.match(/\d+/)?.[0] || '0', 10)
       const numB = parseInt(b.match(/\d+/)?.[0] || '0', 10)
       return numA - numB || a.localeCompare(b)
    })
  }, [semesters])

  const [selectedSemesterLevel, setSelectedSemesterLevel] = useState(() => {
    return semesterLevels[0] || ''
  })
  const [selectedShift, setSelectedShift] = useState('All') // 'All', 'Morning', 'Afternoon'
  const [selectedLecturerId, setSelectedLecturerId] = useState('All') // 'All' or specific lecturer id
  const [timetablesData, setTimetablesData] = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!selectedSemesterLevel && semesterLevels.length > 0) {
      setSelectedSemesterLevel(semesterLevels[0])
    }
  }, [semesterLevels, selectedSemesterLevel])

  // Fetch timetables directly from Supabase DB
  const loadTimetables = async () => {
    setLoading(true)
    try {
      const { data, error } = await supabase
        .from('timetables')
        .select('*')
      
      if (error) throw error
      setTimetablesData(data || [])
    } catch (err) {
      setNotice(`Failed to load timetables: ${err.message}`, 'error')
    }
    setLoading(false)
  }

  useEffect(() => {
    loadTimetables()
  }, [selectedSemesterLevel])

  // Filter classes by semester level & shift
  const semesterClasses = useMemo(() => {
    if (!selectedSemesterLevel) return []
    const matchingSemesterIds = semesters
      .filter(sem => sem.name.replace(/\s*\(.*?\)/, '').trim() === selectedSemesterLevel)
      .map(sem => sem.id)
    return classes
      .filter(c => matchingSemesterIds.includes(c.semester_id))
      .filter(c => selectedShift === 'All' || c.shift === selectedShift)
      .sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true }))
  }, [classes, selectedSemesterLevel, selectedShift, semesters])

  const morningClasses = useMemo(() => semesterClasses.filter(c => c.shift === 'Morning'), [semesterClasses])
  const afternoonClasses = useMemo(() => semesterClasses.filter(c => c.shift === 'Afternoon'), [semesterClasses])

  // Map classId -> grid timetable object (from ANY semester, just match by classId)
  const timetablesByClass = useMemo(() => {
    const map = {}
    timetablesData.forEach(row => {
      map[row.class_id] = row.grid
    })
    return map
  }, [timetablesData])

  // Used only for an individual lecturer report. Unlike the master table,
  // this deliberately includes every saved class from every semester.
  const allLecturerSessions = useMemo(() => {
    const map = {}
    const classesById = Object.fromEntries(classes.map(cls => [cls.id, cls]))
    timetablesData.forEach(row => {
      const cls = classesById[row.class_id]
      if (!cls) return
      DAYS.forEach(day => {
        ;(row.grid?.[day] || []).forEach(session => {
          const lecturerId = session?.lecturer?.id
          if (!lecturerId) return
          if (!map[lecturerId]) map[lecturerId] = Object.fromEntries(DAYS.map(name => [name, []]))
          map[lecturerId][day].push({
            classObj: cls,
            subject: session.subject,
            type: session.type,
            slotIndex: session.slotIndex,
            slotKind: session.slotKind,
            timeLabel: getSlotTimeLabel(cls.shift || 'Morning', session.slotIndex, session.slotKind),
          })
        })
      })
    })
    DAYS.forEach(day => Object.values(map).forEach(byDay => byDay[day].sort((a, b) => a.timeLabel.localeCompare(b.timeLabel))))
    return map
  }, [classes, timetablesData])

  const allScheduledLecturers = useMemo(() => {
    const ids = new Set(Object.keys(allLecturerSessions))
    return lecturers.filter(lecturer => ids.has(lecturer.id)).sort((a, b) => a.name.localeCompare(b.name))
  }, [allLecturerSessions, lecturers])

  // Map lecturerId -> day -> `${shift}_${slotIndex}` -> array of { classObj, subject, type, slotIndex }
  const lecturerScheduleMap = useMemo(() => {
    const map = {}

    semesterClasses.forEach(cls => {
      const grid = timetablesByClass[cls.id]
      if (!grid) return

      DAYS.forEach(day => {
        if (!grid[day] || !Array.isArray(grid[day])) return
        grid[day].forEach(session => {
          if (session && session.lecturer && session.lecturer.id) {
            const lid = session.lecturer.id
            if (!map[lid]) {
              map[lid] = { Saturday: {}, Sunday: {}, Monday: {}, Tuesday: {}, Wednesday: {} }
            }
            const key = `${cls.shift || 'Morning'}_${session.slotIndex}`
            if (!map[lid][day][key]) {
              map[lid][day][key] = []
            }
            map[lid][day][key].push({
              classObj: cls,
              subject: session.subject,
              type: session.type,
              slotIndex: session.slotIndex,
              slotKind: session.slotKind
            })
          }
        })
      })
    })

    return map
  }, [semesterClasses, classes, activeTab, timetablesByClass])

  // Active lecturers who have assignments in this semester / shift
  const activeLecturers = useMemo(() => {
    const activeIds = new Set(Object.keys(lecturerScheduleMap))
    const list = lecturers.filter(l => activeIds.has(l.id))
    return list.sort((a, b) => a.name.localeCompare(b.name))
  }, [lecturers, lecturerScheduleMap])

  const morningLecturers = useMemo(() => {
    const ids = new Set()
    morningClasses.forEach(cls => {
      const grid = timetablesByClass[cls.id]
      if (!grid) return
      DAYS.forEach(day => {
        if (grid[day] && Array.isArray(grid[day])) {
          grid[day].forEach(s => {
            if (s?.lecturer?.id) ids.add(s.lecturer.id)
          })
        }
      })
    })
    return activeLecturers.filter(l => ids.has(l.id))
  }, [activeLecturers, morningClasses, timetablesByClass])

  const afternoonLecturers = useMemo(() => {
    const ids = new Set()
    afternoonClasses.forEach(cls => {
      const grid = timetablesByClass[cls.id]
      if (!grid) return
      DAYS.forEach(day => {
        if (grid[day] && Array.isArray(grid[day])) {
          grid[day].forEach(s => {
            if (s?.lecturer?.id) ids.add(s.lecturer.id)
          })
        }
      })
    })
    return activeLecturers.filter(l => ids.has(l.id))
  }, [activeLecturers, afternoonClasses, timetablesByClass])

  // Helper: get ordered sessions for a lecturer on a day
  const getLecturerDaySessions = (lecId, day) => {
    const dayMap = lecturerScheduleMap[lecId]?.[day]
    if (!dayMap) return []
    
    const result = []
    const keys = Object.keys(dayMap)
    
    keys.sort((a, b) => {
      const [shiftA, idxAStr] = a.split('_')
      const [shiftB, idxBStr] = b.split('_')
      if (shiftA !== shiftB) {
        return shiftA === 'Morning' ? -1 : 1
      }
      const idxA = Number(idxAStr)
      const idxB = Number(idxBStr)
      if (idxA === 4) return -1
      if (idxB === 4) return 1
      return idxA - idxB
    })

    keys.forEach(key => {
      const sessions = dayMap[key]
      if (Array.isArray(sessions)) {
        const isClash = sessions.length > 1
        sessions.forEach(s => {
          result.push({
            ...s,
            isClash,
            timeLabel: getSlotTimeLabel(s.classObj.shift || selectedShift, s.slotIndex, s.slotKind)
          })
        })
      }
    })
    return result
  }

  // Detect teacher clashes across classes in the SAME shift
  const conflicts = useMemo(() => {
    const clashList = []
    const clashCellKeys = new Set()

    DAYS.forEach(day => {
      const slotIndices = [0, 1, 2, 3, 4, 5, 6]
      
      const shifts = ['Morning', 'Afternoon']
      shifts.forEach(shift => {
        slotIndices.forEach(slotIdx => {
          const lecturerMap = {}

          semesterClasses.filter(c => (c.shift || 'Morning') === shift).forEach(cls => {
            const grid = timetablesByClass[cls.id]
            if (!grid || !grid[day] || !Array.isArray(grid[day])) return

            const session = grid[day].find(s => s && s.slotIndex === slotIdx)
            if (session && session.lecturer && session.lecturer.id) {
              const lid = session.lecturer.id
              if (!lecturerMap[lid]) lecturerMap[lid] = []
              lecturerMap[lid].push({ classObj: cls, session })
            }
          })

          Object.entries(lecturerMap).forEach(([lid, assignments]) => {
            if (assignments.length > 1) {
              const lecturerName = assignments[0].session.lecturer.name
              const classNames = assignments.map(a => a.classObj.name).join(', ')
              
              clashList.push({
                day,
                shift,
                slotIdx,
                lecturerId: lid,
                lecturerName,
                classes: assignments.map(a => a.classObj),
                classNames
              })

              clashCellKeys.add(`${day}_${shift}_${slotIdx}_${lid}`)
            }
          })
        })
      })
    })

    return { clashList, clashCellKeys }
  }, [semesterClasses, classes, activeTab, timetablesByClass])

  const handlePrint = () => window.print()

  const handleDownloadPdf = () => {
    const el = printRef.current
    const tabName = activeTab === 'classes' ? 'Classes' : 'Lecturers'
    html2pdf()
      .set({
        margin: 6,
        filename: `Schedule_${tabName}_${(selectedSemesterLevel || 'All_Semesters').replace(/\s+/g, '_')}.pdf`,
        image: { type: 'jpeg', quality: 0.98 },
        html2canvas: { scale: 2, useCORS: true },
        jsPDF: { unit: 'mm', format: 'a3', orientation: 'landscape' },
      })
      .from(el)
      .save()
  }

  const handleExportExcel = () => {
    const el = printRef.current
    if (!el) {
      setNotice('No schedule is available to export yet.', 'error')
      return
    }
    const tabName = activeTab === 'classes' ? 'Classes' : 'Lecturers'
    const filename = `Schedule_${tabName}_${(selectedSemesterLevel || 'All_Semesters').replace(/\s+/g, '_')}`
    try {
      exportTableToExcel(el, filename)
      setNotice(`Master ${tabName} Schedule download started.`, 'success')
    } catch (error) {
      setNotice(`Excel export failed: ${error.message}`, 'error')
    }
  }

  // Renders the master schedule grid for Classes.
  const renderGridTable = (classList, shiftName, slots) => {
    if (!classList.length) return null

    const isMorning = shiftName === 'Morning'
    const highestSlotByDay = {}
    DAYS.forEach(day => {
      highestSlotByDay[day] = classList.reduce((highest, cls) => {
        const slotIndexes = (timetablesByClass[cls.id]?.[day] || []).map(session => session?.slotIndex ?? -1)
        return Math.max(highest, ...slotIndexes, -1)
      }, -1)
    })

    // Older saved grids use shifted indexes on early-start days. New grids use
    // stable physical indexes plus slotKind, so both formats remain viewable.
    const classOverflowMap = {} // { classId: { day: boolean } }
    const dayHasOverflow = {}   // { day: boolean } — true if ANY class has overflow that day
    const dayHasSixthPeriod = {} // { day: boolean } — true if ANY class has a sixth period
    const dayUsesNewSlotModel = {}
    const dayHasNewEarly = {}
    const dayHasAfternoonOne = {}
    const dayHasAfternoonTwo = {}
    if (isMorning) {
      DAYS.forEach(day => {
        dayHasOverflow[day] = false; dayHasSixthPeriod[day] = false
        dayUsesNewSlotModel[day] = false; dayHasNewEarly[day] = false
        dayHasAfternoonOne[day] = false; dayHasAfternoonTwo[day] = false
      })
      classList.forEach(cls => {
        classOverflowMap[cls.id] = {}
        const grid = timetablesByClass[cls.id]
        DAYS.forEach(day => {
          const sessions = grid?.[day] || []
          const hasNewSlots = sessions.some(s => s.slotKind)
          const hasOvf = !!(sessions.some(s => s.slotIndex === 4))
          classOverflowMap[cls.id][day] = hasOvf
          if (hasNewSlots) {
            dayUsesNewSlotModel[day] = true
            if (sessions.some(s => s.slotKind === 'early')) dayHasNewEarly[day] = true
            if (sessions.some(s => s.slotKind === 'afternoon_1')) dayHasAfternoonOne[day] = true
            if (sessions.some(s => s.slotKind === 'afternoon_2')) dayHasAfternoonTwo[day] = true
          } else {
            if (hasOvf) dayHasOverflow[day] = true
            if (sessions.some(s => s.slotIndex === 5)) dayHasSixthPeriod[day] = true
          }
        })
      })
    }

    return (
      <div className="mb-8">
        {selectedShift === 'All' && (
          <h2 className="mb-3 text-base font-bold text-brand-950 flex items-center gap-2">
            <span className={`h-2.5 w-2.5 rounded-full ${shiftName === 'Morning' ? 'bg-amber-500' : 'bg-indigo-600'}`}></span>
            {shiftName} Shift Classes ({classList.length})
          </h2>
        )}

        <div className="overflow-x-auto rounded-xl border border-black bg-white shadow-xs">
          <table className="w-full min-w-[850px] border-collapse text-center text-xs">
            <thead>
              <tr className="border-b border-black">
                <th className="border-r border-black bg-white px-3 py-2 text-center font-bold text-black w-20 corner-header">
                  Days
                </th>
                <th className="border-r border-black bg-white px-3 py-2 text-center font-bold text-black w-36 corner-header">
                  Time
                </th>
                {classList.map(cls => (
                  <th
                    key={cls.id}
                    onClick={() => navigate(`/timetable?classId=${cls.id}`)}
                    className="cursor-pointer border-r border-black bg-[#ffff00] px-4 py-2.5 text-center font-bold text-black transition hover:bg-yellow-400"
                    title="Click to view/edit timetable for this class"
                  >
                    {cls.name}
                  </th>
                ))}
              </tr>
            </thead>

            <tbody className="divide-y divide-black bg-white">
              {DAYS.map(day => {
                // Overflow days include the 7:00 AM early slot. A sixth period
                // resumes at 1:00 PM after the midday break.
                // Standard days show 5 rows starting at 7:45 AM.
                const daySlots = !isMorning
                  ? [
                      ...slots,
                      ...(highestSlotByDay[day] >= 4 ? [{ slotIndex: 4, time: '5:00 PM – 5:50 PM' }] : []),
                      ...(highestSlotByDay[day] >= 5 ? [{ slotIndex: 5, time: '5:50 PM – 6:40 PM' }] : []),
                    ]
                  : dayUsesNewSlotModel[day]
                    ? [
                        ...(dayHasNewEarly[day] ? [{ slotIndex: 4, time: '7:00 AM – 7:45 AM' }] : []),
                        { slotIndex: 0, time: '7:45 AM – 8:45 AM' },
                        { slotIndex: 1, time: '8:45 AM – 9:45 AM' },
                        { isBreak: true, time: '9:45 AM – 10:15 AM (Break)' },
                        { slotIndex: 2, time: '10:15 AM – 11:15 AM' },
                        { slotIndex: 3, time: '11:15 AM – 12:15 PM' },
                        ...((dayHasAfternoonOne[day] || dayHasAfternoonTwo[day]) ? [{ isBreak: true, time: '12:15 PM – 1:00 PM (Break)' }] : []),
                        ...(dayHasAfternoonOne[day] ? [{ slotIndex: 5, time: '1:00 PM – 2:00 PM' }] : []),
                        ...(dayHasAfternoonTwo[day] ? [{ slotIndex: 6, time: '2:00 PM – 3:00 PM' }] : []),
                      ]
                  : dayHasOverflow[day]
                    ? [
                        { slotIndex: 0, time: '7:00 AM – 7:45 AM' },
                        { slotIndex: 1, time: '7:45 AM – 8:45 AM' },
                        { slotIndex: 2, time: '8:45 AM – 9:45 AM' },
                        { isBreak: true, time: '9:45 AM – 10:15 AM (Break)' },
                        { slotIndex: 3, time: '10:15 AM – 11:15 AM' },
                        { slotIndex: 4, time: '11:15 AM – 12:15 PM' },
                        ...(dayHasSixthPeriod[day] ? [
                          { isBreak: true, time: '12:15 PM – 1:00 PM (Break)' },
                          { slotIndex: 5, time: '1:00 PM – 2:00 PM' },
                        ] : []),
                      ]
                    : [
                        { slotIndex: 0, time: '7:45 AM – 8:45 AM' },
                        { slotIndex: 1, time: '8:45 AM – 9:45 AM' },
                        { isBreak: true, time: '9:45 AM – 10:15 AM (Break)' },
                        { slotIndex: 2, time: '10:15 AM – 11:15 AM' },
                        { slotIndex: 3, time: '11:15 AM – 12:15 PM' },
                      ]

                return (
                  <React.Fragment key={day}>
                    {daySlots.map((slot, slotIdx) => {
                      const isBreak = slot.isBreak
                      return (
                        <tr key={`${day}_${slot.time}`} className="border-b border-black">
                          {slotIdx === 0 && (
                            <td
                              rowSpan={daySlots.length}
                              className="border-r border-black bg-white px-3 py-2 text-center font-bold text-black align-middle day-col text-sm"
                            >
                              {DAY_SHORT[day]}
                            </td>
                          )}

                          <td className="border-r border-black bg-white px-2 py-2 text-center font-medium text-slate-900 time-col whitespace-nowrap">
                            {slot.time}
                          </td>

                          {classList.map(cls => {
                            if (isBreak) {
                              return (
                                <td key={cls.id} className="border-r border-black bg-amber-50 px-2 py-2 text-center text-amber-900 font-semibold text-xs">
                                   Break
                                </td>
                              )
                            }

                            // On overflow days (6-row layout): non-overflow classes need special handling.
                            // - The 7:00–7:45 row (slot.slotIndex === 0) has no match → show blank.
                            // - Rows 1–4 (7:45, 8:45, 10:15, 11:15) map to slotIndex 0–3 for non-overflow classes.
                            const hasOverflow = isMorning ? classOverflowMap[cls.id]?.[day] : true
                            const dayIsOverflow = isMorning && dayHasOverflow[day]

                            if (dayIsOverflow && !hasOverflow && slot.slotIndex === 0) {
                              // 7:00–7:45 row: this class has no early session
                              return <td key={cls.id} className="border-r border-black bg-slate-50 px-2 py-2" />
                            }

                            // For non-overflow classes on an overflow day, shift slotIndex down by 1
                            const effectiveSlot = (dayUsesNewSlotModel[day] || !(dayIsOverflow && !hasOverflow))
                              ? slot.slotIndex
                              : slot.slotIndex > 0
                              ? slot.slotIndex - 1
                              : slot.slotIndex

                            const grid = timetablesByClass[cls.id]
                            const session = grid && grid[day] ? grid[day].find(s => s.slotIndex === effectiveSlot) : null

                            if (!session) {
                              return (
                                <td key={cls.id} className="border-r border-black px-2 py-2 text-center text-slate-300 italic">
                                  —
                                </td>
                              )
                            }

                            const { subject, lecturer } = session
                            const isClashing = lecturer && conflicts.clashCellKeys.has(`${day}_${cls.shift || 'Morning'}_${effectiveSlot}_${lecturer.id}`)
                            const style = getSubjectStyle(subject?.id)
                            const cellText = `${subject?.name || 'Subject'}${lecturer ? ' - ' + lecturer.name : ''}`

                            return (
                              <td
                                key={cls.id}
                                style={{
                                  backgroundColor: isClashing ? '#fee2e2' : style.bg,
                                  color: isClashing ? '#991b1b' : style.text
                                }}
                                className={`border-r border-black px-3 py-2.5 text-center align-middle font-medium text-xs transition ${
                                  isClashing ? 'ring-2 ring-red-500 font-bold' : ''
                                }`}
                              >
                                <div className="leading-tight">{cellText}</div>
                                {isClashing && (
                                  <div className="mt-1 text-[9px] font-bold text-red-700 uppercase tracking-wider">
                                    ⚠️ Clash
                                  </div>
                                )}
                              </td>
                            )
                          })}
                        </tr>
                      )
                    })}
                  </React.Fragment>
                )
              })}
            </tbody>
          </table>
        </div>
      </div>
    )
  }

  // Professional Lecturer Table: Rows = Lecturers, Columns = Days
  const renderLecturerRowsTable = (lecturerList) => {
    if (!lecturerList.length) return null

    return (
      <div className="mb-8">
        <div className="overflow-x-auto rounded-xl border border-black bg-white shadow-xs">
          <table className="w-full min-w-[950px] border-collapse text-left text-xs">
            <thead>
              <tr className="border-b border-black bg-[#ffff00]">
                <th className="border-r border-black px-4 py-3.5 font-bold text-black w-48 corner-header">
                  Lecturer Name
                </th>
                {DAYS.map(day => (
                  <th key={day} className="border-r border-black px-3 py-3.5 text-center font-bold text-black">
                    {day}
                  </th>
                ))}
                <th className="px-3 py-3.5 text-center font-bold text-black w-24">
                  Total Load
                </th>
              </tr>
            </thead>

            <tbody className="divide-y divide-black bg-white">
              {lecturerList.map((lec, idx) => {
                let totalPeriods = 0
                DAYS.forEach(day => {
                  const dayMap = lecturerScheduleMap[lec.id]?.[day]
                  if (dayMap) {
                    Object.values(dayMap).forEach(arr => totalPeriods += arr.length)
                  }
                })

                return (
                  <tr key={lec.id} className="border-b border-black hover:bg-slate-50/60 transition">
                    {/* Lecturer Info Column */}
                    <td className="border-r border-black px-4 py-3.5 font-semibold text-brand-950 align-top w-48 bg-white">
                      <div className="flex items-start gap-2.5">
                        <div className="mt-0.5 grid h-7 w-7 shrink-0 place-items-center rounded-full bg-brand-600 text-xs font-bold text-white shadow-xs">
                          {lec.name.charAt(0)}
                        </div>
                        <div>
                          <button
                            onClick={() => setSelectedLecturerId(lec.id)}
                            className="font-bold text-brand-950 hover:text-brand-600 text-left transition text-xs"
                            title="Click to view individual schedule for this lecturer"
                          >
                            {lec.name}
                          </button>
                          <div className="text-[10px] text-slate-500 font-normal mt-0.5">
                            ID: {lec.lecturer_id || 'N/A'}
                          </div>
                        </div>
                      </div>
                    </td>

                    {/* Days Columns (Sat - Wed) */}
                    {DAYS.map(day => {
                      const sessions = getLecturerDaySessions(lec.id, day)

                      return (
                        <td key={day} className="border-r border-black px-2 py-2.5 align-top text-center min-w-[130px]">
                          {sessions.length === 0 ? (
                            <span className="inline-block py-2 text-slate-300 italic text-xs">—</span>
                          ) : (
                            <div className="space-y-1.5 text-left">
                              {sessions.map((s, sIdx) => {
                                const style = getSubjectStyle(s.subject?.id)
                                return (
                                  <div
                                    key={`${s.classObj.id}_${s.slotIndex}_${sIdx}`}
                                    style={{
                                      backgroundColor: s.isClash ? '#fee2e2' : style.bg,
                                      color: s.isClash ? '#991b1b' : style.text
                                    }}
                                    className={`rounded-lg p-2 text-xs border border-black/10 shadow-2xs leading-snug transition ${
                                      s.isClash ? 'ring-2 ring-red-500 font-bold' : ''
                                    }`}
                                  >
                                    <div className="flex items-center justify-between gap-1 font-bold text-[11px]">
                                      <span className="truncate">{s.classObj.name}</span>
                                      <span className="shrink-0 text-[9.5px] font-semibold opacity-85 bg-black/5 px-1 rounded">
                                        {s.timeLabel.split('–')[0]}
                                      </span>
                                    </div>
                                    <div className="text-[10.5px] font-medium truncate mt-0.5 opacity-90">
                                      {s.subject?.name || 'Subject'}
                                    </div>
                                    {s.isClash && (
                                      <div className="mt-1 text-[9px] font-bold text-red-700 uppercase tracking-wider">
                                        ⚠️ Clash
                                      </div>
                                    )}
                                  </div>
                                )
                              })}
                            </div>
                          )}
                        </td>
                      )
                    })}

                    {/* Total Load Column */}
                    <td className="px-3 py-3.5 text-center font-bold align-middle w-24">
                      <span className="inline-flex items-center justify-center rounded-full bg-brand-50 px-2.5 py-1 text-xs font-bold text-brand-700 border border-brand-200">
                        {totalPeriods} hrs
                      </span>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </div>
    )
  }

  // Renders individual schedule for a single lecturer.
  const renderSingleLecturerSchedule = (lec) => {
    if (!lec) return null
    const sessionsByDay = allLecturerSessions[lec.id] || Object.fromEntries(DAYS.map(day => [day, []]))
    const totalPeriods = DAYS.reduce((total, day) => total + sessionsByDay[day].length, 0)

    return (
      <div className="lecturer-schedule rounded-xl border border-black bg-white p-5 text-black shadow-xs sm:p-8" style={{ fontFamily: "'Times New Roman', Times, serif" }}>
        <div className="mb-5 flex justify-between font-sans">
          <button onClick={() => setSelectedLecturerId('All')} className="rounded-xl border border-slate-200 bg-slate-50 px-3.5 py-2 text-xs font-semibold text-slate-700">← Back to All Lecturers</button>
          <span className="rounded-full bg-brand-50 px-3 py-1.5 text-xs font-bold text-brand-700">All semesters · {totalPeriods} periods</span>
        </div>
        <h2 className="mb-5 text-center text-lg font-bold sm:text-xl">Lecturer Period: {lec.lecturer_id || 'Lecturer'} - {lec.name}</h2>
        <div className="overflow-x-auto"><table className="w-full min-w-[650px] border-collapse text-left text-sm"><thead><tr><th className="border border-black px-3 py-2 text-center">Class</th><th className="border border-black px-3 py-2 text-center">Course</th><th className="border border-black px-3 py-2 text-center">Time</th><th className="border border-black px-3 py-2 text-center">Type</th></tr></thead><tbody>{DAYS.map(day => sessionsByDay[day].length ? <React.Fragment key={day}><tr><td colSpan={4} className="border border-black bg-[#d9eef9] px-3 py-1.5 text-center font-bold">{day}</td></tr>{sessionsByDay[day].map((session, index) => <tr key={`${day}-${session.classObj.id}-${index}`}><td className="border border-black px-3 py-1.5 font-semibold">{session.classObj.name}</td><td className="border border-black px-3 py-1.5">{session.subject?.name || 'Subject'}</td><td className="border border-black px-3 py-1.5 text-center whitespace-nowrap">{session.timeLabel}</td><td className="border border-black px-3 py-1.5 text-center">{session.type || '—'}</td></tr>)}</React.Fragment> : null)}</tbody></table></div>
        <p className="mt-1 text-center text-sm font-bold">Total Periods: {totalPeriods}</p>
      </div>
    )
  }

  const selectedLecturerObj = useMemo(() => {
    if (selectedLecturerId === 'All') return null
    return lecturers.find(l => l.id === selectedLecturerId)
  }, [lecturers, selectedLecturerId])

  return (
    <>
      <style>{`
        @media print {
          body * { visibility: hidden !important; }
          #schedule-print-content, #schedule-print-content * { visibility: visible !important; }
          #schedule-print-content { position: absolute; inset: 0 auto auto 0; width: 100%; }
          #schedule-print-content .lecturer-schedule { border: 0 !important; box-shadow: none !important; padding: 0 !important; }
        }
      `}</style>
      <header className="mb-6 flex flex-col justify-between gap-4 sm:flex-row sm:items-center">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-brand-950 sm:text-3xl">
            Master Schedule
          </h1>
          <p className="mt-1 text-xs text-slate-500">
            View all class and lecturer timetables in clean Excel grid layouts
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <button
            onClick={handleExportExcel}
            disabled={activeTab === 'classes' ? !semesterClasses.length : !activeLecturers.length}
            className="inline-flex items-center gap-1.5 rounded-xl border border-emerald-300 bg-emerald-50 px-4 py-2.5 text-sm font-semibold text-emerald-800 shadow-xs transition hover:bg-emerald-100 disabled:opacity-50"
          >
            <span>📊</span>
            Export to Excel
          </button>

          <button
            onClick={handleDownloadPdf}
            disabled={activeTab === 'classes' ? !semesterClasses.length : !activeLecturers.length}
            className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3.5 py-2.5 text-sm font-medium text-slate-700 shadow-xs transition hover:bg-slate-50 disabled:opacity-50"
          >
            <Icon name="print" className="h-4 w-4 text-slate-500" />
            PDF
          </button>

          <button
            onClick={handlePrint}
            disabled={activeTab === 'classes' ? !semesterClasses.length : !activeLecturers.length}
            className="inline-flex items-center gap-1.5 rounded-xl bg-brand-600 px-4 py-2.5 text-sm font-semibold text-white shadow-xs transition hover:bg-brand-700 disabled:opacity-50"
          >
            <Icon name="print" className="h-4 w-4" />
            Print
          </button>
        </div>
      </header>

      {/* Main Navigation Tabs: Classes Timetable vs Lecturers Timetable */}
      <div className="mb-6 flex border-b border-slate-200">
        <button
          onClick={() => { setActiveTab('classes'); setSelectedLecturerId('All') }}
          className={`flex items-center gap-2 border-b-2 px-5 py-3 text-sm font-bold transition ${
            activeTab === 'classes'
              ? 'border-brand-600 text-brand-600'
              : 'border-transparent text-slate-500 hover:border-slate-300 hover:text-slate-700'
          }`}
        >
          <Icon name="group" className="h-4 w-4" />
          Classes Timetable ({semesterClasses.length})
        </button>
        <button
          onClick={() => setActiveTab('lecturers')}
          className={`flex items-center gap-2 border-b-2 px-5 py-3 text-sm font-bold transition ${
            activeTab === 'lecturers'
              ? 'border-brand-600 text-brand-600'
              : 'border-transparent text-slate-500 hover:border-slate-300 hover:text-slate-700'
          }`}
        >
          <Icon name="users" className="h-4 w-4" />
          Lecturers Timetable ({activeLecturers.length})
        </button>
      </div>

      {/* Filter Bar */}
      <div className="mb-6 rounded-2xl border border-slate-200 bg-white p-4 shadow-xs">
        <div className="flex flex-wrap items-center gap-6">
          {activeTab === 'classes' && (
            <>
              <div className="flex items-center gap-3">
                <label className="text-xs font-bold uppercase tracking-wider text-slate-500">
                  Semesters:
                </label>
                <select
                  value={selectedSemesterLevel}
                  onChange={e => setSelectedSemesterLevel(e.target.value)}
                  className="rounded-xl border border-slate-300 bg-white px-3.5 py-2 text-sm font-semibold text-slate-800 outline-none focus:border-brand-500"
                >
                  {!(semesterLevels.length) && <option value="">No Semesters</option>}
                  {semesterLevels.map(level => (
                    <option key={level} value={level}>{level}</option>
                  ))}
                </select>
              </div>

              <div className="flex items-center gap-3">
                <label className="text-xs font-bold uppercase tracking-wider text-slate-500">
                  Shift:
                </label>
                <select
                  value={selectedShift}
                  onChange={e => setSelectedShift(e.target.value)}
                  className="rounded-xl border border-slate-300 bg-white px-3.5 py-2 text-sm font-semibold text-slate-800 outline-none focus:border-brand-500"
                >
                  <option value="All">All Shifts</option>
                  <option value="Morning">Morning Shift</option>
                  <option value="Afternoon">Afternoon Shift</option>
                </select>
              </div>
            </>
          )}

          {activeTab === 'lecturers' && (
            <div className="flex items-center gap-3">
              <label className="text-xs font-bold uppercase tracking-wider text-slate-500">
                Lecturer:
              </label>
              <select
                value={selectedLecturerId}
                onChange={e => setSelectedLecturerId(e.target.value)}
                className="rounded-xl border border-slate-300 bg-white px-3.5 py-2 text-sm font-semibold text-slate-800 outline-none focus:border-brand-500"
              >
                <option value="All">All Lecturers (Table View)</option>
                {allScheduledLecturers.map(l => (
                  <option key={l.id} value={l.id}>{l.name}</option>
                ))}
              </select>
            </div>
          )}

          <div className="ml-auto text-xs text-slate-500 font-medium">
            {activeTab === 'classes' ? (
              <>Classes: <b className="text-slate-900">{semesterClasses.length}</b></>
            ) : (
              <>Active Lecturers: <b className="text-slate-900">{activeLecturers.length}</b></>
            )}
          </div>
        </div>
      </div>

      {/* Conflict Warning Banner */}
      {conflicts.clashList.length > 0 && (
        <div className="mb-6 rounded-xl border border-red-300 bg-red-50 p-3.5 text-red-900 text-xs">
          <span className="font-bold">⚠️ {conflicts.clashList.length} Teacher Conflict(s) Found: </span>
          {conflicts.clashList.map(c => `${c.lecturerName} double-booked in ${c.classNames} on ${c.day}`).join('; ')}
        </div>
      )}

      {/* Schedule Content */}
      <div ref={printRef} id="schedule-print-content">
        {activeTab === 'classes' ? (
          !semesterClasses.length ? (
            <Empty
              title="No classes found for this selection"
              text="Ensure you have assigned classes to this semester in the Classes management page."
            />
          ) : (
            <>
              {selectedShift === 'All' ? (
                <>
                  {renderGridTable(morningClasses, 'Morning', MORNING_STANDARD_SLOTS)}
                  {renderGridTable(afternoonClasses, 'Afternoon', AFTERNOON_SLOTS)}
                </>
              ) : selectedShift === 'Morning' ? (
                renderGridTable(morningClasses, 'Morning', MORNING_STANDARD_SLOTS)
              ) : (
                renderGridTable(afternoonClasses, 'Afternoon', AFTERNOON_SLOTS)
              )}
            </>
          )
        ) : (
          /* Lecturers Tab */
          selectedLecturerId !== 'All' && selectedLecturerObj ? (
            renderSingleLecturerSchedule(selectedLecturerObj)
          ) : !activeLecturers.length ? (
            <Empty
              title="No lecturer schedules found for this selection"
              text="Generate timetables for classes in this semester using the Timetable page first."
            />
          ) : (
            <>
              {selectedShift === 'All' ? (
                renderLecturerRowsTable(activeLecturers)
              ) : selectedShift === 'Morning' ? (
                renderLecturerRowsTable(morningLecturers)
              ) : (
                renderLecturerRowsTable(afternoonLecturers)
              )}
            </>
          )
        )}
      </div>
    </>
  )
}

