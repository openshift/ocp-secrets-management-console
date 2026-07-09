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
import { SecretStoreModel, ClusterSecretStoreModel, SecretStore } from './crds';

const getProviderType = (secretStore: SecretStore): string => {
  const provider = secretStore.spec?.provider;
  if (!provider) return '-';
  if (provider.aws) return 'AWS';
  if (provider.azurekv) return 'Azure Key Vault';
  if (provider.bitwardensecretsmanager) return 'Bitwarden Secrets Manager';
  if (provider.gcpsm) return 'Google Secret Manager';
  if (provider.vault) return 'HashiCorp Vault';
  if (provider.kubernetes) return 'Kubernetes';
  if (provider.doppler) return 'Doppler';
  if (provider.onepassword) return '1Password';
  if (provider.gitlab) return 'GitLab';
  if (provider.fake) return 'Fake (Testing)';
  return 'Unknown';
};

const getProviderDetails = (secretStore: SecretStore): string => {
  const provider = secretStore.spec?.provider;
  if (!provider) return '-';
  if (provider.aws) return `${provider.aws.service} (${provider.aws.region || 'default'})`;
  if (provider.azurekv) return provider.azurekv.vaultUrl;
  if (provider.bitwardensecretsmanager) {
    const bw = provider.bitwardensecretsmanager;
    return bw.bitwardenServerSDKURL || bw.apiURL || 'Bitwarden';
  }
  if (provider.gcpsm) return provider.gcpsm.projectID || '-';
  if (provider.vault) return provider.vault.server;
  if (provider.kubernetes) return provider.kubernetes.server?.url || 'In-cluster';
  if (provider.doppler) return provider.doppler.project || 'Default';
  if (provider.onepassword) return provider.onepassword.connectHost;
  if (provider.gitlab) return provider.gitlab.url || 'gitlab.com';
  if (provider.fake) return `${provider.fake.data?.length || 0} entries`;
  return '-';
};

// Helper to determine if a SecretStore is cluster-scoped
// Check namespace since the typed SecretStore only has kind: 'SecretStore'
// but at runtime we may receive ClusterSecretStore objects
type StoreLike = { kind?: string; metadata?: { namespace?: string } };
const isClusterScopedStore = (store: StoreLike): boolean => {
  return store.kind === 'ClusterSecretStore' || !store.metadata?.namespace;
};

