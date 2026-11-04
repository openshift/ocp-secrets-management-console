# Review instructions

## Must fix before merge

- XSS via unsanitized user input rendered in React (dangerouslySetInnerHTML, innerHTML)
- Breaking changes to console-extensions.json route paths or exposed module names
- RBAC escalation: adding write/create permissions beyond view+delete in ClusterRoles
- Adding `core/v1` Secrets to any RBAC role — this plugin intentionally never reads Secret data
- Broken CRD model definitions (wrong group/version/kind) — causes silent data fetch failures
- Missing i18n: user-facing strings not wrapped in `t()` from `useTranslation`
- Security: secrets or tokens logged, exposed in URL params, or stored in localStorage
- Direct K8s API calls bypassing `consoleFetch` — the console proxy handles auth and CSRF
- Delete actions without `DeleteConfirmationModal` name-confirmation step
- Container images running as root or missing `seccompProfile: RuntimeDefault`

## Minor issue volume

Report at most five minor issues. Overflow: "plus N similar items" in the summary. If all minor, lead with "No blocking issues."

## Do not report

- CI-enforced: ESLint, Stylelint, TypeScript type-check, Prettier formatting
- Generated files: `**/zz_generated*`
- Lockfiles: `yarn.lock` (review dependency bumps separately)
- Vendored: `vendor/**`
- Auto-generated CRD types with "Auto-generated from CRD" header
- Legacy files: `integration-tests/cypress.config.js`, `.eslintrc.yml`
- Tekton pipeline configs: `.tekton/**`
- Helm chart boilerplate: `charts/**/templates/_helpers.tpl`

## Always check

- `data-test` attributes on interactive elements (required for test selectors, with `-loading`/`-error`/`-empty` suffixes)
- URL construction for inspect links uses correct path segments (`/secrets-management/inspect/{type}/{ns}/{name}`)
- New CRD kinds have matching entries in all four sync files (see AGENTS.md critical patterns)
- PatternFly imports use correct package paths (Modal from `@patternfly/react-core/deprecated`)
- Cluster-scoped resources skip namespace in API paths and URL construction
- i18n keys added to `locales/en/plugin__ocp-secrets-management.json`
- Console extension format in `console-extensions.json` uses `%plugin__ocp-secrets-management~Key%`
- New RBAC rules follow three-tier pattern: view (get/list/watch), delete (delete), admin (all)
- New `useK8sWatchResource` calls are in separate table components gated by `shouldShowComponent`
- `containsSensitiveData()` updated when adding resource types to ResourceInspect
- New resource types have `data-test` selectors and a pre-merge E2E test with mock-api helpers

## Verification bar

Every comment must cite file:line evidence from the diff or linked source. If you cannot point to a specific line, do not post the comment. Read surrounding context (at minimum the enclosing function) before flagging.

## Re-review

On re-review of an updated PR, only comment on lines that changed since the last review. Do not re-raise resolved issues or introduce new nits on unchanged code. Converge toward approval.

## Path-specific rules

### `src/components/crds/**`
Never hand-edit files with "Auto-generated" headers. Verify model objects have correct `group`, `version`, `kind` matching the CRD definition. Union types and type guards must cover all variants.

### `src/components/*Table.tsx`
Follow existing table pattern: `useK8sWatchResource` → row mapping → `ResourceTable` + `DeleteConfirmationModal`. Use `consoleFetch` for delete, not `k8sDelete`.

### `src/hooks/**`
Operator detection must use CRD existence check via `consoleFetch` to apiextensions API. Return shape must include `{installed, loading, error}`.

### `integration-tests/**`
New pre-merge tests must use mock-api helpers from `support/mock-api.ts`. Post-merge tests require `BRIDGE_BASE_ADDRESS` and auth setup. Do not add Cypress tests — use Playwright.

### `charts/**`
RBAC changes in `rbac-clusterroles.yaml` are security-sensitive — verify least-privilege principle.
