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
  ExclamationTriangleIcon,
  TimesCircleIcon,
  EllipsisVIcon,
} from '@patternfly/react-icons';
import { ResourceTable } from './ResourceTable';
import { DeleteConfirmationModal } from './DeleteConfirmationModal';
import { useK8sWatchResource, consoleFetch } from '@openshift-console/dynamic-plugin-sdk';
import {
  SecretProviderClassModel,
  SecretProviderClassPodStatusModel,
  SecretProviderClass,
  SecretProviderClassPodStatus,
} from './crds';

const getProviderIcon = (provider: string) => {
  switch (provider.toLowerCase()) {
    case 'azure':
      return '🔵';
    case 'aws':
      return '🟠';
    case 'gcp':
      return '🔴';
    case 'vault':
      return '🔐';
    case 'kubernetes':
      return '⚙️';
    default:
      return '📦';
  }
};

const getSecretProviderClassStatus = (
  spc: SecretProviderClass,
  podStatuses: SecretProviderClassPodStatus[],
) => {
  // Find pod statuses for this SecretProviderClass; skip entries without status.
  const relevantPodStatuses = podStatuses.filter(
    (podStatus) => podStatus?.status?.secretProviderClassName === spc.metadata.name,
  );

  if (relevantPodStatuses.length === 0) {
    return {
      status: 'Unknown',
      icon: <ExclamationCircleIcon />,
      labelStatus: 'warning' as NonNullable<LabelProps['status']>,
    };
  }

  // Check if any pod has this SecretProviderClass mounted (guard against missing status)
  const mountedPods = relevantPodStatuses.filter((podStatus) => podStatus.status?.mounted === true);

  if (mountedPods.length > 0) {
    return {
      status: 'Ready',
      icon: <CheckCircleIcon />,
      labelStatus: 'success' as NonNullable<LabelProps['status']>,
    };
  }

  // If there are pod statuses but none are mounted
  return {
    status: 'Not Ready',
    icon: <TimesCircleIcon />,
    labelStatus: 'danger' as NonNullable<LabelProps['status']>,
  };
};

function getExpiryLabel(
  dateStr: string | undefined,
  t: (key: string, opts?: Record<string, unknown>) => string,
): { text: string; status: NonNullable<LabelProps['status']>; icon: React.ReactElement } | null {
  if (!dateStr || dateStr === '-') return null;
  const expiry = new Date(dateStr).getTime();
  if (Number.isNaN(expiry)) return null;
  const msPerDay = 24 * 60 * 60 * 1000;
  const diffDays = (expiry - Date.now()) / msPerDay;
  const days = diffDays >= 0 ? Math.floor(diffDays) : Math.ceil(diffDays);

  if (diffDays < 0) {
    const text =
      days === 0 || days === -1 ? t('Expired') : t('Expired {{count}} days ago', { count: -days });
    return { text, status: 'danger', icon: <ExclamationCircleIcon /> };
  }
  if (days <= 2) {
    let text: string;
    if (days === 0) {
      const hours = Math.floor(diffDays * 24);
      text = hours > 0 ? t('Expires in {{count}} hours', { count: hours }) : t('Expires today');
    } else {
      text = t('{{count}} days remaining', { count: days });
    }
    return { text, status: 'danger', icon: <ExclamationCircleIcon /> };
  }
  if (days <= 30) {
    return {
      text: t('{{count}} days remaining', { count: days }),
      status: 'warning',
      icon: <ExclamationTriangleIcon />,
    };
  }
  return {
    text: t('{{count}} days remaining', { count: days }),
    status: 'success',
    icon: <CheckCircleIcon />,
  };
}

interface SecretProviderClassTableProps {
  selectedProject: string;
}

