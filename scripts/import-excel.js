#!/usr/bin/env node
/**
 * Import drone flight data from Excel workbook into flights.json
 *
 * Excel structure per sheet (one sheet = one month):
 *   Block size: 22 rows, repeating
 *   Row +0 (offset from block start): label headers — skip
 *   Row +1: mission data — A=tail, B=date("DD.MM.YY"), C=mission name,
 *            E=pilot1 name, F=pilot1 license, G=pilot2 name, H=pilot2 license
 *   Row +2: column headers — skip
 *   Rows +3..+15: flight entries (up to 13)
 *            B=startTime(fraction), C=endTime(fraction), D=pilot name,
 *            E=license, F=battery letter, G=batteryStart%, H=batteryEnd%
 *            Skip if B.v===0 or D.v==="."
 *   Rows +16..+18: summary rows — skip
 *   Rows +19..+21: spacer — skip
 */

const XLSX = require('xlsx')
const fs   = require('fs')
const path = require('path')

const FILE    = path.join(process.env.HOME, 'Desktop', 'מתילן -אורן וייסבלום ניסיון .xlsx')
const DB_PATH = path.join(__dirname, '..', 'data', 'flights.json')

const BLOCK_SIZE      = 22
const MISSION_OFFSET  = 1   // within block, 0-indexed
const FLIGHT_OFFSET   = 3   // first flight row within block
const FLIGHT_ROWS     = 13

// Column indices (A=0)
const C = { A:0, B:1, C:2, D:3, E:4, F:5, G:6, H:7 }

// ── Helpers ────────────────────────────────────────────────────────────────

function cell(ws, row, col) {
  return ws[XLSX.utils.encode_cell({ r: row, c: col })] || null
}

/** Extract formatted time "HH:MM" from a cell whose .w is e.g. "15:11" */
function cellTime(ws, row, col) {
  const cl = cell(ws, row, col)
  if (!cl) return null
  // .w is the display-formatted string, e.g. "15:11" or "9:05"
  if (cl.w && /^\d{1,2}:\d{2}$/.test(cl.w.trim())) {
    const [h, m] = cl.w.trim().split(':')
    return `${h.padStart(2,'0')}:${m.padStart(2,'0')}`
  }
  // Fallback: compute from raw fraction
  if (typeof cl.v === 'number' && cl.v > 0) {
    const totalMin = Math.round(cl.v * 24 * 60)
    return `${String(Math.floor(totalMin/60)).padStart(2,'0')}:${String(totalMin%60).padStart(2,'0')}`
  }
  return null
}

/** Parse "DD.MM.YY" or "DD.MM.YYYY" → "YYYY-MM-DD" */
function parseDate(raw) {
  if (!raw) return null
  const s = String(raw).trim()
  const m = s.match(/^(\d{1,2})\.(\d{1,2})\.(\d{2,4})$/)
  if (!m) return null
  const d = m[1].padStart(2,'0')
  const mo = m[2].padStart(2,'0')
  let y = parseInt(m[3])
  if (y < 100) y += 2000
  return `${y}-${mo}-${d}`
}

function calcDuration(start, end) {
  if (!start || !end) return 0
  const [sh, sm] = start.split(':').map(Number)
  const [eh, em] = end.split(':').map(Number)
  let mins = (eh * 60 + em) - (sh * 60 + sm)
  if (mins < 0) mins += 24 * 60
  return mins
}

function textVal(ws, row, col) {
  const cl = cell(ws, row, col)
  if (!cl) return null
  const v = cl.v !== undefined ? String(cl.v).trim() : null
  return (v === '' || v === null) ? null : v
}

function numVal(ws, row, col) {
  const cl = cell(ws, row, col)
  if (!cl || typeof cl.v !== 'number') return 0
  return cl.v
}

// ── Load DB ────────────────────────────────────────────────────────────────

const db = JSON.parse(fs.readFileSync(DB_PATH, 'utf-8'))

// Remove old sample flights (those with IDs f1..f30)
const sampleIds = new Set(Array.from({length:30}, (_,i) => `f${i+1}`))
const beforeCount = db.flights.length
db.flights = db.flights.filter(f => !sampleIds.has(f.id))
const removedSample = beforeCount - db.flights.length
if (removedSample > 0) console.log(`🗑  Removed ${removedSample} sample flights`)

// Pilot lookup
const byName    = {}
const byLicense = {}
db.pilots.forEach(p => {
  byName[p.name] = p
  if (p.license) byLicense[p.license] = p
})

