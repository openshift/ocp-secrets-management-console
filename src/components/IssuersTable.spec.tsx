import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { IssuersTable } from './IssuersTable';
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

const namespaceIssuer = {
  metadata: { name: 'ns-issuer', namespace: 'app', creationTimestamp: '2026-01-01T00:00:00Z' },
  spec: { selfSigned: {} },
};

describe('IssuersTable RBAC cluster watch gating', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockUseK8sWatchResource.mockReturnValue([[namespaceIssuer], true, undefined]);
    mockUseOptionalClusterListWatch.mockReturnValue({
      data: [],
      loaded: true,
      error: undefined,
      clusterWatchSkipped: true,
    });
  });

  it('renders namespace issuers when cluster clusterissuers watch is denied', () => {
    render(<IssuersTable selectedProject="app" />);

    expect(screen.getByText('ns-issuer')).toBeInTheDocument();
    expect(screen.queryByTestId('issuers-table-error')).not.toBeInTheDocument();
  });

  it('omits Delete when namespaced issuer delete is denied', async () => {
    const user = userEvent.setup();
    mockUseDualScopeDeleteAllowed.mockReturnValue(() => false);

    render(<IssuersTable selectedProject="app" />);

    await user.click(screen.getByRole('button', { name: /kebab dropdown toggle/i }));
    expect(screen.queryByRole('menuitem', { name: /Delete/ })).not.toBeInTheDocument();
  });

  it('shows friendly list permission message when namespaced watch is forbidden', () => {
    mockUseK8sWatchResource.mockReturnValue([
      [],
      true,
      new Error('Forbidden: user "u" cannot list resource "issuers" in namespace app'),
    ]);

    render(<IssuersTable selectedProject="app" />);

    const error = screen.getByTestId('issuers-table-error');
    expect(error).toHaveTextContent('You do not have permission to list');
    expect(error).not.toHaveTextContent('Forbidden: user');
  });

  it('shows Delete when namespaced issuer delete is allowed', async () => {
    const user = userEvent.setup();
    mockUseDualScopeDeleteAllowed.mockReturnValue(() => true);

    render(<IssuersTable selectedProject="app" />);

    await user.click(screen.getByRole('button', { name: /kebab dropdown toggle/i }));
    expect(screen.getByRole('menuitem', { name: /Delete/ })).toBeInTheDocument();
  });
});

const clusterIssuer = {
  metadata: { name: 'cluster-issuer', creationTimestamp: '2026-01-01T00:00:00Z' },
  spec: { selfSigned: {} },
};

describe('IssuersTable full access (cluster-admin)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockUseK8sWatchResource.mockReturnValue([[namespaceIssuer], true, undefined]);
    mockUseOptionalClusterListWatch.mockReturnValue(
      createFullAccessOptionalClusterWatch([clusterIssuer]),
    );
    allowAllDualScopeDelete(mockUseDualScopeDeleteAllowed);
  });

  it('renders namespace and cluster issuers without permission errors', async () => {
    const user = userEvent.setup();
    render(<IssuersTable selectedProject="app" />);

    expect(screen.getByText('ns-issuer')).toBeInTheDocument();
    expect(screen.getByText('cluster-issuer')).toBeInTheDocument();
    expect(screen.queryByTestId('issuers-table-error')).not.toBeInTheDocument();
    expect(screen.queryByText(/You do not have permission to list/i)).not.toBeInTheDocument();

    await user.click(screen.getAllByRole('button', { name: /kebab dropdown toggle/i })[0]);
    expect(screen.getByRole('menuitem', { name: /Delete/ })).toBeInTheDocument();
  });
});
