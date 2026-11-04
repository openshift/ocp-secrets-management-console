# Integration Guidelines

Rules for maintaining this OpenShift Console dynamic plugin and its integrations with the Console SDK and the four upstream operators.

## 1. Console Plugin Registration

Three coordinated files:

| File | Purpose |
|---|---|
| `console-extensions.json` | Console extension points (routes, nav items) |
| `package.json` `consolePlugin` section | Plugin name, exposed modules, Console API dependency (`>=4.22.0-0`) |
| `webpack.config.ts` | `ConsoleRemotePlugin` -- no manual entry points |

Rules:
- Every new page needs a `console.page/route` in `console-extensions.json` AND its component in `consolePlugin.exposedModules`.
- `$codeRef` values must match keys in `exposedModules`.
- Navigation items use `%plugin__ocp-secrets-management~<key>%` i18n format.

## 2. Console SDK Usage

All K8s API access goes through the Console SDK:

| SDK API | Usage |
|---|---|
| `useK8sWatchResource` | Resource list/table components, namespace listing |
| `consoleFetch` | Operator detection (CRD existence checks) |
| `DocumentTitle` | Page title management |

Rules:
- Use `consoleFetch` only for discovery/detection calls.
- Console proxies the K8s API under `/api/kubernetes` -- all `consoleFetch` URLs use this prefix.

## 3. Operator Detection

`useOperatorDetection.ts` detects operators by probing sentinel CRDs:

| Operator | Detection CRDs |
|---|---|
| cert-manager | `certificates.cert-manager.io`, `issuers.cert-manager.io` |
| trust-manager | `bundles.trust.cert-manager.io` |
| External Secrets | `externalsecrets.external-secrets.io`, `secretstores.external-secrets.io` |
| Secrets Store CSI | `secretproviderclasses.secrets-store.csi.x-k8s.io` |

Rules:
- Detection uses `some()` -- any single CRD match marks the operator installed.
- 404 or "not found" body = not installed (not an error).
- True API errors stored in `OperatorStatus.error` with retry button.
- When adding a new operator: update CRD sentinel list, `OPERATOR_INFO` metadata, `OperatorDetectionResult` interface, and filter/render logic.

## 4. Handling Missing Operators

The plugin must work when zero, some, or all operators are installed:
- `NoOperatorsInstalled` renders when no operator is detected.
- Operator dropdown shows only installed operators.
- `shouldShowComponent(operator, resourceKind)` gates every table section.
- Never block the entire UI for a single operator failure.

## 5. CRD Version Pinning (`crd-sources.json`)

| Operator | Repo | Pinned Ref |
|---|---|---|
| cert-manager | `cert-manager/cert-manager` | `v1.19.2` |
| trust-manager | `cert-manager/trust-manager` | `v0.20.3` |
| external-secrets | `external-secrets/external-secrets` | `v0.20.4` |
| secrets-store-csi | `kubernetes-sigs/secrets-store-csi-driver` | `v1.4.0` |

Rules:
- Always pin to a release tag, never a branch or commit SHA.
- When bumping: update `ref`, run `make update-types`, verify types compile, run `make verify`.

## 6. CRD Type Generation Pipeline

Flow: `crd-sources.json` -> `scripts/fetch-crds.ts` -> `crds/` (YAML) -> `scripts/generate-types.ts` -> `src/generated/crds/` (TypeScript).

Rules:
- Never hand-edit files under `src/generated/crds/`.
- Run `make update-types` after any `crd-sources.json` change.
- The generator runs in a container -- no local Node.js required for CI.

## 7. The CRD Shim Layer (`src/components/crds/`)

| File | Contents |
|---|---|
| `index.ts` | Re-exports, union types, type guards |
| `Events.ts` | EventModel, K8sEvent, getInvolvedObjectKind() |
| `<Kind>.ts` | Model constants and interfaces per CRD kind |

Rules:
- Every CRD kind must be exported from `index.ts`.
- Union types for namespaced+cluster variants must have matching type guard functions.
- `Events.ts` must map every resource's plural name to its Kind.
- After changing CRD imports, run `make sync-crd-types`.

## 8. Adding a New Operator Integration

1. Add entries to `crd-sources.json`.
2. Run `make update-types`.
3. Create shim files in `src/components/crds/`.
4. Add detection CRDs to `useOperatorDetection.ts`.
5. Add `OPERATOR_INFO` entry.
6. Create table component(s).
7. Wire into `SecretsManagement.tsx` (filters, render sections).
8. Update `OperatorNotInstalled.tsx` if needed.
9. Run `make verify`.

## 9. Adding a New CRD Kind to an Existing Operator

1. Add CRD entry to `crd-sources.json`.
2. Run `make update-types`.
3. Export from `src/components/crds/index.ts`.
4. Create union type and type guard if cluster-scoped variant exists.
5. Add plural -> Kind mapping to `Events.ts`.
6. Create or update table component.
7. Run `make sync-crd-types` then `make verify`.

## 10. Pre-PR Checklist

- [ ] `crd-sources.json` has entries for all CRD kinds used in code
- [ ] `make update-types` succeeds
- [ ] `src/components/crds/index.ts` exports all models, interfaces, unions, type guards
- [ ] `Events.ts` `getInvolvedObjectKind` covers all resource plural names
- [ ] `useOperatorDetection.ts` detects all integrated operators
- [ ] Missing operators degrade gracefully
- [ ] `make verify` passes
