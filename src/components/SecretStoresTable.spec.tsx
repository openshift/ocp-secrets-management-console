import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { SecretStoresTable } from './SecretStoresTable';
import { useK8sWatchResource } from '@openshift-console/dynamic-plugin-sdk';
import { useOptionalClusterListWatch } from '../hooks/useClusterWatchAllowed';
import {
  allowAllDualScopeDelete,
  createFullAccessOptionalClusterWatch,
} from '../test-utils/fullAccessRbacMocks';

jest.mock('@openshift-console/dynamic-plugin-sdk', () => ({
  useK8sWatchResource: jest.fn(),
  consoleFetch: jest.fn(),
}));

jest.mock('../hooks/useClusterWatchAllowed', () => {
  const actual = jest.requireActual('../hooks/useClusterWatchAllowed');
  return {
    ...actual,
    useOptionalClusterListWatch: jest.fn(),
    useDualScopeDeleteAllowed: jest.fn(() => () => true),
  };
});

jest.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));

const mockUseK8sWatchResource = useK8sWatchResource as jest.Mock;
const mockUseOptionalClusterListWatch = useOptionalClusterListWatch as jest.Mock;
const { useDualScopeDeleteAllowed } = jest.requireMock('../hooks/useClusterWatchAllowed');
const mockUseDualScopeDeleteAllowed = useDualScopeDeleteAllowed as jest.Mock;

const nsStore = {
  kind: 'SecretStore',
  metadata: { name: 'store', namespace: 'app', creationTimestamp: '2026-01-01T00:00:00Z' },
  spec: { provider: { aws: { service: 'SecretsManager', region: 'us-east-1' } } },
};

const clusterStore = {
  kind: 'ClusterSecretStore',
  metadata: { name: 'cluster-store', creationTimestamp: '2026-01-01T00:00:00Z' },
  spec: { provider: { aws: { service: 'SecretsManager', region: 'us-east-1' } } },
};

describe('SecretStoresTable RBAC cluster watch gating', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockUseK8sWatchResource.mockReturnValue([[nsStore], true, undefined]);
    mockUseOptionalClusterListWatch.mockReturnValue({
      data: [],
      loaded: true,
      error: undefined,
      clusterWatchSkipped: true,
    });
  });

  it('renders namespace secretstores when cluster secret stores watch is denied', () => {
    render(<SecretStoresTable selectedProject="app" />);

    expect(screen.getByText('store')).toBeInTheDocument();
    expect(screen.queryByTestId('secret-stores-table-error')).not.toBeInTheDocument();
  });

  it('shows friendly list permission message when namespaced watch is forbidden', () => {
    mockUseK8sWatchResource.mockReturnValue([
      [],
      true,
      new Error('Forbidden: cannot list secretstores.external-secrets.io'),
    ]);

    render(<SecretStoresTable selectedProject="app" />);

    const error = screen.getByTestId('secret-stores-table-error');
    expect(error).toHaveTextContent('You do not have permission to list');
    expect(error).not.toHaveTextContent('Forbidden: cannot');
  });

  it('omits Delete when secret store delete is denied', async () => {
    const user = userEvent.setup();
    mockUseDualScopeDeleteAllowed.mockReturnValue(() => false);

    render(<SecretStoresTable selectedProject="app" />);

    await user.click(screen.getByRole('button', { name: /kebab dropdown toggle/i }));
    expect(screen.queryByRole('menuitem', { name: /Delete/ })).not.toBeInTheDocument();
  });
});

describe('SecretStoresTable full access (cluster-admin)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockUseK8sWatchResource.mockReturnValue([[nsStore], true, undefined]);
    mockUseOptionalClusterListWatch.mockReturnValue(
      createFullAccessOptionalClusterWatch([clusterStore]),
    );
    allowAllDualScopeDelete(mockUseDualScopeDeleteAllowed);
  });

  it('renders namespace and cluster secret stores with Delete action', async () => {
    const user = userEvent.setup();
    render(<SecretStoresTable selectedProject="app" />);

    expect(screen.getByText('store')).toBeInTheDocument();
    expect(screen.getByText('cluster-store')).toBeInTheDocument();
    expect(screen.queryByTestId('secret-stores-table-error')).not.toBeInTheDocument();

    await user.click(screen.getAllByRole('button', { name: /kebab dropdown toggle/i })[0]);
    expect(screen.getByRole('menuitem', { name: /Delete/ })).toBeInTheDocument();
  });
});
