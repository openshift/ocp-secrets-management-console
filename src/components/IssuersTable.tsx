import * as React from 'react';
import { useTranslation } from 'react-i18next';

import {
  Label,
  LabelProps,
  Dropdown,
  DropdownItem,
  DropdownList,
  MenuToggle,
  MenuToggleElement,
} from '@patternfly/react-core';
import {
  CheckCircleIcon,
  ExclamationCircleIcon,
  TimesCircleIcon,
  EllipsisVIcon,
} from '@patternfly/react-icons';
import { ResourceTable } from './ResourceTable';
import { DeleteConfirmationModal } from './DeleteConfirmationModal';
import { useK8sWatchResource, consoleFetch } from '@openshift-console/dynamic-plugin-sdk';
import { IssuerModel, ClusterIssuerModel, Issuer } from './crds';

const getIssuerType = (issuer: Issuer): string => {
  if (issuer.spec.acme) return 'ACME';
  if (issuer.spec.ca) return 'CA';
  if (issuer.spec.selfSigned) return 'Self-Signed';
  if (issuer.spec.vault) return 'Vault';
  return 'Unknown';
};

const getConditionStatus = (issuer: Issuer) => {
  const readyCondition = issuer.status?.conditions?.find((condition) => condition.type === 'Ready');

  if (!readyCondition) {
    return {
      status: 'Unknown',
      icon: <ExclamationCircleIcon />,
      labelStatus: 'warning' as NonNullable<LabelProps['status']>,
    };
  }

  if (readyCondition.status === 'True') {
    return {
      status: 'Ready',
      icon: <CheckCircleIcon />,
      labelStatus: 'success' as NonNullable<LabelProps['status']>,
    };
  }

  return {
    status: 'Not Ready',
    icon: <TimesCircleIcon />,
    labelStatus: 'danger' as NonNullable<LabelProps['status']>,
  };
};

interface IssuersTableProps {
  selectedProject: string;
}

