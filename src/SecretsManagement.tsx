import * as React from 'react';
import { DocumentTitle } from '@openshift-console/dynamic-plugin-sdk';
import { useTranslation } from 'react-i18next';
import {
  Title,
  Divider,
  Badge,
  Flex,
  FlexItem,
  Menu,
  MenuContent,
  MenuList,
  MenuItem,
  MenuContainer,
  MenuToggle,
  Spinner,
  Tooltip,
  Alert,
  Button,
} from '@patternfly/react-core';
import { KeyIcon } from '@patternfly/react-icons';
import { CertificatesTable } from './components/CertificatesTable';
import { IssuersTable } from './components/IssuersTable';
import { BundlesTable } from './components/BundlesTable';
import { ExternalSecretsTable } from './components/ExternalSecretsTable';
import { SecretStoresTable } from './components/SecretStoresTable';
import { PushSecretsTable } from './components/PushSecretsTable';
import { SecretProviderClassTable } from './components/SecretProviderClassTable';
import { NoOperatorsInstalled } from './components/OperatorNotInstalled';
import { useK8sWatchResource } from '@openshift-console/dynamic-plugin-sdk';
import { useOperatorDetection, type OperatorStatus } from './hooks/useOperatorDetection';

/** Badge shown on card titles when operator detection encountered an error. */
const OperatorStatusBadge: React.FC<{ status: OperatorStatus }> = ({ status }) => {
  const { t } = useTranslation('plugin__ocp-secrets-management');
  if (status.error) {
    return (
      <Tooltip content={status.error}>
        <Badge
          isRead
          style={{
            marginLeft: '8px',
            backgroundColor: 'var(--pf-t--global--color--status--danger--default)',
          }}
        >
          {t('Check failed')}
        </Badge>
      </Tooltip>
    );
  }
  return null;
};

type OperatorType = 'cert-manager' | 'trust-manager' | 'external-secrets' | 'secrets-store-csi' | 'all';
type ResourceKind =
  | 'certificates'
  | 'issuers'
  | 'bundles'
  | 'externalsecrets'
  | 'secretstores'
  | 'pushsecrets'
  | 'secretproviderclasses'
  | 'all';
type ProjectType = 'all' | string;

// Project/Namespace resource model
const ProjectModel = {
  group: '',
  version: 'v1',
  kind: 'Namespace',
};

interface Project {
  metadata: {
    name: string;
    labels?: Record<string, string>;
    annotations?: Record<string, string>;
  };
  status?: {
    phase: string;
  };
}

interface FilterState {
  operator: OperatorType;
  resourceKind: ResourceKind;
  project: ProjectType;
}

