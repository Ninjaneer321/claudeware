/** @type {import('jest').Config} */
module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  roots: ['<rootDir>/src', '<rootDir>/tests'],
  testMatch: [
    '**/__tests__/**/*.ts',
    '**/?(*.)+(spec|test).ts'
  ],
  collectCoverageFrom: [
    'src/**/*.ts',
    '!src/**/*.d.ts',
    '!src/**/__tests__/**',
    '!src/cli.ts'
  ],
  coverageThreshold: {
    global: {
      branches: 80,
      functions: 80,
      lines: 80,
      statements: 80
    }
  },
  moduleNameMapper: {
    '^@/(.*)$': '<rootDir>/src/$1',
    '@instantlyeasy/claude-code-sdk-ts': '<rootDir>/tests/__mocks__/@instantlyeasy/claude-code-sdk-ts.js'
  },
  transformIgnorePatterns: [
    'node_modules/(?!(@instantlyeasy/claude-code-sdk-ts)/)'
  ],
  testTimeout: 10000,
  verbose: true
};