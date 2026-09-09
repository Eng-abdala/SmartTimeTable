import React, { useState, useEffect, useMemo, useRef } from 'react'
import { useOutletContext, useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { Icon } from '../components/Icon'
import { Empty } from '../components/Empty'
import * as XLSXStyle from 'xlsx-js-style'
const XLSX = XLSXStyle.default || XLSXStyle

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

function colorToRgbHex(colorStr) {
  if (!colorStr) return null
  colorStr = String(colorStr).trim()
  if (colorStr === 'transparent' || colorStr === 'rgba(0, 0, 0, 0)') return null
  if (colorStr.startsWith('#')) {
    let hex = colorStr.slice(1)
    if (hex.length === 3) {
      hex = hex[0] + hex[0] + hex[1] + hex[1] + hex[2] + hex[2]
    }
    return hex.toUpperCase().slice(0, 6)
  }
  const rgbMatch = colorStr.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)/i)
  if (rgbMatch) {
    const r = parseInt(rgbMatch[1], 10).toString(16).padStart(2, '0')
    const g = parseInt(rgbMatch[2], 10).toString(16).padStart(2, '0')
    const b = parseInt(rgbMatch[3], 10).toString(16).padStart(2, '0')
    return (r + g + b).toUpperCase()
  }
  return null
}

const borderThinBlack = {
  top: { style: 'thin', color: { rgb: '000000' } },
  bottom: { style: 'thin', color: { rgb: '000000' } },
  left: { style: 'thin', color: { rgb: '000000' } },
  right: { style: 'thin', color: { rgb: '000000' } },
}