function ensurePilot(name, license) {
  const cleanName = name.trim()
  const cleanLic  = license ? String(license).trim() : null

  if (byName[cleanName]) {
    const p = byName[cleanName]
    // Update license if it was a placeholder and we now have a real one
    if (cleanLic && cleanLic !== p.license && (p.license === 'ADMIN' || p.license === 'TEST01')) {
      console.log(`  📝 Updated license for ${cleanName}: ${p.license} → ${cleanLic}`)
      p.license = cleanLic
      byLicense[cleanLic] = p
    }
    return p
  }

  // New pilot
  const newPilot = {
    id: `pe${Date.now()}_${Math.floor(Math.random()*9999)}`,
    name: cleanName,
    license: cleanLic || 'UNKNOWN',
  }
  db.pilots.push(newPilot)
  byName[cleanName] = newPilot
  if (cleanLic) byLicense[cleanLic] = newPilot
  console.log(`  ➕ New pilot: ${cleanName} (${newPilot.license})`)
  return newPilot
}

// ── Import ─────────────────────────────────────────────────────────────────

const wb = XLSX.readFile(FILE, { cellDates: false, raw: false })

let totalImported = 0
let totalSkipped  = 0
const countByPilot = {}

for (const sheetName of wb.SheetNames) {
  const ws = wb.Sheets[sheetName]
  if (!ws['!ref']) continue
  const maxRow = XLSX.utils.decode_range(ws['!ref']).e.r
  let sheetCount = 0

  for (let blockStart = 0; blockStart + MISSION_OFFSET <= maxRow; blockStart += BLOCK_SIZE) {
    const mRow = blockStart + MISSION_OFFSET

    // Mission header
    const tailRaw    = textVal(ws, mRow, C.A)
    const dateRaw    = textVal(ws, mRow, C.B)
    const missionName = textVal(ws, mRow, C.C)

    const missionDate = parseDate(dateRaw)
    if (!missionDate) continue   // empty/spacer block
    if (!missionName) continue

    const tailNumber = tailRaw
      ? tailRaw.toUpperCase().replace(/^4X-/i, '4X-')
      : '4X-YXB'

    // Flight entries
    for (let fi = 0; fi < FLIGHT_ROWS; fi++) {
      const fRow = blockStart + FLIGHT_OFFSET + fi
      if (fRow > maxRow) break

      // Skip empty rows (B=0 means no time)
      const bRaw = numVal(ws, fRow, C.B)
      if (bRaw === 0) continue

      const pilotName  = textVal(ws, fRow, C.D)
      const license    = textVal(ws, fRow, C.E)
      if (!pilotName || pilotName === '.' || pilotName === '-') continue
      if (!license   || license   === '.' || license   === '-') continue

      const startTime = cellTime(ws, fRow, C.B)
      const endTime   = cellTime(ws, fRow, C.C)
      if (!startTime || !endTime) continue

      const duration = calcDuration(startTime, endTime)
      if (duration <= 0) { totalSkipped++; continue }

      const batteryRaw  = textVal(ws, fRow, C.F)
      const battery     = batteryRaw ? batteryRaw.toUpperCase().trim() : 'A'
      const batteryStart = numVal(ws, fRow, C.G)
      const batteryEnd   = numVal(ws, fRow, C.H)

      const pilot = ensurePilot(pilotName, license)

      // Duplicate check
      const dup = db.flights.some(f =>
        f.pilotId   === pilot.id &&
        f.date      === missionDate &&
        f.startTime === startTime &&
        f.endTime   === endTime
      )
      if (dup) { totalSkipped++; continue }

      db.flights.push({
        id: `imp_${Date.now()}_${Math.floor(Math.random()*99999)}`,
        pilotId: pilot.id,
        pilotName: pilot.name,
        date: missionDate,
        missionName,
        tailNumber,
        battery,
        startTime,
        endTime,
        batteryStart,
        batteryEnd,
        duration,
      })

      // Update battery last-known level
      if (/^[A-F]$/.test(battery)) {
        db.batteries[battery] = batteryEnd
      }

      countByPilot[pilot.name] = (countByPilot[pilot.name] || 0) + 1
      totalImported++
      sheetCount++
    }
  }

  console.log(`  📅 ${sheetName}: ${sheetCount} flights`)
}

// ── Save ───────────────────────────────────────────────────────────────────

fs.writeFileSync(DB_PATH, JSON.stringify(db, null, 2), 'utf-8')

console.log('\n✅ Import complete!')
console.log(`   Flights imported : ${totalImported}`)
console.log(`   Flights skipped  : ${totalSkipped} (duration 0 or duplicates)`)
console.log(`   Total in DB now  : ${db.flights.length}`)
console.log('\n📊 Flights per pilot:')
Object.entries(countByPilot)
  .sort((a, b) => b[1] - a[1])
  .forEach(([name, count]) => {
    const mins = db.flights.filter(f => f.pilotName === name).reduce((s,f) => s+f.duration, 0)
    const h = Math.floor(mins/60), m = mins%60
    console.log(`   ${name}: ${count} flights  (${h}ש' ${m}ד')`)
  })
