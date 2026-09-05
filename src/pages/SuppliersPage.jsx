import { useEffect, useMemo, useState } from 'react'
import SupplierModal from '../components/modals/SupplierModal'
import Button from '../components/ui/Button'
import { deleteSupplier, getSuppliers } from '../data/suppliers'
import { usePermission } from '../lib/usePermission'

function SuppliersPage() {
  const [suppliers, setSuppliers] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [search, setSearch] = useState('')
  const [modal, setModal] = useState({ open: false, supplier: null })
  const [deletingId, setDeletingId] = useState(null)
  const canManage = usePermission('inventory.manage')

  useEffect(() => {
    let cancelled = false

    async function loadSuppliers() {
      try {
        const result = await getSuppliers()

        if (!cancelled) {
          setSuppliers(result)
        }
      } catch (err) {
        if (!cancelled) {
          console.error('Не удалось загрузить поставщиков:', err)
          setError(
            'Не удалось загрузить поставщиков. Попробуйте обновить страницу.',
          )
        }
      } finally {
        if (!cancelled) {
          setLoading(false)
        }
      }
    }

    loadSuppliers()

    return () => {
      cancelled = true
    }
  }, [])

  function openCreate() {
    setModal({ open: true, supplier: null })
  }

  function openEdit(supplier) {
    setModal({ open: true, supplier })
  }

  function closeModal() {
    setModal({ open: false, supplier: null })
  }

  async function refreshSuppliers() {
    try {
      setError(null)
      setSuppliers(await getSuppliers())
    } catch (err) {
      console.error('Не удалось обновить список поставщиков:', err)
      setError('Не удалось обновить список поставщиков.')
    }
  }

  async function handleDelete(supplier) {
    const confirmed = window.confirm(
      `Удалить поставщика «${supplier.name}»? Ссылки в партиях поставок будут очищены.`,
    )

    if (!confirmed) {
      return
    }

    setDeletingId(supplier.id)

    try {
      await deleteSupplier(supplier.id)
      setSuppliers((prev) => prev.filter((item) => item.id !== supplier.id))
    } catch (err) {
      console.error('Не удалось удалить поставщика:', err)
      setError(`Не удалось удалить поставщика «${supplier.name}».`)
    } finally {
      setDeletingId(null)
    }
  }

  const normalizedSearch = search.trim().toLowerCase()

  const filteredSuppliers = useMemo(
    () =>
      suppliers.filter(
        (supplier) =>
          !normalizedSearch ||
          supplier.name.toLowerCase().includes(normalizedSearch) ||
          (supplier.phone ?? '').toLowerCase().includes(normalizedSearch) ||
          (supplier.email ?? '').toLowerCase().includes(normalizedSearch),
      ),
    [suppliers, normalizedSearch],
  )

  return (
    <div className="page suppliers-page">
      <header className="suppliers-page__head">
        <h1 className="suppliers-page__title">Поставщики</h1>
        {canManage ? (
          <Button onClick={openCreate}>+ Добавить поставщика</Button>
        ) : null}
      </header>

      <input
        className="suppliers-page__search"
        type="search"
        placeholder="Поиск по названию, телефону или email..."
        value={search}
        onChange={(event) => setSearch(event.target.value)}
      />

      {loading ? (
        <p>Загрузка...</p>
      ) : error ? (
        <p className="suppliers-page__error" role="alert">
          {error}
        </p>
      ) : filteredSuppliers.length === 0 ? (
        <p className="suppliers-page__empty">Поставщики не найдены</p>
      ) : (
        <div className="suppliers-page__table">
          <div className="suppliers-page__table-header">
            <span>Название</span>
            <span>Телефон</span>
            <span>Email</span>
            <span>Адрес</span>
            <span>Заметки</span>
            {canManage ? <span>Действия</span> : null}
          </div>
          <ul className="suppliers-page__list">
            {filteredSuppliers.map((supplier) => (
              <li className="suppliers-page__row" key={supplier.id}>
                <span className="suppliers-page__name">{supplier.name}</span>
                <span className="suppliers-page__muted">
                  {supplier.phone ?? '—'}
                </span>
                <span className="suppliers-page__muted">
                  {supplier.email ?? '—'}
                </span>
                <span className="suppliers-page__muted">
                  {supplier.address ?? '—'}
                </span>
                <span className="suppliers-page__muted suppliers-page__notes">
                  {supplier.notes ?? '—'}
                </span>
                {canManage ? (
                  <span className="suppliers-page__actions">
                    <Button
                      className="suppliers-page__action-button"
                      onClick={() => openEdit(supplier)}
                    >
                      Изменить
                    </Button>
                    <Button
                      className="suppliers-page__action-button suppliers-page__action-button--danger"
                      onClick={() => handleDelete(supplier)}
                      disabled={deletingId === supplier.id}
                    >
                      {deletingId === supplier.id ? 'Удаление...' : 'Удалить'}
                    </Button>
                  </span>
                ) : null}
              </li>
            ))}
          </ul>
        </div>
      )}

      <SupplierModal
        key={modal.open ? (modal.supplier?.id ?? 'new') : 'closed'}
        open={modal.open}
        supplier={modal.supplier}
        onClose={closeModal}
        onSaved={refreshSuppliers}
      />
    </div>
  )
}

export default SuppliersPage