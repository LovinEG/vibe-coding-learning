import { Outlet } from 'react-router-dom'
import './MainContent.css'

function MainContent() {
  return (
    <main className="main-content">
      <div className="main-content__surface">
        <Outlet />
      </div>
    </main>
  )
}

export default MainContent
