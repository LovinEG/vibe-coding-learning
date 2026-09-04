import { useState } from 'react'
import { signIn } from '../lib/auth'
import Button from '../components/ui/Button'
import '../components/ui/Button.css'
import '../components/ui/Card.css'

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
    <section className="login-page">
      <style>{`
        .login-page {
          min-height: 100svh;
          display: flex;
          align-items: center;
          justify-content: center;
          padding: 24px;
          overflow-y: auto;
        }

        .login-card {
          width: 100%;
          max-width: 400px;
          padding: 32px;
          border-radius: 16px;
          box-shadow:
            0 12px 32px rgba(45, 145, 102, 0.12),
            0 2px 8px rgba(0, 0, 0, 0.06);
        }

        .login-card__title {
          margin-bottom: 24px;
          font-size: 24px;
          font-weight: 600;
          letter-spacing: -0.02em;
          color: var(--color-text);
        }

        .login-card__field {
          display: block;
          margin-bottom: 16px;
        }

        .login-card__label {
          display: block;
          margin-bottom: 6px;
          font-size: 13px;
          font-weight: 500;
          color: var(--color-text-muted);
        }

        .login-card__input {
          width: 100%;
          height: 44px;
          padding: 0 12px;
          border: 1px solid var(--color-border);
          border-radius: 10px;
          background: var(--color-bg);
          color: var(--color-text);
          font-family: inherit;
          font-size: 14px;
          outline: none;
          transition:
            border-color 0.15s ease,
            box-shadow 0.15s ease;
        }

        .login-card__input::placeholder {
          color: var(--color-text-muted);
        }

        .login-card__input:focus {
          border-color: var(--color-accent);
          box-shadow: 0 0 0 3px color-mix(in srgb, var(--color-accent) 18%, transparent);
        }

        .ui-button.login-card__submit {
          width: 100%;
          height: 44px;
          margin-top: 8px;
          font-size: 15px;
        }
      `}</style>

      <form className="ui-card login-card" onSubmit={handleSubmit}>
        <h1 className="login-card__title">Вход</h1>
        <label className="login-card__field">
          <span className="login-card__label">Email</span>
          <input
            className="login-card__input"
            type="email"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            placeholder="you@example.com"
            autoComplete="email"
            required
          />
        </label>
        <label className="login-card__field">
          <span className="login-card__label">Password</span>
          <input
            className="login-card__input"
            type="password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            placeholder="••••••••"
            autoComplete="current-password"
            required
          />
        </label>
        <Button type="submit" className="login-card__submit">
          Войти
        </Button>
      </form>
    </section>
  )
}

export default LoginPage