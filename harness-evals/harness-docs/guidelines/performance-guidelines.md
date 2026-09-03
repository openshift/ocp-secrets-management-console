# Performance Guidelines

Rules for keeping the Secrets Management Console plugin responsive, derived from actual codebase patterns.

## 1. WebSocket Watch Budget

The dashboard opens one `useK8sWatchResource` call per resource kind per table. When all operators are installed, the page maintains ~13 simultaneous WebSocket watches.

Rules:
- Do not add new `useK8sWatchResource` calls without updating this count.
- When adding a new resource kind, add it as a separate table component so `shouldShowComponent` can gate its rendering (and thereby its watches).
- Never place a `useK8sWatchResource` call inside a loop or row-level component.
- Cluster-scoped watches cannot be filtered by namespace. Do not work around this by fetching and filtering client-side.

## 2. Conditional Rendering Gates Watches

`shouldShowComponent` in `SecretsManagement.tsx` prevents table components from rendering when filtered out. An unrendered table has zero watches.

Rules:
- Always wrap new table components in `shouldShowComponent(operatorKey, resourceKind)` checks.
- Never hoist `useK8sWatchResource` calls up to `SecretsManagement.tsx`.
- If a table watches two API groups (e.g., Issuers + ClusterIssuers), keep both watches in the same component so they share the same render gate.

## 3. Row Memoization

Every `*Table.tsx` wraps row-building in `React.useMemo`, but includes `openDropdowns` in the dependency array. Toggling any kebab dropdown recomputes the entire row array.

Rules:
- Do not add frequently-changing dependencies (timers, animation state, hover state) to row memoization.
- If refactoring the kebab dropdown out of rows, remove `openDropdowns` from the `useMemo` dependency array.
- Never put `Date.now()` or similar volatile values inside a `useMemo` callback for rows.

## 4. Pagination Is Client-Side Only

`ResourceTable.tsx` receives the full row array and slices with `rows.slice(pageStart, pageStart + perPage)`. There is no server-side pagination.

Rules:
- Keep `DEFAULT_PER_PAGE` at 10.
- The `PER_PAGE_OPTIONS` caps at 100. Do not add options above 100 without adding row virtualization.
- Filtering by project happens at the `useK8sWatchResource` level via the `namespace` parameter, not by filtering in JS. Keep this pattern.

## 5. Namespace Watch and Project Filter

`SecretsManagement.tsx` no longer maintains its own Namespace watch or project dropdown. It uses the
Console SDK's `NamespaceBar` component and `useActiveNamespace()` hook (global Console project context),
converting the SDK's `"#ALL_NS#"` sentinel to the page's own `selectedProject: 'all'` contract via
`isAllNamespacesKey()`.

Rules:
- Do not reintroduce a page-local namespace watch/dropdown; rely on the global `NamespaceBar` /
  `useActiveNamespace()` so this page matches standard console UX and stays in sync with the rest of
  the console.
- When the active namespace changes, all visible tables re-render. This is expected.

## 6. Operator Detection Sequencing

`useOperatorDetection.ts` checks four operators sequentially, not in parallel. This is intentional to avoid slamming the API server.

Rules:
- Do not parallelize all operator checks.
- If adding a fifth operator, add it after the existing checks.
- Detection runs once on mount. The `refresh` callback is user-triggered only. Do not add automatic polling.

## 7. Component Re-render Isolation

Table components are plain `React.FC` without `React.memo`. They re-render when `SecretsManagement` re-renders.

Rules:
- Opening any filter dropdown re-renders all visible tables. This is acceptable due to `useMemo` on rows.
- Prefer colocating new interactive state in child components.
- Do not wrap table components in `React.memo` unless profiling shows a bottleneck.

## 8. Bundle Size

Only runtime dependency: `js-yaml` (used in `ResourceInspect.tsx`).

Rules:
- `ResourceInspect` is a separate exposed module -- webpack code-splits it automatically. Do not import `js-yaml` from `SecretsManagement.tsx`.
- PatternFly components are imported individually. Do not import the entire library.
- Do not add runtime dependencies for inspect-only features -- they are already code-split.
- Import specific icons from `@patternfly/react-icons`, never the barrel export.

## 9. ResourceInspect Watch Discipline

`ResourceInspect.tsx` opens up to three watches: main resource, pod statuses (SecretProviderClass only), and events.

Rules:
- Always use `fieldSelector` when watching Events.
- The pod status watch is always created (React hooks constraint) but data is used conditionally.
- Do not add watches for related resources without gating behind user action.
