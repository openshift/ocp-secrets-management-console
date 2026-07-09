package controller

import (
	"context"
	"testing"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
	appsv1 "k8s.io/api/apps/v1"
	corev1 "k8s.io/api/core/v1"
	rbacv1 "k8s.io/api/rbac/v1"
	apiextensionsv1 "k8s.io/apiextensions-apiserver/pkg/apis/apiextensions/v1"
	apierrors "k8s.io/apimachinery/pkg/api/errors"
	metav1 "k8s.io/apimachinery/pkg/apis/meta/v1"
	"k8s.io/apimachinery/pkg/runtime"
	"k8s.io/apimachinery/pkg/types"
	clientgoscheme "k8s.io/client-go/kubernetes/scheme"
	ctrl "sigs.k8s.io/controller-runtime"
	"sigs.k8s.io/controller-runtime/pkg/client"
	"sigs.k8s.io/controller-runtime/pkg/client/fake"
	"sigs.k8s.io/controller-runtime/pkg/log/zap"

	smv1alpha1 "github.com/openshift/ocp-secrets-management/operator/pkg/apis/secretsmanagement/v1alpha1"
)

func init() {
	ctrl.SetLogger(zap.New(zap.UseDevMode(true)))
}

func newTestScheme() *runtime.Scheme {
	scheme := runtime.NewScheme()
	_ = clientgoscheme.AddToScheme(scheme)
	_ = smv1alpha1.AddToScheme(scheme)
	_ = apiextensionsv1.AddToScheme(scheme)
	return scheme
}

func newTestReconciler(objs ...client.Object) *SecretsManagementConfigReconciler {
	scheme := newTestScheme()
	fakeClient := fake.NewClientBuilder().
		WithScheme(scheme).
		WithObjects(objs...).
		WithStatusSubresource(&smv1alpha1.SecretsManagementConfig{}).
		Build()

	return &SecretsManagementConfigReconciler{
		Client: fakeClient,
		Log:    ctrl.Log.WithName("test"),
		Scheme: scheme,
	}
}

func newTestConfig(name string) *smv1alpha1.SecretsManagementConfig {
	return &smv1alpha1.SecretsManagementConfig{
		ObjectMeta: metav1.ObjectMeta{
			Name: name,
		},
		Spec: smv1alpha1.SecretsManagementConfigSpec{
			RBAC: smv1alpha1.RBACConfig{
				CreateDefaultRoles: true,
				RolePrefix:         "secrets-management",
			},
		Plugin: smv1alpha1.PluginConfig{
			Image:    "openshift.io/ocp-secrets-management:test",
			Replicas: 1,
		},
			Operators: smv1alpha1.OperatorsConfig{
				CertManager:     smv1alpha1.OperatorConfig{Enabled: true},
				ExternalSecrets: smv1alpha1.OperatorConfig{Enabled: true},
				SecretsStoreCSI: smv1alpha1.OperatorConfig{Enabled: true},
			},
		},
	}
}

func TestReconcile_NewConfig(t *testing.T) {
	ctx := context.Background()
	config := newTestConfig("cluster")
	r := newTestReconciler(config)

	// First reconcile - should add finalizer
	result, err := r.Reconcile(ctx, ctrl.Request{
		NamespacedName: types.NamespacedName{Name: "cluster"},
	})
	require.NoError(t, err)
	assert.False(t, result.Requeue)

	// Verify finalizer was added
	updatedConfig := &smv1alpha1.SecretsManagementConfig{}
	err = r.Get(ctx, types.NamespacedName{Name: "cluster"}, updatedConfig)
	require.NoError(t, err)
	assert.Contains(t, updatedConfig.Finalizers, FinalizerName)
}

func TestReconcile_NotFound(t *testing.T) {
	ctx := context.Background()
	r := newTestReconciler()

	// Reconcile non-existent config
	result, err := r.Reconcile(ctx, ctrl.Request{
		NamespacedName: types.NamespacedName{Name: "nonexistent"},
	})
	require.NoError(t, err)
	assert.False(t, result.Requeue)
}

func TestReconcileRBAC_CreatesRoles(t *testing.T) {
	ctx := context.Background()
	config := newTestConfig("cluster")
	r := newTestReconciler()

	err := r.reconcileRBAC(ctx, config)
	require.NoError(t, err)

	// Verify view role was created
	viewRole := &rbacv1.ClusterRole{}
	err = r.Get(ctx, types.NamespacedName{Name: "secrets-management-view"}, viewRole)
	require.NoError(t, err)
	assert.Equal(t, "secrets-management-view", viewRole.Name)
	assert.Len(t, viewRole.Rules, 3) // cert-manager, external-secrets, secrets-store-csi

	// Verify delete role was created
	deleteRole := &rbacv1.ClusterRole{}
	err = r.Get(ctx, types.NamespacedName{Name: "secrets-management-delete"}, deleteRole)
	require.NoError(t, err)
	assert.Equal(t, "secrets-management-delete", deleteRole.Name)

	// Verify admin role was created
	adminRole := &rbacv1.ClusterRole{}
	err = r.Get(ctx, types.NamespacedName{Name: "secrets-management-admin"}, adminRole)
	require.NoError(t, err)
	assert.Equal(t, "secrets-management-admin", adminRole.Name)

	// Verify status was updated
	assert.Len(t, config.Status.RBAC.ClusterRoles, 3)
}

