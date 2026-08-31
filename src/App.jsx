import { BrowserRouter, Routes, Route } from 'react-router-dom'
import AppLayout from './components/layout/AppLayout.jsx'
import HomePage from './pages/HomePage.jsx'
import OrdersPage from './pages/OrdersPage.jsx'
import ClientsPage from './pages/ClientsPage.jsx'

function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<AppLayout />}>
          <Route index element={<HomePage />} />
          <Route path="orders" element={<OrdersPage />} />
          <Route path="clients" element={<ClientsPage />} />
        </Route>
      </Routes>
    </BrowserRouter>
  )
}

export default App
