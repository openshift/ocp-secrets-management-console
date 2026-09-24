import * as React from 'react';
import {
  useAccessReview,
  useK8sWatchResource,
  type AccessReviewResourceAttributes,
} from '@openshift-console/dynamic-plugin-sdk';
import { GENERATOR_KIND_DEFS } from '../components/crds/Generator';

/** Minimal GVK shape used by table components and CRD shims. */
export type K8sGroupVersionKind = {
  group: string;
  version: string;
  kind: string;
};

/**
 * Maps Kubernetes kind to the plural API resource name used in SelfSubjectAccessReview.
 * Keep in sync with relationship graph CRD registry (FR-003).
 */
const KIND_TO_PLURAL_RESOURCE: Record<string, string> = {
  Certificate: 'certificates',
  Issuer: 'issuers',
  ClusterIssuer: 'clusterissuers',
  ExternalSecret: 'externalsecrets',
  ClusterExternalSecret: 'clusterexternalsecrets',
  SecretStore: 'secretstores',
  ClusterSecretStore: 'clustersecretstores',
  PushSecret: 'pushsecrets',
  ClusterPushSecret: 'clusterpushsecrets',
  Generator: 'generators',
  ClusterGenerator: 'clustergenerators',
  SecretProviderClass: 'secretproviderclasses',
  Bundle: 'bundles',
};

const CLUSTER_SCOPED_KINDS = new Set([
  'ClusterIssuer',
  'ClusterExternalSecret',
  'ClusterSecretStore',
  'ClusterPushSecret',
  'ClusterGenerator',
  'Bundle',
]);

export function getPluralResourceName(kind: string): string | undefined {
  if (KIND_TO_PLURAL_RESOURCE[kind]) {
    return KIND_TO_PLURAL_RESOURCE[kind];
  }
  return GENERATOR_KIND_DEFS.find((def) => def.kind === kind)?.plural;
}

export function isClusterScopedKind(kind: string): boolean {
  return CLUSTER_SCOPED_KINDS.has(kind);
}

/** Builds access review attributes for a cluster-scoped list/watch check. */
export function getClusterWatchAccessReviewAttributes(
  model: K8sGroupVersionKind,
): AccessReviewResourceAttributes | null {
  const resource = getPluralResourceName(model.kind);
  if (!resource) {
    return null;
  }
  return {
    group: model.group,
    resource,
    verb: 'watch',
  };
}

/** Builds access review attributes for a namespaced resource watch in a project. */
export function getNamespacedWatchAccessReviewAttributes(
  model: K8sGroupVersionKind,
  namespace: string,
): AccessReviewResourceAttributes | null {
  const resource = getPluralResourceName(model.kind);
  if (!resource || !namespace || namespace === 'all') {
    return null;
  }
  return {
    group: model.group,
    resource,
    verb: 'watch',
    namespace,
  };
}

/** Builds access review attributes for a cluster-scoped delete check. */
export function getClusterDeleteAccessReviewAttributes(
  model: K8sGroupVersionKind,
): AccessReviewResourceAttributes | null {
  const resource = getPluralResourceName(model.kind);
  if (!resource) {
    return null;
  }
  return {
    group: model.group,
    resource,
    verb: 'delete',
  };
}

/** Builds access review attributes for a namespaced resource delete in a project. */
export function getNamespacedDeleteAccessReviewAttributes(
  model: K8sGroupVersionKind,
  namespace: string,
): AccessReviewResourceAttributes | null {
  const resource = getPluralResourceName(model.kind);
  if (!resource || !namespace || namespace === 'all') {
    return null;
  }
  return {
    group: model.group,
    resource,
    verb: 'delete',
    namespace,
  };
}

export type ClusterWatchAllowedResult = {
  /** Whether the user may watch the cluster-scoped resource type. */
  allowed: boolean;
  loading: boolean;
};

/**
 * Returns whether the current user may start a cluster-scoped watch for the given model.
 * Pass a cluster-scoped model (e.g. ClusterIssuerModel). For undefined/null model, returns
 * allowed=false without calling the API.
 */
export function useClusterWatchAllowed(
  clusterModel?: K8sGroupVersionKind | null,
): ClusterWatchAllowedResult {
  const attributes = React.useMemo(() => {
    if (!clusterModel) {
      return null;
    }
    return getClusterWatchAccessReviewAttributes(clusterModel);
  }, [clusterModel?.group, clusterModel?.version, clusterModel?.kind]);

  const skipReview = attributes === null;

  const [allowed, loading] = useAccessReview(
    attributes ?? { group: '', resource: '' },
    undefined,
    skipReview,
  );

  if (skipReview) {
    return { allowed: false, loading: false };
  }

  return { allowed, loading };
}

export type NamespacedWatchAllowedResult = ClusterWatchAllowedResult;

/**
 * Returns whether the user may watch a namespaced resource type in the given project.
 */
export function useNamespacedWatchAllowed(
  model: K8sGroupVersionKind | null | undefined,
  namespace: string,
): NamespacedWatchAllowedResult {
  const attributes = React.useMemo(
    () => (model ? getNamespacedWatchAccessReviewAttributes(model, namespace) : null),
    [model?.group, model?.version, model?.kind, namespace],
  );

  const skipReview = attributes === null;

  const [allowed, loading] = useAccessReview(
    attributes ?? { group: '', resource: '' },
    undefined,
    skipReview,
  );

  if (skipReview) {
    return { allowed: false, loading: false };
  }

  return { allowed, loading };
}

