import React, { useState, useMemo, useRef, useEffect, useCallback } from 'react'
import { useOutletContext, useSearchParams, useNavigate } from 'react-router-dom'
import { Icon } from '../components/Icon'
import { Empty } from '../components/Empty'
import html2pdf from 'html2pdf.js'
import { supabase } from '../lib/supabase'

const DAYS = ['Saturday', 'Sunday', 'Monday', 'Tuesday', 'Wednesday']

// Placement order for an early-start morning day.  The physical time order is
// 7:00, 7:45, 8:45, 10:15 and 11:15, but 8:45–10:15 crosses the break.  Put
// the two valid 2-hour pairs first and leave 8:45 as the final single slot.
// This order is used for every selected day, never for a particular weekday.
function getMorningOverflowDaySlots(selection) {
  const slots = selection?.early ? [4, 0, 2, 3] : [0, 1, 2, 3]
  if (selection?.afternoon_1) slots.push(5)
  if (selection?.afternoon_2) slots.push(6)
  if (selection?.early) slots.push(1)
  return slots
}

function isMorningTwoHourPair(first, second) {
  return (first === 4 && second === 0) ||
    (first === 0 && second === 1) ||
    (first === 2 && second === 3) ||
    (first === 5 && second === 6)
}

// Afternoon classes use the four regular periods through 5:00 PM. Slot IDs
// remain the original physical IDs so saved timetables and lecturer-conflict
// checks are unaffected.
const AFTERNOON_DAY_SLOTS = [0, 1, 2, 3]

function isAfternoonTwoHourPair(first, second) {
  return (first === 0 && second === 1) || (first === 2 && second === 3)
}

function createOverflowSelection(totalHours, requiredPeriods = Math.max(0, totalHours - 20), requiredSingleSlots = 0) {
  const selection = Object.fromEntries(DAYS.map(day => [day, { early: false, afternoon_1: false, afternoon_2: false }]))
  const extras = requiredPeriods
  // A 7:00 AM period is a required single-hour slot. Use no more than the
  // curriculum's odd-hour subjects need; the remaining capacity is added as
  // 1:00–2:00 PM pairs so 2-hour subject blocks can still fit.
  const defaultEarly = Math.min(extras, requiredSingleSlots, DAYS.length)
  // Put early-start slots later in the week. An odd subject's final 1-hour
  // block then has an earlier day available for its preceding 2-hour block.
  DAYS.slice(DAYS.length - defaultEarly).forEach(day => { selection[day].early = true })
  let remaining = extras - defaultEarly
  let dayIndex = 0
  let remainingSingles = requiredSingleSlots - defaultEarly
  while (remainingSingles > 0 && remaining > 0) {
    const day = DAYS[dayIndex % DAYS.length]
    selection[day].afternoon_1 = true
    remainingSingles--
    remaining--
    dayIndex++
  }
  dayIndex = 0
  while (remaining > 0) {
    const day = DAYS.find(candidate => !selection[candidate].afternoon_1) || DAYS[dayIndex % DAYS.length]
    selection[day].afternoon_1 = true
    remaining--
    if (remaining > 0) { selection[day].afternoon_2 = true; remaining-- }
    dayIndex++
  }
  return selection
}

function getOverflowSingleSlotCount(selection) {
  return DAYS.reduce((total, day) => {
    const periods = selection[day] || {}
    return total + Number(!!periods.early) + Number(!!periods.afternoon_1 && !periods.afternoon_2)
  }, 0)
}

function getSemesterLevel(semester) {
  const match = semester?.name?.match(/semester\s*(\d+)/i)
  return match ? Number(match[1]) : null
}

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

// Timetables generated before the flexible-overflow change stored early-start
// days as shifted indexes (0 = 7:00 AM). New grids use stable physical slot
// IDs. Normalize old rows whenever they are checked for lecturer conflicts.
function getPhysicalSlotIndex(shift, session, daySessions = []) {
  if (shift !== 'Morning' || session?.slotKind) return session?.slotIndex
  if (daySessions.length > 4) {
    return [4, 0, 1, 2, 3, 5, 6][session.slotIndex] ?? session.slotIndex
  }
  return session?.slotIndex
}

function getSubjectDistributionErrors(grid, semesterSubjects, shift = 'Morning') {
  return semesterSubjects.flatMap(sub => {
    const slotOrder = shift === 'Morning'
      ? { 4: 0, 0: 1, 1: 2, 2: 3, 3: 4, 5: 5, 6: 6 }
      : { 0: 0, 1: 1, 2: 2, 3: 3, 4: 4, 5: 5 }
    const canMakeTwoHourBlock = (first, second) => {
      if (shift === 'Morning') {
        return (first === 4 && second === 0) ||
          (first === 0 && second === 1) ||
          (first === 2 && second === 3) ||
          (first === 5 && second === 6)
      }
      return isAfternoonTwoHourPair(first, second)
    }

    const blocksByDay = DAYS.map(day => {
      const sessions = (grid?.[day] || [])
        .filter(session => session.subject?.id === sub.id)
        .sort((a, b) => (slotOrder[a.slotIndex] ?? a.slotIndex) - (slotOrder[b.slotIndex] ?? b.slotIndex))
      const blocks = []
      for (let index = 0; index < sessions.length;) {
        if (sessions[index + 1] && canMakeTwoHourBlock(sessions[index].slotIndex, sessions[index + 1].slotIndex)) {
          blocks.push(2)
          index += 2
        } else {
          blocks.push(1)
          index += 1
        }
      }
      return blocks
    })
    const actual = blocksByDay.flat().sort((a, b) => b - a)
    const requiredHours = (Number(sub.theory_hours) || 0) + (Number(sub.lab_hours) || 0)
    const expected = []
    for (let remaining = requiredHours; remaining > 0; remaining -= 2) expected.push(Math.min(2, remaining))
    return actual.length === expected.length &&
      actual.every((hours, index) => hours === expected[index]) &&
      blocksByDay.every(dayBlocks => dayBlocks.length <= 1)
      ? []
      : [{ subject: sub.name, expected }]
  })
}

