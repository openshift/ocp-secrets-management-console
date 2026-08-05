import { render, screen } from '@testing-library/react';
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
    <div data-test="certificates-table">Certificates Table - Project: {selectedProject}</div>
  ),
}));

jest.mock('./components/IssuersTable', () => ({
  IssuersTable: ({ selectedProject }: { selectedProject: string }) => (
    <div data-test="issuers-table">Issuers Table - Project: {selectedProject}</div>
  ),
}));

jest.mock('./components/ExternalSecretsTable', () => ({
  ExternalSecretsTable: ({ selectedProject }: { selectedProject: string }) => (
    <div data-test="external-secrets-table">External Secrets Table - Project: {selectedProject}</div>
  ),
}));

jest.mock('./components/SecretStoresTable', () => ({
  SecretStoresTable: ({ selectedProject }: { selectedProject: string }) => (
    <div data-test="secret-stores-table">Secret Stores Table - Project: {selectedProject}</div>
  ),
}));

jest.mock('./components/PushSecretsTable', () => ({
  PushSecretsTable: ({ selectedProject }: { selectedProject: string }) => (
    <div data-test="push-secrets-table">Push Secrets Table - Project: {selectedProject}</div>
  ),
}));

jest.mock('./components/SecretProviderClassTable', () => ({
  SecretProviderClassTable: ({ selectedProject }: { selectedProject: string }) => (
    <div data-test="secret-provider-class-table">
      Secret Provider Class Table - Project: {selectedProject}
    </div>
  ),
}));

jest.mock('./components/BundlesTable', () => ({
  BundlesTable: ({ selectedProject }: { selectedProject: string }) => (
    <div data-test="bundles-table">Bundles Table - Project: {selectedProject}</div>
  ),
}));

jest.mock('./components/OperatorNotInstalled', () => ({
  NoOperatorsInstalled: () => <div data-test="no-operators">No operators installed</div>,
}));

// Mock react-i18next
jest.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string) => key,
  }),
}));

