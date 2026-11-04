import { defineConfig } from '@playwright/test';

const isLiveCluster = !(process.env.BRIDGE_BASE_ADDRESS ?? 'http://localhost:9000').includes(
  'localhost',
);

export default defineConfig({
  testDir: './integration-tests/tests',
  timeout: 60000,
  retries: 1,
  use: {
    baseURL: process.env.BRIDGE_BASE_ADDRESS ?? 'http://localhost:9000',
    viewport: { width: 1920, height: 1080 },
    screenshot: 'on',
    ignoreHTTPSErrors: true,
    video: 'retain-on-failure',
    trace: 'on',
    testIdAttribute: 'data-test',
  },
  projects: [
    {
      name: 'pre-merge',
      testMatch: /\.premerge\.spec\.ts$/,
      ...(isLiveCluster
        ? {
            use: {
              browserName: 'chromium',
              storageState: 'integration-tests/.auth/user.json',
            },
            dependencies: ['setup'],
          }
        : {}),
    },
    { name: 'setup', testMatch: /auth\.setup\.ts/ },
    {
      name: 'chromium',
      use: {
        browserName: 'chromium',
        storageState: 'integration-tests/.auth/user.json',
      },
      dependencies: ['setup'],
      testIgnore: [/\.premerge\.spec\.ts$/],
    },
  ],
  reporter: [
    ['list'],
    ['html', { outputFolder: 'integration-tests/results/html', open: 'never' }],
    ['junit', { outputFile: 'integration-tests/results/junit-results.xml' }],
  ],
});
