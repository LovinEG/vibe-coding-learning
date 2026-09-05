import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { signOut } from '../../lib/auth'
import { useAuth } from '../../lib/useAuth'
import './Header.css'

function Header({ onMenuToggle }) {
  const navigate = useNavigate()
  const { user } = useAuth()
  const [isSigningOut, setIsSigningOut] = useState(false)

  async function handleLogout() {
    if (isSigningOut) {
      return
    }

    setIsSigningOut(true)

    try {
      const result = await signOut()

      if (result.error) {
        console.error('Ошибка выхода:', result.error)
        return
      }

      navigate('/login', { replace: true })
    } catch (err) {
      console.error('Ошибка выхода:', err)
    } finally {
      setIsSigningOut(false)
    }
  }

  return (
    <header className="header">
      <button
        type="button"
        className="header__menu"
        aria-label="Открыть меню"
        onClick={onMenuToggle}
      >
        <span className="header__menu-icon" aria-hidden="true" />
      </button>
      <span className="header__label">Рабочая область</span>
      <span className="header__spacer" />
      {user?.email ? <span className="header__user">{user.email}</span> : null}
      <button
        type="button"
        className="header__logout"
        onClick={handleLogout}
        disabled={isSigningOut}
      >
        {isSigningOut ? 'Выход...' : 'Выйти'}
      </button>
    </header>
  )
}

export default Header
