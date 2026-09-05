import { useEffect, useRef, useState } from 'react'
import './TaskStatusDropdown.css'

const OPTIONS = [
  { value: 'todo', label: 'К выполнению' },
  { value: 'in_progress', label: 'В работе' },
  { value: 'done', label: 'Выполнено' },
]

const BADGE_CLASS_NAMES = {
  todo: 'task-status-dropdown__badge--todo',
  in_progress: 'task-status-dropdown__badge--in-progress',
  done: 'task-status-dropdown__badge--done',
}

// Приблизительные размеры меню для расчёта позиции (position: fixed).
const MENU_WIDTH = 200
const MENU_HEIGHT = 140
const MENU_GAP = 4
const VIEWPORT_PADDING = 8

function getLabel(value) {
  return OPTIONS.find((option) => option.value === value)?.label ?? value
}

// Быстрая смена статуса задачи инлайн в таблице (аналог StatusDropdown
// для заказов, но со статусами todo/in_progress/done).
function TaskStatusDropdown({ value, onChange, disabled }) {
  const [isOpen, setIsOpen] = useState(false)
  const [menuPosition, setMenuPosition] = useState({
    top: 0,
    left: 0,
    isUpward: false,
  })
  const rootRef = useRef(null)

  useEffect(() => {
    if (!isOpen) {
      return undefined
    }

    function handlePointerDown(event) {
      if (rootRef.current && !rootRef.current.contains(event.target)) {
        setIsOpen(false)
      }
    }

    function handleKeyDown(event) {
      if (event.key === 'Escape') {
        setIsOpen(false)
      }
    }

    // Меню спозиционировано fixed: при прокрутке/ресайзе закрываем.
    function handleScrollOrResize() {
      setIsOpen(false)
    }

    document.addEventListener('mousedown', handlePointerDown)
    document.addEventListener('keydown', handleKeyDown)
    window.addEventListener('scroll', handleScrollOrResize, true)
    window.addEventListener('resize', handleScrollOrResize)

    return () => {
      document.removeEventListener('mousedown', handlePointerDown)
      document.removeEventListener('keydown', handleKeyDown)
      window.removeEventListener('scroll', handleScrollOrResize, true)
      window.removeEventListener('resize', handleScrollOrResize)
    }
  }, [isOpen])

  function toggleMenu() {
    if (disabled) {
      return
    }

    if (isOpen) {
      setIsOpen(false)
      return
    }

    const rect = rootRef.current.getBoundingClientRect()
    const spaceBelow = window.innerHeight - rect.bottom
    const isUpward = spaceBelow < MENU_HEIGHT && rect.top > MENU_HEIGHT

    setMenuPosition({
      top: isUpward ? rect.top - MENU_GAP : rect.bottom + MENU_GAP,
      left: Math.max(
        VIEWPORT_PADDING,
        Math.min(rect.left, window.innerWidth - MENU_WIDTH - VIEWPORT_PADDING),
      ),
      isUpward,
    })
    setIsOpen(true)
  }

  function handleOptionClick(status) {
    setIsOpen(false)

    if (status !== value) {
      onChange(status)
    }
  }

  return (
    <div className="task-status-dropdown" ref={rootRef}>
      <button
        type="button"
        className={
          isOpen
            ? 'task-status-dropdown__trigger task-status-dropdown__trigger--open'
            : 'task-status-dropdown__trigger'
        }
        onClick={toggleMenu}
        disabled={disabled}
        aria-haspopup="listbox"
        aria-expanded={isOpen}
      >
        <span
          className={`task-status-dropdown__badge ${BADGE_CLASS_NAMES[value] ?? ''}`}
        >
          {getLabel(value)}
        </span>
        <span className="task-status-dropdown__arrow" aria-hidden="true" />
      </button>

      {isOpen ? (
        <ul
          className="task-status-dropdown__menu"
          role="listbox"
          style={{
            top: menuPosition.top,
            left: menuPosition.left,
            transform: menuPosition.isUpward ? 'translateY(-100%)' : undefined,
          }}
        >
          {OPTIONS.map((option) => (
            <li key={option.value}>
              <button
                type="button"
                role="option"
                aria-selected={option.value === value}
                className={
                  option.value === value
                    ? 'task-status-dropdown__option task-status-dropdown__option--selected'
                    : 'task-status-dropdown__option'
                }
                onClick={() => handleOptionClick(option.value)}
              >
                <span
                  className={`task-status-dropdown__badge ${
                    BADGE_CLASS_NAMES[option.value] ?? ''
                  }`}
                >
                  {option.label}
                </span>
              </button>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  )
}

export default TaskStatusDropdown