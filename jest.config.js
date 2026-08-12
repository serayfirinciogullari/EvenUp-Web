'use strict';

/**
 * Testler `tests/` altinda durur; `src/` sadece derlenen uygulama kodunu icerir.
 * ts-jest kok tsconfig'i (rootDir: src) degil, tests/ dizinini de kapsayan
 * tsconfig.typecheck.json'i kullanir.
 *
 * @type {import('jest').Config}
 */
module.exports = {
  testEnvironment: 'node',
  roots: ['<rootDir>/tests'],
  testMatch: ['**/*.test.ts'],
  transform: {
    '^.+\\.ts$': ['ts-jest', { tsconfig: '<rootDir>/tsconfig.typecheck.json' }],
  },
  collectCoverageFrom: ['src/**/*.ts', '!src/server.ts'],
  clearMocks: true,
};
