import { useState } from 'react'
import Sidebar from './Sidebar.jsx'
import Header from './Header.jsx'
import MainContent from './MainContent.jsx'
import './AppLayout.css'

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
        <MainContent />
      </div>
    </div>
  )
}

export default AppLayout
