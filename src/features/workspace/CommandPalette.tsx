import { useEffect, useMemo, useRef, useState, type RefObject } from 'react'
import type { CoachView } from './CoachShell'
import { useGlobalKeyboardHandler } from './globalKeyboard'

export interface CommandStudent {
  id: string
  label: string
}

export interface CommandExercise {
  id: string
  label: string
  secondary?: string | null
}

interface CommandPaletteProps {
  open: boolean
  students: readonly CommandStudent[]
  exercises: readonly CommandExercise[]
  onOpenChange: (open: boolean) => void
  onOpenStudent: (studentId: string) => void | Promise<void>
  onOpenExercise: (exerciseId: string) => void | Promise<void>
  onOpenView: (view: CoachView) => void | Promise<void>
  returnFocusRef: RefObject<HTMLElement>
}

interface CommandItem {
  id: string
  label: string
  detail: string
  search: string
  run: () => void | Promise<void>
}

const SCREEN_COMMANDS: Array<{ view: CoachView; label: string; aliases: string }> = [
  { view: 'board', label: '总览', aliases: '学员 看板 board' },
  { view: 'editor', label: '计划编排', aliases: '计划 编排器 editor' },
  { view: 'messages', label: '反馈工作区', aliases: '学员 消息 聊天 视频 message video feedback' },
  { view: 'catalog', label: '动作库', aliases: '动作 catalog' },
  { view: 'requests', label: '学员申请', aliases: '申请 request' },
]

const normalized = (value: string) => value.trim().toLocaleLowerCase('zh-CN')

export function CommandPalette({
  open,
  students,
  exercises,
  onOpenChange,
  onOpenStudent,
  onOpenExercise,
  onOpenView,
  returnFocusRef,
}: CommandPaletteProps) {
  const [query, setQuery] = useState('')
  const [activeIndex, setActiveIndex] = useState(0)
  const inputRef = useRef<HTMLInputElement>(null)
  const dialogRef = useRef<HTMLElement>(null)
  const queryValue = normalized(query)
  const items = useMemo<CommandItem[]>(() => {
    const all: CommandItem[] = [
      ...students.map((student) => ({
        id: `student:${student.id}`,
        label: student.label,
        detail: '学员 · 打开计划编排',
        search: normalized(`${student.label} 学员 计划`),
        run: () => onOpenStudent(student.id),
      })),
      ...SCREEN_COMMANDS.map((screen) => ({
        id: `screen:${screen.view}`,
        label: screen.label,
        detail: '屏幕 · 跳转',
        search: normalized(`${screen.label} ${screen.aliases}`),
        run: () => onOpenView(screen.view),
      })),
      ...exercises.map((exercise) => ({
        id: `exercise:${exercise.id}`,
        label: exercise.label,
        detail: exercise.secondary ? `动作 · ${exercise.secondary}` : '动作 · 打开详情',
        search: normalized(`${exercise.label} ${exercise.secondary ?? ''} 动作`),
        run: () => onOpenExercise(exercise.id),
      })),
    ]
    if (!queryValue) return all.slice(0, Math.max(students.length + SCREEN_COMMANDS.length, 12))
    return all.filter((item) => item.search.includes(queryValue)).slice(0, 50)
  }, [exercises, onOpenExercise, onOpenStudent, onOpenView, queryValue, students])

  useEffect(() => {
    if (!open) return
    setQuery('')
    setActiveIndex(0)
    const id = window.setTimeout(() => inputRef.current?.focus(), 0)
    return () => {
      window.clearTimeout(id)
      returnFocusRef.current?.focus()
    }
  }, [open, returnFocusRef])

  useEffect(() => {
    setActiveIndex((current) => Math.min(current, Math.max(0, items.length - 1)))
  }, [items.length])

  const close = () => onOpenChange(false)
  const execute = (item: CommandItem | undefined) => {
    if (!item) return
    close()
    void item.run()
  }

  useGlobalKeyboardHandler(({ event, editable }) => {
    if (!open) {
      if (
        editable
        || event.altKey
        || event.shiftKey
        || !(event.metaKey || event.ctrlKey)
        || event.key.toLowerCase() !== 'k'
      ) return false
      event.preventDefault()
      onOpenChange(true)
      return true
    }

    // An open palette is the modal keyboard layer: no screen registration
    // below it sees keydown until the palette closes.
    if (event.key === 'Escape') {
      event.preventDefault()
      close()
    } else if (event.key === 'Tab') {
      event.preventDefault()
      const focusable = [...(dialogRef.current?.querySelectorAll<HTMLElement>(
        'input, button:not([disabled]), [href], [tabindex]:not([tabindex="-1"])',
      ) ?? [])]
      if (focusable.length > 0) {
        const currentIndex = focusable.indexOf(document.activeElement as HTMLElement)
        const direction = event.shiftKey ? -1 : 1
        const nextIndex = currentIndex < 0
          ? (event.shiftKey ? focusable.length - 1 : 0)
          : (currentIndex + direction + focusable.length) % focusable.length
        focusable[nextIndex]?.focus()
      }
    } else if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault()
      if (items.length > 0) {
        const direction = event.key === 'ArrowDown' ? 1 : -1
        setActiveIndex((current) => (current + direction + items.length) % items.length)
      }
    } else if (event.key === 'Enter') {
      event.preventDefault()
      execute(items[activeIndex])
    }
    return true
  }, 1000)

  if (!open) return null

  return (
    <div className="command-palette-layer" role="presentation" onMouseDown={(event) => {
      if (event.target === event.currentTarget) close()
    }}>
      <section ref={dialogRef} className="command-palette" role="dialog" aria-modal="true" aria-label="命令面板">
        <label className="command-palette-search">
          <span className="coach-search-icon" aria-hidden="true" />
          <input
            ref={inputRef}
            value={query}
            onChange={(event) => {
              setQuery(event.target.value)
              setActiveIndex(0)
            }}
            placeholder="跳转学员、屏幕或动作…"
            aria-label="搜索命令"
            aria-controls="command-palette-results"
            aria-activedescendant={items[activeIndex]?.id}
          />
          <kbd>ESC</kbd>
        </label>
        <div id="command-palette-results" className="command-palette-results" role="listbox">
          {items.map((item, index) => (
            <button
              type="button"
              id={item.id}
              role="option"
              aria-selected={index === activeIndex}
              className={index === activeIndex ? 'active' : ''}
              key={item.id}
              onMouseEnter={() => setActiveIndex(index)}
              onClick={() => execute(item)}
            >
              <span>{item.label}</span>
              <small>{item.detail}</small>
              {index === activeIndex && <kbd>↵</kbd>}
            </button>
          ))}
          {items.length === 0 && <div className="command-palette-empty">没有匹配的命令</div>}
        </div>
        <footer><span>↑↓ 选择</span><span>↵ 执行</span><span>Esc 关闭</span></footer>
      </section>
    </div>
  )
}