func TestReconcileRBAC_CustomPrefix(t *testing.T) {
	ctx := context.Background()
	config := newTestConfig("cluster")
	config.Spec.RBAC.RolePrefix = "custom-prefix"
	r := newTestReconciler()

	err := r.reconcileRBAC(ctx, config)
	require.NoError(t, err)

	// Verify roles use custom prefix
	viewRole := &rbacv1.ClusterRole{}
	err = r.Get(ctx, types.NamespacedName{Name: "custom-prefix-view"}, viewRole)
	require.NoError(t, err)
	assert.Equal(t, "custom-prefix-view", viewRole.Name)
}

func TestReconcileRBAC_Disabled(t *testing.T) {
	ctx := context.Background()
	config := newTestConfig("cluster")
	config.Spec.RBAC.CreateDefaultRoles = false
	r := newTestReconciler()

	err := r.reconcileRBAC(ctx, config)
	require.NoError(t, err)

	// Verify no roles were created
	viewRole := &rbacv1.ClusterRole{}
	err = r.Get(ctx, types.NamespacedName{Name: "secrets-management-view"}, viewRole)
	assert.True(t, apierrors.IsNotFound(err))
}

func TestReconcileNamespace(t *testing.T) {
	ctx := context.Background()
	config := newTestConfig("cluster")
	r := newTestReconciler()

	err := r.reconcileNamespace(ctx, config)
	require.NoError(t, err)

	// Verify namespace was created
	ns := &corev1.Namespace{}
	err = r.Get(ctx, types.NamespacedName{Name: PluginNamespace}, ns)
	require.NoError(t, err)
	assert.Equal(t, PluginNamespace, ns.Name)
	assert.Equal(t, PluginName, ns.Labels["app.kubernetes.io/name"])
}

func TestReconcileServiceAccount(t *testing.T) {
	ctx := context.Background()
	config := newTestConfig("cluster")
	r := newTestReconciler()

	// Create namespace first
	ns := &corev1.Namespace{
		ObjectMeta: metav1.ObjectMeta{Name: PluginNamespace},
	}
	err := r.Create(ctx, ns)
	require.NoError(t, err)

	err = r.reconcileServiceAccount(ctx, config)
	require.NoError(t, err)

	// Verify SA was created
	sa := &corev1.ServiceAccount{}
	err = r.Get(ctx, types.NamespacedName{
		Name:      "ocp-secrets-management-plugin",
		Namespace: PluginNamespace,
	}, sa)
	require.NoError(t, err)
}

func TestReconcileService(t *testing.T) {
	ctx := context.Background()
	config := newTestConfig("cluster")
	r := newTestReconciler()

	// Create namespace first
	ns := &corev1.Namespace{
		ObjectMeta: metav1.ObjectMeta{Name: PluginNamespace},
	}
	err := r.Create(ctx, ns)
	require.NoError(t, err)

	err = r.reconcileService(ctx, config)
	require.NoError(t, err)

	// Verify service was created
	svc := &corev1.Service{}
	err = r.Get(ctx, types.NamespacedName{
		Name:      "ocp-secrets-management-plugin",
		Namespace: PluginNamespace,
	}, svc)
	require.NoError(t, err)
	assert.Equal(t, int32(PluginPort), svc.Spec.Ports[0].Port)
}

func TestReconcileNginxConfig(t *testing.T) {
	ctx := context.Background()
	config := newTestConfig("cluster")
	r := newTestReconciler()

	// Create namespace first
	ns := &corev1.Namespace{
		ObjectMeta: metav1.ObjectMeta{Name: PluginNamespace},
	}
	err := r.Create(ctx, ns)
	require.NoError(t, err)

	err = r.reconcileNginxConfig(ctx, config)
	require.NoError(t, err)

	// Verify configmap was created
	cm := &corev1.ConfigMap{}
	err = r.Get(ctx, types.NamespacedName{
		Name:      "ocp-secrets-management-nginx-conf",
		Namespace: PluginNamespace,
	}, cm)
	require.NoError(t, err)
	assert.Contains(t, cm.Data["nginx.conf"], "listen 9443 ssl")
}

