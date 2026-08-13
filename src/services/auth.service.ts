import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';

import config from '../config/env';
import userModel from '../models/user.model';
import ApiError from '../utils/ApiError';

import type { AuthUser, JwtPayload } from '../types/auth';
import type { PublicUser } from '../models/user.model';
import type { SignOptions } from 'jsonwebtoken';

/**
 * Kimlik dogrulama is mantigi: dogrulama, hash'leme, token uretme/cozme.
 * HTTP'den haberi yoktur; hata durumlarini ApiError olarak firlatir.
 */

export const MIN_PASSWORD_LENGTH = 8;
const MAX_PASSWORD_LENGTH = 72; // bcrypt 72 bayttan sonrasini yok sayar
const MAX_NAME_LENGTH = 120; // users.name kolonu ile ayni
const MAX_EMAIL_LENGTH = 255; // users.email kolonu ile ayni

// Tam RFC 5322 degil (o regex pratikte okunmaz); "bosluksuz yerel@alan.uzanti" yeterli.
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

export interface RegisterInput {
  email: string;
  password: string;
  name: string;
}

export interface LoginInput {
  email: string;
  password: string;
}

export interface AuthResult {
  user: PublicUser;
  token: string;
  expiresIn: string;
}

/** Secret'i koda gomme yasagi: yoksa uygulama token uretmez, 500 doner. */
const getJwtSecret = (): string => {
  if (!config.jwtSecret) {
    throw ApiError.internal('JWT_SECRET tanimli degil');
  }
  return config.jwtSecret;
};

const normalizeEmail = (value: unknown): string =>
  typeof value === 'string' ? value.trim().toLowerCase() : '';

const asString = (value: unknown): string => (typeof value === 'string' ? value : '');

/* ------------------------------------------------------------- validasyon */

const validateRegisterInput = (input: Partial<RegisterInput>): RegisterInput => {
  const email = normalizeEmail(input.email);
  const password = asString(input.password);
  const name = asString(input.name).trim();
  const errors: Record<string, string> = {};

  if (!email) {
    errors.email = 'E-posta zorunlu';
  } else if (email.length > MAX_EMAIL_LENGTH || !EMAIL_PATTERN.test(email)) {
    errors.email = 'Gecerli bir e-posta adresi girin';
  }

  if (!password) {
    errors.password = 'Sifre zorunlu';
  } else if (password.length < MIN_PASSWORD_LENGTH) {
    errors.password = `Sifre en az ${MIN_PASSWORD_LENGTH} karakter olmali`;
  } else if (password.length > MAX_PASSWORD_LENGTH) {
    errors.password = `Sifre en fazla ${MAX_PASSWORD_LENGTH} karakter olabilir`;
  }

  if (!name) {
    errors.name = 'Isim zorunlu';
  } else if (name.length > MAX_NAME_LENGTH) {
    errors.name = `Isim en fazla ${MAX_NAME_LENGTH} karakter olabilir`;
  }

  if (Object.keys(errors).length > 0) {
    throw ApiError.badRequest('Gecersiz kayit bilgileri', errors);
  }

  return { email, password, name };
};

const validateLoginInput = (input: Partial<LoginInput>): LoginInput => {
  const email = normalizeEmail(input.email);
  const password = asString(input.password);

  if (!email || !password) {
    throw ApiError.badRequest('E-posta ve sifre zorunlu');
  }

  return { email, password };
};

/* ------------------------------------------------------------------ token */

const signToken = (user: AuthUser): string => {
  const payload: JwtPayload = { userId: user.id, role: user.role };
  // expiresIn'in tip tanimi '7d' gibi literal sablonlar bekliyor; deger .env'den
  // string geldigi icin SignOptions uzerinden daraltiyoruz.
  const options: SignOptions = { expiresIn: config.jwtExpiresIn as SignOptions['expiresIn'] };

  return jwt.sign(payload, getJwtSecret(), options);
};

/** Token'i cozer. Gecersiz/suresi dolmus/bicimsiz her durumda 401 firlatir. */
const verifyToken = (token: string): AuthUser => {
  let decoded: unknown;

  try {
    decoded = jwt.verify(token, getJwtSecret());
  } catch (error) {
    if (error instanceof jwt.TokenExpiredError) {
      throw ApiError.unauthorized('Token suresi dolmus');
    }
    throw ApiError.unauthorized('Gecersiz token');
  }

  // jwt.verify imzayi dogrular, payload'in **icerigini** dogrulamaz:
  // baska bir sema ile imzalanmis eski bir token buraya duserse elenmeli.
  if (typeof decoded !== 'object' || decoded === null) {
    throw ApiError.unauthorized('Gecersiz token');
  }

  const { userId, role } = decoded as Partial<JwtPayload>;

  if (typeof userId !== 'string' || (role !== 'admin' && role !== 'user')) {
    throw ApiError.unauthorized('Gecersiz token');
  }

  return { id: userId, role };
};

/* ----------------------------------------------------------------- islemler */

const register = async (input: Partial<RegisterInput>): Promise<AuthResult> => {
  const { email, password, name } = validateRegisterInput(input);

  const existing = await userModel.findByEmail(email);
  if (existing) {
    throw ApiError.conflict('Bu e-posta zaten kayitli');
  }

  const passwordHash = await bcrypt.hash(password, config.bcryptSaltRounds);

  // role bilerek input'tan alinmiyor: istemcinin kendini admin yapmasini engeller.
  // Admin atamasi ayri bir yonetim akisinda yapilir.
  const user = await userModel.create({
    email,
    name,
    password_hash: passwordHash,
  });

  return {
    user,
    token: signToken({ id: user.id, role: user.role }),
    expiresIn: config.jwtExpiresIn,
  };
};

const login = async (input: Partial<LoginInput>): Promise<AuthResult> => {
  const { email, password } = validateLoginInput(input);

  const user = await userModel.findByEmail(email);

  // "Kullanici yok" ile "sifre yanlis" ayni mesaji doner: aksi halde endpoint
  // hangi e-postalarin kayitli oldugunu sizdirir.
  if (!user || !user.is_active) {
    throw ApiError.unauthorized('E-posta veya sifre hatali');
  }

  const passwordMatches = await bcrypt.compare(password, user.password_hash);
  if (!passwordMatches) {
    throw ApiError.unauthorized('E-posta veya sifre hatali');
  }

  return {
    // password_hash'i elle ayikliyoruz: user burada tam satir (hash dahil).
    user: {
      id: user.id,
      email: user.email,
      name: user.name,
      role: user.role,
      is_active: user.is_active,
      created_at: user.created_at,
    },
    token: signToken({ id: user.id, role: user.role }),
    expiresIn: config.jwtExpiresIn,
  };
};

const getProfile = async (userId: string): Promise<PublicUser> => {
  const user = await userModel.findPublicById(userId);

  // Token gecerli ama kullanici silinmis olabilir.
  if (!user) {
    throw ApiError.unauthorized('Kullanici bulunamadi');
  }

  return user;
};

export default { register, login, getProfile, signToken, verifyToken };
