import { readFile, writeFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import { pinyin } from 'pinyin-pro'

const root = fileURLToPath(new URL('../', import.meta.url))
const aliasesPath = new URL('../src/data/exercise-aliases.json', import.meta.url)
const outputPath = new URL('../src/data/char-pinyin.json', import.meta.url)
const isHan = (char) => /\p{Script=Han}/u.test(char)

const characters = new Set()
const decoder = new TextDecoder('gbk')

// GB2312's 72 rows × 94 cells. TextDecoder uses the WHATWG gbk decoder,
// which is built into Node and covers this byte range without another package.
for (let high = 0xb0; high <= 0xf7; high += 1) {
  for (let low = 0xa1; low <= 0xfe; low += 1) {
    const char = decoder.decode(Uint8Array.of(high, low))
    if (isHan(char)) characters.add(char)
  }
}

const aliases = JSON.parse(await readFile(aliasesPath, 'utf8'))
for (const { alias, canonical } of aliases.aliases) {
  for (const char of alias + canonical) {
    if (isHan(char)) characters.add(char)
  }
}

// Readings come straight from pinyin-pro (all heteronym readings kept); no hand-added spellings.
const table = {}
for (const char of [...characters].sort()) {
  const generated = pinyin(char, {
    multiple: true,
    toneType: 'none',
    type: 'array',
  })
  const readings = [...generated]
    .flatMap((reading) => reading.split(/\s+/))
    .map((reading) => reading.toLowerCase().replaceAll('ü', 'v'))
    .filter((reading) => /^[a-z]+$/.test(reading))
  if (readings.length === 0) throw new Error(`No pinyin generated for ${char}`)
  table[char] = [...new Set(readings)]
}

const output = `${JSON.stringify(table)}\n`
if (Buffer.byteLength(output) > 100_000) throw new Error('char-pinyin.json exceeds 100KB')
await writeFile(outputPath, output)
console.log(`Wrote ${Object.keys(table).length} characters to ${outputPath.pathname.replace(root, '')}`)
