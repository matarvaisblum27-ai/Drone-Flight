export const DRONES: {
  model: string
  tailNumber: string
  weightKg?: number | null
  serialNumber?: string
  extraReg?: string
}[] = [
  { model: 'מאביק 2',          tailNumber: '4x-pzk',   weightKg: 4,    serialNumber: '4gcck6qr0b0qn7' },
  { model: 'מאביק 3',          tailNumber: '4x-ulj',   weightKg: 4,    serialNumber: '1581f5fjc244q00dwzp2' },
  { model: 'מאביק 3 גלילית',   tailNumber: '4x-ulp',   extraReg: '1003006', serialNumber: '1581f5fjc244h00dpft8' },
  { model: 'מאטריס 30',        tailNumber: '4x-nxj',   weightKg: 4,    serialNumber: '1581f5bkd239c00fgf60' },
  { model: 'מאטריס 30',        tailNumber: '4x-nyq',   weightKg: 4,    serialNumber: '1581f5bkx25bv00f0fe3' },
  { model: 'מאטריס 300',       tailNumber: '4x-yxb',   weightKg: 25,   serialNumber: '1znbjar00c00l' },
  { model: 'מאטריס 300',       tailNumber: '4x-xtu',   weightKg: 25,   serialNumber: '1znbhbs00c0010' },
  { model: 'מאטריס 600',       tailNumber: '4x-xpg',   weightKg: 25,   serialNumber: '06fdf5g0c10096' },
  { model: 'G3',               tailNumber: '4x-ujs',   weightKg: 25,   serialNumber: '777' },
  { model: 'אווטה 2',          tailNumber: '1005254',  serialNumber: '1581F6W8B247500202AE' },
  { model: 'אווטה 2',          tailNumber: '1005187',  serialNumber: '1581F6W8W255P0020Z7P' },
  { model: 'אווטה 2',          tailNumber: '1005189',  serialNumber: '1581F6W8W255D0020WHY' },
]

export const TAIL_NUMBERS = DRONES.map(d => d.tailNumber)

export function droneLabel(tailNumber: string): string {
  const drone = DRONES.find(d => d.tailNumber === tailNumber)
  return drone ? `${drone.model} | ${tailNumber}` : tailNumber
}
