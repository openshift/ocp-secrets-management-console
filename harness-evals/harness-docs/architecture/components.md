# Architecture

## Plugin Registration

Console extensions (`console-extensions.json`) register four items:

| Extension | Type | Target |
|-----------|------|--------|
| `/secrets-management` | `console.page/route` (exact) | `SecretsManagement` (default export) |
| `/secrets-management/inspect` | `console.page/route` | `ResourceInspect.ResourceInspect` (named export) |
| Plugins nav section | `console.navigation/section` | Admin perspective, after "observe" |
| Secrets Management link | `console.navigation/href` | Under "plugins" section |

Exposed modules in `package.json` → `consolePlugin.exposedModules`:
- `SecretsManagement` → `./SecretsManagement`
- `ResourceInspect` → `./ResourceInspect`

## Repo Layout

```text
src/
├── SecretsManagement.tsx          # Main dashboard page (default export)
├── ResourceInspect.tsx            # Detail/inspect page (named export: ResourceInspect)
├── components/
│   ├── ResourceTable.tsx          # Reusable paginated table (PF Pagination, loading/error/empty)
│   ├── DeleteConfirmationModal.tsx # Name-confirmation delete dialog
│   ├── OperatorNotInstalled.tsx   # Empty state → OperatorHub link
│   ├── CertificatesTable.tsx      # cert-manager Certificates (with expiry badge)
│   ├── IssuersTable.tsx           # cert-manager Issuers + ClusterIssuers
│   ├── BundlesTable.tsx           # trust-manager Bundles (cluster-scoped)
│   ├── ExternalSecretsTable.tsx   # ESO ExternalSecrets + ClusterExternalSecrets
│   ├── SecretStoresTable.tsx      # ESO SecretStores + ClusterSecretStores
│   ├── PushSecretsTable.tsx       # ESO PushSecrets + ClusterPushSecrets
│   └── SecretProviderClassTable.tsx # SSCSID SecretProviderClasses
│   └── crds/                      # CRD model definitions + TypeScript interfaces
│       ├── index.ts               # Re-exports, union types, type guards
│       ├── Certificate.ts         # CertificateModel
│       ├── Issuer.ts              # IssuerModel, ClusterIssuerModel
│       ├── Bundle.ts              # BundleModel
│       ├── ExternalSecret.ts      # ExternalSecretModel, ClusterExternalSecretModel
│       ├── SecretStore.ts         # SecretStoreModel, ClusterSecretStoreModel
│       ├── PushSecret.ts          # PushSecretModel, ClusterPushSecretModel
│       ├── SecretProviderClass.ts # SecretProviderClassModel, SecretProviderClassPodStatusModel
│       └── Events.ts              # EventModel, K8sEvent, getInvolvedObjectKind()
├── hooks/
│   └── useOperatorDetection.ts    # Detects installed operators via CRD existence
└── types/css.d.ts
```

## Data Flow

```
useOperatorDetection
  └─ consoleFetch → /api/kubernetes/apis/apiextensions.k8s.io/v1/customresourcedefinitions/{name}
  └─ returns {certManager, trustManager, externalSecrets, secretsStoreCSI}.{installed, loading, error}

SecretsManagement (dashboard)
  ├─ FilterState: {operator, resourceKind} (React useState)
  ├─ Project/namespace selection: SDK `NamespaceBar` + `useActiveNamespace()` (global Console namespace
  │    context, not a page-local dropdown); `isAllNamespacesKey()` maps the SDK's "#ALL_NS#" to the
  │    `selectedProject: 'all'` contract expected by table components
  ├─ Renders only sections for installed operators
  └─ Each table component:
       ├─ useK8sWatchResource(model, {namespace: selectedProject})
       ├─ Maps resources → rows for ResourceTable
       └─ Kebab actions: Inspect (window.location.href) | Delete (DeleteConfirmationModal)

ResourceInspect (detail view)
  ├─ Parses URL: /secrets-management/inspect/{resourceType}/{namespace?}/{name}
  ├─ window.location.pathname.split('/') — useParams() does NOT work
  ├─ useK8sWatchResource for the specific resource
  └─ Tabs: Metadata, Labels, Annotations, Spec (YAML), Status (YAML), Events, Pod Statuses
```

## State Management

Pure React state — no Redux, no external store. Each component manages its own:
- `SecretsManagement`: filter selections, operator detection results
- Table components: dropdown open state, delete modal state, pagination
- `useK8sWatchResource` from Console SDK handles data fetching + websocket watching

