import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { BundlesTable } from './BundlesTable';
import { consoleFetch } from '@openshift-console/dynamic-plugin-sdk';
import { useOptionalClusterListWatch } from '../hooks/useClusterWatchAllowed';
import { createFullAccessOptionalClusterWatch } from '../test-utils/fullAccessRbacMocks';

jest.mock('@openshift-console/dynamic-plugin-sdk', () => ({
  consoleFetch: jest.fn(),
}));

jest.mock('../hooks/useClusterWatchAllowed', () => {
  const actual = jest.requireActual('../hooks/useClusterWatchAllowed');
  return {
    ...actual,
    useOptionalClusterListWatch: jest.fn(),
    useClusterOnlyDeleteAllowed: jest.fn(() => true),
  };
});

jest.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string) => key,
  }),
}));

const mockUseOptionalClusterListWatch = useOptionalClusterListWatch as jest.Mock;
const mockConsoleFetch = consoleFetch as jest.Mock;
const { useClusterOnlyDeleteAllowed } = jest.requireMock('../hooks/useClusterWatchAllowed');
const mockUseClusterOnlyDeleteAllowed = useClusterOnlyDeleteAllowed as jest.Mock;

const setBundlesWatch = (
  data: unknown[],
  loaded: boolean,
  error?: unknown,
  clusterWatchSkipped = false,
) => {
  mockUseOptionalClusterListWatch.mockReturnValue({
    data,
    loaded,
    error,
    clusterWatchSkipped,
  });
};

const mockBundles = [
  {
    metadata: {
      name: 'organization-ca-bundle',
      creationTimestamp: '2026-08-05T07:33:05Z',
    },
    spec: {
      sources: [
        { useDefaultCAs: true },
        { secret: { key: 'tls.crt', name: 'my-custom-ca-secret' } },
      ],
      target: {
        configMap: { key: 'ca-bundle.crt' },
      },
    },
    status: {
      conditions: [
        {
          type: 'Synced',
          status: 'True',
          reason: 'Synced',
          message: 'Successfully synced Bundle to all namespaces',
        },
      ],
    },
  },
  {
    metadata: {
      name: 'java-app-truststore',
      creationTimestamp: '2026-08-05T07:45:45Z',
    },
    spec: {
      sources: [
        { useDefaultCAs: true },
        { secret: { key: 'ca.crt', name: 'internal-root-ca' } },
      ],
      target: {
        configMap: { key: 'ca-bundle.crt' },
        additionalFormats: {
          jks: { key: 'truststore.jks', password: 'changeit' },
          pkcs12: { key: 'truststore.p12', password: 'changeit' },
        },
      },
    },
    status: {
      conditions: [
        {
          type: 'Synced',
          status: 'True',
          reason: 'Synced',
          message: 'Successfully synced',
        },
      ],
      defaultCAVersion: '2024.2.69_v8.0.401',
    },
  },
  {
    metadata: {
      name: 'selective-bundle',
      creationTimestamp: '2026-08-05T07:45:53Z',
    },
    spec: {
      sources: [{ useDefaultCAs: true }],
      target: {
        configMap: { key: 'ca-bundle.pem' },
        namespaceSelector: {
          matchLabels: { 'inject-trust': 'true' },
        },
      },
    },
    status: {
      conditions: [
        {
          type: 'Synced',
          status: 'False',
          reason: 'SyncFailed',
          message: 'Failed to sync',
        },
      ],
    },
  },
  {
    metadata: {
      name: 'dynamic-corporate-bundle',
      creationTimestamp: '2026-08-05T07:46:00Z',
    },
    spec: {
      sources: [
        {
          secret: {
            key: 'tls.crt',
            selector: { matchLabels: { 'app.kubernetes.io/trust-source': 'true' } },
          },
        },
      ],
      target: {
        configMap: { key: 'ca-chain.pem' },
      },
    },
    status: {},
  },
];

