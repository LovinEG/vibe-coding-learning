import { useState } from 'react'
import { signIn } from '../lib/auth'
import Button from '../components/ui/Button'
import './Page.css'
import '../components/ui/Button.css'
import '../components/ui/Card.css'

const inputStyle = {
  width: '100%',
  height: 40,
  padding: '0 12px',
  border: '1px solid var(--color-border)',
  borderRadius: 8,
  background: 'var(--color-bg)',
  color: 'var(--color-text)',
  fontFamily: 'inherit',
  fontSize: 14,
  outline: 'none',
}

const labelStyle = {
  display: 'block',
  marginBottom: 16,
}

const labelTextStyle = {
  display: 'block',
  marginBottom: 6,
  fontSize: 13,
  fontWeight: 500,
  color: 'var(--color-text-muted)',
}

function LoginPage() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')

  async function handleSubmit(event) {
    event.preventDefault()

    try {
      const result = await signIn(email, password)

      if (result.error) {
        console.error(result.error)
        return
      }

      console.log(result)
    } catch (error) {
      console.error(error)
    }
  }

  return (
    <section className="page">
      <h1 className="page__title">Вход</h1>
      <form
        className="ui-card"
        onSubmit={handleSubmit}
        style={{ maxWidth: 360, marginTop: 24 }}
      >
        <label style={labelStyle}>
          <span style={labelTextStyle}>Email</span>
          <input
            type="email"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            required
            style={inputStyle}
          />
        </label>
        <label style={labelStyle}>
          <span style={labelTextStyle}>Password</span>
          <input
            type="password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            required
            style={inputStyle}
          />
        </label>
        <Button type="submit">Войти</Button>
      </form>
    </section>
  )
}

export default LoginPage