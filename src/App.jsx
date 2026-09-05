import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import AppLayout from './components/layout/AppLayout.jsx'
import ProtectedRoute from './components/auth/ProtectedRoute.jsx'
import { AuthProvider } from './lib/AuthContext.jsx'
import HomePage from './pages/HomePage.jsx'
import OrdersPage from './pages/OrdersPage.jsx'
import ClientsPage from './pages/ClientsPage.jsx'
import InventoryPage from './pages/InventoryPage.jsx'
import SuppliersPage from './pages/SuppliersPage.jsx'
import StockBatchesPage from './pages/StockBatchesPage.jsx'
import ConsumablesPage from './pages/ConsumablesPage.jsx'
import StockMovementsPage from './pages/StockMovementsPage.jsx'
import LoginPage from './pages/LoginPage.jsx'

function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <Routes>
          <Route path="/login" element={<LoginPage />} />
          <Route
            path="/"
            element={
              <ProtectedRoute>
                <AppLayout />
              </ProtectedRoute>
            }
          >
            <Route index element={<HomePage />} />
            <Route path="orders" element={<OrdersPage />} />
            <Route path="clients" element={<ClientsPage />} />
            <Route path="inventory" element={<InventoryPage />} />
            <Route path="suppliers" element={<SuppliersPage />} />
            <Route path="stock-batches" element={<StockBatchesPage />} />
            <Route path="consumables" element={<ConsumablesPage />} />
            <Route
              path="stock-movements"
              element={<StockMovementsPage />}
            />
            {/* Catch-all: неизвестные пути (включая будущие разделы)
                уводим на Дашборд вместо пустой страницы */}
            <Route path="*" element={<Navigate to="/" replace />} />
          </Route>
        </Routes>
      </BrowserRouter>
    </AuthProvider>
  )
}

export default App
