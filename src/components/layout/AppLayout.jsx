import { useState } from 'react'
import Sidebar from './Sidebar.jsx'
import Header from './Header.jsx'
import MainContent from './MainContent.jsx'
import ShiftModal from '../modals/ShiftModal.jsx'
import { useWorkShift } from '../../lib/useWorkShift'
import './AppLayout.css'

// Глобальные напоминания об обязательной смене — только для manager:
// 1) рабочее окно + смена закрыта → «Рабочий день начался…» + Открыть;
// 2) 17:00–17:29 + смена открыта → предупреждение о 17:30;
// 3) после 17:30 + смена открыта → операции заблокированы + Закрыть
//    (закрытие смены доступно всегда, даже после 17:30).
function ShiftReminders() {
  const {
    isManager,
    openShift,
    isBusinessWindow,
    isClosingWarningWindow,
    refresh,
  } = useWorkShift()
  const [modalMode, setModalMode] = useState(null)

  let reminder = null

  if (isManager) {
    if (isBusinessWindow && !openShift) {
      reminder = {
        tone: 'warning',
        text: 'Рабочий день начался. Откройте смену, чтобы начать работу.',
        action: 'Открыть смену',
        mode: 'open',
      }
    } else if (isClosingWarningWindow && openShift) {
      reminder = {
        tone: 'warning',
        text: 'До окончания смены осталось 30 минут. Не забудьте закрыть смену в 17:30.',
        action: 'Закрыть смену',
        mode: 'close',
      }
    } else if (!isBusinessWindow && openShift) {
      reminder = {
        tone: 'blocked',
        text: 'Рабочее время завершено. Новые операции заблокированы. Закройте смену.',
        action: 'Закрыть смену',
        mode: 'close',
      }
    }
  }

  if (!reminder) {
    return null
  }

  return (
    <>
      <div className={`shift-reminder shift-reminder--${reminder.tone}`}>
        <span>{reminder.text}</span>
        <button type="button" onClick={() => setModalMode(reminder.mode)}>
          {reminder.action}
        </button>
      </div>

      {modalMode ? (
        <ShiftModal
          open
          mode={modalMode}
          shift={openShift ? { shiftId: openShift.id } : null}
          onClose={() => setModalMode(null)}
          onSaved={refresh}
        />
      ) : null}
    </>
  )
}

function AppLayout() {
  const [isSidebarOpen, setIsSidebarOpen] = useState(false)

  const closeSidebar = () => setIsSidebarOpen(false)
  const toggleSidebar = () => setIsSidebarOpen((open) => !open)

  return (
    <div className="app-layout">
      <Sidebar isOpen={isSidebarOpen} onNavigate={closeSidebar} />
      {isSidebarOpen ? (
        <button
          type="button"
          className="app-layout__backdrop"
          aria-label="Закрыть меню"
          onClick={closeSidebar}
        />
      ) : null}
      <div className="app-layout__body">
        <Header onMenuToggle={toggleSidebar} />
        <ShiftReminders />
        <MainContent />
      </div>
    </div>
  )
}

export default AppLayout
