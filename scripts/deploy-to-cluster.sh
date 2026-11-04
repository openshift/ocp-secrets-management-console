#!/usr/bin/env bash
#
# Build and deploy the Secrets Management plugin + operator to the current OCP cluster.
#
# Prerequisites:
#   - oc login (already authenticated to target cluster)
#   - podman login to quay.io
#
# Configuration (set in ~/.bashrc or export before running):
#   SM_QUAY_USER   - quay.io username             (default: sapurohi)
#   SM_QUAY_TOKEN  - quay.io password/token        (prompted if unset)
#   SM_IMAGE_TAG   - image tag                     (default: latest)
#
# Usage:
#   ./scripts/deploy-to-cluster.sh              # full build + deploy
#   ./scripts/deploy-to-cluster.sh --deploy     # skip build, deploy only (images must exist)
#   ./scripts/deploy-to-cluster.sh --undeploy   # tear down everything
#
set -euo pipefail

# ─── Configuration from environment ──────────────────────────────────
QUAY_USER="${SM_QUAY_USER:-anankuma}"
IMAGE_TAG="${SM_IMAGE_TAG:-latest}"
PLUGIN_IMG="quay.io/${QUAY_USER}/ocp-secrets-management:${IMAGE_TAG}"
OPERATOR_IMG="quay.io/${QUAY_USER}/ocp-secrets-management-operator:${IMAGE_TAG}"
BUNDLE_IMG="quay.io/${QUAY_USER}/ocp-secrets-management-operator-bundle:${IMAGE_TAG}"
NAMESPACE="openshift-secrets-management"
# ─────────────────────────────────────────────────────────────────────

REPO_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
OPERATOR_DIR="${REPO_ROOT}/operator"

info()  { echo -e "\n\033[1;34m▶ $*\033[0m"; }
ok()    { echo -e "\033[1;32m✔ $*\033[0m"; }
fail()  { echo -e "\033[1;31m✖ $*\033[0m" >&2; exit 1; }

# The operator Makefile uses kubectl; alias it to oc if kubectl is absent
if ! command -v kubectl >/dev/null 2>&1 && command -v oc >/dev/null 2>&1; then
  kubectl() { oc "$@"; }
  export -f kubectl
fi

# ─── Preflight ───────────────────────────────────────────────────────

preflight() {
  info "Running preflight checks..."
  command -v oc     >/dev/null 2>&1 || fail "oc CLI not found. Install it and run 'oc login' first."
  command -v podman >/dev/null 2>&1 || fail "podman not found."
  command -v make   >/dev/null 2>&1 || fail "make not found."
  oc whoami >/dev/null 2>&1         || fail "Not logged into an OCP cluster. Run 'oc login' first."
  ok "Logged in as $(oc whoami) on $(oc whoami --show-server)"
}

# ─── Build ───────────────────────────────────────────────────────────

build_images() {
  info "Building plugin image: ${PLUGIN_IMG}"
  make -C "${REPO_ROOT}" plugin-image PLUGIN_IMG="${PLUGIN_IMG}"
  ok "Plugin image built"

  info "Pushing plugin image..."
  make -C "${REPO_ROOT}" plugin-push PLUGIN_IMG="${PLUGIN_IMG}"
  ok "Plugin image pushed"

  info "Building operator image: ${OPERATOR_IMG}"
  make -C "${OPERATOR_DIR}" podman-build IMG="${OPERATOR_IMG}"
  ok "Operator image built"

  info "Pushing operator image..."
  make -C "${OPERATOR_DIR}" podman-push IMG="${OPERATOR_IMG}"
  ok "Operator image pushed"
}

build_bundle() {
  info "Generating bundle manifests..."
  # Note: This requires kustomize and operator-sdk to be installed
  # If not available, bundle generation will be skipped
  if ! command -v kustomize >/dev/null 2>&1 || ! [ -x "${OPERATOR_DIR}/../bin/operator-sdk" ]; then
    echo "  ⚠️  Skipping bundle generation (kustomize or operator-sdk not found)"
    echo "  ⚠️  For production, run: cd operator && make bundle bundle-build bundle-push"
    return 0
  fi

  make -C "${OPERATOR_DIR}" bundle IMG="${OPERATOR_IMG}" PLUGIN_IMG="${PLUGIN_IMG}"
  ok "Bundle manifests generated"

  info "Building bundle image: ${BUNDLE_IMG}"
  make -C "${OPERATOR_DIR}" bundle-build BUNDLE_IMG="${BUNDLE_IMG}"
  ok "Bundle image built"

  info "Pushing bundle image..."
  make -C "${OPERATOR_DIR}" bundle-push BUNDLE_IMG="${BUNDLE_IMG}"
  ok "Bundle image pushed"
}

# ─── Pull secret ─────────────────────────────────────────────────────

ensure_pull_secret() {
  info "Ensuring pull secret exists..."
  if oc get secret quay-pull-secret -n "${NAMESPACE}" >/dev/null 2>&1; then
    ok "Pull secret already exists"
    return
  fi

  local token="${SM_QUAY_TOKEN:-}"
  if [[ -z "${token}" ]]; then
    echo "  Quay.io password/token is needed so the cluster can pull images."
    read -rsp "  Enter quay.io password or token for ${QUAY_USER}: " token
    echo
  fi

  oc create secret docker-registry quay-pull-secret \
    --docker-server=quay.io \
    --docker-username="${QUAY_USER}" \
    --docker-password="${token}" \
    -n "${NAMESPACE}"
  ok "Pull secret created"
}

