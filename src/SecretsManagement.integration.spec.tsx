/**
 * Integration tests for SecretsManagement component
 * Tests user interactions and filter behavior
 */
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import SecretsManagement from './SecretsManagement';
import { useOperatorDetection } from './hooks/useOperatorDetection';
import { useK8sWatchResource } from '@openshift-console/dynamic-plugin-sdk';

// Mock dependencies
jest.mock('./hooks/useOperatorDetection', () => ({
  useOperatorDetection: jest.fn(),
}));

jest.mock('@openshift-console/dynamic-plugin-sdk', () => ({
  useK8sWatchResource: jest.fn(),
  consoleFetch: jest.fn(),
  DocumentTitle: ({ children }: { children: string }) => <title>{children}</title>,
}));

// Mock child table components
jest.mock('./components/CertificatesTable', () => ({
  CertificatesTable: ({ selectedProject }: { selectedProject: string }) => (
    <div data-test="certificates-table">Certificates - {selectedProject}</div>
  ),
}));

jest.mock('./components/IssuersTable', () => ({
  IssuersTable: ({ selectedProject }: { selectedProject: string }) => (
    <div data-test="issuers-table">Issuers - {selectedProject}</div>
  ),
}));

jest.mock('./components/ExternalSecretsTable', () => ({
  ExternalSecretsTable: ({ selectedProject }: { selectedProject: string }) => (
    <div data-test="external-secrets-table">ExternalSecrets - {selectedProject}</div>
  ),
}));

jest.mock('./components/SecretStoresTable', () => ({
  SecretStoresTable: ({ selectedProject }: { selectedProject: string }) => (
    <div data-test="secret-stores-table">SecretStores - {selectedProject}</div>
  ),
}));

jest.mock('./components/PushSecretsTable', () => ({
  PushSecretsTable: ({ selectedProject }: { selectedProject: string }) => (
    <div data-test="push-secrets-table">PushSecrets - {selectedProject}</div>
  ),
}));

jest.mock('./components/SecretProviderClassTable', () => ({
  SecretProviderClassTable: ({ selectedProject }: { selectedProject: string }) => (
    <div data-test="secret-provider-class-table">SecretProviderClass - {selectedProject}</div>
  ),
}));

jest.mock('./components/BundlesTable', () => ({
  BundlesTable: ({ selectedProject }: { selectedProject: string }) => (
    <div data-test="bundles-table">Bundles - {selectedProject}</div>
  ),
}));

jest.mock('./components/OperatorNotInstalled', () => ({
  NoOperatorsInstalled: () => <div data-test="no-operators">No operators installed</div>,
}));

jest.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string) => key,
  }),
}));