function generateSinglePassTimetable(semesterSubjects, lecturers, shift, selectedClassId, getRandomLecturerForClass, getSubjectLecturers, busyMap, initialDailyLoad, initialWeeklyLoad, classCountMap, overflowSelection, attemptSeed) {
  const usedLecturersInClass = new Set()
  const subjectLecturerMap = new Map()
  const lecturerSlotMap = {}

  const getDraftHours = (lecturerId) => Object.values(lecturerSlotMap[lecturerId] || {})
    .reduce((total, daySlots) => total + Object.keys(daySlots).length, 0)

  const countFreeSlotsForLecturer = (lecturer) => {
    if (!lecturer) return 0
    let freeCount = 0
    DAYS.forEach(day => {
      if (isLecturerAvailableOnDay(lecturer, day)) {
        let daySlotsAvailable = 0
        const maxSlotsPerDay = 7
        for (let s = 0; s < maxSlotsPerDay; s++) {
          if (!busyMap?.[lecturer.id]?.[day]?.[s]) {
            daySlotsAvailable++
          }
        }
        // There is no fixed per-day teaching cap. A lecturer may teach as
        // many free slots as needed on a day; their weekly availability and
        // actual time-slot clashes remain the limits.
        freeCount += daySlotsAvailable
      }
    })
    const availabilityField = shift === 'Morning' ? 'morning_available_hours' : 'afternoon_available_hours'
    const weeklyLimit = Number(lecturer[availabilityField] ?? 20)
    const alreadyScheduled = initialWeeklyLoad?.[lecturer.id]?.[shift] || 0
    const scheduledInDraft = getDraftHours(lecturer.id)
    return Math.min(freeCount, Math.max(0, weeklyLimit - alreadyScheduled - scheduledInDraft))
  }

  for (const sub of semesterSubjects) {
    const requiredHours = sub.total_hours || (sub.theory_hours + sub.lab_hours) || 0
    const allQualified = getSubjectLecturers ? getSubjectLecturers(sub.id) : []
    
    const availableForThisClass = allQualified.filter(l => {
      if (usedLecturersInClass.has(l.id)) return false
      const currentClassCount = classCountMap?.[l.id]?.size || 0
      if (currentClassCount >= 3) return false
      return true
    })
    const pool = availableForThisClass.length > 0 ? availableForThisClass : allQualified

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
      const fullyCapable = sortedCandidates.filter(l => countFreeSlotsForLecturer(l) >= requiredHours)
      const choicePool = fullyCapable.length > 0 ? fullyCapable : sortedCandidates
      const idx = attemptSeed % choicePool.length
      chosenLecturer = choicePool[idx]
      usedLecturersInClass.add(chosenLecturer.id)
    }

    subjectLecturerMap.set(sub.id, chosenLecturer)
  }

  const blocks = []
  semesterSubjects.forEach(sub => {
    const lecturer = subjectLecturerMap.get(sub.id)
    // Build a subject's full weekly load before splitting it. This is what
    // guarantees 3 → 2+1, 4 → 2+2, and 5 → 2+2+1, even when a subject has
    // both theory and lab hours.
    const sessionTypes = [
      ...Array(Number(sub.theory_hours) || 0).fill('Theory'),
      ...Array(Number(sub.lab_hours) || 0).fill('Lab'),
    ]
    while (sessionTypes.length > 0) {
      const blockSessionTypes = sessionTypes.splice(0, 2)
      blocks.push({
        subject: sub,
        type: blockSessionTypes[0],
        sessionTypes: blockSessionTypes,
        lecturer,
        size: blockSessionTypes.length,
      })
    }
  })

  const shuffle = (array) => {
    for (let i = array.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      const tmp = array[i]; array[i] = array[j]; array[j] = tmp
    }
  }

  const shuffledBlocks = [...blocks]
  shuffle(shuffledBlocks)
  // Reserve the contiguous two-period sessions first. Scheduling a one-period
  // remainder before them can leave only break-spanning gaps and incorrectly
  // make a valid 2+2+2 subject impossible to place.
  shuffledBlocks.sort((a, b) => b.size - a.size)

  const localDailyLoad = initialDailyLoad ? JSON.parse(JSON.stringify(initialDailyLoad)) : {}
  const timetable = {}
  DAYS.forEach(d => { timetable[d] = [] })
  const daySlotCount = { Saturday: 0, Sunday: 0, Monday: 0, Tuesday: 0, Wednesday: 0 }
  const subjectBlocksByDay = {}
  const subjectHasBlockOnDay = (subjectId, day) => !!subjectBlocksByDay[subjectId]?.[day]
  const markSubjectBlockOnDay = (subjectId, day) => {
    if (!subjectBlocksByDay[subjectId]) subjectBlocksByDay[subjectId] = {}
    subjectBlocksByDay[subjectId][day] = true
  }
  const markLecturerSlot = (lid, day, slotIndex) => {
    if (!lecturerSlotMap[lid]) lecturerSlotMap[lid] = {}
    if (!lecturerSlotMap[lid][day]) lecturerSlotMap[lid][day] = {}
    lecturerSlotMap[lid][day][slotIndex] = true
  }
  const isLecturerSlotTaken = (lid, day, slotIndex) => {
    return !!(busyMap?.[lid]?.[day]?.[slotIndex] || lecturerSlotMap[lid]?.[day]?.[slotIndex])
  }
  const findLecturerForBlock = (subject, day, startSlot, size, preferredLecturer) => {
    // A lecturer is selected once per subject before blocks are created.  Do
    // not replace that selection for a later block: doing so made the same
    // subject show different lecturers in different rows (for example, when
    // a later Sunday block could not use the selected lecturer).
    if (!preferredLecturer) return null

    const daySlots = getDaySlots(day)
    const blockSlots = daySlots.slice(startSlot, startSlot + size)
    if (blockSlots.length !== size) return null
    // A morning two-period subject must use one of the real consecutive pairs;
    // in particular, it can never bridge 8:45 AM to 1:00 PM.
    if (size > 1 && shift === 'Morning' && blockSlots.some((slot, index) =>
      index > 0 && !isMorningTwoHourPair(blockSlots[index - 1], slot)
    )) return null

    const lecturer = preferredLecturer
    if (!isLecturerAvailableOnDay(lecturer, day)) return null
    const availabilityField = shift === 'Morning' ? 'morning_available_hours' : 'afternoon_available_hours'
    const weeklyLimit = Number(lecturer[availabilityField] ?? 20)
    const alreadyScheduled = initialWeeklyLoad?.[lecturer.id]?.[shift] || 0
    if (getDraftHours(lecturer.id) + alreadyScheduled + size > weeklyLimit) return null
    for (let offset = 0; offset < size; offset++) {
      if (isLecturerSlotTaken(lecturer.id, day, blockSlots[offset])) return null
    }
    return lecturer
  }

  const totalPeriods = shuffledBlocks.reduce((sum, b) => sum + b.size, 0)
  // Physical morning slot IDs: 4 = 7:00 AM, 0–3 = normal morning,
  // 5 = 1:00–2:00 PM, 6 = 2:00–3:00 PM. Keeping these IDs stable lets a
  // late period replace an unavailable 7:00 AM period without a clash.
  const daySlotsByDay = {}
  if (totalPeriods >= 20 || DAYS.some(day => {
    const selected = overflowSelection?.[day] || {}
    return selected.early || selected.afternoon_1 || selected.afternoon_2
  })) {
    DAYS.forEach(day => {
      const selected = overflowSelection?.[day] || {}
      daySlotsByDay[day] = shift === 'Morning'
        ? getMorningOverflowDaySlots(selected)
        : [...AFTERNOON_DAY_SLOTS]
    })
  } else {
    // Do not force a class with (for example) 18 hours into 4+4+4+3+3.
    // Those two 3-period days make an all-even curriculum impossible to keep
    // in 2-hour blocks. Every normal day offers its four standard slots and
    // unused slots remain empty when the curriculum has fewer than 20 hours.
    DAYS.forEach(day => {
      daySlotsByDay[day] = shift === 'Morning' ? [0, 1, 2, 3] : [...AFTERNOON_DAY_SLOTS]
    })
  }


  const getDaySlots = (day) => daySlotsByDay[day] || []
  const getMaxSlots = (day) => getDaySlots(day).length
  const getSlotKind = (slotIndex) => ({ 4: 'early', 5: 'afternoon_1', 6: 'afternoon_2' }[slotIndex] || 'standard')

  const theoryDayIdxMap = {}
  let dayIdx = attemptSeed % DAYS.length
  let emptyLecturerCount = 0
  let layoutViolationCount = 0

  for (const block of shuffledBlocks) {
    let placed = false
    const startDayIdx = dayIdx

    do {
      const day = DAYS[dayIdx]
      if (!subjectHasBlockOnDay(block.subject.id, day) && daySlotCount[day] + block.size <= getMaxSlots(day)) {
        // Every block for a subject must retain that subject's one selected
        // lecturer; an unavailable slot is handled by the placement fallback.
        const assignedLecturer = findLecturerForBlock(
          block.subject, day, daySlotCount[day], block.size, block.lecturer
        )
        let hasClash = !assignedLecturer
        const chronoDayIdx = DAYS.indexOf(day)
        if (!hasClash && block.type === 'Lab' && theoryDayIdxMap[block.subject.id] !== undefined) {
          if (chronoDayIdx < theoryDayIdxMap[block.subject.id]) hasClash = true
        }

        if (!hasClash) {
          for (let i = 0; i < block.size; i++) {
            const slotIndex = getDaySlots(day)[daySlotCount[day]]
            timetable[day].push({ slotIndex, slotKind: getSlotKind(slotIndex), subject: block.subject, type: block.sessionTypes?.[i] || block.type, lecturer: assignedLecturer })
            if (assignedLecturer) markLecturerSlot(assignedLecturer.id, day, slotIndex)
            daySlotCount[day]++
          }
          if (assignedLecturer) {
            const lid = assignedLecturer.id
            if (!localDailyLoad[lid]) localDailyLoad[lid] = {}
            localDailyLoad[lid][day] = (localDailyLoad[lid][day] || 0) + block.size
          }
          if (block.type === 'Theory') {
            if (theoryDayIdxMap[block.subject.id] === undefined) theoryDayIdxMap[block.subject.id] = chronoDayIdx
            else theoryDayIdxMap[block.subject.id] = Math.min(theoryDayIdxMap[block.subject.id], chronoDayIdx)
          }
          markSubjectBlockOnDay(block.subject.id, day)
          placed = true
          dayIdx = (dayIdx + 1) % DAYS.length
          break
        }
      }
      dayIdx = (dayIdx + 1) % DAYS.length
    } while (dayIdx !== startDayIdx)

    if (!placed) {
      // Never split a two-period block into separate one-hour lessons.  An
      // earlier fallback did exactly that when space was tight, producing
      // invalid layouts such as 4 = 2+1+1.  This attempt is rejected instead;
      // a later generation attempt can use a different placement order.
      layoutViolationCount++
      emptyLecturerCount += block.size
    }
  }

  // Count any accidental clashes just in case
  let clashCount = 0
  DAYS.forEach(day => {
    (timetable[day] || []).forEach(sess => {
      if (sess.lecturer && busyMap?.[sess.lecturer.id]?.[day]?.[sess.slotIndex]) {
        clashCount++
      }
    })
  })

  // Validate the exact day split requested for every subject. For example:
  // 3 hours = 2+1 across two days; 4 = 2+2 across two days; 5 = 2+2+1 across three days.
  const distributionViolationCount = getSubjectDistributionErrors(timetable, semesterSubjects, shift).length

  // Sorting only changes display order, never a session's physical slot index.
  // It keeps 8:45–9:45 directly below 7:45–8:45 in the generated table.
  const slotOrder = shift === 'Morning'
    ? { 4: 0, 0: 1, 1: 2, 2: 3, 3: 4, 5: 5, 6: 6 }
    : { 0: 0, 1: 1, 2: 2, 3: 3, 4: 4, 5: 5 }
  DAYS.forEach(day => timetable[day].sort((a, b) =>
    (slotOrder[a.slotIndex] ?? a.slotIndex) - (slotOrder[b.slotIndex] ?? b.slotIndex)
  ))
  return { timetable, emptyLecturerCount, clashCount, layoutViolationCount, distributionViolationCount }
}

