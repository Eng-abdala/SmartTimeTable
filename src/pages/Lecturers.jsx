import { useRef, useState } from 'react'
import { useOutletContext } from 'react-router-dom'
import * as XLSX from 'xlsx'
import { supabase } from '../lib/supabase'
import { Icon } from '../components/Icon'
import { ManagerTable } from '../components/ManagerTable'

const DAYS = ['Saturday', 'Sunday', 'Monday', 'Tuesday', 'Wednesday']
const HOURS_PER_SHIFT_PER_DAY = 4
const LECTURER_ID_PATTERN = /^[A-Za-z][A-Za-z0-9]{2,7}$/
const LECTURER_NAME_PATTERN = /^[A-Za-z ]+$/

// ─── Excel column definitions ────────────────────────────────────────────────
const COLUMNS = [
  { key: 'lecturer_id', label: 'Lecturer ID' },
  { key: 'name',        label: 'Full Name'   },
  { key: 'available_days', label: 'Available Days (comma-separated or "All Week")' },
  { key: 'morning_available_hours', label: 'Morning Available Hours' },
  { key: 'afternoon_available_hours', label: 'Afternoon Available Hours' },
]

function buildTemplateRow() {
  return {
    'Lecturer ID': 'LEC001',
    'Full Name': 'Yahye Ali Isse',
    'Available Days (comma-separated or "All Week")': 'All Week',
    'Morning Available Hours': 12,
    'Afternoon Available Hours': 3,
  }
}

// ─── Export helpers ───────────────────────────────────────────────────────────
function exportToExcel(lecturers) {
  const rows = lecturers.map(l => ({
    'Lecturer ID': l.lecturer_id || '',
    'Full Name': l.name || '',
    'Available Days (comma-separated or "All Week")': l.is_all_week
      ? 'All Week'
      : (l.available_days || []).join(', '),
    'Morning Available Hours': l.morning_available_hours ?? 20,
    'Afternoon Available Hours': l.afternoon_available_hours ?? 20,
  }))

  const ws = XLSX.utils.json_to_sheet(rows)

  // Column widths
  ws['!cols'] = [{ wch: 18 }, { wch: 30 }, { wch: 45 }, { wch: 26 }, { wch: 28 }]

  // Style header row (xlsx CE doesn't support cell styles without a pro plugin,
  // but we can at least set the header fill via sheetview comment)
  const wb = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(wb, ws, 'Lecturers')
  XLSX.writeFile(wb, 'Lecturers.xlsx')
}

function downloadTemplate() {
  const ws = XLSX.utils.json_to_sheet([buildTemplateRow()])
  ws['!cols'] = [{ wch: 18 }, { wch: 30 }, { wch: 45 }, { wch: 26 }, { wch: 28 }]
  const wb = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(wb, ws, 'Lecturers')
  XLSX.writeFile(wb, 'Lecturers_Template.xlsx')
}

// ─── Parse helper ─────────────────────────────────────────────────────────────
function parseRow(raw) {
  const lecturer_id = (raw['Lecturer ID'] || '').toString().trim()
  const name        = (raw['Full Name'] || '').toString().trim()
  const daysRaw     = (raw['Available Days (comma-separated or "All Week")'] || '').toString().trim()
  const morningRaw  = raw['Morning Available Hours']
  const afternoonRaw = raw['Afternoon Available Hours']

  const errors = []
  if (!lecturer_id) errors.push('Missing Lecturer ID')
  else if (!LECTURER_ID_PATTERN.test(lecturer_id)) errors.push('Lecturer ID must start with a letter, use letters and numbers only, and be 3–8 characters long')
  if (!name) errors.push('Missing Full Name')
  else if (name.length < 3 || !LECTURER_NAME_PATTERN.test(name) || !/[A-Za-z]/.test(name)) errors.push('Full Name must use letters and spaces only and be at least 3 characters long')

  let is_all_week = false
  let available_days = []
  if (daysRaw.toLowerCase() === 'all week' || daysRaw === '') {
    is_all_week = true
  } else {
    available_days = daysRaw.split(',').map(d => d.trim()).filter(d => DAYS.includes(d))
    const unknown = daysRaw.split(',').map(d => d.trim()).filter(d => d && !DAYS.includes(d))
    if (unknown.length) errors.push(`Unknown day(s): ${unknown.join(', ')}`)
  }

  const maximumHours = (is_all_week ? DAYS.length : available_days.length) * HOURS_PER_SHIFT_PER_DAY
  const morning_available_hours = morningRaw === '' || morningRaw == null ? maximumHours : Number(morningRaw)
  const afternoon_available_hours = afternoonRaw === '' || afternoonRaw == null ? maximumHours : Number(afternoonRaw)
  if (!Number.isInteger(morning_available_hours) || morning_available_hours < 0 || morning_available_hours > maximumHours) errors.push(`Morning Available Hours must be a whole number from 0 to ${maximumHours}`)
  if (!Number.isInteger(afternoon_available_hours) || afternoon_available_hours < 0 || afternoon_available_hours > maximumHours) errors.push(`Afternoon Available Hours must be a whole number from 0 to ${maximumHours}`)

  return { lecturer_id, name, is_all_week, available_days, morning_available_hours, afternoon_available_hours, errors }
}

