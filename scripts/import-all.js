#!/usr/bin/env node
/**
 * Import all historical flight data from Excel files into Supabase.
 *
 * Files: data/excel/4x-yxb.xlsx, 4x-nxj.xlsx, 4x-uji.xlsx,
 *        1007014.xlsx, 2026_logbook.xlsx
 *
 * Block structure (repeated within each sheet):
 *   Label row  : col A = "מס' זנב"
 *   Mission row: col A=tail, B=date, C=mission, E=pilot1, F=license1,
 *                G=pilot2, H=license2, I=observer
 *   (optional blank row)
 *   Header row : col B = "שעת התחלה"
 *   Flight rows: col B=startTime(fraction), C=endTime(fraction),
 *                D=pilotName, E=license, F=battery, G=batt%, H=batt%
 *   Summary + spacer rows
 *
 * Block sizes vary (21-23) — detected by scanning for label rows.
 * Battery stored as letter (A-F) in per-drone files, number (1-6) in logbook.
 */

const XLSX    = require('xlsx')
const path    = require('path')
const fs      = require('fs')
const { createClient } = require('@supabase/supabase-js')

// ── Load .env.local ────────────────────────────────────────────────────────
const envPath = path.join(__dirname, '..', '.env.local')
if (!fs.existsSync(envPath)) {
  console.error('❌  .env.local not found.')
  console.error('    Create it with:\n')
  console.error('    NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co')
  console.error('    SUPABASE_SERVICE_ROLE_KEY=your-service-role-key\n')
  process.exit(1)
}
for (const line of fs.readFileSync(envPath, 'utf-8').split('\n')) {
  const eq = line.indexOf('=')
  if (eq > 0) process.env[line.slice(0, eq).trim()] = line.slice(eq + 1).trim()
}

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY
if (!SUPABASE_URL || !SUPABASE_KEY ||
    SUPABASE_URL.includes('your-project') || SUPABASE_KEY.includes('your-service')) {
  console.error('❌  Supabase credentials missing or still placeholder in .env.local')
  process.exit(1)
}

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
})

// ── Files to import ────────────────────────────────────────────────────────
const DATA_DIR = path.join(__dirname, '..', 'data', 'excel')

const FILES = [
  { file: '4x-yxb.xlsx',      sheets: null },  // all sheets
  { file: '4x-nxj.xlsx',      sheets: null },
  { file: '4x-uji.xlsx',      sheets: null },
  { file: '1007014.xlsx',     sheets: null },
  { file: '2026_logbook.xlsx', sheets: [
    'G3 -UJS',
    'מאביק 2 PZK',
    'מאטריס 600 XPG',
    ' xtu מאטריס 300',
    'AVATA 2 - 1005254',
    'AVATA 1005189',
    'AVATA 1005187',
  ]},
]

// ── Helpers ────────────────────────────────────────────────────────────────

function cellVal(ws, r, c) {
  return ws[XLSX.utils.encode_cell({ r, c })] || null
}

function textVal(ws, r, c) {
  const cl = cellVal(ws, r, c)
  if (!cl || cl.v === undefined) return null
  const v = String(cl.v).trim()
  return v === '' ? null : v
}

function numVal(ws, r, c) {
  const cl = cellVal(ws, r, c)
  if (!cl || typeof cl.v !== 'number') return 0
  return cl.v
}

/** Extract HH:MM string from a cell that holds an Excel time fraction */
function cellTime(ws, r, c) {
  const cl = cellVal(ws, r, c)
  if (!cl) return null
  // Use formatted string if available (e.g. "15:11")
  if (cl.w && /^\d{1,2}:\d{2}$/.test(cl.w.trim())) {
    const [h, m] = cl.w.trim().split(':')
    return `${h.padStart(2, '0')}:${m}`
  }
  // Fall back to numeric fraction
  if (typeof cl.v === 'number' && cl.v > 0) {
    const totalMin = Math.round(cl.v * 24 * 60)
    return `${String(Math.floor(totalMin / 60)).padStart(2, '0')}:${String(totalMin % 60).padStart(2, '0')}`
  }
  return null
}

