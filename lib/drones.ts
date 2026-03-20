export const DRONES: { model: string; tailNumber: string }[] = [
  { model: 'מאביק 2', tailNumber: '4x-pzk' },
  { model: 'מאביק 3', tailNumber: '4x-ulj' },
  { model: 'מאטריס 30', tailNumber: '4x-nxj' },
  { model: 'מאטריס 30', tailNumber: '1007014' },
  { model: 'מאטריס 300', tailNumber: '4x-yxb' },
  { model: 'מאטריס 300', tailNumber: '4x-xtu' },
  { model: 'מאטריס 600 רחפן גז', tailNumber: '4x-xpg' },
  { model: 'רחפן גז G3', tailNumber: '4x-ujs' },
  { model: 'מאטריס 30', tailNumber: '1005254' },
  { model: 'מאטריס 30', tailNumber: '1005189' },
  { model: 'מאטריס 30', tailNumber: '1005187' },
]

export const TAIL_NUMBERS = DRONES.map(d => d.tailNumber)

export function droneLabel(tailNumber: string): string {
  const drone = DRONES.find(d => d.tailNumber === tailNumber)
  return drone ? `${drone.model} | ${tailNumber}` : tailNumber
}