export type DeleteAllowedResult = ClusterWatchAllowedResult;

/**
 * Returns whether the current user may delete cluster-scoped resources of the given model.
 */
export function useClusterDeleteAllowed(
  clusterModel?: K8sGroupVersionKind | null,
): DeleteAllowedResult {
  const attributes = React.useMemo(() => {
    if (!clusterModel) {
      return null;
    }
    return getClusterDeleteAccessReviewAttributes(clusterModel);
  }, [clusterModel?.group, clusterModel?.version, clusterModel?.kind]);

  const skipReview = attributes === null;

  const [allowed, loading] = useAccessReview(
    attributes ?? { group: '', resource: '' },
    undefined,
    skipReview,
  );

  if (skipReview) {
    return { allowed: false, loading: false };
  }

  return { allowed, loading };
}

/**
 * Returns whether the current user may delete a namespaced resource type in the given project.
 */
export function useNamespacedDeleteAllowed(
  model: K8sGroupVersionKind | null | undefined,
  namespace: string,
): DeleteAllowedResult {
  const attributes = React.useMemo(
    () => (model ? getNamespacedDeleteAccessReviewAttributes(model, namespace) : null),
    [model?.group, model?.version, model?.kind, namespace],
  );

  const skipReview = attributes === null;

  const [allowed, loading] = useAccessReview(
    attributes ?? { group: '', resource: '' },
    undefined,
    skipReview,
  );

  if (skipReview) {
    return { allowed: false, loading: false };
  }

  return { allowed, loading };
}

/** True when delete is permitted and access review has finished loading. */
export function isDeleteAllowed({ allowed, loading }: DeleteAllowedResult): boolean {
  return allowed && !loading;
}

/**
 * Returns a row predicate for dual-scope tables (namespaced + cluster models).
 * Namespaced rows require a selected project; cluster rows use cluster delete review.
 */
export function useDualScopeDeleteAllowed(
  namespacedModel: K8sGroupVersionKind,
  clusterModel: K8sGroupVersionKind,
  selectedProject: string,
): (rowNamespace?: string) => boolean {
  const clusterDelete = useClusterDeleteAllowed(clusterModel);
  const namespacedDelete = useNamespacedDeleteAllowed(
    namespacedModel,
    selectedProject !== 'all' ? selectedProject : '',
  );

  return React.useCallback(
    (rowNamespace?: string) => {
      if (!rowNamespace) {
        return isDeleteAllowed(clusterDelete);
      }
      if (selectedProject === 'all') {
        return false;
      }
      return isDeleteAllowed(namespacedDelete);
    },
    [clusterDelete, namespacedDelete, selectedProject],
  );
}

/** Cluster-scoped resource tables (e.g. Bundle). */
export function useClusterOnlyDeleteAllowed(clusterModel: K8sGroupVersionKind): boolean {
  const clusterDelete = useClusterDeleteAllowed(clusterModel);
  return isDeleteAllowed(clusterDelete);
}

/** Namespaced-only tables (e.g. Certificate). */
export function useNamespacedOnlyDeleteAllowed(
  model: K8sGroupVersionKind,
  selectedProject: string,
): boolean {
  const namespacedDelete = useNamespacedDeleteAllowed(
    model,
    selectedProject !== 'all' ? selectedProject : '',
  );
  if (selectedProject === 'all') {
    return false;
  }
  return isDeleteAllowed(namespacedDelete);
}

export type OptionalClusterListWatchResult<T> = {
  data: T[];
  loaded: boolean;
  error: unknown;
  clusterWatchSkipped: boolean;
};

/**
 * Watches a cluster-scoped list when the user is allowed; otherwise skips the watch without error.
 */
export function useOptionalClusterListWatch<T>(
  clusterModel: K8sGroupVersionKind,
): OptionalClusterListWatchResult<T> {
  const { allowed, loading: accessLoading } = useClusterWatchAllowed(clusterModel);
  const [data, watchLoaded, error] = useK8sWatchResource<T[]>(
    allowed
      ? {
          groupVersionKind: clusterModel,
          isList: true,
        }
      : null,
  );

  const loaded = !accessLoading && (allowed ? watchLoaded : true);

  return {
    data: allowed ? data || [] : [],
    loaded,
    error: allowed ? error : undefined,
    clusterWatchSkipped: !allowed,
  };
}

/** Combines namespaced + optional cluster list watch loading flags. */
export function combineDualListWatchLoaded(
  namespacedLoaded: boolean,
  cluster: OptionalClusterListWatchResult<unknown>,
): boolean {
  return namespacedLoaded && cluster.loaded;
}

/** Combines errors; skipped cluster watches do not contribute errors. */
export function combineDualListWatchError(
  namespacedError: unknown,
  cluster: OptionalClusterListWatchResult<unknown>,
): unknown {
  if (namespacedError) {
    return namespacedError;
  }
  return cluster.clusterWatchSkipped ? undefined : cluster.error;
}
