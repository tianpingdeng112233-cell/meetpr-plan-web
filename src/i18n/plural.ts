export function countUnit(count: number | string, singular: string, plural: string): string {
  // row.reps arrives as a string ("1", "8-10"); coerce before comparing so
  // "1" picks the singular and non-numeric ranges stay plural.
  return `${count} ${Number(count) === 1 ? singular : plural}`
}
