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
	cd operator && make container-build

.PHONY: operator-test
operator-test: ## Run operator tests
	cd operator && make test

.PHONY: operator-bundle
operator-bundle: ## Generate operator bundle
	cd operator && make bundle

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
