import expenseService from '../services/expense.service';
import ApiError from '../utils/ApiError';

import type { Request, Response } from 'express';

/**
 * Harcama uc noktalari. Grup controller'i ile ayni kural: bu katmanda
 * **yetki karari yok**. Her fonksiyon `req.user.id`'yi servise gecirir,
 * uyelik/duzenleme kontrolunu servis yapar.
 */

const currentUserId = (req: Request): string => {
  if (!req.user) {
    throw ApiError.unauthorized('Kimlik dogrulamasi gerekli');
  }
  return req.user.id;
};

/** POST /groups/:id/expenses -> 201 { expense } */
const create = async (req: Request, res: Response): Promise<void> => {
  const expense = await expenseService.createExpense(
    req.params.id,
    currentUserId(req),
    req.body ?? {}
  );
  res.status(201).json({ expense });
};

/** GET /groups/:id/expenses?page=&limit= -> 200 { expenses, pagination } */
const listByGroup = async (req: Request, res: Response): Promise<void> => {
  const result = await expenseService.listExpenses(req.params.id, currentUserId(req), req.query);
  res.status(200).json(result);
};

/** GET /expenses/:id -> 200 { expense } (grubun her uyesi) */
const detail = async (req: Request, res: Response): Promise<void> => {
  const expense = await expenseService.getExpense(req.params.id, currentUserId(req));
  res.status(200).json({ expense });
};

/** PUT /expenses/:id -> 200 { expense } (ekleyen ya da grup sahibi) */
const update = async (req: Request, res: Response): Promise<void> => {
  const expense = await expenseService.updateExpense(
    req.params.id,
    currentUserId(req),
    req.body ?? {}
  );
  res.status(200).json({ expense });
};

/** DELETE /expenses/:id -> 200 { expense } (soft delete) */
const remove = async (req: Request, res: Response): Promise<void> => {
  const expense = await expenseService.deleteExpense(req.params.id, currentUserId(req));
  res.status(200).json({ expense });
};

export default { create, listByGroup, detail, update, remove };
