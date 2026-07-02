# OpenShift Console Plugin for Secrets Management

[![codecov](https://codecov.io/gh/openshift/ocp-secrets-management-console/branch/main/graph/badge.svg)](https://codecov.io/gh/openshift/ocp-secrets-management-console)

This project is a minimal OpenShift Console Plugin for managing resources
associated with secrets management. This includes the CRDs for:
- cert-manager
- external secrets operator
- secrets store csi driver

This project is based off of the OpenShift dynamic console plugin template seen [here](https://github.com/openshift/console-plugin-template)

[Dynamic plugins](https://github.com/openshift/console/tree/master/frontend/packages/console-dynamic-plugin-sdk)
allow you to extend the
[OpenShift UI](https://github.com/openshift/console)
at runtime, adding custom pages and other extensions. They are based on
[webpack module federation](https://webpack.js.org/concepts/module-federation/).
Plugins are registered with console using the `ConsolePlugin` custom resource
and enabled in the console operator config by a cluster administrator.

Using the latest `v1` API version of `ConsolePlugin` CRD, requires OpenShift 4.12
and higher. For using old `v1alpha1` API version us OpenShift version 4.10 or 4.11.

For an example of a plugin that works with OpenShift 4.11, see the `release-4.11` branch.
For a plugin that works with OpenShift 4.10, see the `release-4.10` branch.

[Node.js](https://nodejs.org/en/) and [yarn](https://yarnpkg.com) are required
to build and run the example. To run OpenShift console in a container, either
[Docker](https://www.docker.com) or [podman 3.2.0+](https://podman.io) and
[oc](https://console.redhat.com/openshift/downloads) are required.

## Development

Note: This plugin was primarily generated using cursor and AI prompts.

## Getting Started

### Prerequisites

Before you begin, ensure you have the following installed on your system:

- **Node.js** (v16 or higher) - [Download here](https://nodejs.org/en/)
- **Yarn** package manager - [Installation guide](https://yarnpkg.com/getting-started/install)
- **Docker Desktop** - [Download here](https://www.docker.com/products/docker-desktop/)
- **OpenShift CLI (oc)** - [Download here](https://console.redhat.com/openshift/downloads)
- **Git** - For cloning the repository

### Quick Start

1. **Clone the repository**
   ```bash
   git clone <repository-url>
   cd ocp-secrets-management
   ```

2. **Install dependencies**
   ```bash
   yarn install
   ```

3. **Start Docker Desktop**
   - Make sure Docker Desktop is running on your system
   - You should see the Docker icon in your system tray/menu bar

4. **Login to your OpenShift cluster**
   ```bash
   oc login <your-openshift-cluster-url>
   ```

5. **Start the plugin development server**
   ```bash
   yarn start
   ```
   This will start the webpack development server on `http://localhost:9001`

6. **In a new terminal, start the OpenShift Console**
   ```bash
   yarn start-console
   ```
   This will start the OpenShift Console on `http://localhost:9000`

7. **Access the plugin**
   - Open your browser and navigate to `http://localhost:9000`
   - Login with your OpenShift credentials
   - Look for "Secrets Management" in the navigation menu

### After making changes / Before creating a PR

- **`make update`** – Regenerate CRD types and other generated artifacts. Run this after you change code so that `src/generated/crds` and the build stay in sync.
- **`make sync-crd-types`** – If you added or changed imports from `./crds` or `./components/crds`, run this to have the Cursor agent or Claude CLI sync types and shims (or it will print a prompt to paste into Cursor/Claude if no CLI is installed).
- **`make verify`** – Run typecheck, lint, and tests. Use before opening a PR.

### Available Scripts

- `yarn start` - Start the plugin development server
- `yarn start-console` - Start the OpenShift Console with plugin integration
- `yarn build` - Build the plugin for production
- `yarn build-dev` - Build the plugin for development
- `yarn lint` - Run ESLint for code quality checks
- `yarn test` - Run Jest unit tests

### E2E Testing (Playwright)

The project includes a comprehensive E2E test suite built with [Playwright](https://playwright.dev/). Tests are split into two categories:

#### Pre-merge tests (mock-based, no cluster required)

These tests use intercepted API responses (mocks) so they can run anywhere -- locally, in CI, without a live cluster.

```bash
make test-e2e-premerge          # headless (CI mode)
make test-e2e-premerge-headed   # headed (visible browser, for debugging)
```

What they cover:
- Plugin hidden state when no operators are installed
- Dashboard rendering with mock certificates, external secrets, and secret provider classes
- Empty state messages for all resource types
- Filter dropdowns and status badges

#### Post-merge tests (requires a live OpenShift cluster)

These tests run against a real cluster with operators and resources installed. They validate actual API interactions and UI behavior.

**Required environment variables:**

| Variable | Description | Example |
|---|---|---|
| `BRIDGE_BASE_ADDRESS` | OpenShift Console URL | `https://console-openshift-console.apps.<cluster>.devcluster.openshift.com` |
| `BRIDGE_KUBEADMIN_PASSWORD` | kubeadmin password | `wPNqQ-eQJnk-oBC8x-47B7p` |
| `OC_SERVER` | API server URL (used by delete test for `oc` commands) | `https://api.<cluster>.devcluster.openshift.com:6443` |

```bash
export BRIDGE_BASE_ADDRESS='https://console-openshift-console.apps.<cluster>.devcluster.openshift.com'
export BRIDGE_KUBEADMIN_PASSWORD='<password>'
export OC_SERVER='https://api.<cluster>.devcluster.openshift.com:6443'

make test-e2e                   # headed (watch tests run)
make test-e2e-headless          # headless (CI mode)
```

What they cover:
- Certificate expiry warning badges (success/warning/danger colors)
- Delete resource via UI (creates test cert, deletes via modal, verifies removal)
- Inspect pane with metadata, specification, status, and sensitive data toggle
- Secrets Store CSI Driver: SecretProviderClass listing, provider icons, inspect pane

#### Run everything

```bash
make test-e2e-all    # pre-merge + post-merge, headless (requires cluster env vars)
```

#### Cluster prerequisites for post-merge tests

The cluster must have the following installed:

1. **cert-manager Operator for Red Hat OpenShift** (`openshift-cert-manager-operator`, channel `stable-v1`)
2. **External Secrets Operator for Red Hat OpenShift** (`openshift-external-secrets-operator`, channel `stable-v1`)
3. **Secrets Store CSI Driver Operator** (`secrets-store-csi-driver-operator`, channel `stable`)
4. **SMC console plugin** deployed and enabled
5. **Test resources**: ClusterIssuer, Certificates (varied expiry), ExternalSecret, SecretStore, SecretProviderClasses

> **Note on ESO:** Use the **Red Hat** operator (`openshift-external-secrets-operator` from `redhat-operators`), not the community one. The Red Hat version serves the `v1` API that the plugin expects. The community operator only serves `v1beta1`, which causes "Model does not exist" errors.

#### Headed vs Headless

- **Headed** (`--headed`) -- Opens a visible browser window so you can watch tests interact with the UI. Useful for debugging.
- **Headless** (default) -- Runs the browser invisibly in the background. Used in CI environments where there is no display.

### Deployment to OpenShift Cluster

The plugin is deployed by the **Secrets Management Operator** in the `operator/` directory. 

**Prerequisites:** podman or docker, `oc` logged into your OpenShift cluster, and push access to your container registry (e.g. quay.io).

#### Quick Deployment Scripts

We provide **two deployment methods**:

**Method 1: Direct Deployment** (Development - Fast)
```bash
# Build and deploy directly to cluster (no OLM)
export SM_QUAY_USER=myusername
./scripts/deploy-to-cluster.sh
```

**Method 2: Bundle Deployment** (Production - Via OLM)
```bash
# Build and deploy via OLM bundle
export SM_QUAY_USER=myusername
export SM_IMAGE_TAG=v1.0.0
./scripts/deploy-via-bundle.sh
```

See [DEPLOYMENT_METHODS.md](./DEPLOYMENT_METHODS.md) for detailed comparison.

#### Manual Build and Deploy

Alternatively, build each image individually:

1. **Build the plugin image** (from repo root). Set `PLUGIN_IMG` to your image (defaults in Makefile use `openshift.io/ocp-secrets-management:latest`):

   ```bash
   make plugin-image PLUGIN_IMG=quay.io/<my-org>/ocp-secrets-management:latest
   ```

   **Note:** The plugin image build can take **several minutes (often 5–15 minutes)**. The Dockerfile has a multi-stage build that runs `yarn install` and `yarn build` (production webpack) inside the image with no cache of `node_modules` or `dist/`. So each build does a full npm install and a full production webpack bundle; that’s why it’s slow. Using the same tag (e.g. `:latest`) with `imagePullPolicy: Always` ensures the cluster pulls the new image after you push.

2. **Build the operator image** (from `operator/`). Set `IMG` to your image (defaults in operator Makefile use `openshift.io/ocp-secrets-management-operator:latest`):

   ```bash
   cd operator
   make build
   make podman-build IMG=quay.io/<my-org>/ocp-secrets-management-operator:latest
   # or: make docker-build IMG=quay.io/<my-org>/ocp-secrets-management-operator:latest
   ```

3. **Push both images** to your registry (pass the same `PLUGIN_IMG` / `IMG` you used to build):

   ```bash
   make plugin-push PLUGIN_IMG=quay.io/<my-org>/ocp-secrets-management:latest
   cd operator && make podman-push IMG=quay.io/<my-org>/ocp-secrets-management-operator:latest
   ```

4. **Deploy the operator and apply the config**. The deploy targets substitute **`IMG`** and **`PLUGIN_IMG`** into the manifests before applying, so the cluster uses the images you built (no need to edit YAML):

   ```bash
   cd operator
   make deploy IMG=quay.io/<my-org>/ocp-secrets-management-operator:latest
   make deploy-sample PLUGIN_IMG=quay.io/<my-org>/ocp-secrets-management:latest
   ```

   Committed manifests use the official `openshift.io/` images; the Makefile replaces those with `IMG` and `PLUGIN_IMG` at deploy time (same idea as [external-secrets-operator deploy](https://github.com/openshift/external-secrets-operator/blob/main/Makefile)).

5. **Restart deployments** so they use the new images (if you use `:latest`):

   ```bash
   oc rollout restart deployment/secrets-management-operator -n openshift-secrets-management
   oc rollout restart deployment/ocp-secrets-management-plugin -n openshift-secrets-management
   ```

   With `imagePullPolicy: Always` on the plugin (as in the sample), the plugin pods will pull the new image on restart.

#### Official images vs. building for your own deploy

Official image references in this repo (samples, manager manifest, CSV, charts) use **`openshift.io/`**. When you build and push to deploy yourself, set **`PLUGIN_IMG`** and **`IMG`** (e.g. `make plugin-image PLUGIN_IMG=quay.io/<my-org>/ocp-secrets-management:latest` and `make podman-build IMG=quay.io/<my-org>/ocp-secrets-management-operator:latest`); the Makefiles default those vars to `openshift.io/`.

- **Plugin image (what runs in the cluster)**  
  `make deploy-sample PLUGIN_IMG=...` substitutes **`PLUGIN_IMG`** into the sample `SecretsManagementConfig` before applying, so use e.g. `make deploy-sample PLUGIN_IMG=quay.io/<my-org>/ocp-secrets-management:latest`. The committed sample uses the official `openshift.io/` default.

- **Plugin image (when building)**  
  Root `make plugin-image` uses **`PLUGIN_IMG`** (default `quay.io/<my-org>/ocp-secrets-management:latest`). Override with e.g. `make plugin-image PLUGIN_IMG=quay.io/<my-org>/ocp-secrets-management:v1.0.0`.

- **Operator image (what runs in the cluster)**  
  `make deploy IMG=...` substitutes **`IMG`** into the manager manifest before applying, so use e.g. `make deploy IMG=quay.io/<my-org>/ocp-secrets-management-operator:latest` to deploy your image. The committed file keeps the official `openshift.io/` default.

- **Operator image (when building)**  
  In `operator/`, `make podman-build` and `make podman-push` use **`IMG`** (default `quay.io/<my-org>/ocp-secrets-management-operator:latest`). Override with e.g. `make podman-build IMG=quay.io/<my-org>/ocp-secrets-management-operator:v1.0.0`.

### Plugin Features

This plugin provides a comprehensive interface for managing secrets-related Kubernetes resources:

#### **Resource Management**
- **Certificates** (cert-manager.io/v1)
- **Issuers & ClusterIssuers** (cert-manager.io/v1)
- **ExternalSecrets & ClusterExternalSecrets** (external-secrets.io/v1)
- **SecretStores & ClusterSecretStores** (external-secrets.io/v1)
- **PushSecrets & ClusterPushSecrets** (external-secrets.io/v1alpha1)
- **SecretProviderClasses** (secrets-store.csi.x-k8s.io/v1)

#### **Key Capabilities**
- **Resource Filtering** - Filter by operator (cert-manager, external-secrets, secrets-store-csi) and resource kind
- **Resource Inspection** - View detailed metadata, labels, annotations, specifications, and status
- **Resource Deletion** - Delete resources with confirmation dialogs
- **Sensitive Data Toggle** - Show/hide sensitive information in resource details
- **Real-time Updates** - Live resource monitoring with Kubernetes watch API

### Troubleshooting

#### Port Already in Use
If you encounter "EADDRINUSE" errors:
```bash
# Kill existing Node.js processes
killall -9 node

# Restart the services
yarn start
# In new terminal:
yarn start-console
```

#### Docker Issues
If the console fails to start:
- Ensure Docker Desktop is running
- Try restarting Docker Desktop
- Check if port 9000 is available

#### Plugin Not Loading
If the plugin doesn't appear in the console:
- Verify both `yarn start` and `yarn start-console` are running
- Check the browser console for errors
- Ensure you're logged into the correct OpenShift cluster

#### Resource Access Issues
If resources don't load:
- Verify your OpenShift user has appropriate RBAC permissions
- Check that cert-manager and external-secrets-operator are installed in your cluster
- Ensure the "demo" namespace exists (or modify the code to use your desired namespace)

### Development Notes

- The plugin uses the OpenShift Console Dynamic Plugin SDK
- Hot reloading is enabled for development efficiency
- All console debugging has been removed for production readiness
- CSRF tokens are handled automatically for API requests

## Code Coverage

This project uses [Codecov](https://codecov.io) to track and report code coverage metrics.

### Running Coverage Locally

To generate a coverage report on your local machine:

```bash
# Run tests with coverage
yarn coverage

# View the HTML coverage report in your browser
open coverage/lcov-report/index.html  # macOS
xdg-open coverage/lcov-report/index.html  # Linux
```

### Coverage Reports

- **Dashboard**: View detailed coverage reports at [codecov.io/gh/openshift/ocp-secrets-management-console](https://codecov.io/gh/openshift/ocp-secrets-management-console)
- **Pull Requests**: Coverage reports are automatically posted as comments on pull requests
- **Coverage Threshold**: Minimum coverage threshold is set to 50% for all metrics (branches, functions, lines, statements)

### CI/CD Coverage Workflow

Coverage is automatically collected and uploaded to Codecov during CI/CD runs:

1. **Presubmit Tests**: Coverage is collected on every PR
2. **Postsubmit Tests**: Coverage baseline is updated on merges to `main`
3. **E2E Coverage**: End-to-end test coverage is tracked separately with the `e2e` flag

### Coverage Configuration

Coverage settings are configured in:
- `jest.config.ts` - Jest coverage collection and thresholds
- `.codecov.yml` - Codecov behavior and reporting preferences
- `images/ci/Dockerfile.coverage` - Coverage-enabled container image for CI

<!-- CI pipeline check: this comment is a no-op placeholder used to trigger a test run. -->
