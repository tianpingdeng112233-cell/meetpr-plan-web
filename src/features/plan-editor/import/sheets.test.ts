import { describe, expect, it } from 'vitest'
import * as XLSX from 'xlsx'
import { workbookToSheets, readWorkbook, pastedToSheets, regionCells } from './sheets'

describe('sheet import sources', () => {
  it('reads synthetic workbooks sparsely, trims cells and sends formatted dates as ISO', () => {
    const workbook = XLSX.utils.book_new()
    const sheet = XLSX.utils.aoa_to_sheet([['  Squat  ', '  ', 46020, 120]])
    sheet.C1.z = 'yyyy-mm-dd'
    sheet['!ref'] = 'A1:XFD1048576'
    XLSX.utils.book_append_sheet(workbook, sheet, 'Training')
    expect(workbookToSheets(workbook)).toEqual([{ name: 'Training', cells: [[1, 1, 'Squat'], [1, 3, '2025-12-29'], [1, 4, '120']] }])
    sheet['!ref'] = 'A1:D1'
    expect(readWorkbook(XLSX.write(workbook, { type: 'array', bookType: 'xlsx' }))).toEqual(workbookToSheets(workbook))
  })
})

it('prefers HTML and preserves merged coordinates without duplicating the label', () => {
  const html = '<table><tr><th rowspan="2"> W1 </th><th colspan="2"> Day 1 </th></tr><tr><td> Squat </td><td> 4×8 </td></tr></table>'
  const sheets = pastedToSheets('ignored\ttext', html)
  expect(sheets).toEqual([{ name: 'Paste', cells: [[1, 1, 'W1'], [1, 2, 'Day 1'], [2, 2, 'Squat'], [2, 3, '4×8']] }])
  expect(regionCells(sheets[0].cells, { r1: 2, c1: 2, r2: 2, c2: 3 })).toEqual([[2, 2, 'Squat'], [2, 3, '4×8']])
  expect(regionCells(sheets[0].cells, null)).toEqual([])
  expect(pastedToSheets(' Name \t \t4\r\nSquat\t120', '<p>No table</p>')[0].cells).toEqual([[1, 1, 'Name'], [1, 3, '4'], [2, 1, 'Squat'], [2, 2, '120']])
})

it.each(['xls', 'csv'] as const)('reads a synthetic %s workbook through the byte-array path', bookType => {
  const book = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(book, XLSX.utils.aoa_to_sheet([['  Synthetic lift  ', 100], ['', 0]]), 'Sheet1')
  expect(readWorkbook(XLSX.write(book, { type: 'array', bookType }))[0].cells).toEqual([[1,1,'Synthetic lift'], [1,2,'100'], [2,2,'0']])
})
it('converts 1904 dates and preserves quoted multiline clipboard cells', () => {
  const book = XLSX.utils.book_new(); book.Workbook = { WBProps: { date1904: true } }
  const sheet = XLSX.utils.aoa_to_sheet([[0]]); sheet.A1.z = 'yyyy-mm-dd'; XLSX.utils.book_append_sheet(book, sheet, 'Dates')
  expect(workbookToSheets(book)[0].cells).toEqual([[1,1,'1904-01-01']])
  expect(pastedToSheets('"line 1\nline 2"\t 5 ')[0].cells).toEqual([[1,1,'line 1\nline 2'],[1,2,'5']])
})
