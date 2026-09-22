# Makefile for OCP Secrets Management Plugin
# All CRD-related operations run in containers - no local Node.js required

.PHONY: all
all: plugin-build ## Build plugin (default target)

.PHONY: plugin-test
plugin-test: require-container-runtime ## Run frontend unit tests (Jest)
	$(CONTAINER_RUNTIME) run --rm \
		-v "$(CURDIR):/app:z" \
		-w /app \
		node:20-alpine \
		sh -c "yarn install && yarn test"

.PHONY: test
test: plugin-test ## Run all unit tests (frontend Jest + operator Go tests)
	$(MAKE) -C operator test

.PHONY: help
help: ## Show this help
	@grep -E '^[a-zA-Z0-9_-]+:.*?## .*$$' $(MAKEFILE_LIST) | sort | awk 'BEGIN {FS = ":.*?## "}; {printf "\033[36m%-30s\033[0m %s\n", $$1, $$2}'

# Container engine: podman by default (override with CONTAINER_RUNTIME=docker if needed)
CONTAINER_RUNTIME ?= podman

.PHONY: require-container-runtime
require-container-runtime: ## (Prerequisite) Ensure CONTAINER_RUNTIME is available; used by containerized targets only
	@command -v $(CONTAINER_RUNTIME) >/dev/null 2>&1 || (echo "Container runtime '$(CONTAINER_RUNTIME)' not found. Please install podman or set CONTAINER_RUNTIME=docker" && exit 1)

# Image name for scripts
SCRIPTS_IMAGE := ocp-secrets-management-scripts

# Plugin image (override when building for your registry, e.g. make plugin-image PLUGIN_IMG=quay.io/<my-org>/ocp-secrets-management:v1.0)
PLUGIN_IMG ?= openshift.io/ocp-secrets-management:latest

##@ CRD Management (Containerized)

.PHONY: scripts-image
scripts-image: require-container-runtime ## Build the container image for running scripts
	$(CONTAINER_RUNTIME) build -t $(SCRIPTS_IMAGE) -f scripts/Dockerfile .

# Run fetch/generate as root so writes succeed on the mount, then chown to host user (single run per target).
.PHONY: fetch-crds
fetch-crds: scripts-image ## Fetch CRDs from upstream repositories (containerized)
	@mkdir -p "$(CURDIR)/crds"
	$(CONTAINER_RUNTIME) run --rm --user 0:0 \
		-v "$(CURDIR)/crds:/app/crds:z" \
		-v "$(CURDIR)/crd-sources.json:/app/crd-sources.json:ro,z" \
		$(SCRIPTS_IMAGE) \
		sh -c "ts-node scripts/fetch-crds.ts && chown -R $(shell id -u):$(shell id -g) /app/crds || true"

.PHONY: generate-types
generate-types: scripts-image ## Generate TypeScript interfaces from CRDs (containerized)
	@mkdir -p "$(CURDIR)/src/generated/crds"
	$(CONTAINER_RUNTIME) run --rm --user 0:0 \
		-v "$(CURDIR)/crds:/app/crds:ro,z" \
		-v "$(CURDIR)/src/generated/crds:/app/src/generated/crds:z" \
		$(SCRIPTS_IMAGE) \
		sh -c "ts-node scripts/generate-types.ts && chown -R $(shell id -u):$(shell id -g) /app/src/generated/crds || true"

.PHONY: update-types
update-types: fetch-crds generate-types ## Fetch CRDs and generate TypeScript (containerized)
	@echo "✅ Types updated successfully"

##@ Plugin checks (TypeScript typecheck + lint; containerized, no local Node required)

.PHONY: plugin-typecheck
plugin-typecheck: require-container-runtime update-types ## Run TypeScript type-check (catches unused vars, type errors). Requires CRD types (update-types) first.
	$(CONTAINER_RUNTIME) run --rm \
		-v "$(CURDIR):/app:z" \
		-w /app \
		node:20-alpine \
		sh -c "yarn install && yarn typecheck"

.PHONY: plugin-lint
plugin-lint: require-container-runtime ## Run ESLint and stylelint on plugin source.
	$(CONTAINER_RUNTIME) run --rm \
		-v "$(CURDIR):/app:z" \
		-w /app \
		node:20-alpine \
		sh -c "yarn install && yarn lint"

.PHONY: plugin-check
plugin-check: plugin-typecheck plugin-lint ## Run typecheck + lint (use before plugin-image to fail fast).

##@ E2E Tests (Playwright)

.PHONY: test-e2e
test-e2e: ## Run post-merge E2E tests (headed, requires live cluster: BRIDGE_BASE_ADDRESS, BRIDGE_KUBEADMIN_PASSWORD)
	yarn test-e2e