describe('BundlesTable', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    setBundlesWatch([], true, undefined);
  });

  describe('Loading State', () => {
    it('shows loading state when data is not yet loaded', () => {
      setBundlesWatch([], false, undefined);

      const { container } = render(<BundlesTable selectedProject="all" />);

      expect(container.querySelector('[data-test="bundles-table-loading"]')).toBeInTheDocument();
    });
  });

  describe('Error State', () => {
    it('displays error message when loading fails', () => {
      setBundlesWatch([], true, { message: 'Failed to fetch bundles' });

      render(<BundlesTable selectedProject="all" />);

      expect(screen.getByText(/Failed to fetch bundles/)).toBeInTheDocument();
    });

    it('shows friendly permission message for forbidden cluster list', () => {
      setBundlesWatch([], true, new Error('Forbidden: cannot list bundles.trust.cert-manager.io'));

      render(<BundlesTable selectedProject="all" />);

      const error = screen.getByTestId('bundles-table-error');
      expect(error).toHaveTextContent('You do not have permission to list');
      expect(error).not.toHaveTextContent('Forbidden: cannot');
    });
  });

  describe('Empty State', () => {
    it('shows empty state when no bundles exist', () => {
      setBundlesWatch([], true, undefined);

      render(<BundlesTable selectedProject="all" />);

      expect(screen.getByText('No trust bundles found')).toBeInTheDocument();
    });

    it('shows cluster-scoped explanation in empty state', () => {
      setBundlesWatch([], true, undefined);

      render(<BundlesTable selectedProject="all" />);

      expect(
        screen.getByText(
          'No trust bundles are currently available. Trust bundles are cluster-scoped resources managed by trust-manager.',
        ),
      ).toBeInTheDocument();
    });

    it('shows project-specific empty state message when project is selected', () => {
      setBundlesWatch([], true, undefined);

      render(<BundlesTable selectedProject="my-namespace" />);

      expect(
        screen.getByText(
          'No trust bundles are currently available. Trust bundles are cluster-scoped resources and are not filtered by project.',
        ),
      ).toBeInTheDocument();
    });
  });

  describe('Data Rendering', () => {
    it('renders bundle names', () => {
      setBundlesWatch(mockBundles, true, undefined);

      render(<BundlesTable selectedProject="all" />);

      expect(screen.getByText('organization-ca-bundle')).toBeInTheDocument();
      expect(screen.getByText('java-app-truststore')).toBeInTheDocument();
      expect(screen.getByText('selective-bundle')).toBeInTheDocument();
      expect(screen.getByText('dynamic-corporate-bundle')).toBeInTheDocument();
    });

    it('renders source descriptions', () => {
      setBundlesWatch(mockBundles, true, undefined);

      render(<BundlesTable selectedProject="all" />);

      expect(screen.getByText('Default CAs, Secret: my-custom-ca-secret')).toBeInTheDocument();
      expect(screen.getByText('Default CAs, Secret: internal-root-ca')).toBeInTheDocument();
    });

    it('renders secret selector sources correctly', () => {
      setBundlesWatch(mockBundles, true, undefined);

      render(<BundlesTable selectedProject="all" />);

      expect(screen.getByText('Secret (selector)')).toBeInTheDocument();
    });

    it('renders target information', () => {
      setBundlesWatch(mockBundles, true, undefined);

      render(<BundlesTable selectedProject="all" />);

      expect(screen.getAllByText('ConfigMap[ca-bundle.crt]').length).toBeGreaterThanOrEqual(1);
    });

    it('renders additional formats in target', () => {
      setBundlesWatch(mockBundles, true, undefined);

      render(<BundlesTable selectedProject="all" />);

      expect(screen.getByText('ConfigMap[ca-bundle.crt], JKS, PKCS12')).toBeInTheDocument();
    });

    it('renders namespace scope for bundles without selector', () => {
      setBundlesWatch(mockBundles, true, undefined);

      render(<BundlesTable selectedProject="all" />);

      const allNamespacesCells = screen.getAllByText('All namespaces');
      expect(allNamespacesCells.length).toBeGreaterThanOrEqual(1);
    });

    it('renders namespace label selector for filtered bundles', () => {
      setBundlesWatch(mockBundles, true, undefined);

      render(<BundlesTable selectedProject="all" />);

      expect(screen.getByText('inject-trust=true')).toBeInTheDocument();
    });

    it('renders Synced status label', () => {
      setBundlesWatch(mockBundles, true, undefined);

      render(<BundlesTable selectedProject="all" />);

      const syncedLabels = screen.getAllByText('Synced');
      expect(syncedLabels.length).toBeGreaterThanOrEqual(1);
    });

    it('renders not synced status with reason', () => {
      setBundlesWatch(mockBundles, true, undefined);

      render(<BundlesTable selectedProject="all" />);

      expect(screen.getByText('SyncFailed')).toBeInTheDocument();
    });

    it('renders Unknown status when no conditions exist', () => {
      setBundlesWatch(mockBundles, true, undefined);

      render(<BundlesTable selectedProject="all" />);

      expect(screen.getByText('Unknown')).toBeInTheDocument();
    });

    it('renders default CA version when available', () => {
      setBundlesWatch(mockBundles, true, undefined);

      render(<BundlesTable selectedProject="all" />);

      expect(screen.getByText('2024.2.69_v8.0.401')).toBeInTheDocument();
    });
  });

  describe('Table Columns', () => {
    it('renders expected column headers', () => {
      setBundlesWatch(mockBundles, true, undefined);

      render(<BundlesTable selectedProject="all" />);

      expect(screen.getByText('Name')).toBeInTheDocument();
      expect(screen.getByText('Sources')).toBeInTheDocument();
      expect(screen.getByText('Target')).toBeInTheDocument();
      expect(screen.getByText('Namespace Scope')).toBeInTheDocument();
      expect(screen.getByText('Default CA Version')).toBeInTheDocument();
      expect(screen.getByText('Status')).toBeInTheDocument();
    });
  });

  describe('Cluster-Scoped Behavior', () => {
    it('uses cluster watch helper regardless of selectedProject', () => {
      setBundlesWatch(mockBundles, true, undefined);

      render(<BundlesTable selectedProject="my-namespace" />);

      expect(mockUseOptionalClusterListWatch).toHaveBeenCalledWith({
        group: 'trust.cert-manager.io',
        version: 'v1alpha1',
        kind: 'Bundle',
      });
    });

    it('shows empty state without error when cluster bundle watch is denied', () => {
      setBundlesWatch([], true, undefined, true);

      render(<BundlesTable selectedProject="all" />);

      expect(screen.getByText('No trust bundles found')).toBeInTheDocument();
      expect(screen.queryByTestId('bundles-table-error')).not.toBeInTheDocument();
    });

    it('omits Delete when cluster bundle delete is denied', async () => {
      const user = userEvent.setup();
      setBundlesWatch(mockBundles, true, undefined);
      mockUseClusterOnlyDeleteAllowed.mockReturnValue(false);

      render(<BundlesTable selectedProject="all" />);

      await user.click(screen.getAllByRole('button', { name: /kebab dropdown toggle/i })[0]);
      expect(screen.queryByRole('menuitem', { name: /Delete/ })).not.toBeInTheDocument();
    });
  });

  describe('Actions', () => {
    it('renders kebab menu for each bundle', () => {
      setBundlesWatch(mockBundles, true, undefined);

      render(<BundlesTable selectedProject="all" />);

      const kebabButtons = screen.getAllByRole('button', { name: /kebab dropdown toggle/i });
      expect(kebabButtons.length).toBe(mockBundles.length);
    });

    it('shows friendly delete permission message when delete API returns 403', async () => {
      const user = userEvent.setup();
      mockUseClusterOnlyDeleteAllowed.mockReturnValue(true);
      setBundlesWatch(mockBundles, true, undefined);
      mockConsoleFetch.mockResolvedValue({
        ok: false,
        status: 403,
        statusText: 'Forbidden',
        text: async () => 'user cannot delete bundles',
      });

      render(<BundlesTable selectedProject="all" />);

      await user.click(screen.getAllByRole('button', { name: /kebab dropdown toggle/i })[0]);
      await user.click(screen.getByRole('menuitem', { name: /Delete/ }));
      await user.type(
        screen.getByLabelText('Type resource name to confirm deletion'),
        'organization-ca-bundle',
      );
      await user.click(screen.getByRole('button', { name: 'Delete' }));

      expect(await screen.findByText(/You do not have permission to delete/)).toBeInTheDocument();
      expect(screen.queryByText(/user cannot delete bundles/)).not.toBeInTheDocument();
    });
  });
});

describe('BundlesTable full access (cluster-admin)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockUseOptionalClusterListWatch.mockReturnValue(
      createFullAccessOptionalClusterWatch(mockBundles),
    );
    mockUseClusterOnlyDeleteAllowed.mockReturnValue(true);
  });

  it('renders cluster bundles with Delete action and no permission error', async () => {
    const user = userEvent.setup();
    render(<BundlesTable selectedProject="all" />);

    expect(screen.getByText('organization-ca-bundle')).toBeInTheDocument();
    expect(screen.getByText('java-app-truststore')).toBeInTheDocument();
    expect(screen.queryByTestId('bundles-table-error')).not.toBeInTheDocument();

    await user.click(screen.getAllByRole('button', { name: /kebab dropdown toggle/i })[0]);
    expect(screen.getByRole('menuitem', { name: /Delete/ })).toBeInTheDocument();
  });
});
