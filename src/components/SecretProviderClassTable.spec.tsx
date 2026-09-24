import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { SecretProviderClassTable } from './SecretProviderClassTable';
import { useK8sWatchResource } from '@openshift-console/dynamic-plugin-sdk';
import { useNamespacedWatchAllowed } from '../hooks/useClusterWatchAllowed';

jest.mock('@openshift-console/dynamic-plugin-sdk', () => ({
  useK8sWatchResource: jest.fn(),
  consoleFetch: jest.fn(),
}));

jest.mock('../hooks/useClusterWatchAllowed', () => {
  const actual = jest.requireActual('../hooks/useClusterWatchAllowed');
  return {
    ...actual,
    useNamespacedWatchAllowed: jest.fn(() => ({ allowed: true, loading: false })),
    useNamespacedOnlyDeleteAllowed: jest.fn(() => true),
  };
});

jest.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));

const mockUseK8sWatchResource = useK8sWatchResource as jest.Mock;
const { useNamespacedOnlyDeleteAllowed } = jest.requireMock('../hooks/useClusterWatchAllowed');
const mockUseNamespacedOnlyDeleteAllowed = useNamespacedOnlyDeleteAllowed as jest.Mock;

const spc = {
  metadata: { name: 'azure-spc', namespace: 'app', creationTimestamp: '2026-01-01T00:00:00Z' },
  spec: { provider: 'azure', parameters: {} },
};

describe('SecretProviderClassTable RBAC watch gating', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockUseK8sWatchResource.mockReturnValue([[], true, undefined]);
  });

  it('shows empty state without error when namespace watch is denied', () => {
    (useNamespacedWatchAllowed as jest.Mock).mockReturnValue({ allowed: false, loading: false });
    render(<SecretProviderClassTable selectedProject="app" />);

    expect(screen.queryByTestId('secret-provider-class-table-error')).not.toBeInTheDocument();
    expect(screen.getByText('No secret provider classes found')).toBeInTheDocument();
  });

  it('shows friendly list permission message when watch returns forbidden', () => {
    (useNamespacedWatchAllowed as jest.Mock).mockReturnValue({ allowed: true, loading: false });
    const forbidden = new Error('Forbidden: cannot list secretproviderclasses');
    mockUseK8sWatchResource.mockImplementation(() => [[], true, forbidden]);

    render(<SecretProviderClassTable selectedProject="app" />);

    const error = screen.getByTestId('secret-provider-classes-table-error');
    expect(error).toHaveTextContent('You do not have permission to list');
    expect(error).not.toHaveTextContent('Forbidden: cannot');
  });

  it('omits Delete when secret provider class delete is denied', async () => {
    const user = userEvent.setup();
    mockUseK8sWatchResource.mockReturnValue([[spc], true, undefined]);
    mockUseNamespacedOnlyDeleteAllowed.mockReturnValue(false);

    render(<SecretProviderClassTable selectedProject="app" />);

    await user.click(screen.getByRole('button', { name: /kebab dropdown toggle/i }));
    expect(screen.queryByRole('menuitem', { name: /Delete/ })).not.toBeInTheDocument();
  });
});

describe('SecretProviderClassTable full access (cluster-admin)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (useNamespacedWatchAllowed as jest.Mock).mockReturnValue({ allowed: true, loading: false });
    mockUseK8sWatchResource.mockReturnValue([[spc], true, undefined]);
    mockUseNamespacedOnlyDeleteAllowed.mockReturnValue(true);
  });

  it('renders secret provider classes with Delete action and no permission error', async () => {
    const user = userEvent.setup();
    render(<SecretProviderClassTable selectedProject="app" />);

    expect(screen.getByText('azure-spc')).toBeInTheDocument();
    expect(screen.queryByTestId('secret-provider-classes-table-error')).not.toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: /kebab dropdown toggle/i }));
    expect(screen.getByRole('menuitem', { name: /Delete/ })).toBeInTheDocument();
  });
});