link_pull_secrets() {
  oc secrets link secrets-management-operator quay-pull-secret --for=pull -n "${NAMESPACE}" 2>/dev/null || true

  local plugin_sa="ocp-secrets-management-plugin"
  if oc get sa "${plugin_sa}" -n "${NAMESPACE}" >/dev/null 2>&1; then
    oc secrets link "${plugin_sa}" quay-pull-secret --for=pull -n "${NAMESPACE}" 2>/dev/null || true
  fi
}

# ─── Deploy ──────────────────────────────────────────────────────────

deploy() {
  info "Deploying operator (CRD, namespace, RBAC, controller)..."
  make -C "${OPERATOR_DIR}" deploy IMG="${OPERATOR_IMG}"
  ok "Operator deployed"

  ensure_pull_secret

  info "Waiting for operator pod..."
  oc rollout status deployment/secrets-management-operator -n "${NAMESPACE}" --timeout=120s
  link_pull_secrets
  ok "Operator is running"

  info "Deploying SecretsManagementConfig (plugin deployment)..."
  make -C "${OPERATOR_DIR}" deploy-sample IMG="${OPERATOR_IMG}" PLUGIN_IMG="${PLUGIN_IMG}"
  ok "SecretsManagementConfig applied"

  info "Waiting for plugin pods..."
  sleep 5
  link_pull_secrets

  # Restart pods stuck in ImagePullBackOff so they pick up the pull secret
  local failing
  failing=$(oc get pods -n "${NAMESPACE}" -l app.kubernetes.io/name=ocp-secrets-management \
    --no-headers -o custom-columns=NAME:.metadata.name,STATUS:.status.phase \
    2>/dev/null | grep -v Running | awk '{print $1}' || true)
  if [[ -n "${failing}" ]]; then
    info "Restarting plugin pods to pick up pull secret..."
    echo "${failing}" | xargs oc delete pod -n "${NAMESPACE}" 2>/dev/null || true
    sleep 5
  fi

  oc rollout status deployment/ocp-secrets-management-plugin -n "${NAMESPACE}" --timeout=120s
  ok "Plugin pods are running"

  info "Enabling plugin in OpenShift Console..."
  local current
  current=$(oc get console.operator.openshift.io cluster -o jsonpath='{.spec.plugins}' 2>/dev/null || echo "")
  if echo "${current}" | grep -q "ocp-secrets-management"; then
    ok "Plugin already enabled in Console"
  else
    oc patch console.operator.openshift.io cluster --type=json \
      -p '[{"op": "add", "path": "/spec/plugins/-", "value": "ocp-secrets-management"}]'
    ok "Plugin enabled in Console"
  fi

  echo ""
  echo "═══════════════════════════════════════════════════════════════"
  ok "Deployment complete!"
  echo ""
  echo "  Plugin image:   ${PLUGIN_IMG}"
  echo "  Operator image: ${OPERATOR_IMG}"
  echo "  Namespace:      ${NAMESPACE}"
  echo ""
  echo "  Refresh the OpenShift Console to see the Secrets Management page."
  echo "═══════════════════════════════════════════════════════════════"
}

# ─── Undeploy ────────────────────────────────────────────────────────

undeploy() {
  info "Removing SecretsManagementConfig..."
  make -C "${OPERATOR_DIR}" undeploy-sample 2>/dev/null || true
  ok "SecretsManagementConfig removed"

  info "Removing operator, RBAC, namespace, CRD..."
  make -C "${OPERATOR_DIR}" undeploy 2>/dev/null || true

  # Clean up cluster-scoped resources the operator may have created
  oc delete clusterrole secrets-management-view secrets-management-delete secrets-management-admin --ignore-not-found 2>/dev/null || true
  oc delete clusterrolebinding secrets-management-view secrets-management-delete secrets-management-admin --ignore-not-found 2>/dev/null || true
  oc delete consoleplugin ocp-secrets-management --ignore-not-found 2>/dev/null || true
  ok "Undeploy complete"
}

# ─── Main ────────────────────────────────────────────────────────────

main() {
  preflight

  case "${1:-}" in
    --undeploy)
      undeploy
      ;;
    --deploy)
      deploy
      ;;
    --bundle)
      build_images
      build_bundle
      echo ""
      echo "═══════════════════════════════════════════════════════════════"
      ok "Bundle build complete!"
      echo ""
      echo "  Plugin image:   ${PLUGIN_IMG}"
      echo "  Operator image: ${OPERATOR_IMG}"
      echo "  Bundle image:   ${BUNDLE_IMG}"
      echo ""
      echo "  To test the bundle:"
      echo "    operator-sdk run bundle ${BUNDLE_IMG}"
      echo "═══════════════════════════════════════════════════════════════"
      ;;
    *)
      build_images
      deploy
      ;;
  esac
}

main "$@"
