import { HttpError } from '@openshift-console/dynamic-plugin-sdk';

export type PermissionDeniedVerb = 'list' | 'delete';

export type PermissionDeniedMessageParams = {
  /** User-facing resource category label (already translated when applicable). */
  resourceCategory: string;
  namespace?: string;
  verb?: PermissionDeniedVerb;
};

export type TranslateFn = (key: string, options?: Record<string, string>) => string;

function errorMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }
  if (typeof error === 'object' && error !== null && 'message' in error) {
    const msg = (error as { message?: unknown }).message;
    if (typeof msg === 'string') {
      return msg;
    }
  }
  return String(error);
}

function isHttpForbidden(error: unknown): boolean {
  if (typeof HttpError === 'function' && error instanceof HttpError) {
    return error.code === 401 || error.code === 403;
  }
  if (typeof error === 'object' && error !== null && 'code' in error) {
    const code = (error as { code?: unknown }).code;
    return code === 401 || code === 403;
  }
  return false;
}

/** True when the error represents insufficient RBAC (401/403 or common API wording). */
export function isPermissionDeniedError(error: unknown): boolean {
  if (!error) {
    return false;
  }
  if (typeof error === 'string') {
    return isPermissionDeniedError(new Error(error));
  }
  if (isHttpForbidden(error)) {
    return true;
  }
  const message = errorMessage(error);
  if (/forbidden|unauthorized/i.test(message)) {
    return true;
  }
  if (/\b403\b/.test(message)) {
    return true;
  }
  if (/Delete failed:\s*403/i.test(message)) {
    return true;
  }
  return false;
}

function isClusterScope(namespace?: string): boolean {
  return !namespace || namespace === 'all';
}

/**
 * Returns i18n-backed copy for permission denial. Callers pass `t` from
 * `useTranslation('plugin__ocp-secrets-management')`.
 */
export function getPermissionDeniedMessage(
  t: TranslateFn,
  params: PermissionDeniedMessageParams,
): string {
  const verb = params.verb ?? 'list';
  const category = params.resourceCategory;

  if (!isClusterScope(params.namespace)) {
    const project = params.namespace as string;
    if (verb === 'delete') {
      return t('You do not have permission to delete {{category}} in project {{project}}.', {
        category,
        project,
      });
    }
    return t('You do not have permission to list {{category}} in project {{project}}.', {
      category,
      project,
    });
  }

  if (verb === 'delete') {
    return t('You do not have permission to delete {{category}} in this cluster.', {
      category,
    });
  }
  return t('You do not have permission to list {{category}} in this cluster.', {
    category,
  });
}

/** Map a watch/list/delete failure to a friendly message when forbidden; otherwise undefined. */
export function getFriendlyPermissionDeniedMessage(
  error: unknown,
  t: TranslateFn,
  params: PermissionDeniedMessageParams,
): string | undefined {
  if (!isPermissionDeniedError(error)) {
    return undefined;
  }
  return getPermissionDeniedMessage(t, params);
}

/** Project scope for list/watch errors from a table's selected project. */
export function listErrorNamespace(selectedProject: string): string | undefined {
  return selectedProject === 'all' ? undefined : selectedProject;
}

/** Maps a table load error to a user-facing string (friendly when forbidden). */
export function formatResourceTableErrorMessage(
  error: unknown,
  t: TranslateFn,
  params: PermissionDeniedMessageParams,
): string | undefined {
  if (!error) {
    return undefined;
  }
  const friendly = getFriendlyPermissionDeniedMessage(error, t, {
    ...params,
    verb: params.verb ?? 'list',
  });
  if (friendly) {
    return friendly;
  }
  return errorMessage(error);
}

/** Maps delete handler errors to user-facing copy (friendly when forbidden). */
export function formatDeleteErrorMessage(
  error: unknown,
  t: TranslateFn,
  params: Omit<PermissionDeniedMessageParams, 'verb'>,
): string {
  const friendly = getFriendlyPermissionDeniedMessage(error, t, { ...params, verb: 'delete' });
  if (friendly) {
    return friendly;
  }
  if (error instanceof Error) {
    return error.message;
  }
  return String(error);
}
