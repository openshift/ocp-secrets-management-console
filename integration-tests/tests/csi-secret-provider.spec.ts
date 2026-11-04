import { test, expect } from '@playwright/test';
import { checkErrors } from '../support';

test.describe('Secrets Store CSI Driver - SecretProviderClass resources', () => {
  test.afterEach(async ({ page }) => {
    await checkErrors(page);
  });

  test('CSI driver section is visible on the dashboard', async ({ page }) => {
    await page.goto('/secrets-management');

    const heading = page.getByRole('heading', { name: 'External Secrets Management Console', exact: true });
    await expect(heading).toBeVisible({ timeout: 60000 });

    await expect(page.getByRole('heading', { name: 'Secret Provider Classes' })).toBeVisible({
      timeout: 15000,
    });

    await expect(page.getByText('Secrets Store CSI Driver')).toBeVisible();
  });

  test('renders SecretProviderClass rows with correct data', async ({ page }) => {
    await page.goto('/secrets-management');

    const table = page.locator('[data-test="secret-provider-classes-table"]');
    await expect(table).toBeVisible({ timeout: 60000 });

    await expect(table.getByText('vault-db-creds')).toBeVisible({ timeout: 15000 });
    await expect(table.getByText('aws-secrets')).toBeVisible();
  });

  test('displays provider type for each SecretProviderClass', async ({ page }) => {
    await page.goto('/secrets-management');

    const table = page.locator('[data-test="secret-provider-classes-table"]');
    await expect(table).toBeVisible({ timeout: 60000 });

    await expect(table.locator('span').filter({ hasText: 'vault' })).toBeVisible({ timeout: 15000 });
    await expect(table.locator('span').filter({ hasText: 'aws' })).toBeVisible();
  });

  test('shows Unknown status when no pod is using the SecretProviderClass', async ({ page }) => {
    await page.goto('/secrets-management');

    const table = page.locator('[data-test="secret-provider-classes-table"]');
    await expect(table).toBeVisible({ timeout: 60000 });

    const unknownLabels = table.locator('.pf-v6-c-label, .pf-v5-c-label').filter({
      hasText: 'Unknown',
    });
    await expect(unknownLabels.first()).toBeVisible({ timeout: 15000 });
  });

  test('inspect SecretProviderClass via kebab menu', async ({ page }) => {
    await page.goto('/secrets-management');

    const table = page.locator('[data-test="secret-provider-classes-table"]');
    await expect(table).toBeVisible({ timeout: 60000 });

    const spcRow = table.locator('tr').filter({ hasText: 'vault-db-creds' });
    await expect(spcRow).toBeVisible({ timeout: 15000 });

    const kebab = spcRow.locator('[aria-label="kebab dropdown toggle"]');
    await kebab.click();

    await page.getByText('Inspect SecretProviderClass', { exact: true }).click();

    await expect(page).toHaveURL(/\/secrets-management\/inspect\/secretproviderclasses\//, {
      timeout: 30000,
    });

    await expect(page.getByText('SecretProviderClass:', { exact: false })).toBeVisible({
      timeout: 60000,
    });
  });

  test('inspect pane shows metadata for SecretProviderClass', async ({ page }) => {
    await page.goto('/secrets-management/inspect/secretproviderclasses/smc-csi-test/vault-db-creds');

    await expect(page.getByText('SecretProviderClass:', { exact: false })).toBeVisible({
      timeout: 60000,
    });

    const metadataCard = page.locator('.pf-v6-c-card, .pf-v5-c-card').filter({
      has: page.locator('.pf-v6-c-card__title-text, .pf-v5-c-card__title-text', { hasText: 'Metadata' }),
    }).first();
    await expect(metadataCard).toBeVisible();

    await expect(metadataCard.getByText('Name:')).toBeVisible();
    await expect(metadataCard.getByText('Kind:')).toBeVisible();
    await expect(metadataCard.getByText('Namespace:')).toBeVisible();
    await expect(metadataCard.getByText('secrets-store.csi.x-k8s.io/v1').first()).toBeVisible();
  });
});
