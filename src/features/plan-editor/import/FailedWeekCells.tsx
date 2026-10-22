import { utils } from 'xlsx'
import type { SheetCell } from './sheets'

/** Sparse coordinate headers avoid allocating enormous formatted sheet rectangles. */
export function FailedWeekCells({ index, cells, onChange }: { index: number; cells: SheetCell[]; onChange: (cells: SheetCell[]) => void }) {
  const rows = [...new Set(cells.map(c => c[0]))].sort((a, b) => a - b)
  const cols = [...new Set(cells.map(c => c[1]))].sort((a, b) => a - b)
  return <div className="import-cell-scroll"><table><thead><tr><th />{cols.map(c => <th key={c}>{utils.encode_col(c - 1)}</th>)}</tr></thead>
    <tbody>{rows.map(r => <tr key={r}><th>{r}</th>{cols.map(c => <td key={c}><input aria-label={`W${index + 1} ${utils.encode_col(c - 1)}${r}`} value={cells.find(cell => cell[0] === r && cell[1] === c)?.[2] ?? ''}
      onChange={event => { const next = cells.filter(cell => cell[0] !== r || cell[1] !== c); next.push([r, c, event.target.value]); onChange(next.sort((a,b) => a[0] - b[0] || a[1] - b[1])) }} /></td>)}</tr>)}</tbody>
  </table></div>
}