.PHONY: test-e2e-headless
test-e2e-headless: ## Run post-merge E2E tests headless (CI mode)
	yarn test-e2e-headless

.PHONY: test-e2e-premerge
test-e2e-premerge: ## Run pre-merge E2E tests (mock-based, no cluster required)
	yarn test-e2e-premerge

.PHONY: test-e2e-premerge-headed
test-e2e-premerge-headed: ## Run pre-merge E2E tests headed (for local debugging)
	yarn test-e2e-premerge-headed

.PHONY: test-e2e-all
test-e2e-all: ## Run all E2E tests (pre-merge + post-merge, headless)
	yarn playwright test --project=pre-merge --project=chromium

##@ Plugin Build (Containerized)

# Set BUILD_OPTS=--no-cache to force a full rebuild (avoids stale "Created" date when cache is reused)
BUILD_OPTS ?=

.PHONY: plugin-build
plugin-build: plugin-typecheck ## Build the console plugin (containerized); runs plugin-typecheck first.
	$(CONTAINER_RUNTIME) run --rm \
		-v "$(CURDIR):/app:z" \
		-w /app \
		node:20-alpine \
		sh -c "yarn install && yarn build"

.PHONY: plugin-image
plugin-image: require-container-runtime plugin-typecheck ## Build the plugin container image; runs plugin-typecheck first.
	$(CONTAINER_RUNTIME) build $(BUILD_OPTS) -t $(PLUGIN_IMG) -f Dockerfile .

.PHONY: plugin-push
plugin-push: require-container-runtime ## Push the plugin container image (override: make plugin-push PLUGIN_IMG=quay.io/<my-org>/ocp-secrets-management:tag)
	$(CONTAINER_RUNTIME) push $(PLUGIN_IMG)

##@ Development

.PHONY: shell
shell: scripts-image ## Open a shell in the scripts container
	$(CONTAINER_RUNTIME) run --rm -it \
		-v "$(CURDIR):/app:z" \
		-w /app \
		$(SCRIPTS_IMAGE) \
		sh

.PHONY: clean
clean: ## Clean generated files
	rm -rf crds/ src/generated/crds/ dist/

.PHONY: clean-images
clean-images: require-container-runtime ## Remove built container images
	$(CONTAINER_RUNTIME) rmi $(SCRIPTS_IMAGE) 2>/dev/null || true

##@ Operator

.PHONY: operator-build
operator-build: ## Build the operator (in operator/ directory)
	cd operator && make build

.PHONY: operator-test
operator-test: ## Run operator tests
	cd operator && make test

.PHONY: operator-bundle
operator-bundle: ## Generate operator bundle
	cd operator && make bundle

##@ FBC Catalog (File-Based Catalog, see catalogs/README.md)

## OCP version directory under catalogs/ to operate on by default (e.g. v4.22).
CATALOG_VERSION ?= v4.22
## image name/tag for the ocp-secrets-management-operator catalog.
CATALOG_IMG ?= openshift.io/ocp-secrets-management-operator-catalog:v0.1.0
## operator bundle image to use for generating/updating the catalog (e.g. registry.stage.redhat.io/external-secrets-management/ocp-secrets-management-operator-bundle@sha256:...).
OPERATOR_BUNDLE_IMAGE ?=
## catalog directory to update (e.g. catalogs/v4.22/catalog).
CATALOG_DIR ?= catalogs/$(CATALOG_VERSION)/catalog
## bundle file name to generate under the package directory (e.g. bundle-v0.2.0.yaml).
BUNDLE_FILE_NAME ?=
## OCP versions to replicate the bundle to: no | yes | 4.22,4.23 | 4.22-4.25
REPLICATE_BUNDLE_FILE_IN_CATALOGS ?= no

## Operator Package Manager tool version to download.
OPM_VERSION ?= v1.72.0
TOOL_BIN_DIR ?= $(CURDIR)/bin/tools
## Operator Package Manager tool path (override with OPM=opm to use a system binary already on PATH).
OPM ?= $(TOOL_BIN_DIR)/opm
OPM_OS := $(shell uname -s | tr '[:upper:]' '[:lower:]')
OPM_ARCH := $(shell uname -m | sed -e 's/x86_64/amd64/' -e 's/aarch64/arm64/')
OPM_DOWNLOAD_URL = https://github.com/operator-framework/operator-registry/releases/download/$(OPM_VERSION)/$(OPM_OS)-$(OPM_ARCH)-opm

