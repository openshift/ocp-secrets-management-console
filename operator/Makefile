# Container engine: podman by default (override with CONTAINER_ENGINE=docker if needed)
CONTAINER_ENGINE ?= podman
# Set BUILD_OPTS=--no-cache to force a full rebuild (avoids stale "Created" date when cache is reused)
BUILD_OPTS ?=

# Image settings (override when building for your registry, e.g. make image-build IMG=quay.io/<my-org>/ocp-secrets-management-operator:tag)
IMG ?= openshift.io/ocp-secrets-management-operator:latest
PLUGIN_IMG ?= openshift.io/ocp-secrets-management:latest
BUNDLE_IMG ?= openshift.io/ocp-secrets-management-operator-bundle:v0.1.0
CATALOG_IMG ?= openshift.io/ocp-secrets-management-operator-catalog:v0.1.0

# Version
VERSION ?= 0.1.0

# Tool versions
CONTROLLER_GEN_VERSION ?= v0.16.5
KUSTOMIZE_VERSION ?= v5.3.0
# v1.34.0 has no release assets (404); use v1.34.1 or later for curl download.
OPERATOR_SDK_VERSION ?= v1.34.1

# Location to install dependencies to (for operator-sdk; controller-gen/kustomize use GOBIN).
LOCALBIN ?= ../bin

# Bundle channels and default channel (override via CHANNELS= or DEFAULT_CHANNEL= when running make bundle).
# See https://github.com/openshift/external-secrets-operator/blob/main/Makefile
BUNDLE_CHANNELS ?=
ifneq ($(origin CHANNELS), undefined)
BUNDLE_CHANNELS := --channels=$(CHANNELS)
endif
BUNDLE_DEFAULT_CHANNEL ?=
ifneq ($(origin DEFAULT_CHANNEL), undefined)
BUNDLE_DEFAULT_CHANNEL := --default-channel=$(DEFAULT_CHANNEL)
endif
BUNDLE_METADATA_OPTS ?= $(BUNDLE_CHANNELS) $(BUNDLE_DEFAULT_CHANNEL)

# Get the currently used golang install path (in GOPATH/bin, unless GOBIN is set)
ifeq (,$(shell go env GOBIN))
GOBIN=$(shell go env GOPATH)/bin
else
GOBIN=$(shell go env GOBIN)
endif

# Setting SHELL to bash allows bash commands to be executed by recipes.
SHELL = /usr/bin/env bash -o pipefail
.SHELLFLAGS = -ec

.PHONY: all
all: build

##@ General

.PHONY: help
help: ## Display this help.
	@awk 'BEGIN {FS = ":.*##"; printf "\nUsage:\n  make \033[36m<target>\033[0m\n"} /^[a-zA-Z_0-9-]+:.*?##/ { printf "  \033[36m%-15s\033[0m %s\n", $$1, $$2 } /^##@/ { printf "\n\033[1m%s\033[0m\n", substr($$0, 5) } ' $(MAKEFILE_LIST)

##@ Development

.PHONY: manifests
manifests: controller-gen ## Generate CRD and RBAC manifests from kubebuilder markers.
	$(CONTROLLER_GEN) crd paths="./pkg/apis/..." output:crd:artifacts:config=config/crd
	$(CONTROLLER_GEN) rbac:roleName=secrets-management-operator paths="./pkg/controller/..." output:dir=config/rbac

.PHONY: generate
generate: controller-gen ## Generate code containing DeepCopy, DeepCopyInto, and DeepCopyObject method implementations.
	$(CONTROLLER_GEN) object:headerFile="hack/boilerplate.go.txt" paths="./pkg/apis/..."

.PHONY: clean
clean: ## Remove build artifacts.
	rm -rf bin/ cover.out

.PHONY: fmt
fmt: ## Run go fmt against code.
	go fmt ./...

.PHONY: vet
vet: ## Run go vet against code.
	go vet ./...

