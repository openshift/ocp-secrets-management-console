import { test, expect } from '@playwright/test';
import {
  mockOperatorDetection,
  mockNamespaces,
  mockK8sResourceList,
} from '../support/mock-api';

test.describe('SMC Empty state displays correct user-friendly message', () => {
  test.beforeEach(async ({ page }) => {
    await mockOperatorDetection(page, {
      certManager: true,
      externalSecrets: true,
      secretsStoreCSI: true,
    });
    await mockNamespaces(page, ['default', 'cert-manager-operator']);
    await mockK8sResourceList(page, 'cert-manager.io', 'v1', 'certificates', []);
    await mockK8sResourceList(page, 'cert-manager.io', 'v1', 'issuers', []);
    await mockK8sResourceList(page, 'cert-manager.io', 'v1', 'clusterissuers', []);
    await mockK8sResourceList(page, 'external-secrets.io', 'v1', 'externalsecrets', []);
    await mockK8sResourceList(page, 'external-secrets.io', 'v1', 'secretstores', []);
    await mockK8sResourceList(page, 'external-secrets.io', 'v1', 'clustersecretstores', []);
    await mockK8sResourceList(page, 'external-secrets.io', 'v1alpha1', 'pushsecrets', []);
    await mockK8sResourceList(page, 'external-secrets.io', 'v1alpha1', 'clusterpushsecrets', []);
    await mockK8sResourceList(page, 'secrets-store.csi.x-k8s.io', 'v1', 'secretproviderclasses', []);
    await mockK8sResourceList(page, 'secrets-store.csi.x-k8s.io', 'v1', 'secretproviderclasspodstatuses', []);
  });

  test('shows "No certificates found" when certificate list is empty', async ({ page }) => {
    await page.goto('/secrets-management');

    await expect(page.getByText('No certificates found')).toBeVisible({ timeout: 30000 });
  });

  test('shows empty state for external secrets when none exist', async ({ page }) => {
    await page.goto('/secrets-management');

    await expect(page.getByText('No external secrets found')).toBeVisible({ timeout: 30000 });
  });

  test('shows empty state for secret stores when none exist', async ({ page }) => {
    await page.goto('/secrets-management');

    await expect(page.getByText('No secret stores found')).toBeVisible({ timeout: 30000 });
  });

  test('shows empty state for push secrets when none exist', async ({ page }) => {
    await page.goto('/secrets-management');

    await expect(page.getByText('No push secrets found')).toBeVisible({ timeout: 30000 });
  });

  test('shows empty state for secret provider classes when none exist', async ({ page }) => {
    await page.goto('/secrets-management');

    await expect(page.getByText('No secret provider classes found')).toBeVisible({ timeout: 30000 });
  });

  test('empty state does not show error or blank table', async ({ page }) => {
    await page.goto('/secrets-management');

    await expect(page.getByText('No certificates found')).toBeVisible({ timeout: 30000 });

    const errorElements = page.locator('[data-test$="-error"]');
    expect(await errorElements.count()).toBe(0);

    await expect(page.getByRole('heading', { name: 'External Secrets Management Console', exact: true })).toBeVisible();
  });
});
