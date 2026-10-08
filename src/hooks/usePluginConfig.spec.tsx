import * as React from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom';
import { PluginConfigProvider, usePluginConfig, useDeleteEnabled } from './usePluginConfig';

const mockConsoleFetch = jest.fn();
jest.mock('@openshift-console/dynamic-plugin-sdk', () => ({
  consoleFetch: (...args: unknown[]) => mockConsoleFetch(...args) as unknown,
}));

const ConfigDisplay: React.FC = () => {
  const { config, loaded, error } = usePluginConfig();
  const deleteEnabled = useDeleteEnabled();
  return (
    <div>
      <span data-test="loaded">{String(loaded)}</span>
      <span data-test="error">{error || 'none'}</span>
      <span data-test="delete-enabled">{String(deleteEnabled)}</span>
      <span data-test="check-rbac">{String(config.features.delete.checkRBAC)}</span>
    </div>
  );
};

describe('usePluginConfig', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('defaults to delete disabled when outside provider', () => {
    render(<ConfigDisplay />);
    expect(screen.getByTestId('delete-enabled')).toHaveTextContent('false');
    expect(screen.getByTestId('loaded')).toHaveTextContent('false');
  });

  it('fetches config and exposes delete enabled', async () => {
    mockConsoleFetch.mockResolvedValueOnce({
      ok: true,
      json: () =>
        Promise.resolve({
          features: { delete: { enabled: true, checkRBAC: true } },
        }),
    });

    render(
      <PluginConfigProvider>
        <ConfigDisplay />
      </PluginConfigProvider>,
    );

    await waitFor(() => {
      expect(screen.getByTestId('loaded')).toHaveTextContent('true');
    });
    expect(screen.getByTestId('delete-enabled')).toHaveTextContent('true');
    expect(screen.getByTestId('check-rbac')).toHaveTextContent('true');
  });

  it('fetches config with delete disabled', async () => {
    mockConsoleFetch.mockResolvedValueOnce({
      ok: true,
      json: () =>
        Promise.resolve({
          features: { delete: { enabled: false, checkRBAC: true } },
        }),
    });

    render(
      <PluginConfigProvider>
        <ConfigDisplay />
      </PluginConfigProvider>,
    );

    await waitFor(() => {
      expect(screen.getByTestId('loaded')).toHaveTextContent('true');
    });
    expect(screen.getByTestId('delete-enabled')).toHaveTextContent('false');
  });

  it('falls back to default config on fetch error', async () => {
    mockConsoleFetch.mockRejectedValueOnce(new Error('Network error'));

    render(
      <PluginConfigProvider>
        <ConfigDisplay />
      </PluginConfigProvider>,
    );

    await waitFor(() => {
      expect(screen.getByTestId('loaded')).toHaveTextContent('true');
    });
    expect(screen.getByTestId('error')).toHaveTextContent('Network error');
    expect(screen.getByTestId('delete-enabled')).toHaveTextContent('false');
  });

  it('falls back to default config on non-OK response', async () => {
    mockConsoleFetch.mockResolvedValueOnce({
      ok: false,
      status: 404,
      statusText: 'Not Found',
    });

    render(
      <PluginConfigProvider>
        <ConfigDisplay />
      </PluginConfigProvider>,
    );

    await waitFor(() => {
      expect(screen.getByTestId('loaded')).toHaveTextContent('true');
    });
    expect(screen.getByTestId('error')).toHaveTextContent('404 Not Found');
    expect(screen.getByTestId('delete-enabled')).toHaveTextContent('false');
  });
});
