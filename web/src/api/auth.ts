import api from './client';

import type { AuthResult } from '../types/api';
import type { User } from '../types/models';

/**
 * Kimlik uc noktalari. Bilesenler axios'u dogrudan cagirmaz; boylece adres ve
 * govde bicimi tek yerde durur.
 */

export interface LoginInput {
  email: string;
  password: string;
}

export interface RegisterInput extends LoginInput {
  name: string;
}

export const login = async (input: LoginInput): Promise<AuthResult> => {
  const { data } = await api.post<AuthResult>('/auth/login', input);
  return data;
};

/**
 * `role` bilerek gonderilmiyor: backend zaten istemciden gelen rolu yok sayar
 * (bkz. docs/decisions/1.3.md), gondermek yanlis bir beklenti yaratirdi.
 */
export const register = async (input: RegisterInput): Promise<AuthResult> => {
  const { data } = await api.post<AuthResult>('/auth/register', input);
  return data;
};

/**
 * Elde token varken kullanicinin kim oldugunu sorar. Uygulama acilisinda
 * cagrilir: token'in hala gecerli olup olmadigini anlamanin tek dogru yolu
 * sunucuya sormaktir (JWT istemcide "gecerli mi" diye guvenilir sekilde
 * kontrol edilemez — imza dogrulamasi sunucuda).
 */
export const getMe = async (): Promise<User> => {
  const { data } = await api.get<{ user: User }>('/auth/me');
  return data.user;
};

export default { login, register, getMe };