func TestReconcileDeployment(t *testing.T) {
	ctx := context.Background()
	config := newTestConfig("cluster")
	r := newTestReconciler()

	// Create namespace first
	ns := &corev1.Namespace{
		ObjectMeta: metav1.ObjectMeta{Name: PluginNamespace},
	}
	err := r.Create(ctx, ns)
	require.NoError(t, err)

	err = r.reconcileDeployment(ctx, config)
	require.NoError(t, err)

	// Verify deployment was created
	deployment := &appsv1.Deployment{}
	err = r.Get(ctx, types.NamespacedName{
		Name:      "ocp-secrets-management-plugin",
		Namespace: PluginNamespace,
	}, deployment)
	require.NoError(t, err)
	assert.Equal(t, int32(1), *deployment.Spec.Replicas)
	assert.Equal(t, "openshift.io/ocp-secrets-management:test", deployment.Spec.Template.Spec.Containers[0].Image)
}

func TestDetectOperators_NoneInstalled(t *testing.T) {
	ctx := context.Background()
	config := newTestConfig("cluster")
	r := newTestReconciler()

	err := r.detectOperators(ctx, config)
	require.NoError(t, err)

	// Verify none are detected
	assert.False(t, config.Status.DetectedOperators.CertManager.Installed)
	assert.False(t, config.Status.DetectedOperators.ExternalSecrets.Installed)
	assert.False(t, config.Status.DetectedOperators.SecretsStoreCSI.Installed)
}

func TestDetectOperators_CertManagerInstalled(t *testing.T) {
	ctx := context.Background()
	config := newTestConfig("cluster")

	// Create cert-manager CRD
	certManagerCRD := &apiextensionsv1.CustomResourceDefinition{
		ObjectMeta: metav1.ObjectMeta{
			Name: "certificates.cert-manager.io",
		},
		Spec: apiextensionsv1.CustomResourceDefinitionSpec{
			Group: "cert-manager.io",
			Names: apiextensionsv1.CustomResourceDefinitionNames{
				Kind: "Certificate",
			},
			Versions: []apiextensionsv1.CustomResourceDefinitionVersion{
				{Name: "v1", Served: true, Storage: true},
			},
		},
	}

	r := newTestReconciler(certManagerCRD)

	err := r.detectOperators(ctx, config)
	require.NoError(t, err)

	// Verify cert-manager is detected
	assert.True(t, config.Status.DetectedOperators.CertManager.Installed)
	assert.Equal(t, "v1", config.Status.DetectedOperators.CertManager.Version)
	assert.False(t, config.Status.DetectedOperators.ExternalSecrets.Installed)
	assert.False(t, config.Status.DetectedOperators.SecretsStoreCSI.Installed)
}

func TestCleanupRBAC(t *testing.T) {
	ctx := context.Background()
	config := newTestConfig("cluster")
	r := newTestReconciler()

	// Create RBAC roles first
	err := r.reconcileRBAC(ctx, config)
	require.NoError(t, err)

	// Verify roles exist
	viewRole := &rbacv1.ClusterRole{}
	err = r.Get(ctx, types.NamespacedName{Name: "secrets-management-view"}, viewRole)
	require.NoError(t, err)

	// Cleanup
	err = r.cleanupRBAC(ctx, config)
	require.NoError(t, err)

	// Verify roles are deleted
	err = r.Get(ctx, types.NamespacedName{Name: "secrets-management-view"}, viewRole)
	assert.True(t, apierrors.IsNotFound(err))
}

func TestCleanupPluginDeployment(t *testing.T) {
	ctx := context.Background()
	config := newTestConfig("cluster")
	r := newTestReconciler()

	// Create namespace first
	ns := &corev1.Namespace{
		ObjectMeta: metav1.ObjectMeta{Name: PluginNamespace},
	}
	err := r.Create(ctx, ns)
	require.NoError(t, err)

	// Create deployment resources
	err = r.reconcileServiceAccount(ctx, config)
	require.NoError(t, err)
	err = r.reconcileService(ctx, config)
	require.NoError(t, err)
	err = r.reconcileNginxConfig(ctx, config)
	require.NoError(t, err)
	err = r.reconcileDeployment(ctx, config)
	require.NoError(t, err)

	// Verify resources exist
	deployment := &appsv1.Deployment{}
	err = r.Get(ctx, types.NamespacedName{
		Name:      "ocp-secrets-management-plugin",
		Namespace: PluginNamespace,
	}, deployment)
	require.NoError(t, err)

	// Cleanup
	err = r.cleanupPluginDeployment(ctx, config)
	require.NoError(t, err)

	// Verify deployment is deleted
	err = r.Get(ctx, types.NamespacedName{
		Name:      "ocp-secrets-management-plugin",
		Namespace: PluginNamespace,
	}, deployment)
	assert.True(t, apierrors.IsNotFound(err))
}

