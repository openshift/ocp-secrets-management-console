#!/usr/bin/env bash
#
# Build and deploy the Secrets Management plugin + operator via OLM BUNDLE to the current OCP cluster.
# This is the PRODUCTION deployment method using operator-sdk run bundle.
#
# Prerequisites:
#   - oc login (already authenticated to target cluster)
#   - podman login to quay.io
#   - operator-sdk installed (for bundle deployment)
#   - OLM installed on cluster (comes with OpenShift by default)
#
# Configuration (set in ~/.bashrc or export before running):
#   SM_QUAY_USER   - quay.io username             (default: sapurohi)
#   SM_QUAY_TOKEN  - quay.io password/token        (prompted if unset)
#   SM_IMAGE_TAG   - image tag                     (default: latest)
#
# Usage:
#   ./scripts/deploy-via-bundle.sh                # full build + bundle deploy
#   ./scripts/deploy-via-bundle.sh --deploy       # skip build, deploy existing bundle
#   ./scripts/deploy-via-bundle.sh --undeploy     # tear down bundle deployment
#
set -euo pipefail

# ─── Configuration from environment ──────────────────────────────────
QUAY_USER="${SM_QUAY_USER:-sapurohi}"
IMAGE_TAG="${SM_IMAGE_TAG:-latest}"
PLUGIN_IMG="quay.io/${QUAY_USER}/ocp-secrets-management:${IMAGE_TAG}"
OPERATOR_IMG="quay.io/${QUAY_USER}/ocp-secrets-management-operator:${IMAGE_TAG}"
BUNDLE_IMG="quay.io/${QUAY_USER}/ocp-secrets-management-operator-bundle:${IMAGE_TAG}"
NAMESPACE="openshift-secrets-management"
OPERATOR_NAME="ocp-secrets-management-operator"
# ─────────────────────────────────────────────────────────────────────

REPO_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
OPERATOR_DIR="${REPO_ROOT}/operator"

info()  { echo -e "\n\033[1;34m▶ $*\033[0m"; }
ok()    { echo -e "\033[1;32m✔ $*\033[0m"; }
warn()  { echo -e "\033[1;33m⚠ $*\033[0m"; }
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
  command -v operator-sdk >/dev/null 2>&1 || fail "operator-sdk not found. Required for bundle deployment. Install from: https://sdk.operatorframework.io/docs/installation/"
  oc whoami >/dev/null 2>&1         || fail "Not logged into an OCP cluster. Run 'oc login' first."
  ok "Logged in as $(oc whoami) on $(oc whoami --show-server)"

  # Check if OLM is installed
  info "Checking if OLM is installed on cluster..."
  if ! oc get crd subscriptions.operators.coreos.com >/dev/null 2>&1; then
    warn "OLM does not appear to be installed on this cluster!"
    echo "  Bundle deployment requires OLM (Operator Lifecycle Manager)."
    echo "  OpenShift clusters have OLM by default."
    echo "  For Kubernetes, install OLM with:"
    echo "    operator-sdk olm install"
    read -rp "  Continue anyway? [y/N] " continue
    if [[ ! "${continue}" =~ ^[Yy]$ ]]; then
      fail "Aborted. Please install OLM first."
    fi
  else
    ok "OLM is installed"
  fi
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
  info "Generating bundle manifests (with plugin image reference)..."

  # Check if required tools are available
  if ! command -v kustomize >/dev/null 2>&1 && ! [ -x "${OPERATOR_DIR}/../bin/kustomize" ]; then
    fail "kustomize not found. Install it or run: cd operator && make kustomize"
  fi

  if ! [ -x "${OPERATOR_DIR}/../bin/operator-sdk" ] && ! command -v operator-sdk >/dev/null 2>&1; then
    fail "operator-sdk not found. Install from: https://sdk.operatorframework.io/docs/installation/"
  fi

  make -C "${OPERATOR_DIR}" bundle IMG="${OPERATOR_IMG}" PLUGIN_IMG="${PLUGIN_IMG}"
  ok "Bundle manifests generated"

  # Verify bundle has plugin image reference
  info "Verifying bundle contains plugin image reference..."
  if grep -q "RELATED_IMAGE_PLUGIN" "${OPERATOR_DIR}/bundle/manifests/"*.clusterserviceversion.yaml; then
    ok "✓ Bundle includes RELATED_IMAGE_PLUGIN: ${PLUGIN_IMG}"
  else
    warn "Bundle may be missing plugin image reference!"
  fi

  info "Building bundle image: ${BUNDLE_IMG}"
  make -C "${OPERATOR_DIR}" bundle-build BUNDLE_IMG="${BUNDLE_IMG}"
  ok "Bundle image built"

  info "Pushing bundle image..."
  make -C "${OPERATOR_DIR}" bundle-push BUNDLE_IMG="${BUNDLE_IMG}"
  ok "Bundle image pushed"
}

