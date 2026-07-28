import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import fixtures from '../../../set-ref-golden-fixtures.json'
import type { ChatMessage, ChatSetRefV1 } from '../../api/types'
import {
  isChatSetRefV1,
  parseSetRefMessage,
  SetRefCard,
  setRefFirstLine,
} from './setRef'

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true

const message = (setRef: unknown, body: string): ChatMessage => ({
  id: 'message',
  conversation_id: 'conversation',
  seq: 1,
  sender_id: 'student',
  kind: 'text',
  body,
  attachment_id: null,
  image_url: null,
  image_expires_in: null,
  set_ref: setRef,
  video_url: null,
  video_expires_in: null,
  client_id: 'client',
  created_at: '2026-07-27T10:00:00.000Z',
})

describe('set_ref v1 shared golden fixtures', () => {
  let host: HTMLDivElement
  let root: Root

  beforeEach(() => {
    host = document.createElement('div')
    document.body.appendChild(host)
    root = createRoot(host)
  })

  afterEach(() => {
    act(() => root.unmount())
    host.remove()
  })

  it.each(fixtures.valid)('$name 的机械首行逐字一致', ({ set_ref: candidate, first_line: expected }) => {
    expect(isChatSetRefV1(candidate)).toBe(true)
    expect(setRefFirstLine(candidate as ChatSetRefV1)).toBe(expected)
  })

  it.each(fixtures.invalid.filter(({ name }) => name !== 'unknown-field'))(
    '$name 的已知字段非法时只会降级',
    ({ patch }) => {
      const candidate = { ...fixtures.valid[0]!.set_ref, ...patch }
      expect(isChatSetRefV1(candidate)).toBe(false)
      expect(parseSetRefMessage(message(candidate, '保留整条纯文本'))).toBeNull()
    },
  )

  it('忽略合法 v1 携带的未知字段并正常渲染卡片', () => {
    const fixture = fixtures.valid[0]!
    const unknownPatch = fixtures.invalid.find(({ name }) => name === 'unknown-field')!.patch
    const candidate = { ...fixture.set_ref, ...unknownPatch }
    expect(isChatSetRefV1(candidate)).toBe(true)

    const parsed = parseSetRefMessage(message(candidate, fixture.first_line))
    expect(parsed).not.toBeNull()
    act(() => root.render(<SetRefCard parsed={parsed!} hasVideo={false} />))
    expect(host.querySelector('.set-ref-heading b')?.textContent).toBe(candidate.exercise_name)
  })

  it.each(fixtures.exercise_name_code_point_boundaries)(
    '$name 按 Unicode code point 执行 120 字边界',
    ({ unit, repeat, valid }) => {
      const candidate = {
        ...fixtures.valid[0]!.set_ref,
        exercise_name: unit.repeat(repeat),
      }
      expect(isChatSetRefV1(candidate)).toBe(valid)
    },
  )

  it.each(fixtures.valid)('$name 的卡片逐字段原样渲染', ({ set_ref: candidate, first_line: firstLine }) => {
    expect(isChatSetRefV1(candidate)).toBe(true)
    const parsed = parseSetRefMessage(message(candidate, firstLine))
    expect(parsed).not.toBeNull()
    act(() => root.render(<SetRefCard parsed={parsed!} hasVideo={false} />))

    const setRef = candidate as ChatSetRefV1
    expect(host.querySelector('.set-ref-heading b')?.textContent).toBe(setRef.exercise_name)
    expect(host.querySelector('.set-ref-heading span')?.textContent).toBe(`第 ${setRef.set_number} 组`)
    expect(host.querySelector('.set-ref-metrics strong')?.textContent)
      .toBe(`${setRef.weight_kg === null ? '-kg' : `${setRef.weight_kg}kg`}×${setRef.reps ?? '-'}`)
    expect(host.querySelector('.set-ref-metrics>span')?.textContent ?? null)
      .toBe(setRef.rpe === null ? null : `RPE ${setRef.rpe}`)
    expect(host.querySelector('.set-ref-card>header time')?.textContent).toBe(setRef.day_date)
  })

  it('纯首行渲染卡片时没有备注区', () => {
    const fixture = fixtures.valid[0]!
    const parsed = parseSetRefMessage(message(fixture.set_ref, fixture.first_line))
    act(() => root.render(<SetRefCard parsed={parsed!} hasVideo={false} />))
    expect(host.querySelector('.set-ref-note')).toBeNull()
  })

  it('显式空备注保留语义但不渲染备注区', () => {
    const fixture = fixtures.valid[0]!
    const parsed = parseSetRefMessage(message(fixture.set_ref, `${fixture.first_line}\n`))
    expect(parsed?.note).toBe('')
    act(() => root.render(<SetRefCard parsed={parsed!} hasVideo={false} />))
    expect(host.querySelector('.set-ref-note')).toBeNull()
  })

  it('首行后的自由备注渲染在卡片下方', () => {
    const fixture = fixtures.valid[0]!
    const note = '请看看下放速度\n最后一下有点前倾'
    const parsed = parseSetRefMessage(message(
      fixture.set_ref,
      `${fixture.first_line}\n${note}`,
    ))
    act(() => root.render(<SetRefCard parsed={parsed!} hasVideo={false} />))
    expect(host.querySelector('.set-ref-note')?.textContent).toBe(note)
  })
})

describe('set_ref body consistency and notes', () => {
  const fixture = fixtures.valid[4]!
  const setRef = fixture.set_ref
  const firstLine = fixture.first_line

  it.each([
    { name: '无换行纯首行', body: firstLine, note: null },
    { name: '显式空备注', body: `${firstLine}\n`, note: '' },
    {
      name: '非空备注',
      body: `${firstLine}\n请看看下放速度\n最后一下有点前倾`,
      note: '请看看下放速度\n最后一下有点前倾',
    },
  ])('$name 保留备注三态', ({ body, note }) => {
    expect(parseSetRefMessage(message(setRef, body))?.note).toBe(note)
  })

  it('机械首行不匹配时拒绝卡片解析', () => {
    const tampered = firstLine.replace('第2组', '第3组')
    expect(parseSetRefMessage(message(setRef, `${tampered}\n请看看动作`))).toBeNull()
  })
})
