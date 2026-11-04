#!/usr/bin/env bash
#
# render_templates.sh - Inject production image digests into the OLM bundle CSV.
#
# Usage:
#   render_templates.sh <manifests_dir> <metadata_dir> <images_digest_conf>
#
# Arguments:
#   manifests_dir      - Directory containing bundle manifests (e.g. /manifests)
#   metadata_dir       - Directory containing bundle metadata  (e.g. /metadata)
#   images_digest_conf - Path to images_digest.conf file with KEY=digest lines
#
# Expected keys in images_digest.conf:
#   RELATED_IMAGE_OPERATOR  - Full pullspec (registry/repo@sha256:...) for the operator
#   RELATED_IMAGE_PLUGIN    - Full pullspec (registry/repo@sha256:...) for the console plugin
#
# The script updates the ClusterServiceVersion YAML in manifests_dir:
#   - metadata.annotations.containerImage           → RELATED_IMAGE_OPERATOR
#   - spec.install deployment container image       → RELATED_IMAGE_OPERATOR
#   - spec.install env RELATED_IMAGE_PLUGIN value   → RELATED_IMAGE_PLUGIN
#   - spec.relatedImages (operator + plugin entries)
#
set -euo pipefail

MANIFESTS_DIR="${1:?Usage: $0 <manifests_dir> <metadata_dir> <images_digest_conf>}"
METADATA_DIR="${2:?Usage: $0 <manifests_dir> <metadata_dir> <images_digest_conf>}"
IMAGES_DIGEST_CONF="${3:?Usage: $0 <manifests_dir> <metadata_dir> <images_digest_conf>}"

log()  { echo "[render_templates] $*"; }
die()  { echo "[render_templates] ERROR: $*" >&2; exit 1; }

# ── Validate inputs ────────────────────────────────────────────────────────────

[[ -d "${MANIFESTS_DIR}" ]] || die "manifests dir not found: ${MANIFESTS_DIR}"
[[ -d "${METADATA_DIR}" ]]  || die "metadata dir not found: ${METADATA_DIR}"
[[ -f "${IMAGES_DIGEST_CONF}" ]] || die "images_digest.conf not found: ${IMAGES_DIGEST_CONF}"

command -v yq >/dev/null 2>&1 || die "'yq' not found in PATH"

# ── Load image digests ─────────────────────────────────────────────────────────

log "Loading image digests from ${IMAGES_DIGEST_CONF}"

# Source only KEY=value lines; ignore comments and blank lines
while IFS='=' read -r key value; do
    [[ -z "${key}" || "${key}" == \#* ]] && continue
    key="${key//[[:space:]]/}"
    value="${value//[[:space:]]/}"
    [[ -z "${value}" ]] && continue
    declare "${key}=${value}"
done < "${IMAGES_DIGEST_CONF}"

RELATED_IMAGE_OPERATOR="${RELATED_IMAGE_OPERATOR:-}"
RELATED_IMAGE_PLUGIN="${RELATED_IMAGE_PLUGIN:-}"

[[ -n "${RELATED_IMAGE_OPERATOR}" ]] || die "RELATED_IMAGE_OPERATOR not set in ${IMAGES_DIGEST_CONF}"
[[ -n "${RELATED_IMAGE_PLUGIN}" ]]   || die "RELATED_IMAGE_PLUGIN not set in ${IMAGES_DIGEST_CONF}"

log "  RELATED_IMAGE_OPERATOR = ${RELATED_IMAGE_OPERATOR}"
log "  RELATED_IMAGE_PLUGIN   = ${RELATED_IMAGE_PLUGIN}"

# ── Locate the CSV file ────────────────────────────────────────────────────────

CSV_FILE=$(find "${MANIFESTS_DIR}" -maxdepth 1 -name "*.clusterserviceversion.yaml" | head -n1)
[[ -n "${CSV_FILE}" ]] || die "No *.clusterserviceversion.yaml found in ${MANIFESTS_DIR}"
log "Patching CSV: ${CSV_FILE}"

# ── Update containerImage annotation ──────────────────────────────────────────

log "  → metadata.annotations.containerImage"
yq -i ".metadata.annotations.containerImage = \"${RELATED_IMAGE_OPERATOR}\"" "${CSV_FILE}"

# ── Update operator deployment container image ─────────────────────────────────

log "  → spec.install deployment container image"
yq -i "
  (.spec.install.spec.deployments[].spec.template.spec.containers[] |
    select(.name == \"manager\") | .image) = \"${RELATED_IMAGE_OPERATOR}\"
" "${CSV_FILE}"

# ── Update RELATED_IMAGE_PLUGIN env var ────────────────────────────────────────

log "  → spec.install deployment env RELATED_IMAGE_PLUGIN"
yq -i "
  (.spec.install.spec.deployments[].spec.template.spec.containers[].env[] |
    select(.name == \"RELATED_IMAGE_PLUGIN\") | .value) = \"${RELATED_IMAGE_PLUGIN}\"
" "${CSV_FILE}"

# ── Update spec.relatedImages ──────────────────────────────────────────────────
#
# Rebuild relatedImages so it always contains exactly the operator and plugin
# entries with the correct digested pullspecs.  Any existing entries with these
# names are updated in-place; entries with other names are preserved.

log "  → spec.relatedImages"

# Update or append the operator entry
OPERATOR_NAME="external-secrets-management-operator"
if yq -e ".spec.relatedImages[] | select(.name == \"${OPERATOR_NAME}\")" "${CSV_FILE}" >/dev/null 2>&1; then
    yq -i "
      (.spec.relatedImages[] | select(.name == \"${OPERATOR_NAME}\") | .image) =
        \"${RELATED_IMAGE_OPERATOR}\"
    " "${CSV_FILE}"
else
    yq -i "
      .spec.relatedImages += [{\"name\": \"${OPERATOR_NAME}\", \"image\": \"${RELATED_IMAGE_OPERATOR}\"}]
    " "${CSV_FILE}"
fi

# Update or append the plugin entry
PLUGIN_NAME="ocp-secrets-management-plugin"
if yq -e ".spec.relatedImages[] | select(.name == \"${PLUGIN_NAME}\")" "${CSV_FILE}" >/dev/null 2>&1; then
    yq -i "
      (.spec.relatedImages[] | select(.name == \"${PLUGIN_NAME}\") | .image) =
        \"${RELATED_IMAGE_PLUGIN}\"
    " "${CSV_FILE}"
else
    yq -i "
      .spec.relatedImages += [{\"name\": \"${PLUGIN_NAME}\", \"image\": \"${RELATED_IMAGE_PLUGIN}\"}]
    " "${CSV_FILE}"
fi

log "Done. CSV patched successfully."