.PHONY: get-opm
get-opm: ## Download opm (Operator Package Manager) locally if necessary
	@test -s "$(OPM)" || { \
		mkdir -p "$(TOOL_BIN_DIR)"; \
		echo "Downloading $(OPM_DOWNLOAD_URL)"; \
		curl -fL "$(OPM_DOWNLOAD_URL)" -o "$(OPM)"; \
		chmod +x "$(OPM)"; \
	}

.PHONY: catalog-validate
catalog-validate: get-opm ## Validate the file-based catalog under $(CATALOG_DIR)
	$(OPM) validate $(CATALOG_DIR)

.PHONY: update-catalog
update-catalog: get-opm ## Update catalog using the provided bundle image (OPERATOR_BUNDLE_IMAGE, CATALOG_VERSION, BUNDLE_FILE_NAME; see catalogs/README.md)
	@test -n "$(OPERATOR_BUNDLE_IMAGE)" || { echo "OPERATOR_BUNDLE_IMAGE is required"; exit 1; }
	@test -n "$(CATALOG_VERSION)" || { echo "CATALOG_VERSION is required (e.g. v4.22)"; exit 1; }
	@test -n "$(BUNDLE_FILE_NAME)" || { echo "BUNDLE_FILE_NAME is required (e.g. bundle-v0.2.0.yaml)"; exit 1; }
	@#ex.: make update-catalog OPERATOR_BUNDLE_IMAGE=registry.stage.redhat.io/external-secrets-management/ocp-secrets-management-operator-bundle@sha256:<digest> CATALOG_VERSION=v4.22 BUNDLE_FILE_NAME=bundle-v0.1.0.yaml REPLICATE_BUNDLE_FILE_IN_CATALOGS=no
	./hack/update-catalog.sh $(OPM) $(OPERATOR_BUNDLE_IMAGE) $(CATALOG_DIR) $(BUNDLE_FILE_NAME) $(REPLICATE_BUNDLE_FILE_IN_CATALOGS)

.PHONY: catalog-build
catalog-build: require-container-runtime catalog-validate ## Build the FBC catalog image (default: podman); runs catalog-validate first.
	$(CONTAINER_RUNTIME) build -t $(CATALOG_IMG) -f catalogs/$(CATALOG_VERSION)/Containerfile catalogs/$(CATALOG_VERSION)

.PHONY: catalog-push
catalog-push: require-container-runtime ## Push the FBC catalog image (default: podman; override CATALOG_IMG)
	$(CONTAINER_RUNTIME) push $(CATALOG_IMG)

.PHONY: catalog
catalog: get-opm update-catalog catalog-build ## Update catalog using OPERATOR_BUNDLE_IMAGE (required) and build the catalog image

##@ Local Dev Catalog (build entire FBC chain locally, no Konflux needed)

## Personal registry prefix for local dev builds (e.g. quay.io/yourusername)
DEV_REGISTRY ?= quay.io/$(shell whoami)
## Dev image tags
DEV_OPERATOR_IMG ?= $(DEV_REGISTRY)/ocp-secrets-management-operator:dev
DEV_PLUGIN_IMG ?= $(DEV_REGISTRY)/ocp-secrets-management:dev
DEV_BUNDLE_IMG ?= $(DEV_REGISTRY)/ocp-secrets-management-operator-bundle:dev
DEV_CATALOG_IMG ?= $(DEV_REGISTRY)/ocp-secrets-management-operator-fbc:dev
## Bundle file to render into
DEV_BUNDLE_FILE ?= bundle-v0.1.0.yaml

.PHONY: update-catalog-local
update-catalog-local: get-opm ## Render FBC catalog from local operator/bundle/ directory (no registry push needed)
	@echo "Rendering catalog from local bundle directory..."
	@mkdir -p "$(CATALOG_DIR)/ocp-secrets-management-operator"
	$(OPM) render operator/bundle/ --migrate-level=bundle-object-to-csv-metadata -o yaml \
		> "$(CATALOG_DIR)/ocp-secrets-management-operator/$(DEV_BUNDLE_FILE)"
	@echo "Validating catalog..."
	$(OPM) validate $(CATALOG_DIR)
	@echo "Done. Catalog updated from local bundle."

.PHONY: dev-catalog
dev-catalog: get-opm update-catalog-local catalog-validate ## Render from local bundle + validate (full local FBC refresh)
	@echo "Building local FBC catalog image $(DEV_CATALOG_IMG)..."
	$(CONTAINER_RUNTIME) build -t $(DEV_CATALOG_IMG) -f catalogs/$(CATALOG_VERSION)/Containerfile catalogs/$(CATALOG_VERSION)
	@echo "FBC image ready: $(DEV_CATALOG_IMG)"

