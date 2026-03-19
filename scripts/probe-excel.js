const XLSX = require('xlsx')
const path = require('path')

const FILE = path.join(process.env.HOME, 'Desktop', 'מתילן -אורן וייסבלום ניסיון .xlsx')
// Read raw to see numeric values for times
const wb = XLSX.readFile(FILE, { cellDates: false, raw: false })

const ws = wb.Sheets[wb.SheetNames[0]]

console.log('--- Checking row offsets and cell .v vs .w ---')
for (let r = 0; r <= 44; r++) {
  const rowData = []
  for (let c = 0; c <= 9; c++) {
    const addr = XLSX.utils.encode_cell({ r, c })
    const cell = ws[addr]
    if (cell) {
      rowData.push(`${String.fromCharCode(65+c)}[v=${JSON.stringify(cell.v)} w=${JSON.stringify(cell.w)}]`)
    }
  }
  if (rowData.length) console.log(`R${r+1}: ${rowData.join(' | ')}`)
}
