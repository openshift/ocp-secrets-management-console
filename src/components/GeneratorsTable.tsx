import * as React from 'react';
import { useTranslation } from 'react-i18next';

import { Label, LabelProps } from '@patternfly/react-core';
import { CheckCircleIcon, TimesCircleIcon } from '@patternfly/react-icons';
import { ResourceTable } from './ResourceTable';
import { DeleteConfirmationModal } from './DeleteConfirmationModal';
import { RowActionsMenu } from './RowActionsMenu';
import { useK8sWatchResource, consoleFetch } from '@openshift-console/dynamic-plugin-sdk';
import {
  useClusterWatchAllowed,
  useClusterDeleteAllowed,
  useNamespacedDeleteAllowed,
  isDeleteAllowed,
} from '../hooks/useClusterWatchAllowed';
import {
  GENERATOR_KIND_DEFS,
  getGeneratorModel,
  GeneratorKindDef,
  GeneratorResource,
  describeGenerator,
  getGeneratorKind,
  getGeneratorInspectHref,
  isClusterGenerator,
} from './crds';
import {
  formatDeleteErrorMessage,
  formatResourceTableErrorMessage,
} from '../utils/permissionErrors';

const isMissingCrdError = (error: { message?: string } | undefined): boolean => {
  const message = error?.message?.toLowerCase() || '';
  return (
    message.includes('no matches for kind') ||
    message.includes('not found') ||
    message.includes('could not find') ||
    /\b404\b/.test(message)
  );
};