export const IssuersTable: React.FC<IssuersTableProps> = ({ selectedProject }) => {
  const { t } = useTranslation('plugin__ocp-secrets-management');
  const [openDropdowns, setOpenDropdowns] = React.useState<Record<string, boolean>>({});
  const [deleteModal, setDeleteModal] = React.useState<{
    isOpen: boolean;
    issuer: Issuer | null;
    isDeleting: boolean;
    error: string | null;
  }>({
    isOpen: false,
    issuer: null,
    isDeleting: false,
    error: null,
  });

  const toggleDropdown = (issuerId: string) => {
    setOpenDropdowns((prev) => ({
      ...prev,
      [issuerId]: !prev[issuerId],
    }));
  };

  const handleInspect = (issuer: Issuer) => {
    const resourceType = issuer.metadata.namespace ? 'issuers' : 'clusterissuers';
    const name = issuer.metadata.name;
    if (issuer.metadata.namespace) {
      window.location.href = `/secrets-management/inspect/${resourceType}/${issuer.metadata.namespace}/${name}`;
    } else {
      window.location.href = `/secrets-management/inspect/${resourceType}/${name}`;
    }
  };

  const handleDelete = (issuer: Issuer) => {
    setDeleteModal({
      isOpen: true,
      issuer,
      isDeleting: false,
      error: null,
    });
  };

  const confirmDelete = async () => {
    if (!deleteModal.issuer) return;

    setDeleteModal((prev) => ({ ...prev, isDeleting: true, error: null }));

    try {
      const isClusterScoped = !deleteModal.issuer.metadata.namespace;

      // Manual delete using fetch to bypass k8sDelete API path issues
      const resourceName = deleteModal.issuer?.metadata?.name;
      const resourceNamespace = deleteModal.issuer?.metadata?.namespace;

      let apiPath: string;
      if (isClusterScoped) {
        apiPath = `/api/kubernetes/apis/cert-manager.io/v1/clusterissuers/${resourceName}`;
      } else {
        apiPath = `/api/kubernetes/apis/cert-manager.io/v1/namespaces/${resourceNamespace}/issuers/${resourceName}`;
      }

      const response = await consoleFetch(apiPath, {
        method: 'DELETE',
        headers: {
          'Content-Type': 'application/json',
        },
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Delete failed: ${response.status} ${response.statusText} - ${errorText}`);
      }

      // Close modal on success
      setDeleteModal({
        isOpen: false,
        issuer: null,
        isDeleting: false,
        error: null,
      });
    } catch (error: unknown) {
      setDeleteModal((prev) => ({
        ...prev,
        isDeleting: false,
        error: error instanceof Error ? error.message : 'Failed to delete issuer',
      }));
    }
  };

  const cancelDelete = () => {
    setDeleteModal({
      isOpen: false,
      issuer: null,
      isDeleting: false,
      error: null,
    });
  };

  // Watch both Issuers and ClusterIssuers
  const [issuers, issuersLoaded, issuersError] = useK8sWatchResource<Issuer[]>({
    groupVersionKind: IssuerModel,
    namespace: selectedProject === 'all' ? undefined : selectedProject,
    isList: true,
  });

  const [clusterIssuers, clusterIssuersLoaded, clusterIssuersError] = useK8sWatchResource<Issuer[]>(
    {
      groupVersionKind: ClusterIssuerModel,
      isList: true,
    },
  );

  const loaded = issuersLoaded && clusterIssuersLoaded;
  const loadError = issuersError || clusterIssuersError;

  const columns = [
    { title: t('Name'), width: 16 },
    { title: t('Namespace'), width: 10 },
    { title: t('Type'), width: 13 },
    { title: t('Issuer Type'), width: 15 },
    { title: t('Details'), width: 31 },
    { title: t('Status'), width: 10 },
    { title: '', width: 5 }, // Actions column
  ];

  const rows = React.useMemo(() => {
    if (!loaded) return [];

    const allIssuers = [
      ...(issuers || []).map((issuer) => ({ ...issuer, scope: 'Namespace' })),
      ...(clusterIssuers || []).map((issuer) => ({ ...issuer, scope: 'Cluster' })),
    ];

    return allIssuers.map((issuer) => {
      const conditionStatus = getConditionStatus(issuer);
      const issuerType = getIssuerType(issuer);
      const issuerId = `${issuer.metadata.namespace || 'cluster'}-${issuer.metadata.name}`;

      let details = '-';
      if (issuer.spec.acme) {
        details = issuer.spec.acme.server;
      } else if (issuer.spec.ca) {
        details = issuer.spec.ca.secretName;
      } else if (issuer.spec.vault) {
        details = issuer.spec.vault.server;
      }

      return {
        cells: [
          issuer.metadata.name,
          issuer.metadata.namespace || 'Cluster',
          issuer.scope === 'Namespace' ? 'Issuer' : 'ClusterIssuer',
          issuerType,
          details,
          <Label key={`status-${issuerId}`} status={conditionStatus.labelStatus} icon={conditionStatus.icon}>
            {conditionStatus.status}
          </Label>,
          <Dropdown
            key={`dropdown-${issuerId}`}
            isOpen={openDropdowns[issuerId] || false}
            onSelect={() => setOpenDropdowns((prev) => ({ ...prev, [issuerId]: false }))}
            toggle={(toggleRef: React.Ref<MenuToggleElement>) => (
              <MenuToggle
                ref={toggleRef}
                aria-label="kebab dropdown toggle"
                variant="plain"
                onClick={() => toggleDropdown(issuerId)}
                isExpanded={openDropdowns[issuerId] || false}
                icon={<EllipsisVIcon />}
              />
            )}
            shouldFocusToggleOnSelect
          >
            <DropdownList>
              <DropdownItem key="inspect" onClick={() => handleInspect(issuer)}>
                {t('Inspect')}
              </DropdownItem>
              <DropdownItem key="delete" onClick={() => handleDelete(issuer)}>
                {t('Delete')}
              </DropdownItem>
            </DropdownList>
          </Dropdown>,
        ],
      };
    });
  }, [issuers, clusterIssuers, loaded, openDropdowns, t]);

  return (
    <>
      <ResourceTable
        columns={columns}
        rows={rows}
        loading={!loaded}
        error={loadError?.message}
        emptyStateTitle={t('No issuers found')}
        emptyStateBody={
          selectedProject === 'all'
            ? t('No issuers are currently available in all projects.')
            : t('No issuers are currently available in the project {{project}}.', {
                project: selectedProject,
              })
        }
        selectedProject={selectedProject}
        data-test="issuers-table"
      />

      <DeleteConfirmationModal
        isOpen={deleteModal.isOpen}
        resourceName={deleteModal.issuer?.metadata?.name || ''}
        resourceType={deleteModal.issuer?.metadata?.namespace ? t('Issuer') : t('ClusterIssuer')}
        isDeleting={deleteModal.isDeleting}
        error={deleteModal.error}
        onConfirm={confirmDelete}
        onCancel={cancelDelete}
      />
    </>
  );
};
