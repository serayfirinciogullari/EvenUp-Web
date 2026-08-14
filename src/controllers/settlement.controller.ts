import balanceService from '../services/balance.service';
import settlementService from '../services/settlement.service';
import ApiError from '../utils/ApiError';

import type { Request, Response } from 'express';

/**
 * Odeme ve bakiye uc noktalari. Diger controller'lar gibi bu katmanda
 * **yetki karari yok**: her fonksiyon `req.user.id`'yi servise gecirir,
 * uyelik ve taraf kontrolunu servis yapar.
 *
 * `balances` burada duruyor cunku controller yalnizca HTTP cevirisi yapar;
 * hesabin kendisi `balance.service` icinde.
 */

const currentUserId = (req: Request): string => {
  if (!req.user) {
    throw ApiError.unauthorized('Kimlik dogrulamasi gerekli');
  }
  return req.user.id;
};

/** POST /groups/:id/settlements -> 201 { settlement } */
const create = async (req: Request, res: Response): Promise<void> => {
  const settlement = await settlementService.createSettlement(
    req.params.id,
    currentUserId(req),
    req.body ?? {}
  );
  res.status(201).json({ settlement });
};

/** PUT /settlements/:id/confirm -> 200 { settlement } */
const confirm = async (req: Request, res: Response): Promise<void> => {
  const settlement = await settlementService.confirmSettlement(req.params.id, currentUserId(req));
  res.status(200).json({ settlement });
};

/** PUT /settlements/:id/reject -> 200 { settlement } */
const reject = async (req: Request, res: Response): Promise<void> => {
  const settlement = await settlementService.rejectSettlement(req.params.id, currentUserId(req));
  res.status(200).json({ settlement });
};

/** GET /groups/:id/balances -> 200 { balances, transfers, meta } */
const balances = async (req: Request, res: Response): Promise<void> => {
  const result = await balanceService.getGroupBalances(req.params.id, currentUserId(req));
  res.status(200).json(result);
};

export default { create, confirm, reject, balances };