func TestBuildViewClusterRole(t *testing.T) {
	r := &SecretsManagementConfigReconciler{}
	role := r.buildViewClusterRole("test-prefix")

	assert.Equal(t, "test-prefix-view", role.Name)
	assert.Len(t, role.Rules, 3)

	// Check cert-manager rules
	assert.Equal(t, []string{"cert-manager.io"}, role.Rules[0].APIGroups)
	assert.Contains(t, role.Rules[0].Verbs, "get")
	assert.Contains(t, role.Rules[0].Verbs, "list")
	assert.Contains(t, role.Rules[0].Verbs, "watch")
	assert.NotContains(t, role.Rules[0].Verbs, "delete")

	// Check external-secrets rules
	assert.Equal(t, []string{"external-secrets.io"}, role.Rules[1].APIGroups)

	// Check secrets-store-csi rules
	assert.Equal(t, []string{"secrets-store.csi.x-k8s.io"}, role.Rules[2].APIGroups)
}

func TestBuildDeleteClusterRole(t *testing.T) {
	r := &SecretsManagementConfigReconciler{}
	role := r.buildDeleteClusterRole("test-prefix")

	assert.Equal(t, "test-prefix-delete", role.Name)

	// Check that delete verb is present
	for _, rule := range role.Rules {
		assert.Contains(t, rule.Verbs, "delete")
		assert.NotContains(t, rule.Verbs, "get")
	}
}

func TestBuildAdminClusterRole(t *testing.T) {
	r := &SecretsManagementConfigReconciler{}
	role := r.buildAdminClusterRole("test-prefix")

	assert.Equal(t, "test-prefix-admin", role.Name)

	// Check that wildcard verb is present
	for _, rule := range role.Rules {
		assert.Contains(t, rule.Verbs, "*")
	}
}

func TestSetCondition(t *testing.T) {
	config := newTestConfig("cluster")
	r := &SecretsManagementConfigReconciler{}

	// Set initial condition
	r.setCondition(config, smv1alpha1.ConditionRBACConfigured, "True", "RolesCreated", "Created roles")
	assert.Len(t, config.Status.Conditions, 1)
	assert.Equal(t, smv1alpha1.ConditionRBACConfigured, config.Status.Conditions[0].Type)
	assert.Equal(t, "True", config.Status.Conditions[0].Status)

	// Update same condition
	r.setCondition(config, smv1alpha1.ConditionRBACConfigured, "False", "Error", "Failed")
	assert.Len(t, config.Status.Conditions, 1)
	assert.Equal(t, "False", config.Status.Conditions[0].Status)

	// Add different condition
	r.setCondition(config, smv1alpha1.ConditionPluginDeployed, "True", "Ready", "Plugin ready")
	assert.Len(t, config.Status.Conditions, 2)
}

func TestReconcile_FullCycle(t *testing.T) {
	ctx := context.Background()
	config := newTestConfig("cluster")
	r := newTestReconciler(config)

	// First reconcile - adds finalizer
	_, err := r.Reconcile(ctx, ctrl.Request{
		NamespacedName: types.NamespacedName{Name: "cluster"},
	})
	require.NoError(t, err)

	// Verify finalizer was added and status is updated
	updatedConfig := &smv1alpha1.SecretsManagementConfig{}
	err = r.Get(ctx, types.NamespacedName{Name: "cluster"}, updatedConfig)
	require.NoError(t, err)
	assert.Contains(t, updatedConfig.Finalizers, FinalizerName)

	// Verify RBAC roles were created
	viewRole := &rbacv1.ClusterRole{}
	err = r.Get(ctx, types.NamespacedName{Name: "secrets-management-view"}, viewRole)
	require.NoError(t, err)

	// Verify namespace was created
	ns := &corev1.Namespace{}
	err = r.Get(ctx, types.NamespacedName{Name: PluginNamespace}, ns)
	require.NoError(t, err)

	// Verify deployment was created
	deployment := &appsv1.Deployment{}
	err = r.Get(ctx, types.NamespacedName{
		Name:      "ocp-secrets-management-plugin",
		Namespace: PluginNamespace,
	}, deployment)
	require.NoError(t, err)
}

func TestHelperFunctions(t *testing.T) {
	// Test boolPtr
	b := boolPtr(true)
	assert.NotNil(t, b)
	assert.True(t, *b)

	b = boolPtr(false)
	assert.NotNil(t, b)
	assert.False(t, *b)

	// Test int32Ptr
	i := int32Ptr(42)
	assert.NotNil(t, i)
	assert.Equal(t, int32(42), *i)
}
