# LovinTech CRM — Система управления сервисным центром

Дипломный проект: CRM-система сервисного центра — приёмка устройств, учёт клиентов, управление заказами на ремонт и аналитика. SPA на React работает напрямую с Supabase (managed PostgreSQL) через `@supabase/supabase-js`.

## Стек технологий

- **React + Vite** — SPA с клиентской маршрутизацией (`react-router-dom`), HMR при разработке;
- **Supabase** — PostgreSQL, Auth (email/пароль), Row Level Security;
- **CSS Variables / Design System** — тема на CSS-переменных (`src/index.css`): цвета, радиусы, шрифты; все компоненты стилизованы только через токены.

## Архитектура данных

Схема 1:N (миграция `supabase/migrations/20240101000000_create_crm_schema.sql`):

```
clients (1) ───< devices (1) ───< orders
    │                               ↑
    └───────────< orders ───────────┘
```

| Таблица | Назначение | Ключевые поля |
|---|---|---|
| `clients` | Клиенты сервис-центра | `id uuid PK`, `name text NOT NULL`, `phone text NOT NULL`, `created_at timestamptz` |
| `devices` | Устройства клиентов | `id uuid PK`, `client_id uuid FK → clients ON DELETE CASCADE`, `brand`, `model`, `serial_number` |
| `orders` | Заказы на ремонт | `id uuid PK`, `client_id uuid FK → clients`, `device_id uuid FK → devices`, `order_number`, `status`, `price`, `defect`, `accepted_at` |

Связи:

- `clients 1 — N devices` — у одного клиента несколько устройств;
- `clients 1 — N orders` — заказы клиента;
- `devices 1 — N orders` — заказы по конкретному устройству.

Слой данных (`src/data/orders.js`, `src/data/clients.js`) инкапсулирует запросы и возвращает плоские DTO: `getOrders()` использует вложенную выборку `.select('*, clients(*), devices(*)')`, `getClients()` — `.select('*, devices(*), orders(*)')` с подсчётом устройств и заказов. Форматирование (даты, цены) вынесено в утилиты `src/lib/format.js` и выполняется только на уровне представления.

## Безопасность

- **Row Level Security** включена для таблиц `clients` и `devices`;
- политики доступа созданы как `for all using (true) with check (true)` — на этапе разработки доступ открыт (в т.ч. для роли `anon`); **для продакшена** политики следует ограничить ролью `authenticated` и включить RLS для `orders`;
- авторизация: `supabase.auth.signInWithPassword`, восстановление сессии через `getSession()` и подписка `onAuthStateChange()`; неавторизованный доступ к UI блокирует `ProtectedRoute`;
- ключи хранятся в переменных окружения (`.env` / `.env.local`, исключены из git через `.gitignore`):
  - `VITE_SUPABASE_URL` — адрес проекта Supabase;
  - `VITE_SUPABASE_ANON_KEY` — публичный anon-ключ (участвует в клиентском бандле по дизайну Supabase; `service_role` ключ на фронтенде использовать нельзя).

## Основные возможности

- **Авторизация** — вход по email/паролю, защищённые маршруты, кнопка «Выйти» в шапке;
- **Дашборд с аналитикой** — метрики «Всего заказов», «В работе», «Завершено», «Выручка», рассчитываемые на лету из `getOrders()`, виджет активных заказов с фильтрами;
- **Управление заказами** (`/orders`) — таблица с поиском по номеру/клиенту/устройству, чипсы-фильтры по статусам, инлайн-смена статуса через кастомный `StatusDropdown` (выпадающее меню с цветными бейджами, закрытие по клику вне/Escape), создание заказа в модальной форме (единая транзакция из трёх INSERT: клиент → устройство → заказ);
- **Управление клиентской базой** (`/clients`) — список клиентов из Supabase, поиск по имени и телефону, количество устройств и заказов по каждому клиенту.

## Запуск проекта

```bash
npm install
# создать .env.local в корне проекта:
#   VITE_SUPABASE_URL=https://<project-ref>.supabase.co
#   VITE_SUPABASE_ANON_KEY=<anon-key>
npm run dev
```

Применение схемы БД: выполните SQL из `supabase/migrations/20240101000000_create_crm_schema.sql` в SQL Editor Supabase Dashboard (или `supabase db push` при установленном Supabase CLI).

Продакшен-сборка и предпросмотр:

```bash
npm run build
npm run preview
```

## Структура проекта

```
src/
├── components/
│   ├── auth/ProtectedRoute.jsx   # гард маршрутов
│   ├── dashboard/                # DashboardStats, ActiveOrders
│   ├── layout/                   # AppLayout, Header (кнопка «Выйти»)
│   ├── modals/CreateOrderModal/  # форма создания заказа
│   ├── pages/…                   # LoginPage
│   └── ui/                       # Button, Card, StatCard, OrderItem, StatusDropdown
├── data/                         # слой данных: orders.js, clients.js
├── lib/                          # supabase.js, auth.js, AuthContext, format.js
└── pages/                        # HomePage, OrdersPage, ClientsPage, LoginPage
```