// Morning slot 5 is 1:00–2:00 PM, which overlaps afternoon slot 0.
function getBlockingSlotIndex(currentShift, otherShift, otherSlotIndex) {
  if (currentShift === otherShift) return otherSlotIndex
  if (currentShift === 'Morning' && otherShift === 'Afternoon' && otherSlotIndex === 0) return 5
  if (currentShift === 'Morning' && otherShift === 'Afternoon' && otherSlotIndex === 1) return 6
  if (currentShift === 'Afternoon' && otherShift === 'Morning' && otherSlotIndex === 5) return 0
  if (currentShift === 'Afternoon' && otherShift === 'Morning' && otherSlotIndex === 6) return 1
  return null
}

// Exhaustive placement fallback. The earlier generator is fast, but greedy:
// it can give up after choosing a poor early slot even though a valid full
// timetable exists. This search keeps each subject's lecturer consistent and
// only places complete 2-hour blocks (plus one final 1-hour block when needed).
function generateWithBacktracking(semesterSubjects, shift, getSubjectLecturers, busyMap, initialWeeklyLoad, overflowSelection, allowSplitPairBlocks = false) {
  const totalPeriods = semesterSubjects.reduce((sum, subject) =>
    sum + (Number(subject.theory_hours) || 0) + (Number(subject.lab_hours) || 0), 0)

  const availableSlots = {}
  if (totalPeriods >= 20 || DAYS.some(day => {
    const selected = overflowSelection?.[day] || {}
    return selected.early || selected.afternoon_1 || selected.afternoon_2
  })) {
    DAYS.forEach(day => {
      const extra = overflowSelection?.[day] || {}
      availableSlots[day] = shift === 'Morning'
        ? getMorningOverflowDaySlots(extra)
        : [...AFTERNOON_DAY_SLOTS]
    })
  } else {
    DAYS.forEach(day => { availableSlots[day] = shift === 'Morning' ? [0, 1, 2, 3] : [...AFTERNOON_DAY_SLOTS] })
  }

  const blocks = []
  semesterSubjects.forEach(subject => {
    const types = [
      ...Array(Number(subject.theory_hours) || 0).fill('Theory'),
      ...Array(Number(subject.lab_hours) || 0).fill('Lab'),
    ]
    while (types.length) {
      const sessionTypes = types.splice(0, 2)
      blocks.push({ subject, sessionTypes, type: sessionTypes[0], size: sessionTypes.length })
    }
  })
  // Pair blocks first. This preserves space for every required 2-hour lesson.
  blocks.sort((a, b) => b.size - a.size)

  const slotOrder = shift === 'Morning'
    ? { 4: 0, 0: 1, 1: 2, 2: 3, 3: 4, 5: 5, 6: 6 }
    : { 0: 0, 1: 1, 2: 2, 3: 3, 4: 4, 5: 5 }
  const arePairable = (daySlots, first, second) => {
    if (shift !== 'Morning') return isAfternoonTwoHourPair(first, second)
    // On an early-start day, 0+1 would strand the 7:00 AM slot and prevent
    // the required final 1-hour lesson from fitting. Keep the two usable
    // pairs as 4+0 and 2+3 instead.
    if (daySlots.includes(4) && first === 0 && second === 1) return false
    return (first === 4 && second === 0) || (first === 0 && second === 1) || (first === 2 && second === 3) || (first === 5 && second === 6)
  }

  const occupied = Object.fromEntries(DAYS.map(day => [day, new Set()]))
  const lecturerSlots = {}
  const lecturerLoad = {}
  const assignedLecturer = new Map()
  const subjectDays = new Map()
  const earliestTheoryDay = new Map()
  const timetable = Object.fromEntries(DAYS.map(day => [day, []]))
  let searchedNodes = 0
  // A 26-hour curriculum can contain 11 separate 2-hour blocks. It has many
  // valid slot combinations, so the previous cap stopped the search before it
  // reached a solution even when every lecturer was available.
  const MAX_SEARCH_NODES = 2000000

  const isFreeForLecturer = (lecturer, day, slots) =>
    isLecturerAvailableOnDay(lecturer, day) && slots.every(slot =>
      !busyMap?.[lecturer.id]?.[day]?.[slot] && !lecturerSlots[lecturer.id]?.[day]?.has(slot)
    )

  const getCandidates = block => {
    const locked = assignedLecturer.get(block.subject.id)
    if (locked) return [locked]
    const availabilityField = shift === 'Morning' ? 'morning_available_hours' : 'afternoon_available_hours'
    return (getSubjectLecturers(block.subject.id) || [])
      .filter(lecturer => (Number(initialWeeklyLoad?.[lecturer.id]?.[shift] || 0) + (lecturerLoad[lecturer.id] || 0) + block.size) <= Number(lecturer[availabilityField] ?? 20))
      .sort((a, b) => (lecturerLoad[a.id] || 0) - (lecturerLoad[b.id] || 0))
  }

  const search = index => {
    if (index === blocks.length) return true
    if (++searchedNodes > MAX_SEARCH_NODES) return false

    const block = blocks[index]
    const candidates = getCandidates(block)
    for (const lecturer of candidates) {
      const availabilityField = shift === 'Morning' ? 'morning_available_hours' : 'afternoon_available_hours'
      if ((Number(initialWeeklyLoad?.[lecturer.id]?.[shift] || 0) + (lecturerLoad[lecturer.id] || 0) + block.size) > Number(lecturer[availabilityField] ?? 20)) continue
      const wasLocked = assignedLecturer.has(block.subject.id)
      if (!wasLocked) assignedLecturer.set(block.subject.id, lecturer)

      for (const day of DAYS) {
        if (subjectDays.get(block.subject.id)?.has(day)) continue
        if (block.type === 'Lab' && earliestTheoryDay.has(block.subject.id) && DAYS.indexOf(day) < earliestTheoryDay.get(block.subject.id)) continue
        const daySlots = availableSlots[day]
        const slotGroups = block.size === 2 && allowSplitPairBlocks
          ? daySlots.flatMap((first, index) => daySlots.slice(index + 1).map(second => [first, second]))
          : Array.from({ length: daySlots.length - block.size + 1 }, (_, start) => daySlots.slice(start, start + block.size))
        for (const slots of slotGroups) {
          if (slots.some(slot => occupied[day].has(slot))) continue
          if (block.size === 2 && !allowSplitPairBlocks && !arePairable(daySlots, slots[0], slots[1])) continue
          if (!isFreeForLecturer(lecturer, day, slots)) continue

          const oldTheoryDay = earliestTheoryDay.get(block.subject.id)
          if (!subjectDays.has(block.subject.id)) subjectDays.set(block.subject.id, new Set())
          subjectDays.get(block.subject.id).add(day)
          if (block.type === 'Theory') {
            earliestTheoryDay.set(block.subject.id, Math.min(oldTheoryDay ?? DAYS.indexOf(day), DAYS.indexOf(day)))
          }
          slots.forEach((slot, slotIndex) => {
            occupied[day].add(slot)
            if (!lecturerSlots[lecturer.id]) lecturerSlots[lecturer.id] = {}
            if (!lecturerSlots[lecturer.id][day]) lecturerSlots[lecturer.id][day] = new Set()
            lecturerSlots[lecturer.id][day].add(slot)
            timetable[day].push({ slotIndex: slot, slotKind: ({ 4: 'early', 5: 'afternoon_1', 6: 'afternoon_2' }[slot] || 'standard'), subject: block.subject, type: block.sessionTypes[slotIndex], lecturer })
          })
          lecturerLoad[lecturer.id] = (lecturerLoad[lecturer.id] || 0) + block.size

          if (search(index + 1)) return true

          lecturerLoad[lecturer.id] -= block.size
          slots.forEach(slot => {
            occupied[day].delete(slot)
            lecturerSlots[lecturer.id][day].delete(slot)
          })
          timetable[day].splice(-block.size, block.size)
          subjectDays.get(block.subject.id).delete(day)
          if (subjectDays.get(block.subject.id).size === 0) subjectDays.delete(block.subject.id)
          if (block.type === 'Theory') {
            if (oldTheoryDay === undefined) earliestTheoryDay.delete(block.subject.id)
            else earliestTheoryDay.set(block.subject.id, oldTheoryDay)
          }
        }
      }
      if (!wasLocked) assignedLecturer.delete(block.subject.id)
    }
    return false
  }

  if (!search(0)) return null
  DAYS.forEach(day => timetable[day].sort((a, b) => (slotOrder[a.slotIndex] ?? a.slotIndex) - (slotOrder[b.slotIndex] ?? b.slotIndex)))
  return timetable
}

