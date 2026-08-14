import adminModel from '../models/admin.model';
import userModel from '../models/user.model';
import ApiError from '../utils/ApiError';
import { buildPagination, parsePagination } from '../utils/pagination';
import { isUuid } from '../utils/uuid';

import type { AdminStats, GroupMetaView } from '../models/admin.model';
import type { PublicUser } from '../models/user.model';
import type { PageQuery, Pagination } from '../utils/pagination';

/**
 * Admin paneli is mantigi.
 *
 * YETKI
 * -----
 * Rol kontrolu burada degil, router seviyesinde (`admin.routes.ts`):
 * `router.use(requireAuth, requireAdmin)`. Tek tek fonksiyonlarda kontrol
 * etmek, yeni bir uc nokta eklenirken unutulabilecek bir adim olurdu.
 *
 * GIZLILIK
 * --------
 * Bu servis harcama verisine erisen bir model fonksiyonu **cagirmaz**:
 * `expense.model` ve `settlement.model` buraya import bile edilmemistir.
 * Grup/istatistik sorgulari `admin.model` icinde ve yalnizca ust veri ya da
 * toplam donuyor. Gerekce docs/decisions/1.8.md icinde.
 */

const MAX_SEARCH_LENGTH = 120;

/** Kendi hesabini kapatmaya calisan admin'e donen mesaj. */
const SELF_DISABLE =
  'Kendi hesabinizi devre disi birakamazsiniz; baska bir admin bu islemi yapmali';

/* ---------------------------------------------------------------- tipler */

export interface UserListQuery extends PageQuery {
  search?: unknown;
  status?: unknown;
  role?: unknown;
}

export interface UserListResult {
  users: PublicUser[];
  pagination: Pagination;
}

export interface GroupListQuery extends PageQuery {
  search?: unknown;
}

export interface GroupListResult {
  groups: GroupMetaView[];
  pagination: Pagination;
}

/* ----------------------------------------------------------- validasyon */

/**
 * Arama terimi. Uzunluk siniri var: sinirsiz uzun bir terim ILIKE taramasini
 * gereksiz pahalilastirir. Bos/bosluk terim filtre uygulanmamis sayilir.
 */
const parseSearch = (value: unknown): string | undefined => {
  if (value === undefined || value === null) {
    return undefined;
  }

  if (typeof value !== 'string') {
    throw ApiError.badRequest('Gecersiz arama terimi', { search: 'search metin olmali' });
  }

  const search = value.trim();

  if (!search) {
    return undefined;
  }

  if (search.length > MAX_SEARCH_LENGTH) {
    throw ApiError.badRequest('Gecersiz arama terimi', {
      search: `search en fazla ${MAX_SEARCH_LENGTH} karakter olabilir`,
    });
  }

  return search;
};

/** `?status=active|inactive` -> boolean filtre. */
const parseStatus = (value: unknown): boolean | undefined => {
  if (value === undefined || value === null || value === '') {
    return undefined;
  }

  if (value === 'active') {
    return true;
  }

  if (value === 'inactive') {
    return false;
  }

  throw ApiError.badRequest('Gecersiz durum filtresi', {
    status: "status 'active' ya da 'inactive' olmali",
  });
};

const parseRole = (value: unknown): 'admin' | 'user' | undefined => {
  if (value === undefined || value === null || value === '') {
    return undefined;
  }

  if (value === 'admin' || value === 'user') {
    return value;
  }

  throw ApiError.badRequest('Gecersiz rol filtresi', {
    role: "role 'admin' ya da 'user' olmali",
  });
};

/* -------------------------------------------------------------- islemler */

/** GET /admin/users?search=&status=&role=&page=&limit= */
const listUsers = async (query: UserListQuery = {}): Promise<UserListResult> => {
  const page = parsePagination(query);

  const { users, total } = await adminModel.listUsers({
    ...page,
    search: parseSearch(query.search),
    isActive: parseStatus(query.status),
    role: parseRole(query.role),
  });

  return { users, pagination: buildPagination(page, total) };
};

/**
 * Durum degistirme. Onceki 1.4/1.5 uc noktalarindan farkli olarak burada
 * "varlik sizintisi" kaygisi yok: admin zaten tum kullanicilari listeleyebiliyor,
 * dolayisiyla olmayan kullanici icin durustce 404 donulur.
 */
const setUserActive = async (
  targetUserId: string,
  actingUserId: string,
  isActive: boolean
): Promise<{ user: PublicUser; changed: boolean }> => {
  if (!isUuid(targetUserId)) {
    throw ApiError.notFound('Kullanici bulunamadi');
  }

  // Admin kendini kapatirsa panele bir daha giremez; login de engellendigi icin
  // kurtarilmasi ancak DB'den elle mudahaleyle mumkun olurdu. 1.4'teki
  // "owner kendini gruptan cikaramaz" kuraliyla ayni gerekce.
  if (!isActive && targetUserId === actingUserId) {
    throw ApiError.badRequest(SELF_DISABLE);
  }

  const existing = await userModel.findPublicById(targetUserId);

  if (!existing) {
    throw ApiError.notFound('Kullanici bulunamadi');
  }

  // Zaten istenen durumdaysa yeniden yazmaya gerek yok; islem idempotent.
  if (existing.is_active === isActive) {
    return { user: existing, changed: false };
  }

  const updated = await userModel.setActive(targetUserId, isActive);

  if (!updated) {
    throw ApiError.notFound('Kullanici bulunamadi');
  }

  return { user: updated, changed: true };
};

/** GET /admin/groups?search=&page=&limit= — yalnizca ust veri. */
const listGroups = async (query: GroupListQuery = {}): Promise<GroupListResult> => {
  const page = parsePagination(query);
  const { groups, total } = await adminModel.listGroupMeta(page, parseSearch(query.search));

  return { groups, pagination: buildPagination(page, total) };
};

/** GET /admin/stats — yalnizca toplamlar. */
const getStats = async (): Promise<AdminStats> => adminModel.collectStats();

export default { listUsers, setUserActive, listGroups, getStats };

export { listUsers, setUserActive, listGroups, getStats, SELF_DISABLE };
