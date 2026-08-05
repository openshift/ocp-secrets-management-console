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
import { BundleModel, Bundle, BundleSource } from './crds';

const getSyncedStatus = (bundle: Bundle) => {
  const syncedCondition = bundle.status?.conditions?.find(
    (condition) => condition.type === 'Synced',
  );

  if (!syncedCondition) {
    return {
      status: 'Unknown',
      icon: <ExclamationCircleIcon />,
      labelStatus: 'warning' as NonNullable<LabelProps['status']>,
    };
  }

  if (syncedCondition.status === 'True') {
    return {
      status: 'Synced',
      icon: <CheckCircleIcon />,
      labelStatus: 'success' as NonNullable<LabelProps['status']>,
    };
  }

  return {
    status: syncedCondition.reason || 'Not Synced',
    icon: <TimesCircleIcon />,
    labelStatus: 'danger' as NonNullable<LabelProps['status']>,
  };
};

function describeSource(source: BundleSource): string {
  if (source.useDefaultCAs) return 'Default CAs';
  if (source.configMap) {
    if (source.configMap.selector) return 'ConfigMap (selector)';
    return `ConfigMap: ${source.configMap.name || ''}`;
  }
  if (source.secret) {
    if (source.secret.selector) return 'Secret (selector)';
    return `Secret: ${source.secret.name || ''}`;
  }
  if (source.inLine) return 'Inline';
  return 'Unknown';
}

function describeTarget(bundle: Bundle): string {
  const target = bundle.spec.target;
  const parts: string[] = [];
  if (target.configMap) parts.push(`ConfigMap[${target.configMap.key}]`);
  if (target.secret) parts.push(`Secret[${target.secret.key}]`);
  if (target.additionalFormats?.jks) parts.push('JKS');
  if (target.additionalFormats?.pkcs12) parts.push('PKCS12');
  return parts.join(', ') || '-';
}

function describeNamespaceScope(bundle: Bundle): string {
  const selector = bundle.spec.target.namespaceSelector;
  if (!selector) return 'All namespaces';
  if (selector.matchLabels) {
    const labels = Object.entries(selector.matchLabels)
      .map(([k, v]) => `${k}=${v}`)
      .join(', ');
    return labels;
  }
  return 'Filtered';
}

interface BundlesTableProps {
  selectedProject: string;
}

export const BundlesTable: React.FC<BundlesTableProps> = ({ selectedProject }) => {
  const { t } = useTranslation('plugin__ocp-secrets-management');
  const [openDropdowns, setOpenDropdowns] = React.useState<Record<string, boolean>>({});
  const [deleteModal, setDeleteModal] = React.useState<{
    isOpen: boolean;
    bundle: Bundle | null;
    isDeleting: boolean;
    error: string | null;
  }>({
    isOpen: false,
    bundle: null,
    isDeleting: false,
    error: null,
  });

  const toggleDropdown = (bundleId: string) => {
    setOpenDropdowns((prev) => ({
      ...prev,
      [bundleId]: !prev[bundleId],
    }));
  };

  const handleInspect = (bundle: Bundle) => {
    const name = bundle.metadata.name;
    window.location.href = `/secrets-management/inspect/bundles/${name}`;
  };

  const openDeleteModal = (bundle: Bundle) => {
    setDeleteModal({
      isOpen: true,
      bundle,
      isDeleting: false,
      error: null,
    });
  };

  const confirmDelete = async () => {
    if (!deleteModal.bundle) return;

    setDeleteModal((prev) => ({ ...prev, isDeleting: true, error: null }));

    try {
      const resourceName = deleteModal.bundle.metadata.name;
      const apiPath = `/api/kubernetes/apis/${BundleModel.group}/${BundleModel.version}/bundles/${resourceName}`;

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

      setDeleteModal({
        isOpen: false,
        bundle: null,
        isDeleting: false,
        error: null,
      });
    } catch (error: unknown) {
      setDeleteModal((prev) => ({
        ...prev,
        isDeleting: false,
        error: error instanceof Error ? error.message : 'Failed to delete bundle',
      }));
    }
  };

  const cancelDelete = () => {
    setDeleteModal({
      isOpen: false,
      bundle: null,
      isDeleting: false,
      error: null,
    });
  };

  // Bundles are cluster-scoped, so no namespace filter is needed for the watch.
  // We still accept selectedProject for UI consistency but it won't filter results.
  const [bundles, loaded, loadError] = useK8sWatchResource<Bundle[]>({
    groupVersionKind: BundleModel,
    isList: true,
  });

  const columns = [
    { title: t('Name'), width: 16 },
    { title: t('Sources'), width: 20 },
    { title: t('Target'), width: 18 },
    { title: t('Namespace Scope'), width: 16 },
    { title: t('Default CA Version'), width: 12 },
    { title: t('Status'), width: 10 },
    { title: '', width: 8 },
  ];

  const rows = React.useMemo(() => {
    if (!loaded || !bundles) return [];

    return bundles.map((bundle) => {
      const bundleId = bundle.metadata.name;
      const syncStatus = getSyncedStatus(bundle);
      const sources = bundle.spec.sources.map(describeSource).join(', ');
      const target = describeTarget(bundle);
      const namespaceScope = describeNamespaceScope(bundle);
      const caVersion = bundle.status?.defaultCAVersion || '-';

      return {
        cells: [
          bundleId,
          sources,
          target,
          namespaceScope,
          caVersion,
          <Label key={`status-${bundleId}`} status={syncStatus.labelStatus} icon={syncStatus.icon}>
            {syncStatus.status}
          </Label>,
          <Dropdown
            key={`dropdown-${bundleId}`}
            isOpen={openDropdowns[bundleId] || false}
            onSelect={() => setOpenDropdowns((prev) => ({ ...prev, [bundleId]: false }))}
            toggle={(toggleRef: React.Ref<MenuToggleElement>) => (
              <MenuToggle
                ref={toggleRef}
                aria-label="kebab dropdown toggle"
                variant="plain"
                onClick={() => toggleDropdown(bundleId)}
                isExpanded={openDropdowns[bundleId] || false}
                icon={<EllipsisVIcon />}
              />
            )}
            shouldFocusToggleOnSelect
          >
            <DropdownList>
              <DropdownItem key="inspect" onClick={() => handleInspect(bundle)}>
                {t('Inspect')}
              </DropdownItem>
              <DropdownItem key="delete" onClick={() => openDeleteModal(bundle)}>
                {t('Delete')}
              </DropdownItem>
            </DropdownList>
          </Dropdown>,
        ],
      };
    });
  }, [bundles, loaded, openDropdowns, t]);

  return (
    <>
      <ResourceTable
        columns={columns}
        rows={rows}
        loading={!loaded}
        error={loadError?.message}
        emptyStateTitle={t('No trust bundles found')}
        emptyStateBody={
          selectedProject === 'all'
            ? t(
                'No trust bundles are currently available. Trust bundles are cluster-scoped resources managed by trust-manager.',
              )
            : t(
                'No trust bundles are currently available. Trust bundles are cluster-scoped resources and are not filtered by project.',
              )
        }
        selectedProject={selectedProject}
        data-test="bundles-table"
      />
      <DeleteConfirmationModal
        isOpen={deleteModal.isOpen}
        resourceName={deleteModal.bundle?.metadata?.name || ''}
        resourceType={t('Bundle')}
        isDeleting={deleteModal.isDeleting}
        error={deleteModal.error}
        onConfirm={confirmDelete}
        onCancel={cancelDelete}
      />
    </>
  );
};
