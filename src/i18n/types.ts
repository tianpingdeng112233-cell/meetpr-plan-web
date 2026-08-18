export type Translations<T> = T extends (...args: infer Args) => unknown
  ? (...args: Args) => string
  : T extends readonly unknown[]
    ? { readonly [Index in keyof T]: Translations<T[Index]> }
    : T extends object
      ? { [Key in keyof T]: Translations<T[Key]> }
      : string