const getConditionStatus = (secretStore: SecretStore) => {
  const readyCondition = secretStore.status?.conditions?.find(
    (condition) => condition.type === 'Ready',
  );

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

interface SecretStoresTableProps {
  selectedProject: string;
}

export const SecretStoresTable: React.FC<SecretStoresTableProps> = ({ selectedProject }) => {
  const { t } = useTranslation('plugin__ocp-secrets-management');
  const [openDropdowns, setOpenDropdowns] = React.useState<Record<string, boolean>>({});

  const toggleDropdown = (storeId: string) => {
    setOpenDropdowns((prev) => ({
      ...prev,
      [storeId]: !prev[storeId],
    }));
  };

  const [deleteModal, setDeleteModal] = React.useState<{
    isOpen: boolean;
    secretStore: SecretStore | null;
    isDeleting: boolean;
    error: string | null;
  }>({
    isOpen: false,
    secretStore: null,
    isDeleting: false,
    error: null,
  });

  const handleInspect = (secretStore: SecretStore) => {
    const resourceType = secretStore.metadata.namespace ? 'secretstores' : 'clustersecretstores';
    const name = secretStore.metadata.name;
    if (secretStore.metadata.namespace) {
      window.location.href = `/secrets-management/inspect/${resourceType}/${secretStore.metadata.namespace}/${name}`;
    } else {
      window.location.href = `/secrets-management/inspect/${resourceType}/${name}`;
    }
  };

  const handleDelete = (secretStore: SecretStore) => {
    setDeleteModal({
      isOpen: true,
      secretStore,
      isDeleting: false,
      error: null,
    });
  };

  const confirmDelete = async () => {
    if (!deleteModal.secretStore) return;

    setDeleteModal((prev) => ({ ...prev, isDeleting: true, error: null }));

    try {
      // Check if cluster-scoped based on kind or namespace
      const isClusterScoped = isClusterScopedStore(deleteModal.secretStore);

      // Manual delete using fetch to bypass k8sDelete API path issues
      const resourceName = deleteModal.secretStore?.metadata?.name;
      const resourceNamespace = deleteModal.secretStore?.metadata?.namespace;

      let apiPath: string;
      // Use the same API version as the model (v1)
      // Note: Kubernetes API resource names are lowercase and plural
      if (isClusterScoped) {
        apiPath = `/api/kubernetes/apis/${ClusterSecretStoreModel.group}/${ClusterSecretStoreModel.version}/clustersecretstores/${resourceName}`;
      } else {
        if (!resourceNamespace) {
          throw new Error('Namespace is required for namespaced SecretStore');
        }
        apiPath = `/api/kubernetes/apis/${SecretStoreModel.group}/${SecretStoreModel.version}/namespaces/${resourceNamespace}/secretstores/${resourceName}`;
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
        secretStore: null,
        isDeleting: false,
        error: null,
      });
    } catch (error: unknown) {
      setDeleteModal((prev) => ({
        ...prev,
        isDeleting: false,
        error: error instanceof Error ? error.message : 'Failed to delete secret store',
      }));
    }
  };

  const cancelDelete = () => {
    setDeleteModal({
      isOpen: false,
      secretStore: null,
      isDeleting: false,
      error: null,
    });
  };

  // Watch both SecretStores and ClusterSecretStores
  const [secretStores, secretStoresLoaded, secretStoresError] = useK8sWatchResource<SecretStore[]>({
    groupVersionKind: SecretStoreModel,
    namespace: selectedProject === 'all' ? undefined : selectedProject,
    isList: true,
  });

  const [clusterSecretStores, clusterSecretStoresLoaded, clusterSecretStoresError] =
    useK8sWatchResource<SecretStore[]>({
      groupVersionKind: ClusterSecretStoreModel,
      isList: true,
    });

  const loaded = secretStoresLoaded && clusterSecretStoresLoaded;
  const loadError = secretStoresError || clusterSecretStoresError;

  const columns = [
    { title: t('Name'), width: 14 },
    { title: t('Namespace'), width: 12 },
    { title: t('Type'), width: 10 },
    { title: t('Scope'), width: 11 },
    { title: t('Provider'), width: 14 },
    { title: t('Details'), width: 24 },
    { title: t('Status'), width: 10 },
    { title: '', width: 5 }, // Actions column
  ];

  const rows = React.useMemo(() => {
    if (!loaded) return [];

    const allSecretStores = [
      ...(secretStores || []).map((store) => ({ ...store, scope: 'Namespace' as const })),
      ...(clusterSecretStores || []).map((store) => ({ ...store, scope: 'Cluster' as const })),
    ];

    return allSecretStores.map((secretStore) => {
      const conditionStatus = getConditionStatus(secretStore);
      const providerType = getProviderType(secretStore);
      const providerDetails = getProviderDetails(secretStore);
      const storeId = `${secretStore.metadata.namespace || 'cluster'}-${secretStore.metadata.name}`;
      const typeLabel =
        secretStore.scope === 'Cluster' ? t('ClusterSecretStore') : t('SecretStore');
      const namespace = secretStore.metadata.namespace || 'Cluster-wide';

      return {
        cells: [
          secretStore.metadata.name,
          namespace,
          typeLabel,
          isClusterScopedStore(secretStore) ? 'Cluster' : 'Namespace',
          providerType,
          providerDetails,
          <Label key={`status-${storeId}`} status={conditionStatus.labelStatus} icon={conditionStatus.icon}>
            {conditionStatus.status}
          </Label>,
          <Dropdown
            key={`dropdown-${storeId}`}
            isOpen={openDropdowns[storeId] || false}
            onSelect={() => setOpenDropdowns((prev) => ({ ...prev, [storeId]: false }))}
            toggle={(toggleRef: React.Ref<MenuToggleElement>) => (
              <MenuToggle
                ref={toggleRef}
                aria-label="kebab dropdown toggle"
                variant="plain"
                onClick={() => toggleDropdown(storeId)}
                isExpanded={openDropdowns[storeId] || false}
                icon={<EllipsisVIcon />}
              />
            )}
            shouldFocusToggleOnSelect
          >
            <DropdownList>
              <DropdownItem key="inspect" onClick={() => handleInspect(secretStore)}>
                {t('Inspect')}
              </DropdownItem>
              <DropdownItem key="delete" onClick={() => handleDelete(secretStore)}>
                {t('Delete')}
              </DropdownItem>
            </DropdownList>
          </Dropdown>,
        ],
      };
    });
  }, [secretStores, clusterSecretStores, loaded, openDropdowns, t]);

  return (
    <>
      <ResourceTable
        columns={columns}
        rows={rows}
        loading={!loaded}
        error={loadError?.message}
        emptyStateTitle={t('No secret stores found')}
        emptyStateBody={
          selectedProject === 'all'
            ? t('No SecretStores are currently available in all projects.')
            : t('No SecretStores are currently available in the project {{project}}.', {
                project: selectedProject,
              })
        }
        selectedProject={selectedProject}
        data-test="secret-stores-table"
      />

      <DeleteConfirmationModal
        isOpen={deleteModal.isOpen}
        resourceName={deleteModal.secretStore?.metadata?.name || ''}
        resourceType={
          deleteModal.secretStore?.scope === 'Cluster' ? t('ClusterSecretStore') : t('SecretStore')
        }
        isDeleting={deleteModal.isDeleting}
        error={deleteModal.error}
        onConfirm={confirmDelete}
        onCancel={cancelDelete}
      />
    </>
  );
};