function exportTableToExcel(containerElement, filename) {
  if (!containerElement) return
  const tables = Array.from(containerElement.querySelectorAll('table'))
  if (!tables.length) throw new Error('No schedule table was found.')

  const workbook = XLSX.utils.book_new()

  tables.forEach((table, tableIndex) => {
    // Determine sheet name
    let sheetName = ''
    const parentContainer = table.closest('.mb-8') || table.parentElement
    const heading = parentContainer?.querySelector('h2')
    const headingText = heading?.textContent || ''

    if (headingText.includes('Morning')) {
      sheetName = 'Morning Shift'
    } else if (headingText.includes('Afternoon')) {
      sheetName = 'Afternoon Shift'
    } else if (table.closest('.lecturer-schedule')) {
      sheetName = 'Lecturer Schedule'
    } else if (tables.length === 1) {
      sheetName = 'Master Schedule'
    } else {
      sheetName = `Schedule ${tableIndex + 1}`
    }

    // Clean sheetName for Excel rules (max 31 chars, no invalid characters)
    sheetName = sheetName.replace(/[/\\?*:[\]]/g, '').slice(0, 31).trim() || `Sheet ${tableIndex + 1}`

    // Build 2D grid matrix accounting for rowSpan & colSpan
    const grid = []
    let maxCol = 0

    for (let r = 0; r < table.rows.length; r++) {
      if (!grid[r]) grid[r] = []
      const row = table.rows[r]
      let c = 0
      for (let ci = 0; ci < row.cells.length; ci++) {
        while (grid[r][c]) {
          c++
        }
        const cellEl = row.cells[ci]
        const rowspan = cellEl.rowSpan || 1
        const colspan = cellEl.colSpan || 1
        for (let dr = 0; dr < rowspan; dr++) {
          for (let dc = 0; dc < colspan; dc++) {
            if (!grid[r + dr]) grid[r + dr] = []
            grid[r + dr][c + dc] = { cellEl, isOrigin: dr === 0 && dc === 0 }
          }
        }
        c += colspan
        if (c > maxCol) maxCol = c
      }
    }

    const numRows = grid.length
    const numCols = maxCol

    if (numRows === 0 || numCols === 0) return

    const worksheet = {}
    const merges = []
    const rowHeights = []
    const colWidths = []

    const isClassGrid = table.querySelector('.day-col') !== null || table.querySelector('.time-col') !== null

    for (let c = 0; c < numCols; c++) {
      if (isClassGrid) {
        if (c === 0) colWidths.push({ wch: 14 })       // Days
        else if (c === 1) colWidths.push({ wch: 26 })  // Time
        else colWidths.push({ wch: 32 })               // Class columns
      } else {
        if (c === 0) colWidths.push({ wch: 28 })       // Lecturer Name / Class
        else if (c === numCols - 1) colWidths.push({ wch: 18 }) // Total Load / Type
        else colWidths.push({ wch: 30 })               // Day sessions
      }
    }

    for (let r = 0; r < numRows; r++) {
      let isHeaderRow = r === 0
      let isBreakRow = false

      for (let c = 0; c < numCols; c++) {
        const item = grid[r]?.[c]
        const cellRef = XLSX.utils.encode_cell({ r, c })

        if (!item) {
          worksheet[cellRef] = {
            v: '',
            t: 's',
            s: {
              fill: { fgColor: { rgb: 'FFFFFF' } },
              font: { name: 'Arial', sz: 9.5, color: { rgb: '000000' } },
              alignment: { horizontal: 'center', vertical: 'center', wrapText: true },
              border: borderThinBlack
            }
          }
          continue
        }

        const { cellEl, isOrigin } = item
        const rowspan = cellEl.rowSpan || 1
        const colspan = cellEl.colSpan || 1

        if (isOrigin && (rowspan > 1 || colspan > 1)) {
          merges.push({
            s: { r, c },
            e: { r: r + rowspan - 1, c: c + colspan - 1 }
          })
        }

        // Clean text content
        let text = ''
        if (isOrigin) {
          const lecButton = cellEl.querySelector('button')
          const lecIdDiv = cellEl.querySelector('.text-\\[10px\\]')
          if (lecButton && cellEl.querySelector('.rounded-full')) {
            text = lecButton.innerText.trim() + (lecIdDiv ? `\n(${lecIdDiv.innerText.trim()})` : '')
          } else {
            text = (cellEl.innerText || cellEl.textContent || '').trim()
          }
        }

        // Extract styling
        let inlineBg = cellEl.style?.backgroundColor
        let inlineColor = cellEl.style?.color

        const styledChild = cellEl.querySelector('[style*="background-color"], [style*="background"]')
        if (!inlineBg && styledChild) {
          inlineBg = styledChild.style?.backgroundColor
          inlineColor = styledChild.style?.color
        }

        let computedStyle = null
        if (typeof window !== 'undefined' && window.getComputedStyle) {
          try {
            computedStyle = window.getComputedStyle(cellEl)
          } catch {
            // ignore
          }
        }

        let bgHex = colorToRgbHex(inlineBg) ||
                    (computedStyle ? colorToRgbHex(computedStyle.backgroundColor) : null)

        let textHex = colorToRgbHex(inlineColor) ||
                      (computedStyle ? colorToRgbHex(computedStyle.color) : null)

        const classNames = cellEl.className || ''
        if (!bgHex) {
          if (classNames.includes('bg-[#ffff00]') || classNames.includes('bg-yellow')) {
            bgHex = 'FFFF00'
          } else if (classNames.includes('bg-amber-50')) {
            bgHex = 'FEF3C7'
          } else if (classNames.includes('bg-[#d9eef9]')) {
            bgHex = 'D9EEF9'
          } else if (classNames.includes('bg-slate-50')) {
            bgHex = 'F8FAFC'
          } else {
            bgHex = 'FFFFFF'
          }
        }

        if (classNames.includes('bg-[#ffff00]')) {
          bgHex = 'FFFF00'
        }

        if (classNames.includes('bg-amber-50') || text === 'Break') {
          bgHex = 'FEF3C7'
          textHex = '92400E'
          isBreakRow = true
        }

        if (classNames.includes('ring-red-500') || cellEl.querySelector('.text-red-700')) {
          if (!bgHex || bgHex === 'FFFFFF') bgHex = 'FEE2E2'
          if (!textHex || textHex === '000000') textHex = '991B1B'
        }

        if (!bgHex) bgHex = 'FFFFFF'
        if (!textHex) textHex = '000000'

        const isHeader = cellEl.tagName === 'TH' || isHeaderRow
        const isBold = isHeader ||
                       classNames.includes('font-bold') ||
                       classNames.includes('font-semibold') ||
                       Boolean(computedStyle && String(computedStyle.fontWeight).match(/bold|700|600/i))

        let horizAlign = 'center'
        if (!isClassGrid && c === 0 && !isHeader) {
          horizAlign = 'left'
        }

        worksheet[cellRef] = {
          v: text,
          t: 's',
          s: {
            fill: { fgColor: { rgb: bgHex } },
            font: {
              name: 'Arial',
              sz: isHeader ? 10 : 9.5,
              bold: isBold,
              color: { rgb: textHex }
            },
            alignment: {
              horizontal: horizAlign,
              vertical: 'center',
              wrapText: true
            },
            border: borderThinBlack
          }
        }
      }

      if (isHeaderRow) {
        rowHeights.push({ hpt: 28 })
      } else if (isBreakRow) {
        rowHeights.push({ hpt: 24 })
      } else {
        rowHeights.push({ hpt: 38 })
      }
    }

    worksheet['!ref'] = XLSX.utils.encode_range({ s: { r: 0, c: 0 }, e: { r: numRows - 1, c: numCols - 1 } })
    if (merges.length) worksheet['!merges'] = merges
    worksheet['!cols'] = colWidths
    worksheet['!rows'] = rowHeights

    XLSX.utils.book_append_sheet(workbook, worksheet, sheetName)
  })

  XLSX.writeFile(workbook, `${filename}.xlsx`, { compression: true })
}

