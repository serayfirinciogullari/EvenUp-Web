import messageService from '../services/message.service';
import ApiError from '../utils/ApiError';

import type { Request, Response } from 'express';

/**
 * Grup sohbeti uc noktalari. Grup/harcama controller'lari ile ayni kural: bu
 * katmanda **yetki karari yok**. Her fonksiyon `req.user.id`'yi servise gecirir,
 * uyelik kontrolunu servis yapar.
 */

const currentUserId = (req: Request): string => {
  if (!req.user) {
    throw ApiError.unauthorized('Kimlik dogrulamasi gerekli');
  }
  return req.user.id;
};

/** POST /groups/:id/messages -> 201 { messages } (kullanici mesaji + AI cevabi) */
const create = async (req: Request, res: Response): Promise<void> => {
  const result = await messageService.postMessage(
    req.params.id,
    currentUserId(req),
    req.body ?? {}
  );
  res.status(201).json(result);
};

/** GET /groups/:id/messages?page=&limit= -> 200 { messages, pagination } */
const listByGroup = async (req: Request, res: Response): Promise<void> => {
  const result = await messageService.listMessages(req.params.id, currentUserId(req), req.query);
  res.status(200).json(result);
};

export default { create, listByGroup };
