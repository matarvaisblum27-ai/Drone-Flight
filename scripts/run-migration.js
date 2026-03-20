#!/usr/bin/env node
/**
 * Run the observer/gas-drop column migration against Supabase.
 *
 * This uses the Supabase Management REST API which requires a
 * Personal Access Token (PAT) from:
 *   https://supabase.com/dashboard/account/tokens
 *
 * Usage:
 *   SUPABASE_PAT=your_token node scripts/run-migration.js
 *
 * OR pass it inline:
 *   SUPABASE_PAT=sbp_xxxx node scripts/run-migration.js
 */

const https = require('https')
const path  = require('path')
const fs    = require('fs')

// ── Load .env.local ──────────────────────────────────────────────────────────
const envPath = path.join(__dirname, '..', '.env.local')
if (!fs.existsSync(envPath)) { console.error('❌  .env.local not found'); process.exit(1) }
const env = fs.readFileSync(envPath, 'utf8')
  .split('\n').reduce((acc, line) => {
    const [k, ...v] = line.split('=')
    if (k && v.length) acc[k.trim()] = v.join('=').trim()
    return acc
  }, {})

const SUPABASE_URL = env.NEXT_PUBLIC_SUPABASE_URL
if (!SUPABASE_URL) { console.error('❌  NEXT_PUBLIC_SUPABASE_URL missing in .env.local'); process.exit(1) }

// Extract project ref from URL: https://<ref>.supabase.co
const match = SUPABASE_URL.match(/https:\/\/([^.]+)\.supabase\.co/)
if (!match) { console.error('❌  Could not parse project ref from URL:', SUPABASE_URL); process.exit(1) }
const PROJECT_REF = match[1]

const PAT = process.env.SUPABASE_PAT
if (!PAT) {
  console.error('❌  SUPABASE_PAT environment variable is required.')
  console.error('   Get your Personal Access Token from:')
  console.error('   https://supabase.com/dashboard/account/tokens')
  console.error('')
  console.error('   Then run:')
  console.error('   SUPABASE_PAT=sbp_xxxx node scripts/run-migration.js')
  process.exit(1)
}

const SQL = `
ALTER TABLE flights ADD COLUMN IF NOT EXISTS observer      TEXT    DEFAULT '';
ALTER TABLE flights ADD COLUMN IF NOT EXISTS gas_dropped   BOOLEAN DEFAULT FALSE;
ALTER TABLE flights ADD COLUMN IF NOT EXISTS gas_drop_time TEXT    DEFAULT NULL;
`

console.log('🚀  Running migration on project:', PROJECT_REF)
console.log('📋  SQL:')
console.log(SQL)

const body = JSON.stringify({ query: SQL })

const options = {
  hostname: 'api.supabase.com',
  path:     `/v1/projects/${PROJECT_REF}/database/query`,
  method:   'POST',
  headers:  {
    'Authorization': `Bearer ${PAT}`,
    'Content-Type':  'application/json',
    'Content-Length': Buffer.byteLength(body),
  },
}

const req = https.request(options, res => {
  let data = ''
  res.on('data', chunk => data += chunk)
  res.on('end', () => {
    if (res.statusCode === 200 || res.statusCode === 201) {
      console.log('✅  Migration complete! Columns added to flights table.')
    } else {
      console.error(`❌  API returned ${res.statusCode}:`, data)
      if (res.statusCode === 401) {
        console.error('   → Invalid PAT. Make sure you copied the full token.')
      }
    }
  })
})

req.on('error', err => {
  console.error('❌  Request failed:', err.message)
})

req.write(body)
req.end()
