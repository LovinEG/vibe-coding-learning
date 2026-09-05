import { useEffect, useMemo, useState } from 'react'
import CashRegisterModal from '../components/modals/CashRegisterModal'
import Button from '../components/ui/Button'
import { deleteCashRegister, getCashRegisters } from '../data/cashRegisters'
import { formatCurrency } from '../lib/format'
import { usePermission } from '../lib/usePermission'
import './Page.css'

const TYPE_LABELS = {
  cash: 'Наличные',
  bank: 'Банковский счет',
  online: 'Онлайн-эквайринг',
}

const TYPE_BADGES = {
  cash: 'cash-registers-page__type-badge--cash',
  bank: 'cash-registers-page__type-badge--bank',
  online: 'cash-registers-page__type-badge--online',
}

function CashRegistersPage() {
  const [registers, setRegisters] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [modalOpen, setModalOpen] = useState(false)
  const [editingRegister, setEditingRegister] = useState(null)
  const [deletingId, setDeletingId] = useState(null)

  // Просмотр доступен при finance.view (раздел виден в сайдбаре), запись —
  // только finance.manage или админу.
  const canView = usePermission('finance.view')
  const canManage = usePermission('finance.manage')

  useEffect(() => {
    let cancelled = false

    async function loadRegisters() {
      try {
        const result = await getCashRegisters()

        if (!cancelled) {
          setRegisters(result)
        }
      } catch (err) {
        console.error('Не удалось загрузить кассы:', err)

        if (!cancelled) {
          setError(
            'Не удалось загрузить кассы. Попробуйте обновить страницу.',
          )
        }
      } finally {
        if (!cancelled) {
          setLoading(false)
        }
      }
    }

    loadRegisters()

    return () => {
      cancelled = true
    }
  }, [])

  function openCreate() {
    setEditingRegister(null)
    setModalOpen(true)
  }

  function openEdit(register) {
    setEditingRegister(register)
    setModalOpen(true)
  }

  function closeModal() {
    setModalOpen(false)
    setEditingRegister(null)
  }

  async function refreshRegisters() {
    try {
      setError(null)
      setRegisters(await getCashRegisters())
    } catch (err) {
      console.error('Не удалось обновить список касс:', err)
      setError('Не удалось обновить список касс.')
    }
  }

  async function handleDelete(register) {
    const confirmed = window.confirm(`Удалить кассу «${register.name}»?`)

    if (!confirmed) {
      return
    }

    setDeletingId(register.id)

    try {
      await deleteCashRegister(register.id)
      setRegisters((prev) => prev.filter((item) => item.id !== register.id))
    } catch (err) {
      console.error('Не удалось удалить кассу:', err)
      setError(`Не удалось удалить кассу «${register.name}».`)
    } finally {
      setDeletingId(null)
    }
  }

  // Суммарный остаток только по активным кассам.
  const totalBalance = useMemo(
    () =>
      registers
        .filter((register) => register.isActive)
        .reduce((sum, register) => sum + register.balance, 0),
    [registers],
  )

  if (!canView) {
    return (
      <div className="page cash-registers-page">
        <h1 className="cash-registers-page__title">Кассы и счета</h1>
        <p className="cash-registers-page__empty">
          Недостаточно прав для просмотра раздела «Финансы».
        </p>
      </div>
    )
  }

  return (
    <div className="page cash-registers-page">
      <header className="cash-registers-page__head">
        <div>
          <h1 className="cash-registers-page__title">Кассы и счета</h1>
          <p className="cash-registers-page__hint">
            Денежные средства: наличные, банк и онлайн-эквайринг.
          </p>
        </div>
        {canManage ? (
          <Button type="button" onClick={openCreate}>
            + Добавить кассу
          </Button>
        ) : null}
      </header>

      <div className="cash-registers-page__summary">
        <span className="cash-registers-page__summary-label">
          Общий баланс активных касс
        </span>
        <span className="cash-registers-page__summary-value">
          {formatCurrency(totalBalance)}
        </span>
      </div>

      {loading ? (
        <p className="cash-registers-page__empty">Загрузка...</p>
      ) : error ? (
        <p className="cash-registers-page__error" role="alert">
          {error}
        </p>
      ) : registers.length === 0 ? (
        <p className="cash-registers-page__empty">Кассы не добавлены</p>
      ) : (
        <div className="cash-registers-page__cards">
          {registers.map((register) => (
            <article
              key={register.id}
              className={`cash-registers-page__card${
                register.isActive ? '' : ' is-archive'
              }`}
            >
              <div className="cash-registers-page__card-head">
                <span
                  className={`cash-registers-page__type-badge ${
                    TYPE_BADGES[register.type] ?? ''
                  }`}
                >
                  {TYPE_LABELS[register.type] ?? register.type}
                </span>
                <span
                  className={`cash-registers-page__status-badge ${
                    register.isActive ? 'is-active' : 'is-archive'
                  }`}
                >
                  {register.isActive ? 'Активна' : 'Архив'}
                </span>
              </div>

              <h2 className="cash-registers-page__card-name">
                {register.name}
              </h2>
              <p className="cash-registers-page__card-balance">
                {formatCurrency(register.balance)}
              </p>

              {canManage ? (
                <div className="cash-registers-page__card-actions">
                  <Button
                    type="button"
                    className="cash-registers-page__card-action"
                    onClick={() => openEdit(register)}
                    disabled={deletingId === register.id}
                  >
                    Изменить
                  </Button>
                  <Button
                    type="button"
                    className="cash-registers-page__card-action cash-registers-page__card-action--danger"
                    onClick={() => handleDelete(register)}
                    disabled={deletingId === register.id}
                  >
                    {deletingId === register.id ? 'Удаление...' : 'Удалить'}
                  </Button>
                </div>
              ) : null}
            </article>
          ))}
        </div>
      )}

      <CashRegisterModal
        // key меняется только при открытии/закрытии или смене
        // редактируемой кассы — во время ввода в форме он стабилен.
        key={modalOpen ? editingRegister?.id || 'new' : 'closed'}
        open={modalOpen}
        register={editingRegister}
        onClose={closeModal}
        onSaved={refreshRegisters}
      />
    </div>
  )
}

export default CashRegistersPage