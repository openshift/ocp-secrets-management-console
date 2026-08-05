import { render, screen } from '@testing-library/react';
import { BundlesTable } from './BundlesTable';
import { useK8sWatchResource } from '@openshift-console/dynamic-plugin-sdk';

jest.mock('@openshift-console/dynamic-plugin-sdk', () => ({
  useK8sWatchResource: jest.fn(),
  consoleFetch: jest.fn(),
}));

jest.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string) => key,
  }),
}));

const mockUseK8sWatchResource = useK8sWatchResource as jest.Mock;

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
  });

  describe('Loading State', () => {
    it('shows loading state when data is not yet loaded', () => {
      mockUseK8sWatchResource.mockReturnValue([[], false, undefined]);

      const { container } = render(<BundlesTable selectedProject="all" />);

      expect(container.querySelector('[data-test="bundles-table-loading"]')).toBeInTheDocument();
    });
  });

  describe('Error State', () => {
    it('displays error message when loading fails', () => {
      mockUseK8sWatchResource.mockReturnValue([
        [],
        true,
        { message: 'Failed to fetch bundles' },
      ]);

      render(<BundlesTable selectedProject="all" />);

      expect(screen.getByText(/Failed to fetch bundles/)).toBeInTheDocument();
    });
  });

  describe('Empty State', () => {
    it('shows empty state when no bundles exist', () => {
      mockUseK8sWatchResource.mockReturnValue([[], true, undefined]);

      render(<BundlesTable selectedProject="all" />);

      expect(screen.getByText('No trust bundles found')).toBeInTheDocument();
    });

    it('shows cluster-scoped explanation in empty state', () => {
      mockUseK8sWatchResource.mockReturnValue([[], true, undefined]);

      render(<BundlesTable selectedProject="all" />);

      expect(
        screen.getByText(
          'No trust bundles are currently available. Trust bundles are cluster-scoped resources managed by trust-manager.',
        ),
      ).toBeInTheDocument();
    });

    it('shows project-specific empty state message when project is selected', () => {
      mockUseK8sWatchResource.mockReturnValue([[], true, undefined]);

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
      mockUseK8sWatchResource.mockReturnValue([mockBundles, true, undefined]);

      render(<BundlesTable selectedProject="all" />);

      expect(screen.getByText('organization-ca-bundle')).toBeInTheDocument();
      expect(screen.getByText('java-app-truststore')).toBeInTheDocument();
      expect(screen.getByText('selective-bundle')).toBeInTheDocument();
      expect(screen.getByText('dynamic-corporate-bundle')).toBeInTheDocument();
    });

    it('renders source descriptions', () => {
      mockUseK8sWatchResource.mockReturnValue([mockBundles, true, undefined]);

      render(<BundlesTable selectedProject="all" />);

      expect(screen.getByText('Default CAs, Secret: my-custom-ca-secret')).toBeInTheDocument();
      expect(screen.getByText('Default CAs, Secret: internal-root-ca')).toBeInTheDocument();
    });

    it('renders secret selector sources correctly', () => {
      mockUseK8sWatchResource.mockReturnValue([mockBundles, true, undefined]);

      render(<BundlesTable selectedProject="all" />);

      expect(screen.getByText('Secret (selector)')).toBeInTheDocument();
    });

    it('renders target information', () => {
      mockUseK8sWatchResource.mockReturnValue([mockBundles, true, undefined]);

      render(<BundlesTable selectedProject="all" />);

      expect(screen.getAllByText('ConfigMap[ca-bundle.crt]').length).toBeGreaterThanOrEqual(1);
    });

    it('renders additional formats in target', () => {
      mockUseK8sWatchResource.mockReturnValue([mockBundles, true, undefined]);

      render(<BundlesTable selectedProject="all" />);

      expect(screen.getByText('ConfigMap[ca-bundle.crt], JKS, PKCS12')).toBeInTheDocument();
    });

    it('renders namespace scope for bundles without selector', () => {
      mockUseK8sWatchResource.mockReturnValue([mockBundles, true, undefined]);

      render(<BundlesTable selectedProject="all" />);

      const allNamespacesCells = screen.getAllByText('All namespaces');
      expect(allNamespacesCells.length).toBeGreaterThanOrEqual(1);
    });

    it('renders namespace label selector for filtered bundles', () => {
      mockUseK8sWatchResource.mockReturnValue([mockBundles, true, undefined]);

      render(<BundlesTable selectedProject="all" />);

      expect(screen.getByText('inject-trust=true')).toBeInTheDocument();
    });

    it('renders Synced status label', () => {
      mockUseK8sWatchResource.mockReturnValue([mockBundles, true, undefined]);

      render(<BundlesTable selectedProject="all" />);

      const syncedLabels = screen.getAllByText('Synced');
      expect(syncedLabels.length).toBeGreaterThanOrEqual(1);
    });

    it('renders not synced status with reason', () => {
      mockUseK8sWatchResource.mockReturnValue([mockBundles, true, undefined]);

      render(<BundlesTable selectedProject="all" />);

      expect(screen.getByText('SyncFailed')).toBeInTheDocument();
    });

    it('renders Unknown status when no conditions exist', () => {
      mockUseK8sWatchResource.mockReturnValue([mockBundles, true, undefined]);

      render(<BundlesTable selectedProject="all" />);

      expect(screen.getByText('Unknown')).toBeInTheDocument();
    });

    it('renders default CA version when available', () => {
      mockUseK8sWatchResource.mockReturnValue([mockBundles, true, undefined]);

      render(<BundlesTable selectedProject="all" />);

      expect(screen.getByText('2024.2.69_v8.0.401')).toBeInTheDocument();
    });
  });

  describe('Table Columns', () => {
    it('renders expected column headers', () => {
      mockUseK8sWatchResource.mockReturnValue([mockBundles, true, undefined]);

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
    it('fetches bundles without namespace filter regardless of selectedProject', () => {
      mockUseK8sWatchResource.mockReturnValue([mockBundles, true, undefined]);

      render(<BundlesTable selectedProject="my-namespace" />);

      expect(mockUseK8sWatchResource).toHaveBeenCalledWith(
        expect.objectContaining({
          groupVersionKind: {
            group: 'trust.cert-manager.io',
            version: 'v1alpha1',
            kind: 'Bundle',
          },
          isList: true,
        }),
      );

      const callArg = mockUseK8sWatchResource.mock.calls[0][0];
      expect(callArg.namespace).toBeUndefined();
    });
  });

  describe('Actions', () => {
    it('renders kebab menu for each bundle', () => {
      mockUseK8sWatchResource.mockReturnValue([mockBundles, true, undefined]);

      render(<BundlesTable selectedProject="all" />);

      const kebabButtons = screen.getAllByRole('button', { name: /kebab dropdown toggle/i });
      expect(kebabButtons.length).toBe(mockBundles.length);
    });
  });
});