# ─── Pull secret ─────────────────────────────────────────────────────

ensure_pull_secret() {
  info "Ensuring pull secret exists in global namespace..."

  # For OLM, the pull secret needs to be in openshift-marketplace or the operator's namespace
  # We'll create it in the operator namespace
  if ! oc get namespace "${NAMESPACE}" >/dev/null 2>&1; then
    info "Creating namespace ${NAMESPACE}..."
    oc create namespace "${NAMESPACE}"
  fi

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

# ─── Bundle Deploy ───────────────────────────────────────────────────

deploy_bundle() {
  info "Deploying operator via OLM bundle: ${BUNDLE_IMG}"

  ensure_pull_secret

  # Deploy using operator-sdk run bundle
  # This will:
  # 1. Create a CatalogSource with the bundle
  # 2. Create an OperatorGroup
  # 3. Create a Subscription
  # 4. OLM will install the operator
  info "Running operator-sdk run bundle (this may take 2-3 minutes)..."
  operator-sdk run bundle "${BUNDLE_IMG}" \
    --timeout 10m \
    --security-context-config restricted \
    --install-mode AllNamespaces \
    -n "${NAMESPACE}" \
    --verbose || fail "Bundle deployment failed. Check logs above."

  ok "Bundle deployed via OLM"

  # Wait for operator deployment to be created
  info "Waiting for operator deployment to be created..."
  local timeout=120
  local elapsed=0
  while ! oc get deployment secrets-management-operator -n "${NAMESPACE}" >/dev/null 2>&1; do
    if [ $elapsed -ge $timeout ]; then
      fail "Timeout waiting for operator deployment to be created"
    fi
    echo "  Waiting for deployment... (${elapsed}s/${timeout}s)"
    sleep 5
    elapsed=$((elapsed + 5))
  done

  info "Waiting for operator to be ready..."
  oc wait --for=condition=Available \
    deployment/secrets-management-operator \
    -n "${NAMESPACE}" \
    --timeout=180s || fail "Operator did not become ready"

  ok "Operator is running"

  # Show operator pod details
  info "Operator pod details:"
  oc get pods -n "${NAMESPACE}" -l control-plane=controller-manager

  # Check if operator has RELATED_IMAGE_PLUGIN env var
  info "Verifying operator has RELATED_IMAGE_PLUGIN environment variable..."
  local plugin_img_from_env
  plugin_img_from_env=$(oc get deployment secrets-management-operator \
    -n "${NAMESPACE}" \
    -o jsonpath='{.spec.template.spec.containers[0].env[?(@.name=="RELATED_IMAGE_PLUGIN")].value}' 2>/dev/null || echo "")

  if [[ -n "${plugin_img_from_env}" ]]; then
    ok "✓ Operator has RELATED_IMAGE_PLUGIN: ${plugin_img_from_env}"
  else
    warn "Operator deployment does not have RELATED_IMAGE_PLUGIN env var!"
    warn "This means the bundle may not have been generated correctly."
  fi
}

deploy_sample() {
  info "Creating SecretsManagementConfig CR to deploy the plugin..."

  # Create the CR
  cat <<EOF | oc apply -f -
apiVersion: secrets-management.openshift.io/v1alpha1
kind: SecretsManagementConfig
metadata:
  name: cluster
spec:
  rbac:
    createDefaultRoles: true
  plugin:
    replicas: 1
EOF

  ok "SecretsManagementConfig created"

  info "Waiting for plugin deployment to be created..."
  local timeout=120
  local elapsed=0
  while ! oc get deployment ocp-secrets-management-plugin -n "${NAMESPACE}" >/dev/null 2>&1; do
    if [ $elapsed -ge $timeout ]; then
      fail "Timeout waiting for plugin deployment to be created"
    fi
    echo "  Waiting for plugin deployment... (${elapsed}s/${timeout}s)"
    sleep 5
    elapsed=$((elapsed + 5))
  done

  info "Waiting for plugin pods to be ready..."
  oc wait --for=condition=Available \
    deployment/ocp-secrets-management-plugin \
    -n "${NAMESPACE}" \
    --timeout=180s || warn "Plugin deployment may not be ready yet"

  ok "Plugin pods are running"

  # Show plugin pod details
  info "Plugin pod details:"
  oc get pods -n "${NAMESPACE}" -l app.kubernetes.io/name=ocp-secrets-management

  # Check what image the plugin is using
  info "Verifying plugin is using correct image..."
  local plugin_img_actual
  plugin_img_actual=$(oc get deployment ocp-secrets-management-plugin \
    -n "${NAMESPACE}" \
    -o jsonpath='{.spec.template.spec.containers[0].image}' 2>/dev/null || echo "")

  if [[ -n "${plugin_img_actual}" ]]; then
    ok "✓ Plugin image: ${plugin_img_actual}"
    if [[ "${plugin_img_actual}" == "${PLUGIN_IMG}" ]]; then
      ok "✓ Plugin is using the correct image from bundle!"
    else
      warn "Plugin image differs from expected:"
      warn "  Expected: ${PLUGIN_IMG}"
      warn "  Actual:   ${plugin_img_actual}"
    fi
  fi

  # Check ConsolePlugin
  info "Checking if ConsolePlugin was created..."
  if oc get consoleplugin ocp-secrets-management >/dev/null 2>&1; then
    ok "✓ ConsolePlugin resource exists"

    # Check if it's enabled in the console
    local console_plugins
    console_plugins=$(oc get console.operator.openshift.io cluster -o jsonpath='{.spec.plugins}' 2>/dev/null || echo "")
    if echo "${console_plugins}" | grep -q "ocp-secrets-management"; then
      ok "✓ Plugin is enabled in OpenShift Console"
    else
      warn "Plugin is not yet enabled in Console. Enabling now..."
      oc patch console.operator.openshift.io cluster \
        --type=json \
        -p '[{"op": "add", "path": "/spec/plugins/-", "value": "ocp-secrets-management"}]' \
        2>/dev/null || warn "Failed to enable plugin automatically. Enable it manually in Console settings."
    fi
  else
    warn "ConsolePlugin resource was not created. Check operator logs."
  fi
}

# ─── Undeploy ────────────────────────────────────────────────────────

undeploy() {
  info "Removing SecretsManagementConfig..."
  oc delete secretsmanagementconfig cluster -n "${NAMESPACE}" --ignore-not-found 2>/dev/null || true
  ok "SecretsManagementConfig removed"

  info "Uninstalling operator via operator-sdk..."
  operator-sdk cleanup "${OPERATOR_NAME}" -n "${NAMESPACE}" --timeout 5m 2>/dev/null || true

  # Clean up any remaining resources
  info "Cleaning up remaining resources..."
  oc delete namespace "${NAMESPACE}" --ignore-not-found 2>/dev/null || true
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
      # Deploy only, skip building
      deploy_bundle
      deploy_sample
      show_summary
      ;;
    *)
      # Full workflow: build + deploy
      build_images
      build_bundle
      deploy_bundle
      deploy_sample
      show_summary
      ;;
  esac
}

