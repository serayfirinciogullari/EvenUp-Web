import authService from '../services/auth.service';
import userModel from '../models/user.model';
import ApiError from '../utils/ApiError';

import type { Request, Response } from 'express';

/**
 * POST /auth/register -> 201 { user, token, expiresIn }
 */
const register = async (req: Request, res: Response): Promise<void> => {
  const result = await authService.register(req.body);
  res.status(201).json(result);
};

/**
 * POST /auth/login -> 200 { user, token, expiresIn }
 */
const login = async (req: Request, res: Response): Promise<void> => {
  const result = await authService.login(req.body);
  res.status(200).json(result);
};

/**
 * GET /auth/me -> 200 { user }  (requireAuth)
 */
const getMe = async (req: Request, res: Response): Promise<void> => {
  if (!req.user) {
    throw ApiError.unauthorized('Kimlik dogrulamasi gerekli');
  }

  const user = await authService.getProfile(req.user.id);
  res.status(200).json({ user });
};

/**
 * GET /auth/users -> 200 { users }  (requireAuth + requireAdmin)
 */
const listUsers = async (req: Request, res: Response): Promise<void> => {
  const users = await userModel.listPublic();
  res.status(200).json({ users });
};

export default { register, login, getMe, listUsers };
