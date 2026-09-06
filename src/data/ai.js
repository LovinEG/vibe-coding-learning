import { supabase } from '../lib/supabase'
import { getParts } from './inventory'
import { getTasks } from './tasks'
import { getCashRegisters } from './cashRegisters'

// Агрегация бизнес-контекста для AI-ассистента.
// Параллельно собирает сводные метрики: объём продаж за 30 дней,
// остатки на складе с критическим запасом, текущие невыполненные задачи,
// кассовые балансы.
export async function getAiContext() {
  const thirtyDaysAgo = new Date()
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30)
  const thirtyDaysAgoIso = thirtyDaysAgo.toISOString()

  const [parts, tasks, cashRegisters, recentPayments] = await Promise.all([
    getParts(),
    getTasks(),
    getCashRegisters(),
    getRecentPayments(thirtyDaysAgoIso),
  ])

  // Складской резерв: запчасти с критическим запасом (totalStock <= minStock).
  const criticalStock = parts.filter(
    (part) => part.minStock > 0 && part.totalStock <= part.minStock,
  )

  // Невыполненные задачи (статус не done/cancelled).
  const openTasks = tasks.filter(
    (task) => task.status !== 'done' && task.status !== 'cancelled',
  )

  // Просроченные задачи (dueDate < сегодня и не выполнены).
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  const overdueTasks = openTasks.filter(
    (task) => task.dueDate && new Date(task.dueDate) < today,
  )

  // Финансовые метрики за 30 дней.
  const totalRevenue = recentPayments
    .filter((p) => p.type === 'income')
    .reduce((sum, p) => sum + p.amount, 0)

  const totalExpenses = recentPayments
    .filter((p) => p.type === 'expense')
    .reduce((sum, p) => sum + p.amount, 0)

  // Общий баланс касс.
  const totalCashBalance = cashRegisters.reduce(
    (sum, register) => sum + register.balance,
    0,
  )

  return {
    revenue: {
      period: '30 дней',
      totalIncome: totalRevenue,
      totalExpenses: totalExpenses,
      netFlow: totalRevenue - totalExpenses,
      operationsCount: recentPayments.length,
    },
    inventory: {
      totalParts: parts.length,
      criticalStockCount: criticalStock.length,
      criticalStock: criticalStock.map((part) => ({
        id: part.id,
        name: part.name,
        sku: part.sku,
        currentStock: part.totalStock,
        minStock: part.minStock,
      })),
    },
    tasks: {
      totalOpen: openTasks.length,
      overdue: overdueTasks.length,
      overdueList: overdueTasks.slice(0, 5).map((task) => ({
        id: task.id,
        title: task.title,
        assignee: task.assigneeName ?? '—',
        dueDate: task.dueDate,
      })),
    },
    cash: {
      totalBalance: totalCashBalance,
      registersCount: cashRegisters.length,
      registers: cashRegisters.map((register) => ({
        id: register.id,
        name: register.name,
        balance: register.balance,
        isActive: register.isActive,
      })),
    },
  }
}

// Вспомогательная функция: платежи за последние N дней.
async function getRecentPayments(sinceIso) {
  const { data, error } = await supabase
    .from('payments')
    .select('id, type, amount, created_at')
    .gte('created_at', sinceIso)
    .order('created_at', { ascending: false })

  if (error) {
    throw error
  }

  return (data ?? []).map((row) => ({
    id: row.id,
    type: row.type,
    amount: Number(row.amount) || 0,
    createdAt: row.created_at,
  }))
}

// Подготавливает структуру под интеграцию с LLM API или Supabase Edge Function.
// Сейчас возвращает имитированный ответ с контекстом.
export async function sendAiQuery(prompt, history = []) {
  // В будущем здесь будет вызов LLM API или Supabase Edge Function.
  // history сохраняется для будущей интеграции с контекстом диалога.
  void history
  // Пример структуры для интеграции:
  // const { data, error } = await supabase.functions.invoke('ai-assistant', {
  //   body: { prompt, history },
  // })

  // Имитация задержки для демонстрации UI.
  await new Promise((resolve) => setTimeout(resolve, 800))

  // Формируем ответ на основе ключевых слов промпта.
  const lowerPrompt = prompt.toLowerCase()

  if (lowerPrompt.includes('финансовый отчёт') || lowerPrompt.includes('финанс')) {
    return {
      role: 'assistant',
      content:
        'Для формирования финансового отчёта мне нужен доступ к актуальным данным касс и платежей. Убедитесь, что у вас настроены кассовые операции.',
    }
  }

  if (lowerPrompt.includes('дефицит') || lowerPrompt.includes('запчаст')) {
    return {
      role: 'assistant',
      content:
        'Анализ складских остатков покажет запчасти с критическим запасом. Рекомендую проверить раздел «Запчасти» для заказа у поставщиков.',
    }
  }

  if (lowerPrompt.includes('просрочен') || lowerPrompt.includes('задач')) {
    return {
      role: 'assistant',
      content:
        'Для просмотра просроченных задач перейдите в раздел «Задачи». Там отображаются все невыполненные задачи с прошедшим дедлайном.',
    }
  }

  if (lowerPrompt.includes('топ клиентов') || lowerPrompt.includes('клиент')) {
    return {
      role: 'assistant',
      content:
        'Анализ топ клиентов будет доступен после накопления данных по заказам и платежам. Рекомендую вести учёт всех операций.',
    }
  }

  return {
    role: 'assistant',
    content:
      'Я AI-ассистент LovinTech CRM. Я могу помочь с анализом финансов, складских остатков, задач и клиентов. Используйте быстрые промпты слева или задайте вопрос в свободной форме.',
  }
}

// Пресеты быстрых промптов для генерации типовых запросов.
export const AI_PROMPT_PRESETS = [
  {
    id: 'financial-report',
    label: 'Финансовый отчёт',
    icon: '💰',
    prompt: 'Сформируй финансовый отчёт за последние 30 дней: выручка, расходы, чистый поток.',
  },
  {
    id: 'stock-deficit',
    label: 'Дефицит запчастей',
    icon: '📦',
    prompt: 'Покажи запчасти с критическим запасом, которые нужно заказать.',
  },
  {
    id: 'overdue-tasks',
    label: 'Просроченные задачи',
    icon: '⏰',
    prompt: 'Какие задачи просрочены? Покажи список с исполнителями и дедлайнами.',
  },
  {
    id: 'top-clients',
    label: 'Топ клиентов',
    icon: '👥',
    prompt: 'Покажи топ клиентов по объёму заказов и платежей.',
  },
]

