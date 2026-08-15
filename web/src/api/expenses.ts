import api from './client';

import type { SplitDetails } from '../utils/split';
import type { Expense, ExpenseListResult, ExpenseSplitType } from '../types/models';

/**
 * Harcama uc noktalari. `api/groups.ts` ile ayni desen: bilesenler axios'u
 * dogrudan cagirmaz, adres ve govde bicimi tek yerde durur.
 *
 * Adresler backend'in bolunmesini aynen yansitiyor: **liste ve olusturma** grup
 * baglaminda anlamli oldugu icin `/groups/:id/expenses` altinda, tek bir harcama
 * uzerindeki islemler `/expenses/:id` altinda (bkz. src/routes/expense.routes.ts).
 */

export interface CreateExpenseInput {
  /** NUMERIC metni ("125.50"). Kurus -> metin cevrimi `utils/money`de. */
  amount: string;
  description: string;
  category?: string;
  /** Verilmezse backend istegi yapan kisiyi odeyen kabul eder. */
  paidBy?: string;
  splitType: ExpenseSplitType;
  splitDetails: SplitDetails;
}

export interface ListExpensesQuery {
  page?: number;
  limit?: number;
}

/** `GET /groups/:id/expenses` — sayfalanmis; `pagination` ile birlikte doner. */
export const listExpenses = async (
  groupId: string,
  query: ListExpensesQuery = {}
): Promise<ExpenseListResult> => {
  const { data } = await api.get<ExpenseListResult>(`/groups/${groupId}/expenses`, {
    params: query,
  });
  return data;
};

/** `POST /groups/:id/expenses` — 201 { expense }. */
export const createExpense = async (
  groupId: string,
  input: CreateExpenseInput
): Promise<Expense> => {
  const { data } = await api.post<{ expense: Expense }>(`/groups/${groupId}/expenses`, input);
  return data.expense;
};

export default { listExpenses, createExpense };