.PHONY: dev-images
dev-images: require-container-runtime ## Build operator + plugin + bundle + FBC images locally
	@echo "=== Building operator image ==="
	$(CONTAINER_RUNTIME) build -t $(DEV_OPERATOR_IMG) -f operator/Containerfile.ocp-secrets-management-operator operator/
	@echo "=== Building plugin image ==="
	$(CONTAINER_RUNTIME) build -t $(DEV_PLUGIN_IMG) -f Dockerfile .
	@echo "=== Building FBC catalog image ==="
	$(MAKE) dev-catalog DEV_CATALOG_IMG=$(DEV_CATALOG_IMG)
	@echo ""
	@echo "=== All images built ==="
	@echo "  Operator: $(DEV_OPERATOR_IMG)"
	@echo "  Plugin:   $(DEV_PLUGIN_IMG)"
	@echo "  Catalog:  $(DEV_CATALOG_IMG)"

.PHONY: dev-push
dev-push: require-container-runtime ## Push all dev images to your personal registry
	@echo "Pushing operator image..."
	$(CONTAINER_RUNTIME) push $(DEV_OPERATOR_IMG)
	@echo "Pushing plugin image..."
	$(CONTAINER_RUNTIME) push $(DEV_PLUGIN_IMG)
	@echo "Pushing FBC catalog image..."
	$(CONTAINER_RUNTIME) push $(DEV_CATALOG_IMG)
	@echo ""
	@echo "=== All images pushed ==="
	@echo "  Operator: $(DEV_OPERATOR_IMG)"
	@echo "  Plugin:   $(DEV_PLUGIN_IMG)"
	@echo "  Catalog:  $(DEV_CATALOG_IMG)"

.PHONY: dev-deploy-catalog
dev-deploy-catalog: ## Deploy the dev FBC catalog to the current OCP cluster (push first: make dev-push)
	@echo "Deploying CatalogSource with image: $(DEV_CATALOG_IMG)"
	@oc delete catalogsource ocp-secrets-management-operator-catalog -n openshift-marketplace 2>/dev/null || true
	@printf 'apiVersion: operators.coreos.com/v1alpha1\nkind: CatalogSource\nmetadata:\n  name: ocp-secrets-management-operator-catalog\n  namespace: openshift-marketplace\nspec:\n  sourceType: grpc\n  image: $(DEV_CATALOG_IMG)\n  displayName: "External Secrets Management Console (Dev)"\n  publisher: "Dev"\n  updateStrategy:\n    registryPoll:\n      interval: 1m\n' | oc apply -f -
	@echo "CatalogSource deployed. Check: oc get catalogsource -n openshift-marketplace"

##@ Update & verify (run after code changes / before PR)

# Short prompt for AI: follow the detailed task in the script (avoids escaping full content in make).
SYNC_CRD_PROMPT := Follow the instructions in scripts/sync-crd-types-prompt.md in this workspace. Execute the sync task described there so CRD types and src/components/crds stay in sync with the code. Run make update-types if needed, then make plugin-typecheck to verify.

.PHONY: sync-crd-types
sync-crd-types: ## Sync CRD types and components/crds with code (uses Cursor agent or Claude CLI if available; otherwise prints prompt for manual use)
	@cd "$(CURDIR)" && \
	if command -v agent >/dev/null 2>&1; then \
		echo "Running Cursor agent (sync-crd-types)..."; \
		agent -p "$(SYNC_CRD_PROMPT)" --workspace "$(CURDIR)" || exit 1; \
	elif command -v claude >/dev/null 2>&1; then \
		echo "Running Claude CLI (sync-crd-types)..."; \
		claude -p "$(SYNC_CRD_PROMPT)" --allowedTools "Read,Edit,Bash" || exit 1; \
	else \
		echo "=============================================="; \
		echo "No Cursor (agent) or Claude (claude) CLI found."; \
		echo "Paste the prompt below into Cursor Agent or Claude to sync CRD types:"; \
		echo "=============================================="; \
		echo ""; \
		cat "$(CURDIR)/scripts/sync-crd-types-prompt.md"; \
		echo ""; \
		echo "=============================================="; \
		echo "Then run: make update-types && make verify"; \
		echo "=============================================="; \
	fi

.PHONY: update
update: update-types ## Regenerate CRD types and other generated artifacts (run after making code changes)
	@echo "✅ make update done. If you changed imports from ./crds or ./components/crds, run: make sync-crd-types"

.PHONY: verify
verify: require-container-runtime plugin-check test ## Run all checks (typecheck, lint, tests). Use before creating a PR.
	@echo "✅ make verify passed"
