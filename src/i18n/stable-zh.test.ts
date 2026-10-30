import { expect, it } from 'vitest'
import { normalizeTraditionalInput } from './stable-zh'

it.each([
  ['臥推 100x5 @8', '卧推 100x5 @8'],
  ['相撲硬舉 3x3', '相扑硬拉 3x3'],
  ['二頭彎舉', '二头弯举'],
  ['低槓深蹲 兩組', '低杠深蹲 两组'],
  ['EZ槓', 'EZ杆'],
  ['ez槓', 'ez杆'],
  ['EZ槓二頭彎舉', 'EZ杆二头弯举'],
  ['坐姿槓桿臂屈伸', '坐姿杠杆臂屈伸'],
  ['安全槓早安式', '安全杆早安式'],
  ['T槓', 'T杆'],
  ['槓鈴划船', '杠铃划船'],
])('normalizes only the parser input %s', (input, expected) => {
  expect(normalizeTraditionalInput(input)).toBe(expected)
  expect(normalizeTraditionalInput(expected)).toBe(expected)
})
