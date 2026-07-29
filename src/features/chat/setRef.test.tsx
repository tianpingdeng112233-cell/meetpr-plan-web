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

  // `write-only` cases are the server's `.strict()` contract; the read side must
  // stay tolerant of fields it predates (see isChatSetRefV1).
  it.each(fixtures.invalid.filter((f) => f.scope !== 'write-only'))(
    '$name 的非法形状只会降级',
    ({ patch }) => {
      const candidate = { ...fixtures.valid[0]!.set_ref, ...patch }
      expect(isChatSetRefV1(candidate)).toBe(false)
      expect(parseSetRefMessage(message(candidate, '保留整条纯文本'))).toBeNull()
    },
  )

  it.each([
    'source',
    'set_total',
    'reps_max',
    'plan_set_id',
  ] as const)('缺少必现字段 %s 时只会降级', (field) => {
    const candidate: Record<string, unknown> = { ...fixtures.valid[0]!.set_ref }
    delete candidate[field]
    expect(isChatSetRefV1(candidate)).toBe(false)
    expect(parseSetRefMessage(message(candidate, '保留整条纯文本'))).toBeNull()
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
    act(() => root.render(<SetRefCard parsed={parsed!} hasVideo={false} sentAt="21:38" />))

    const setRef = candidate as ChatSetRefV1
    expect(host.querySelector('.set-ref-heading b')?.textContent).toBe(setRef.exercise_name)
    expect(host.querySelector('.set-ref-heading span')?.textContent).toBe(
      `第 ${setRef.set_number} 组${setRef.set_total === null ? '' : ` / ${setRef.set_total}`}`,
    )
    expect(host.querySelector('.set-ref-kicker')?.textContent).toBe(
      setRef.source === 'logged' ? '学员记录的一组' : '学员今天的计划',
    )
    expect(host.querySelector('.set-ref-load>span')?.textContent).toBe('WEIGHT × REPS')
    expect(host.querySelector('.set-ref-load strong')?.textContent)
      .toBe(`${setRef.weight_kg ?? '-'}kg×${setRef.reps ?? '-'}${setRef.reps_max === null
        ? ''
        : `-${setRef.reps_max}`}`)
    expect(host.querySelector('.set-ref-rpe>span')?.textContent).toBe('RPE')
    expect(host.querySelector('.set-ref-rpe strong')?.textContent).toBe(setRef.rpe ?? '—')
    expect(host.querySelector('.set-ref-card>header time')?.textContent).toBe('21:38')
  })

  it('纯首行渲染卡片时没有备注区', () => {
    const fixture = fixtures.valid[0]!
    const parsed = parseSetRefMessage(message(fixture.set_ref, fixture.first_line))
    act(() => root.render(<SetRefCard parsed={parsed!} hasVideo={false} sentAt="21:38" />))
    expect(host.querySelector('.set-ref-note')).toBeNull()
  })

  it('显式空备注保留语义但不渲染备注区', () => {
    const fixture = fixtures.valid[0]!
    const parsed = parseSetRefMessage(message(fixture.set_ref, `${fixture.first_line}\n`))
    expect(parsed?.note).toBe('')
    act(() => root.render(<SetRefCard parsed={parsed!} hasVideo={false} sentAt="21:38" />))
    expect(host.querySelector('.set-ref-note')).toBeNull()
  })

  it('首行后的自由备注渲染为卡内嵌套气泡', () => {
    const fixture = fixtures.valid[0]!
    const note = '请看看下放速度\n最后一下有点前倾'
    const parsed = parseSetRefMessage(message(
      fixture.set_ref,
      `${fixture.first_line}\n${note}`,
    ))
    act(() => root.render(<SetRefCard parsed={parsed!} hasVideo={false} sentAt="21:38" />))
    expect(host.querySelector('.set-ref-note')?.textContent).toBe(note)
    expect(host.querySelector('.set-ref-card>.set-ref-note')).not.toBeNull()
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
  it('未知字段不影响卡片渲染(读侧宽容,防陈旧 bundle 整片降级)', () => {
    const fixture = fixtures.valid[0]!
    const candidate = { ...fixture.set_ref, future_field_we_do_not_know: 'x' }
    expect(isChatSetRefV1(candidate)).toBe(true)
    expect(parseSetRefMessage(message(candidate, fixture.first_line))).not.toBeNull()
  })


})