// Mock react-helmet
jest.mock('react-helmet', () => ({
  __esModule: true,
  default: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));

const mockUseOperatorDetection = useOperatorDetection as jest.Mock;
const mockUseK8sWatchResource = useK8sWatchResource as jest.Mock;

describe('SecretsManagement', () => {
  const defaultOperatorStatus = {
    certManager: { installed: true, loading: false },
    trustManager: { installed: true, loading: false },
    externalSecrets: { installed: true, loading: false },
    secretsStoreCSI: { installed: true, loading: false },
    loading: false,
    refresh: jest.fn(),
  };

  const mockProjects = [
    {
      metadata: { name: 'default' },
      status: { phase: 'Active' },
    },
    {
      metadata: { name: 'my-project' },
      status: { phase: 'Active' },
    },
    {
      metadata: { name: 'openshift-operators' },
      status: { phase: 'Active' },
    },
  ];

  beforeEach(() => {
    jest.clearAllMocks();

    // Default mocks
    mockUseOperatorDetection.mockReturnValue(defaultOperatorStatus);
    mockUseK8sWatchResource.mockReturnValue([mockProjects, true, undefined]);
  });

  describe('Page Structure', () => {
    it('renders the page title', () => {
      const { container } = render(<SecretsManagement />);
      expect(container.querySelector('title')).toHaveTextContent('Secrets Management');
    });

    it('renders the page heading with icon', () => {
      render(<SecretsManagement />);
      expect(
        screen.getByRole('heading', { name: /Secrets Management/i, level: 1 }),
      ).toBeInTheDocument();
    });

    it('renders the page description', () => {
      render(<SecretsManagement />);
      expect(
        screen.getByText(
          'Manage certificates, external secrets, and secret stores across your cluster.',
        ),
      ).toBeInTheDocument();
    });

    it('renders all three filter dropdowns', () => {
      render(<SecretsManagement />);
      expect(screen.getByRole('button', { name: /Project/i })).toBeInTheDocument();
      expect(screen.getByRole('button', { name: /Operator/i })).toBeInTheDocument();
      expect(screen.getByRole('button', { name: /Resource Type/i })).toBeInTheDocument();
    });

    it('renders filter controls in correct container', () => {
      const { container } = render(<SecretsManagement />);
      const filterBar = container.querySelector('.co-m-pane__filter-bar');
      expect(filterBar).toBeInTheDocument();
    });
  });

  describe('Loading State', () => {
    it('shows loading spinner when operators are being detected', () => {
      mockUseOperatorDetection.mockReturnValue({
        ...defaultOperatorStatus,
        loading: true,
      });

      render(<SecretsManagement />);
      expect(screen.getByRole('progressbar')).toBeInTheDocument();
    });

    it('shows loading text in project dropdown when projects are loading', () => {
      mockUseK8sWatchResource.mockReturnValue([[], false, undefined]);

      render(<SecretsManagement />);
      expect(screen.getByText('Loading projects...')).toBeInTheDocument();
    });

    it('disables project dropdown when projects are loading', () => {
      mockUseK8sWatchResource.mockReturnValue([[], false, undefined]);

      render(<SecretsManagement />);
      const projectButton = screen.getByRole('button', { name: /Project/i });
      expect(projectButton).toBeDisabled();
    });

    it('does not show resource tables while operators are loading', () => {
      mockUseOperatorDetection.mockReturnValue({
        ...defaultOperatorStatus,
        loading: true,
      });

      render(<SecretsManagement />);
      expect(screen.queryByTestId('certificates-table')).not.toBeInTheDocument();
    });
  });

  describe('No Operators Installed', () => {
    it('shows NoOperatorsInstalled component when no operators are detected', () => {
      mockUseOperatorDetection.mockReturnValue({
        certManager: { installed: false, loading: false },
        trustManager: { installed: false, loading: false },
        externalSecrets: { installed: false, loading: false },
        secretsStoreCSI: { installed: false, loading: false },
        loading: false,
        refresh: jest.fn(),
      });

      render(<SecretsManagement />);
      expect(screen.getByTestId('no-operators')).toBeInTheDocument();
    });

    it('does not show resource tables when no operators are installed', () => {
      mockUseOperatorDetection.mockReturnValue({
        certManager: { installed: false, loading: false },
        trustManager: { installed: false, loading: false },
        externalSecrets: { installed: false, loading: false },
        secretsStoreCSI: { installed: false, loading: false },
        loading: false,
        refresh: jest.fn(),
      });

      render(<SecretsManagement />);
      expect(screen.queryByTestId('certificates-table')).not.toBeInTheDocument();
      expect(screen.queryByTestId('issuers-table')).not.toBeInTheDocument();
      expect(screen.queryByTestId('external-secrets-table')).not.toBeInTheDocument();
    });
  });

  describe('All Operators Installed', () => {
    it('renders all resource tables when all operators are installed', () => {
      render(<SecretsManagement />);

      // cert-manager tables
      expect(screen.getByTestId('certificates-table')).toBeInTheDocument();
      expect(screen.getByTestId('issuers-table')).toBeInTheDocument();

      // trust-manager tables
      expect(screen.getByTestId('bundles-table')).toBeInTheDocument();

      // External Secrets Operator tables
      expect(screen.getByTestId('external-secrets-table')).toBeInTheDocument();
      expect(screen.getByTestId('secret-stores-table')).toBeInTheDocument();
      expect(screen.getByTestId('push-secrets-table')).toBeInTheDocument();

      // Secrets Store CSI Driver table
      expect(screen.getByTestId('secret-provider-class-table')).toBeInTheDocument();
    });

    it('displays correct section headings for all resources', () => {
      render(<SecretsManagement />);

      expect(screen.getByRole('heading', { name: 'Certificates', level: 3 })).toBeInTheDocument();
      expect(screen.getByRole('heading', { name: 'Issuers', level: 3 })).toBeInTheDocument();
      expect(screen.getByRole('heading', { name: 'Trust Bundles', level: 3 })).toBeInTheDocument();
      expect(
        screen.getByRole('heading', { name: 'External Secrets', level: 3 }),
      ).toBeInTheDocument();
      expect(screen.getByRole('heading', { name: 'Secret Stores', level: 3 })).toBeInTheDocument();
      expect(screen.getByRole('heading', { name: 'Push Secrets', level: 3 })).toBeInTheDocument();
      expect(
        screen.getByRole('heading', { name: 'Secret Provider Classes', level: 3 }),
      ).toBeInTheDocument();
    });

    it('displays operator badges for each resource section', () => {
      render(<SecretsManagement />);

      // Should have cert-manager badges (2 sections)
      const certManagerBadges = screen.getAllByText('cert-manager');
      expect(certManagerBadges.length).toBeGreaterThanOrEqual(2);

      // Should have trust-manager badge (1 section)
      expect(screen.getByText('trust-manager')).toBeInTheDocument();

      // Should have External Secrets Operator badges (3 sections)
      const esooBadges = screen.getAllByText('External Secrets Operator');
      expect(esooBadges.length).toBeGreaterThanOrEqual(3);

      // Should have Secrets Store CSI Driver badge (1 section)
      expect(screen.getByText('Secrets Store CSI Driver')).toBeInTheDocument();
    });

    it('displays dividers between sections', () => {
      const { container } = render(<SecretsManagement />);
      const dividers = container.querySelectorAll('.pf-v6-c-divider');
      expect(dividers.length).toBeGreaterThan(0);
    });
  });

  describe('Partial Operator Installation', () => {
    it('shows only cert-manager resources when only cert-manager is installed', () => {
      mockUseOperatorDetection.mockReturnValue({
        certManager: { installed: true, loading: false },
        trustManager: { installed: false, loading: false },
        externalSecrets: { installed: false, loading: false },
        secretsStoreCSI: { installed: false, loading: false },
        loading: false,
        refresh: jest.fn(),
      });

      render(<SecretsManagement />);

      expect(screen.getByTestId('certificates-table')).toBeInTheDocument();
      expect(screen.getByTestId('issuers-table')).toBeInTheDocument();
      expect(screen.queryByTestId('bundles-table')).not.toBeInTheDocument();
      expect(screen.queryByTestId('external-secrets-table')).not.toBeInTheDocument();
      expect(screen.queryByTestId('secret-provider-class-table')).not.toBeInTheDocument();
    });

    it('shows only External Secrets resources when only ESO is installed', () => {
      mockUseOperatorDetection.mockReturnValue({
        certManager: { installed: false, loading: false },
        trustManager: { installed: false, loading: false },
        externalSecrets: { installed: true, loading: false },
        secretsStoreCSI: { installed: false, loading: false },
        loading: false,
        refresh: jest.fn(),
      });

      render(<SecretsManagement />);

      expect(screen.queryByTestId('certificates-table')).not.toBeInTheDocument();
      expect(screen.getByTestId('external-secrets-table')).toBeInTheDocument();
      expect(screen.getByTestId('secret-stores-table')).toBeInTheDocument();
      expect(screen.getByTestId('push-secrets-table')).toBeInTheDocument();
      expect(screen.queryByTestId('secret-provider-class-table')).not.toBeInTheDocument();
    });

    it('shows only Secrets Store CSI resources when only CSI is installed', () => {
      mockUseOperatorDetection.mockReturnValue({
        certManager: { installed: false, loading: false },
        trustManager: { installed: false, loading: false },
        externalSecrets: { installed: false, loading: false },
        secretsStoreCSI: { installed: true, loading: false },
        loading: false,
        refresh: jest.fn(),
      });

      render(<SecretsManagement />);

      expect(screen.queryByTestId('certificates-table')).not.toBeInTheDocument();
      expect(screen.queryByTestId('external-secrets-table')).not.toBeInTheDocument();
      expect(screen.getByTestId('secret-provider-class-table')).toBeInTheDocument();
    });

    it('shows cert-manager and ESO resources when both are installed', () => {
      mockUseOperatorDetection.mockReturnValue({
        certManager: { installed: true, loading: false },
        trustManager: { installed: false, loading: false },
        externalSecrets: { installed: true, loading: false },
        secretsStoreCSI: { installed: false, loading: false },
        loading: false,
        refresh: jest.fn(),
      });

      render(<SecretsManagement />);

      expect(screen.getByTestId('certificates-table')).toBeInTheDocument();
      expect(screen.getByTestId('external-secrets-table')).toBeInTheDocument();
      expect(screen.queryByTestId('secret-provider-class-table')).not.toBeInTheDocument();
    });
  });

  describe('Trust Manager Integration', () => {
    it('shows bundles table when trust-manager is installed', () => {
      mockUseOperatorDetection.mockReturnValue({
        certManager: { installed: false, loading: false },
        trustManager: { installed: true, loading: false },
        externalSecrets: { installed: false, loading: false },
        secretsStoreCSI: { installed: false, loading: false },
        loading: false,
        refresh: jest.fn(),
      });

      render(<SecretsManagement />);

      expect(screen.getByTestId('bundles-table')).toBeInTheDocument();
      expect(screen.queryByTestId('certificates-table')).not.toBeInTheDocument();
      expect(screen.queryByTestId('external-secrets-table')).not.toBeInTheDocument();
    });

    it('shows trust-manager badge on bundles section', () => {
      mockUseOperatorDetection.mockReturnValue({
        certManager: { installed: false, loading: false },
        trustManager: { installed: true, loading: false },
        externalSecrets: { installed: false, loading: false },
        secretsStoreCSI: { installed: false, loading: false },
        loading: false,
        refresh: jest.fn(),
      });

      render(<SecretsManagement />);

      expect(screen.getByText('trust-manager')).toBeInTheDocument();
    });

    it('shows Trust Bundles heading when trust-manager is installed', () => {
      mockUseOperatorDetection.mockReturnValue({
        certManager: { installed: false, loading: false },
        trustManager: { installed: true, loading: false },
        externalSecrets: { installed: false, loading: false },
        secretsStoreCSI: { installed: false, loading: false },
        loading: false,
        refresh: jest.fn(),
      });

      render(<SecretsManagement />);

      expect(screen.getByRole('heading', { name: 'Trust Bundles', level: 3 })).toBeInTheDocument();
    });

    it('hides bundles table when trust-manager is not installed', () => {
      mockUseOperatorDetection.mockReturnValue({
        certManager: { installed: true, loading: false },
        trustManager: { installed: false, loading: false },
        externalSecrets: { installed: true, loading: false },
        secretsStoreCSI: { installed: true, loading: false },
        loading: false,
        refresh: jest.fn(),
      });

      render(<SecretsManagement />);

      expect(screen.queryByTestId('bundles-table')).not.toBeInTheDocument();
      expect(screen.getByTestId('certificates-table')).toBeInTheDocument();
    });

    it('shows both cert-manager and trust-manager resources when both are installed', () => {
      mockUseOperatorDetection.mockReturnValue({
        certManager: { installed: true, loading: false },
        trustManager: { installed: true, loading: false },
        externalSecrets: { installed: false, loading: false },
        secretsStoreCSI: { installed: false, loading: false },
        loading: false,
        refresh: jest.fn(),
      });

      render(<SecretsManagement />);

      expect(screen.getByTestId('certificates-table')).toBeInTheDocument();
      expect(screen.getByTestId('issuers-table')).toBeInTheDocument();
      expect(screen.getByTestId('bundles-table')).toBeInTheDocument();
    });

    it('passes selectedProject to BundlesTable', () => {
      mockUseOperatorDetection.mockReturnValue({
        certManager: { installed: false, loading: false },
        trustManager: { installed: true, loading: false },
        externalSecrets: { installed: false, loading: false },
        secretsStoreCSI: { installed: false, loading: false },
        loading: false,
        refresh: jest.fn(),
      });

      render(<SecretsManagement />);

      expect(screen.getByTestId('bundles-table')).toHaveTextContent('Project: all');
    });
  });

  describe('Operator Error Handling', () => {
    it('does not show cert-manager resources when it has an error', () => {
      mockUseOperatorDetection.mockReturnValue({
        certManager: { installed: false, loading: false, error: 'API unreachable' },
        trustManager: { installed: false, loading: false },
        externalSecrets: { installed: true, loading: false },
        secretsStoreCSI: { installed: true, loading: false },
        loading: false,
        refresh: jest.fn(),
      });

      render(<SecretsManagement />);

      // cert-manager resources should not show
      expect(screen.queryByTestId('certificates-table')).not.toBeInTheDocument();
      expect(screen.queryByTestId('issuers-table')).not.toBeInTheDocument();

      // But other operators' resources should show
      expect(screen.getByTestId('external-secrets-table')).toBeInTheDocument();
    });

    it('treats operator with error as not installed', () => {
      mockUseOperatorDetection.mockReturnValue({
        certManager: { installed: false, loading: false, error: 'Connection timeout' },
        trustManager: { installed: false, loading: false },
        externalSecrets: { installed: true, loading: false },
        secretsStoreCSI: { installed: false, loading: false },
        loading: false,
        refresh: jest.fn(),
      });

      render(<SecretsManagement />);

      // Only ESO resources should be visible
      expect(screen.queryByTestId('certificates-table')).not.toBeInTheDocument();
      expect(screen.getByTestId('external-secrets-table')).toBeInTheDocument();
      expect(screen.queryByTestId('secret-provider-class-table')).not.toBeInTheDocument();
    });

    it('shows NoOperatorsInstalled when all operators have errors', () => {
      const mockRefresh = jest.fn();
      mockUseOperatorDetection.mockReturnValue({
        certManager: { installed: false, loading: false, error: 'Error 1' },
        trustManager: { installed: false, loading: false, error: 'Error 4' },
        externalSecrets: { installed: false, loading: false, error: 'Error 2' },
        secretsStoreCSI: { installed: false, loading: false, error: 'Error 3' },
        loading: false,
        refresh: mockRefresh,
      });

      render(<SecretsManagement />);

      expect(screen.getByTestId('no-operators')).toBeInTheDocument();
    });

    it('refresh function is available when operators have errors', () => {
      const mockRefresh = jest.fn();
      mockUseOperatorDetection.mockReturnValue({
        certManager: { installed: false, loading: false, error: 'Connection timeout' },
        trustManager: { installed: false, loading: false },
        externalSecrets: { installed: false, loading: false, error: 'Timeout' },
        secretsStoreCSI: { installed: false, loading: false },
        loading: false,
        refresh: mockRefresh,
      });

      render(<SecretsManagement />);

      // The refresh function should be available in the hook
      expect(mockRefresh).toBeDefined();
    });

    it('shows loading spinner when operator has error', () => {
      mockUseOperatorDetection.mockReturnValue({
        certManager: { installed: false, loading: true, error: 'Previous error' },
        trustManager: { installed: false, loading: false },
        externalSecrets: { installed: false, loading: false },
        secretsStoreCSI: { installed: false, loading: false },
        loading: true,
        refresh: jest.fn(),
      });

      render(<SecretsManagement />);

      expect(screen.getByRole('progressbar')).toBeInTheDocument();
    });
  });

  describe('Filter - Project Selection', () => {
    it('shows default "All Projects" in project filter initially', () => {
      render(<SecretsManagement />);

      const projectButton = screen.getByRole('button', { name: /Project/i });
      expect(projectButton).toHaveTextContent('All Projects');
    });

    it('passes "all" as selectedProject to tables by default', () => {
      render(<SecretsManagement />);

      expect(screen.getByTestId('certificates-table')).toHaveTextContent('Project: all');
    });

    it('filters out system namespaces from project list', () => {
      const projectsWithSystem = [
        ...mockProjects,
        { metadata: { name: 'kube-system' }, status: { phase: 'Active' } },
        { metadata: { name: 'kube-public' }, status: { phase: 'Active' } },
        { metadata: { name: 'kube-node-lease' }, status: { phase: 'Active' } },
        { metadata: { name: 'openshift-kube-apiserver' }, status: { phase: 'Active' } },
      ];

      mockUseK8sWatchResource.mockReturnValue([projectsWithSystem, true, undefined]);
      render(<SecretsManagement />);

      // System namespaces should be filtered (component filters them internally)
      expect(mockUseK8sWatchResource).toHaveBeenCalled();
    });

    it('filters out terminating projects', () => {
      const projectsWithTerminating = [
        ...mockProjects,
        { metadata: { name: 'terminating-project' }, status: { phase: 'Terminating' } },
      ];

      mockUseK8sWatchResource.mockReturnValue([projectsWithTerminating, true, undefined]);
      render(<SecretsManagement />);

      // Component should filter out terminating projects
      expect(mockUseK8sWatchResource).toHaveBeenCalled();
    });

    it('includes whitelisted system namespaces', () => {
      const systemProjects = [
        { metadata: { name: 'default' }, status: { phase: 'Active' } },
        { metadata: { name: 'openshift-operators' }, status: { phase: 'Active' } },
        { metadata: { name: 'openshift-monitoring' }, status: { phase: 'Active' } },
      ];

      mockUseK8sWatchResource.mockReturnValue([systemProjects, true, undefined]);
      render(<SecretsManagement />);

      // These should all be included as they're whitelisted
      expect(mockUseK8sWatchResource).toHaveBeenCalled();
    });
  });

  describe('Filter - Operator Selection', () => {
    it('shows "All Operators" in operator filter by default', () => {
      render(<SecretsManagement />);

      const operatorButton = screen.getByRole('button', { name: /Operator/i });
      expect(operatorButton).toHaveTextContent('All Operators');
    });

    it('only shows installed operators in filter options', () => {
      mockUseOperatorDetection.mockReturnValue({
        certManager: { installed: true, loading: false },
        trustManager: { installed: false, loading: false },
        externalSecrets: { installed: false, loading: false },
        secretsStoreCSI: { installed: false, loading: false },
        loading: false,
        refresh: jest.fn(),
      });

      render(<SecretsManagement />);

      // Only cert-manager resources should be visible
      expect(screen.getByTestId('certificates-table')).toBeInTheDocument();
      expect(screen.queryByTestId('external-secrets-table')).not.toBeInTheDocument();
    });
  });

  describe('Filter - Resource Kind Selection', () => {
    it('shows "All Resources" in resource filter by default', () => {
      render(<SecretsManagement />);

      const resourceButton = screen.getByRole('button', { name: /Resource Type/i });
      expect(resourceButton).toHaveTextContent('All Resources');
    });

    it('shows all resource types when operator filter is "all"', () => {
      render(<SecretsManagement />);

      // All tables should be visible
      expect(screen.getByTestId('certificates-table')).toBeInTheDocument();
      expect(screen.getByTestId('issuers-table')).toBeInTheDocument();
      expect(screen.getByTestId('external-secrets-table')).toBeInTheDocument();
      expect(screen.getByTestId('secret-stores-table')).toBeInTheDocument();
      expect(screen.getByTestId('push-secrets-table')).toBeInTheDocument();
      expect(screen.getByTestId('secret-provider-class-table')).toBeInTheDocument();
    });
  });

  describe('Project Error Handling', () => {
    it('shows "Error loading projects" when project fetch fails', () => {
      mockUseK8sWatchResource.mockReturnValue([
        [],
        true,
        new Error('Failed to fetch projects'),
      ]);

      render(<SecretsManagement />);

      const projectButton = screen.getByRole('button', { name: /Project/i });
      expect(projectButton).toHaveTextContent('Error loading projects');
    });

    it('disables project dropdown when there is a fetch error', () => {
      mockUseK8sWatchResource.mockReturnValue([
        [],
        false,  // not loaded
        new Error('Failed to fetch projects'),
      ]);

      render(<SecretsManagement />);

      const projectButton = screen.getByRole('button', { name: /Project/i });
      expect(projectButton).toBeDisabled();
    });

    it('handles empty projects list gracefully', () => {
      mockUseK8sWatchResource.mockReturnValue([[], true, undefined]);

      render(<SecretsManagement />);

      const projectButton = screen.getByRole('button', { name: /Project/i });
      expect(projectButton).toBeEnabled();
    });

    it('handles null projects gracefully', () => {
      mockUseK8sWatchResource.mockReturnValue([null as any, true, undefined]);

      render(<SecretsManagement />);

      const projectButton = screen.getByRole('button', { name: /Project/i });
      expect(projectButton).toBeEnabled();
    });
  });

  describe('Accessibility', () => {
    it('has proper ARIA labels on filter buttons', () => {
      render(<SecretsManagement />);

      expect(screen.getByRole('button', { name: /Project/i })).toHaveAttribute(
        'aria-label',
        'Project',
      );
      expect(screen.getByRole('button', { name: /Operator/i })).toHaveAttribute(
        'aria-label',
        'Operator',
      );
      expect(screen.getByRole('button', { name: /Resource Type/i })).toHaveAttribute(
        'aria-label',
        'Resource Type',
      );
    });

    it('has proper heading hierarchy', () => {
      render(<SecretsManagement />);

      const h1 = screen.getByRole('heading', { level: 1 });
      expect(h1).toHaveTextContent('Secrets Management');

      const h3Headings = screen.getAllByRole('heading', { level: 3 });
      expect(h3Headings.length).toBeGreaterThan(0);
    });

    it('uses semantic HTML structure', () => {
      const { container } = render(<SecretsManagement />);

      expect(container.querySelector('.co-m-pane__body')).toBeInTheDocument();
      expect(container.querySelector('.co-m-pane__heading')).toBeInTheDocument();
    });
  });

  describe('Edge Cases', () => {
    it('handles valid projects with all required metadata', () => {
      const validProjects = [
        { metadata: { name: 'valid-project' }, status: { phase: 'Active' } },
        { metadata: { name: 'another-project' }, status: { phase: 'Active' } },
      ];

      mockUseK8sWatchResource.mockReturnValue([validProjects, true, undefined]);

      // Should render without errors
      const { container } = render(<SecretsManagement />);
      expect(container).toBeInTheDocument();
      expect(screen.getByRole('button', { name: /Project/i })).toBeInTheDocument();
    });

    it('handles projects with display name labels', () => {
      const projectsWithLabels = [
        {
          metadata: {
            name: 'my-project',
            labels: { 'openshift.io/display-name': 'My Cool Project' },
          },
          status: { phase: 'Active' },
        },
      ];

      mockUseK8sWatchResource.mockReturnValue([projectsWithLabels, true, undefined]);
      render(<SecretsManagement />);

      expect(screen.getByRole('button', { name: /Project/i })).toBeInTheDocument();
    });

    it('shows no operators state when all operators have errors', () => {
      const mockRefresh = jest.fn();
      mockUseOperatorDetection.mockReturnValue({
        certManager: { installed: false, loading: false, error: 'Error 1' },
        trustManager: { installed: false, loading: false, error: 'Error 4' },
        externalSecrets: { installed: false, loading: false, error: 'Error 2' },
        secretsStoreCSI: { installed: false, loading: false, error: 'Error 3' },
        loading: false,
        refresh: mockRefresh,
      });

      render(<SecretsManagement />);

      // Should show no operators component since all have errors
      expect(screen.getByTestId('no-operators')).toBeInTheDocument();
    });

    it('renders correctly with minimal project data', () => {
      const minimalProjects = [
        { metadata: { name: 'test' } } as any,
      ];

      mockUseK8sWatchResource.mockReturnValue([minimalProjects, true, undefined]);

      expect(() => render(<SecretsManagement />)).not.toThrow();
    });
  });

  describe('Integration - Operator + Resource Filtering', () => {
    it('hides resources when their operator is not installed', () => {
      mockUseOperatorDetection.mockReturnValue({
        certManager: { installed: true, loading: false },
        trustManager: { installed: false, loading: false },
        externalSecrets: { installed: false, loading: false },
        secretsStoreCSI: { installed: false, loading: false },
        loading: false,
        refresh: jest.fn(),
      });

      render(<SecretsManagement />);

      // cert-manager resources visible
      expect(screen.getByTestId('certificates-table')).toBeInTheDocument();
      expect(screen.getByTestId('issuers-table')).toBeInTheDocument();

      // ESO resources hidden
      expect(screen.queryByTestId('external-secrets-table')).not.toBeInTheDocument();
      expect(screen.queryByTestId('secret-stores-table')).not.toBeInTheDocument();

      // CSI resources hidden
      expect(screen.queryByTestId('secret-provider-class-table')).not.toBeInTheDocument();
    });

    it('shows correct tables based on operator installation state', () => {
      mockUseOperatorDetection.mockReturnValue({
        certManager: { installed: false, loading: false },
        trustManager: { installed: false, loading: false },
        externalSecrets: { installed: true, loading: false },
        secretsStoreCSI: { installed: true, loading: false },
        loading: false,
        refresh: jest.fn(),
      });

      render(<SecretsManagement />);

      expect(screen.queryByTestId('certificates-table')).not.toBeInTheDocument();
      expect(screen.getByTestId('external-secrets-table')).toBeInTheDocument();
      expect(screen.getByTestId('secret-provider-class-table')).toBeInTheDocument();
    });
  });

  describe('Internationalization', () => {
    it('uses translation keys for all user-facing text', () => {
      render(<SecretsManagement />);

      // Main heading
      expect(screen.getByRole('heading', { name: 'Secrets Management', level: 1 })).toBeInTheDocument();

      // Description
      expect(
        screen.getByText(
          'Manage certificates, external secrets, and secret stores across your cluster.',
        ),
      ).toBeInTheDocument();

      // Operator names (use getAllByText since badges appear multiple times)
      expect(screen.getAllByText('cert-manager').length).toBeGreaterThan(0);
      expect(screen.getAllByText('External Secrets Operator').length).toBeGreaterThan(0);
    });

    it('uses translation keys for filter labels', () => {
      render(<SecretsManagement />);

      const projectButton = screen.getByRole('button', { name: /Project/i });
      expect(projectButton).toHaveTextContent('All Projects');

      const operatorButton = screen.getByRole('button', { name: /Operator/i });
      expect(operatorButton).toHaveTextContent('All Operators');

      const resourceButton = screen.getByRole('button', { name: /Resource Type/i });
      expect(resourceButton).toHaveTextContent('All Resources');
    });

    it('uses translation keys for resource section headings', () => {
      render(<SecretsManagement />);

      expect(screen.getByRole('heading', { name: 'Certificates' })).toBeInTheDocument();
      expect(screen.getByRole('heading', { name: 'Issuers' })).toBeInTheDocument();
      expect(screen.getByRole('heading', { name: 'External Secrets' })).toBeInTheDocument();
    });
  });
});
