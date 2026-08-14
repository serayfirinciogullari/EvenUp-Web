/**
 * UUID bicim kontrolu.
 *
 * Yetki kontrolunden **once** cagrilir: bicimsiz bir ID PostgreSQL'e giderse
 * `invalid input syntax for type uuid` hatasi 500 uretir. Uygulama katmaninda
 * elenince istek, olmayan bir kayit istemis gibi ayni cevabi alir.
 */
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export const isUuid = (value: unknown): value is string =>
  typeof value === 'string' && UUID_PATTERN.test(value);

export default isUuid;