.PHONY: test
test: manifests generate fmt vet ## Run tests.
	go test ./... -coverprofile cover.out

.PHONY: lint
lint: ## Run golangci-lint against code.
	golangci-lint run

##@ Build

.PHONY: build
build: manifests generate fmt vet ## Build manager binary.
	go build -o bin/manager cmd/manager/main.go

.PHONY: run
run: manifests generate fmt vet ## Run a controller from your host.
	go run ./cmd/manager/main.go

.PHONY: image-build
image-build: ## Build container image with the manager (default: podman).
	$(CONTAINER_ENGINE) build $(BUILD_OPTS) -t ${IMG} -f Dockerfile .

.PHONY: image-push
image-push: ## Push container image (default: podman).
	$(CONTAINER_ENGINE) push ${IMG}

.PHONY: docker-build
docker-build: ## Build image using docker.
	$(MAKE) image-build CONTAINER_ENGINE=docker

.PHONY: docker-push
docker-push: ## Push image using docker.
	$(MAKE) image-push CONTAINER_ENGINE=docker

.PHONY: podman-build
podman-build: ## Build image using podman (default).
	$(MAKE) image-build CONTAINER_ENGINE=podman

.PHONY: podman-push
podman-push: ## Push image using podman (default).
	$(MAKE) image-push CONTAINER_ENGINE=podman

##@ Deployment

.PHONY: install
install: manifests ## Install CRDs into the K8s cluster specified in ~/.kube/config.
	kubectl apply -f config/crd/

.PHONY: uninstall
uninstall: manifests ## Uninstall CRDs from the K8s cluster specified in ~/.kube/config.
	kubectl delete -f config/crd/

# Deploy substitutes IMG into config/manager/ and PLUGIN_IMG into the sample so that
# the applied manifests use the images you set (e.g. make deploy IMG=quay.io/<my-org>/ocp-secrets-management-operator:latest).
.PHONY: deploy
deploy: manifests ## Deploy controller to the K8s cluster specified in ~/.kube/config. Uses IMG for the operator image.
	kubectl apply -f config/crd/
	kubectl apply -f config/namespace.yaml
	kubectl apply -f config/rbac/
	sed -e 's|image: openshift.io/ocp-secrets-management-operator:latest|image: $(IMG)|' config/manager/manager.yaml | kubectl apply -f -

.PHONY: undeploy
undeploy: ## Undeploy controller from the K8s cluster specified in ~/.kube/config.
	kubectl delete -f config/manager/ --ignore-not-found
	kubectl delete -f config/rbac/ --ignore-not-found
	kubectl delete -f config/namespace.yaml --ignore-not-found
	kubectl delete -f config/crd/ --ignore-not-found

# deploy-sample applies the SecretsManagementConfig with PLUGIN_IMG substituted so the plugin deployment uses your image.
# Depends on deploy so the operator is running and can reconcile the sample (create plugin deployment, ConsolePlugin, etc.).
.PHONY: deploy-sample
deploy-sample: deploy ## Deploy sample SecretsManagementConfig CR. Uses PLUGIN_IMG for the plugin image.
	sed -e 's|image: openshift.io/ocp-secrets-management:latest|image: $(PLUGIN_IMG)|' config/samples/secrets-management_v1alpha1_secretsmanagementconfig.yaml | kubectl apply -f -

.PHONY: undeploy-sample
undeploy-sample: ## Remove the sample SecretsManagementConfig (operator will clean up plugin Deployment, Service, ConsolePlugin).
	kubectl delete -f config/samples/secrets-management_v1alpha1_secretsmanagementconfig.yaml --ignore-not-found

##@ Tool Dependencies

CONTROLLER_GEN = $(GOBIN)/controller-gen
.PHONY: controller-gen
controller-gen: ## Download controller-gen locally if necessary.
	@test -s $(CONTROLLER_GEN) || GOBIN=$(GOBIN) go install sigs.k8s.io/controller-tools/cmd/controller-gen@$(CONTROLLER_GEN_VERSION)