export const SecretProviderClassTable: React.FC<SecretProviderClassTableProps> = ({
  selectedProject,
}) => {
  const { t } = useTranslation('plugin__ocp-secrets-management');
  const [openDropdowns, setOpenDropdowns] = React.useState<Record<string, boolean>>({});
  const [deleteModal, setDeleteModal] = React.useState<{
    isOpen: boolean;
    secretProviderClass: SecretProviderClass | null;
    isDeleting: boolean;
    error: string | null;
  }>({
    isOpen: false,
    secretProviderClass: null,
    isDeleting: false,
    error: null,
  });

  const toggleDropdown = (spcId: string) => {
    setOpenDropdowns((prev) => ({
      ...prev,
      [spcId]: !prev[spcId],
    }));
  };

  const handleDelete = async (secretProviderClass: SecretProviderClass) => {
    setDeleteModal((prev) => ({ ...prev, isDeleting: true, error: null }));

    try {
      const url = `/api/kubernetes/apis/${SecretProviderClassModel.group}/${SecretProviderClassModel.version}/namespaces/${secretProviderClass.metadata.namespace}/secretproviderclasses/${secretProviderClass.metadata.name}`;
      await consoleFetch(url, { method: 'DELETE' });
      setDeleteModal({
        isOpen: false,
        secretProviderClass: null,
        isDeleting: false,
        error: null,
      });
    } catch (error) {
      setDeleteModal((prev) => ({
        ...prev,
        isDeleting: false,
        error: error instanceof Error ? error.message : 'Unknown error occurred',
      }));
    }
  };

  const openDeleteModal = (secretProviderClass: SecretProviderClass) => {
    setDeleteModal({
      isOpen: true,
      secretProviderClass,
      isDeleting: false,
      error: null,
    });
  };

  const closeDeleteModal = () => {
    setDeleteModal({
      isOpen: false,
      secretProviderClass: null,
      isDeleting: false,
      error: null,
    });
  };

  const [secretProviderClasses, spcLoaded, spcLoadError] = useK8sWatchResource<
    SecretProviderClass[]
  >({
    groupVersionKind: SecretProviderClassModel,
    namespace: selectedProject === 'all' ? undefined : selectedProject,
    isList: true,
  });

  const [podStatuses, podStatusesLoaded, podStatusesLoadError] = useK8sWatchResource<
    SecretProviderClassPodStatus[]
  >({
    groupVersionKind: SecretProviderClassPodStatusModel,
    namespace: selectedProject === 'all' ? undefined : selectedProject,
    isList: true,
  });

  const loaded = spcLoaded && podStatusesLoaded;
  const loadError = spcLoadError || podStatusesLoadError;

  const columns = [
    { title: t('Name'), width: 15 },
    { title: t('Namespace'), width: 10 },
    { title: t('Provider'), width: 13 },
    { title: t('Secret Objects'), width: 13 },
    { title: t('Parameters'), width: 24 },
    { title: t('Expiry Date'), width: 10 },
    { title: t('Status'), width: 10 },
    { title: '', width: 5 }, // Actions column
  ];

  const rows = React.useMemo(() => {
    if (!loaded || !secretProviderClasses || !podStatuses) return [];

    return secretProviderClasses.map((spc) => {
      const spcId = `${spc.metadata.namespace}-${spc.metadata.name}`;
      const conditionStatus = getSecretProviderClassStatus(spc, podStatuses);

      // Get secret objects count
      const secretObjectsCount = spc.spec?.secretObjects?.length || 0;
      const secretObjectsText =
        secretObjectsCount > 0
          ? `${secretObjectsCount} secret${secretObjectsCount > 1 ? 's' : ''}`
          : 'None';

      // Get key parameters for display
      const parameters = spc.spec?.parameters || {};
      const parameterKeys = Object.keys(parameters);
      const parametersText =
        parameterKeys.length > 0
          ? `${parameterKeys.length} parameter${parameterKeys.length > 1 ? 's' : ''}`
          : 'None';
      const rawExpiry =
        spc.metadata.annotations?.['expiry-date'] ?? spc.metadata.annotations?.['expiryDate'];
      const expiryInfo = getExpiryLabel(rawExpiry, t);

      return {
        cells: [
          spc.metadata.name,
          spc.metadata.namespace,
          <span key={`provider-${spcId}`}>
            {getProviderIcon(spc.spec?.provider || '')} {spc.spec?.provider || 'Unknown'}
          </span>,
          secretObjectsText,
          parametersText,
          expiryInfo ? (
            <Label key={`expiry-${spcId}`} status={expiryInfo.status} icon={expiryInfo.icon}>
              {expiryInfo.text}
            </Label>
          ) : (
            '-'
          ),
          <Label key={`status-${spcId}`} status={conditionStatus.labelStatus} icon={conditionStatus.icon}>
            {conditionStatus.status}
          </Label>,
          <Dropdown
            key={`dropdown-${spcId}`}
            isOpen={openDropdowns[spcId] || false}
            onSelect={() => setOpenDropdowns((prev) => ({ ...prev, [spcId]: false }))}
            toggle={(toggleRef: React.Ref<MenuToggleElement>) => (
              <MenuToggle
                ref={toggleRef}
                aria-label="kebab dropdown toggle"
                variant="plain"
                onClick={() => toggleDropdown(spcId)}
                isExpanded={openDropdowns[spcId] || false}
                icon={<EllipsisVIcon />}
              />
            )}
            shouldFocusToggleOnSelect
          >
            <DropdownList>
              <DropdownItem
                key="inspect"
                onClick={() => {
                  const url = `/secrets-management/inspect/secretproviderclasses/${spc.metadata.namespace}/${spc.metadata.name}`;
                  window.location.href = url;
                }}
              >
                {t('Inspect')}
              </DropdownItem>
              <DropdownItem key="delete" onClick={() => openDeleteModal(spc)}>
                {t('Delete')}
              </DropdownItem>
            </DropdownList>
          </Dropdown>,
        ],
      };
    });
  }, [secretProviderClasses, podStatuses, loaded, openDropdowns, t]);

  return (
    <>
      <ResourceTable
        columns={columns}
        rows={rows}
        loading={!loaded}
        error={loadError?.message}
        emptyStateTitle={t('No secret provider classes found')}
        emptyStateBody={
          selectedProject === 'all'
            ? t('No SecretProviderClasses are currently available in all projects.')
            : t('No SecretProviderClasses are currently available in the project {{project}}.', {
                project: selectedProject,
              })
        }
        selectedProject={selectedProject}
        data-test="secret-provider-classes-table"
      />

      <DeleteConfirmationModal
        isOpen={deleteModal.isOpen}
        resourceName={deleteModal.secretProviderClass?.metadata?.name || ''}
        resourceType={t('SecretProviderClass')}
        isDeleting={deleteModal.isDeleting}
        error={deleteModal.error}
        onConfirm={() =>
          deleteModal.secretProviderClass && handleDelete(deleteModal.secretProviderClass)
        }
        onCancel={closeDeleteModal}
      />
    </>
  );
};
