import type { Config } from 'jest';

const config: Config = {
  testEnvironment: 'jsdom',
  // Only *.spec.{ts,tsx,js,jsx} files are treated as unit tests; Playwright
  // specs under integration-tests/ are excluded via testPathIgnorePatterns below.
  testRegex: '.*\\.spec\\.(ts|tsx|js|jsx)$',
  moduleNameMapper: {
    '\\.(jpg|jpeg|png|gif|eot|otf|webp|svg|ttf|woff|woff2|mp4|webm|wav|mp3|m4a|aac|oga)$':
    '<rootDir>/__mocks__/fileMock.ts',
    '\\.css$': '<rootDir>/__mocks__/styleMock.ts',
  },
  transform: {
    '^.+\\.[jt]sx?$': [
      '@swc/jest',
      {
        module: {
          type: 'commonjs',
          noInterop: true,
        },
        minify: false,
      },
    ],
  },
  setupFilesAfterEnv: ['./setup-tests.ts'],
  testPathIgnorePatterns: ['integration-tests'],
  collectCoverageFrom: [
    'src/**/*.{ts,tsx,js,jsx}',
    '!src/**/*.d.ts',
    '!src/**/*.spec.{ts,tsx,js,jsx}',
    '!src/**/__tests__/**',
    '!src/**/__mocks__/**',
  ],
  coverageDirectory: 'coverage',
  coverageReporters: ['lcov', 'json', 'text', 'text-summary', 'html'],
  coverageThreshold: {
    global: {
      branches: 50,
      functions: 50,
      lines: 50,
      statements: 50,
    },
  },
};

export default config;