function generateTimetable(semesterSubjects, lecturers, shift, selectedClassId, getRandomLecturerForClass, getSubjectLecturers, busyMap, initialDailyLoad, initialWeeklyLoad, classCountMap, overflowSelection) {
  for (let attempt = 0; attempt < 50; attempt++) {
    const res = generateSinglePassTimetable(semesterSubjects, lecturers, shift, selectedClassId, getRandomLecturerForClass, getSubjectLecturers, busyMap, initialDailyLoad, initialWeeklyLoad, classCountMap, overflowSelection, attempt)
    if (res.clashCount === 0 && res.emptyLecturerCount === 0 && res.layoutViolationCount === 0 && res.distributionViolationCount === 0) {
      return { timetable: res.timetable, needsManualBlockCorrection: false }
    }
  }
  const strictGrid = generateWithBacktracking(semesterSubjects, shift, getSubjectLecturers, busyMap, initialWeeklyLoad, overflowSelection)
  if (strictGrid) return { timetable: strictGrid, needsManualBlockCorrection: false }

  // Keep the timetable editable when lecturer availability leaves no strict
  // two-hour arrangement. Sessions remain conflict-free, and the user can use
  // drag-and-drop to repair the displayed block layout.
  const editableGrid = generateWithBacktracking(
    semesterSubjects, shift, getSubjectLecturers, busyMap, initialWeeklyLoad, overflowSelection, true
  )
  return editableGrid ? { timetable: editableGrid, needsManualBlockCorrection: true } : null
}