show_summary() {
  echo ""
  echo "═══════════════════════════════════════════════════════════════"
  ok "Bundle deployment complete!"
  echo ""
  echo "  Deployment Method:  OLM Bundle (operator-sdk run bundle)"
  echo ""
  echo "  Plugin image:       ${PLUGIN_IMG}"
  echo "  Operator image:     ${OPERATOR_IMG}"
  echo "  Bundle image:       ${BUNDLE_IMG}"
  echo "  Namespace:          ${NAMESPACE}"
  echo ""
  echo "  Verify deployment:"
  echo "    oc get pods -n ${NAMESPACE}"
  echo "    oc get csv -n ${NAMESPACE}"
  echo "    oc get subscription -n ${NAMESPACE}"
  echo ""
  echo "  Check operator logs:"
  echo "    oc logs -n ${NAMESPACE} -l control-plane=controller-manager -f"
  echo ""
  echo "  Check plugin logs:"
  echo "    oc logs -n ${NAMESPACE} -l app.kubernetes.io/name=ocp-secrets-management -f"
  echo ""
  echo "  Refresh the OpenShift Console to see the Secrets Management page."
  echo ""
  echo "  To undeploy:"
  echo "    ./scripts/deploy-via-bundle.sh --undeploy"
  echo "═══════════════════════════════════════════════════════════════"
}

main "$@"