KUSTOMIZE = $(GOBIN)/kustomize
.PHONY: kustomize
kustomize: ## Download kustomize locally if necessary.
	@test -s $(KUSTOMIZE) || GOBIN=$(GOBIN) go install sigs.k8s.io/kustomize/kustomize/v5@$(KUSTOMIZE_VERSION)

# OPERATOR_SDK: use LOCALBIN/operator-sdk by default; download target below installs it if missing. Override with OPERATOR_SDK=operator-sdk to use system binary.
OPERATOR_SDK ?= $(LOCALBIN)/operator-sdk
$(OPERATOR_SDK): ## Download operator-sdk locally if necessary.
ifeq (,$(wildcard $(OPERATOR_SDK)))
ifeq (,$(shell which operator-sdk 2>/dev/null))
	@{ \
	set -e; \
	mkdir -p $(dir $(OPERATOR_SDK)); \
	OS=$$(go env GOOS) && ARCH=$$(go env GOARCH) && \
	curl -sSLo $(OPERATOR_SDK) "https://github.com/operator-framework/operator-sdk/releases/download/$(OPERATOR_SDK_VERSION)/operator-sdk_$${OS}_$${ARCH}"; \
	if ! [ -s $(OPERATOR_SDK) ] || head -c 20 $(OPERATOR_SDK) | grep -q 'Not Found'; then \
	  echo "operator-sdk download failed (empty or 404). Try OPERATOR_SDK_VERSION=v1.34.1 or install from https://sdk.operatorframework.io/docs/installation/"; \
	  rm -f $(OPERATOR_SDK); exit 1; \
	fi; \
	chmod +x $(OPERATOR_SDK); \
	}
else
OPERATOR_SDK := $(shell which operator-sdk)
endif
endif

# Flags for operator-sdk generate bundle (align with openshift/external-secrets-operator: -q --overwrite --version $(VERSION) $(BUNDLE_METADATA_OPTS))
BUNDLE_GEN_FLAGS ?= -q --overwrite --version $(VERSION) $(BUNDLE_METADATA_OPTS)

##@ Bundle

.PHONY: bundle
bundle: $(KUSTOMIZE) $(OPERATOR_SDK) manifests ## Generate bundle manifests and metadata, then validate generated files.
	@echo "Generating the bundle manifests and metadata..."
	@echo "  Operator image: $(IMG)"
	@echo "  Plugin image:   $(PLUGIN_IMG)"
	@$(OPERATOR_SDK) generate kustomize manifests -q
	@cd config/manager && $(KUSTOMIZE) edit set image controller=$(IMG)
	@$(KUSTOMIZE) build config/manifests | $(OPERATOR_SDK) generate bundle $(BUNDLE_GEN_FLAGS)
	@PLUGIN_IMG=$(PLUGIN_IMG) go run ./scripts/patch-bundle-csv.go
	@$(OPERATOR_SDK) bundle validate ./bundle

.PHONY: bundle-build
bundle-build: ## Build the bundle image (default: podman).
	$(CONTAINER_ENGINE) build $(BUILD_OPTS) -f bundle.Dockerfile -t $(BUNDLE_IMG) .

.PHONY: bundle-push
bundle-push: ## Push the bundle image (default: podman).
	$(CONTAINER_ENGINE) push $(BUNDLE_IMG)

.PHONY: bundle-validate
bundle-validate: $(OPERATOR_SDK) ## Validate the bundle using operator-sdk.
	$(OPERATOR_SDK) bundle validate ./bundle

.PHONY: catalog-build
catalog-build: ## Build a catalog image.
	opm index add --bundles $(BUNDLE_IMG) --tag $(CATALOG_IMG)

.PHONY: catalog-push
catalog-push: ## Push a catalog image (default: podman).
	$(CONTAINER_ENGINE) push $(CATALOG_IMG)
