import React, { useState, useEffect, useMemo, useRef } from 'react'
import { useOutletContext, useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { Icon } from '../components/Icon'
import { Empty } from '../components/Empty'
import html2pdf from 'html2pdf.js'

const DAYS = ['Saturday', 'Sunday', 'Monday', 'Tuesday', 'Wednesday']
const DAY_SHORT = { Saturday: 'Sat', Sunday: 'Sun', Monday: 'Mon', Tuesday: 'Tue', Wednesday: 'Wed' }

const MORNING_SLOTS = [
  { slotIndex: 0, time: '7:00 AM – 7:45 AM' },
  { slotIndex: 1, time: '7:45 AM – 8:45 AM' },
  { slotIndex: 2, time: '8:45 AM – 9:45 AM' },
  { isBreak: true, time: '9:45 AM – 10:15 AM (Break)' },
  { slotIndex: 3, time: '10:15 AM – 11:15 AM' },
  { slotIndex: 4, time: '11:15 AM – 12:15 PM' },
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

  const clone = tableElement.cloneNode(true)
  clone.querySelectorAll('button, svg').forEach(el => el.remove())

  const html = `
    <html xmlns:o="urn:schemas-microsoft-com:office:office" 
          xmlns:x="urn:schemas-microsoft-com:office:excel" 
          xmlns="http://www.w3.org/TR/REC-html40">
    <head>
      <meta charset="utf-8" />
      <!--[if gte mso 9]>
      <xml>
        <x:ExcelWorkbook>
          <x:ExcelWorksheets>
            <x:ExcelWorksheet>
              <x:Name>Schedule</x:Name>
              <x:WorksheetOptions>
                <x:DisplayGridlines/>
              </x:WorksheetOptions>
            </x:ExcelWorksheet>
          </x:ExcelWorksheets>
        </x:ExcelWorkbook>
      </xml>
      <![endif]-->
      <style>
        body { font-family: Arial, sans-serif; font-size: 10pt; }
        table { border-collapse: collapse; width: 100%; }
        th { background-color: #ffff00 !important; color: #000000 !important; font-weight: bold; border: 1px solid #000000; padding: 8px; text-align: center; }
        th.corner-header { background-color: #ffffff !important; }
        td { border: 1px solid #000000; padding: 6px 8px; text-align: center; vertical-align: middle; font-size: 9.5pt; font-weight: 500; }
        .day-col { font-weight: bold; background-color: #ffffff; vertical-align: middle; }
        .time-col { white-space: nowrap; font-weight: 500; }
      </style>
    </head>
    <body>
      ${clone.outerHTML}
    </body>
    </html>
  `

  const blob = new Blob([html], { type: 'application/vnd.ms-excel;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `${filename}.xls`
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  URL.revokeObjectURL(url)
}

export function Schedule() {
  const { classes, semesters, setNotice } = useOutletContext()
  const navigate = useNavigate()
  const printRef = useRef()

  const [selectedSemesterId, setSelectedSemesterId] = useState(() => semesters[0]?.id || '')
  const [selectedShift, setSelectedShift] = useState('All') // 'All', 'Morning', 'Afternoon'
  const [timetablesData, setTimetablesData] = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!selectedSemesterId && semesters.length > 0) {
      setSelectedSemesterId(semesters[0].id)
    }
  }, [semesters, selectedSemesterId])

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
  }, [selectedSemesterId])

  // Filter classes by semester & shift
  const semesterClasses = useMemo(() => {
    if (!selectedSemesterId) return []
    return classes
      .filter(c => c.semester_id === selectedSemesterId)
      .filter(c => selectedShift === 'All' || c.shift === selectedShift)
      .sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true }))
  }, [classes, selectedSemesterId, selectedShift])

  const morningClasses = useMemo(() => semesterClasses.filter(c => c.shift === 'Morning'), [semesterClasses])
  const afternoonClasses = useMemo(() => semesterClasses.filter(c => c.shift === 'Afternoon'), [semesterClasses])

  // Map classId -> grid timetable object
  const timetablesByClass = useMemo(() => {
    const map = {}
    timetablesData.forEach(row => {
      if (row.semester_id === selectedSemesterId) {
        map[row.class_id] = row.grid
      }
    })
    return map
  }, [timetablesData, selectedSemesterId])

  // Detect teacher clashes across classes
  const conflicts = useMemo(() => {
    const clashList = []
    const clashCellKeys = new Set()

    DAYS.forEach(day => {
      const slotIndices = [0, 1, 2, 3, 4]
      
      slotIndices.forEach(slotIdx => {
        const lecturerMap = {}

        semesterClasses.forEach(cls => {
          const grid = timetablesByClass[cls.id]
          if (!grid || !grid[day]) return

          const session = grid[day].find(s => s.slotIndex === slotIdx)
          if (session && session.lecturer) {
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
              slotIdx,
              lecturerId: lid,
              lecturerName,
              classes: assignments.map(a => a.classObj),
              classNames
            })

            clashCellKeys.add(`${day}_${slotIdx}_${lid}`)
          }
        })
      })
    })

    return { clashList, clashCellKeys }
  }, [semesterClasses, timetablesByClass])

  const handlePrint = () => window.print()

  const handleDownloadPdf = () => {
    const el = printRef.current
    const semName = semesters.find(s => s.id === selectedSemesterId)?.name || 'Semester'
    html2pdf()
      .set({
        margin: 6,
        filename: `Schedule_${semName.replace(/\s+/g, '_')}.pdf`,
        image: { type: 'jpeg', quality: 0.98 },
        html2canvas: { scale: 2, useCORS: true },
        jsPDF: { unit: 'mm', format: 'a3', orientation: 'landscape' },
      })
      .from(el)
      .save()
  }

  const handleExportExcel = () => {
    const el = printRef.current
    const semName = semesters.find(s => s.id === selectedSemesterId)?.name || 'Semester'
    const filename = `Schedule_${semName.replace(/\s+/g, '_')}`
    exportTableToExcel(el, filename)
    setNotice('Master Schedule exported to Excel successfully!', 'success')
  }

  const renderGridTable = (classList, shiftName, slots) => {
    if (!classList.length) return null

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
              {DAYS.map(day => (
                <React.Fragment key={day}>
                  {slots.map((slot, slotIdx) => {
                    const isBreak = slot.isBreak
                    return (
                      <tr key={`${day}_${slot.time}`} className="border-b border-black">
                        {/* Day Column (Spans all slots for the day) */}
                        {slotIdx === 0 && (
                          <td
                            rowSpan={slots.length}
                            className="border-r border-black bg-white px-3 py-2 text-center font-bold text-black align-middle day-col text-sm"
                          >
                            {DAY_SHORT[day]}
                          </td>
                        )}

                        {/* Time Column */}
                        <td className="border-r border-black bg-white px-2 py-2 text-center font-medium text-slate-900 time-col whitespace-nowrap">
                          {slot.time}
                        </td>

                        {/* Class Columns */}
                        {classList.map(cls => {
                          if (isBreak) {
                            return (
                              <td key={cls.id} className="border-r border-black bg-amber-50 px-2 py-2 text-center text-amber-900 font-semibold text-xs">
                                ☕ Break
                              </td>
                            )
                          }

                          const grid = timetablesByClass[cls.id]
                          const session = grid && grid[day] ? grid[day].find(s => s.slotIndex === slot.slotIndex) : null

                          if (!session) {
                            return (
                              <td key={cls.id} className="border-r border-black px-2 py-2 text-center text-slate-300 italic">
                                —
                              </td>
                            )
                          }

                          const { subject, lecturer } = session
                          const isClashing = lecturer && conflicts.clashCellKeys.has(`${day}_${slot.slotIndex}_${lecturer.id}`)
                          const style = getSubjectStyle(subject?.id)

                          // Clean Subject - Lecturer format matching the reference image!
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
                              <div className="leading-tight">
                                {cellText}
                              </div>

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
              ))}
            </tbody>
          </table>
        </div>
      </div>
    )
  }

  return (
    <>
      <header className="mb-6 flex flex-col justify-between gap-4 sm:flex-row sm:items-center">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-brand-950 sm:text-3xl">
            Master Schedule
          </h1>
          <p className="mt-1 text-xs text-slate-500">
            View all class timetables in a clean Excel grid layout
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <button
            onClick={handleExportExcel}
            disabled={!semesterClasses.length}
            className="inline-flex items-center gap-1.5 rounded-xl border border-emerald-300 bg-emerald-50 px-4 py-2.5 text-sm font-semibold text-emerald-800 shadow-xs transition hover:bg-emerald-100 disabled:opacity-50"
          >
            <span>📊</span>
            Export to Excel
          </button>

          <button
            onClick={handleDownloadPdf}
            disabled={!semesterClasses.length}
            className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3.5 py-2.5 text-sm font-medium text-slate-700 shadow-xs transition hover:bg-slate-50 disabled:opacity-50"
          >
            <Icon name="print" className="h-4 w-4 text-slate-500" />
            PDF
          </button>

          <button
            onClick={handlePrint}
            disabled={!semesterClasses.length}
            className="inline-flex items-center gap-1.5 rounded-xl bg-brand-600 px-4 py-2.5 text-sm font-semibold text-white shadow-xs transition hover:bg-brand-700 disabled:opacity-50"
          >
            <Icon name="print" className="h-4 w-4" />
            Print
          </button>
        </div>
      </header>

      {/* Filter Bar: Semester & Shift selection only (No extra buttons) */}
      <div className="mb-6 rounded-2xl border border-slate-200 bg-white p-4 shadow-xs">
        <div className="flex flex-wrap items-center gap-6">
          <div className="flex items-center gap-3">
            <label className="text-xs font-bold uppercase tracking-wider text-slate-500">
              Semester:
            </label>
            <select
              value={selectedSemesterId}
              onChange={e => setSelectedSemesterId(e.target.value)}
              className="rounded-xl border border-slate-300 bg-white px-3.5 py-2 text-sm font-semibold text-slate-800 outline-none focus:border-brand-500"
            >
              {!semesters.length && <option value="">No Semesters</option>}
              {semesters.map(s => (
                <option key={s.id} value={s.id}>{s.name}</option>
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
              <option value="Morning">Morning Shift</option>
              <option value="Afternoon">Afternoon Shift</option>
            </select>
          </div>

          <div className="ml-auto text-xs text-slate-500 font-medium">
            Classes: <b className="text-slate-900">{semesterClasses.length}</b>
          </div>
        </div>
      </div>

      {/* Conflict Warning Banner (Only if clashes exist) */}
      {conflicts.clashList.length > 0 && (
        <div className="mb-6 rounded-xl border border-red-300 bg-red-50 p-3.5 text-red-900 text-xs">
          <span className="font-bold">⚠️ {conflicts.clashList.length} Teacher Conflict(s) Found: </span>
          {conflicts.clashList.map(c => `${c.lecturerName} double-booked in ${c.classNames} on ${c.day}`).join('; ')}
        </div>
      )}

      {/* Schedule Table Container */}
      {!semesterClasses.length ? (
        <Empty
          title="No classes found for this selection"
          text="Ensure you have assigned classes to this semester in the Classes management page."
        />
      ) : (
        <div ref={printRef}>
          {selectedShift === 'All' ? (
            <>
              {renderGridTable(morningClasses, 'Morning', MORNING_SLOTS)}
              {renderGridTable(afternoonClasses, 'Afternoon', AFTERNOON_SLOTS)}
            </>
          ) : selectedShift === 'Morning' ? (
            renderGridTable(morningClasses, 'Morning', MORNING_SLOTS)
          ) : (
            renderGridTable(afternoonClasses, 'Afternoon', AFTERNOON_SLOTS)
          )}
        </div>
      )}
    </>
  )
}
