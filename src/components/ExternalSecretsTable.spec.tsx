import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ExternalSecretsTable } from './ExternalSecretsTable';
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

const nsSecret = {
  kind: 'ExternalSecret',
  metadata: { name: 'es', namespace: 'app', creationTimestamp: '2026-01-01T00:00:00Z' },
  spec: { secretStoreRef: { name: 'store', kind: 'SecretStore' }, target: { name: 'tgt' } },
};

const clusterSecret = {
  kind: 'ClusterExternalSecret',
  metadata: { name: 'cluster-es', creationTimestamp: '2026-01-01T00:00:00Z' },
  spec: { externalSecretSpec: { secretStoreRef: { name: 'store', kind: 'ClusterSecretStore' } } },
};

describe('ExternalSecretsTable RBAC cluster watch gating', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockUseK8sWatchResource.mockReturnValue([[nsSecret], true, undefined]);
    mockUseOptionalClusterListWatch.mockReturnValue({
      data: [],
      loaded: true,
      error: undefined,
      clusterWatchSkipped: true,
    });
  });

  it('renders namespace externalsecrets when clusterexternalsecrets watch is denied', () => {
    render(<ExternalSecretsTable selectedProject="app" />);

    expect(screen.getByText('es')).toBeInTheDocument();
    expect(screen.queryByTestId('external-secrets-table-error')).not.toBeInTheDocument();
  });

  it('shows friendly list permission message when namespaced watch is forbidden', () => {
    mockUseK8sWatchResource.mockReturnValue([
      [],
      true,
      new Error('Forbidden: cannot list externalsecrets.external-secrets.io'),
    ]);

    render(<ExternalSecretsTable selectedProject="app" />);

    const error = screen.getByTestId('external-secrets-table-error');
    expect(error).toHaveTextContent('You do not have permission to list');
    expect(error).not.toHaveTextContent('Forbidden: cannot');
  });

  it('omits Delete when externalsecret delete is denied', async () => {
    const user = userEvent.setup();
    mockUseDualScopeDeleteAllowed.mockReturnValue(() => false);

    render(<ExternalSecretsTable selectedProject="app" />);

    await user.click(screen.getByRole('button', { name: /kebab dropdown toggle/i }));
    expect(screen.queryByRole('menuitem', { name: /Delete/ })).not.toBeInTheDocument();
  });
});

describe('ExternalSecretsTable full access (cluster-admin)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockUseK8sWatchResource.mockReturnValue([[nsSecret], true, undefined]);
    mockUseOptionalClusterListWatch.mockReturnValue(
      createFullAccessOptionalClusterWatch([clusterSecret]),
    );
    allowAllDualScopeDelete(mockUseDualScopeDeleteAllowed);
  });

  it('renders namespace and cluster external secrets with Delete action', async () => {
    const user = userEvent.setup();
    render(<ExternalSecretsTable selectedProject="app" />);

    expect(screen.getByText('es')).toBeInTheDocument();
    expect(screen.getByText('cluster-es')).toBeInTheDocument();
    expect(screen.queryByTestId('external-secrets-table-error')).not.toBeInTheDocument();

    await user.click(screen.getAllByRole('button', { name: /kebab dropdown toggle/i })[0]);
    expect(screen.getByRole('menuitem', { name: /Delete/ })).toBeInTheDocument();
  });
});
