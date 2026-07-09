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
import { CertificateModel, Certificate } from './crds';

const getConditionStatus = (certificate: Certificate) => {
  const readyCondition = certificate.status?.conditions?.find(
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

function getExpiryLabel(
  notAfter: string | undefined,
  t: (key: string, opts?: Record<string, unknown>) => string,
): { text: string; status: NonNullable<LabelProps['status']>; icon: React.ReactElement } | null {
  if (!notAfter) return null;
  const expiry = new Date(notAfter).getTime();
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

interface CertificatesTableProps {
  selectedProject: string;
}

export const CertificatesTable: React.FC<CertificatesTableProps> = ({ selectedProject }) => {
  const { t } = useTranslation('plugin__ocp-secrets-management');
  const [openDropdowns, setOpenDropdowns] = React.useState<Record<string, boolean>>({});
  const [deleteModal, setDeleteModal] = React.useState<{
    isOpen: boolean;
    certificate: Certificate | null;
    isDeleting: boolean;
    error: string | null;
  }>({
    isOpen: false,
    certificate: null,
    isDeleting: false,
    error: null,
  });

  const toggleDropdown = (certId: string) => {
    setOpenDropdowns((prev) => ({
      ...prev,
      [certId]: !prev[certId],
    }));
  };

  const handleInspect = (cert: Certificate) => {
    const namespace = cert.metadata.namespace || 'demo';
    const name = cert.metadata.name;
    window.location.href = `/secrets-management/inspect/certificates/${namespace}/${name}`;
  };

  const handleDelete = (cert: Certificate) => {
    setDeleteModal({
      isOpen: true,
      certificate: cert,
      isDeleting: false,
      error: null,
    });
  };

  const confirmDelete = async () => {
    if (!deleteModal.certificate) return;

    setDeleteModal((prev) => ({ ...prev, isDeleting: true, error: null }));

    try {
      // Manual delete using fetch to bypass k8sDelete API path issues
      const resourceName = deleteModal.certificate?.metadata?.name;
      const resourceNamespace = deleteModal.certificate?.metadata?.namespace;
      const apiPath = `/api/kubernetes/apis/cert-manager.io/v1/namespaces/${resourceNamespace}/certificates/${resourceName}`;

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
        certificate: null,
        isDeleting: false,
        error: null,
      });
    } catch (error: unknown) {
      setDeleteModal((prev) => ({
        ...prev,
        isDeleting: false,
        error: error instanceof Error ? error.message : 'Failed to delete certificate',
      }));
    }
  };

  const cancelDelete = () => {
    setDeleteModal({
      isOpen: false,
      certificate: null,
      isDeleting: false,
      error: null,
    });
  };

  const [certificates, loaded, loadError] = useK8sWatchResource<Certificate[]>({
    groupVersionKind: CertificateModel,
    namespace: selectedProject === 'all' ? undefined : selectedProject,
    isList: true,
  });

  const columns = [
    { title: t('Name'), width: 15 },
    { title: t('Namespace'), width: 10 },
    { title: t('Secret'), width: 15 },
    { title: t('Issuer'), width: 15 },
    { title: t('DNS Names'), width: 20 },
    { title: t('Expiry Date'), width: 10 },
    { title: t('Status'), width: 10 },
    { title: '', width: 5 }, // Actions column
  ];

  const rows = React.useMemo(() => {
    if (!loaded || !certificates) return [];

    return certificates.map((cert) => {
      const conditionStatus = getConditionStatus(cert);
      const dnsNames = cert.spec.dnsNames?.join(', ') || cert.spec.commonName || '-';
      const certId = `${cert.metadata.namespace}-${cert.metadata.name}`;
      const rawExpiry =
        cert.status?.notAfter ??
        cert.metadata.annotations?.['expiry-date'] ??
        cert.metadata.annotations?.['expiryDate'];
      const expiryInfo = getExpiryLabel(rawExpiry, t);

      return {
        cells: [
          cert.metadata.name,
          cert.metadata.namespace,
          cert.spec.secretName,
          `${cert.spec.issuerRef.name} (${cert.spec.issuerRef.kind})`,
          dnsNames,
          expiryInfo ? (
            <Label key={`expiry-${certId}`} status={expiryInfo.status} icon={expiryInfo.icon}>
              {expiryInfo.text}
            </Label>
          ) : (
            '-'
          ),
          <Label key={`status-${certId}`} status={conditionStatus.labelStatus} icon={conditionStatus.icon}>
            {conditionStatus.status}
          </Label>,
          <Dropdown
            key={`dropdown-${certId}`}
            isOpen={openDropdowns[certId] || false}
            onSelect={() => setOpenDropdowns((prev) => ({ ...prev, [certId]: false }))}
            toggle={(toggleRef: React.Ref<MenuToggleElement>) => (
              <MenuToggle
                ref={toggleRef}
                aria-label="kebab dropdown toggle"
                variant="plain"
                onClick={() => toggleDropdown(certId)}
                isExpanded={openDropdowns[certId] || false}
                icon={<EllipsisVIcon />}
              />
            )}
            shouldFocusToggleOnSelect
          >
            <DropdownList>
              <DropdownItem key="inspect" onClick={() => handleInspect(cert)}>
                {t('Inspect')}
              </DropdownItem>
              <DropdownItem key="delete" onClick={() => handleDelete(cert)}>
                {t('Delete')}
              </DropdownItem>
            </DropdownList>
          </Dropdown>,
        ],
      };
    });
  }, [certificates, loaded, openDropdowns, t]);

  return (
    <>
      <ResourceTable
        columns={columns}
        rows={rows}
        loading={!loaded}
        error={loadError?.message}
        emptyStateTitle={t('No certificates found')}
        emptyStateBody={
          selectedProject === 'all'
            ? t('No certificates are currently available in all projects.')
            : t('No certificates are currently available in the project {{project}}.', {
                project: selectedProject,
              })
        }
        selectedProject={selectedProject}
        data-test="certificates-table"
      />
      <DeleteConfirmationModal
        isOpen={deleteModal.isOpen}
        resourceName={deleteModal.certificate?.metadata?.name || ''}
        resourceType={t('Certificate')}
        isDeleting={deleteModal.isDeleting}
        error={deleteModal.error}
        onConfirm={confirmDelete}
        onCancel={cancelDelete}
      />
    </>
  );
};
