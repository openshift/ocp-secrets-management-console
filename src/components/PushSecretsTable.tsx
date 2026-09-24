import * as React from 'react';
import { useTranslation } from 'react-i18next';

import { Label, LabelProps } from '@patternfly/react-core';
import {
  CheckCircleIcon,
  ExclamationCircleIcon,
  TimesCircleIcon,
  SyncAltIcon,
} from '@patternfly/react-icons';
import { ResourceTable } from './ResourceTable';
import { DeleteConfirmationModal } from './DeleteConfirmationModal';
import { RowActionsMenu } from './RowActionsMenu';
import { useK8sWatchResource, consoleFetch } from '@openshift-console/dynamic-plugin-sdk';
import {
  PushSecretModel,
  ClusterPushSecretModel,
  PushSecret,
  ClusterPushSecret,
  PushSecretResource,
  isClusterPushSecret,
} from './crds';
import {
  useOptionalClusterListWatch,
  combineDualListWatchLoaded,
  combineDualListWatchError,
  useDualScopeDeleteAllowed,
} from '../hooks/useClusterWatchAllowed';
import {
  formatDeleteErrorMessage,
  formatResourceTableErrorMessage,
  listErrorNamespace,
} from '../utils/permissionErrors';

const getPushSecretStatus = (pushSecret: PushSecretResource) => {
  if (!pushSecret.status?.conditions) {
    return {
      status: 'Unknown',
      icon: <ExclamationCircleIcon />,
      labelStatus: 'warning' as NonNullable<LabelProps['status']>,
    };
  }

  const readyCondition = pushSecret.status.conditions.find(
    (condition) => condition.type === 'Ready',
  );

  if (readyCondition) {
    if (readyCondition.status === 'True') {
      return {
        status: 'Ready',
        icon: <CheckCircleIcon />,
        labelStatus: 'success' as NonNullable<LabelProps['status']>,
      };
    } else if (readyCondition.status === 'False') {
      return {
        status: 'Not Ready',
        icon: <TimesCircleIcon />,
        labelStatus: 'danger' as NonNullable<LabelProps['status']>,
      };
    }
  }

  return {
    status: 'Syncing',
    icon: <SyncAltIcon />,
    labelStatus: 'info' as NonNullable<LabelProps['status']>,
  };
};

interface PushSecretsTableProps {
  selectedProject: string;
}

