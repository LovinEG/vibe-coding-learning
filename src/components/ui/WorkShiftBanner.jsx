import { useManagerShiftGuard } from '../../lib/useWorkShift'
import './WorkShiftBanner.css'

// Баннер блокировки write-actions manager (смена не открыта / вне окна).
// Рендерится на рабочих страницах; причину показывает сам.
function WorkShiftBanner() {
  const { blocked, reason } = useManagerShiftGuard()

  if (!blocked) {
    return null
  }

  return (
    <p className="work-shift-banner work-shift-banner--blocked" role="status">
      🔒 {reason}
    </p>
  )
}

export default WorkShiftBanner