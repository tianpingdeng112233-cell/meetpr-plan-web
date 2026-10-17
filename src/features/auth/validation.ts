// 与后端逐字节同源:zod@3.25.76 v3/types.ts 的 emailRegex 原样拷贝
// (backend 校验 = z.string().trim().email().max(320);正则升级时随 zod 版本同步)。
const emailPattern = /^(?!\.)(?!.*\.\.)([A-Z0-9_'+\-\.]*)[A-Z0-9_+-]@([A-Z0-9][A-Z0-9\-]*\.)+[A-Z]{2,}$/i
const EMAIL_MAX_LENGTH = 320

export function isValidLoginEmail(raw: string): boolean {
  const value = raw.trim()
  return value.length <= EMAIL_MAX_LENGTH && emailPattern.test(value)
}