function getSlotTimeLabel(shift, slotIndex, slotKind) {
  if (shift === 'Afternoon') {
    if (slotKind === 'early_11' || slotIndex === 4) return '11:00 AM – 12:00 PM'
    if (slotKind === 'early_10' || slotIndex === 5) return '10:00 AM – 11:00 AM'
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
  const [lecturerSearchQuery, setLecturerSearchQuery] = useState('')
  const [isLecturerDropdownOpen, setIsLecturerDropdownOpen] = useState(false)
  const lecturerDropdownRef = useRef(null)
  const [timetablesData, setTimetablesData] = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const handleClickOutside = (event) => {
      if (lecturerDropdownRef.current && !lecturerDropdownRef.current.contains(event.target)) {
        setIsLecturerDropdownOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

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

  const allLecturersList = useMemo(() => {
    return [...lecturers].sort((a, b) => (a.name || '').localeCompare(b.name || ''))
  }, [lecturers])

  // Filter lecturers by Name AND ID (case-insensitive)
  const filteredLecturers = useMemo(() => {
    const q = lecturerSearchQuery.trim().toLowerCase()
    if (!q) {
      const scheduledSet = new Set(allScheduledLecturers.map(l => l.id))
      const nonScheduled = allLecturersList.filter(l => !scheduledSet.has(l.id))
      return [...allScheduledLecturers, ...nonScheduled]
    }
    return allLecturersList.filter(l => {
      const nameMatch = (l.name || '').toLowerCase().includes(q)
      const idMatch = (l.lecturer_id || '').toLowerCase().includes(q)
      return nameMatch || idMatch
    }).sort((a, b) => {
      const aNameStarts = (a.name || '').toLowerCase().startsWith(q)
      const bNameStarts = (b.name || '').toLowerCase().startsWith(q)
      if (aNameStarts && !bNameStarts) return -1
      if (!aNameStarts && bNameStarts) return 1
      const aIdStarts = (a.lecturer_id || '').toLowerCase().startsWith(q)
      const bIdStarts = (b.lecturer_id || '').toLowerCase().startsWith(q)
      if (aIdStarts && !bIdStarts) return -1
      if (!aIdStarts && bIdStarts) return 1
      return (a.name || '').localeCompare(b.name || '')
    })
  }, [allLecturersList, allScheduledLecturers, lecturerSearchQuery])

  // Map lecturerId -> day -> `${shift}_${slotIndex}` -> array of { classObj, subject, type, slotIndex }
  // Includes ALL classes across all semesters so the lecturers timetable is NOT locked to any single semester!
  const lecturerScheduleMap = useMemo(() => {
    const map = {}

    classes.forEach(cls => {
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
  }, [classes, timetablesByClass])

  // Active lecturers who have assignments across any class / semester
  const activeLecturers = useMemo(() => {
    const activeIds = new Set(Object.keys(lecturerScheduleMap))
    const list = lecturers.filter(l => activeIds.has(l.id))
    return list.sort((a, b) => a.name.localeCompare(b.name))
  }, [lecturers, lecturerScheduleMap])

  const morningLecturers = useMemo(() => {
    const ids = new Set()
    classes.filter(c => c.shift === 'Morning').forEach(cls => {
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
  }, [activeLecturers, classes, timetablesByClass])

  const afternoonLecturers = useMemo(() => {
    const ids = new Set()
    classes.filter(c => c.shift === 'Afternoon').forEach(cls => {
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
  }, [activeLecturers, classes, timetablesByClass])

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

          const classPool = activeTab === 'lecturers' ? classes : semesterClasses
          classPool.filter(c => (c.shift || 'Morning') === shift).forEach(cls => {
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

  const handlePrint = () => {
    const originalTitle = document.title
    if (activeTab === 'classes') {
      document.title = `Master_Schedule_Classes_${(selectedSemesterLevel || 'All').replace(/\s+/g, '_')}`
    } else {
      if (selectedLecturerId !== 'All' && selectedLecturerObj) {
        document.title = `Lecturer_Schedule_${selectedLecturerObj.name.replace(/\s+/g, '_')}`
      } else {
        document.title = `Master_Schedule_Lecturers_${(selectedSemesterLevel || 'All').replace(/\s+/g, '_')}`
      }
    }
    window.print()
    setTimeout(() => {
      document.title = originalTitle
    }, 1000)
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
    const dayHasAfternoonEarly10 = {}
    const dayHasAfternoonEarly11 = {}
    DAYS.forEach(day => {
      dayHasAfternoonEarly10[day] = false
      dayHasAfternoonEarly11[day] = false
    })
    if (!isMorning) {
      classList.forEach(cls => {
        const grid = timetablesByClass[cls.id]
        DAYS.forEach(day => {
          const sessions = grid?.[day] || []
          if (sessions.some(s => s.slotKind === 'early_10' || s.slotIndex === 5)) dayHasAfternoonEarly10[day] = true
          if (sessions.some(s => s.slotKind === 'early_11' || s.slotIndex === 4)) dayHasAfternoonEarly11[day] = true
        })
      })
    }
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
                      ...(dayHasAfternoonEarly10[day] ? [{ slotIndex: 5, time: '10:00 AM – 11:00 AM' }] : []),
                      ...(dayHasAfternoonEarly11[day] ? [{ slotIndex: 4, time: '11:00 AM – 12:00 PM' }] : []),
                      ...((dayHasAfternoonEarly10[day] || dayHasAfternoonEarly11[day]) ? [{ isBreak: true, time: '12:00 PM – 1:00 PM (Break)' }] : []),
                      ...slots,
                      ...(highestSlotByDay[day] >= 4 && !dayHasAfternoonEarly11[day] ? [{ slotIndex: 4, time: '5:00 PM – 5:50 PM' }] : []),
                      ...(highestSlotByDay[day] >= 5 && !dayHasAfternoonEarly10[day] ? [{ slotIndex: 5, time: '5:50 PM – 6:40 PM' }] : []),
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
                    <td
                      onClick={() => {
                        setSelectedLecturerId(lec.id)
                        setLecturerSearchQuery('')
                        setIsLecturerDropdownOpen(false)
                      }}
                      className="cursor-pointer group border-r border-black px-4 py-3.5 font-semibold text-brand-950 align-top w-48 bg-white hover:bg-brand-50/70 transition"
                      title={`Click to view schedule for ${lec.name}`}
                    >
                      <div className="flex items-start gap-2.5">
                        <div className="mt-0.5 grid h-7 w-7 shrink-0 place-items-center rounded-full bg-brand-600 text-xs font-bold text-white shadow-xs group-hover:scale-105 transition">
                          {lec.name.charAt(0)}
                        </div>
                        <div className="min-w-0 flex-1">
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation()
                              setSelectedLecturerId(lec.id)
                              setLecturerSearchQuery('')
                              setIsLecturerDropdownOpen(false)
                            }}
                            className="font-bold text-brand-950 group-hover:text-brand-600 group-hover:underline text-left transition text-xs block truncate"
                            title={`Click to view schedule for ${lec.name}`}
                          >
                            {lec.name}
                          </button>
                          <div className="text-[10px] text-slate-500 font-normal mt-0.5 flex items-center gap-1">
                            <span className="font-mono font-medium text-slate-600 bg-slate-100 px-1 rounded">
                              ID: {lec.lecturer_id || 'N/A'}
                            </span>
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
        <div className="mb-5 flex justify-between font-sans items-center">
          <button
            onClick={() => {
              setSelectedLecturerId('All')
              setLecturerSearchQuery('')
              setIsLecturerDropdownOpen(false)
            }}
            className="rounded-xl border border-slate-200 bg-slate-50 px-3.5 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-100 hover:text-slate-900 transition flex items-center gap-1.5"
          >
            <span>←</span> Back to All Lecturers
          </button>
          <div className="flex items-center gap-2">
            <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-mono font-bold text-slate-700 border border-slate-200">
              ID: {lec.lecturer_id || 'N/A'}
            </span>
            <span className="rounded-full bg-brand-50 px-3 py-1 text-xs font-bold text-brand-700 border border-brand-200">
              All semesters · {totalPeriods} periods
            </span>
          </div>
        </div>
        <h2 className="mb-5 text-center text-lg font-bold sm:text-xl font-sans">
          Lecturer Schedule: {lec.name} <span className="text-slate-500 font-mono text-base font-normal">({lec.lecturer_id || 'No ID'})</span>
        </h2>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[650px] border-collapse text-left text-sm">
            <thead>
              <tr className="bg-[#ffff00]">
                <th className="border border-black px-3 py-2 text-center font-bold text-black">Class</th>
                <th className="border border-black px-3 py-2 text-center font-bold text-black">Course</th>
                <th className="border border-black px-3 py-2 text-center font-bold text-black">Time</th>
                <th className="border border-black px-3 py-2 text-center font-bold text-black">Type</th>
              </tr>
            </thead>
            <tbody>
              {totalPeriods === 0 ? (
                <tr>
                  <td colSpan={4} className="border border-black px-3 py-8 text-center text-slate-400 italic font-sans text-sm">
                    No scheduled classes found for this lecturer yet.
                  </td>
                </tr>
              ) : (
                DAYS.map(day => sessionsByDay[day].length ? (
                  <React.Fragment key={day}>
                    <tr>
                      <td colSpan={4} className="border border-black bg-[#d9eef9] px-3 py-1.5 text-center font-bold text-slate-900">
                        {day}
                      </td>
                    </tr>
                    {sessionsByDay[day].map((session, index) => (
                      <tr key={`${day}-${session.classObj.id}-${index}`} className="hover:bg-slate-50">
                        <td className="border border-black px-3 py-1.5 font-semibold">{session.classObj.name}</td>
                        <td className="border border-black px-3 py-1.5">{session.subject?.name || 'Subject'}</td>
                        <td className="border border-black px-3 py-1.5 text-center whitespace-nowrap">{session.timeLabel}</td>
                        <td className="border border-black px-3 py-1.5 text-center">{session.type || '—'}</td>
                      </tr>
                    ))}
                  </React.Fragment>
                ) : null)
              )}
            </tbody>
          </table>
        </div>
        <p className="mt-4 text-center text-sm font-bold font-sans">Total Scheduled Periods: {totalPeriods}</p>
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
          @page {
            size: ${activeTab === 'lecturers' && selectedLecturerId !== 'All' ? 'portrait' : 'landscape'};
            margin: 6mm;
          }
          html, body {
            margin: 0 !important;
            padding: 0 !important;
            background: #ffffff !important;
          }
          body * {
            visibility: hidden !important;
          }
          #schedule-print-content, #schedule-print-content * {
            visibility: visible !important;
            -webkit-print-color-adjust: exact !important;
            print-color-adjust: exact !important;
          }
          #schedule-print-content {
            position: absolute !important;
            top: 0 !important;
            left: 0 !important;
            width: 100% !important;
            margin: 0 !important;
            padding: 0 !important;
          }
          #schedule-print-content table {
            width: 100% !important;
            border-collapse: collapse !important;
          }
          #schedule-print-content .lecturer-schedule {
            border: 0 !important;
            box-shadow: none !important;
            padding: 0 !important;
          }
          #schedule-print-content .lecturer-schedule button {
            display: none !important;
          }
          .no-print {
            display: none !important;
          }
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
            <>
            <div className="flex flex-wrap items-center gap-3">
              <label className="text-xs font-bold uppercase tracking-wider text-slate-500">
                Lecturer:
              </label>
              <div className="relative" ref={lecturerDropdownRef}>
                <div className="relative flex items-center">
                  <div className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3">
                    <Icon name="search" className="h-4 w-4 text-slate-400" />
                  </div>
                  <input
                    type="text"
                    value={
                      isLecturerDropdownOpen
                        ? lecturerSearchQuery
                        : selectedLecturerId === 'All'
                        ? ''
                        : selectedLecturerObj
                        ? `${selectedLecturerObj.name} (${selectedLecturerObj.lecturer_id || 'ID'})`
                        : ''
                    }
                    onChange={e => {
                      setLecturerSearchQuery(e.target.value)
                      if (!isLecturerDropdownOpen) setIsLecturerDropdownOpen(true)
                    }}
                    onFocus={() => {
                      setIsLecturerDropdownOpen(true)
                    }}
                    placeholder={
                      selectedLecturerId === 'All'
                        ? 'Search lecturer by name or ID...'
                        : selectedLecturerObj?.name || 'Search lecturer by name or ID...'
                    }
                    className="w-72 sm:w-80 rounded-xl border border-slate-300 bg-white py-2 pl-9 pr-16 text-sm font-semibold text-slate-800 placeholder:text-slate-400 placeholder:font-normal outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-100 transition shadow-2xs"
                  />
                  <div className="absolute inset-y-0 right-0 flex items-center pr-2 gap-0.5">
                    {(selectedLecturerId !== 'All' || lecturerSearchQuery) && (
                      <button
                        type="button"
                        onClick={e => {
                          e.stopPropagation()
                          setSelectedLecturerId('All')
                          setLecturerSearchQuery('')
                          setIsLecturerDropdownOpen(false)
                        }}
                        className="rounded-lg p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-700"
                        title="Reset to All Lecturers (Table View)"
                      >
                        <Icon name="x" className="h-3.5 w-3.5" />
                      </button>
                    )}
                    <button
                      type="button"
                      onClick={() => setIsLecturerDropdownOpen(prev => !prev)}
                      className="rounded-lg p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-700"
                      title={isLecturerDropdownOpen ? 'Close' : 'Open list'}
                    >
                      <Icon name={isLecturerDropdownOpen ? 'chevron-up' : 'chevron-down'} className="h-4 w-4" />
                    </button>
                  </div>
                </div>

                {/* Dropdown Menu */}
                {isLecturerDropdownOpen && (
                  <div className="absolute left-0 top-full z-50 mt-1.5 max-h-80 w-80 sm:w-96 overflow-y-auto rounded-xl border border-slate-200 bg-white p-1.5 shadow-xl ring-1 ring-black/5">
                    {/* Option: All Lecturers (Table View) */}
                    <button
                      type="button"
                      onClick={() => {
                        setSelectedLecturerId('All')
                        setLecturerSearchQuery('')
                        setIsLecturerDropdownOpen(false)
                      }}
                      className={`flex w-full items-center justify-between gap-2 rounded-lg px-3 py-2.5 text-left text-xs font-bold transition ${
                        selectedLecturerId === 'All'
                          ? 'bg-brand-50 text-brand-700'
                          : 'text-slate-700 hover:bg-slate-50'
                      }`}
                    >
                      <div className="flex items-center gap-2">
                        <span className="grid h-6 w-6 place-items-center rounded-md bg-amber-100 text-amber-800 text-xs font-bold">
                          📋
                        </span>
                        <div>
                          <div className="font-bold">All Lecturers (Table View)</div>
                          <div className="text-[10px] font-normal text-slate-500">View master table for all lecturers</div>
                        </div>
                      </div>
                      {selectedLecturerId === 'All' && <span className="text-brand-600 font-bold">✓</span>}
                    </button>

                    <div className="my-1.5 border-t border-slate-100" />

                    {/* Search Count Header */}
                    <div className="px-2 py-1 text-[10px] font-bold uppercase tracking-wider text-slate-400">
                      Lecturers {filteredLecturers.length > 0 && `(${filteredLecturers.length})`}
                    </div>

                    {filteredLecturers.length === 0 ? (
                      <div className="px-3 py-4 text-center text-xs text-slate-400 italic">
                        No lecturer found matching &quot;{lecturerSearchQuery}&quot;
                      </div>
                    ) : (
                      filteredLecturers.map(l => {
                        const sessionsCount = Object.values(allLecturerSessions[l.id] || {}).reduce((acc, arr) => acc + arr.length, 0)
                        const isSelected = selectedLecturerId === l.id

                        return (
                          <button
                            key={l.id}
                            type="button"
                            onClick={() => {
                              setSelectedLecturerId(l.id)
                              setLecturerSearchQuery('')
                              setIsLecturerDropdownOpen(false)
                            }}
                            className={`flex w-full items-center justify-between gap-2 rounded-lg px-3 py-2 text-left transition ${
                              isSelected
                                ? 'bg-brand-50 text-brand-700 font-semibold'
                                : 'text-slate-800 hover:bg-slate-50'
                            }`}
                          >
                            <div className="flex items-center gap-2.5 min-w-0">
                              <div
                                className={`grid h-7 w-7 shrink-0 place-items-center rounded-full text-xs font-bold text-white shadow-2xs ${
                                  isSelected ? 'bg-brand-600' : 'bg-slate-600'
                                }`}
                              >
                                {l.name.charAt(0)}
                              </div>
                              <div className="min-w-0">
                                <div className="truncate text-xs font-bold text-slate-900">{l.name}</div>
                                <div className="flex items-center gap-1.5 text-[10.5px] text-slate-500">
                                  <span className="font-mono font-semibold text-brand-600 bg-brand-50 px-1 rounded">
                                    ID: {l.lecturer_id || 'N/A'}
                                  </span>
                                  <span>•</span>
                                  <span>{sessionsCount} periods</span>
                                </div>
                              </div>
                            </div>
                            {isSelected && <span className="text-brand-600 font-bold shrink-0">✓</span>}
                          </button>
                        )
                      })
                    )}
                  </div>
                )}
              </div>
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
              text="Generate timetables for classes using the Timetable page first."
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

