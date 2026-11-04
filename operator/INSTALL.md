# Installing the Operator and Plugin

## Prerequisites

- OpenShift or Kubernetes cluster with `kubectl`/`oc` configured
- Operator image built and pushed (e.g. to Quay)
- Plugin image built and pushed (e.g. to Quay)

## Build and push images (once)

From the **repository root**:

```bash
# Build and push the plugin image
make plugin-image PLUGIN_IMG=quay.io/<your-org>/ocp-secrets-management:latest
# push to your registry, e.g.:
podman push quay.io/<your-org>/ocp-secrets-management:latest
```

From the **operator** directory:

```bash
cd operator
make podman-build IMG=quay.io/<your-org>/ocp-secrets-management-operator:latest
podman push quay.io/<your-org>/ocp-secrets-management-operator:latest
```

---

## Install steps

All steps below assume you are in the **operator** directory and use your image URLs.

### Step 1: Deploy the operator

This installs the CRD, namespace `openshift-secrets-management`, RBAC (ClusterRole/ClusterRoleBinding, ServiceAccount), and the operator Deployment.

```bash
cd operator
make deploy IMG=quay.io/<your-org>/ocp-secrets-management-operator:latest
```

**Result:** The operator is running and watching for `SecretsManagementConfig` resources. No plugin or ConsolePlugin exists yet.

---

### Step 2: Deploy the sample SecretsManagementConfig (plugin configuration)

This creates the `SecretsManagementConfig` CR named `cluster` that tells the operator which plugin image to run and how to configure it.

```bash
make deploy-sample PLUGIN_IMG=quay.io/<your-org>/ocp-secrets-management:latest
```

**Result:** The operator sees the `SecretsManagementConfig` and reconciles it. As part of that reconciliation it:

1. Ensures the namespace exists  
2. Creates RBAC (ClusterRoles and ClusterRoleBindings for the plugin)  
3. Creates the **plugin Deployment** (nginx + your plugin image) and **Service**  
4. Creates the **ConsolePlugin** CR so the OpenShift Console loads the plugin  

So **Step 2 (deploy-sample) is what causes the ConsolePlugin CR to be created.** The operator creates it when it reconciles a `SecretsManagementConfig`; it does not exist after Step 1 alone.

---

### Step 3: Enable the plugin in the Console (OpenShift)

The ConsolePlugin CR only **registers** the plugin. On OpenShift, **dynamic plugins are disabled by default** and must be enabled by a cluster administrator. Until then, the console will show the plugin as **Disabled**.

**Option A – Web console**

1. Go to **Administration** → **Cluster Settings**.
2. Open the **Console** configuration (under "Configuration" or "Operator details").
3. Go to the **Console plugins** tab.
4. Find **OCP Secrets Management** and switch it to **Enabled**.
5. Refresh the browser if the console prompts you.

**Option B – CLI (append only)**

Use a **JSON patch** to append this plugin without touching existing ones. No need to list or know other plugins:

```bash
oc patch console.operator.openshift.io cluster --type=json -p '[{"op": "add", "path": "/spec/plugins/-", "value": "ocp-secrets-management"}]'
```

`path: "/spec/plugins/-"` means “add to the end of the `plugins` array”. Existing plugins are unchanged. If **ocp-secrets-management** is already in the list, running this again will add a duplicate; remove it in the Console plugins UI if that happens.

After enabling, reload the console; the **Secrets Management** menu item should appear.

---

## Summary

| Step | Command | What it does |
|------|--------|----------------|
| 1 | `make deploy IMG=...` | Installs CRD, namespace, operator RBAC, operator Deployment. No plugin, no ConsolePlugin. |
| 2 | `make deploy-sample PLUGIN_IMG=...` | Creates `SecretsManagementConfig`; operator creates plugin Deployment, Service, **ConsolePlugin** CR, and plugin RBAC. |
| 3 | Console Settings or `oc patch console.operator...` | Enables the plugin in the Console (it appears as Disabled until this step). |

**What creates the ConsolePlugin:** The operator creates the `ConsolePlugin` CR when it reconciles a `SecretsManagementConfig` (after you run `make deploy-sample`). It does not get created by `make deploy` alone.

---

## Teardown

Remove in reverse order so the operator can clean up the plugin and remove the finalizer from the config:

```bash
# 1. Delete the SecretsManagementConfig (operator removes plugin Deployment, Service, ConsolePlugin, finalizer)
make undeploy-sample

# 2. Remove the operator and related resources
make undeploy
```
