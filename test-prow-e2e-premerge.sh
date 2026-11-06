#!/usr/bin/env bash

# Runs the mock-based, pre-merge Playwright suite (integration-tests/tests/*.premerge.spec.ts)
# against the OpenShift Console of a real (cluster_claim) test cluster.
#
# Unlike test-prow-e2e.sh (post-merge, which exercises the plugin against real cluster
# resources), the pre-merge suite intercepts K8s API responses via Playwright route
# mocking (see integration-tests/support/mock-api.ts) and does not require any
# secrets-management CRs/operators to actually be installed. It still needs a real,
# reachable console to serve the plugin UI, which the operator registers automatically
# on install (see console-plugin-operator CSV: "Register the plugin with OpenShift
# Console"). We therefore point Playwright's BRIDGE_BASE_ADDRESS at the claimed
# cluster's own console route, the same way test-prow-e2e.sh does for post-merge.

set -exuo pipefail

ARTIFACT_DIR=${ARTIFACT_DIR:=/tmp/artifacts}
RESULTS_DIR=integration-tests/results

function copyArtifacts {
  if [ -d "$ARTIFACT_DIR" ] && [ -d "$RESULTS_DIR" ]; then
    if [[ -z "$(ls -A -- "$RESULTS_DIR")" ]]; then
      echo "No artifacts were copied."
    else
      echo "Copying artifacts from $(pwd)..."
      cp -r "$RESULTS_DIR" "${ARTIFACT_DIR}/results"
    fi
  fi
}

trap copyArtifacts EXIT

# The operator bootstraps a default SecretsManagementConfig named "cluster" on install,
# which deploys the plugin and registers it with the console. Wait for that to settle
# before pointing a browser at the console, to avoid racing the plugin rollout.
echo "Waiting for the default SecretsManagementConfig plugin to report ready..."
oc wait --for=jsonpath='{.status.plugin.ready}'=true \
  secretsmanagementconfigs.secrets-management.openshift.io/cluster --timeout=5m

echo "Waiting for the console cluster operator to stabilize..."
oc wait --for=condition=Available --timeout=5m clusteroperator/console
oc wait --for=condition=Progressing=false --timeout=5m clusteroperator/console

# don't log kubeadmin-password
set +x
BRIDGE_KUBEADMIN_PASSWORD="$(cat "${KUBEADMIN_PASSWORD_FILE}")"
export BRIDGE_KUBEADMIN_PASSWORD
set -x
BRIDGE_BASE_ADDRESS="$(oc get consoles.config.openshift.io cluster -o jsonpath='{.status.consoleURL}')"
export BRIDGE_BASE_ADDRESS

echo "Install dependencies"
if [ ! -d node_modules ]; then
  yarn install
fi

echo "Running Playwright pre-merge (mock-based) E2E tests against ${BRIDGE_BASE_ADDRESS}"
yarn run test-e2e-premerge
