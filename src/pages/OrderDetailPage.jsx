import { useCallback, useEffect, useMemo, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import {
  addOrderService,
  getOrderById,
  getOrderServices,
  updateOrderApproval,
  updateOrderDiagnostic,
} from '../data/orders'
import { addOrderPart } from '../data/orderParts'
import { getParts } from '../data/inventory'
import { getServices } from '../data/services'
import { getEmployees } from '../data/tasks'
import EditOrderModal from '../components/modals/EditOrderModal'
import { formatDate, formatDateTime, formatPrice } from '../lib/format'
import { usePermission } from '../lib/usePermission'
import { useAuth } from '../lib/useAuth'
import Button from '../components/ui/Button'
import Card from '../components/ui/Card'
import './Page.css'

const STATUS_BADGES = {
  Новый: 'order-detail-page__status-badge--new',
  'В работе': 'order-detail-page__status-badge--in-work',
  'Ожидает деталь': 'order-detail-page__status-badge--waiting',
  'Готово к выдаче': 'order-detail-page__status-badge--ready',
  Выдан: 'order-detail-page__status-badge--issued',
}

const APPROVAL_BADGES = {
  not_required: {
    label: 'Согласование не требуется',
    cls: 'order-detail-page__approval-badge--not-required',
  },
  pending: {
    label: 'Ожидает решения клиента',
    cls: 'order-detail-page__approval-badge--pending',
  },
  approved: {
    label: 'Клиент согласовал',
    cls: 'order-detail-page__approval-badge--approved',
  },
  rejected: {
    label: 'Клиент отказался',
    cls: 'order-detail-page__approval-badge--rejected',
  },
}

const EVENT_ICONS = {
  created: '📝',
  assigned: '👨‍🔧',
  diagnosed: '🔍',
  part_added: '🔩',
  approval_sent: '📤',
  approved: '✅',
  rejected: '❌',
  repaired: '🔧',
  paid: '💰',
  issued: '📦',
}

const EMPTY_PART_FORM = {
  partId: '',
  quantity: '1',
  purchasePrice: '',
  markup: '',
}

const EMPTY_SERVICE_FORM = {
  serviceId: '',
  title: '',
  price: '',
  masterId: '',
  durationMinutes: '',
}

function OrderDetailPage() {
  const { id } = useParams()
  const navigate = useNavigate()
  const { profile } = useAuth()

  const [order, setOrder] = useState(null)
  const [partsCatalog, setPartsCatalog] = useState([])
  const [servicesCatalog, setServicesCatalog] = useState([])
  const [employees, setEmployees] = useState([])
  const [orderServices, setOrderServices] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [lightboxUrl, setLightboxUrl] = useState(null)
  const [editModalOpen, setEditModalOpen] = useState(false)

  // Редактор диагностики.
  const [diagnosticEditing, setDiagnosticEditing] = useState(false)
  const [diagnosticResult, setDiagnosticResult] = useState('')
  const [diagnosticPhotos, setDiagnosticPhotos] = useState([])
  const [diagnosticPhotoUrl, setDiagnosticPhotoUrl] = useState('')
  const [diagnosticSaving, setDiagnosticSaving] = useState(false)
  const [diagnosticError, setDiagnosticError] = useState('')

  // Согласование.
  const [rejectOpen, setRejectOpen] = useState(false)
  const [rejectComment, setRejectComment] = useState('')
  const [approvalBusy, setApprovalBusy] = useState(false)
  const [approvalError, setApprovalError] = useState('')

  // Форма добавления запчасти.
  const [partFormOpen, setPartFormOpen] = useState(false)
  const [partForm, setPartForm] = useState(EMPTY_PART_FORM)
  const [partSaving, setPartSaving] = useState(false)
  const [partError, setPartError] = useState('')

  // Форма добавления работы.
  const [serviceFormOpen, setServiceFormOpen] = useState(false)
  const [serviceForm, setServiceForm] = useState(EMPTY_SERVICE_FORM)
  const [serviceSaving, setServiceSaving] = useState(false)
  const [serviceError, setServiceError] = useState('')

  const canManage = usePermission('orders.edit')
  const canView = usePermission('orders.view')

  // Тихое обновление после мутаций (без сброса лоадера).
  const loadOrder = useCallback(async () => {
    try {
      const [orderData, catalog, servicesData, employeesData, orderServicesData] =
        await Promise.all([
          getOrderById(id),
          getParts(),
          getServices(),
          getEmployees(),
          getOrderServices(id),
        ])

      setOrder(orderData)
      setPartsCatalog(catalog)
      setServicesCatalog(servicesData)
      setEmployees(employeesData)
      setOrderServices(orderServicesData)
      setError(null)
    } catch (err) {
      console.error('Не удалось обновить заказ:', err)
    }
  }, [id])

  useEffect(() => {
    let cancelled = false

    async function loadInitial() {
      try {
        const [orderData, catalog, servicesData, employeesData, orderServicesData] =
          await Promise.all([
            getOrderById(id),
            getParts(),
            getServices(),
            getEmployees(),
            getOrderServices(id),
          ])

        if (!cancelled) {
          setOrder(orderData)
          setPartsCatalog(catalog)
          setServicesCatalog(servicesData)
          setEmployees(employeesData)
          setOrderServices(orderServicesData)
          setError(null)
        }
      } catch (err) {
        console.error('Не удалось загрузить заказ:', err)

        if (!cancelled) {
          setError('Не удалось загрузить заказ. Возможно, он был удалён.')
        }
      } finally {
        if (!cancelled) {
          setLoading(false)
        }
      }
    }

    loadInitial()

    return () => {
      cancelled = true
    }
  }, [id])

  // Калькулятор согласования: стоимость деталей + работы = итого.
  const partsSum = useMemo(() => {
    if (!order) {
      return 0
    }
    return order.parts.reduce((sum, part) => sum + (part.sum ?? 0), 0)
  }, [order])

  const worksSum = useMemo(() => {
    if (!order) {
      return 0
    }
    return Math.max(0, Number(order.price ?? 0) - partsSum)
  }, [order, partsSum])

  // Расчёт цены клиента в форме добавления детали (живой предпросмотр).
  const partFormClientPrice = useMemo(() => {
    const purchase = Number(partForm.purchasePrice)
    const markup = Number(partForm.markup)

    if (partForm.purchasePrice === '' || partForm.markup === '') {
      return null
    }
    if (!Number.isFinite(purchase) || !Number.isFinite(markup)) {
      return null
    }

    return purchase + markup
  }, [partForm.purchasePrice, partForm.markup])

  // ---------------- Обработчики: диагностика ----------------

  function startDiagnosticEdit() {
    setDiagnosticResult(order.diagnosticResult ?? '')
    setDiagnosticPhotos(Array.isArray(order.diagnosticPhotos) ? [...order.diagnosticPhotos] : [])
    setDiagnosticPhotoUrl('')
    setDiagnosticError('')
    setDiagnosticEditing(true)
  }

  function addDiagnosticPhoto() {
    const url = diagnosticPhotoUrl.trim()

    if (!url || diagnosticPhotos.includes(url)) {
      return
    }

    setDiagnosticPhotos((prev) => [...prev, url])
    setDiagnosticPhotoUrl('')
  }

  function removeDiagnosticPhoto(url) {
    setDiagnosticPhotos((prev) => prev.filter((item) => item !== url))
  }

  async function saveDiagnostic() {
    setDiagnosticError('')
    setDiagnosticSaving(true)

    try {
      await updateOrderDiagnostic(id, {
        diagnosticResult: diagnosticResult.trim() || null,
        diagnosticPhotos,
      })
      await loadOrder()
      setDiagnosticEditing(false)
    } catch (err) {
      console.error('Не удалось сохранить диагностику:', err)
      setDiagnosticError('Не удалось сохранить диагностику. Попробуйте ещё раз.')
    } finally {
      setDiagnosticSaving(false)
    }
  }

  // ---------------- Обработчики: согласование ----------------

  async function handleApproval(status, comment = null) {
    setApprovalError('')
    setApprovalBusy(true)

    try {
      await updateOrderApproval(id, { status, comment })
      await loadOrder()
      setRejectOpen(false)
      setRejectComment('')
    } catch (err) {
      console.error('Не удалось обновить согласование:', err)
      setApprovalError('Не удалось обновить статус согласования. Попробуйте ещё раз.')
    } finally {
      setApprovalBusy(false)
    }
  }

  // ---------------- Обработчики: запчасти ----------------

  function handlePartFormChange(event) {
    const { name, value } = event.target
    setPartForm((prev) => ({ ...prev, [name]: value }))
  }

  async function handleAddPart(event) {
    event.preventDefault()
    setPartError('')

    const qty = Number(partForm.quantity)
    const purchase = Number(partForm.purchasePrice)
    const markup = Number(partForm.markup)

    if (!partForm.partId) {
      setPartError('Выберите запчасть со склада')
      return
    }

    if (!Number.isInteger(qty) || qty < 1) {
      setPartError('Количество должно быть целым числом не меньше 1')
      return
    }

    if (
      partForm.purchasePrice === '' ||
      partForm.markup === '' ||
      !Number.isFinite(purchase) ||
      !Number.isFinite(markup) ||
      purchase < 0 ||
      markup < 0
    ) {
      setPartError('Закупочная цена и наценка — неотрицательные числа')
      return
    }

    setPartSaving(true)

    try {
      await addOrderPart(id, {
        partId: partForm.partId,
        quantity: qty,
        purchasePrice: purchase,
        markup,
        addedBy: profile?.id ?? null,
      })

      setPartForm(EMPTY_PART_FORM)
      setPartFormOpen(false)
      await loadOrder()
    } catch (err) {
      console.error('Не удалось добавить деталь:', err)
      setPartError(`Не удалось добавить деталь: ${err.message ?? 'попробуйте ещё раз.'}`)
    } finally {
      setPartSaving(false)
    }
  }

  // ---------------- Обработчики: работы (услуги) ----------------

  function handleServiceFormChange(event) {
    const { name, value } = event.target
    setServiceForm((prev) => ({ ...prev, [name]: value }))
  }

  // Выбор услуги из справочника: автозаполнение названия, цены и времени.
  // Вариант "custom" — ручной ввод названия.
  function handleServiceCatalogSelect(event) {
    const { value } = event.target

    if (value === 'custom' || value === '') {
      setServiceForm((prev) => ({
        ...prev,
        serviceId: value === 'custom' ? null : '',
        title: value === 'custom' ? prev.title : '',
        price: value === 'custom' ? prev.price : '',
        durationMinutes: value === 'custom' ? prev.durationMinutes : '',
      }))
      return
    }

    const catalogService = servicesCatalog.find(
      (service) => service.id === value,
    )

    if (!catalogService) {
      return
    }

    setServiceForm((prev) => ({
      ...prev,
      serviceId: catalogService.id,
      title: catalogService.name,
      price: String(catalogService.price),
      durationMinutes: catalogService.durationMinutes
        ? String(catalogService.durationMinutes)
        : prev.durationMinutes,
    }))
  }

  async function handleAddService(event) {
    event.preventDefault()
    setServiceError('')

    const servicePrice = Number(serviceForm.price)
    const duration = Number(serviceForm.durationMinutes)

    if (!serviceForm.title.trim()) {
      setServiceError('Укажите название работы')
      return
    }

    if (
      serviceForm.price === '' ||
      !Number.isFinite(servicePrice) ||
      servicePrice < 0
    ) {
      setServiceError('Стоимость работы — неотрицательное число')
      return
    }

    if (
      serviceForm.durationMinutes !== '' &&
      (!Number.isFinite(duration) || duration < 0)
    ) {
      setServiceError('Время выполнения — неотрицательное число минут')
      return
    }

    setServiceSaving(true)

    try {
      await addOrderService(id, {
        serviceId: serviceForm.serviceId || null,
        title: serviceForm.title,
        price: servicePrice,
        masterId: serviceForm.masterId || null,
        durationMinutes:
          serviceForm.durationMinutes === '' ? null : duration,
      })

      setServiceForm(EMPTY_SERVICE_FORM)
      setServiceFormOpen(false)
      await loadOrder()
    } catch (err) {
      console.error('Не удалось добавить работу:', err)
      setServiceError(`Не удалось добавить работу: ${err.message ?? 'попробуйте ещё раз.'}`)
    } finally {
      setServiceSaving(false)
    }
  }

  // ---------------- Ранние выходы ----------------

  if (!canView) {
    return (
      <div className="page order-detail-page">
        <p className="order-detail-page__alert" role="alert">
          У вас нет прав для просмотра заказов.
        </p>
      </div>
    )
  }

  if (loading) {
    return (
      <div className="page order-detail-page">
        <p className="order-detail-page__empty">Загрузка...</p>
      </div>
    )
  }

  if (error || !order) {
    return (
      <div className="page order-detail-page">
        <p className="order-detail-page__alert" role="alert">
          {error ?? 'Заказ не найден.'}
        </p>
        <Button className="order-detail-page__back-button" onClick={() => navigate('/orders')}>
          ← К списку заказов
        </Button>
      </div>
    )
  }

  const approval = APPROVAL_BADGES[order.approvalStatus] ?? APPROVAL_BADGES.not_required


  return (
    <div className="page order-detail-page">
      <div className="order-detail-page__topline">
        <Button
          className="order-detail-page__back-button"
          onClick={() => navigate('/orders')}
        >
          ← Назад к заказам
        </Button>

        {canManage ? (
          <Button
            className="order-detail-page__back-button"
            onClick={() => setEditModalOpen(true)}
          >
            ✏️ Редактировать
          </Button>
        ) : null}
      </div>

      {/* Шапка-клипборд: номер, статус, мастер, стоимость */}
      <Card className="order-detail-page__clipboard">
        <div className="order-detail-page__clipboard-main">
          <h1 className="order-detail-page__number">{order.orderNumber}</h1>
          <span
            className={`order-detail-page__status-badge ${
              STATUS_BADGES[order.status] ?? ''
            }`}
          >
            {order.status}
          </span>
        </div>

        <dl className="order-detail-page__summary">
          <div>
            <dt>Клиент</dt>
            <dd>{order.client ?? '—'}</dd>
          </div>
          <div>
            <dt>Телефон</dt>
            <dd>{order.clientPhone ?? '—'}</dd>
          </div>
          <div>
            <dt>Устройство</dt>
            <dd>{order.device ?? '—'}</dd>
          </div>
          <div>
            <dt>Мастер</dt>
            <dd>{order.masterName ?? '—'}</dd>
          </div>
          <div>
            <dt>Принят</dt>
            <dd>{formatDate(order.acceptedAt)}</dd>
          </div>
          <div>
            <dt>Неисправность</dt>
            <dd>{order.defect ?? '—'}</dd>
          </div>
          <div>
            <dt>Предварительная стоимость</dt>
            <dd className="order-detail-page__price">{formatPrice(order.price)}</dd>
          </div>
        </dl>
      </Card>

      <div className="order-detail-page__grid">
        {/* Левая колонка */}
        <div className="order-detail-page__column">
          {/* Приёмка */}
          <Card className="order-detail-page__panel">
            <h2 className="order-detail-page__panel-title">Приёмка</h2>
            <dl className="order-detail-page__intake-list">
              <div>
                <dt>Внешний вид</dt>
                <dd>{order.appearance ?? '—'}</dd>
              </div>
              <div>
                <dt>Комплектация</dt>
                <dd>{order.equipment ?? '—'}</dd>
              </div>
              <div>
                <dt>Состояние устройства</dt>
                <dd>{order.deviceCondition ?? '—'}</dd>
              </div>
            </dl>

            <p className="order-detail-page__gallery-title">
              Фото приёмки ({order.intakePhotos.length})
            </p>
            {order.intakePhotos.length === 0 ? (
              <p className="order-detail-page__empty">
                Фотографии приёмки не загружены
              </p>
            ) : (
              <div className="order-detail-page__gallery">
                {order.intakePhotos.map((url, index) => (
                  <button
                    key={`${url}-${index}`}
                    type="button"
                    className="order-detail-page__photo-thumb"
                    onClick={() => setLightboxUrl(url)}
                    aria-label={`Увеличить фото приёмки ${index + 1}`}
                  >
                    <img src={url} alt={`Фото приёмки ${index + 1}`} loading="lazy" />
                  </button>
                ))}
              </div>
            )}
          </Card>


          {/* Диагностика */}
          <Card className="order-detail-page__panel">
            <div className="order-detail-page__panel-head">
              <h2 className="order-detail-page__panel-title">Диагностика</h2>
              {canManage && !diagnosticEditing ? (
                <Button
                  className="order-detail-page__small-button"
                  onClick={startDiagnosticEdit}
                >
                  Редактировать
                </Button>
              ) : null}
            </div>

            {diagnosticEditing ? (
              <div className="order-detail-page__diagnostic-editor">
                <textarea
                  className="order-detail-page__textarea"
                  rows={4}
                  placeholder="Результат диагностики: найденные неисправности, рекомендации..."
                  value={diagnosticResult}
                  onChange={(event) => setDiagnosticResult(event.target.value)}
                />

                <div className="order-detail-page__photo-input-row">
                  <input
                    className="order-detail-page__input"
                    type="url"
                    placeholder="URL фото диагностики"
                    value={diagnosticPhotoUrl}
                    onChange={(event) => setDiagnosticPhotoUrl(event.target.value)}
                  />
                  <Button
                    className="order-detail-page__small-button"
                    onClick={addDiagnosticPhoto}
                    disabled={!diagnosticPhotoUrl.trim()}
                  >
                    + Фото
                  </Button>
                </div>

                {diagnosticPhotos.length > 0 ? (
                  <div className="order-detail-page__photo-edit-list">
                    {diagnosticPhotos.map((url) => (
                      <span key={url} className="order-detail-page__photo-edit-item">
                        <img src={url} alt="Фото диагностики" loading="lazy" />
                        <button
                          type="button"
                          className="order-detail-page__photo-remove"
                          onClick={() => removeDiagnosticPhoto(url)}
                          aria-label="Удалить фото"
                        >
                          ×
                        </button>
                      </span>
                    ))}
                  </div>
                ) : null}

                {diagnosticError ? (
                  <p className="order-detail-page__alert" role="alert">
                    {diagnosticError}
                  </p>
                ) : null}

                <div className="order-detail-page__editor-actions">
                  <Button
                    className="order-detail-page__small-button order-detail-page__small-button--secondary"
                    onClick={() => setDiagnosticEditing(false)}
                    disabled={diagnosticSaving}
                  >
                    Отмена
                  </Button>
                  <Button onClick={saveDiagnostic} disabled={diagnosticSaving}>
                    {diagnosticSaving ? 'Сохранение...' : 'Сохранить'}
                  </Button>
                </div>
              </div>
            ) : (
              <>
                <p className="order-detail-page__diagnostic-result">
                  {order.diagnosticResult ?? 'Диагностика ещё не проведена'}
                </p>

                {order.diagnosticPhotos.length > 0 ? (
                  <div className="order-detail-page__gallery">
                    {order.diagnosticPhotos.map((url, index) => (
                      <button
                        key={`${url}-${index}`}
                        type="button"
                        className="order-detail-page__photo-thumb"
                        onClick={() => setLightboxUrl(url)}
                        aria-label={`Увеличить фото диагностики ${index + 1}`}
                      >
                        <img
                          src={url}
                          alt={`Фото диагностики ${index + 1}`}
                          loading="lazy"
                        />
                      </button>
                    ))}
                  </div>
                ) : null}
              </>
            )}
          </Card>


          {/* Детали (запчасти) */}
          <Card className="order-detail-page__panel">
            <div className="order-detail-page__panel-head">
              <h2 className="order-detail-page__panel-title">
                Детали (запчасти) — {order.parts.length}
              </h2>
              {canManage ? (
                <Button
                  className="order-detail-page__small-button"
                  onClick={() => setPartFormOpen((prev) => !prev)}
                >
                  {partFormOpen ? 'Скрыть форму' : '+ Добавить деталь'}
                </Button>
              ) : null}
            </div>

            {partFormOpen && canManage ? (
              <form className="order-detail-page__part-form" onSubmit={handleAddPart}>
                <label className="order-detail-page__field">
                  <span>Запчасть *</span>
                  <select
                    className="order-detail-page__input"
                    name="partId"
                    value={partForm.partId}
                    onChange={handlePartFormChange}
                  >
                    <option value="">Выберите запчасть</option>
                    {partsCatalog.map((part) => (
                      <option key={part.id} value={part.id}>
                        {part.name} ({part.sku}) — остаток {part.totalStock}
                      </option>
                    ))}
                  </select>
                </label>

                <div className="order-detail-page__part-form-row">
                  <label className="order-detail-page__field">
                    <span>Кол-во *</span>
                    <input
                      className="order-detail-page__input"
                      type="number"
                      name="quantity"
                      min="1"
                      step="1"
                      value={partForm.quantity}
                      onChange={handlePartFormChange}
                    />
                  </label>
                  <label className="order-detail-page__field">
                    <span>Закупка, ₽ *</span>
                    <input
                      className="order-detail-page__input"
                      type="number"
                      name="purchasePrice"
                      min="0"
                      step="0.01"
                      value={partForm.purchasePrice}
                      onChange={handlePartFormChange}
                    />
                  </label>
                  <label className="order-detail-page__field">
                    <span>Наценка, ₽ *</span>
                    <input
                      className="order-detail-page__input"
                      type="number"
                      name="markup"
                      min="0"
                      step="0.01"
                      value={partForm.markup}
                      onChange={handlePartFormChange}
                    />
                  </label>
                </div>

                <p className="order-detail-page__part-client-price">
                  Цена для клиента:{' '}
                  <strong>
                    {partFormClientPrice === null
                      ? '—'
                      : formatPrice(partFormClientPrice)}
                  </strong>
                </p>

                {partError ? (
                  <p className="order-detail-page__alert" role="alert">
                    {partError}
                  </p>
                ) : null}

                <Button type="submit" disabled={partSaving}>
                  {partSaving ? 'Добавление...' : 'Списать на заказ'}
                </Button>
              </form>
            ) : null}

            {order.parts.length === 0 ? (
              <p className="order-detail-page__empty">Запчасти не добавлены</p>
            ) : (
              <div className="order-detail-page__table">
                <div className="order-detail-page__parts-header">
                  <span>Наименование</span>
                  <span>Кол-во</span>
                  <span>Закупка</span>
                  <span>Наценка</span>
                  <span>Цена клиента</span>
                  <span>Кто добавил</span>
                  <span>Дата</span>
                </div>
                <ul className="order-detail-page__parts-list">
                  {order.parts.map((part) => (
                    <li key={part.id} className="order-detail-page__parts-row">
                      <span title={part.partSku}>{part.partName}</span>
                      <span>{part.quantity}</span>
                      <span>
                        {part.purchasePrice === null
                          ? '—'
                          : formatPrice(part.purchasePrice)}
                      </span>
                      <span>{part.markup === null ? '—' : formatPrice(part.markup)}</span>
                      <span className="order-detail-page__parts-client-price">
                        {part.clientPrice === null
                          ? formatPrice(part.priceAtTime)
                          : formatPrice(part.clientPrice)}
                      </span>
                      <span>{part.addedByName ?? '—'}</span>
                      <span>{formatDate(part.createdAt)}</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </Card>

          {/* Работы (услуги) */}
          <Card className="order-detail-page__panel">
            <div className="order-detail-page__panel-head">
              <h2 className="order-detail-page__panel-title">
                Работы — {orderServices.length}
              </h2>
              {canManage ? (
                <Button
                  className="order-detail-page__small-button"
                  onClick={() => setServiceFormOpen((prev) => !prev)}
                >
                  {serviceFormOpen ? 'Скрыть форму' : '+ Добавить работу'}
                </Button>
              ) : null}
            </div>

            {serviceFormOpen && canManage ? (
              <form
                className="order-detail-page__part-form"
                onSubmit={handleAddService}
              >
                <label className="order-detail-page__field">
                  <span>Услуга из справочника</span>
                  <select
                    className="order-detail-page__input"
                    value={
                      serviceForm.serviceId ||
                      (serviceForm.title ? 'custom' : '')
                    }
                    onChange={handleServiceCatalogSelect}
                  >
                    <option value="">Выберите услугу...</option>
                    {servicesCatalog.map((service) => (
                      <option key={service.id} value={service.id}>
                        {service.name} — {formatPrice(service.price)}
                      </option>
                    ))}
                    <option value="custom">Другая работа (ввести вручную)</option>
                  </select>
                </label>

                <label className="order-detail-page__field">
                  <span>Название работы *</span>
                  <input
                    className="order-detail-page__input"
                    type="text"
                    name="title"
                    placeholder="Например: Замена разъёма зарядки"
                    value={serviceForm.title}
                    onChange={handleServiceFormChange}
                  />
                </label>

                <div className="order-detail-page__part-form-row">
                  <label className="order-detail-page__field">
                    <span>Стоимость, ₽ *</span>
                    <input
                      className="order-detail-page__input"
                      type="number"
                      name="price"
                      min="0"
                      step="0.01"
                      value={serviceForm.price}
                      onChange={handleServiceFormChange}
                    />
                  </label>

                  <label className="order-detail-page__field">
                    <span>Мастер-исполнитель</span>
                    <select
                      className="order-detail-page__input"
                      name="masterId"
                      value={serviceForm.masterId}
                      onChange={handleServiceFormChange}
                    >
                      <option value="">Не назначен</option>
                      {employees.map((employee) => (
                        <option key={employee.id} value={employee.id}>
                          {employee.fullName}
                        </option>
                      ))}
                    </select>
                  </label>

                  <label className="order-detail-page__field">
                    <span>Время, мин</span>
                    <input
                      className="order-detail-page__input"
                      type="number"
                      name="durationMinutes"
                      min="0"
                      step="5"
                      placeholder="60"
                      value={serviceForm.durationMinutes}
                      onChange={handleServiceFormChange}
                    />
                  </label>
                </div>

                {serviceError ? (
                  <p className="order-detail-page__alert" role="alert">
                    {serviceError}
                  </p>
                ) : null}

                <Button type="submit" disabled={serviceSaving}>
                  {serviceSaving ? 'Добавление...' : 'Добавить работу'}
                </Button>
              </form>
            ) : null}

            {orderServices.length === 0 ? (
              <p className="order-detail-page__empty">Работы не добавлены</p>
            ) : (
              <div className="order-detail-page__table">
                <div className="order-detail-page__parts-header order-detail-page__services-header">
                  <span>Название</span>
                  <span>Мастер</span>
                  <span>Время</span>
                  <span>Стоимость</span>
                  <span>Дата</span>
                </div>
                <ul className="order-detail-page__parts-list">
                  {orderServices.map((service) => (
                    <li
                      key={service.id}
                      className="order-detail-page__parts-row order-detail-page__services-row"
                    >
                      <span>{service.title}</span>
                      <span>{service.masterName ?? '—'}</span>
                      <span>
                        {service.durationMinutes
                          ? `${service.durationMinutes} мин`
                          : '—'}
                      </span>
                      <span className="order-detail-page__parts-client-price">
                        {formatPrice(service.price)}
                      </span>
                      <span>{formatDate(service.createdAt)}</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </Card>
        </div>

        {/* Правая колонка */}
        <div className="order-detail-page__column">
          {/* Согласование */}
          <Card className="order-detail-page__panel">
            <h2 className="order-detail-page__panel-title">Согласование</h2>

            <div className="order-detail-page__calculator">
              <div className="order-detail-page__calc-row">
                <span>Стоимость деталей</span>
                <span>{formatPrice(partsSum)}</span>
              </div>
              <div className="order-detail-page__calc-row">
                <span>Стоимость работ</span>
                <span>{formatPrice(worksSum)}</span>
              </div>
              <div className="order-detail-page__calc-row order-detail-page__calc-row--total">
                <span>Итого</span>
                <span>{formatPrice(order.price)}</span>
              </div>
            </div>

            <div className="order-detail-page__approval-status">
              <span className={`order-detail-page__approval-badge ${approval.cls}`}>
                {approval.label}
              </span>
            </div>

            {order.approvalStatus === 'rejected' && order.approvalComment ? (
              <p className="order-detail-page__approval-comment">
                Причина отказа: {order.approvalComment}
              </p>
            ) : null}

            {approvalError ? (
              <p className="order-detail-page__alert" role="alert">
                {approvalError}
              </p>
            ) : null}

            {canManage ? (
              <div className="order-detail-page__approval-actions">
                <Button
                  className="order-detail-page__small-button"
                  onClick={() => handleApproval('pending')}
                  disabled={approvalBusy || order.approvalStatus === 'pending'}
                >
                  Отправить клиенту
                </Button>
                <Button
                  className="order-detail-page__small-button"
                  onClick={() => handleApproval('approved')}
                  disabled={approvalBusy || order.approvalStatus === 'approved'}
                >
                  Клиент согласовал
                </Button>
                <Button
                  className="order-detail-page__small-button order-detail-page__small-button--danger"
                  onClick={() => setRejectOpen((prev) => !prev)}
                  disabled={approvalBusy}
                >
                  Клиент отказался
                </Button>
              </div>
            ) : null}

            {rejectOpen && canManage ? (
              <div className="order-detail-page__reject-box">
                <textarea
                  className="order-detail-page__textarea"
                  rows={2}
                  placeholder="Причина отказа (сообщение клиенту)..."
                  value={rejectComment}
                  onChange={(event) => setRejectComment(event.target.value)}
                />
                <Button
                  className="order-detail-page__small-button order-detail-page__small-button--danger"
                  onClick={() => handleApproval('rejected', rejectComment.trim() || null)}
                  disabled={approvalBusy}
                >
                  Подтвердить отказ
                </Button>
              </div>
            ) : null}
          </Card>


          {/* История (таймлайн) */}
          <Card className="order-detail-page__panel">
            <h2 className="order-detail-page__panel-title">История</h2>
            {order.history.length === 0 ? (
              <p className="order-detail-page__empty">Событий пока нет</p>
            ) : (
              <ol className="order-detail-page__timeline">
                {order.history.map((event) => (
                  <li key={event.id} className="order-detail-page__timeline-item">
                    <span
                      className="order-detail-page__timeline-icon"
                      aria-hidden="true"
                    >
                      {EVENT_ICONS[event.status] ?? '•'}
                    </span>
                    <div className="order-detail-page__timeline-body">
                      <span className="order-detail-page__timeline-time">
                        {formatDateTime(event.createdAt)}
                      </span>
                      <span className="order-detail-page__timeline-title">
                        {event.title ?? event.status}
                      </span>
                      {event.comment ? (
                        <span className="order-detail-page__timeline-comment">
                          {event.comment}
                        </span>
                      ) : null}
                      <span className="order-detail-page__timeline-author">
                        {event.authorAvatar ? (
                          <img
                            src={event.authorAvatar}
                            alt=""
                            className="order-detail-page__timeline-avatar"
                            loading="lazy"
                          />
                        ) : (
                          <span
                            className="order-detail-page__timeline-avatar order-detail-page__timeline-avatar--placeholder"
                            aria-hidden="true"
                          >
                            {(event.authorName ?? '?').charAt(0).toUpperCase()}
                          </span>
                        )}
                        {event.authorName ?? 'Система'}
                      </span>
                    </div>
                  </li>
                ))}
              </ol>
            )}
          </Card>
        </div>
      </div>

      {editModalOpen && canManage ? (
        <EditOrderModal
          order={order}
          onClose={() => setEditModalOpen(false)}
          onSaved={loadOrder}
        />
      ) : null}

      {/* Лайтбокс: предпросмотр фотографий */}
      {lightboxUrl ? (
        <div
          className="order-detail-page__lightbox"
          onClick={() => setLightboxUrl(null)}
          role="presentation"
        >
          <img
            src={lightboxUrl}
            alt="Предпросмотр фотографии"
            onClick={(event) => event.stopPropagation()}
          />
          <button
            type="button"
            className="order-detail-page__lightbox-close"
            onClick={() => setLightboxUrl(null)}
            aria-label="Закрыть предпросмотр"
          >
            ×
          </button>
        </div>
      ) : null}
    </div>
  )
}

export default OrderDetailPage