export function Timetable() {
  const { classes, semesters, subjects, lecturers, departments, getRandomLecturerForClass, getSubjectLecturers, setNotice, loadData } = useOutletContext()
  const navigate = useNavigate()

  const [searchParams, setSearchParams] = useSearchParams()
  const urlClassId = searchParams.get('classId')

  const [selectedSemesterId, setSelectedSemesterId] = useState(() => localStorage.getItem('tt_semester') || '')
  const [selectedSemesterLevel, setSelectedSemesterLevel] = useState(() => localStorage.getItem('tt_semester_level') || '')
  const [selectedDepartmentId, setSelectedDepartmentId] = useState(() => localStorage.getItem('tt_department') || '')
  const [selectedClassId, setSelectedClassId] = useState(() => urlClassId || localStorage.getItem('tt_class') || '')
  const [overflowSelection, setOverflowSelection] = useState(() => createOverflowSelection(20))
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
      setSelectedSemesterLevel(String(getSemesterLevel(semesters.find(s => s.id === cls.semester_id)) || ''))
      const legacyDepartment = !cls.department_id && departments.find(d =>
        d.intake_year === cls.intake_year && cls.name.toUpperCase().startsWith(d.shortform.toUpperCase())
      )
      setSelectedDepartmentId(cls.department_id || legacyDepartment?.id || '')
      setSelectedClassId(urlClassId)
    }
  }, [urlClassId, classes, departments, semesters])

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

  const curriculumHours = semesterSubjects.reduce(
    (total, subject) => total + (Number(subject.theory_hours) || 0) + (Number(subject.lab_hours) || 0), 0
  )
  const oddSubjectCount = semesterSubjects.filter(subject =>
    ((Number(subject.theory_hours) || 0) + (Number(subject.lab_hours) || 0)) % 2 === 1
  ).length
  // Overflow choices are exactly the hours beyond the normal 20-hour week.
  // Keeping this separate from the generator means the placement logic and
  // its 2-hour block rules remain unchanged.
  const requiredOverflowPeriods = Math.max(0, curriculumHours - 20)
  const selectedOverflowPeriods = DAYS.reduce((total, day) => total + [
    overflowSelection[day]?.early,
    overflowSelection[day]?.afternoon_1,
    overflowSelection[day]?.afternoon_2,
  ].filter(Boolean).length, 0)
  const selectedOverflowSingleSlots = getOverflowSingleSlotCount(overflowSelection)
  const hasValidOverflowShape = selectedOverflowSingleSlots <= oddSubjectCount

  useEffect(() => {
    setOverflowSelection(createOverflowSelection(
      curriculumHours,
      requiredOverflowPeriods,
      Math.min(oddSubjectCount, requiredOverflowPeriods),
    ))
  }, [curriculumHours, requiredOverflowPeriods, oddSubjectCount])

  // Load global busy map for other classes
  const loadGlobalBusyMap = useCallback(async (currentClassId, currentShift) => {
    if (!currentClassId) return {}
    const { data: dbTimetables } = await supabase.from('timetables').select('class_id, semester_id, grid')
    const busyMap = {}
    if (dbTimetables) {
      dbTimetables.forEach(row => {
        if (row.class_id !== currentClassId) {
          const savedGrid = row.grid
          const savedClassId = row.class_id
          const savedClass = classes.find(c => c.id === savedClassId)

          DAYS.forEach(day => {
            if (savedGrid && savedGrid[day] && Array.isArray(savedGrid[day])) {
              savedGrid[day].forEach(session => {
                if (session.lecturer) {
                  const lid = session.lecturer.id
                  const blockingSlot = getBlockingSlotIndex(currentShift, savedClass?.shift || currentShift, session.slotIndex)
                  if (blockingSlot !== null) {
                    if (!busyMap[lid]) busyMap[lid] = {}
                    if (!busyMap[lid][day]) busyMap[lid][day] = {}
                    busyMap[lid][day][blockingSlot] = true
                  }
                }
              })
            }
          })
        }
      })
    }
    setGlobalBusyMap(busyMap)
    return busyMap
  }, [classes])

  useEffect(() => {
    if (selectedClassId && selectedClass) {
      loadGlobalBusyMap(selectedClassId, selectedClass.shift)
    }
  }, [selectedClassId, selectedClass, loadGlobalBusyMap])

  // Persist selections to localStorage
  const saveSemester = (level) => {
    setSelectedSemesterLevel(level)
    localStorage.setItem('tt_semester_level', level)
    setSelectedSemesterId('')
    localStorage.removeItem('tt_semester')
    saveDepartment('')
  }
  const saveDepartment = (v) => {
    setSelectedDepartmentId(v)
    localStorage.setItem('tt_department', v)
    saveClass('')
  }
  const saveClass = (classId) => {
    const classItem = classes.find(c => c.id === classId)
    setSelectedClassId(classId)
    setSelectedSemesterId(classItem?.semester_id || '')
    localStorage.setItem('tt_class', classId)
    if (classItem?.semester_id) localStorage.setItem('tt_semester', classItem.semester_id)
    setSearchParams({});
  }

  // Departments are derived from the selected semester's actual classes, so
  // users cannot choose an unrelated department.
  const semesterDepartments = useMemo(() => {
    if (!selectedSemesterLevel) return []
    const semesterClassList = classes.filter(c => String(getSemesterLevel(semesters.find(s => s.id === c.semester_id)) || '') === selectedSemesterLevel)
    return departments.filter(d => semesterClassList.some(c =>
      c.department_id === d.id ||
      (!c.department_id && c.intake_year === d.intake_year && c.name.toUpperCase().startsWith(d.shortform.toUpperCase()))
    )).sort((a, b) => a.name.localeCompare(b.name))
  }, [classes, departments, semesters, selectedSemesterLevel])

  // Classes filtered by selected semester and then selected department.
  const semesterClasses = useMemo(() => {
    if (!selectedSemesterLevel || !selectedDepartmentId) return []
    const department = departments.find(d => d.id === selectedDepartmentId)
    return classes.filter(c => String(getSemesterLevel(semesters.find(s => s.id === c.semester_id)) || '') === selectedSemesterLevel && (
      c.department_id === selectedDepartmentId ||
      (!c.department_id && department && c.intake_year === department.intake_year && c.name.toUpperCase().startsWith(department.shortform.toUpperCase()))
    ))
  }, [classes, departments, semesters, selectedSemesterLevel, selectedDepartmentId])

  // Show each level once: the department is intentionally selected in step 2.
  const semesterLevels = useMemo(() => {
    const assignedIds = new Set(classes.map(c => c.semester_id).filter(Boolean))
    return [...new Set(semesters.filter(s => assignedIds.has(s.id)).map(getSemesterLevel).filter(Boolean))]
      .sort((a, b) => a - b)
  }, [semesters, classes])

  // Already has a timetable check (from DB)
  const alreadyHasTimetable = useMemo(() => {
    if (!selectedClassId || !selectedSemesterId) return false
    return !!savedTimetableMap[`${selectedClassId}_${selectedSemesterId}`]
  }, [selectedClassId, selectedSemesterId, savedTimetableMap])

  const handleGenerate = async () => {
    if (!selectedClass || !selectedSemester || !semesterSubjects.length) return
    if (alreadyHasTimetable) {
      setNotice(`${selectedClass.name} already has a saved timetable. Delete it first if you need to create a replacement.`, 'error')
      return
    }
    if (selectedClass.shift === 'Morning' && (selectedOverflowPeriods !== requiredOverflowPeriods || !hasValidOverflowShape)) {
      setNotice(`Choose exactly ${requiredOverflowPeriods} overflow period${requiredOverflowPeriods === 1 ? '' : 's'} before generating.`, 'error')
      return
    }

    // Show feedback immediately, while the saved schedules are being checked.
    setNotice('Checking lecturer availability and timetable conflicts…', 'warning')

    // Ensure all subjects have at least one lecturer assigned
    const unassignedSubjects = semesterSubjects.filter(sub => {
      const assigned = getSubjectLecturers(sub.id)
      return !assigned || assigned.length === 0
    })

    if (unassignedSubjects.length > 0) {
      const names = unassignedSubjects.map(s => s.name).join(', ')
      setNotice(`Cannot generate timetable. The following subjects have no assigned lecturer: ${names}`, 'error')
      return
    }

    // Build busyMap from all OTHER saved timetables directly from Supabase DB
    const busyMap = {} // lecturerId -> day -> slotIndex -> true
    const dailyLoad = {} // lecturerId -> day -> totalSlots
    const weeklyLoad = {} // lecturerId -> shift -> totalSlots
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

                  const savedShift = savedClass?.shift || selectedClass.shift
                  if (!weeklyLoad[lid]) weeklyLoad[lid] = {}
                  weeklyLoad[lid][savedShift] = (weeklyLoad[lid][savedShift] || 0) + 1

                  // Track occupied slots for other classes in the same shift.
                  const savedSlotIndex = getPhysicalSlotIndex(savedClass?.shift || selectedClass.shift, session, savedGrid[day])
                  const blockingSlot = getBlockingSlotIndex(selectedClass.shift, savedClass?.shift || selectedClass.shift, savedSlotIndex)
                  if (blockingSlot !== null) {
                    if (!dailyLoad[lid]) dailyLoad[lid] = {}
                    dailyLoad[lid][day] = (dailyLoad[lid][day] || 0) + 1

                    if (!busyMap[lid]) busyMap[lid] = {}
                    if (!busyMap[lid][day]) busyMap[lid][day] = {}
                    busyMap[lid][day][blockingSlot] = true
                  }
                }
              })
            }
          })
        }
      })
    }

    // Report the exact subject before the generator starts. This prevents a
    // generic generation error when every qualified lecturer has no free day
    // or no remaining hours in the selected shift.
    const unavailableSubjects = semesterSubjects.filter(subject => {
      const requiredHours = (Number(subject.theory_hours) || 0) + (Number(subject.lab_hours) || 0)
      const requiredTwoHourBlocks = Math.floor(requiredHours / 2)
      const needsFinalOneHourBlock = requiredHours % 2 === 1
      const availabilityField = selectedClass.shift === 'Morning'
        ? 'morning_available_hours'
        : 'afternoon_available_hours'

      return !(getSubjectLecturers(subject.id) || []).some(lecturer => {
        const usedHours = Number(weeklyLoad[lecturer.id]?.[selectedClass.shift] || 0)
        if (Number(lecturer[availabilityField] ?? 20) - usedHours < requiredHours) return false

        const freeSlotsByDay = DAYS.map(day => {
          if (!isLecturerAvailableOnDay(lecturer, day)) return 0
          return [0, 1, 2, 3].filter(slot => !busyMap[lecturer.id]?.[day]?.[slot]).length
        })
        const daysForTwoHourBlocks = freeSlotsByDay.filter(slots => slots >= 2).length
        const daysForOneHourBlocks = freeSlotsByDay.filter(slots => slots >= 1).length
        return daysForTwoHourBlocks >= requiredTwoHourBlocks &&
          daysForOneHourBlocks >= requiredTwoHourBlocks + Number(needsFinalOneHourBlock)
      })
    })

    if (unavailableSubjects.length > 0) {
      const names = unavailableSubjects.map(subject => subject.name).join(', ')
      setNotice(`Cannot generate timetable. No lecturer is available for: ${names}. Add an available teaching day or increase that lecturer's ${selectedClass.shift.toLowerCase()} hours.`, 'error')
      return
    }

    const generation = generateTimetable(
      semesterSubjects, lecturers, selectedClass.shift,
      selectedClass.id, getRandomLecturerForClass, getSubjectLecturers, busyMap, dailyLoad, weeklyLoad, classCountMap, overflowSelection
    )
    if (!generation) {
      setNotice('Could not create a timetable because the selected lecturers have no conflict-free available slots. Check lecturer availability or adjust the class schedule.', 'error')
      return
    }
    setGlobalBusyMap(busyMap)
    setTimetable(generation.timetable)
    setGenerated(true)
    setIsSaved(false)
    if (generation.needsManualBlockCorrection) {
      setNotice('Timetable generated, but one or more 2-hour subject blocks could not be placed consecutively. Use drag-and-drop to arrange them before saving.', 'warning')
    }
  }

  const validateTimetableBeforeSave = async () => {
    const busySlots = new Set()
    const currentSlots = new Set()
    const unassignedSessions = []
    const invalidSessions = []
    const subjectLecturerIds = new Map()
    const currentGrid = timetable || {}
    const scheduledPeriodCount = DAYS.reduce((total, day) => total + (currentGrid[day] || []).length, 0)

    if (scheduledPeriodCount !== expectedPeriodCount) {
      return `Cannot save: the timetable has ${scheduledPeriodCount} periods, but the curriculum requires exactly ${expectedPeriodCount}.`
    }

    for (const day of DAYS) {
      for (const session of currentGrid[day] || []) {
        if (!session.lecturer?.id) {
          unassignedSessions.push(`${session.subject?.name || 'Subject'} on ${day}`)
          continue
        }
        const subjectId = session.subject?.id
        if (subjectId) {
          const selectedLecturerId = subjectLecturerIds.get(subjectId)
          if (selectedLecturerId && selectedLecturerId !== session.lecturer.id) {
            invalidSessions.push(`${session.subject?.name || 'Subject'} has more than one lecturer`)
            continue
          }
          subjectLecturerIds.set(subjectId, session.lecturer.id)
        }
        const lecturer = lecturers.find(item => item.id === session.lecturer.id) || session.lecturer
        if (!isLecturerAvailableOnDay(lecturer, day)) {
          invalidSessions.push(`${lecturer.name} is unavailable on ${day}`)
          continue
        }
        const key = `${lecturer.id}|${day}|${session.slotIndex}`
        if (currentSlots.has(key)) invalidSessions.push(`${lecturer.name} is double-booked on ${day}`)
        currentSlots.add(key)
      }
    }

    if (unassignedSessions.length) return `Cannot save: ${unassignedSessions[0]} has no lecturer.`
    if (invalidSessions.length) return `Cannot save: ${invalidSessions[0]}.`
    const distributionErrors = getSubjectDistributionErrors(currentGrid, semesterSubjects, selectedClass?.shift || 'Morning')
    if (distributionErrors.length) {
      const { subject, expected } = distributionErrors[0]
      return `Cannot save: ${subject} must be split across different days as ${expected.join('+')}.`
    }

    const { data: savedGrids, error } = await supabase.from('timetables').select('class_id, grid')
    if (error) return `Cannot verify lecturer availability: ${error.message}`
    for (const saved of savedGrids || []) {
      if (saved.class_id === selectedClassId) continue
      const savedClass = classes.find(item => item.id === saved.class_id)
      for (const day of DAYS) {
        for (const session of saved.grid?.[day] || []) {
          const savedSlotIndex = getPhysicalSlotIndex(savedClass?.shift || selectedClass?.shift, session, saved.grid?.[day])
          const blockingSlot = getBlockingSlotIndex(selectedClass?.shift, savedClass?.shift || selectedClass?.shift, savedSlotIndex)
          if (session.lecturer?.id && blockingSlot !== null) busySlots.add(`${session.lecturer.id}|${day}|${blockingSlot}`)
        }
      }
    }

    for (const day of DAYS) {
      for (const session of currentGrid[day] || []) {
        if (session.lecturer?.id && busySlots.has(`${session.lecturer.id}|${day}|${session.slotIndex}`)) {
          return `Cannot save: ${session.lecturer.name} is already booked on ${day} at this time.`
        }
      }
    }
    return null
  }

  const handleSaveTimetable = async () => {
    if (!timetable || !selectedClassId || !selectedSemesterId) return
    const validationError = await validateTimetableBeforeSave()
    if (validationError) {
      setNotice(validationError, 'error')
      return
    }
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

  const expectedPeriodCount = semesterSubjects.reduce(
    (total, subject) => total + (Number(subject.theory_hours) || 0) + (Number(subject.lab_hours) || 0), 0
  )

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

  const [draggedItem, setDraggedItem] = useState(null)
  const [dragOverItem, setDragOverItem] = useState(null)

  const getTimeStringForSession = (shiftType, count, slotIdx, slotKind) => {
    if (shiftType === 'Morning') {
      if (slotKind === 'early') return '07:00 AM - 07:45 AM'
      if (slotKind === 'afternoon_1') return '01:00 PM - 02:00 PM'
      if (slotKind === 'afternoon_2') return '02:00 PM - 03:00 PM'
      if (slotKind === 'standard') {
        return [
          '07:45 AM - 08:45 AM', '08:45 AM - 09:45 AM',
          '10:15 AM - 11:15 AM', '11:15 AM - 12:15 PM',
        ][slotIdx] || `Period ${slotIdx + 1}`
      }
      const morningEarly = [
        '07:00 AM - 07:45 AM', '07:45 AM - 08:45 AM', '08:45 AM - 09:45 AM',
        '10:15 AM - 11:15 AM', '11:15 AM - 12:15 PM', '01:00 PM - 02:00 PM', '02:00 PM - 03:00 PM'
      ]
      const morningDefault = [
        '07:45 AM - 08:45 AM', '08:45 AM - 09:45 AM', '10:15 AM - 11:15 AM',
        '11:15 AM - 12:15 PM', '12:15 PM - 01:15 PM', '02:15 PM - 03:15 PM'
      ]
      return count > 4
        ? (morningEarly[slotIdx] || `Period ${slotIdx + 1}`)
        : (morningDefault[slotIdx] || `Period ${slotIdx + 1}`)
    } else {
      const afternoonSlots = [
        '01:00 PM - 01:50 PM', '01:50 PM - 02:40 PM', '02:40 PM - 03:30 PM', 
        '04:00 PM - 05:00 PM', '05:00 PM - 05:50 PM', '05:50 PM - 06:40 PM', '06:40 PM - 07:30 PM'
      ]
      return afternoonSlots[slotIdx] || `Period ${slotIdx + 1}`
    }
  }

  const validateRowSwap = (dayA, idxA, dayB, idxB) => {
    if (dayA === dayB && idxA === idxB) return { valid: true }

    const sessA = timetable[dayA][idxA]
    const sessB = timetable[dayB][idxB]

    const timeStrA = getTimeStringForSession(shift, timetable[dayA].length, sessA.slotIndex, sessA.slotKind)
    const timeStrB = getTimeStringForSession(shift, timetable[dayB].length, sessB.slotIndex, sessB.slotKind)

    const lecA = sessA.lecturer
    const lecB = sessB.lecturer

    // Check Lecturer A moving to Day B, Slot B (at timeStrB)
    if (lecA) {
      if (!isLecturerAvailableOnDay(lecA, dayB)) {
        return {
          valid: false,
          error: `Lecturer ${lecA.name} is not available on ${dayB}.`
        }
      }

      if (globalBusyMap[lecA.id]?.[dayB]?.[sessB.slotIndex]) {
        return {
          valid: false,
          error: `Lecturer ${lecA.name} is not available at ${timeStrB} on ${dayB} (teaching another class at this time).`
        }
      }

      const sameClassConflict = timetable[dayB]?.some((s, i) => {
        if (dayA === dayB && (i === idxA || i === idxB)) return false
        if (dayA !== dayB && i === idxB) return false
        return s.slotIndex === sessB.slotIndex && s.lecturer?.id === lecA.id
      })
      if (sameClassConflict) {
        return {
          valid: false,
          error: `Lecturer ${lecA.name} is not available at ${timeStrB} on ${dayB} (already scheduled in this class at this time).`
        }
      }
    }

    // Check Lecturer B moving to Day A, Slot A (at timeStrA)
    if (lecB) {
      if (!isLecturerAvailableOnDay(lecB, dayA)) {
        return {
          valid: false,
          error: `Lecturer ${lecB.name} is not available on ${dayA}.`
        }
      }

      if (globalBusyMap[lecB.id]?.[dayA]?.[sessA.slotIndex]) {
        return {
          valid: false,
          error: `Lecturer ${lecB.name} is not available at ${timeStrA} on ${dayA} (teaching another class at this time).`
        }
      }

      const sameClassConflict = timetable[dayA]?.some((s, i) => {
        if (dayA === dayB && (i === idxA || i === idxB)) return false
        if (dayA !== dayB && i === idxA) return false
        return s.slotIndex === sessA.slotIndex && s.lecturer?.id === lecB.id
      })
      if (sameClassConflict) {
        return {
          valid: false,
          error: `Lecturer ${lecB.name} is not available at ${timeStrA} on ${dayA} (already scheduled in this class at this time).`
        }
      }
    }

    return { valid: true }
  }

  const executeRowSwap = (dayA, idxA, dayB, idxB) => {
    const newTimetable = JSON.parse(JSON.stringify(timetable))
    const sessA = newTimetable[dayA][idxA]
    const sessB = newTimetable[dayB][idxB]

    const timeStrA = getTimeStringForSession(shift, timetable[dayA].length, sessA.slotIndex, sessA.slotKind)
    const timeStrB = getTimeStringForSession(shift, timetable[dayB].length, sessB.slotIndex, sessB.slotKind)

    const tempSubject = sessA.subject
    const tempType = sessA.type
    const tempLecturer = sessA.lecturer

    sessA.subject = sessB.subject
    sessA.type = sessB.type
    sessA.lecturer = sessB.lecturer

    sessB.subject = tempSubject
    sessB.type = tempType
    sessB.lecturer = tempLecturer

    setTimetable(newTimetable)
    setIsSaved(false)

    setNotice(`Swapped sessions between ${timeStrA} (${dayA}) and ${timeStrB} (${dayB})! Click 'Save Timetable' to keep changes.`, 'success')
  }

  const handleDragStart = (e, day, idx) => {
    setDraggedItem({ day, idx })
    e.dataTransfer.setData('text/plain', JSON.stringify({ day, idx }))
    e.dataTransfer.effectAllowed = 'move'
  }

  const handleDragOver = (e, day, idx) => {
    e.preventDefault()
    e.dataTransfer.dropEffect = 'move'
    if (!dragOverItem || dragOverItem.day !== day || dragOverItem.idx !== idx) {
      setDragOverItem({ day, idx })
    }
  }

  const handleDragLeave = (e) => {
    e.preventDefault()
  }

  const handleDrop = (e, dayB, idxB) => {
    e.preventDefault()
    let source = draggedItem
    if (!source) {
      try {
        const raw = e.dataTransfer.getData('text/plain')
        if (raw) source = JSON.parse(raw)
      } catch (err) {
        // ignore
      }
    }

    if (source) {
      const { day: dayA, idx: idxA } = source
      if (dayA !== undefined && idxA !== undefined) {
        const validation = validateRowSwap(dayA, idxA, dayB, idxB)
        if (!validation.valid) {
          setNotice(validation.error, 'error')
        } else {
          executeRowSwap(dayA, idxA, dayB, idxB)
        }
      }
    }

    setDraggedItem(null)
    setDragOverItem(null)
  }

  const handleDragEnd = () => {
    setDraggedItem(null)
    setDragOverItem(null)
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
    setIsSaved(false)
  }

  const handleSessionTypeChange = (day, sessionIdx, type) => {
    const newTimetable = { ...timetable }
    newTimetable[day][sessionIdx] = { ...newTimetable[day][sessionIdx], type }
    setTimetable(newTimetable)
    setIsSaved(false)
  }

  const getAvailableSessionTypes = (subject, currentType) => {
    const types = []
    if (Number(subject?.theory_hours) > 0) types.push('Theory')
    if (Number(subject?.lab_hours) > 0) types.push('Lab')
    // Preserve older timetable rows whose curriculum details are unavailable.
    return types.length ? types : [currentType]
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
          .no-print { display: none !important; }
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
                title="Generate a new layout"
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
                value={selectedSemesterLevel}
                onChange={e => saveSemester(e.target.value)}
                className="w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm text-slate-700 outline-none focus:border-brand-600"
              >
                <option value="">— Select Semester —</option>
                {semesterLevels.map(level => <option key={level} value={level}>Semester {level}</option>)}
              </select>
              {semesterLevels.length === 0 && (
                <p className="mt-1.5 text-xs text-amber-600">No semesters have classes assigned yet. Go to <b>Classes</b> and use &ldquo;Set Semester&rdquo; on each year card.</p>
              )}
              {selectedSemesterLevel && semesterDepartments.length === 0 && (
                <p className="mt-1.5 text-xs text-amber-600">No departments with classes are assigned to this semester yet. Go to Classes and assign a semester to the department&rsquo;s classes.</p>
              )}
            </div>

            {/* Step 2 - Department */}
            <div>
              <label className="block text-sm font-bold text-brand-950 mb-1.5">
                <span className="mr-2 inline-flex h-5 w-5 items-center justify-center rounded-full bg-brand-600 text-xs text-white font-bold">2</span>
                Department
              </label>
              <select
                value={selectedDepartmentId}
                onChange={e => saveDepartment(e.target.value)}
                disabled={!selectedSemesterLevel}
                className="w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm text-slate-700 outline-none focus:border-brand-600 disabled:opacity-40"
              >
                <option value="">— Select Department —</option>
                {semesterDepartments.map(department => (
                  <option key={department.id} value={department.id}>{department.name} ({department.shortform})</option>
                ))}
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
                disabled={!selectedDepartmentId}
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

            {selectedClass?.shift === 'Morning' && requiredOverflowPeriods > 0 && (
              <div className="rounded-xl border border-indigo-200 bg-indigo-50/60 p-4">
                <div className="mb-3 flex items-start justify-between gap-3">
                  <div>
                    <p className="text-sm font-bold text-brand-950">Choose overflow periods</p>
                    <p className="mt-0.5 text-xs text-slate-600">Select exactly the extra hours needed. Use 7:00 AM or 1:00 PM; 2:00 PM is available only after 1:00 PM on the same day.</p>
                  </div>
                  <span className={`shrink-0 rounded-full px-2 py-1 text-xs font-bold ${selectedOverflowPeriods === requiredOverflowPeriods && hasValidOverflowShape ? 'bg-emerald-100 text-emerald-800' : 'bg-amber-100 text-amber-800'}`}>
                    {selectedOverflowPeriods} / {requiredOverflowPeriods}
                  </span>
                </div>
                {!hasValidOverflowShape && (
                  <p className="mt-3 text-xs font-medium text-amber-800">This selection has too many single-hour periods for the odd-hour subjects. Replace an extra 7:00 AM choice with a 1:00–2:00 PM pair.</p>
                )}
                <div className="space-y-2">
                  {DAYS.map(day => (
                    <div key={day} className="grid grid-cols-[78px_repeat(3,minmax(0,1fr))] items-center gap-2 text-xs">
                      <span className="font-semibold text-slate-700">{day.slice(0, 3)}</span>
                      {[
                        ['early', '7:00 AM'],
                        ['afternoon_1', '1:00 PM'],
                        ['afternoon_2', '2:00 PM'],
                      ].map(([period, label]) => {
                        const checked = !!overflowSelection[day]?.[period]
                        const needsFirstAfternoon = period === 'afternoon_2' && !overflowSelection[day]?.afternoon_1
                        const reachedOverflowLimit = !checked && selectedOverflowPeriods >= requiredOverflowPeriods
                        return (
                          <label key={period} className="flex cursor-pointer items-center gap-1.5 whitespace-nowrap text-slate-700">
                            <input
                              type="checkbox"
                              checked={checked}
                              disabled={needsFirstAfternoon || reachedOverflowLimit}
                              onChange={event => setOverflowSelection(current => {
                                const currentCount = DAYS.reduce((total, currentDay) => total + [
                                  current[currentDay]?.early,
                                  current[currentDay]?.afternoon_1,
                                  current[currentDay]?.afternoon_2,
                                ].filter(Boolean).length, 0)
                                if (event.target.checked && currentCount >= requiredOverflowPeriods) return current
                                return {
                                  ...current,
                                  [day]: {
                                    ...current[day],
                                    [period]: event.target.checked,
                                    ...(period === 'afternoon_1' && !event.target.checked ? { afternoon_2: false } : {}),
                                  },
                                }
                              })}
                              className="h-3.5 w-3.5 rounded border-slate-300 text-brand-600 focus:ring-brand-500 disabled:cursor-not-allowed disabled:opacity-40"
                            />
                            {label}
                          </label>
                        )
                      })}
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Status: already has a timetable */}
            {alreadyHasTimetable && selectedClassId && selectedSemesterId && (
              <div className="rounded-xl border border-blue-300 bg-blue-50 px-4 py-3 text-sm text-blue-900 flex items-start gap-2">
                <span className="text-lg">ℹ️</span>
                <div>
                  <b>{selectedClass?.name}</b> already has a saved timetable for <b>{selectedSemester?.name}</b>.
                  <p className="mt-1 text-xs text-blue-700">Generation is locked for this class to prevent duplicate timetables. You can view it in the Master Schedule Grid.</p>
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
              disabled={!selectedSemesterId || !selectedClassId || !semesterSubjects.length || alreadyHasTimetable || (selectedClass?.shift === 'Morning' && (selectedOverflowPeriods !== requiredOverflowPeriods || !hasValidOverflowShape))}
              className="w-full rounded-xl bg-brand-600 py-3 font-bold text-white shadow-md shadow-brand-600/20 transition hover:bg-brand-800 disabled:opacity-40 disabled:cursor-not-allowed flex items-center justify-center gap-2"
            >
              <Icon name="wand" className="h-5 w-5" />
              {alreadyHasTimetable ? 'Timetable Already Generated' : 'Generate Timetable'}
            </button>
          </div>
        </div>
      ) : (
        <div className="flex flex-col items-center bg-white border border-slate-200 rounded-xl p-8">
          {/* Drag & Drop Tip Banner */}
          <div className="no-print mb-6 w-full max-w-4xl rounded-xl border border-indigo-100 bg-indigo-50/80 px-4 py-3 text-xs font-medium text-indigo-900 flex flex-col items-start gap-3 shadow-sm sm:flex-row sm:items-center">
            <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-indigo-600 text-white font-bold text-sm">⋮⋮</span>
            <div>
              <p className="font-bold text-indigo-950 text-sm">Interactive Drag & Drop Row Replacement</p>
              <p className="text-indigo-700">Drag any session row and drop it onto another to replace/swap time slots. The system automatically validates lecturer availability for both time slots.</p>
            </div>
          </div>

          <div className="w-full overflow-x-auto">
          <div ref={printRef} id="print-timetable" className="min-w-[640px] max-w-4xl bg-white" style={{fontFamily: "'Times New Roman', Times, serif"}}>
            
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
                        const timeString = getTimeStringForSession(shift, daySessions.length, session.slotIndex, session.slotKind)
                        const isDragging = draggedItem?.day === day && draggedItem?.idx === idx
                        const isDragOver = dragOverItem?.day === day && dragOverItem?.idx === idx

                        return (
                          <tr 
                            key={`${day}-${idx}`}
                            draggable={true}
                            onDragStart={(e) => handleDragStart(e, day, idx)}
                            onDragOver={(e) => handleDragOver(e, day, idx)}
                            onDragLeave={handleDragLeave}
                            onDrop={(e) => handleDrop(e, day, idx)}
                            onDragEnd={handleDragEnd}
                            className={`border border-black transition-all cursor-grab active:cursor-grabbing ${
                              isDragging 
                                ? 'opacity-40 bg-indigo-50 border-2 border-dashed border-indigo-400' 
                                : isDragOver
                                ? 'bg-blue-100 border-2 border-blue-600 font-bold shadow-inner'
                                : 'bg-white text-black hover:bg-slate-50'
                            }`}
                          >
                            <td className="border border-black px-3 py-1.5 align-middle">
                              <div className="flex items-center gap-2">
                                <span className="no-print select-none text-slate-400 hover:text-slate-700 cursor-grab text-xs font-mono font-bold" title="Drag to swap row">⋮⋮</span>
                                <span>{session.subject.name}</span>
                              </div>
                            </td>
                            <td className="border border-black px-3 py-1.5 text-center align-middle whitespace-nowrap">
                              {timeString}
                            </td>
                            <td className="border border-black px-3 py-1.5 align-middle">
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
                            </td>
                            <td className="border border-black px-3 py-1.5 text-center align-middle">
                              <select
                                value={session.type}
                                onChange={(e) => handleSessionTypeChange(day, idx, e.target.value)}
                                className="w-full bg-transparent text-center outline-none border-b border-dashed border-slate-300 focus:border-brand-500 py-1"
                              >
                                {getAvailableSessionTypes(session.subject, session.type).map(type => (
                                  <option key={type} value={type}>{type}</option>
                                ))}
                              </select>
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
        </div>
      )}
    </>
  )
}
