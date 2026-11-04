import { test, expect } from '@playwright/test';
import {
  mockOperatorDetection,
  mockNamespaces,
  mockK8sResourceList,
} from '../support/mock-api';
import mockCertificates from '../fixtures/mock-certificates.json';
import mockIssuers from '../fixtures/mock-issuers.json';
import mockExternalSecrets from '../fixtures/mock-external-secrets.json';
import mockSecretProviderClasses from '../fixtures/mock-secret-provider-classes.json';

test.describe('Dashboard renders mock resources and correct status badges', () => {
  test.beforeEach(async ({ page }) => {
    await mockOperatorDetection(page, {
      certManager: true,
      externalSecrets: true,
      secretsStoreCSI: true,
    });
    await mockNamespaces(page, ['default', 'cert-manager-operator', 'external-secrets-operator']);
    await mockK8sResourceList(page, 'cert-manager.io', 'v1', 'certificates', mockCertificates);
    await mockK8sResourceList(page, 'cert-manager.io', 'v1', 'issuers', []);
    await mockK8sResourceList(page, 'cert-manager.io', 'v1', 'clusterissuers', mockIssuers);
    await mockK8sResourceList(page, 'external-secrets.io', 'v1', 'externalsecrets', mockExternalSecrets);
    await mockK8sResourceList(page, 'external-secrets.io', 'v1', 'secretstores', []);
    await mockK8sResourceList(page, 'external-secrets.io', 'v1', 'clustersecretstores', []);
    await mockK8sResourceList(page, 'external-secrets.io', 'v1alpha1', 'pushsecrets', []);
    await mockK8sResourceList(page, 'external-secrets.io', 'v1alpha1', 'clusterpushsecrets', []);
    await mockK8sResourceList(page, 'secrets-store.csi.x-k8s.io', 'v1', 'secretproviderclasses', mockSecretProviderClasses);
    await mockK8sResourceList(page, 'secrets-store.csi.x-k8s.io', 'v1', 'secretproviderclasspodstatuses', []);
  });

  test('renders the External Secrets Management Console page title', async ({ page }) => {
    await page.goto('/secrets-management');

    await expect(page.getByRole('heading', { name: 'External Secrets Management Console', exact: true })).toBeVisible({
      timeout: 30000,
    });
    await expect(page.getByText('Manage certificates, external secrets')).toBeVisible();
  });

  test('shows cert-manager section with badge', async ({ page }) => {
    await page.goto('/secrets-management');

    const heading = page.getByRole('heading', { name: 'External Secrets Management Console', exact: true });
    await expect(heading).toBeVisible({ timeout: 30000 });

    const certSection = page.getByRole('heading', { name: 'Certificates' });
    await expect(certSection).toBeVisible({ timeout: 15000 });
  });

  test('renders certificate rows with correct data', async ({ page }) => {
    await page.goto('/secrets-management');

    const table = page.locator('[data-test="certificates-table"]');
    await expect(table).toBeVisible({ timeout: 30000 });

    await expect(table.getByText('selfsigned-ca-2')).toBeVisible();
    await expect(table.getByText('selfsigned-ca-3')).toBeVisible();
    await expect(table.getByText('expiring-cert')).toBeVisible();
  });

  test('displays Ready status labels on certificates', async ({ page }) => {
    await page.goto('/secrets-management');

    const table = page.locator('[data-test="certificates-table"]');
    await expect(table).toBeVisible({ timeout: 30000 });

    const readyLabels = table.locator('.pf-v6-c-label, .pf-v5-c-label').filter({ hasText: 'Ready' });
    await expect(readyLabels.first()).toBeVisible();
  });

  test('shows expiry date badges', async ({ page }) => {
    await page.goto('/secrets-management');

    const table = page.locator('[data-test="certificates-table"]');
    await expect(table).toBeVisible({ timeout: 30000 });

    const expiryLabels = table.locator('.pf-v6-c-label, .pf-v5-c-label').filter({ hasText: /remaining|Expired|Expires/ });
    expect(await expiryLabels.count()).toBeGreaterThanOrEqual(2);
  });

  test('shows External Secrets section', async ({ page }) => {
    await page.goto('/secrets-management');

    const heading = page.getByRole('heading', { name: 'External Secrets Management Console', exact: true });
    await expect(heading).toBeVisible({ timeout: 30000 });

    await expect(page.getByRole('heading', { name: 'External Secrets' })).toBeVisible({
      timeout: 15000,
    });
  });

  test('shows Secrets Store CSI Driver section with mock data', async ({ page }) => {
    await page.goto('/secrets-management');

    const heading = page.getByRole('heading', { name: 'External Secrets Management Console', exact: true });
    await expect(heading).toBeVisible({ timeout: 30000 });

    await expect(page.getByRole('heading', { name: 'Secret Provider Classes' })).toBeVisible({
      timeout: 15000,
    });

    await expect(page.getByText('vault-db-creds')).toBeVisible({ timeout: 15000 });
    await expect(page.getByText('aws-secrets')).toBeVisible();
  });

  test('renders filter dropdowns', async ({ page }) => {
    await page.goto('/secrets-management');

    const heading = page.getByRole('heading', { name: 'External Secrets Management Console', exact: true });
    await expect(heading).toBeVisible({ timeout: 30000 });

    await expect(page.getByLabel('Project')).toBeVisible();
    await expect(page.getByLabel('Operator')).toBeVisible();
    await expect(page.getByLabel('Resource Type')).toBeVisible();
  });
});
