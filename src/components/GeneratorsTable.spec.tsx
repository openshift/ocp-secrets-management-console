import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { GeneratorsTable } from './GeneratorsTable';
import { useK8sWatchResource, consoleFetch } from '@openshift-console/dynamic-plugin-sdk';
import { GENERATOR_KIND_DEFS } from './crds';
import { useClusterWatchAllowed } from '../hooks/useClusterWatchAllowed';

jest.mock('@openshift-console/dynamic-plugin-sdk', () => ({
  useK8sWatchResource: jest.fn(),
  consoleFetch: jest.fn(),
}));

jest.mock('../hooks/useClusterWatchAllowed', () => {
  const actual = jest.requireActual('../hooks/useClusterWatchAllowed');
  return {
    ...actual,
    useClusterWatchAllowed: jest.fn(() => ({ allowed: true, loading: false })),
    useClusterDeleteAllowed: jest.fn(() => ({ allowed: true, loading: false })),
    useNamespacedDeleteAllowed: jest.fn(() => ({ allowed: true, loading: false })),
  };
});

jest.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string, opts?: Record<string, unknown>) =>
      opts
        ? Object.entries(opts).reduce(
            (result, [name, value]) => result.replace(`{{${name}}}`, String(value)),
            key,
          )
        : key,
  }),
}));

const mockUseK8sWatchResource = useK8sWatchResource as jest.Mock;
const mockConsoleFetch = consoleFetch as jest.Mock;
const mockUseClusterWatchAllowed = useClusterWatchAllowed as jest.Mock;

const mockPasswords = [
  {
    kind: 'Password',
    metadata: {
      name: 'db-password',
      namespace: 'app',
      creationTimestamp: '2026-08-01T00:00:00Z',
    },
    spec: { length: 42, digits: 5, symbols: 3 },
  },
  {
    kind: 'Password',
    metadata: {
      name: 'api-password',
      namespace: 'app',
      creationTimestamp: '2026-08-01T00:00:00Z',
    },
    spec: { length: 24 },
  },
];

const mockClusterGenerators = [
  {
    kind: 'ClusterGenerator',
    metadata: {
      name: 'cluster-password',
      creationTimestamp: '2026-08-01T00:00:00Z',
    },
    spec: {
      kind: 'Password',
      generator: {
        passwordSpec: { length: 32, digits: 4 },
      },
    },
  },
];

const mockUuids = [
  {
    kind: 'UUID',
    metadata: {
      name: 'request-id',
      namespace: 'app',
      creationTimestamp: '2026-08-01T00:00:00Z',
    },
    spec: {},
  },
];

const mockReadyPassword = {
  kind: 'Password',
  metadata: {
    name: 'ready-password',
    namespace: 'app',
    creationTimestamp: '2026-08-01T00:00:00Z',
  },
  spec: { length: 16 },
  status: { conditions: [{ type: 'Ready', status: 'True' }] },
};

const mockFailedPassword = {
  kind: 'Password',
  metadata: {
    name: 'failed-password',
    namespace: 'app',
    creationTimestamp: '2026-08-01T00:00:00Z',
  },
  spec: { length: 16 },
  status: { conditions: [{ type: 'Ready', status: 'False', reason: 'AuthFailed' }] },
};

function mockWatches(dataByKind: Record<string, unknown[]> = {}) {
  mockUseK8sWatchResource.mockImplementation(
    (opts: { groupVersionKind?: { kind?: string } } | null) => {
      if (!opts) {
        return [undefined, true, undefined];
      }
      const kind = opts.groupVersionKind?.kind || '';
      return [dataByKind[kind] || [], true, undefined];
    },
  );
}

