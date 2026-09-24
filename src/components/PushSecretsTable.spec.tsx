import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { PushSecretsTable } from './PushSecretsTable';
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

const nsPush = {
  kind: 'PushSecret',
  metadata: { name: 'push', namespace: 'app', creationTimestamp: '2026-01-01T00:00:00Z' },
  spec: {
    secretStoreRefs: [{ name: 'store', kind: 'SecretStore' }],
    selector: { secret: { name: 'src' } },
  },
};

const clusterPush = {
  kind: 'ClusterPushSecret',
  metadata: { name: 'cluster-push', creationTimestamp: '2026-01-01T00:00:00Z' },
  spec: {
    secretStoreRefs: [{ name: 'store', kind: 'ClusterSecretStore' }],
    selector: { secret: { name: 'src' } },
  },
};

describe('PushSecretsTable RBAC cluster watch gating', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockUseK8sWatchResource.mockReturnValue([[nsPush], true, undefined]);
    mockUseOptionalClusterListWatch.mockReturnValue({
      data: [],
      loaded: true,
      error: undefined,
      clusterWatchSkipped: true,
    });
  });

  it('renders namespace pushsecrets when cluster push secrets watch is denied', () => {
    render(<PushSecretsTable selectedProject="app" />);

    expect(screen.getByText('push')).toBeInTheDocument();
    expect(screen.queryByTestId('push-secrets-table-error')).not.toBeInTheDocument();
  });

  it('shows friendly list permission message when namespaced watch is forbidden', () => {
    mockUseK8sWatchResource.mockReturnValue([
      [],
      true,
      new Error('Forbidden: cannot list pushsecrets.external-secrets.io'),
    ]);

    render(<PushSecretsTable selectedProject="app" />);

    const error = screen.getByTestId('push-secrets-table-error');
    expect(error).toHaveTextContent('You do not have permission to list');
    expect(error).not.toHaveTextContent('Forbidden: cannot');
  });

  it('omits Delete when push secret delete is denied', async () => {
    const user = userEvent.setup();
    mockUseDualScopeDeleteAllowed.mockReturnValue(() => false);

    render(<PushSecretsTable selectedProject="app" />);

    await user.click(screen.getByRole('button', { name: /kebab dropdown toggle/i }));
    expect(screen.queryByRole('menuitem', { name: /Delete/ })).not.toBeInTheDocument();
  });
});

describe('PushSecretsTable full access (cluster-admin)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockUseK8sWatchResource.mockReturnValue([[nsPush], true, undefined]);
    mockUseOptionalClusterListWatch.mockReturnValue(
      createFullAccessOptionalClusterWatch([clusterPush]),
    );
    allowAllDualScopeDelete(mockUseDualScopeDeleteAllowed);
  });

  it('renders namespace and cluster push secrets with Delete action', async () => {
    const user = userEvent.setup();
    render(<PushSecretsTable selectedProject="app" />);

    expect(screen.getByText('push')).toBeInTheDocument();
    expect(screen.getByText('cluster-push')).toBeInTheDocument();
    expect(screen.queryByTestId('push-secrets-table-error')).not.toBeInTheDocument();

    await user.click(screen.getAllByRole('button', { name: /kebab dropdown toggle/i })[0]);
    expect(screen.getByRole('menuitem', { name: /Delete/ })).toBeInTheDocument();
  });
});
