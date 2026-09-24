/**
 * Jest helpers for the cluster-admin persona (all RBAC checks allow).
 * Use in table and dashboard regression tests (US-005).
 */

/** Console SDK `useAccessReview` tuple when the user has permission. */
export const FULL_ACCESS_USE_ACCESS_REVIEW_RESULT: readonly [boolean, boolean] = [true, false];

/** Configure a mocked `useAccessReview` to always allow (not loading). */
export function applyFullAccessUseAccessReviewMock(mockUseAccessReview: jest.Mock): void {
  mockUseAccessReview.mockReturnValue(FULL_ACCESS_USE_ACCESS_REVIEW_RESULT);
}

/** Operator detection shape when every supported operator is installed. */
/** `useOptionalClusterListWatch` result when cluster list/watch is permitted. */
export function createFullAccessOptionalClusterWatch<T>(data: T[] = []) {
  return {
    data,
    loaded: true,
    error: undefined,
    clusterWatchSkipped: false,
  };
}

/** Dual-scope tables: delete allowed for every row. */
export function allowAllDualScopeDelete(mockUseDualScopeDeleteAllowed: jest.Mock): void {
  mockUseDualScopeDeleteAllowed.mockReturnValue(() => true);
}

export function createAllOperatorsInstalledDetection(refresh: jest.Mock = jest.fn()) {
  return {
    certManager: { installed: true, loading: false },
    trustManager: { installed: true, loading: false },
    externalSecrets: { installed: true, loading: false },
    secretsStoreCSI: { installed: true, loading: false },
    loading: false,
    refresh,
  };
}