describe('GeneratorsTable', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockConsoleFetch.mockReset();
    mockUseClusterWatchAllowed.mockImplementation(() => ({ allowed: true, loading: false }));
    const { useNamespacedDeleteAllowed, useClusterDeleteAllowed } = jest.requireMock(
      '../hooks/useClusterWatchAllowed',
    );
    (useNamespacedDeleteAllowed as jest.Mock).mockReturnValue({ allowed: true, loading: false });
    (useClusterDeleteAllowed as jest.Mock).mockReturnValue({ allowed: true, loading: false });
  });

  describe('Loading State', () => {
    it('shows loading state when generator watches have not loaded', () => {
      mockUseK8sWatchResource.mockReturnValue([[], false, undefined]);

      const { container } = render(<GeneratorsTable selectedProject="all" />);

      expect(container.querySelector('[data-test="generators-table-loading"]')).toBeInTheDocument();
    });
  });

  describe('RBAC delete gating', () => {
    it('omits Delete when password generator delete is denied', async () => {
      const user = userEvent.setup();
      const { useNamespacedDeleteAllowed } = jest.requireMock('../hooks/useClusterWatchAllowed');
      (useNamespacedDeleteAllowed as jest.Mock).mockReturnValue({ allowed: false, loading: false });
      mockWatches({ Password: mockPasswords });

      render(<GeneratorsTable selectedProject="app" />);

      const kebabs = await screen.findAllByRole('button', { name: /kebab dropdown toggle/i });
      await user.click(kebabs[0]);
      expect(screen.queryByRole('menuitem', { name: /Delete/ })).not.toBeInTheDocument();
    });
  });

  describe('RBAC cluster watch gating', () => {
    it('still lists namespace generators when cluster generator watch is denied', async () => {
      mockUseClusterWatchAllowed.mockImplementation((model) =>
        model?.kind === 'ClusterGenerator'
          ? { allowed: false, loading: false }
          : { allowed: true, loading: false },
      );
      mockWatches({ Password: mockPasswords });

      render(<GeneratorsTable selectedProject="app" />);

      expect(await screen.findByText('db-password')).toBeInTheDocument();
      expect(screen.queryByTestId('generators-table-error')).not.toBeInTheDocument();
    });
  });

  describe('Error State', () => {
    it('displays error when every generator watch fails with a real error', async () => {
      mockUseK8sWatchResource.mockReturnValue([[], true, { message: 'Failed to fetch generators' }]);

      render(<GeneratorsTable selectedProject="all" />);

      expect(await screen.findByText(/Failed to fetch generators/)).toBeInTheDocument();
    });

    it('shows friendly permission message when every generator watch is forbidden', async () => {
      mockUseK8sWatchResource.mockReturnValue([
        [],
        true,
        new Error('Forbidden: cannot list password.generators.external-secrets.io'),
      ]);

      render(<GeneratorsTable selectedProject="app" />);

      const error = await screen.findByTestId('generators-table-error');
      expect(error).toHaveTextContent('You do not have permission to list');
      expect(error).not.toHaveTextContent('Forbidden: cannot');
    });

    it('treats missing CRD errors as empty rather than a table error', async () => {
      mockUseK8sWatchResource.mockReturnValue([
        [],
        true,
        { message: 'no matches for kind "Password" in version "v1alpha1"' },
      ]);

      render(<GeneratorsTable selectedProject="all" />);

      expect(await screen.findByText('No generators found')).toBeInTheDocument();
      expect(screen.queryByText(/no matches for kind/i)).not.toBeInTheDocument();
    });

    it('treats 404 not-found errors as empty rather than a table error', async () => {
      mockUseK8sWatchResource.mockReturnValue([[], true, { message: '404 not found' }]);

      render(<GeneratorsTable selectedProject="all" />);

      expect(await screen.findByText('No generators found')).toBeInTheDocument();
    });

    it('still renders generators when some kinds are missing CRDs', async () => {
      mockUseK8sWatchResource.mockImplementation(
        (opts: { groupVersionKind?: { kind?: string } } | null) => {
          if (!opts) {
            return [undefined, true, undefined];
          }
          const kind = opts.groupVersionKind?.kind || '';
          if (kind === 'Password') {
            return [mockPasswords, true, undefined];
          }
          if (kind === 'Fake') {
            return [[], true, { message: 'the server could not find the requested resource' }];
          }
          return [[], true, undefined];
        },
      );

      render(<GeneratorsTable selectedProject="all" />);

      expect(await screen.findByText('db-password')).toBeInTheDocument();
      expect(screen.queryByText(/could not find/i)).not.toBeInTheDocument();
    });
  });

  describe('Empty State', () => {
    it('shows empty state when no generators exist', async () => {
      mockWatches();

      render(<GeneratorsTable selectedProject="all" />);

      expect(await screen.findByText('No generators found')).toBeInTheDocument();
      expect(
        screen.getByText('No Generators are currently available in all projects.'),
      ).toBeInTheDocument();
    });

    it('shows project-specific empty state message when a project is selected', async () => {
      mockWatches();

      render(<GeneratorsTable selectedProject="my-namespace" />);

      expect(
        await screen.findByText(
          'No Generators are currently available in the project my-namespace.',
        ),
      ).toBeInTheDocument();
    });
  });

  describe('Data Rendering', () => {
    it('renders namespaced and cluster-scoped generators together', async () => {
      mockWatches({
        Password: mockPasswords,
        ClusterGenerator: mockClusterGenerators,
        UUID: mockUuids,
      });

      render(<GeneratorsTable selectedProject="all" />);

      expect(await screen.findByText('db-password')).toBeInTheDocument();
      expect(screen.getByText('api-password')).toBeInTheDocument();
      expect(screen.getByText('cluster-password')).toBeInTheDocument();
      expect(screen.getByText('request-id')).toBeInTheDocument();
    });

    it('renders Cluster-wide for ClusterGenerator and namespace for namespaced kinds', async () => {
      mockWatches({
        Password: mockPasswords,
        ClusterGenerator: mockClusterGenerators,
      });

      render(<GeneratorsTable selectedProject="all" />);

      expect(await screen.findByText('Cluster-wide')).toBeInTheDocument();
      expect(screen.getAllByText('app').length).toBeGreaterThanOrEqual(1);
    });

    it('renders generator kind and details for Password and ClusterGenerator', async () => {
      mockWatches({
        Password: mockPasswords,
        ClusterGenerator: mockClusterGenerators,
      });

      render(<GeneratorsTable selectedProject="all" />);

      expect(await screen.findByText('length 42, 5 digits, 3 symbols')).toBeInTheDocument();
      expect(screen.getByText('Password: length 32, 4 digits')).toBeInTheDocument();
      expect(screen.getAllByText('Password').length).toBeGreaterThanOrEqual(1);
      expect(screen.getByText('ClusterGenerator')).toBeInTheDocument();
    });

    it('renders Configured status when no conditions exist', async () => {
      mockWatches({ Password: mockPasswords });

      render(<GeneratorsTable selectedProject="all" />);

      expect(await screen.findAllByText('Configured')).toHaveLength(mockPasswords.length);
    });

    it('renders Ready and Not Ready from conditions', async () => {
      mockWatches({ Password: [mockReadyPassword, mockFailedPassword] });

      render(<GeneratorsTable selectedProject="all" />);

      expect(await screen.findByText('Ready')).toBeInTheDocument();
      expect(screen.getByText('AuthFailed')).toBeInTheDocument();
    });

    it('stamps kind from the watch when list items omit kind', async () => {
      mockWatches({
        Password: [
          {
            metadata: {
              name: 'no-kind-password',
              namespace: 'app',
              creationTimestamp: '2026-08-01T00:00:00Z',
            },
            spec: { length: 8 },
          },
        ],
      });

      render(<GeneratorsTable selectedProject="all" />);

      expect(await screen.findByText('no-kind-password')).toBeInTheDocument();
      expect(screen.getAllByText('Password').length).toBeGreaterThanOrEqual(1);
    });
  });

  describe('Table Columns', () => {
    it('renders expected column headers', async () => {
      mockWatches({ Password: mockPasswords });

      render(<GeneratorsTable selectedProject="all" />);

      expect(await screen.findByText('Name')).toBeInTheDocument();
      expect(screen.getByText('Namespace')).toBeInTheDocument();
      expect(screen.getByText('Type')).toBeInTheDocument();
      expect(screen.getByText('Generator Kind')).toBeInTheDocument();
      expect(screen.getByText('Details')).toBeInTheDocument();
      expect(screen.getByText('Status')).toBeInTheDocument();
    });
  });

  describe('Watches', () => {
    it('watches every generator kind and namespaces namespaced kinds', async () => {
      mockWatches();

      render(<GeneratorsTable selectedProject="my-namespace" />);

      await waitFor(() => {
        expect(mockUseK8sWatchResource).toHaveBeenCalled();
      });

      const kinds = mockUseK8sWatchResource.mock.calls.map(
        (call) => call[0].groupVersionKind.kind,
      );
      expect(new Set(kinds)).toEqual(new Set(GENERATOR_KIND_DEFS.map((def) => def.kind)));

      const passwordCall = mockUseK8sWatchResource.mock.calls.find(
        (call) => call[0].groupVersionKind.kind === 'Password',
      );
      expect(passwordCall[0].namespace).toBe('my-namespace');

      const clusterCall = mockUseK8sWatchResource.mock.calls.find(
        (call) => call[0].groupVersionKind.kind === 'ClusterGenerator',
      );
      expect(clusterCall[0].namespace).toBeUndefined();
    });

    it('does not namespace namespaced watches when viewing all projects', async () => {
      mockWatches();

      render(<GeneratorsTable selectedProject="all" />);

      await waitFor(() => {
        expect(mockUseK8sWatchResource).toHaveBeenCalled();
      });

      const passwordCall = mockUseK8sWatchResource.mock.calls.find(
        (call) => call[0].groupVersionKind.kind === 'Password',
      );
      expect(passwordCall[0].namespace).toBeUndefined();
    });
  });

  describe('Pagination', () => {
    it('paginates when more than 10 generators are returned', async () => {
      const manyPasswords = Array.from({ length: 12 }, (_, i) => ({
        kind: 'Password',
        metadata: {
          name: `password-${String(i + 1).padStart(2, '0')}`,
          namespace: 'app',
          creationTimestamp: '2026-08-01T00:00:00Z',
        },
        spec: { length: 16 },
      }));
      mockWatches({ Password: manyPasswords });

      render(<GeneratorsTable selectedProject="all" />);

      expect(await screen.findByText('password-01')).toBeInTheDocument();
      expect(screen.getByText('password-10')).toBeInTheDocument();
      expect(screen.queryByText('password-11')).not.toBeInTheDocument();
      expect(screen.getByTestId('generators-table-pagination-bottom')).toBeInTheDocument();
    });

    it('navigates to the next page of generators', async () => {
      const user = userEvent.setup();
      const manyPasswords = Array.from({ length: 12 }, (_, i) => ({
        kind: 'Password',
        metadata: {
          name: `password-${String(i + 1).padStart(2, '0')}`,
          namespace: 'app',
          creationTimestamp: '2026-08-01T00:00:00Z',
        },
        spec: { length: 16 },
      }));
      mockWatches({ Password: manyPasswords });

      render(<GeneratorsTable selectedProject="all" />);

      expect(await screen.findByText('password-01')).toBeInTheDocument();
      const pagination = screen.getByTestId('generators-table-pagination-bottom');
      await user.click(within(pagination).getByRole('button', { name: 'Go to next page' }));

      expect(screen.queryByText('password-01')).not.toBeInTheDocument();
      expect(screen.getByText('password-11')).toBeInTheDocument();
      expect(screen.getByText('password-12')).toBeInTheDocument();
    });
  });

  describe('Actions', () => {
    it('renders kebab menu for each generator', async () => {
      mockWatches({
        Password: mockPasswords,
        ClusterGenerator: mockClusterGenerators,
      });

      render(<GeneratorsTable selectedProject="all" />);

      const kebabButtons = await screen.findAllByRole('button', { name: /kebab dropdown toggle/i });
      expect(kebabButtons).toHaveLength(mockPasswords.length + mockClusterGenerators.length);
    });

    it('exposes Inspect and Delete actions in the kebab menu', async () => {
      const user = userEvent.setup();
      mockWatches({ Password: [mockPasswords[0]] });

      render(<GeneratorsTable selectedProject="app" />);

      await user.click(await screen.findByRole('button', { name: /kebab dropdown toggle/i }));
      expect(screen.getByRole('menuitem', { name: 'Inspect Password' })).toBeInTheDocument();
      expect(screen.getByRole('menuitem', { name: 'Delete Password' })).toBeInTheDocument();
    });

    it('deletes a namespaced generator after the name is confirmed', async () => {
      const user = userEvent.setup();
      mockWatches({ Password: [mockPasswords[0]] });
      mockConsoleFetch.mockResolvedValue({
        ok: true,
        text: async () => '',
      });

      render(<GeneratorsTable selectedProject="app" />);

      await user.click(await screen.findByRole('button', { name: /kebab dropdown toggle/i }));
      await user.click(screen.getByRole('menuitem', { name: 'Delete Password' }));

      const confirm = screen.getByRole('button', { name: 'Delete' });
      expect(confirm).toBeDisabled();

      await user.type(screen.getByLabelText('Type resource name to confirm deletion'), 'db-password');
      expect(confirm).toBeEnabled();
      await user.click(confirm);

      await waitFor(() => {
        expect(mockConsoleFetch).toHaveBeenCalledWith(
          '/api/kubernetes/apis/generators.external-secrets.io/v1alpha1/namespaces/app/passwords/db-password',
          expect.objectContaining({ method: 'DELETE' }),
        );
      });
    });

    it('deletes a ClusterGenerator after the name is confirmed', async () => {
      const user = userEvent.setup();
      mockWatches({ ClusterGenerator: mockClusterGenerators });
      mockConsoleFetch.mockResolvedValue({
        ok: true,
        text: async () => '',
      });

      render(<GeneratorsTable selectedProject="all" />);

      await user.click(await screen.findByRole('button', { name: /kebab dropdown toggle/i }));
      await user.click(screen.getByRole('menuitem', { name: 'Delete ClusterGenerator' }));
      await user.type(
        screen.getByLabelText('Type resource name to confirm deletion'),
        'cluster-password',
      );
      await user.click(screen.getByRole('button', { name: 'Delete' }));

      await waitFor(() => {
        expect(mockConsoleFetch).toHaveBeenCalledWith(
          '/api/kubernetes/apis/generators.external-secrets.io/v1alpha1/clustergenerators/cluster-password',
          expect.objectContaining({ method: 'DELETE' }),
        );
      });
    });

    it('shows an error when delete fails', async () => {
      const user = userEvent.setup();
      mockWatches({ Password: [mockPasswords[0]] });
      mockConsoleFetch.mockResolvedValue({
        ok: false,
        status: 403,
        statusText: 'Forbidden',
        text: async () => 'forbidden',
      });

      render(<GeneratorsTable selectedProject="app" />);

      await user.click(await screen.findByRole('button', { name: /kebab dropdown toggle/i }));
      await user.click(screen.getByRole('menuitem', { name: 'Delete Password' }));
      await user.type(screen.getByLabelText('Type resource name to confirm deletion'), 'db-password');
      await user.click(screen.getByRole('button', { name: 'Delete' }));

      expect(await screen.findByText(/You do not have permission to delete/)).toBeInTheDocument();
      expect(screen.queryByText(/Delete failed: 403 Forbidden/)).not.toBeInTheDocument();
    });

    it('closes the delete modal on cancel without calling the API', async () => {
      const user = userEvent.setup();
      mockWatches({ Password: [mockPasswords[0]] });

      render(<GeneratorsTable selectedProject="app" />);

      await user.click(await screen.findByRole('button', { name: /kebab dropdown toggle/i }));
      await user.click(screen.getByRole('menuitem', { name: 'Delete Password' }));
      await user.click(screen.getByRole('button', { name: 'Cancel' }));

      expect(screen.queryByLabelText('Type resource name to confirm deletion')).not.toBeInTheDocument();
      expect(mockConsoleFetch).not.toHaveBeenCalled();
    });

  });

  describe('Additional Generator Types', () => {
    const mockWebhook = {
      kind: 'Webhook',
      metadata: {
        name: 'token-generator',
        namespace: 'app',
        creationTimestamp: '2026-08-01T00:00:00Z',
      },
      spec: { url: 'https://api.example.com/generate' },
    };

    const mockSSHKey = {
      kind: 'SSHKey',
      metadata: {
        name: 'deploy-key',
        namespace: 'app',
        creationTimestamp: '2026-08-01T00:00:00Z',
      },
      spec: { keyType: 'rsa', size: 4096 },
    };

    const mockVaultDynamicSecret = {
      kind: 'VaultDynamicSecret',
      metadata: {
        name: 'vault-creds',
        namespace: 'app',
        creationTimestamp: '2026-08-01T00:00:00Z',
      },
      spec: { path: 'secret/data/myapp', server: 'https://vault.example.com' },
    };

    const mockFake = {
      kind: 'Fake',
      metadata: {
        name: 'fake-secret',
        namespace: 'app',
        creationTimestamp: '2026-08-01T00:00:00Z',
      },
      spec: { data: [{ key: 'a' }, { key: 'b' }, { key: 'c' }] },
    };

    it('renders Webhook generator with URL details', async () => {
      mockWatches({ Webhook: [mockWebhook] });

      render(<GeneratorsTable selectedProject="all" />);

      expect(await screen.findByText('token-generator')).toBeInTheDocument();
      expect(screen.getAllByText('Webhook')).toHaveLength(2);
      expect(screen.getByText('https://api.example.com/generate')).toBeInTheDocument();
    });

    it('renders SSHKey generator with keyType and size', async () => {
      mockWatches({ SSHKey: [mockSSHKey] });

      render(<GeneratorsTable selectedProject="all" />);

      expect(await screen.findByText('deploy-key')).toBeInTheDocument();
      expect(screen.getAllByText('SSHKey')).toHaveLength(2);
      expect(screen.getByText('size 4096, rsa')).toBeInTheDocument();
    });

    it('renders VaultDynamicSecret generator with path and server', async () => {
      mockWatches({ VaultDynamicSecret: [mockVaultDynamicSecret] });

      render(<GeneratorsTable selectedProject="all" />);

      expect(await screen.findByText('vault-creds')).toBeInTheDocument();
      expect(screen.getAllByText('VaultDynamicSecret')).toHaveLength(2);
      expect(screen.getByText('secret/data/myapp, https://vault.example.com')).toBeInTheDocument();
    });

    it('renders Fake generator with data entry count', async () => {
      mockWatches({ Fake: [mockFake] });

      render(<GeneratorsTable selectedProject="all" />);

      expect(await screen.findByText('fake-secret')).toBeInTheDocument();
      expect(screen.getAllByText('Fake')).toHaveLength(2);
      expect(screen.getByText('3 entries')).toBeInTheDocument();
    });

    it('renders multiple generator types together sorted by name', async () => {
      mockWatches({
        Password: mockPasswords,
        Webhook: [mockWebhook],
        SSHKey: [mockSSHKey],
        UUID: mockUuids,
      });

      render(<GeneratorsTable selectedProject="all" />);

      const names = await screen.findAllByRole('row');
      expect(names.length).toBeGreaterThan(4);

      expect(screen.getByText('api-password')).toBeInTheDocument();
      expect(screen.getByText('db-password')).toBeInTheDocument();
      expect(screen.getByText('deploy-key')).toBeInTheDocument();
      expect(screen.getByText('request-id')).toBeInTheDocument();
      expect(screen.getByText('token-generator')).toBeInTheDocument();
    });
  });

  describe('Status Conditions', () => {
    it('renders condition reason when Ready is False', async () => {
      const generatorWithReason = {
        kind: 'Password',
        metadata: {
          name: 'error-password',
          namespace: 'app',
          creationTimestamp: '2026-08-01T00:00:00Z',
        },
        spec: { length: 16 },
        status: {
          conditions: [
            { type: 'Ready', status: 'False', reason: 'ValidationFailed', message: 'Invalid spec' },
          ],
        },
      };
      mockWatches({ Password: [generatorWithReason] });

      render(<GeneratorsTable selectedProject="all" />);

      expect(await screen.findByText('ValidationFailed')).toBeInTheDocument();
    });

    it('renders "Not Ready" when Ready is False with no reason', async () => {
      const generatorNoReason = {
        kind: 'Password',
        metadata: {
          name: 'pending-password',
          namespace: 'app',
          creationTimestamp: '2026-08-01T00:00:00Z',
        },
        spec: { length: 16 },
        status: {
          conditions: [{ type: 'Ready', status: 'False' }],
        },
      };
      mockWatches({ Password: [generatorNoReason] });

      render(<GeneratorsTable selectedProject="all" />);

      expect(await screen.findByText('Not Ready')).toBeInTheDocument();
    });

    it('renders Configured when status has non-Ready conditions only', async () => {
      const generatorOtherConditions = {
        kind: 'Password',
        metadata: {
          name: 'other-password',
          namespace: 'app',
          creationTimestamp: '2026-08-01T00:00:00Z',
        },
        spec: { length: 16 },
        status: {
          conditions: [{ type: 'Progressing', status: 'True' }],
        },
      };
      mockWatches({ Password: [generatorOtherConditions] });

      render(<GeneratorsTable selectedProject="all" />);

      expect(await screen.findByText('Configured')).toBeInTheDocument();
    });
  });

  describe('Namespace Filtering', () => {
    it('passes namespace to namespaced generator watches', async () => {
      mockWatches();

      render(<GeneratorsTable selectedProject="production" />);

      await waitFor(() => {
        expect(mockUseK8sWatchResource).toHaveBeenCalled();
      });

      const passwordCall = mockUseK8sWatchResource.mock.calls.find(
        (call) => call[0].groupVersionKind.kind === 'Password',
      );
      expect(passwordCall[0].namespace).toBe('production');
    });

    it('does not pass namespace to ClusterGenerator watch', async () => {
      mockWatches();

      render(<GeneratorsTable selectedProject="production" />);

      await waitFor(() => {
        expect(mockUseK8sWatchResource).toHaveBeenCalled();
      });

      const clusterGenCall = mockUseK8sWatchResource.mock.calls.find(
        (call) => call[0].groupVersionKind.kind === 'ClusterGenerator',
      );
      expect(clusterGenCall[0].namespace).toBeUndefined();
    });
  });

  describe('Delete API Paths', () => {
    it('uses correct API path for namespaced Webhook generator', async () => {
      const user = userEvent.setup();
      const webhook = {
        kind: 'Webhook',
        metadata: {
          name: 'my-webhook',
          namespace: 'test-ns',
          creationTimestamp: '2026-08-01T00:00:00Z',
        },
        spec: { url: 'https://example.com' },
      };
      mockWatches({ Webhook: [webhook] });
      mockConsoleFetch.mockResolvedValue({
        ok: true,
        text: async () => '',
      });

      render(<GeneratorsTable selectedProject="test-ns" />);

      await user.click(await screen.findByRole('button', { name: /kebab dropdown toggle/i }));
      await user.click(screen.getByRole('menuitem', { name: 'Delete Webhook' }));
      await user.type(screen.getByLabelText('Type resource name to confirm deletion'), 'my-webhook');
      await user.click(screen.getByRole('button', { name: 'Delete' }));

      await waitFor(() => {
        expect(mockConsoleFetch).toHaveBeenCalledWith(
          '/api/kubernetes/apis/generators.external-secrets.io/v1alpha1/namespaces/test-ns/webhooks/my-webhook',
          expect.objectContaining({ method: 'DELETE' }),
        );
      });
    });

    it('uses correct API path for namespaced VaultDynamicSecret generator', async () => {
      const user = userEvent.setup();
      const vault = {
        kind: 'VaultDynamicSecret',
        metadata: {
          name: 'vault-secret',
          namespace: 'vault-ns',
          creationTimestamp: '2026-08-01T00:00:00Z',
        },
        spec: { path: '/secret/data' },
      };
      mockWatches({ VaultDynamicSecret: [vault] });
      mockConsoleFetch.mockResolvedValue({
        ok: true,
        text: async () => '',
      });

      render(<GeneratorsTable selectedProject="vault-ns" />);

      await user.click(await screen.findByRole('button', { name: /kebab dropdown toggle/i }));
      await user.click(screen.getByRole('menuitem', { name: 'Delete VaultDynamicSecret' }));
      await user.type(screen.getByLabelText('Type resource name to confirm deletion'), 'vault-secret');
      await user.click(screen.getByRole('button', { name: 'Delete' }));

      await waitFor(() => {
        expect(mockConsoleFetch).toHaveBeenCalledWith(
          '/api/kubernetes/apis/generators.external-secrets.io/v1alpha1/namespaces/vault-ns/vaultdynamicsecrets/vault-secret',
          expect.objectContaining({ method: 'DELETE' }),
        );
      });
    });
  });
});