export default function SecretsManagement() {
  const { t } = useTranslation('plugin__ocp-secrets-management');
  const [filters, setFilters] = React.useState<FilterState>({
    operator: 'all',
    resourceKind: 'all',
    project: 'all',
  });
  const [projectMenuOpen, setProjectMenuOpen] = React.useState(false);
  const [operatorMenuOpen, setOperatorMenuOpen] = React.useState(false);
  const [resourceKindMenuOpen, setResourceKindMenuOpen] = React.useState(false);
  const projectMenuRef = React.useRef<HTMLDivElement>(null);
  const projectToggleRef = React.useRef<HTMLButtonElement>(null);
  const operatorMenuRef = React.useRef<HTMLDivElement>(null);
  const operatorToggleRef = React.useRef<HTMLButtonElement>(null);
  const resourceKindMenuRef = React.useRef<HTMLDivElement>(null);
  const resourceKindToggleRef = React.useRef<HTMLButtonElement>(null);

  // Detect installed operators
  const {
    certManager,
    trustManager,
    externalSecrets,
    secretsStoreCSI,
    loading: operatorsLoading,
    refresh: checkOperators,
  } = useOperatorDetection();

  const isOperatorInstalled = (operator: OperatorType): boolean => {
    switch (operator) {
      case 'cert-manager':
        return certManager.installed;
      case 'trust-manager':
        return trustManager.installed;
      case 'external-secrets':
        return externalSecrets.installed;
      case 'secrets-store-csi':
        return secretsStoreCSI.installed;
      default:
        return true;
    }
  };

  const getOperatorStatus = (
    operatorKey: 'cert-manager' | 'trust-manager' | 'external-secrets' | 'secrets-store-csi',
  ) => {
    switch (operatorKey) {
      case 'cert-manager':
        return certManager;
      case 'trust-manager':
        return trustManager;
      case 'external-secrets':
        return externalSecrets;
      case 'secrets-store-csi':
        return secretsStoreCSI;
    }
  };

  const anyOperatorInstalled =
    certManager.installed ||
    trustManager.installed ||
    externalSecrets.installed ||
    secretsStoreCSI.installed;

  // Fetch all namespaces/projects dynamically
  const [projects, projectsLoaded, projectsError] = useK8sWatchResource<Project[]>({
    groupVersionKind: ProjectModel,
    isList: true,
  });

  const allOperatorEntries: { value: OperatorType; label: string; description: string }[] = [
    {
      value: 'cert-manager',
      label: 'cert-manager',
      description: t('Certificate lifecycle management'),
    },
    {
      value: 'trust-manager',
      label: 'trust-manager',
      description: t('CA trust bundle distribution'),
    },
    {
      value: 'external-secrets',
      label: 'External Secrets Operator',
      description: t('External secret synchronization'),
    },
    {
      value: 'secrets-store-csi',
      label: 'Secrets Store CSI Driver',
      description: t('Secret provider integration'),
    },
  ];

  const operatorOptions = [
    {
      value: 'all' as OperatorType,
      label: t('All Operators'),
      description: t('Show resources from all operators'),
    },
    ...allOperatorEntries.filter((entry) => isOperatorInstalled(entry.value)),
  ];

  // Generate dynamic project options from fetched namespaces
  const getProjectOptions = React.useMemo(() => {
    const baseOptions = [
      {
        value: 'all',
        label: t('All Projects'),
        description: t('Show resources from all projects'),
      },
    ];

    if (!projectsLoaded || projectsError || !projects) {
      return baseOptions;
    }

    // Filter and sort projects
    const sortedProjects = projects
      .filter((project) => {
        // Filter out system namespaces that are typically not user-relevant
        const name = project.metadata.name;
        const isSystemNamespace =
          name.startsWith('kube-') ||
          name.startsWith('openshift-') ||
          name === 'default' ||
          name === 'kube-node-lease' ||
          name === 'kube-public';

        // Include active projects only
        const isActive = !project.status || project.status.phase !== 'Terminating';

        return (
          isActive &&
          (!isSystemNamespace ||
            name === 'default' ||
            name === 'openshift-operators' ||
            name === 'openshift-monitoring')
        );
      })
      .sort((a, b) => {
        // Sort with common projects first, then alphabetically
        const commonProjects = ['default', 'openshift-operators', 'openshift-monitoring'];
        const aIsCommon = commonProjects.includes(a.metadata.name);
        const bIsCommon = commonProjects.includes(b.metadata.name);

        if (aIsCommon && !bIsCommon) return -1;
        if (!aIsCommon && bIsCommon) return 1;
        return a.metadata.name.localeCompare(b.metadata.name);
      });

    const projectOptions = sortedProjects.map((project) => ({
      value: project.metadata.name,
      label: project.metadata.name,
      description:
        project.metadata.labels?.['openshift.io/display-name'] ||
        `${t('Project')}: ${project.metadata.name}`,
    }));

    return [...baseOptions, ...projectOptions];
  }, [projects, projectsLoaded, projectsError, t]);

  const projectOptions = getProjectOptions;

  const certManagerResources = [
    { value: 'certificates', label: t('Certificates'), description: t('TLS certificates') },
    { value: 'issuers', label: t('Issuers'), description: t('Certificate issuers') },
  ];

  const trustManagerResources = [
    { value: 'bundles', label: t('Bundles'), description: t('CA trust bundles') },
  ];

  const externalSecretsResources = [
    {
      value: 'externalsecrets',
      label: t('External Secrets'),
      description: t('Secret synchronization rules'),
    },
    {
      value: 'secretstores',
      label: t('Secret Stores'),
      description: t('External secret backends'),
    },
    {
      value: 'pushsecrets',
      label: t('Push Secrets'),
      description: t('Secret push configurations'),
    },
  ];

  const secretsStoreCSIResources = [
    {
      value: 'secretproviderclasses',
      label: t('Secret Provider Classes'),
      description: t('Secret provider configurations'),
    },
  ];

  const getResourceOptions = (operator: OperatorType) => {
    const baseOptions = [
      { value: 'all', label: t('All Resources'), description: t('Show all resource types') },
    ];

    if (operator === 'all') {
      return [
        ...baseOptions,
        ...(certManager.installed ? certManagerResources : []),
        ...(trustManager.installed ? trustManagerResources : []),
        ...(externalSecrets.installed ? externalSecretsResources : []),
        ...(secretsStoreCSI.installed ? secretsStoreCSIResources : []),
      ];
    } else if (operator === 'cert-manager') {
      return [...baseOptions, ...certManagerResources];
    } else if (operator === 'trust-manager') {
      return [...baseOptions, ...trustManagerResources];
    } else if (operator === 'external-secrets') {
      return [...baseOptions, ...externalSecretsResources];
    } else if (operator === 'secrets-store-csi') {
      return [...baseOptions, ...secretsStoreCSIResources];
    }
    return baseOptions;
  };

  const handleOperatorChange = (_event: React.FormEvent<HTMLSelectElement>, value: string) => {
    setFilters((prev) => ({
      ...prev,
      operator: value as OperatorType,
      resourceKind: 'all', // Reset resource filter when operator changes
    }));
  };

  const handleResourceChange = (_event: React.FormEvent<HTMLSelectElement>, value: string) => {
    setFilters((prev) => ({
      ...prev,
      resourceKind: value as ResourceKind,
    }));
  };

  const handleProjectChange = (_event: React.FormEvent<HTMLSelectElement>, value: string) => {
    setFilters((prev) => ({
      ...prev,
      project: value as ProjectType,
    }));
  };

  const shouldShowComponent = (operator: OperatorType, resourceKind: ResourceKind) => {
    if (!isOperatorInstalled(operator)) return false;
    if (filters.operator !== 'all' && filters.operator !== operator) return false;
    if (filters.resourceKind !== 'all' && filters.resourceKind !== resourceKind) return false;
    return true;
  };

  const renderOperatorContent = (
    renderInstalledContent: () => React.ReactNode,
    operatorKey: 'cert-manager' | 'trust-manager' | 'external-secrets' | 'secrets-store-csi',
  ) => {
    if (operatorsLoading) {
      return (
        <div style={{ display: 'flex', justifyContent: 'center', padding: '32px' }}>
          <Spinner size="lg" />
        </div>
      );
    }

    const status = getOperatorStatus(operatorKey);
    if (status.error) {
      return (
        <Alert variant="danger" title={t('Unable to verify operator status')}>
          <p>{status.error}</p>
          <Button variant="secondary" onClick={() => checkOperators()} style={{ marginTop: '8px' }}>
            {t('Retry')}
          </Button>
        </Alert>
      );
    }

    return renderInstalledContent();
  };

  return (
    <>
      <DocumentTitle>{t('Secrets Management')}</DocumentTitle>
      <div className="co-m-pane__body co-m-pane__body--no-top-margin">
        <div
          className="co-m-pane__heading"
          style={{ paddingTop: '2rem', paddingLeft: '2rem', paddingRight: '2rem' }}
        >
          <Title headingLevel="h1" size="2xl" className="co-m-pane__heading-title">
            <KeyIcon className="co-m-resource-icon co-m-resource-icon--lg" />{' '}
            {t('Secrets Management')}
          </Title>
          <p className="help-block" style={{ textAlign: 'left' }}>
            {t('Manage certificates, external secrets, and secret stores across your cluster.')}
          </p>
        </div>

        {/* Filter Controls */}
        <div
          className="co-m-pane__filter-bar"
          style={{ padding: '16px 2rem', marginBottom: '16px' }}
        >
          <Flex spaceItems={{ default: 'spaceItemsMd' }}>
            <FlexItem>
              <MenuContainer
                isOpen={projectMenuOpen}
                onOpenChange={setProjectMenuOpen}
                menuRef={projectMenuRef}
                toggleRef={projectToggleRef}
                toggle={
                  <MenuToggle
                    ref={projectToggleRef}
                    onClick={() => setProjectMenuOpen((prev) => !prev)}
                    isExpanded={projectMenuOpen}
                    isDisabled={!projectsLoaded}
                    aria-label={t('Project')}
                    style={{ width: '200px' }}
                  >
                    {!projectsLoaded
                      ? t('Loading projects...')
                      : projectsError
                      ? t('Error loading projects')
                      : projectOptions.find((o) => o.value === filters.project)?.label ??
                        t('All Projects')}
                  </MenuToggle>
                }
                menu={
                  <Menu
                    ref={projectMenuRef}
                    onSelect={(_event, value) => {
                      handleProjectChange(
                        _event as unknown as React.FormEvent<HTMLSelectElement>,
                        value as string,
                      );
                      setProjectMenuOpen(false);
                      projectToggleRef.current?.focus();
                    }}
                    selected={filters.project}
                  >
                    <MenuContent>
                      <MenuList>
                        {projectOptions.map((option) => (
                          <MenuItem key={option.value} itemId={option.value}>
                            {option.label}
                          </MenuItem>
                        ))}
                      </MenuList>
                    </MenuContent>
                  </Menu>
                }
              />
            </FlexItem>
            <FlexItem>
              <MenuContainer
                isOpen={operatorMenuOpen}
                onOpenChange={setOperatorMenuOpen}
                menuRef={operatorMenuRef}
                toggleRef={operatorToggleRef}
                toggle={
                  <MenuToggle
                    ref={operatorToggleRef}
                    onClick={() => setOperatorMenuOpen((prev) => !prev)}
                    isExpanded={operatorMenuOpen}
                    aria-label={t('Operator')}
                    style={{ width: '200px' }}
                  >
                    {operatorOptions.find((o) => o.value === filters.operator)?.label ??
                      t('All Operators')}
                  </MenuToggle>
                }
                menu={
                  <Menu
                    ref={operatorMenuRef}
                    onSelect={(_event, value) => {
                      handleOperatorChange(
                        _event as unknown as React.FormEvent<HTMLSelectElement>,
                        value as string,
                      );
                      setOperatorMenuOpen(false);
                      operatorToggleRef.current?.focus();
                    }}
                    selected={filters.operator}
                  >
                    <MenuContent>
                      <MenuList>
                        {operatorOptions.map((option) => (
                          <MenuItem key={option.value} itemId={option.value}>
                            {option.label}
                          </MenuItem>
                        ))}
                      </MenuList>
                    </MenuContent>
                  </Menu>
                }
              />
            </FlexItem>
            <FlexItem>
              <MenuContainer
                isOpen={resourceKindMenuOpen}
                onOpenChange={setResourceKindMenuOpen}
                menuRef={resourceKindMenuRef}
                toggleRef={resourceKindToggleRef}
                toggle={
                  <MenuToggle
                    ref={resourceKindToggleRef}
                    onClick={() => setResourceKindMenuOpen((prev) => !prev)}
                    isExpanded={resourceKindMenuOpen}
                    aria-label={t('Resource Type')}
                    style={{ width: '200px' }}
                  >
                    {getResourceOptions(filters.operator).find(
                      (o) => o.value === filters.resourceKind,
                    )?.label ?? t('All Resources')}
                  </MenuToggle>
                }
                menu={
                  <Menu
                    ref={resourceKindMenuRef}
                    onSelect={(_event, value) => {
                      handleResourceChange(
                        _event as unknown as React.FormEvent<HTMLSelectElement>,
                        value as string,
                      );
                      setResourceKindMenuOpen(false);
                      resourceKindToggleRef.current?.focus();
                    }}
                    selected={filters.resourceKind}
                  >
                    <MenuContent>
                      <MenuList>
                        {getResourceOptions(filters.operator).map((option) => (
                          <MenuItem key={option.value} itemId={option.value}>
                            {option.label}
                          </MenuItem>
                        ))}
                      </MenuList>
                    </MenuContent>
                  </Menu>
                }
              />
            </FlexItem>
          </Flex>
        </div>

        <div className="co-m-pane__body-group" style={{ padding: '0 2rem' }}>
          {operatorsLoading && (
            <div style={{ display: 'flex', justifyContent: 'center', padding: '64px' }}>
              <Spinner size="xl" />
            </div>
          )}

          {!operatorsLoading && !anyOperatorInstalled && <NoOperatorsInstalled />}

          {!operatorsLoading && anyOperatorInstalled && (
            <>
              {/* cert-manager Resources */}
              {shouldShowComponent('cert-manager', 'certificates') && (
                <div style={{ marginBottom: '2rem' }}>
                  <Flex alignItems={{ default: 'alignItemsCenter' }} style={{ marginBottom: '0.5rem' }}>
                    <FlexItem>
                      <Title headingLevel="h3" size="md">
                        {t('Certificates')}
                      </Title>
                    </FlexItem>
                    <FlexItem>
                      <Badge isRead>{t('cert-manager')}</Badge>
                      <OperatorStatusBadge status={certManager} />
                    </FlexItem>
                  </Flex>
                  <Divider style={{ marginBottom: '1rem' }} />
                  {renderOperatorContent(
                    () => (
                      <CertificatesTable selectedProject={filters.project} />
                    ),
                    'cert-manager',
                  )}
                </div>
              )}

              {shouldShowComponent('cert-manager', 'issuers') && (
                <div style={{ marginBottom: '2rem' }}>
                  <Flex alignItems={{ default: 'alignItemsCenter' }} style={{ marginBottom: '0.5rem' }}>
                    <FlexItem>
                      <Title headingLevel="h3" size="md">
                        {t('Issuers')}
                      </Title>
                    </FlexItem>
                    <FlexItem>
                      <Badge isRead>{t('cert-manager')}</Badge>
                      <OperatorStatusBadge status={certManager} />
                    </FlexItem>
                  </Flex>
                  <Divider style={{ marginBottom: '1rem' }} />
                  {renderOperatorContent(
                    () => (
                      <IssuersTable selectedProject={filters.project} />
                    ),
                    'cert-manager',
                  )}
                </div>
              )}

              {/* trust-manager Resources */}
              {shouldShowComponent('trust-manager', 'bundles') && (
                <div style={{ marginBottom: '2rem' }}>
                  <Flex alignItems={{ default: 'alignItemsCenter' }} style={{ marginBottom: '0.5rem' }}>
                    <FlexItem>
                      <Title headingLevel="h3" size="md">
                        {t('Trust Bundles')}
                      </Title>
                    </FlexItem>
                    <FlexItem>
                      <Badge isRead>{t('trust-manager')}</Badge>
                      <OperatorStatusBadge status={trustManager} />
                    </FlexItem>
                  </Flex>
                  <Divider style={{ marginBottom: '1rem' }} />
                  {renderOperatorContent(
                    () => (
                      <BundlesTable selectedProject={filters.project} />
                    ),
                    'trust-manager',
                  )}
                </div>
              )}

              {/* External Secrets Resources */}
              {shouldShowComponent('external-secrets', 'externalsecrets') && (
                <div style={{ marginBottom: '2rem' }}>
                  <Flex alignItems={{ default: 'alignItemsCenter' }} style={{ marginBottom: '0.5rem' }}>
                    <FlexItem>
                      <Title headingLevel="h3" size="md">
                        {t('External Secrets')}
                      </Title>
                    </FlexItem>
                    <FlexItem>
                      <Badge isRead>{t('External Secrets Operator')}</Badge>
                      <OperatorStatusBadge status={externalSecrets} />
                    </FlexItem>
                  </Flex>
                  <Divider style={{ marginBottom: '1rem' }} />
                  {renderOperatorContent(
                    () => (
                      <ExternalSecretsTable selectedProject={filters.project} />
                    ),
                    'external-secrets',
                  )}
                </div>
              )}

              {shouldShowComponent('external-secrets', 'secretstores') && (
                <div style={{ marginBottom: '2rem' }}>
                  <Flex alignItems={{ default: 'alignItemsCenter' }} style={{ marginBottom: '0.5rem' }}>
                    <FlexItem>
                      <Title headingLevel="h3" size="md">
                        {t('Secret Stores')}
                      </Title>
                    </FlexItem>
                    <FlexItem>
                      <Badge isRead>{t('External Secrets Operator')}</Badge>
                      <OperatorStatusBadge status={externalSecrets} />
                    </FlexItem>
                  </Flex>
                  <Divider style={{ marginBottom: '1rem' }} />
                  {renderOperatorContent(
                    () => (
                      <SecretStoresTable selectedProject={filters.project} />
                    ),
                    'external-secrets',
                  )}
                </div>
              )}

              {shouldShowComponent('external-secrets', 'pushsecrets') && (
                <div style={{ marginBottom: '2rem' }}>
                  <Flex alignItems={{ default: 'alignItemsCenter' }} style={{ marginBottom: '0.5rem' }}>
                    <FlexItem>
                      <Title headingLevel="h3" size="md">
                        {t('Push Secrets')}
                      </Title>
                    </FlexItem>
                    <FlexItem>
                      <Badge isRead>{t('External Secrets Operator')}</Badge>
                      <OperatorStatusBadge status={externalSecrets} />
                    </FlexItem>
                  </Flex>
                  <Divider style={{ marginBottom: '1rem' }} />
                  {renderOperatorContent(
                    () => (
                      <PushSecretsTable selectedProject={filters.project} />
                    ),
                    'external-secrets',
                  )}
                </div>
              )}

              {/* Secrets Store CSI Driver Resources */}
              {shouldShowComponent('secrets-store-csi', 'secretproviderclasses') && (
                <div style={{ marginBottom: '2rem' }}>
                  <Flex alignItems={{ default: 'alignItemsCenter' }} style={{ marginBottom: '0.5rem' }}>
                    <FlexItem>
                      <Title headingLevel="h3" size="md">
                        {t('Secret Provider Classes')}
                      </Title>
                    </FlexItem>
                    <FlexItem>
                      <Badge isRead>{t('Secrets Store CSI Driver')}</Badge>
                      <OperatorStatusBadge status={secretsStoreCSI} />
                    </FlexItem>
                  </Flex>
                  <Divider style={{ marginBottom: '1rem' }} />
                  {renderOperatorContent(
                    () => (
                      <SecretProviderClassTable selectedProject={filters.project} />
                    ),
                    'secrets-store-csi',
                  )}
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </>
  );
}
