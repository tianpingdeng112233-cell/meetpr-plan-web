import * as XLSX from 'xlsx'

export type SheetCell = [row: number, col: number, text: string]
export interface ImportSheet { name: string; cells: SheetCell[] }
export interface SheetRegion { r1: number; c1: number; r2: number; c2: number }
const MAX_WORKBOOK_BYTES = 10 * 1024 * 1024
const MAX_SHEET_CELLS = 60_000

export function workbookToSheets(workbook: XLSX.WorkBook): ImportSheet[] {
  return workbook.SheetNames.map(name => {
    const entries = Object.entries(workbook.Sheets[name] ?? {}).filter(([address]) => /^[A-Z]+[1-9]\d*$/.test(address))
    if (entries.length > MAX_SHEET_CELLS) throw new Error('SHEET_TOO_LARGE')
    const cells: SheetCell[] = []
    for (const [address, value] of entries) {
      const cell = value as XLSX.CellObject
      if (cell.v == null) continue
      let text = String(cell.v).trim()
      if (cell.t === 'd') {
        const date = cell.v instanceof Date ? cell.v : new Date(String(cell.v))
        text = date.toISOString().slice(0, 10)
      } else if (cell.t === 'n' && cell.z && XLSX.SSF.is_date(cell.z)) {
        const date = XLSX.SSF.parse_date_code(Number(cell.v), { date1904: workbook.Workbook?.WBProps?.date1904 })
        if (date) text = `${date.y}-${String(date.m).padStart(2, '0')}-${String(date.d).padStart(2, '0')}`
      }
      if (!text) continue
      const { r, c } = XLSX.utils.decode_cell(address)
      cells.push([r + 1, c + 1, text])
    }
    return { name, cells: cells.sort((a, b) => a[0] - b[0] || a[1] - b[1]) }
  }).filter(sheet => sheet.cells.length > 0)
}

/** Keep the byte-array read path: raw ArrayBuffers mis-parse WPS workbooks. */
export function readWorkbook(buffer: ArrayBuffer): ImportSheet[] {
  if (buffer.byteLength > MAX_WORKBOOK_BYTES) throw new Error('WORKBOOK_TOO_LARGE')
  return workbookToSheets(XLSX.read(new Uint8Array(buffer), { type: 'array', cellDates: false, cellNF: true }))
}

export function pastedToSheets(text: string, html = ''): ImportSheet[] {
  const table = html ? new DOMParser().parseFromString(html, 'text/html').querySelector('table') : null
  if (table) {
    const cells: SheetCell[] = []
    const occupied = new Set<string>()
    Array.from(table.rows).forEach((row, r) => {
      let c = 0
      for (const cell of Array.from(row.cells)) {
        while (occupied.has(`${r}:${c}`)) c++
        const value = (cell.textContent ?? '').trim()
        if (value) cells.push([r + 1, c + 1, value])
        const rows = Math.max(1, cell.rowSpan)
        const cols = Math.max(1, cell.colSpan)
        if (rows * cols > MAX_SHEET_CELLS || occupied.size + rows * cols > MAX_SHEET_CELLS) throw new Error('SHEET_TOO_LARGE')
        for (let dr = 0; dr < rows; dr++) for (let dc = 0; dc < cols; dc++) occupied.add(`${r + dr}:${c + dc}`)
        c += cols
      }
    })
    return [{ name: 'Paste', cells }]
  }
  // SheetJS handles quoted multiline clipboard cells, preserving their row/column positions.
  const workbook = XLSX.read(text, { type: 'string', raw: true, FS: '\t' })
  return workbookToSheets(workbook).map(sheet => ({ ...sheet, name: 'Paste' }))
}

export function regionCells(cells: SheetCell[], region: SheetRegion | null): SheetCell[] {
  if (!region) return []
  return cells.filter(([r, c]) => r >= region.r1 && r <= region.r2 && c >= region.c1 && c <= region.c2)
}
