import groupService from '../services/group.service';
import ApiError from '../utils/ApiError';

import type { Request, Response } from 'express';

/**
 * Grup uc noktalari. Bu katmanda **yetki karari yok**: her fonksiyon
 * `req.user.id`'yi servise gecirir, erisim kontrolunu servis yapar.
 * Boylece bir controller'i yazarken kontrolu unutmak mumkun olmaz.
 */

/** requireAuth'tan sonra `req.user` dolu olmali; degilse route yanlis kurulmus. */
const currentUserId = (req: Request): string => {
  if (!req.user) {
    throw ApiError.unauthorized('Kimlik dogrulamasi gerekli');
  }
  return req.user.id;
};

/**
 * POST /groups -> 201 { group }
 * Olusturan kullanici otomatik olarak 'owner' rolüyle uye yazilir.
 */
const create = async (req: Request, res: Response): Promise<void> => {
  const group = await groupService.createGroup(currentUserId(req), req.body);
  res.status(201).json({ group });
};

/** GET /groups -> 200 { groups } — sadece kullanicinin uyesi oldugu gruplar */
const list = async (req: Request, res: Response): Promise<void> => {
  const groups = await groupService.listGroups(currentUserId(req));
  res.status(200).json({ groups });
};

/** GET /groups/:id -> 200 { group, role, members } | 403 (uye degilse) */
const detail = async (req: Request, res: Response): Promise<void> => {
  const result = await groupService.getGroup(req.params.id, currentUserId(req));
  res.status(200).json(result);
};

/**
 * POST /groups/:id/invite -> 201 { invite, rotated: true }  (yeni kod)
 *                         -> 200 { invite, rotated: false } (mevcut aktif kod)
 */
const invite = async (req: Request, res: Response): Promise<void> => {
  const result = await groupService.createInvite(req.params.id, currentUserId(req), req.body ?? {});
  res.status(result.rotated ? 201 : 200).json(result);
};

/**
 * POST /groups/join/:inviteCode -> 200 { group, already_member }
 * Zaten uye olmak hata degil: linke ikinci kez tiklamak bekleniyor bir durum.
 */
const join = async (req: Request, res: Response): Promise<void> => {
  const result = await groupService.joinByCode(req.params.inviteCode, currentUserId(req));
  res.status(200).json(result);
};

/** DELETE /groups/:id/members/:userId -> 200 { removed_user_id } (sadece owner) */
const removeMember = async (req: Request, res: Response): Promise<void> => {
  const result = await groupService.removeMember(
    req.params.id,
    currentUserId(req),
    req.params.userId
  );
  res.status(200).json(result);
};

/** DELETE /groups/:id -> 200 { group } (sadece owner, soft delete) */
const remove = async (req: Request, res: Response): Promise<void> => {
  const group = await groupService.deleteGroup(req.params.id, currentUserId(req));
  res.status(200).json({ group });
};

export default { create, list, detail, invite, join, removeMember, remove };