const getGeneratorStatus = (generator: GeneratorResource) => {
  const readyCondition = generator.status?.conditions?.find(
    (condition) => condition.type === 'Ready',
  );

  if (!readyCondition) {
    return {
      status: 'Configured',
      icon: <CheckCircleIcon />,
      labelStatus: 'success' as NonNullable<LabelProps['status']>,
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
    status: readyCondition.reason || 'Not Ready',
    icon: <TimesCircleIcon />,
    labelStatus: 'danger' as NonNullable<LabelProps['status']>,
  };
};

interface KindWatchResult {
  kind: string;
  plural: string;
  clusterScoped: boolean;
  items: GeneratorResource[];
  loaded: boolean;
  error?: { message?: string };
}

const sameWatchResult = (a: KindWatchResult | undefined, b: KindWatchResult): boolean => {
  if (!a) return false;
  if (a.loaded !== b.loaded || a.error?.message !== b.error?.message) return false;
  if (a.items === b.items) return true;
  if (a.items.length !== b.items.length) return false;
  return a.items.every(
    (item, index) =>
      item.metadata?.name === b.items[index]?.metadata?.name && item.kind === b.items[index]?.kind,
  );
};

interface GeneratorKindWatchProps {
  def: GeneratorKindDef;
  namespace?: string;
  onUpdate: (result: KindWatchResult) => void;
}

interface GeneratorKindDeleteAccessProps {
  def: GeneratorKindDef;
  namespace?: string;
  onUpdate: (kind: string, allowed: boolean) => void;
}

const GeneratorKindDeleteAccess: React.FC<GeneratorKindDeleteAccessProps> = ({
  def,
  namespace,
  onUpdate,
}) => {
  const model = getGeneratorModel(def.kind);
  const clusterDelete = useClusterDeleteAllowed(def.clusterScoped ? model : null);
  const namespacedDelete = useNamespacedDeleteAllowed(
    def.clusterScoped ? null : model,
    namespace || '',
  );
  const allowed = def.clusterScoped
    ? isDeleteAllowed(clusterDelete)
    : namespace
      ? isDeleteAllowed(namespacedDelete)
      : false;

  React.useLayoutEffect(() => {
    onUpdate(def.kind, allowed);
  }, [def.kind, allowed, onUpdate]);

  return null;
};

const GeneratorKindWatch: React.FC<GeneratorKindWatchProps> = ({ def, namespace, onUpdate }) => {
  const model = getGeneratorModel(def.kind);
  const { allowed: clusterAllowed, loading: clusterAccessLoading } = useClusterWatchAllowed(
    def.clusterScoped ? model : null,
  );
  const watchEnabled = !def.clusterScoped || (clusterAllowed && !clusterAccessLoading);
  const [items, loaded, error] = useK8sWatchResource<GeneratorResource[]>(
    watchEnabled
      ? {
          groupVersionKind: model,
          namespace: def.clusterScoped ? undefined : namespace,
          isList: true,
        }
      : null,
  );

  React.useEffect(() => {
    onUpdate({
      kind: def.kind,
      plural: def.plural,
      clusterScoped: def.clusterScoped,
      items: (items || []).map((item) => ({
        ...item,
        kind: item.kind || def.kind,
      })),
      loaded,
      error,
    });
  }, [def.kind, def.plural, def.clusterScoped, items, loaded, error, onUpdate]);

  return null;
};

interface GeneratorsTableProps {
  selectedProject: string;
}

export const GeneratorsTable: React.FC<GeneratorsTableProps> = ({ selectedProject }) => {
  const { t } = useTranslation('plugin__ocp-secrets-management');
  const [watchState, setWatchState] = React.useState<Record<string, KindWatchResult>>({});
  const [deleteAllowedByKind, setDeleteAllowedByKind] = React.useState<Record<string, boolean>>({});
  const [deleteModal, setDeleteModal] = React.useState<{
    isOpen: boolean;
    generator: GeneratorResource | null;
    isDeleting: boolean;
    error: string | null;
  }>({
    isOpen: false,
    generator: null,
    isDeleting: false,
    error: null,
  });

  const handleDeleteAccessUpdate = React.useCallback((kind: string, allowed: boolean) => {
    setDeleteAllowedByKind((prev) => {
      if (prev[kind] === allowed) {
        return prev;
      }
      return { ...prev, [kind]: allowed };
    });
  }, []);

  const handleWatchUpdate = React.useCallback((result: KindWatchResult) => {
    setWatchState((prev) => {
      if (sameWatchResult(prev[result.kind], result)) {
        return prev;
      }
      return { ...prev, [result.kind]: result };
    });
  }, []);

  const handleInspect = (generator: GeneratorResource) => {
    window.location.href = getGeneratorInspectHref(generator);
  };

  const openDeleteModal = (generator: GeneratorResource) => {
    setDeleteModal({
      isOpen: true,
      generator,
      isDeleting: false,
      error: null,
    });
  };

  const confirmDelete = async () => {
    if (!deleteModal.generator) return;

    setDeleteModal((prev) => ({ ...prev, isDeleting: true, error: null }));

    try {
      const resource = deleteModal.generator;
      const def = GENERATOR_KIND_DEFS.find((entry) => entry.kind === resource.kind);
      const model = getGeneratorModel(resource.kind || 'Password');
      const isCluster = def?.clusterScoped || isClusterGenerator(resource);
      const resourceName = resource.metadata.name;
      const apiPath = isCluster
        ? `/api/kubernetes/apis/${model.group}/${model.version}/${def?.plural || 'clustergenerators'}/${resourceName}`
        : `/api/kubernetes/apis/${model.group}/${model.version}/namespaces/${resource.metadata.namespace}/${def?.plural}/${resourceName}`;

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
        generator: null,
        isDeleting: false,
        error: null,
      });
    } catch (error: unknown) {
      setDeleteModal((prev) => ({
        ...prev,
        isDeleting: false,
        error: formatDeleteErrorMessage(error, t, {
          resourceCategory: t('Generators'),
          namespace: deleteModal.generator?.metadata?.namespace,
        }),
      }));
    }
  };

  const cancelDelete = () => {
    setDeleteModal({
      isOpen: false,
      generator: null,
      isDeleting: false,
      error: null,
    });
  };

  const namespace = selectedProject === 'all' ? undefined : selectedProject;
  const watchResults = GENERATOR_KIND_DEFS.map((def) => watchState[def.kind]);
  const loaded = watchResults.every((result) => result?.loaded);
  const realErrors = watchResults
    .filter((result) => result?.error && !isMissingCrdError(result.error))
    .map((result) => result.error?.message)
    .filter((message): message is string => Boolean(message));
  const loadError = realErrors.length === GENERATOR_KIND_DEFS.length ? realErrors[0] : undefined;

  const columns = [
    { title: t('Name'), width: 16 },
    { title: t('Namespace'), width: 12 },
    { title: t('Type'), width: 16 },
    { title: t('Generator Kind'), width: 16 },
    { title: t('Details'), width: 20 },
    { title: t('Status'), width: 12 },
    { title: '', width: 8 },
  ];

  const rows = React.useMemo(() => {
    if (!loaded) return [];

    const allGenerators = GENERATOR_KIND_DEFS.flatMap((def) => {
      const result = watchState[def.kind];
      if (!result || isMissingCrdError(result.error)) return [];
      return result.items;
    }).sort((a, b) => a.metadata.name.localeCompare(b.metadata.name));

    return allGenerators.map((generator) => {
      const namespaceLabel = isClusterGenerator(generator)
        ? 'Cluster-wide'
        : generator.metadata.namespace || '-';
      const generatorId = `${generator.kind}-${namespaceLabel}-${generator.metadata.name}`;
      const conditionStatus = getGeneratorStatus(generator);
      const generatorKind = generator.kind || t('Generator');
      const kindKey = generator.kind || 'Password';
      const showDelete = deleteAllowedByKind[kindKey] === true;

      return {
        cells: [
          generator.metadata.name,
          namespaceLabel,
          generator.kind || '-',
          getGeneratorKind(generator),
          describeGenerator(generator),
          <Label
            key={`${generatorId}-status`}
            status={conditionStatus.labelStatus}
            icon={conditionStatus.icon}
          >
            {conditionStatus.status}
          </Label>,
          <RowActionsMenu
            key={`${generatorId}-actions`}
            menuId={generatorId}
            actions={[
              {
                key: 'inspect',
                label: t('Inspect {{kind}}', { kind: generatorKind }),
                onClick: () => handleInspect(generator),
              },
              ...(showDelete
                ? [
                    {
                      key: 'delete',
                      label: t('Delete {{kind}}', { kind: generatorKind }),
                      onClick: () => openDeleteModal(generator),
                    },
                  ]
                : []),
            ]}
          />,
        ],
      };
    });
  }, [loaded, watchState, deleteAllowedByKind, t]);

  return (
    <>
      {GENERATOR_KIND_DEFS.map((def) => (
        <React.Fragment key={def.kind}>
          <GeneratorKindDeleteAccess
            def={def}
            namespace={namespace}
            onUpdate={handleDeleteAccessUpdate}
          />
          <GeneratorKindWatch def={def} namespace={namespace} onUpdate={handleWatchUpdate} />
        </React.Fragment>
      ))}
      <ResourceTable
        columns={columns}
        rows={rows}
        loading={!loaded}
        error={
          loadError
            ? formatResourceTableErrorMessage(loadError, t, {
                resourceCategory: t('Generators'),
                namespace,
              })
            : undefined
        }
        emptyStateTitle={t('No generators found')}
        emptyStateBody={
          selectedProject === 'all'
            ? t('No Generators are currently available in all projects.')
            : t('No Generators are currently available in the project {{project}}.', {
                project: selectedProject,
              })
        }
        selectedProject={selectedProject}
        data-test="generators-table"
      />

      <DeleteConfirmationModal
        isOpen={deleteModal.isOpen}
        resourceName={deleteModal.generator?.metadata?.name || ''}
        resourceType={deleteModal.generator?.kind || t('Generator')}
        isDeleting={deleteModal.isDeleting}
        error={deleteModal.error}
        onConfirm={confirmDelete}
        onCancel={cancelDelete}
      />
    </>
  );
};
