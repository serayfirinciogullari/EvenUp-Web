import adminService from '../services/admin.service';
import ApiError from '../utils/ApiError';

import type { Request, Response } from 'express';

/**
 * Admin uc noktalari. Rol kontrolu router seviyesinde takili oldugu icin bu
 * katmanda yalnizca HTTP cevirisi var.
 */

const currentUserId = (req: Request): string => {
  if (!req.user) {
    throw ApiError.unauthorized('Kimlik dogrulamasi gerekli');
  }
  return req.user.id;
};

/** GET /admin/users -> 200 { users, pagination } */
const listUsers = async (req: Request, res: Response): Promise<void> => {
  const result = await adminService.listUsers(req.query);
  res.status(200).json(result);
};

/** PUT /admin/users/:id/disable -> 200 { user, changed } */
const disableUser = async (req: Request, res: Response): Promise<void> => {
  const result = await adminService.setUserActive(req.params.id, currentUserId(req), false);
  res.status(200).json(result);
};

/** PUT /admin/users/:id/enable -> 200 { user, changed } */
const enableUser = async (req: Request, res: Response): Promise<void> => {
  const result = await adminService.setUserActive(req.params.id, currentUserId(req), true);
  res.status(200).json(result);
};

/** GET /admin/groups -> 200 { groups, pagination } — yalnizca ust veri */
const listGroups = async (req: Request, res: Response): Promise<void> => {
  const result = await adminService.listGroups(req.query);
  res.status(200).json(result);
};

/** GET /admin/stats -> 200 { ...toplamlar } */
const stats = async (_req: Request, res: Response): Promise<void> => {
  res.status(200).json(await adminService.getStats());
};

export default { listUsers, disableUser, enableUser, listGroups, stats };
