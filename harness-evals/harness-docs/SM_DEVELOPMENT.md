# Secrets Management Console - Development Guide

> **Generic Development Practices**: See [Platform Development Practices](https://github.com/openshift/enhancements/tree/master/ai-docs/practices/development) for cross-project standards.

This guide covers **Secrets Management Console-specific** development practices.

## Quick Start

### Prerequisites

- Node.js 20+ (from Dockerfile)
- Yarn 4.14.1 (corepack, declared in `package.json`)
- Podman or Docker (`CONTAINER_RUNTIME` env var, defaults to `podman`)
- Access to OpenShift cluster (for E2E tests and local Console dev)

### Install & Build

```bash
yarn install
yarn build          # production build
yarn build-dev      # development build (no minification)
yarn start          # dev server on port 9001
```

### Containerized Build (preferred)

```bash
make plugin-build   # runs typecheck + build inside container
make plugin-image   # builds container image
```

## Development Workflow

### 1. Local Development with Console

```bash
./start-console.sh
```

Runs the OpenShift Console container with the plugin dev server. Requires `KUBECONFIG` and a cluster.

### 2. Key Make Targets

| Target | Purpose |
|--------|---------|
| `make plugin-build` | Typecheck + build (containerized) |
| `make plugin-check` | Typecheck + lint (containerized) |
| `make plugin-test` | Jest unit tests (containerized) |
| `make plugin-lint` | ESLint + Stylelint (containerized) |
| `make plugin-typecheck` | TypeScript type-check only |
| `make test-e2e-premerge` | Playwright pre-merge tests (mock-based, no cluster) |
| `make test-e2e` | Playwright post-merge tests (requires cluster) |
| `make verify` | `plugin-check` + `test` |
| `make update` | `update-types` (fetch + generate CRD types) |
| `make clean` | Remove generated files |

### 3. CRD Type Updates

When upstream CRD versions change:

```bash
# 1. Edit crd-sources.json — bump version
# 2. Regenerate types
make update-types    # fetch-crds + generate-types

# 3. If CRD usage in code changed (new kinds, removed kinds):
make sync-crd-types  # AI-assisted sync of the 4-file shim layer
```

**Four files must stay in sync** (see AGENTS.md):
- `crd-sources.json`
- `scripts/generate-types.ts`
- `src/components/crds/index.ts`
- `src/components/crds/Events.ts`

### 4. Deploy to Cluster

```bash
# Via Helm
scripts/deploy-to-cluster.sh

# Via OLM bundle
scripts/deploy-via-bundle.sh
```

## Common Tasks

### Add a New CRD Resource to the Dashboard

1. Add entry to `crd-sources.json` with repo, ref, file path
2. Run `make update-types` to generate TypeScript
3. Create model + interface in `src/components/crds/NewResource.ts`
4. Export from `src/components/crds/index.ts`
5. Create `src/components/NewResourceTable.tsx` (follow `CertificatesTable.tsx` pattern)
6. Add section in `SecretsManagement.tsx` (conditional on operator detection)
7. Add CRD name to `useOperatorDetection.ts` if new operator
8. Add i18n keys to `locales/en/plugin__ocp-secrets-management.json`
9. Run `make sync-crd-types` then `make verify`

### Add a New Operator Domain

1. Add CRD entries to `crd-sources.json`
2. Add detection CRD to `useOperatorDetection.ts` — returns new `{installed, loading, error}` field
3. Add operator filter option in `SecretsManagement.tsx` filter dropdown
4. Create table component(s) following existing pattern
5. Add RBAC rules to `charts/openshift-console-plugin/templates/rbac-clusterroles.yaml`

### Add a Column to an Existing Table

1. Edit the table component (e.g., `CertificatesTable.tsx`)
2. Add column definition to `columns` array
3. Add cell value to row mapping
4. Add i18n key for column header

## Build & Release

### Container Images

- **Dev**: `Dockerfile` — UBI9 Node 20 build + UBI9 Nginx 1.20
- **Production**: `Containerfile.ocp-secrets-management` — Konflux build with Red Hat labels
- **CI**: `.ci-operator.yaml` for OpenShift CI, `.tekton/` for Konflux pipelines

### Helm Chart

`charts/openshift-console-plugin/` — creates Deployment, Service, ConsolePlugin CR, RBAC, and a patcher Job to auto-enable the plugin.

### Operator

`operator/` — Go operator managing `SecretsManagementConfig` CRD (v1alpha1). Has its own `Makefile` and OLM bundle.

## Common Mistakes

1. DO NOT hand-edit files with "Auto-generated from CRD" headers — they are overwritten by `yarn generate-types`
2. DO NOT use `useParams()` for URL parsing — it does not work in Console plugin environment. Use `window.location.pathname.split('/')`
3. DO NOT use React Router navigation (`useNavigate`, `<Link>`) — use `window.location.href` for inspect links
4. DO NOT forget to add i18n keys — every user-facing string must go through `t()` from `useTranslation('plugin__ocp-secrets-management')`
5. DO NOT import `Modal` from `@patternfly/react-core` directly — use `@patternfly/react-core/deprecated` (current codebase pattern)
6. DO NOT call the K8s API directly — all requests must go through `consoleFetch` (the console proxy handles auth, CSRF, impersonation)
7. DO NOT add `core/v1` Secrets to any RBAC role — this plugin displays CRD metadata only, never `core/v1` Secret data
8. DO NOT store or forward bearer tokens in plugin code — the console session manages them
9. DO NOT place `useK8sWatchResource` inside loops or row-level components — one call per resource kind per table
10. DO NOT parallelize operator detection checks — sequential is intentional to avoid slamming the API server
11. DO NOT add destructive actions (delete, patch, update) without `DeleteConfirmationModal` name-confirmation

## Security Rules

- All K8s API calls go through the console proxy via `consoleFetch`. Never call the cluster API server directly.
- `ResourceInspect.tsx` masks sensitive spec/status data (`containsSensitiveData()`) behind a toggle. When adding new resource types, update the `sensitiveKeys` array.
- Delete confirmation requires typing the exact resource name. The comparison uses strict equality (`===`).
- Container images must run as non-root with `seccompProfile: RuntimeDefault` and `capabilities: drop: [ALL]`.
- Production images (`Containerfile.*`) must use digest-pinned base images from trusted registries.
- RBAC tiers: `view` (get/list/watch), `delete` (delete only), `admin` (all verbs). Never use `verbs: ["*"]` in view or delete roles.

## Performance Rules

- **Watch budget**: ~13 simultaneous WebSocket watches when all operators installed. New watches must be in separate table components gated by `shouldShowComponent`.
- **Conditional rendering gates watches**: Unrendered tables have zero watches. Always wrap new tables in `shouldShowComponent(operatorKey, resourceKind)`.
- **Client-side pagination**: `DEFAULT_PER_PAGE=10`, max 100. No server-side pagination — `ResourceTable` slices the full row array.
- **Row memoization**: `useMemo` includes `openDropdowns` in deps — avoid adding volatile dependencies (timers, hover state, `Date.now()`).
- **Bundle size**: Only runtime dependency is `js-yaml` (code-split in `ResourceInspect`). Import PatternFly components individually, never barrel exports.
- **ResourceInspect**: Opens up to 3 watches (main resource, pod statuses, events). Always use `fieldSelector` for Events.

## Error Handling Patterns

- **useK8sWatchResource tuple**: Pass `loading={!loaded}` (inverted) and `error={loadError?.message}` (string, not Error object) to `ResourceTable`.
- **ResourceTable tri-state**: Renders states in priority order: Loading > Error > Empty > Data. Provide `data-test` suffixes (`-loading`, `-error`, `-empty`).
- **Operator detection**: HTTP 404 = not installed (not an error). Real API errors stored in `OperatorStatus.error` with retry button.
- **consoleFetch errors**: Check `response.ok`, read `response.text()` (not `.json()`), throw Error with status code + body.
- **Delete errors**: Show inline Alert in modal. Catch pattern: `error instanceof Error ? error.message : 'Failed to delete'`.
- **ResourceInspect error cascade**: Invalid resource type (danger, blocking) > Loading > Load error (danger, blocking) > Not found (warning, blocking) > Events error (warning, section-scoped).

## i18n

- Namespace: `plugin__ocp-secrets-management`
- Locale files: `locales/en/plugin__ocp-secrets-management.json`
- Extract keys: `yarn i18n`
- Console extensions use `%plugin__ocp-secrets-management~Key%` format

## See Also

- [Testing Guide](./SM_TESTING.md)
- [Architecture](./architecture/components.md)
- [Security Guidelines](./guidelines/security-guidelines.md)
- [Performance Guidelines](./guidelines/performance-guidelines.md)
- [Error Handling Guidelines](./guidelines/error-handling-guidelines.md)
- [API Contracts Guidelines](./guidelines/api-contracts-guidelines.md)
- [Integration Guidelines](./guidelines/integration-guidelines.md)