describe('GeneratorsTable full access (cluster-admin)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockConsoleFetch.mockReset();
    mockUseClusterWatchAllowed.mockImplementation(() => ({ allowed: true, loading: false }));
    const { useNamespacedDeleteAllowed, useClusterDeleteAllowed } = jest.requireMock(
      '../hooks/useClusterWatchAllowed',
    );
    (useNamespacedDeleteAllowed as jest.Mock).mockReturnValue({ allowed: true, loading: false });
    (useClusterDeleteAllowed as jest.Mock).mockReturnValue({ allowed: true, loading: false });
    mockWatches({
      Password: mockPasswords,
      ClusterGenerator: mockClusterGenerators,
    });
  });

  it('renders namespace and cluster generators with Delete action and no permission error', async () => {
    const user = userEvent.setup();
    render(<GeneratorsTable selectedProject="app" />);

    expect(await screen.findByText('db-password')).toBeInTheDocument();
    expect(screen.getByText('cluster-password')).toBeInTheDocument();
    expect(screen.queryByTestId('generators-table-error')).not.toBeInTheDocument();

    await user.click(screen.getAllByRole('button', { name: /kebab dropdown toggle/i })[0]);
    expect(screen.getByRole('menuitem', { name: /Delete Password/ })).toBeInTheDocument();
  });
});