// ─── Status badge ─────────────────────────────────────────────────────────────
function StatusBadge({ status }) {
  const map = {
    valid:     'bg-emerald-50 text-emerald-700 border-emerald-200',
    duplicate: 'bg-amber-50 text-amber-700 border-amber-200',
    unchanged: 'bg-slate-100 text-slate-500 border-slate-200',
    error:     'bg-rose-50 text-rose-700 border-rose-200',
    imported:  'bg-indigo-50 text-indigo-700 border-indigo-200',
  }
  const labels = { valid: '✓ New', duplicate: '⟳ Changed', unchanged: '— No change', error: '✕ Error', imported: '✓ Imported' }
  return (
    <span className={`rounded-full border px-2.5 py-0.5 text-xs font-semibold ${map[status] || ''}`}>
      {labels[status] || status}
    </span>
  )
}

// ─── Main Component ───────────────────────────────────────────────────────────
export function Lecturers() {
  const { lecturers, setModal, remove, getLecturerTaughtSubjects, loadData, setNotice } = useOutletContext()

  const fileRef  = useRef(null)
  const [importRows, setImportRows]     = useState(null)   // parsed preview rows
  const [importing, setImporting]       = useState(false)
  const [importDone, setImportDone]     = useState(false)
  const [search, setSearch]             = useState('')

  // ── Parse selected file ─────────────────────────────────────────────────────
  function handleFileChange(e) {
    const file = e.target.files?.[0]
    if (!file) return
    const reader = new FileReader()
    reader.onload = (ev) => {
      try {
        const wb   = XLSX.read(ev.target.result, { type: 'array' })
        const ws   = wb.Sheets[wb.SheetNames[0]]
        const raw  = XLSX.utils.sheet_to_json(ws, { defval: '' })

        if (!raw.length) {
          setNotice('The Excel file appears to be empty.', 'error')
          return
        }

        const parsed = raw.map((row, i) => {
          const r = parseRow(row)
          const existing = lecturers.find(l => l.lecturer_id === r.lecturer_id)

          let status
          if (r.errors.length) {
            status = 'error'
          } else if (existing) {
            // Compare: has anything actually changed?
            const existingDays = Array.isArray(existing.available_days) ? [...existing.available_days].sort() : []
            const newDays      = [...r.available_days].sort()
            const daysChanged  = JSON.stringify(existingDays) !== JSON.stringify(newDays)
            const hasChange    =
              existing.name        !== r.name        ||
              existing.is_all_week !== r.is_all_week ||
              daysChanged ||
              (existing.morning_available_hours ?? 20) !== r.morning_available_hours ||
              (existing.afternoon_available_hours ?? 20) !== r.afternoon_available_hours
            status = hasChange ? 'duplicate' : 'unchanged'
          } else {
            status = 'valid'
          }

          return { ...r, rowNum: i + 2, status, existingId: existing?.id || null }
        })

        setImportRows(parsed)
        setImportDone(false)
      } catch (err) {
        setNotice(`Failed to read file: ${err.message}`, 'error')
      }
    }
    reader.readAsArrayBuffer(file)
    // Reset so same file can be re-selected
    e.target.value = ''
  }

  // ── Run import — only 'valid' (new) and 'duplicate' (changed) rows ──────────
  async function runImport() {
    const rows = (importRows || []).filter(r => r.status === 'valid' || r.status === 'duplicate')
    if (!rows.length) return

    setImporting(true)
    let successCount = 0
    let failCount    = 0

    for (const row of rows) {
      const payload = {
        lecturer_id:    row.lecturer_id,
        name:           row.name,
        is_all_week:    row.is_all_week,
        available_days: row.available_days,
        morning_available_hours: row.morning_available_hours,
        afternoon_available_hours: row.afternoon_available_hours,
        taught_subjects: [],
      }

      let error
      if (row.existingId) {
        // Update
        ;({ error } = await supabase.from('lecturers').update(payload).eq('id', row.existingId))
      } else {
        // Insert
        ;({ error } = await supabase.from('lecturers').insert(payload))
      }

      if (error) {
        failCount++
        setImportRows(prev => prev.map(r =>
          r.rowNum === row.rowNum ? { ...r, status: 'error', errors: [error.message] } : r
        ))
      } else {
        successCount++
        setImportRows(prev => prev.map(r =>
          r.rowNum === row.rowNum ? { ...r, status: 'imported' } : r
        ))
      }
    }

    setImporting(false)
    setImportDone(true)
    await loadData()
    setNotice(
      failCount
        ? `Import complete: ${successCount} succeeded, ${failCount} failed.`
        : `Successfully imported ${successCount} lecturer(s)!`,
      failCount ? 'error' : 'success'
    )
  }

  function cancelImport() {
    setImportRows(null)
    setImportDone(false)
  }

  const validCount     = (importRows || []).filter(r => r.status === 'valid').length
  const duplicateCount = (importRows || []).filter(r => r.status === 'duplicate').length
  const unchangedCount = (importRows || []).filter(r => r.status === 'unchanged').length
  const errorCount     = (importRows || []).filter(r => r.status === 'error').length
  const importedCount  = (importRows || []).filter(r => r.status === 'imported').length

  return (
    <>
      {/* ── Header ────────────────────────────────────────────────────────── */}
      <header className="mb-8 flex flex-col justify-between gap-4 sm:flex-row sm:items-center">
        <div>
          <p className="text-sm font-medium text-brand-600">University IT Faculty</p>
          <h1 className="mt-1 text-2xl font-bold tracking-tight text-brand-950 sm:text-3xl">Lecturers</h1>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          {/* Download Template */}
          <button
            onClick={downloadTemplate}
            className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-semibold text-slate-700 shadow-sm hover:bg-slate-50 transition"
            title="Download blank Excel template"
          >
            <span className="text-base">📋</span> Template
          </button>

          {/* Export */}
          <button
            onClick={() => exportToExcel(lecturers)}
            disabled={!lecturers.length}
            className="inline-flex items-center gap-2 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-2.5 text-sm font-semibold text-emerald-700 shadow-sm hover:bg-emerald-100 transition disabled:opacity-40 disabled:cursor-not-allowed"
          >
            <span className="text-base">📊</span> Export Excel
          </button>

          {/* Import trigger */}
          <button
            onClick={() => fileRef.current?.click()}
            className="inline-flex items-center gap-2 rounded-xl border border-indigo-200 bg-indigo-50 px-4 py-2.5 text-sm font-semibold text-indigo-700 shadow-sm hover:bg-indigo-100 transition"
          >
            <span className="text-base">📥</span> Import Excel
          </button>
          <input ref={fileRef} type="file" accept=".xlsx,.xls" className="hidden" onChange={handleFileChange} />

          {/* Add single */}
          <button
            onClick={() => setModal('lecturer')}
            className="inline-flex items-center justify-center gap-2 rounded-xl bg-brand-600 px-4 py-2.5 text-sm font-semibold text-white shadow-md shadow-brand-600/20 transition hover:bg-brand-800"
          >
            <Icon name="plus" className="h-4 w-4" /> Add Lecturer
          </button>
        </div>
      </header>

      {/* ── Import Preview Panel ───────────────────────────────────────────── */}
      {importRows && (
        <div className="mb-8 rounded-2xl border border-indigo-100 bg-white shadow-sm overflow-hidden">
          {/* Panel header */}
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 bg-indigo-50/60 px-6 py-4">
            <div className="flex items-center gap-3">
              <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-indigo-600 text-white text-lg">📥</span>
              <div>
                <p className="font-bold text-brand-950">Import Preview</p>
                <p className="text-xs text-slate-500">{importRows.length} row(s) detected from the file</p>
              </div>
            </div>

            {/* Summary pills */}
            <div className="flex flex-wrap gap-2">
              {validCount > 0     && <span className="rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1 text-xs font-semibold text-emerald-700">✓ {validCount} New</span>}
              {duplicateCount > 0 && <span className="rounded-full border border-amber-200 bg-amber-50 px-3 py-1 text-xs font-semibold text-amber-700">⟳ {duplicateCount} Changed</span>}
              {unchangedCount > 0 && <span className="rounded-full border border-slate-200 bg-slate-100 px-3 py-1 text-xs font-semibold text-slate-600">— {unchangedCount} No change</span>}
              {errorCount > 0     && <span className="rounded-full border border-rose-200 bg-rose-50 px-3 py-1 text-xs font-semibold text-rose-700">✕ {errorCount} Error</span>}
              {importedCount > 0  && <span className="rounded-full border border-indigo-200 bg-indigo-50 px-3 py-1 text-xs font-semibold text-indigo-700">✓ {importedCount} Imported</span>}
            </div>
          </div>

          {/* Table */}
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-100 bg-slate-50 text-xs font-semibold text-slate-500 uppercase tracking-wide">
                  <th className="px-4 py-3 text-left">Row</th>
                  <th className="px-4 py-3 text-left">Lecturer ID</th>
                  <th className="px-4 py-3 text-left">Full Name</th>
                  <th className="px-4 py-3 text-left">Available Days</th>
                  <th className="px-4 py-3 text-left">Morning Hours</th>
                  <th className="px-4 py-3 text-left">Afternoon Hours</th>
                  <th className="px-4 py-3 text-left">Status</th>
                  <th className="px-4 py-3 text-left">Notes</th>
                </tr>
              </thead>
              <tbody>
                {importRows.map((row, i) => (
                  <tr
                    key={i}
                    className={`border-b border-slate-50 transition ${
                      row.status === 'error'     ? 'bg-rose-50/40' :
                      row.status === 'imported'  ? 'bg-indigo-50/40' :
                      row.status === 'duplicate' ? 'bg-amber-50/30' :
                      row.status === 'unchanged' ? 'bg-slate-50/60 text-slate-500' :
                      'hover:bg-slate-50'
                    }`}
                  >
                    <td className="px-4 py-3 font-mono text-xs text-slate-400">{row.rowNum}</td>
                    <td className="px-4 py-3 font-semibold text-brand-600">{row.lecturer_id || <span className="text-rose-400 italic">—</span>}</td>
                    <td className="px-4 py-3 font-medium text-brand-950">{row.name || <span className="text-rose-400 italic">—</span>}</td>
                    <td className="px-4 py-3 text-slate-600">
                      {row.is_all_week
                        ? <span className="rounded-full bg-cyan-50 px-2 py-0.5 text-xs font-semibold text-brand-700">All Week</span>
                        : row.available_days.length
                        ? row.available_days.join(', ')
                        : <span className="text-slate-400">—</span>
                      }
                    </td>
                    <td className="px-4 py-3 text-slate-600">{row.morning_available_hours}</td>
                    <td className="px-4 py-3 text-slate-600">{row.afternoon_available_hours}</td>
                    <td className="px-4 py-3"><StatusBadge status={row.status} /></td>
                    <td className="px-4 py-3 text-xs text-slate-500">
                      {row.errors.length ? (
                        <span className="text-rose-600">{row.errors.join('; ')}</span>
                      ) : row.status === 'duplicate' ? (
                        <span className="text-amber-600 font-medium">Will update existing record</span>
                      ) : row.status === 'unchanged' ? (
                        <span className="text-slate-400">Identical to existing record (skipped)</span>
                      ) : row.status === 'imported' ? (
                        <span className="text-indigo-600 font-medium">Saved ✓</span>
                      ) : null}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Panel footer / actions */}
          <div className="flex flex-wrap items-center justify-between gap-3 border-t border-slate-100 bg-slate-50/50 px-6 py-4">
            <p className="text-xs text-slate-500">
              {errorCount > 0 && `${errorCount} error row(s) skipped. `}
              {unchangedCount > 0 && `${unchangedCount} identical row(s) skipped. `}
              {(validCount + duplicateCount) > 0
                ? `${validCount + duplicateCount} row(s) (${validCount} new, ${duplicateCount} changed) will be saved.`
                : 'No new or modified rows to import.'}
            </p>
            <div className="flex gap-3">
              <button
                onClick={cancelImport}
                className="rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-600 hover:bg-slate-100 transition"
              >
                {importDone ? 'Close' : 'Cancel'}
              </button>
              {!importDone && (validCount + duplicateCount) > 0 && (
                <button
                  onClick={runImport}
                  disabled={importing}
                  className="inline-flex items-center gap-2 rounded-xl bg-indigo-600 px-5 py-2 text-sm font-semibold text-white shadow hover:bg-indigo-700 transition disabled:opacity-60"
                >
                  {importing ? (
                    <>
                      <svg className="h-4 w-4 animate-spin" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                      </svg>
                      Importing…
                    </>
                  ) : (
                    <>📥 Confirm Import ({validCount + duplicateCount} rows)</>
                  )}
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ── Lecturers Table ────────────────────────────────────────────────── */}
      <div className="mb-4 max-w-md">
        <label className="sr-only" htmlFor="lecturer-search">Search lecturers</label>
        <input
          id="lecturer-search"
          type="search"
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          placeholder="Search by lecturer ID or name…"
          className="w-full rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm text-slate-700 outline-none transition placeholder:text-slate-400 focus:border-brand-600 focus:ring-2 focus:ring-brand-600/10"
        />
      </div>
      <ManagerTable
        headers={['Lecturer ID', 'Name', 'Availability', 'Morning Hours', 'Afternoon Hours', 'Actions']}
        rows={lecturers.filter((person) => {
          const query = search.trim().toLowerCase()
          return !query || person.lecturer_id?.toLowerCase().includes(query) || person.name?.toLowerCase().includes(query)
        })}
        empty="No lecturers registered yet. Add one manually or import an Excel file."
        render={(person) => {
          const taught = getLecturerTaughtSubjects ? getLecturerTaughtSubjects(person.id) : (person.taught_subjects || [])
          return (
            <>
              <td className="px-6 py-4 font-semibold text-brand-600">{person.lecturer_id}</td>
              <td className="px-6 py-4 font-medium text-brand-950">{person.name}</td>
              <td className="px-6 py-4">
                <span className="rounded-full bg-cyan-50 px-3 py-1 text-xs font-semibold text-brand-700">
                  {person.is_all_week ? 'Available all week' : person.available_days.join(', ')}
                </span>
              </td>
              <td className="px-6 py-4 font-medium text-slate-700">{person.morning_available_hours ?? 20}</td>
              <td className="px-6 py-4 font-medium text-slate-700">{person.afternoon_available_hours ?? 20}</td>
              <td className="px-6 py-4">
                <div className="flex gap-2">
                  <button onClick={() => setModal({ type: 'lecturer', data: person })} className="rounded-lg p-2 text-brand-600 hover:bg-cyan-50"><Icon name="edit" className="h-4 w-4" /></button>
                  <button onClick={() => remove('lecturers', person.id)} className="rounded-lg p-2 text-rose-500 hover:bg-rose-50"><Icon name="trash" className="h-4 w-4" /></button>
                </div>
              </td>
            </>
          )
        }}
      />
    </>
  )
}