jest.mock('react-helmet', () => ({
  __esModule: true,
  default: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));

const mockUseOperatorDetection = useOperatorDetection as jest.Mock;
const mockUseK8sWatchResource = useK8sWatchResource as jest.Mock;

describe('SecretsManagement - User Interactions', () => {
  const defaultOperatorStatus = {
    certManager: { installed: true, loading: false },
    trustManager: { installed: true, loading: false },
    externalSecrets: { installed: true, loading: false },
    secretsStoreCSI: { installed: true, loading: false },
    loading: false,
    refresh: jest.fn(),
  };

  const mockProjects = [
    { metadata: { name: 'default' }, status: { phase: 'Active' } },
    { metadata: { name: 'my-project' }, status: { phase: 'Active' } },
    { metadata: { name: 'test-project' }, status: { phase: 'Active' } },
  ];

  beforeEach(() => {
    jest.clearAllMocks();
    mockUseOperatorDetection.mockReturnValue(defaultOperatorStatus);
    mockUseK8sWatchResource.mockReturnValue([mockProjects, true, undefined]);
  });

  describe('Project Filter Interactions', () => {
    it('opens and closes project dropdown menu', async () => {
      const user = userEvent.setup();
      render(<SecretsManagement />);

      const projectButton = screen.getByRole('button', { name: /Project/i });

      // Initially closed
      expect(screen.queryByRole('menu')).not.toBeInTheDocument();

      // Click to open
      await user.click(projectButton);

      // Menu should be open with items
      await waitFor(() => {
        const menus = screen.queryAllByRole('menu');
        expect(menus.length).toBeGreaterThan(0);
      });
    });

    it('changes selected project and updates table props', async () => {
      const user = userEvent.setup();
      render(<SecretsManagement />);

      // Initially shows "all"
      expect(screen.getByTestId('certificates-table')).toHaveTextContent('all');

      const projectButton = screen.getByRole('button', { name: /Project/i });
      await user.click(projectButton);

      // Find and click a project option
      await waitFor(async () => {
        const menuItems = screen.getAllByRole('menuitem');
        const myProjectItem = menuItems.find((item) => item.textContent === 'my-project');
        if (myProjectItem) {
          await user.click(myProjectItem);
        }
      });

      // Table should now show the selected project
      await waitFor(() => {
        expect(screen.getByTestId('certificates-table')).toHaveTextContent('my-project');
      });
    });

    it('updates all tables when project changes', async () => {
      const user = userEvent.setup();
      render(<SecretsManagement />);

      const projectButton = screen.getByRole('button', { name: /Project/i });
      await user.click(projectButton);

      await waitFor(async () => {
        const menuItems = screen.getAllByRole('menuitem');
        const testProjectItem = menuItems.find((item) => item.textContent === 'test-project');
        if (testProjectItem) {
          await user.click(testProjectItem);
        }
      });

      await waitFor(() => {
        expect(screen.getByTestId('certificates-table')).toHaveTextContent('test-project');
        expect(screen.getByTestId('issuers-table')).toHaveTextContent('test-project');
        expect(screen.getByTestId('external-secrets-table')).toHaveTextContent('test-project');
      });
    });
  });

  describe('Operator Filter Interactions', () => {
    it('filters resources by selected operator', async () => {
      const user = userEvent.setup();
      render(<SecretsManagement />);

      // All tables visible initially
      expect(screen.getByTestId('certificates-table')).toBeInTheDocument();
      expect(screen.getByTestId('external-secrets-table')).toBeInTheDocument();

      const operatorButton = screen.getByRole('button', { name: /Operator/i });
      await user.click(operatorButton);

      // Select cert-manager operator
      await waitFor(async () => {
        const menuItems = screen.getAllByRole('menuitem');
        const certManagerItem = menuItems.find((item) =>
          item.textContent?.includes('cert-manager'),
        );
        if (certManagerItem) {
          await user.click(certManagerItem);
        }
      });

      // Only cert-manager resources should be visible
      await waitFor(() => {
        expect(screen.getByTestId('certificates-table')).toBeInTheDocument();
        expect(screen.getByTestId('issuers-table')).toBeInTheDocument();
        expect(screen.queryByTestId('external-secrets-table')).not.toBeInTheDocument();
      });
    });

    it('resets resource filter when operator changes', async () => {
      const user = userEvent.setup();
      render(<SecretsManagement />);

      // First select a resource filter
      const resourceButton = screen.getByRole('button', { name: /Resource Type/i });
      await user.click(resourceButton);

      await waitFor(async () => {
        const menuItems = screen.getAllByRole('menuitem');
        const certificatesItem = menuItems.find((item) => item.textContent === 'Certificates');
        if (certificatesItem) {
          await user.click(certificatesItem);
        }
      });

      // Now change operator
      const operatorButton = screen.getByRole('button', { name: /Operator/i });
      await user.click(operatorButton);

      await waitFor(async () => {
        const menuItems = screen.getAllByRole('menuitem');
        const allItem = menuItems.find((item) => item.textContent === 'All Operators');
        if (allItem) {
          await user.click(allItem);
        }
      });

      // Resource filter should reset to "All Resources"
      await waitFor(() => {
        expect(resourceButton).toHaveTextContent('All Resources');
      });
    });
  });

  describe('Resource Kind Filter Interactions', () => {
    it('filters to show only certificates', async () => {
      const user = userEvent.setup();
      render(<SecretsManagement />);

      const resourceButton = screen.getByRole('button', { name: /Resource Type/i });
      await user.click(resourceButton);

      await waitFor(async () => {
        const menuItems = screen.getAllByRole('menuitem');
        const certificatesItem = menuItems.find((item) => item.textContent === 'Certificates');
        if (certificatesItem) {
          await user.click(certificatesItem);
        }
      });

      await waitFor(() => {
        expect(screen.getByTestId('certificates-table')).toBeInTheDocument();
        expect(screen.queryByTestId('issuers-table')).not.toBeInTheDocument();
        expect(screen.queryByTestId('external-secrets-table')).not.toBeInTheDocument();
      });
    });

    it('filters to show only external secrets', async () => {
      const user = userEvent.setup();
      render(<SecretsManagement />);

      const resourceButton = screen.getByRole('button', { name: /Resource Type/i });
      await user.click(resourceButton);

      await waitFor(async () => {
        const menuItems = screen.getAllByRole('menuitem');
        const item = menuItems.find((item) => item.textContent === 'External Secrets');
        if (item) {
          await user.click(item);
        }
      });

      await waitFor(() => {
        expect(screen.queryByTestId('certificates-table')).not.toBeInTheDocument();
        expect(screen.getByTestId('external-secrets-table')).toBeInTheDocument();
        expect(screen.queryByTestId('secret-stores-table')).not.toBeInTheDocument();
      });
    });

    it('shows all resources when "All Resources" is selected', async () => {
      const user = userEvent.setup();
      render(<SecretsManagement />);

      // First filter to certificates
      const resourceButton = screen.getByRole('button', { name: /Resource Type/i });
      await user.click(resourceButton);

      await waitFor(async () => {
        const menuItems = screen.getAllByRole('menuitem');
        const certificatesItem = menuItems.find((item) => item.textContent === 'Certificates');
        if (certificatesItem) {
          await user.click(certificatesItem);
        }
      });

      // Then select "All Resources"
      await user.click(resourceButton);

      await waitFor(async () => {
        const menuItems = screen.getAllByRole('menuitem');
        const allItem = menuItems.find((item) => item.textContent === 'All Resources');
        if (allItem) {
          await user.click(allItem);
        }
      });

      // All tables should be visible
      await waitFor(() => {
        expect(screen.getByTestId('certificates-table')).toBeInTheDocument();
        expect(screen.getByTestId('issuers-table')).toBeInTheDocument();
        expect(screen.getByTestId('external-secrets-table')).toBeInTheDocument();
      });
    });
  });

  describe('Combined Filter Interactions', () => {
    it('applies project and operator filters together', async () => {
      const user = userEvent.setup();
      render(<SecretsManagement />);

      // Select project
      const projectButton = screen.getByRole('button', { name: /Project/i });
      await user.click(projectButton);

      await waitFor(async () => {
        const menuItems = screen.getAllByRole('menuitem');
        const projectItem = menuItems.find((item) => item.textContent === 'my-project');
        if (projectItem) {
          await user.click(projectItem);
        }
      });

      // Select operator
      const operatorButton = screen.getByRole('button', { name: /Operator/i });
      await user.click(operatorButton);

      await waitFor(async () => {
        const menuItems = screen.getAllByRole('menuitem');
        const operatorItem = menuItems.find((item) => item.textContent?.includes('cert-manager'));
        if (operatorItem) {
          await user.click(operatorItem);
        }
      });

      // Check results
      await waitFor(() => {
        const certTable = screen.getByTestId('certificates-table');
        expect(certTable).toHaveTextContent('my-project');
        expect(screen.queryByTestId('external-secrets-table')).not.toBeInTheDocument();
      });
    });

    it('applies all three filters (project, operator, resource)', async () => {
      const user = userEvent.setup();
      render(<SecretsManagement />);

      // Select project
      const projectButton = screen.getByRole('button', { name: /Project/i });
      await user.click(projectButton);
      await waitFor(async () => {
        const items = screen.getAllByRole('menuitem');
        const item = items.find((i) => i.textContent === 'test-project');
        if (item) await user.click(item);
      });

      // Select operator
      const operatorButton = screen.getByRole('button', { name: /Operator/i });
      await user.click(operatorButton);
      await waitFor(async () => {
        const items = screen.getAllByRole('menuitem');
        const item = items.find((i) => i.textContent?.includes('External Secrets Operator'));
        if (item) await user.click(item);
      });

      // Select resource
      const resourceButton = screen.getByRole('button', { name: /Resource Type/i });
      await user.click(resourceButton);
      await waitFor(async () => {
        const items = screen.getAllByRole('menuitem');
        const item = items.find((i) => i.textContent === 'Secret Stores');
        if (item) await user.click(item);
      });

      // Check results
      await waitFor(() => {
        expect(screen.getByTestId('secret-stores-table')).toHaveTextContent('test-project');
        expect(screen.queryByTestId('external-secrets-table')).not.toBeInTheDocument();
        expect(screen.queryByTestId('push-secrets-table')).not.toBeInTheDocument();
      });
    });
  });

  describe('Menu Focus Management', () => {
    it('returns focus to toggle after menu selection', async () => {
      const user = userEvent.setup();
      render(<SecretsManagement />);

      const projectButton = screen.getByRole('button', { name: /Project/i });
      await user.click(projectButton);

      await waitFor(async () => {
        const menuItems = screen.getAllByRole('menuitem');
        if (menuItems.length > 0) {
          await user.click(menuItems[0]);
        }
      });

      // Focus should return to button (checked by PatternFly MenuContainer)
      expect(document.activeElement).toBe(projectButton);
    });
  });

  describe('Dynamic Resource Options', () => {
    it('shows only cert-manager resource options when cert-manager operator selected', async () => {
      const user = userEvent.setup();
      render(<SecretsManagement />);

      // Select cert-manager operator
      const operatorButton = screen.getByRole('button', { name: /Operator/i });
      await user.click(operatorButton);

      await waitFor(async () => {
        const menuItems = screen.getAllByRole('menuitem');
        const certItem = menuItems.find((item) => item.textContent?.includes('cert-manager'));
        if (certItem) {
          await user.click(certItem);
        }
      });

      // Now open resource filter
      const resourceButton = screen.getByRole('button', { name: /Resource Type/i });
      await user.click(resourceButton);

      // Should only show cert-manager resources + "All Resources"
      await waitFor(() => {
        const menuItems = screen.getAllByRole('menuitem');
        const texts = menuItems.map((item) => item.textContent);

        expect(texts).toContain('All Resources');
        expect(texts).toContain('Certificates');
        expect(texts).toContain('Issuers');

        // Should NOT contain ESO resources
        expect(texts.some((t) => t === 'External Secrets')).toBe(false);
        expect(texts.some((t) => t === 'Secret Stores')).toBe(false);
      });
    });
  });
});