## Key Patterns

| Pattern | Implementation | Code Reference |
|---------|---------------|----------------|
| Table component | All 7 tables follow identical structure: watch → map → ResourceTable + DeleteConfirmationModal | `src/components/*Table.tsx` |
| Delete | `consoleFetch` with manual API path, not `k8sDelete` SDK helper | `DeleteConfirmationModal.tsx` |
| Navigation to inspect | `window.location.href` assignment (not React Router) | Each table's kebab actions |
| Back navigation | `window.history.back()` | `ResourceInspect.tsx` |
| Cluster vs namespaced | Union types + type guards (`isClusterExternalSecret`, `isClusterPushSecret`) | `src/components/crds/ExternalSecret.ts`, `PushSecret.ts` |
| Modal import | `Modal` from `@patternfly/react-core/deprecated` | `DeleteConfirmationModal.tsx` |
| i18n | `useTranslation('plugin__ocp-secrets-management')` in every component | All `*.tsx` files |
| Test selectors | `data-test` attribute (not `data-testid`) | `setup-tests.ts`, components |

## Build Pipeline

```
yarn install → yarn build (Webpack + ConsoleRemotePlugin) → dist/
  → Container image: Nginx 1.20 (UBI9) serves static files
  → Helm chart or OLM operator deploys to cluster
```

- **Webpack**: `ConsoleRemotePlugin` (module federation), SWC loader (not Babel)
- **Dev server**: port 9001, CORS enabled, `writeToDisk: true`
- **Container runtime**: defaults to `podman`, override with `CONTAINER_RUNTIME=docker`

## Deployment Methods

| Method | Path | Use Case |
|--------|------|----------|
| Helm chart | `charts/openshift-console-plugin/` | Direct cluster deployment |
| OLM operator | `operator/` (Go, SecretsManagementConfig CRD v1alpha1) | Managed lifecycle |
| FBC catalog | `catalogs/v4.22/` | OLM distribution |
| Konflux CI | `.tekton/` | Production builds |

## RBAC

Helm chart creates three ClusterRoles (`charts/openshift-console-plugin/templates/rbac-clusterroles.yaml`):

| Role | Verbs | Notes |
|------|-------|-------|
| `{prefix}-view` | `get`, `list`, `watch` | Read-only. Every new CRD kind must be added here. |
| `{prefix}-delete` | `delete` | Omit status-only subresources (e.g. `secretproviderclasspodstatuses`). |
| `{prefix}-admin` | `*` | Full access. Include all resources from view + delete. |

Never use `verbs: ["*"]` in view or delete roles. Never add `core/v1` Secrets to any role — this plugin intentionally never reads Secret data.

## WebSocket Watch Budget

~13 simultaneous watches when all operators installed (one `useK8sWatchResource` per resource kind per table).

- `shouldShowComponent` in `SecretsManagement.tsx` prevents rendering filtered-out tables → zero watches for hidden tables
- Never hoist `useK8sWatchResource` calls up to `SecretsManagement.tsx`
- `ResourceInspect` opens up to 3 watches: main resource, pod statuses (SecretProviderClass only), events

## Error Cascade

ResourceTable tri-state rendering: Loading > Error > Empty > Data.

ResourceInspect error priority:
1. Invalid resource type (no matching model) — danger Alert, blocking
2. Loading — dot animation while `allLoaded` is false
3. Load error — danger Alert, blocking
4. Resource not found (loaded but null) — warning Alert, blocking
5. Events error — warning Alert, section-scoped (non-blocking)

## Operator Detection

`useOperatorDetection.ts` probes sentinel CRDs sequentially (not parallel, to avoid slamming API server):

| Operator | Detection CRDs |
|----------|---------------|
| cert-manager | `certificates.cert-manager.io`, `issuers.cert-manager.io` |
| trust-manager | `bundles.trust.cert-manager.io` |
| External Secrets | `externalsecrets.external-secrets.io`, `secretstores.external-secrets.io` |
| Secrets Store CSI | `secretproviderclasses.secrets-store.csi.x-k8s.io` |

Uses `some()` — any single CRD match marks the operator installed. HTTP 404 = not installed (not an error).

## SME Review Recommended

- Exact RBAC aggregation strategy (how ClusterRoles bind to Console users)
- Operator upgrade path and version compatibility matrix
- Cross-operator interaction edge cases (e.g., cert-manager + ESO referencing same Secret)