export const PushSecretsTable: React.FC<PushSecretsTableProps> = ({ selectedProject }) => {
  const { t } = useTranslation('plugin__ocp-secrets-management');
  const [deleteModal, setDeleteModal] = React.useState<{
    isOpen: boolean;
    pushSecret: PushSecretResource | null;
    isDeleting: boolean;
    error: string | null;
  }>({
    isOpen: false,
    pushSecret: null,
    isDeleting: false,
    error: null,
  });

  const handleDelete = async (pushSecret: PushSecretResource) => {
    setDeleteModal((prev) => ({ ...prev, isDeleting: true, error: null }));

    try {
      const isCluster = isClusterPushSecret(pushSecret);
      let url: string;

      if (isCluster) {
        url = `/api/kubernetes/apis/${ClusterPushSecretModel.group}/${ClusterPushSecretModel.version}/clusterpushsecrets/${pushSecret.metadata.name}`;
      } else {
        url = `/api/kubernetes/apis/${PushSecretModel.group}/${PushSecretModel.version}/namespaces/${pushSecret.metadata.namespace}/pushsecrets/${pushSecret.metadata.name}`;
      }

      await consoleFetch(url, { method: 'DELETE' });
      setDeleteModal({
        isOpen: false,
        pushSecret: null,
        isDeleting: false,
        error: null,
      });
    } catch (error) {
      setDeleteModal((prev) => ({
        ...prev,
        isDeleting: false,
        error: formatDeleteErrorMessage(error, t, {
          resourceCategory: deleteModal.pushSecret?.metadata?.namespace
            ? t('PushSecret')
            : t('ClusterPushSecret'),
          namespace: deleteModal.pushSecret?.metadata?.namespace,
        }),
      }));
    }
  };

  const openDeleteModal = (pushSecret: PushSecretResource) => {
    setDeleteModal({
      isOpen: true,
      pushSecret,
      isDeleting: false,
      error: null,
    });
  };

  const closeDeleteModal = () => {
    setDeleteModal({
      isOpen: false,
      pushSecret: null,
      isDeleting: false,
      error: null,
    });
  };

  // Watch PushSecrets (namespaced)
  const [pushSecrets, pushSecretsLoaded, pushSecretsError] = useK8sWatchResource<PushSecret[]>({
    groupVersionKind: PushSecretModel,
    namespace: selectedProject === 'all' ? undefined : selectedProject,
    isList: true,
  });

  const clusterPushSecretsWatch =
    useOptionalClusterListWatch<ClusterPushSecret>(ClusterPushSecretModel);
  const clusterPushSecrets = clusterPushSecretsWatch.data;

  const loaded = combineDualListWatchLoaded(pushSecretsLoaded, clusterPushSecretsWatch);
  const loadError = combineDualListWatchError(pushSecretsError, clusterPushSecretsWatch);
  const canDeleteRow = useDualScopeDeleteAllowed(
    PushSecretModel,
    ClusterPushSecretModel,
    selectedProject,
  );

  const columns = [
    { title: t('Name'), width: 15 },
    { title: t('Namespace'), width: 10 },
    { title: t('Type'), width: 11 },
    { title: t('Secret Store'), width: 19 },
    { title: t('Source Secret'), width: 16 },
    { title: t('Refresh Interval'), width: 14 },
    { title: t('Status'), width: 10 },
    { title: '', width: 5 }, // Actions column
  ];

  const rows = React.useMemo(() => {
    if (!loaded) return [];

    const allPushSecrets: PushSecretResource[] = [
      ...(pushSecrets || []),
      ...(clusterPushSecrets || []),
    ];

    return allPushSecrets.map((pushSecret) => {
      const isCluster = isClusterPushSecret(pushSecret);
      const pushSecretId = `${isCluster ? 'cluster' : pushSecret.metadata.namespace}-${
        pushSecret.metadata.name
      }`;
      const conditionStatus = getPushSecretStatus(pushSecret);

      // ClusterPushSecret nests display fields in spec.pushSecretSpec; PushSecret has them on spec
      const displaySpec = isCluster
        ? (pushSecret as ClusterPushSecret).spec?.pushSecretSpec
        : (pushSecret as PushSecret).spec;

      // Get secret store references
      const secretStoreRefs = displaySpec?.secretStoreRefs || [];
      const secretStoreText =
        secretStoreRefs.length > 0
          ? secretStoreRefs.map((ref) => `${ref.name} (${ref.kind})`).join(', ')
          : 'None';

      // Get source secret name
      const sourceSecret = displaySpec?.selector?.secret?.name || 'Unknown';

      // Get refresh interval
      const refreshInterval = displaySpec?.refreshInterval || 'Default';

      const resourceType = isCluster ? 'ClusterPushSecret' : 'PushSecret';
      const resourceKind = isCluster ? t('ClusterPushSecret') : t('PushSecret');
      const namespace = isCluster ? 'Cluster-wide' : pushSecret.metadata.namespace;

      return {
        cells: [
          pushSecret.metadata.name,
          namespace,
          resourceType,
          secretStoreText,
          sourceSecret,
          refreshInterval,
          <Label
            key={`status-${pushSecretId}`}
            status={conditionStatus.labelStatus}
            icon={conditionStatus.icon}
          >
            {conditionStatus.status}
          </Label>,
          <RowActionsMenu
            key={`dropdown-${pushSecretId}`}
            menuId={pushSecretId}
            actions={[
              {
                key: 'inspect',
                label: t('Inspect {{kind}}', { kind: resourceKind }),
                onClick: () => {
                  const inspectResourceType = isCluster ? 'clusterpushsecrets' : 'pushsecrets';
                  if (isCluster) {
                    window.location.href = `/secrets-management/inspect/${inspectResourceType}/${pushSecret.metadata.name}`;
                  } else {
                    window.location.href = `/secrets-management/inspect/${inspectResourceType}/${pushSecret.metadata.namespace}/${pushSecret.metadata.name}`;
                  }
                },
              },
              ...(canDeleteRow(isCluster ? undefined : pushSecret.metadata.namespace)
                ? [
                    {
                      key: 'delete',
                      label: t('Delete {{kind}}', { kind: resourceKind }),
                      onClick: () => openDeleteModal(pushSecret),
                    },
                  ]
                : []),
            ]}
          />,
        ],
      };
    });
  }, [pushSecrets, clusterPushSecrets, loaded, t, canDeleteRow]);

  const getErrorMessage = () => {
    if (loadError?.message?.includes('no matches for kind')) {
      return t(
        'PushSecret CRDs are not available. This feature requires External Secrets Operator v0.9.0 or later.',
      );
    }
    return formatResourceTableErrorMessage(loadError, t, {
      resourceCategory: t('Push Secrets'),
      namespace: listErrorNamespace(selectedProject),
    });
  };

  return (
    <>
      <ResourceTable
        columns={columns}
        rows={rows}
        loading={!loaded}
        error={getErrorMessage()}
        emptyStateTitle={t('No push secrets found')}
        emptyStateBody={
          selectedProject === 'all'
            ? t('No PushSecrets are currently available in all projects.')
            : t('No PushSecrets are currently available in the project {{project}}.', {
                project: selectedProject,
              })
        }
        selectedProject={selectedProject}
        data-test="push-secrets-table"
      />

      <DeleteConfirmationModal
        isOpen={deleteModal.isOpen}
        resourceName={deleteModal.pushSecret?.metadata?.name || ''}
        resourceType={
          deleteModal.pushSecret && isClusterPushSecret(deleteModal.pushSecret)
            ? t('ClusterPushSecret')
            : t('PushSecret')
        }
        isDeleting={deleteModal.isDeleting}
        error={deleteModal.error}
        onConfirm={() => deleteModal.pushSecret && handleDelete(deleteModal.pushSecret)}
        onCancel={closeDeleteModal}
      />
    </>
  );
};
