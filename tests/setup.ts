/**
 * Jest `setupFiles` ile her test dosyasindan **once** calisir.
 *
 * Amac: testlerin gelistiricinin .env dosyasina bagimli olmamasi. config/env.ts
 * dotenv'i kullanir ama dotenv zaten tanimli process.env degerlerinin uzerine
 * yazmaz, dolayisiyla buradaki degerler kazanir.
 */

process.env.NODE_ENV = 'test';
process.env.JWT_SECRET = 'test-secret-only-for-jest';
process.env.JWT_EXPIRES_IN = '1h';
// Testlerde 12 tur bcrypt her hash icin ~300ms; 10 tur yeterince gercekci ve hizli.
process.env.BCRYPT_SALT_ROUNDS = '10';
