import ApiError from './ApiError';

/**
 * Sayfalama parametrelerinin **tek kapisi**.
 *
 * 1.5'te harcama listesi icin yazilan mantik 1.8'de admin listelerinde de
 * gerektigi icin buraya tasindi: ust sinirin ve hata mesajlarinin iki ayri
 * serviste kopyalanmasi, birinde sinir degisince digerinin sessizce geride
 * kalmasi demekti.
 *
 * Ust sinir zorunlu: `limit=100000` gonderen tek bir istek tum tabloyu bellege
 * alirdi.
 */

export const DEFAULT_PAGE_SIZE = 20;
export const MAX_PAGE_SIZE = 100;

export interface PageQuery {
  page?: unknown;
  limit?: unknown;
}

export interface PageParams {
  page: number;
  limit: number;
  offset: number;
}

/** Response'a konulan sayfalama bilgisi. */
export interface Pagination {
  page: number;
  limit: number;
  total: number;
  total_pages: number;
  has_next: boolean;
  has_previous: boolean;
}

/**
 * `page` ve `limit`'i dogrular. Gecersizse 400 firlatir; her iki alanin
 * hatasi da tek cevapta toplanir.
 */
export const parsePagination = (query: PageQuery = {}, maxLimit = MAX_PAGE_SIZE): PageParams => {
  const errors: Record<string, string> = {};

  let page = 1;
  if (query.page !== undefined) {
    const value = Number(query.page);
    if (!Number.isInteger(value) || value < 1) {
      errors.page = "page 1'den kucuk olmayan bir tam sayi olmali";
    } else {
      page = value;
    }
  }

  let limit = DEFAULT_PAGE_SIZE;
  if (query.limit !== undefined) {
    const value = Number(query.limit);
    if (!Number.isInteger(value) || value < 1 || value > maxLimit) {
      errors.limit = `limit 1 ile ${maxLimit} arasinda bir tam sayi olmali`;
    } else {
      limit = value;
    }
  }

  if (Object.keys(errors).length > 0) {
    throw ApiError.badRequest('Gecersiz sayfalama parametreleri', errors);
  }

  return { page, limit, offset: (page - 1) * limit };
};

/** Sayfa parametreleri + toplam kayit sayisindan response bilgisini uretir. */
export const buildPagination = ({ page, limit }: PageParams, total: number): Pagination => ({
  page,
  limit,
  total,
  // Bos listede de en az bir sayfa vardir; arayuz 0'a bolmesin.
  total_pages: Math.max(1, Math.ceil(total / limit)),
  has_next: page * limit < total,
  has_previous: page > 1,
});

export default { DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE, parsePagination, buildPagination };
