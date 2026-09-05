import { Navigate } from 'react-router-dom'
import { useAuth } from '../../lib/useAuth'

function ProtectedRoute({ children }) {
  const { loading, session } = useAuth()

  if (loading) {
    return (
      <div className="protected-route__loading">
        <span className="protected-route__loading-text">Загрузка...</span>
      </div>
    )
  }

  if (!session) {
    return <Navigate to="/login" replace />
  }

  return children
}

export default ProtectedRoute