import type { User } from './models';

/**
 * Backend'in zarf (envelope) bicimleri.
 *
 * Merkezi hata yoneticisi (`src/middlewares/errorHandler.middleware.ts`) her
 * hatayi ayni sekilde donuyor; frontend de tek bir yerden okuyabilsin diye
 * bicim burada tiplenir.
 */

/** `POST /auth/login` ve `/auth/register` cevabi. */
export interface AuthResult {
  user: User;
  token: string;
  /** Ornek: "7d". Sure metni; istemci bunu yorumlamak zorunda degil. */
  expiresIn: string;
}

/** Backend'in her hatada dondugu govde. */
export interface ApiErrorBody {
  status: 'error';
  statusCode: number;
  message: string;
  /** Alan bazli validasyon hatalari: `{ email: "E-posta zorunlu" }`. */
  details?: Record<string, string> | unknown;
  /** Yalnizca development ortaminda gelir. */
  stack?: string;
}

export interface Pagination {
  page: number;
  limit: number;
  total: number;
  total_pages: number;
  has_next: boolean;
  has_previous: boolean;
}

export interface Paginated<T> {
  pagination: Pagination;
  items: T[];
}
