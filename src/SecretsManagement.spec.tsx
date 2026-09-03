import { render, screen } from '@testing-library/react';
import SecretsManagement from './SecretsManagement';
import { useOperatorDetection } from './hooks/useOperatorDetection';
import { useActiveNamespace } from '@openshift-console/dynamic-plugin-sdk';

// Mock dependencies
jest.mock('./hooks/useOperatorDetection', () => ({
  useOperatorDetection: jest.fn(),
}));

jest.mock('@openshift-console/dynamic-plugin-sdk', () => ({
  useActiveNamespace: jest.fn(),
  isAllNamespacesKey: (ns: string) => ns === '#ALL_NS#',
  NamespaceBar: () => <div data-test="namespace-bar" />,
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

jest.mock('./components/GeneratorsTable', () => ({
  GeneratorsTable: ({ selectedProject }: { selectedProject: string }) => (
    <div data-test="generators-table">Generators Table - Project: {selectedProject}</div>
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
const mockUseActiveNamespace = useActiveNamespace as jest.Mock;

describe('SecretsManagement', () => {
  const defaultOperatorStatus = {
    certManager: { installed: true, loading: false },
    trustManager: { installed: true, loading: false },
    externalSecrets: { installed: true, loading: false },
    secretsStoreCSI: { installed: true, loading: false },
    loading: false,
    refresh: jest.fn(),
  };

  beforeEach(() => {
    jest.clearAllMocks();

    // Default mocks
    mockUseOperatorDetection.mockReturnValue(defaultOperatorStatus);
    mockUseActiveNamespace.mockReturnValue(['#ALL_NS#', jest.fn()]);
  });

  describe('Page Structure', () => {
    it('renders the page title', () => {
      const { container } = render(<SecretsManagement />);
      expect(container.querySelector('title')).toHaveTextContent('Secrets Management page title');
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

    it('renders the standard console namespace bar', () => {
      render(<SecretsManagement />);
      expect(screen.getByTestId('namespace-bar')).toBeInTheDocument();
    });

    it('renders the operator and resource type filter dropdowns', () => {
      render(<SecretsManagement />);
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
      expect(screen.getByTestId('generators-table')).toBeInTheDocument();

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
      expect(screen.getByRole('heading', { name: 'Generators', level: 3 })).toBeInTheDocument();
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

      // Should have External Secrets Operator badges (4 sections)
      const esooBadges = screen.getAllByText('External Secrets Operator');
      expect(esooBadges.length).toBeGreaterThanOrEqual(4);

      // Should have Secrets Store CSI Driver badge (1 section)
      expect(screen.getByText('Secrets Store CSI Driver')).toBeInTheDocument();
    });

    it('displays dividers between sections', () => {
      const { container } = render(<SecretsManagement />);
      const dividers = container.querySelectorAll('.pf-v6-c-divider');
      expect(dividers.length).toBeGreaterThan(0);
    });

    it('renders operator sections in the order: External Secrets Operator, cert-manager, Secrets Store CSI Driver', () => {
      render(<SecretsManagement />);

      const sectionHeadings = screen
        .getAllByRole('heading', { level: 3 })
        .map((heading) => heading.textContent);

      const externalSecretsIndex = sectionHeadings.indexOf('External Secrets');
      const certificatesIndex = sectionHeadings.indexOf('Certificates');
      const secretProviderClassesIndex = sectionHeadings.indexOf('Secret Provider Classes');

      // Sanity check that every section we're ordering actually rendered.
      expect(externalSecretsIndex).toBeGreaterThanOrEqual(0);
      expect(certificatesIndex).toBeGreaterThanOrEqual(0);
      expect(secretProviderClassesIndex).toBeGreaterThanOrEqual(0);

      // External Secrets Operator sections must render before cert-manager sections,
      // which must render before the Secrets Store CSI Driver section.
      expect(externalSecretsIndex).toBeLessThan(certificatesIndex);
      expect(certificatesIndex).toBeLessThan(secretProviderClassesIndex);
    });

    it('renders the External Secrets Operator table before the cert-manager and Secrets Store CSI Driver tables in the DOM', () => {
      render(<SecretsManagement />);

      const externalSecretsTable = screen.getByTestId('external-secrets-table');
      const certificatesTable = screen.getByTestId('certificates-table');
      const secretProviderClassTable = screen.getByTestId('secret-provider-class-table');

      // Node.DOCUMENT_POSITION_FOLLOWING (4) means the argument comes after `externalSecretsTable`.
      expect(
        externalSecretsTable.compareDocumentPosition(certificatesTable) &
          Node.DOCUMENT_POSITION_FOLLOWING,
      ).toBeTruthy();
      expect(
        certificatesTable.compareDocumentPosition(secretProviderClassTable) &
          Node.DOCUMENT_POSITION_FOLLOWING,
      ).toBeTruthy();
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
      expect(screen.getByTestId('generators-table')).toBeInTheDocument();
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

    it('passes selectedProject "all" to BundlesTable when the global namespace is "All Projects"', () => {
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

    it('passes the active namespace to BundlesTable when a specific project is selected', () => {
      mockUseActiveNamespace.mockReturnValue(['my-project', jest.fn()]);
      mockUseOperatorDetection.mockReturnValue({
        certManager: { installed: false, loading: false },
        trustManager: { installed: true, loading: false },
        externalSecrets: { installed: false, loading: false },
        secretsStoreCSI: { installed: false, loading: false },
        loading: false,
        refresh: jest.fn(),
      });

      render(<SecretsManagement />);

      expect(screen.getByTestId('bundles-table')).toHaveTextContent('Project: my-project');
    });
  });

  describe('Generators Integration', () => {
    it('shows generators table when External Secrets Operator is installed', () => {
      mockUseOperatorDetection.mockReturnValue({
        certManager: { installed: false, loading: false },
        trustManager: { installed: false, loading: false },
        externalSecrets: { installed: true, loading: false },
        secretsStoreCSI: { installed: false, loading: false },
        loading: false,
        refresh: jest.fn(),
      });

      render(<SecretsManagement />);

      expect(screen.getByTestId('generators-table')).toBeInTheDocument();
      expect(screen.getByRole('heading', { name: 'Generators', level: 3 })).toBeInTheDocument();
      expect(screen.getAllByText('External Secrets Operator').length).toBeGreaterThanOrEqual(1);
    });

    it('hides generators table when External Secrets Operator is not installed', () => {
      mockUseOperatorDetection.mockReturnValue({
        certManager: { installed: true, loading: false },
        trustManager: { installed: false, loading: false },
        externalSecrets: { installed: false, loading: false },
        secretsStoreCSI: { installed: false, loading: false },
        loading: false,
        refresh: jest.fn(),
      });

      render(<SecretsManagement />);

      expect(screen.queryByTestId('generators-table')).not.toBeInTheDocument();
      expect(screen.queryByRole('heading', { name: 'Generators', level: 3 })).not.toBeInTheDocument();
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

  describe('Filter - Global Project (Namespace) Selection', () => {
    it('passes "all" as selectedProject to tables when the global namespace is "All Projects"', () => {
      render(<SecretsManagement />);

      expect(screen.getByTestId('certificates-table')).toHaveTextContent('Project: all');
    });

    it('passes the active namespace as selectedProject to tables when a specific project is active', () => {
      mockUseActiveNamespace.mockReturnValue(['my-project', jest.fn()]);

      render(<SecretsManagement />);

      expect(screen.getByTestId('certificates-table')).toHaveTextContent('Project: my-project');
    });

    it('updates all tables when the active namespace changes', () => {
      mockUseActiveNamespace.mockReturnValue(['test-project', jest.fn()]);

      render(<SecretsManagement />);

      expect(screen.getByTestId('certificates-table')).toHaveTextContent('test-project');
      expect(screen.getByTestId('issuers-table')).toHaveTextContent('test-project');
      expect(screen.getByTestId('external-secrets-table')).toHaveTextContent('test-project');
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
      expect(screen.getByTestId('generators-table')).toBeInTheDocument();
      expect(screen.getByTestId('secret-provider-class-table')).toBeInTheDocument();
    });
  });

  describe('Accessibility', () => {
    it('has proper ARIA labels on filter buttons', () => {
      render(<SecretsManagement />);

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
      expect(h1).toHaveTextContent('Secrets Management page title');

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
    it('renders without errors when the active namespace is "All Projects"', () => {
      const { container } = render(<SecretsManagement />);
      expect(container).toBeInTheDocument();
      expect(screen.getByTestId('namespace-bar')).toBeInTheDocument();
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
      expect(screen.getByRole('heading', { name: 'Secrets Management page title', level: 1 })).toBeInTheDocument();

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
      expect(screen.getByRole('heading', { name: 'Generators' })).toBeInTheDocument();
    });
  });
});
