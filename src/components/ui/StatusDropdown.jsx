import { useEffect, useRef, useState } from 'react'
import './StatusDropdown.css'

// «Выдан» удалён из выбора: старые заказы со статусом «Выдан» продолжают
// отображаться. «Закрыт» недоступен для ручного выбора — статус ставится
// автоматически при закрытии заказа; в списке ниже он отображается только
// как бейдж у уже закрытых заказов (см. BADGE_CLASS_NAMES).
const OPTIONS = [
  'Новый',
  'Диагностика',
  'В работе',
  'Ожидает деталь',
  'Готово к выдаче',
  'Отменён',
]

const BADGE_CLASS_NAMES = {
  Новый: 'status-dropdown__badge--new',
  Диагностика: 'status-dropdown__badge--diagnostics',
  'В работе': 'status-dropdown__badge--in-work',
  'Ожидает деталь': 'status-dropdown__badge--waiting',
  'Готово к выдаче': 'status-dropdown__badge--ready',
  Закрыт: 'status-dropdown__badge--closed',
  Отменён: 'status-dropdown__badge--cancelled',
  // Легаси-статус: остался только для отображения старых заказов.
  Выдан: 'status-dropdown__badge--done',
}

// приблизительные размеры меню для расчёта позиции (position: fixed)
const MENU_WIDTH = 200
const MENU_HEIGHT = 220
const MENU_GAP = 4
const VIEWPORT_PADDING = 8

function StatusDropdown({ value, onChange, disabled }) {
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

    // меню спозиционировано fixed, при прокрутке/ресайзе оно бы «отклеилось» — закрываем
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
    <div className="status-dropdown" ref={rootRef}>
      <button
        type="button"
        className={
          isOpen
            ? 'status-dropdown__trigger status-dropdown__trigger--open'
            : 'status-dropdown__trigger'
        }
        onClick={toggleMenu}
        disabled={disabled}
        aria-haspopup="listbox"
        aria-expanded={isOpen}
      >
        <span
          className={`status-dropdown__badge ${BADGE_CLASS_NAMES[value] ?? ''}`}
        >
          {value}
        </span>
        <span className="status-dropdown__arrow" aria-hidden="true" />
      </button>

      {isOpen ? (
        <ul
          className="status-dropdown__menu"
          role="listbox"
          style={{
            top: menuPosition.top,
            left: menuPosition.left,
            transform: menuPosition.isUpward ? 'translateY(-100%)' : undefined,
          }}
        >
          {OPTIONS.map((status) => (
            <li key={status}>
              <button
                type="button"
                role="option"
                aria-selected={status === value}
                className={
                  status === value
                    ? 'status-dropdown__option status-dropdown__option--selected'
                    : 'status-dropdown__option'
                }
                onClick={() => handleOptionClick(status)}
              >
                <span
                  className={`status-dropdown__badge ${BADGE_CLASS_NAMES[status] ?? ''}`}
                >
                  {status}
                </span>
              </button>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  )
}

export default StatusDropdown