import axios from 'axios';

import { clearToken, readToken } from './tokenStorage';

import type { ApiErrorBody } from '../types/api';
import type { AxiosError, InternalAxiosRequestConfig } from 'axios';

/**
 * HTTP istemcisi: base URL, otomatik `Authorization` header'i ve merkezi
 * 401 yonetimi.
 *
 * Backend'in sozlesmesi:
 *   - kimlik `Authorization: Bearer <token>` header'i ile tasinir (cookie yok)
 *   - her hata ayni govdede doner: { status, statusCode, message, details? }
 */

/**
 * Base URL `.env`den okunur, koda gomulmez: ayni derleme farkli ortamlarda
 * (local / staging / production) calisabilmeli. Vite yalnizca `VITE_` onekli
 * degiskenleri istemciye acar.
 */
const baseURL = import.meta.env.VITE_API_URL ?? 'http://localhost:3000';

export const api = axios.create({
  baseURL,
  headers: { 'Content-Type': 'application/json' },
});

/* ------------------------------------------------------------ istek tarafi */

/**
 * Her istege token eklenir. Interceptor tercih edildi cunku alternatif —
 * her cagri yerinde header'i elle kurmak — bir gun birinin unutulmasi demekti;
 * unutuldugunda da hata "401" olarak degil "veri gelmedi" olarak gorunurdu.
 */
api.interceptors.request.use((config: InternalAxiosRequestConfig) => {
  const token = readToken();

  if (token) {
    config.headers.set('Authorization', `Bearer ${token}`);
  }

  return config;
});

/* ------------------------------------------------------------ cevap tarafi */

/**
 * Oturum dustugunde haberdar edilecek dinleyici. `AuthContext` mount olurken
 * kendini kaydeder.
 *
 * Neden `window.location.href = '/login'` degil: tam sayfa yenilemesi React
 * agacini bastan kurar, uygulama durumunu ve yonlendirme gecmisini kaybeder.
 * Bunun yerine context durumu `anonymous`a cekilir; yonlendirmeyi zaten
 * `ProtectedRoute` yapar ve kullanicinin bulundugu adres `state.from` ile
 * korunur.
 */
type UnauthorizedListener = () => void;

let onUnauthorized: UnauthorizedListener | null = null;

export const setUnauthorizedHandler = (listener: UnauthorizedListener | null): void => {
  onUnauthorized = listener;
};

/**
 * Kimlik uc noktalarindan gelen 401 **oturum dusmesi degildir**: "e-posta veya
 * sifre hatali" demektir. Bunlari global logout'tan muaf tutmazsak, yanlis
 * sifre giren kullanici formda hata gormek yerine sessizce login sayfasina
 * yeniden yonlendirilirdi.
 */
const AUTH_ENDPOINTS = ['/auth/login', '/auth/register'];

const isAuthEndpoint = (url?: string): boolean =>
  !!url && AUTH_ENDPOINTS.some((endpoint) => url.endsWith(endpoint));

api.interceptors.response.use(
  (response) => response,
  (error: AxiosError<ApiErrorBody>) => {
    const status = error.response?.status;

    if (status === 401 && !isAuthEndpoint(error.config?.url)) {
      // Token gecersiz ya da suresi dolmus: elde tutmanin faydasi yok.
      clearToken();
      onUnauthorized?.();
    }

    return Promise.reject(error);
  }
);

/* ------------------------------------------------------------ hata okuma */

/**
 * Backend hata govdesinden gosterilebilir bir mesaj cikarir. Ag hatasinda
 * (`error.response` yok) sunucudan mesaj gelmez; o durumu ayirmak onemli,
 * cunku kullaniciya "sunucuya ulasilamiyor" demek "sifre yanlis" demekten
 * farkli bir eylem gerektirir.
 */
export const getErrorMessage = (error: unknown, fallback = 'Beklenmeyen bir hata olustu'): string => {
  if (axios.isAxiosError<ApiErrorBody>(error)) {
    if (!error.response) {
      return 'Sunucuya ulasilamiyor. Baglantinizi kontrol edin.';
    }

    return error.response.data?.message ?? fallback;
  }

  return fallback;
};

/** Alan bazli validasyon hatalari (`details`) — form altlarinda gosterilir. */
export const getErrorDetails = (error: unknown): Record<string, string> => {
  if (axios.isAxiosError<ApiErrorBody>(error)) {
    const details = error.response?.data?.details;

    if (details && typeof details === 'object' && !Array.isArray(details)) {
      return details as Record<string, string>;
    }
  }

  return {};
};

export default api;
