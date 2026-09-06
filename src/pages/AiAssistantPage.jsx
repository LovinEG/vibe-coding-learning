import { useEffect, useRef, useState } from 'react'
import { getAiContext, sendAiQuery, AI_PROMPT_PRESETS } from '../data/ai'
import { formatCurrency } from '../lib/format'
import Button from '../components/ui/Button'
import './Page.css'

const WELCOME_MESSAGE = {
  role: 'assistant',
  content:
    'Здравствуйте! Я AI-ассистент LovinTech CRM. Я помогу вам с анализом финансов, складских остатков, задач и клиентов. Используйте быстрые промпты слева или задайте вопрос в свободной форме.',
}

function AiAssistantPage() {
  const [context, setContext] = useState(null)
  const [contextLoading, setContextLoading] = useState(true)
  const [contextError, setContextError] = useState(null)
  const [messages, setMessages] = useState([WELCOME_MESSAGE])
  const [inputValue, setInputValue] = useState('')
  const [isGenerating, setIsGenerating] = useState(false)
  const messagesEndRef = useRef(null)

  useEffect(() => {
    let cancelled = false

    async function loadContext() {
      try {
        const data = await getAiContext()
        if (!cancelled) setContext(data)
      } catch (err) {
        console.error('Не удалось загрузить контекст AI:', err)
        if (!cancelled) setContextError('Не удалось загрузить данные для анализа.')
      } finally {
        if (!cancelled) setContextLoading(false)
      }
    }

    loadContext()
    return () => { cancelled = true }
  }, [])

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages, isGenerating])

  async function handleSend(prompt) {
    const trimmed = prompt.trim()
    if (!trimmed || isGenerating) return

    setMessages((prev) => [...prev, { role: 'user', content: trimmed }])
    setInputValue('')
    setIsGenerating(true)

    try {
      const response = await sendAiQuery(trimmed, messages)
      setMessages((prev) => [...prev, response])
    } catch (err) {
      console.error('Ошибка отправки запроса AI:', err)
      setMessages((prev) => [
        ...prev,
        { role: 'assistant', content: 'Произошла ошибка при обработке запроса. Попробуйте ещё раз.' },
      ])
    } finally {
      setIsGenerating(false)
    }
  }

  function handleSubmit(event) {
    event.preventDefault()
    handleSend(inputValue)
  }

  function handlePresetClick(preset) {
    handleSend(preset.prompt)
  }


  return (
    <div className="page ai-page">
      <div className="ai-page__head">
        <div>
          <h1 className="ai-page__title">AI-Ассистент</h1>
          <p className="ai-page__hint">
            Аналитика и интеллектуальный помощник для вашего бизнеса
          </p>
        </div>
      </div>

      <div className="ai-page__layout">
        <aside className="ai-page__sidebar">
          <div className="ai-page__card">
            <h2 className="ai-page__card-title">Быстрая аналитика</h2>
            {contextLoading ? (
              <p className="ai-page__card-hint">Загрузка данных...</p>
            ) : contextError ? (
              <p className="ai-page__card-error">{contextError}</p>
            ) : context ? (
              <div className="ai-page__insights">
                <div className="ai-page__insight">
                  <span className="ai-page__insight-label">Выручка (30 дней)</span>
                  <span className="ai-page__insight-value ai-page__insight-value--positive">
                    +{formatCurrency(context.revenue.totalIncome)}
                  </span>
                </div>
                <div className="ai-page__insight">
                  <span className="ai-page__insight-label">Расходы (30 дней)</span>
                  <span className="ai-page__insight-value ai-page__insight-value--negative">
                    −{formatCurrency(context.revenue.totalExpenses)}
                  </span>
                </div>
                <div className="ai-page__insight">
                  <span className="ai-page__insight-label">Чистый поток</span>
                  <span
                    className={`ai-page__insight-value ${
                      context.revenue.netFlow >= 0
                        ? 'ai-page__insight-value--positive'
                        : 'ai-page__insight-value--negative'
                    }`}
                  >
                    {context.revenue.netFlow >= 0 ? '+' : '−'}
                    {formatCurrency(Math.abs(context.revenue.netFlow))}
                  </span>
                </div>
                <div className="ai-page__insight">
                  <span className="ai-page__insight-label">Критический запас</span>
                  <span
                    className={`ai-page__insight-value ${
                      context.inventory.criticalStockCount > 0
                        ? 'ai-page__insight-value--warning'
                        : ''
                    }`}
                  >
                    {context.inventory.criticalStockCount} запчастей
                  </span>
                </div>
                <div className="ai-page__insight">
                  <span className="ai-page__insight-label">Просроченные задачи</span>
                  <span
                    className={`ai-page__insight-value ${
                      context.tasks.overdue > 0
                        ? 'ai-page__insight-value--warning'
                        : ''
                    }`}
                  >
                    {context.tasks.overdue} из {context.tasks.totalOpen}
                  </span>
                </div>
                <div className="ai-page__insight">
                  <span className="ai-page__insight-label">Баланс касс</span>
                  <span className="ai-page__insight-value">
                    {formatCurrency(context.cash.totalBalance)}
                  </span>
                </div>
              </div>
            ) : null}
          </div>

          <div className="ai-page__card">
            <h2 className="ai-page__card-title">Быстрые промпты</h2>
            <div className="ai-page__presets">
              {AI_PROMPT_PRESETS.map((preset) => (
                <button
                  key={preset.id}
                  type="button"
                  className="ai-page__preset"
                  onClick={() => handlePresetClick(preset)}
                  disabled={isGenerating}
                >
                  <span className="ai-page__preset-icon" aria-hidden="true">
                    {preset.icon}
                  </span>
                  <span className="ai-page__preset-label">{preset.label}</span>
                </button>
              ))}
            </div>
          </div>
        </aside>
        <main className="ai-page__chat">
          <div className="ai-page__messages">
            {messages.map((message, index) => (
              <div
                key={index}
                className={`ai-page__message ai-page__message--${message.role}`}
              >
                <div className="ai-page__message-avatar" aria-hidden="true">
                  {message.role === 'user' ? '👤' : '🤖'}
                </div>
                <div className="ai-page__message-content">
                  <div className="ai-page__message-role">
                    {message.role === 'user' ? 'Вы' : 'AI-Ассистент'}
                  </div>
                  <p className="ai-page__message-text">{message.content}</p>
                </div>
              </div>
            ))}
            {isGenerating ? (
              <div className="ai-page__message ai-page__message--assistant">
                <div className="ai-page__message-avatar" aria-hidden="true">
                  🤖
                </div>
                <div className="ai-page__message-content">
                  <div className="ai-page__message-role">AI-Ассистент</div>
                  <div className="ai-page__typing">
                    <span className="ai-page__typing-dot" />
                    <span className="ai-page__typing-dot" />
                    <span className="ai-page__typing-dot" />
                  </div>
                </div>
              </div>
            ) : null}
            <div ref={messagesEndRef} />
          </div>

          <form className="ai-page__input-form" onSubmit={handleSubmit}>
            <input
              className="ai-page__input"
              type="text"
              placeholder="Задайте вопрос AI-ассистенту..."
              value={inputValue}
              onChange={(event) => setInputValue(event.target.value)}
              disabled={isGenerating}
              aria-label="Ввод сообщения для AI"
            />
            <Button type="submit" disabled={isGenerating || !inputValue.trim()}>
              {isGenerating ? 'Генерация...' : 'Отправить'}
            </Button>
          </form>
        </main>
      </div>
    </div>
  )
}

export default AiAssistantPage