/** "DD.MM.YY" or "DD.MM.YYYY" → "YYYY-MM-DD" */
function parseDate(raw) {
  if (!raw) return null
  const m = String(raw).trim().match(/^(\d{1,2})\.(\d{1,2})\.(\d{2,4})$/)
  if (!m) return null
  let y = parseInt(m[3])
  if (y < 100) y += 2000
  return `${y}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}`
}

function calcDuration(start, end) {
  if (!start || !end) return 0
  const [sh, sm] = start.split(':').map(Number)
  const [eh, em] = end.split(':').map(Number)
  let mins = (eh * 60 + em) - (sh * 60 + sm)
  if (mins < 0) mins += 24 * 60
  return mins
}

/** Normalize battery: letter A-F → uppercase; number 1-6 → A-F; else keep */
function normBattery(raw) {
  if (!raw) return 'A'
  const s = String(raw).trim()
  if (/^[A-Fa-f]$/.test(s)) return s.toUpperCase()
  const n = parseInt(s)
  if (!isNaN(n) && n >= 1 && n <= 6) return String.fromCharCode(64 + n)
  return s || 'A'
}

/** Lowercase and trim tail number */
function normTail(raw) {
  if (!raw) return null
  return String(raw).trim().toLowerCase()
}

/** Normalize pilot name for dedup: lowercase, collapse spaces, unify apostrophes */
function pilotKey(name) {
  return String(name).trim().toLowerCase()
    .replace(/\s+/g, ' ')
    .replace(/[''`׳]/g, "'")  // unify apostrophe variants (e.g. תורג'מן vs תורגמן)
}

// ── Phase 1: Scan all files and collect raw flight records ─────────────────

function scanSheet(wb, sheetName) {
  const ws = wb.Sheets[sheetName]
  if (!ws || !ws['!ref']) return []

  const range  = XLSX.utils.decode_range(ws['!ref'])
  const flights = []

  // Find all label rows (col A contains "מס' זנב")
  const labelRows = []
  for (let r = 0; r <= range.e.r; r++) {
    const c0 = cellVal(ws, r, 0)
    if (c0 && typeof c0.v === 'string' && c0.v.includes('מס')) {
      labelRows.push(r)
    }
  }

  for (let li = 0; li < labelRows.length; li++) {
    const labelRow = labelRows[li]
    const mRow     = labelRow + 1  // mission info row
    const nextBlock = li + 1 < labelRows.length ? labelRows[li + 1] : range.e.r + 1

    // Mission header
    const tailRaw    = textVal(ws, mRow, 0)
    const dateRaw    = textVal(ws, mRow, 1)
    const missionName = textVal(ws, mRow, 2)
    const p1Name     = textVal(ws, mRow, 4)  // pilot 1 name (for reference)
    const p1Lic      = textVal(ws, mRow, 5)  // pilot 1 license
    const observer   = textVal(ws, mRow, 8)  // תצפיתן

    const date = parseDate(dateRaw)
    if (!date) continue
    if (!missionName || missionName === '.' || /שם משימה/.test(missionName)) continue

    const tailNumber = normTail(tailRaw)

    // Scan rows from label+2 up to the row before next block (max 18 rows scan)
    const scanEnd = Math.min(labelRow + 18, nextBlock - 1)
    for (let r = labelRow + 2; r <= scanEnd; r++) {
      // Skip any row whose col B is not a positive number (header rows, blank rows)
      const bCell = cellVal(ws, r, 1)
      if (!bCell || typeof bCell.v !== 'number' || bCell.v <= 0) continue

      // Must have a pilot name
      const pilotName = textVal(ws, r, 3)
      if (!pilotName || pilotName === '.' || pilotName === '-') continue

      const startTime = cellTime(ws, r, 1)
      const endTime   = cellTime(ws, r, 2)
      if (!startTime || !endTime) continue

      const duration = calcDuration(startTime, endTime)
      if (duration <= 0) continue

      const license     = textVal(ws, r, 4)
      const battery     = normBattery(textVal(ws, r, 5))
      const batteryStart = Math.round(numVal(ws, r, 6)) || 0
      const batteryEnd   = Math.round(numVal(ws, r, 7)) || 0

      flights.push({
        pilotName,
        pilotLicense: license,
        date,
        missionName,
        tailNumber,
        battery,
        startTime,
        endTime,
        batteryStart,
        batteryEnd,
        duration,
        observer: observer || '',
      })
    }
  }

  return flights
}

// ── Main ───────────────────────────────────────────────────────────────────

async function main() {
  console.log('🚀 Starting import…\n')

  // Load existing data from Supabase
  const [pilotsRes, flightsRes] = await Promise.all([
    supabase.from('pilots').select('*'),
    supabase.from('flights').select('pilot_id, date, start_time, end_time'),
  ])
  if (pilotsRes.error)  { console.error('Load pilots failed:', pilotsRes.error.message);  process.exit(1) }
  if (flightsRes.error) { console.error('Load flights failed:', flightsRes.error.message); process.exit(1) }

  const pilotByName    = {}   // normalized name → pilot
  const pilotByLicense = {}   // license string  → pilot
  for (const p of pilotsRes.data) {
    pilotByName[pilotKey(p.name)] = p
    if (p.license && p.license !== 'UNKNOWN') pilotByLicense[p.license] = p
  }

  const existingFP = new Set(
    flightsRes.data.map(f => `${f.pilot_id}|${f.date}|${f.start_time}|${f.end_time}`)
  )

  console.log(`📊 Existing DB: ${pilotsRes.data.length} pilots, ${flightsRes.data.length} flights\n`)

  // ── Phase 1: Scan all files ──────────────────────────────────────────────
  const rawFlights = []  // collected from all sheets

  for (const { file, sheets } of FILES) {
    const filePath = path.join(DATA_DIR, file)
    if (!fs.existsSync(filePath)) { console.warn(`⚠️  Not found: ${file}`); continue }

    console.log(`📁 ${file}`)
    const wb = XLSX.readFile(filePath, { cellDates: false, raw: false })
    const sheetsToProcess = sheets || wb.SheetNames

    for (const sheetName of sheetsToProcess) {
      if (!wb.SheetNames.includes(sheetName)) {
        console.warn(`   ⚠️  Sheet not found: "${sheetName}"`)
        continue
      }
      const flights = scanSheet(wb, sheetName)
      console.log(`   📅 ${sheetName}: ${flights.length} flights`)
      rawFlights.push(...flights)
    }
  }

  console.log(`\n🔍 Total raw flights scanned: ${rawFlights.length}`)

  // ── Phase 2: Resolve pilots ──────────────────────────────────────────────
  // Collect all unique (name, license) pairs
  const uniquePilots = new Map()  // normalized name → { name, license }
  for (const f of rawFlights) {
    const key = pilotKey(f.pilotName)
    if (!uniquePilots.has(key)) {
      uniquePilots.set(key, { name: f.pilotName.trim(), license: f.pilotLicense })
    } else if (!uniquePilots.get(key).license && f.pilotLicense) {
      // Update with a real license if we find one
      uniquePilots.get(key).license = f.pilotLicense
    }
  }

  const pilotsToInsert = []
  for (const [key, { name, license }] of uniquePilots) {
    if (pilotByName[key]) continue  // already exists
    const cleanLic = license ? String(license).trim() : null
    if (cleanLic && pilotByLicense[cleanLic]) {
      // Same license, different name spelling — map to existing
      pilotByName[key] = pilotByLicense[cleanLic]
      continue
    }
    const newPilot = {
      id:      `imp_${Date.now()}_${Math.floor(Math.random() * 99999)}`,
      name,
      license: cleanLic || 'UNKNOWN',
    }
    pilotsToInsert.push(newPilot)
    pilotByName[key] = newPilot
    if (cleanLic) pilotByLicense[cleanLic] = newPilot
    console.log(`  ➕ New pilot: ${name} (${newPilot.license})`)
    await new Promise(r => setTimeout(r, 1))  // prevent duplicate IDs from same ms
  }

  if (pilotsToInsert.length > 0) {
    console.log(`\n👤 Inserting ${pilotsToInsert.length} new pilots…`)
    const { error } = await supabase.from('pilots').insert(
      pilotsToInsert.map(p => ({ id: p.id, name: p.name, license: p.license }))
    )
    if (error) { console.error('Pilot insert failed:', error.message); process.exit(1) }
    console.log(`   ✅ Done`)
  }

  // ── Detect schema: check if observer column exists ──────────────────────
  const { data: sampleRow } = await supabase.from('flights').select('*').limit(1).single()
  const hasObserverCol = sampleRow && 'observer' in sampleRow
  if (!hasObserverCol) {
    console.log('\n⚠️  observer/gas_dropped columns not found in DB — inserting without them.')
    console.log('   Run scripts/migrate-add-observer-gas.sql in Supabase SQL Editor to add them.\n')
  }

  // ── Phase 3: Build flight records, deduplicate ───────────────────────────
  const flightsToInsert = []
  const statsByPilot = {}
  const statsByDrone = {}
  let skipped = 0

  for (const f of rawFlights) {
    const pilot = pilotByName[pilotKey(f.pilotName)]
    if (!pilot) { skipped++; continue }

    const fp = `${pilot.id}|${f.date}|${f.startTime}|${f.endTime}`
    if (existingFP.has(fp)) { skipped++; continue }
    existingFP.add(fp)  // prevent duplicates within this batch

    statsByPilot[pilot.name] = (statsByPilot[pilot.name] || 0) + 1
    statsByDrone[f.tailNumber || 'unknown'] = (statsByDrone[f.tailNumber || 'unknown'] || 0) + 1

    const record = {
      id:            `imp_${Date.now()}_${Math.floor(Math.random() * 999999)}`,
      pilot_id:      pilot.id,
      pilot_name:    pilot.name,
      date:          f.date,
      mission_name:  f.missionName,
      tail_number:   f.tailNumber,
      battery:       f.battery,
      start_time:    f.startTime,
      end_time:      f.endTime,
      battery_start: f.batteryStart,
      battery_end:   f.batteryEnd,
      duration:      f.duration,
    }
    // Include new columns only if they exist in the schema
    if (hasObserverCol) {
      record.observer      = f.observer
      record.gas_dropped   = false
      record.gas_drop_time = null
    }
    flightsToInsert.push(record)
  }

  console.log(`\n✈️  Flights to insert: ${flightsToInsert.length}  (${skipped} skipped as duplicates/zero-duration)`)

  // ── Phase 4: Batch insert flights ────────────────────────────────────────
  const BATCH = 200
  let inserted = 0
  let errors   = 0

  for (let i = 0; i < flightsToInsert.length; i += BATCH) {
    const batch = flightsToInsert.slice(i, i + BATCH)
    const { error } = await supabase.from('flights').insert(batch)
    if (error) {
      console.error(`\n  ❌ Batch ${Math.floor(i / BATCH) + 1} failed: ${error.message}`)
      errors += batch.length
    } else {
      inserted += batch.length
      process.stdout.write(`  Progress: ${inserted}/${flightsToInsert.length}…\r`)
    }
  }

  // ── Summary ───────────────────────────────────────────────────────────────
  console.log('\n\n══════════════════════════════════════════')
  console.log('✅  Import complete!')
  console.log(`   Flights inserted : ${inserted}`)
  console.log(`   Flights skipped  : ${skipped}  (duplicate or zero duration)`)
  if (errors > 0) console.log(`   Insert errors    : ${errors}`)
  console.log(`   New pilots added : ${pilotsToInsert.length}`)

  console.log('\n📊 Flights per pilot:')
  Object.entries(statsByPilot)
    .sort((a, b) => b[1] - a[1])
    .forEach(([name, count]) => {
      const mins = rawFlights
        .filter(f => pilotKey(f.pilotName) === pilotKey(name))
        .reduce((s, f) => s + f.duration, 0)
      const h = Math.floor(mins / 60), m = mins % 60
      console.log(`   ${name.padEnd(25)} ${String(count).padStart(4)} flights   (${h}ש' ${m}ד')`)
    })

  console.log('\n🚁 Flights per drone:')
  Object.entries(statsByDrone)
    .sort((a, b) => b[1] - a[1])
    .forEach(([tail, count]) => console.log(`   ${tail.padEnd(20)} ${String(count).padStart(4)} flights`))
}

main().catch(err => { console.error('Fatal:', err.message); process.exit(1) })
